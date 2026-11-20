"""
Approval chain configuration service (super_admin only).

Chains are copied into request_approvals when a request is created, so editing
or replacing a template never touches requests already in flight; it only
applies to new submissions. Every write logs to audit_logs in the same
transaction.
"""
from decimal import Decimal
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.core.security import CurrentUser, check_permission
from app.models.auth import Permission, Role, RolePermission
from app.models.requests import (
    ApprovalChainStep,
    ApprovalChainTemplate,
    Request,
    RequestStatus,
    RequestType,
)
from app.models.system import AuditLog
from app.modules.approval_chains.schemas import (
    ChainStepInput,
    ChainStepResponse,
    ChainTemplateCreate,
    ChainTemplateListResponse,
    ChainTemplateResponse,
    ChainTemplateUpdate,
)


class ApprovalChainService:
    def __init__(self, db: Session, current_user: CurrentUser, ip_address: Optional[str] = None):
        self.db = db
        self.current_user = current_user
        self.ip_address = ip_address or "127.0.0.1"

    # ------------------------------------------------------------ queries

    def _with_steps(self):
        return self.db.query(ApprovalChainTemplate).options(
            joinedload(ApprovalChainTemplate.steps).joinedload(ApprovalChainStep.approver_role)
        )

    def _pending_counts(self, template_ids: list[UUID]) -> dict[UUID, int]:
        """In-flight (pending) requests per template — one grouped query for all."""
        if not template_ids:
            return {}
        rows = (
            self.db.query(Request.approval_chain_template_id, func.count(Request.id))
            .filter(
                Request.approval_chain_template_id.in_(template_ids),
                Request.status == RequestStatus.pending,
            )
            .group_by(Request.approval_chain_template_id)
            .all()
        )
        return {tid: count for tid, count in rows}

    def _load(self, template_id: UUID) -> ApprovalChainTemplate:
        # Row lock (no-op on SQLite) so concurrent edits of one template serialise.
        template = (
            self.db.query(ApprovalChainTemplate)
            .filter(ApprovalChainTemplate.id == template_id)
            .with_for_update()
            .first()
        )
        if template is None:
            raise NotFoundError("Approval chain template not found")
        return template

    # ------------------------------------------------------------ shaping

    def _response(
        self, template: ApprovalChainTemplate, pending: int, warning: Optional[str] = None
    ) -> ChainTemplateResponse:
        steps = sorted(template.steps, key=lambda s: s.step_order)
        return ChainTemplateResponse(
            id=template.id,
            request_type=template.request_type,
            name=template.name,
            min_amount=template.min_amount,
            is_active=template.is_active,
            steps=[
                ChainStepResponse(
                    step_order=s.step_order,
                    approver_role_id=s.approver_role_id,
                    approver_role_name=s.approver_role.name,
                )
                for s in steps
            ],
            pending_request_count=pending,
            created_at=template.created_at,
            updated_at=template.updated_at,
            warning=warning,
        )

    @staticmethod
    def _snapshot(template: ApprovalChainTemplate) -> dict:
        return {
            "request_type": template.request_type.value,
            "name": template.name,
            "min_amount": str(template.min_amount) if template.min_amount is not None else None,
            "is_active": template.is_active,
            "steps": [
                {"step_order": s.step_order, "approver_role_id": str(s.approver_role_id)}
                for s in sorted(template.steps, key=lambda s: s.step_order)
            ],
        }

    def _audit(self, action: str, entity_id: UUID, before: Optional[dict], after: Optional[dict]) -> None:
        self.db.add(
            AuditLog(
                id=uuid4(),
                actor_id=self.current_user.user_id,
                action=action,
                entity_type="approval_chain",
                entity_id=entity_id,
                before_state=before,
                after_state=after,
                ip_address=self.ip_address,
            )
        )

    # ------------------------------------------------------------ validation

    def _validate(
        self,
        request_type: RequestType,
        name: str,
        min_amount: Optional[Decimal],
        steps: list[ChainStepInput],
    ) -> str:
        errors: dict[str, str] = {}
        clean_name = name.strip()
        if not clean_name:
            errors["name"] = "Name is required."
        if min_amount is not None:
            if min_amount < 0:
                errors["min_amount"] = "Must be zero or more."
            elif request_type != RequestType.asset_request:
                errors["min_amount"] = "A cost threshold is only allowed for asset_request."

        if not steps:
            errors["steps"] = "At least one step is required."
        else:
            orders = sorted(s.step_order for s in steps)
            if orders != list(range(1, len(steps) + 1)):
                errors["steps"] = (
                    f"step_order must be contiguous from 1 with no duplicates (expected 1..{len(steps)})."
                )
            role_ids = {s.approver_role_id for s in steps}
            roles = {r.id: r for r in self.db.query(Role).filter(Role.id.in_(role_ids)).all()}
            if role_ids - roles.keys():
                errors["steps.approver_role_id"] = "One or more approver roles do not exist."
            else:
                # A step must go to a role that can approve, or requests would wait forever.
                approvers = {
                    rid
                    for (rid,) in self.db.query(RolePermission.role_id)
                    .join(Permission, Permission.id == RolePermission.permission_id)
                    .filter(Permission.resource == "request", Permission.action == "approve", RolePermission.role_id.in_(role_ids))
                }
                cannot = sorted(roles[rid].name for rid in role_ids - approvers)
                if cannot:
                    errors["steps.approver_role_id"] = f"These roles can't approve requests: {', '.join(cannot)}."
                # One person decides at most one step, so two manager steps could never both be decided.
                manager_steps = sum(1 for st in steps if roles[st.approver_role_id].name == "manager")
                if manager_steps > 1:
                    errors["steps"] = "A chain can have only one manager step."
        if errors:
            raise ValidationAppError("Validation failed", field_errors=errors)
        return clean_name

    def _assert_unique_active(
        self, request_type: RequestType, min_amount: Optional[Decimal], exclude_id: Optional[UUID] = None
    ) -> None:
        threshold = (
            ApprovalChainTemplate.min_amount.is_(None)
            if min_amount is None
            else ApprovalChainTemplate.min_amount == min_amount
        )
        query = self.db.query(ApprovalChainTemplate).filter(
            ApprovalChainTemplate.request_type == request_type,
            ApprovalChainTemplate.is_active.is_(True),
            threshold,
        )
        if exclude_id:
            query = query.filter(ApprovalChainTemplate.id != exclude_id)
        clash = query.first()
        if clash:
            raise ConflictError(
                f"An active template ('{clash.name}') already exists for this request type and threshold.",
                code="conflict",
            )

    def _no_active_warning(self, request_type: RequestType) -> Optional[str]:
        active = (
            self.db.query(func.count(ApprovalChainTemplate.id))
            .filter(
                ApprovalChainTemplate.request_type == request_type,
                ApprovalChainTemplate.is_active.is_(True),
            )
            .scalar()
        )
        if active:
            return None
        return (
            f"No active approval chain remains for '{request_type.value}'. "
            "New requests of this type will be rejected with 409 no_approval_chain."
        )

    @staticmethod
    def _new_steps(template_id: UUID, steps: list[ChainStepInput]) -> list[ApprovalChainStep]:
        return [
            ApprovalChainStep(
                id=uuid4(), template_id=template_id, step_order=s.step_order, approver_role_id=s.approver_role_id
            )
            for s in sorted(steps, key=lambda s: s.step_order)
        ]

    # ------------------------------------------------------------ endpoints

    def list_templates(self, request_type: Optional[RequestType]) -> ChainTemplateListResponse:
        check_permission(self.current_user, "approval_chain", "read", self.db)
        query = self._with_steps()
        if request_type:
            query = query.filter(ApprovalChainTemplate.request_type == request_type)
        templates = query.order_by(
            ApprovalChainTemplate.request_type,
            ApprovalChainTemplate.min_amount.asc().nulls_first(),
            ApprovalChainTemplate.created_at,
        ).all()
        counts = self._pending_counts([t.id for t in templates])
        return ChainTemplateListResponse(templates=[self._response(t, counts.get(t.id, 0)) for t in templates])

    def create_template(self, data: ChainTemplateCreate) -> ChainTemplateResponse:
        check_permission(self.current_user, "approval_chain", "create", self.db)
        name = self._validate(data.request_type, data.name, data.min_amount, data.steps)
        self._assert_unique_active(data.request_type, data.min_amount)

        template = ApprovalChainTemplate(
            id=uuid4(), request_type=data.request_type, name=name, min_amount=data.min_amount, is_active=True
        )
        self.db.add(template)
        self.db.flush()
        self.db.add_all(self._new_steps(template.id, data.steps))
        self.db.flush()
        self.db.refresh(template)
        self._audit("approval_chain.created", template.id, None, self._snapshot(template))
        self.db.commit()
        template = self._with_steps().filter(ApprovalChainTemplate.id == template.id).one()
        return self._response(template, 0)

    def update_template(self, template_id: UUID, data: ChainTemplateUpdate) -> ChainTemplateResponse:
        check_permission(self.current_user, "approval_chain", "update", self.db)
        template = self._load(template_id)
        name = self._validate(template.request_type, data.name, data.min_amount, data.steps)
        if data.is_active:
            self._assert_unique_active(template.request_type, data.min_amount, exclude_id=template.id)

        before = self._snapshot(template)
        template.name = name
        template.min_amount = data.min_amount
        template.is_active = data.is_active
        # Full replace of the step list in this one transaction.
        for step in list(template.steps):
            self.db.delete(step)
        self.db.flush()
        self.db.add_all(self._new_steps(template.id, data.steps))
        self.db.flush()
        self.db.refresh(template)
        self._audit("approval_chain.updated", template.id, before, self._snapshot(template))
        warning = None if data.is_active else self._no_active_warning(template.request_type)
        self.db.commit()

        template = self._with_steps().filter(ApprovalChainTemplate.id == template_id).one()
        pending = self._pending_counts([template_id]).get(template_id, 0)
        return self._response(template, pending, warning)

    def delete_template(self, template_id: UUID) -> None:
        check_permission(self.current_user, "approval_chain", "delete", self.db)
        template = self._load(template_id)
        pending = self._pending_counts([template_id]).get(template_id, 0)
        if pending:
            raise ConflictError(
                f"{pending} pending request(s) are routed through this template. "
                "Deactivate it instead, or delete it once they are resolved.",
                code="conflict",
            )
        self._audit("approval_chain.deleted", template.id, self._snapshot(template), None)
        self.db.delete(template)  # steps cascade; resolved requests keep a null reference (SET NULL)
        self.db.commit()
