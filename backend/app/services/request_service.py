from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
import uuid

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.errors import (
    AppError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationAppError,
)
from app.core.security import CurrentUser, check_permission
from app.models.assets import Asset
from app.models.auth import Role, User, UserStatus
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
from app.schemas.requests import (
    ApprovalAction,
    RejectAction,
    RequestApprovalResponse,
    RequestCreate,
    RequestDetailResponse,
    RequestListResponse,
    RequestResponse,
)


class RequestService:
    def __init__(self, db: Session, current_user: CurrentUser, ip_address: str = "127.0.0.1"):
        self.db = db
        self.current_user = current_user
        self.ip_address = ip_address

    def resolve_approval_chain(
        self, request_type: RequestType, estimated_cost: Optional[Decimal]
    ) -> ApprovalChainTemplate:
        """
        P0 Approval Chain Resolver (§5.18, §7 rule 10).
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
        POST /requests (PRD §5.11):
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

        # 4. Check manager step constraint upfront
        manager_role = self.db.query(Role).filter(Role.name == "manager").first()
        for step in ordered_steps:
            step_role = step.approver_role.name if step.approver_role else None
            if not step_role and manager_role and step.approver_role_id == manager_role.id:
                step_role = "manager"

            if step_role == "manager" and not requester.manager_id:
                raise ValidationAppError(
                    "Requester does not have an assigned manager for manager approval step",
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
            current_step=1,
        )
        self.db.add(new_request)

        # 6. Create RequestApproval rows
        created_approvals: list[RequestApproval] = []
        for step in ordered_steps:
            step_role = step.approver_role.name if step.approver_role else None
            if not step_role and manager_role and step.approver_role_id == manager_role.id:
                step_role = "manager"

            if step_role == "manager":
                approver_id = requester.manager_id
                approver_role_id = step.approver_role_id
            else:
                approver_id = None
                approver_role_id = step.approver_role_id

            approval_row = RequestApproval(
                id=uuid.uuid4(),
                request_id=new_request.id,
                approver_id=approver_id,
                approver_role_id=approver_role_id,
                step_order=step.step_order,
                status=ApprovalStatus.pending,
            )
            self.db.add(approval_row)
            created_approvals.append(approval_row)

        # 7. Notify step 1 approver(s)
        step1 = created_approvals[0] if created_approvals else None
        if step1:
            if step1.approver_id:
                # Direct approver (manager)
                if step1.approver_id != self.current_user.user_id:
                    self.db.add(
                        Notification(
                            id=uuid.uuid4(),
                            user_id=step1.approver_id,
                            type="approval_needed",
                            title="New Request Pending Approval",
                            message=f"Request '{data.title}' requires your approval.",
                            related_entity_type="request",
                            related_entity_id=new_request.id,
                            channel=NotificationChannel.in_app,
                            is_critical=False,
                        )
                    )
            elif step1.approver_role_id:
                # Role queue approvers (exclude requester per self-action rule)
                role_users = (
                    self.db.query(User)
                    .filter(
                        User.role_id == step1.approver_role_id,
                        User.status == UserStatus.active,
                        User.id != self.current_user.user_id,
                    )
                    .all()
                )
                for u in role_users:
                    self.db.add(
                        Notification(
                            id=uuid.uuid4(),
                            user_id=u.id,
                            type="approval_needed",
                            title="New Request Pending Approval",
                            message=f"Request '{data.title}' requires your role's approval.",
                            related_entity_type="request",
                            related_entity_id=new_request.id,
                            channel=NotificationChannel.in_app,
                            is_critical=False,
                        )
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
        GET /requests/mine (PRD §5.11):
        All authenticated users viewing their own submitted requests.
        """
        check_permission(self.current_user, "request", "read", self.db)

        query = (
            self.db.query(Request)
            .options(
                joinedload(Request.requester).joinedload(User.department),
                joinedload(Request.related_asset),
            )
            .filter(Request.requester_id == self.current_user.user_id)
        )
        if status:
            query = query.filter(Request.status == status)

        total = query.count()
        items = (
            query.order_by(Request.created_at.desc())
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
        GET /requests/{id} (PRD §5.11):
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
        role = (self.current_user.role or "").lower()
        if role not in ("super_admin", "auditor"):
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
                    if (
                        self.current_user.role_id
                        and step.approver_role_id == self.current_user.role_id
                    ):
                        is_assigned_approver = True
                        break

            if not (is_requester or is_assigned_approver):
                raise ForbiddenError("You do not have permission to view this request")

        return self._format_request_detail_from_model(req)

    def cancel_request(self, request_id: uuid.UUID) -> RequestDetailResponse:
        """
        POST /requests/{id}/cancel (PRD §5.11):
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

    def get_pending_approvals(
        self,
        request_type: Optional[RequestType] = None,
        priority: Optional[RequestPriority] = None,
        page: int = 1,
        page_size: int = 25,
    ) -> RequestListResponse:
        """
        GET /requests/pending-approval (PRD §5.12):
        RBAC: check_permission(request, approve) (manager, hr_admin, it_admin, super_admin).
        Filter: current-step pending rows where approver_id == caller OR
        (role-queue step AND caller holds that role). Excludes caller's own requests.
        """
        check_permission(self.current_user, "request", "approve", self.db)

        query = (
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
                        RequestApproval.approver_role_id == self.current_user.role_id,
                    ),
                ),
            )
        )

        if request_type:
            query = query.filter(Request.request_type == request_type)
        if priority:
            query = query.filter(Request.priority == priority)

        total = query.count()
        items = (
            query.order_by(Request.created_at.desc())
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

    def approve_request(self, request_id: uuid.UUID, data: ApprovalAction) -> RequestDetailResponse:
        """
        POST /requests/{id}/approve (PRD §5.12):
        Locks the request row with with_for_update.
        Re-checks step is still pending, caller is eligible AFTER locking, 409 if already acted.
        Prevents self-approval. Advances current_step or sets status=approved on final step.
        """
        check_permission(self.current_user, "request", "approve", self.db)

        req = (
            self.db.query(Request)
            .filter(Request.id == request_id)
            .with_for_update()
            .first()
        )
        if not req:
            raise NotFoundError(f"Request with ID {request_id} not found")

        # Self-approval guard
        if req.requester_id == self.current_user.user_id:
            raise ForbiddenError("Requesters cannot approve their own requests")

        # Confirm caller is a participant on some step of this request BEFORE revealing request status.
        # Otherwise return 403 (no 409 for non-participants).
        all_steps = (
            self.db.query(RequestApproval)
            .filter(RequestApproval.request_id == req.id)
            .all()
        )

        manager_role = self.db.query(Role).filter(Role.name == "manager").first()
        manager_role_id = manager_role.id if manager_role else None

        caller_user_id = self.current_user.user_id
        caller_role_id = self.current_user.role_id

        def _is_step_participant(step: RequestApproval) -> bool:
            # Direct assignment or past acting approver
            if step.approver_id is not None and step.approver_id == caller_user_id:
                return True
            # Manager steps require approver_id == caller; role-based participation
            # applies only to role-queue steps (steps with approver_id IS NULL or
            # acted steps whose approver_role_id is not the manager role)
            is_manager_step = (
                (manager_role_id is not None and step.approver_role_id == manager_role_id)
                or (getattr(step, "approver_role", None) and getattr(step.approver_role, "name", None) == "manager")
            )
            if is_manager_step:
                return False

            if (
                caller_role_id is not None
                and step.approver_role_id is not None
                and step.approver_role_id == caller_role_id
            ):
                return True
            return False

        is_participant = any(_is_step_participant(step) for step in all_steps)
        if not is_participant:
            raise ForbiddenError("You are not an authorized approver for this request")

        if req.status != RequestStatus.pending:
            raise ConflictError(
                message=f"Request is already in '{req.status.value}' state",
                code="already_acted",
            )

        # Current step row with lock
        current_step_row = (
            self.db.query(RequestApproval)
            .filter(
                RequestApproval.request_id == req.id,
                RequestApproval.step_order == req.current_step,
            )
            .with_for_update()
            .first()
        )
        if not current_step_row or current_step_row.status != ApprovalStatus.pending:
            raise ConflictError(
                message="Current approval step is not pending or has already been acted upon",
                code="already_acted",
            )

        # Check caller eligibility AFTER locking
        if current_step_row.approver_id is not None:
            if current_step_row.approver_id != caller_user_id:
                raise ForbiddenError("You are not the assigned approver for this step")
        else:
            if (
                caller_role_id is None
                or current_step_row.approver_role_id is None
                or current_step_row.approver_role_id != caller_role_id
            ):
                raise ForbiddenError("You do not hold the required role for this approval step")

        now = datetime.now(timezone.utc)
        current_step_row.approver_id = self.current_user.user_id
        current_step_row.status = ApprovalStatus.approved
        current_step_row.decision_at = now
        current_step_row.comments = data.comments

        # Check if final step
        total_steps = (
            self.db.query(func.count(RequestApproval.id))
            .filter(RequestApproval.request_id == req.id)
            .scalar()
            or 1
        )

        if req.current_step >= total_steps:
            req.status = RequestStatus.approved
            # Notify requester of full approval
            self.db.add(
                Notification(
                    id=uuid.uuid4(),
                    user_id=req.requester_id,
                    type="request_status_change",
                    title="Request Approved",
                    message=f"Your request '{req.title}' has been fully approved.",
                    related_entity_type="request",
                    related_entity_id=req.id,
                    channel=NotificationChannel.in_app,
                    is_critical=False,
                )
            )
        else:
            req.current_step += 1
            # Notify next step approver(s)
            next_step_row = (
                self.db.query(RequestApproval)
                .filter(
                    RequestApproval.request_id == req.id,
                    RequestApproval.step_order == req.current_step,
                )
                .first()
            )
            if next_step_row:
                if next_step_row.approver_id:
                    if next_step_row.approver_id != req.requester_id:
                        self.db.add(
                            Notification(
                                id=uuid.uuid4(),
                                user_id=next_step_row.approver_id,
                                type="approval_needed",
                                title="Request Pending Approval",
                                message=f"Request '{req.title}' is awaiting your approval (Step {req.current_step}).",
                                related_entity_type="request",
                                related_entity_id=req.id,
                                channel=NotificationChannel.in_app,
                                is_critical=False,
                            )
                        )
                elif next_step_row.approver_role_id:
                    role_users = (
                        self.db.query(User)
                        .filter(
                            User.role_id == next_step_row.approver_role_id,
                            User.status == UserStatus.active,
                            User.id != req.requester_id,
                        )
                        .all()
                    )
                    for u in role_users:
                        self.db.add(
                            Notification(
                                id=uuid.uuid4(),
                                user_id=u.id,
                                type="approval_needed",
                                title="Request Pending Approval",
                                message=f"Request '{req.title}' is awaiting your role's approval (Step {req.current_step}).",
                                related_entity_type="request",
                                related_entity_id=req.id,
                                channel=NotificationChannel.in_app,
                                is_critical=False,
                            )
                        )

        # Audit log entry
        self.db.add(
            AuditLog(
                id=uuid.uuid4(),
                actor_id=self.current_user.user_id,
                action="request.approved" if req.status == RequestStatus.approved else "request.step_approved",
                entity_type="request",
                entity_id=req.id,
                before_state={"current_step": req.current_step - (0 if req.status == RequestStatus.approved else 1), "status": RequestStatus.pending.value},
                after_state={"current_step": req.current_step, "status": req.status.value},
                ip_address=self.ip_address,
            )
        )

        self.db.commit()
        return self._format_request_detail(req.id)

    def reject_request(self, request_id: uuid.UUID, data: RejectAction) -> RequestDetailResponse:
        """
        POST /requests/{id}/reject (PRD §5.12):
        Locks the request row with with_for_update.
        Requires non-empty comments.
        Sets status=rejected, marks remaining steps as skipped, notifies requester.
        """
        check_permission(self.current_user, "request", "approve", self.db)

        if not data.comments or not data.comments.strip():
            raise ValidationAppError(
                "Comments are mandatory when rejecting a request",
                field_errors={"comments": "Rejection comments are required"},
            )

        req = (
            self.db.query(Request)
            .filter(Request.id == request_id)
            .with_for_update()
            .first()
        )
        if not req:
            raise NotFoundError(f"Request with ID {request_id} not found")

        # Self-rejection guard
        if req.requester_id == self.current_user.user_id:
            raise ForbiddenError("Requesters cannot reject their own requests")

        # Confirm caller is a participant on some step of this request BEFORE revealing request status.
        # Otherwise return 403 (no 409 for non-participants).
        all_steps = (
            self.db.query(RequestApproval)
            .filter(RequestApproval.request_id == req.id)
            .all()
        )

        manager_role = self.db.query(Role).filter(Role.name == "manager").first()
        manager_role_id = manager_role.id if manager_role else None

        caller_user_id = self.current_user.user_id
        caller_role_id = self.current_user.role_id

        def _is_step_participant(step: RequestApproval) -> bool:
            # Direct assignment or past acting approver
            if step.approver_id is not None and step.approver_id == caller_user_id:
                return True
            # Manager steps require approver_id == caller; role-based participation
            # applies only to role-queue steps (steps with approver_id IS NULL or
            # acted steps whose approver_role_id is not the manager role)
            is_manager_step = (
                (manager_role_id is not None and step.approver_role_id == manager_role_id)
                or (getattr(step, "approver_role", None) and getattr(step.approver_role, "name", None) == "manager")
            )
            if is_manager_step:
                return False

            if (
                caller_role_id is not None
                and step.approver_role_id is not None
                and step.approver_role_id == caller_role_id
            ):
                return True
            return False

        is_participant = any(_is_step_participant(step) for step in all_steps)
        if not is_participant:
            raise ForbiddenError("You are not an authorized approver for this request")

        if req.status != RequestStatus.pending:
            raise ConflictError(
                message=f"Request is already in '{req.status.value}' state",
                code="already_acted",
            )

        current_step_row = (
            self.db.query(RequestApproval)
            .filter(
                RequestApproval.request_id == req.id,
                RequestApproval.step_order == req.current_step,
            )
            .with_for_update()
            .first()
        )
        if not current_step_row or current_step_row.status != ApprovalStatus.pending:
            raise ConflictError(
                message="Current approval step is not pending or has already been acted upon",
                code="already_acted",
            )

        # Check caller eligibility AFTER locking
        if current_step_row.approver_id is not None:
            if current_step_row.approver_id != caller_user_id:
                raise ForbiddenError("You are not the assigned approver for this step")
        else:
            if (
                caller_role_id is None
                or current_step_row.approver_role_id is None
                or current_step_row.approver_role_id != caller_role_id
            ):
                raise ForbiddenError("You do not hold the required role for this approval step")

        now = datetime.now(timezone.utc)
        current_step_row.approver_id = self.current_user.user_id
        current_step_row.status = ApprovalStatus.rejected
        current_step_row.decision_at = now
        current_step_row.comments = data.comments.strip()

        # Mark all subsequent steps as skipped
        subsequent_steps = (
            self.db.query(RequestApproval)
            .filter(
                RequestApproval.request_id == req.id,
                RequestApproval.step_order > req.current_step,
            )
            .all()
        )
        for s in subsequent_steps:
            s.status = ApprovalStatus.skipped
            s.decision_at = now
            s.comments = "Skipped due to prior step rejection"

        req.status = RequestStatus.rejected

        # Notify requester
        self.db.add(
            Notification(
                id=uuid.uuid4(),
                user_id=req.requester_id,
                type="request_status_change",
                title="Request Rejected",
                message=f"Your request '{req.title}' was rejected: {data.comments.strip()}",
                related_entity_type="request",
                related_entity_id=req.id,
                channel=NotificationChannel.in_app,
                is_critical=False,
            )
        )

        # Audit log entry
        self.db.add(
            AuditLog(
                id=uuid.uuid4(),
                actor_id=self.current_user.user_id,
                action="request.rejected",
                entity_type="request",
                entity_id=req.id,
                before_state={"status": RequestStatus.pending.value},
                after_state={"status": RequestStatus.rejected.value, "reason": data.comments.strip()},
                ip_address=self.ip_address,
            )
        )

        self.db.commit()
        return self._format_request_detail(req.id)

    def _format_request_summary(self, req: Request) -> RequestResponse:
        requester_name = req.requester.full_name if req.requester else None
        requester_email = req.requester.email if req.requester else None
        requester_dept = (
            req.requester.department.name if req.requester and req.requester.department else None
        )
        related_asset_name = req.related_asset.name if req.related_asset else None

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
