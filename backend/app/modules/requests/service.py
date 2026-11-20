from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
import uuid

from sqlalchemy import and_, exists, or_
from sqlalchemy.orm import aliased, selectinload, Session, joinedload

from app.core.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationAppError,
)
from app.core.approver_resolution import step_recipient_ids
from app.core.security import CurrentUser, check_permission
from app.models.assets import Asset
from app.core.role_policy import user_holds_role_names
from app.models.auth import SIGN_IN_STATUSES, Role, User, UserStatus
from app.models.requests import (
    ApprovalChainStep,
    ApprovalChainTemplate,
    ApprovalStatus,
    Request,
    RequestApproval,
    RequestPriority,
    RequestStatus,
    RequestType,
)
from app.models.system import AuditLog, Notification, NotificationChannel
from app.modules.requests.schemas import (
    ApprovalAction,
    FulfilmentAction,
    RejectAction,
    RequestApprovalResponse,
    RequestCreate,
    RequestDetailResponse,
    RequestListResponse,
    RequestResponse,
)


# Who fulfils each kind of approved request (super admins can fulfil any).
FULFILLERS: dict[RequestType, tuple[str, ...]] = {
    RequestType.asset_request: ("it_admin",),
    RequestType.access_request: ("it_admin",),
    RequestType.it_ticket: ("it_admin",),
    RequestType.other: ("hr_admin",),
}
FULFILMENT_STATUSES = (RequestStatus.approved, RequestStatus.in_progress, RequestStatus.completed)


class RequestService:
    def __init__(self, db: Session, current_user: CurrentUser, ip_address: str = "127.0.0.1"):
        self.db = db
        self.current_user = current_user
        self.ip_address = ip_address

    def resolve_approval_chain(
        self, request_type: RequestType, estimated_cost: Optional[Decimal]
    ) -> ApprovalChainTemplate:
        """
        Approval chain resolver.
        Selection rule: among active templates for the request_type whose
        min_amount is null or <= estimated_cost, pick the highest min_amount.
        If none found, raises 409 with code no_approval_chain.
        """
        cost = estimated_cost if estimated_cost is not None else Decimal("0.00")

        template = (
            self.db.query(ApprovalChainTemplate)
            .options(
                joinedload(ApprovalChainTemplate.steps).joinedload(ApprovalChainStep.approver_role)
            )
            .filter(
                ApprovalChainTemplate.request_type == request_type,
                ApprovalChainTemplate.is_active == True,  # noqa: E712
                or_(
                    ApprovalChainTemplate.min_amount.is_(None),
                    ApprovalChainTemplate.min_amount <= cost,
                ),
            )
            .order_by(ApprovalChainTemplate.min_amount.desc().nulls_last())
            .first()
        )

        if not template or not template.steps:
            raise ConflictError(
                message=f"No active approval chain template found for request type '{request_type.value}'",
                code="no_approval_chain",
            )

        return template

    def create_request(self, data: RequestCreate) -> RequestDetailResponse:
        """
        POST /requests:
        Resolves approval chain, populates request_approvals rows with role-queue
        or manager resolution, dispatches in-app notifications to step 1 approver(s),
        and records an audit log entry in the same transaction.
        """
        check_permission(self.current_user, "request", "create", self.db)

        # 1. Validation
        if data.related_asset_id:
            if data.request_type != RequestType.asset_request:
                raise ValidationAppError(
                    "related_asset_id is only permitted for asset_request",
                    field_errors={"related_asset_id": "Not allowed for this request type"},
                )
            asset = self.db.query(Asset).filter(Asset.id == data.related_asset_id).first()
            if not asset:
                raise NotFoundError(f"Related asset {data.related_asset_id} not found")

        # 2. Resolve template
        template = self.resolve_approval_chain(data.request_type, data.estimated_cost)

        # 3. Requester details
        requester = self.db.query(User).filter(User.id == self.current_user.user_id).first()
        if not requester:
            raise NotFoundError("Requester user record not found")

        # Sort steps by step_order
        ordered_steps = sorted(template.steps, key=lambda s: s.step_order)

        # 4. Manager steps for a requester with no reporting manager are skipped
        # (status `skipped`) rather than blocking the request. If that
        # would leave no step anyone can act on, the request can't be routed.
        manager_role = self.db.query(Role).filter(Role.name == "manager").first()

        def _is_manager_step(step) -> bool:
            if step.approver_role and step.approver_role.name == "manager":
                return True
            return bool(manager_role and step.approver_role_id == manager_role.id)

        # A manager who can no longer act (inactive, leaving, left) counts as none.
        manager_id = requester.manager_id
        if manager_id is not None:
            manager = self.db.query(User).filter(User.id == manager_id).first()
            if manager is None or manager.status not in SIGN_IN_STATUSES:
                manager_id = None
        skip_step_ids = {step.id for step in ordered_steps if _is_manager_step(step) and not manager_id}
        if len(skip_step_ids) == len(ordered_steps):
            raise ValidationAppError(
                "This request needs your manager's approval, but you have no reporting manager assigned",
                field_errors={"requester_id": "Requester has no reporting manager assigned"},
            )

        # 5. Create Request row
        new_request = Request(
            id=uuid.uuid4(),
            requester_id=self.current_user.user_id,
            request_type=data.request_type,
            title=data.title,
            description=data.description,
            related_asset_id=data.related_asset_id,
            estimated_cost=data.estimated_cost,
            priority=data.priority,
            status=RequestStatus.pending,
            current_step=next(st.step_order for st in ordered_steps if st.id not in skip_step_ids),
            approval_chain_template_id=template.id,
        )
        self.db.add(new_request)

        # 6. Create RequestApproval rows
        created_approvals: list[RequestApproval] = []
        now = datetime.now(timezone.utc)
        for step in ordered_steps:
            skipped = step.id in skip_step_ids
            approval_row = RequestApproval(
                id=uuid.uuid4(),
                request_id=new_request.id,
                approver_id=manager_id if _is_manager_step(step) and not skipped else None,
                approver_role_id=step.approver_role_id,
                step_order=step.step_order,
                status=ApprovalStatus.skipped if skipped else ApprovalStatus.pending,
                decision_at=now if skipped else None,
                comments="Skipped automatically: no reporting manager who can approve" if skipped else None,
            )
            self.db.add(approval_row)
            created_approvals.append(approval_row)

        # 7. Notify the first actionable step's approver(s)
        first_pending = next(a for a in created_approvals if a.status == ApprovalStatus.pending)
        self._notify_step_approvers(
            first_pending,
            request_id=new_request.id,
            exclude_user_id=self.current_user.user_id,
            title="New Request Pending Approval",
            message=f"Request '{data.title}' requires your approval.",
        )

        # 8. Audit log entry
        self.db.add(
            AuditLog(
                id=uuid.uuid4(),
                actor_id=self.current_user.user_id,
                action="request.created",
                entity_type="request",
                entity_id=new_request.id,
                before_state=None,
                after_state={
                    "request_type": data.request_type.value,
                    "title": data.title,
                    "priority": data.priority.value,
                    "estimated_cost": str(data.estimated_cost) if data.estimated_cost else None,
                    "total_steps": len(created_approvals),
                },
                ip_address=self.ip_address,
            )
        )

        self.db.commit()
        return self._format_request_detail(new_request.id)

    def get_my_requests(
        self, status: Optional[RequestStatus] = None, page: int = 1, page_size: int = 25
    ) -> RequestListResponse:
        """
        GET /requests/mine:
        All authenticated users viewing their own submitted requests.
        """
        check_permission(self.current_user, "request", "read", self.db)

        query = (
            self.db.query(Request)
            .options(
                joinedload(Request.requester).joinedload(User.department),
                joinedload(Request.related_asset),
                selectinload(Request.approvals).joinedload(RequestApproval.approver_role),
            )
            .filter(Request.requester_id == self.current_user.user_id)
        )
        if status:
            query = query.filter(Request.status == status)

        total = query.count()
        items = (
            query.order_by(Request.created_at.desc(), Request.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        return RequestListResponse(
            items=[self._format_request_summary(r) for r in items],
            total=total,
            page=page,
            page_size=page_size,
        )

    def get_request_detail(self, request_id: uuid.UUID) -> RequestDetailResponse:
        """
        GET /requests/{id}:
        Coarse RBAC (request, read) + ABAC row-level check:
        requester, assigned approvers, super_admin, auditor.
        Role-based eligibility applies strictly to role-queue steps with approver_id IS NULL.
        For manager steps and acted steps, only approver_id == caller grants access.
        """
        check_permission(self.current_user, "request", "read", self.db)

        req = (
            self.db.query(Request)
            .options(
                joinedload(Request.requester).joinedload(User.department),
                joinedload(Request.related_asset),
                joinedload(Request.approvals).joinedload(RequestApproval.approver),
                joinedload(Request.approvals).joinedload(RequestApproval.approver_role),
            )
            .filter(Request.id == request_id)
            .first()
        )
        if not req:
            raise NotFoundError(f"Request with ID {request_id} not found")

        # Row-level ABAC
        if not self.current_user.has_role("super_admin", "auditor"):
            is_requester = req.requester_id == self.current_user.user_id
            is_assigned_approver = False

            for step in req.approvals:
                if step.approver_id is not None:
                    # Specific/acted step
                    if step.approver_id == self.current_user.user_id:
                        is_assigned_approver = True
                        break
                else:
                    # Role-queue step with approver_id IS NULL
                    if self.current_user.holds_role_id(step.approver_role_id):
                        is_assigned_approver = True
                        break

            is_fulfiller = req.status in FULFILMENT_STATUSES and self._is_fulfiller(req.request_type)
            if not (is_requester or is_assigned_approver or is_fulfiller):
                raise ForbiddenError("You do not have permission to view this request")

        return self._format_request_detail_from_model(req)

    def cancel_request(self, request_id: uuid.UUID) -> RequestDetailResponse:
        """
        POST /requests/{id}/cancel:
        Requester only, only while status is pending (including mid-chain).
        Locks row with with_for_update, re-checks pending status, closes open
        pending approval rows with status 'skipped', and logs audit entry.
        """
        check_permission(self.current_user, "request", "update", self.db)

        req = (
            self.db.query(Request)
            .filter(Request.id == request_id)
            .with_for_update()
            .first()
        )
        if not req:
            raise NotFoundError(f"Request with ID {request_id} not found")

        if req.requester_id != self.current_user.user_id:
            raise ForbiddenError("Only the requester can cancel this request")

        if req.status != RequestStatus.pending:
            raise ConflictError(
                message=f"Cannot cancel request in '{req.status.value}' state. Only pending requests can be cancelled.",
                code="invalid_state",
            )

        # Close open approval rows
        pending_approvals = (
            self.db.query(RequestApproval)
            .filter(
                RequestApproval.request_id == req.id,
                RequestApproval.status == ApprovalStatus.pending,
            )
            .all()
        )
        now = datetime.now(timezone.utc)
        for pa in pending_approvals:
            pa.status = ApprovalStatus.skipped
            pa.decision_at = now
            pa.comments = "Cancelled by requester"

        req.status = RequestStatus.cancelled

        # Audit log entry
        self.db.add(
            AuditLog(
                id=uuid.uuid4(),
                actor_id=self.current_user.user_id,
                action="request.cancelled",
                entity_type="request",
                entity_id=req.id,
                before_state={"status": RequestStatus.pending.value},
                after_state={"status": RequestStatus.cancelled.value},
                ip_address=self.ip_address,
            )
        )

        self.db.commit()
        return self._format_request_detail(req.id)

    def pending_approval_query(self):
        """
        Requests whose CURRENT step is waiting on the caller: assigned to them
        directly (a manager step), or a role-queue step for the caller's role.
        Never the caller's own requests. Shared by GET /requests/pending-approval
        and the Inbox so both apply the same eligibility rule.
        Callers check `request:approve` themselves.
        """
        DecidedStep = aliased(RequestApproval)
        return (
            self.db.query(Request)
            .join(
                RequestApproval,
                and_(
                    RequestApproval.request_id == Request.id,
                    RequestApproval.step_order == Request.current_step,
                    RequestApproval.status == ApprovalStatus.pending,
                ),
            )
            .options(
                joinedload(Request.requester).joinedload(User.department),
                joinedload(Request.related_asset),
            )
            .filter(
                Request.status == RequestStatus.pending,
                Request.requester_id != self.current_user.user_id,
                or_(
                    RequestApproval.approver_id == self.current_user.user_id,
                    and_(
                        RequestApproval.approver_id.is_(None),
                        RequestApproval.approver_role_id.in_(self.current_user.role_ids),
                    ),
                ),
                # One step per person: hide requests where the caller
                # already decided an earlier step.
                ~exists().where(
                    DecidedStep.request_id == Request.id,
                    DecidedStep.approver_id == self.current_user.user_id,
                    DecidedStep.status.in_([ApprovalStatus.approved, ApprovalStatus.rejected]),
                ),
            )
        )

    def get_pending_approvals(
        self,
        request_type: Optional[RequestType] = None,
        priority: Optional[RequestPriority] = None,
        page: int = 1,
        page_size: int = 25,
    ) -> RequestListResponse:
        """
        GET /requests/pending-approval:
        RBAC: check_permission(request, approve) (manager, hr_admin, it_admin, super_admin).
        Filter: current-step pending rows where approver_id == caller OR
        (role-queue step AND caller holds that role). Excludes caller's own requests.
        """
        check_permission(self.current_user, "request", "approve", self.db)
        query = self.pending_approval_query()

        if request_type:
            query = query.filter(Request.request_type == request_type)
        if priority:
            query = query.filter(Request.priority == priority)

        total = query.count()
        items = (
            query.order_by(Request.created_at.desc(), Request.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        return RequestListResponse(
            items=[self._format_request_summary(r) for r in items],
            total=total,
            page=page,
            page_size=page_size,
        )

    def _lock_for_decision(self, request_id: uuid.UUID) -> tuple[Request, RequestApproval]:
        """Shared by approve and reject: permission, row lock, then
        in this order, so non-participants learn nothing about the request —
        participation, pending state, current-step eligibility and the
        one-step-per-person rule."""
        check_permission(self.current_user, "request", "approve", self.db)
        req = self.db.query(Request).filter(Request.id == request_id).with_for_update().first()
        if not req:
            raise NotFoundError(f"Request with ID {request_id} not found")
        if req.requester_id == self.current_user.user_id:
            raise ForbiddenError("Requesters cannot approve or reject their own requests")

        all_steps = self.db.query(RequestApproval).filter(RequestApproval.request_id == req.id).all()
        manager_role = self.db.query(Role).filter(Role.name == "manager").first()
        manager_role_id = manager_role.id if manager_role else None
        caller = self.current_user.user_id

        def participant(step: RequestApproval) -> bool:
            if step.approver_id is not None and step.approver_id == caller:
                return True
            if manager_role_id is not None and step.approver_role_id == manager_role_id:
                return False  # manager steps belong to one named person
            return self.current_user.holds_role_id(step.approver_role_id)

        if not any(participant(step) for step in all_steps):
            raise ForbiddenError("You are not an authorized approver for this request")
        if req.status != RequestStatus.pending:
            raise ConflictError(message=f"Request is already in '{req.status.value}' state", code="already_acted")

        current = (
            self.db.query(RequestApproval)
            .filter(RequestApproval.request_id == req.id, RequestApproval.step_order == req.current_step)
            .with_for_update()
            .first()
        )
        if not current or current.status != ApprovalStatus.pending:
            raise ConflictError(
                message="Current approval step is not pending or has already been acted upon", code="already_acted"
            )
        if current.approver_id is not None:
            if current.approver_id != caller:
                raise ForbiddenError("You are not the assigned approver for this step")
        elif not self.current_user.holds_role_id(current.approver_role_id):
            raise ForbiddenError("You do not hold the required role for this approval step")
        if any(
            step.id != current.id and step.approver_id == caller and step.status in (ApprovalStatus.approved, ApprovalStatus.rejected)
            for step in all_steps
        ):
            raise ForbiddenError("You already decided an earlier step of this request; someone else must decide this one")
        return req, current

    def approve_request(self, request_id: uuid.UUID, data: ApprovalAction) -> RequestDetailResponse:
        """POST /requests/{id}/approve: advances to the next waiting step,
        or marks the request approved after the last one and tells the requester."""
        req, current_step_row = self._lock_for_decision(request_id)
        now = datetime.now(timezone.utc)
        current_step_row.approver_id = self.current_user.user_id
        current_step_row.status = ApprovalStatus.approved
        current_step_row.decision_at = now
        current_step_row.comments = data.comments

        previous_step = req.current_step
        next_pending = (
            self.db.query(RequestApproval)
            .filter(
                RequestApproval.request_id == req.id,
                RequestApproval.step_order > req.current_step,
                RequestApproval.status == ApprovalStatus.pending,
            )
            .order_by(RequestApproval.step_order.asc())
            .first()
        )
        if next_pending is None:
            req.status = RequestStatus.approved
            self._notify_requester(req, "Request approved", f"Your request '{req.title}' was approved. You'll hear when work starts.")
            for user_id in self._fulfiller_ids(req):
                self._add_notification(user_id, "approval_needed", "Approved request to fulfil", f"'{req.title}' was approved and is ready for you.", req.id)
        else:
            req.current_step = next_pending.step_order
            self._notify_step_approvers(
                next_pending,
                request_id=req.id,
                exclude_user_id=req.requester_id,
                title="Request Pending Approval",
                message=f"Request '{req.title}' is awaiting your approval (Step {req.current_step}).",
            )

        self._audit(
            "request.approved" if req.status == RequestStatus.approved else "request.step_approved",
            req,
            {"current_step": previous_step, "status": RequestStatus.pending.value},
            {"current_step": req.current_step, "status": req.status.value},
        )
        self.db.commit()
        return self._format_request_detail(req.id)

    def reject_request(self, request_id: uuid.UUID, data: RejectAction) -> RequestDetailResponse:
        """POST /requests/{id}/reject: a reason is required; later steps are skipped."""
        if not data.comments or not data.comments.strip():
            raise ValidationAppError(
                "Comments are mandatory when rejecting a request",
                field_errors={"comments": "Rejection comments are required"},
            )
        req, current_step_row = self._lock_for_decision(request_id)
        reason = data.comments.strip()
        now = datetime.now(timezone.utc)
        current_step_row.approver_id = self.current_user.user_id
        current_step_row.status = ApprovalStatus.rejected
        current_step_row.decision_at = now
        current_step_row.comments = reason
        for later in (
            self.db.query(RequestApproval)
            .filter(RequestApproval.request_id == req.id, RequestApproval.step_order > req.current_step)
            .all()
        ):
            later.status = ApprovalStatus.skipped
            later.decision_at = now
            later.comments = "Skipped due to prior step rejection"
        req.status = RequestStatus.rejected
        self._notify_requester(req, "Request rejected", f"Your request '{req.title}' was rejected: {reason}")
        self._audit("request.rejected", req, {"status": RequestStatus.pending.value}, {"status": RequestStatus.rejected.value, "reason": reason})
        self.db.commit()
        return self._format_request_detail(req.id)

    # ----------------------------------------------------------- fulfilment

    def _is_fulfiller(self, request_type: RequestType) -> bool:
        return self.current_user.has_role("super_admin", *FULFILLERS[request_type])

    def _fulfiller_ids(self, req: Request) -> list[uuid.UUID]:
        names = list(FULFILLERS[req.request_type])
        return [
            u.id
            for u in self.db.query(User).filter(
                user_holds_role_names(names), User.status == UserStatus.active, User.id != req.requester_id
            )
        ]

    def to_fulfil(self, status: Optional[RequestStatus], page: int, page_size: int) -> RequestListResponse:
        """GET /requests/to-fulfil — approved and in-progress requests the caller
        can fulfil: asset, access and IT requests for IT admins, other requests
        for HR admins, everything for super admins."""
        check_permission(self.current_user, "request", "fulfil", self.db)
        types = [t for t in RequestType if self._is_fulfiller(t)]
        statuses = [status] if status else [RequestStatus.approved, RequestStatus.in_progress]
        if any(s not in (RequestStatus.approved, RequestStatus.in_progress, RequestStatus.completed) for s in statuses):
            raise ValidationAppError("Validation failed", field_errors={"status": "Use approved, in_progress or completed."})
        query = (
            self.db.query(Request)
            .options(
                joinedload(Request.requester).joinedload(User.department),
                joinedload(Request.related_asset),
                selectinload(Request.approvals).joinedload(RequestApproval.approver_role),
                joinedload(Request.fulfiller),
            )
            .filter(Request.request_type.in_(types), Request.status.in_(statuses))
        )
        total = query.count()
        items = query.order_by(Request.updated_at.asc(), Request.id.asc()).offset((page - 1) * page_size).limit(page_size).all()
        return RequestListResponse(items=[self._format_request_summary(r) for r in items], total=total, page=page, page_size=page_size)

    def fulfil(self, request_id: uuid.UUID, data: FulfilmentAction) -> RequestDetailResponse:
        """POST /requests/{id}/fulfilment — approved → in_progress → completed
        (approved → completed directly is fine too). The requester is told at
        each change. Audited."""
        check_permission(self.current_user, "request", "fulfil", self.db)
        req = self.db.query(Request).filter(Request.id == request_id).with_for_update().first()
        if not req:
            raise NotFoundError(f"Request with ID {request_id} not found")
        if not self._is_fulfiller(req.request_type):
            raise ForbiddenError("This kind of request is fulfilled by another team.")
        target = RequestStatus(data.status)
        allowed = {
            RequestStatus.approved: {RequestStatus.in_progress, RequestStatus.completed},
            RequestStatus.in_progress: {RequestStatus.completed},
        }
        if target not in allowed.get(req.status, set()):
            raise ConflictError(f"A {req.status.value} request can't move to {target.value}.", code="invalid_state")
        before = {"status": req.status.value}
        req.status = target
        note = (data.note or "").strip() or None
        if note:
            req.fulfilment_note = note
        req.fulfilled_by = self.current_user.user_id
        req.fulfilled_at = datetime.now(timezone.utc)
        if target == RequestStatus.in_progress:
            self._notify_requester(req, "Your request is being worked on", f"'{req.title}' is in progress." + (f" {note}" if note else ""))
        else:
            self._notify_requester(req, "Your request is done", f"'{req.title}' is done." + (f" {note}" if note else ""))
        self._audit("request.fulfilment_updated", req, before, {"status": target.value, "note": note})
        self.db.commit()
        return self._format_request_detail(req.id)

    # ------------------------------------------------------------ shared helpers

    def _add_notification(self, user_id: uuid.UUID, type_: str, title: str, message: str, request_id: uuid.UUID) -> None:
        self.db.add(
            Notification(
                id=uuid.uuid4(),
                user_id=user_id,
                type=type_,
                title=title,
                message=message,
                related_entity_type="request",
                related_entity_id=request_id,
                channel=NotificationChannel.in_app,
                is_critical=False,
            )
        )

    def _notify_requester(self, req: Request, title: str, message: str) -> None:
        self._add_notification(req.requester_id, "request_status_change", title, message, req.id)

    def _audit(self, action: str, req: Request, before: Optional[dict], after: Optional[dict]) -> None:
        self.db.add(
            AuditLog(
                id=uuid.uuid4(),
                actor_id=self.current_user.user_id,
                action=action,
                entity_type="request",
                entity_id=req.id,
                before_state=before,
                after_state=after,
                ip_address=self.ip_address,
            )
        )

    def _notify_step_approvers(
        self,
        step: RequestApproval,
        request_id: uuid.UUID,
        exclude_user_id: uuid.UUID,
        title: str,
        message: str,
    ) -> None:
        """In-app approval_needed notification for one step: its assigned
        manager, or every active member of its role queue. The requester is
        never notified about their own request (self-action rule)."""
        recipient_ids = step_recipient_ids(self.db, step.approver_id, step.approver_role_id, exclude_user_id)

        for user_id in recipient_ids:
            self.db.add(
                Notification(
                    id=uuid.uuid4(),
                    user_id=user_id,
                    type="approval_needed",
                    title=title,
                    message=message,
                    related_entity_type="request",
                    related_entity_id=request_id,
                    channel=NotificationChannel.in_app,
                    is_critical=False,
                )
            )

    def _format_request_summary(self, req: Request) -> RequestResponse:
        requester_name = req.requester.full_name if req.requester else None
        requester_email = req.requester.email if req.requester else None
        requester_dept = (
            req.requester.department.name if req.requester and req.requester.department else None
        )
        related_asset_name = req.related_asset.name if req.related_asset else None
        # Plain-language position for lists ("Waiting on IT admin"): the role of the step now pending
        current = next(
            (a for a in req.approvals if a.step_order == req.current_step and a.status == ApprovalStatus.pending),
            None,
        )

        return RequestResponse(
            id=req.id,
            requester_id=req.requester_id,
            requester_name=requester_name,
            requester_email=requester_email,
            requester_department=requester_dept,
            request_type=req.request_type,
            title=req.title,
            description=req.description,
            related_asset_id=req.related_asset_id,
            related_asset_name=related_asset_name,
            estimated_cost=req.estimated_cost,
            priority=req.priority,
            status=req.status,
            current_step=req.current_step,
            total_steps=len(req.approvals),
            waiting_on_role=current.approver_role.name if current and current.approver_role else None,
            fulfilment_note=req.fulfilment_note,
            fulfilled_by_name=req.fulfiller.full_name if req.fulfiller else None,
            fulfilled_at=req.fulfilled_at,
            created_at=req.created_at,
            updated_at=req.updated_at,
        )

    def _format_request_detail(self, request_id: uuid.UUID) -> RequestDetailResponse:
        req = (
            self.db.query(Request)
            .options(
                joinedload(Request.requester).joinedload(User.department),
                joinedload(Request.related_asset),
                joinedload(Request.approvals).joinedload(RequestApproval.approver),
                joinedload(Request.approvals).joinedload(RequestApproval.approver_role),
            )
            .filter(Request.id == request_id)
            .first()
        )
        if not req:
            raise NotFoundError(f"Request with ID {request_id} not found")
        return self._format_request_detail_from_model(req)

    def _format_request_detail_from_model(self, req: Request) -> RequestDetailResponse:
        summary = self._format_request_summary(req)
        approvals_list = []
        for a in sorted(req.approvals, key=lambda x: x.step_order):
            approvals_list.append(
                RequestApprovalResponse(
                    id=a.id,
                    request_id=a.request_id,
                    step_order=a.step_order,
                    approver_id=a.approver_id,
                    approver_name=a.approver.full_name if a.approver else None,
                    approver_role_id=a.approver_role_id,
                    approver_role_name=a.approver_role.name if a.approver_role else None,
                    status=a.status,
                    decision_at=a.decision_at,
                    comments=a.comments,
                    created_at=a.created_at,
                )
            )

        return RequestDetailResponse(
            **summary.model_dump(),
            approvals=approvals_list,
        )
