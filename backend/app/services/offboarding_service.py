"""
Offboarding Workflow Service — handles creation, retrieval, item status updating with asset
return side effects, dedicated hr_admin/super_admin completion with session revocation,
and status updates (§5.6).
"""
from datetime import date, datetime, timezone
import uuid
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.core.errors import AppError
from app.core.security import CurrentUser, check_permission
from app.models.assets import Asset, AssetAssignment, AssetStatus
from app.models.auth import Role, Session as DBSessionModel, User, UserStatus
from app.models.lifecycle import (
    Checklist,
    ChecklistItem,
    ChecklistItemStatus,
    ChecklistStatus,
    ChecklistType,
)
from app.models.system import AuditLog, Notification, NotificationChannel


class OffboardingService:
    """Service providing core business logic for Offboarding Workflow."""

    def __init__(self, db: Session, current_user: CurrentUser, ip_address: str | None = None):
        self.db = db
        self.current_user = current_user
        self.ip_address = ip_address or "unknown"

    def _format_checklist_response(self, checklist: Checklist) -> dict[str, Any]:
        """Helper to format a Checklist ORM object into response structure with progress stats."""
        now_utc = datetime.now(timezone.utc)
        items_data: list[dict[str, Any]] = []
        completed_count = 0
        total_count = len(checklist.items) if checklist.items else 0

        for item in checklist.items or []:
            item_status = (
                item.status.value
                if hasattr(item.status, "value")
                else str(item.status)
            )
            if item_status == ChecklistItemStatus.done.value or item_status == "done":
                completed_count += 1

            items_data.append(
                {
                    "id": item.id or uuid.uuid4(),
                    "checklist_id": item.checklist_id,
                    "task_name": item.task_name or "Checklist Task",
                    "owner_role_id": item.owner_role_id or self.current_user.role_id or uuid.uuid4(),
                    "owner_role_name": item.owner_role.name if (hasattr(item, "owner_role") and item.owner_role) else None,
                    "status": item.status,
                    "completed_by": item.completed_by,
                    "completed_by_name": item.completer.full_name if (hasattr(item, "completer") and item.completer) else None,
                    "asset_assignment_id": item.asset_assignment_id,
                    "completed_at": item.completed_at,
                    "sort_order": item.sort_order if item.sort_order is not None else 0,
                    "created_at": item.created_at or now_utc,
                }
            )

        progress = int((completed_count / total_count) * 100) if total_count > 0 else 0

        now_utc = datetime.now(timezone.utc)
        return {
            "id": checklist.id,
            "employee_id": checklist.employee_id,
            "employee_name": checklist.employee.full_name if (hasattr(checklist, "employee") and checklist.employee) else None,
            "type": checklist.type,
            "status": checklist.status,
            "completed_at": checklist.completed_at,
            "created_at": checklist.created_at or now_utc,
            "updated_at": checklist.updated_at or now_utc,
            "progress_percentage": progress,
            "total_items": total_count,
            "completed_items": completed_count,
            "items": items_data,
        }

    def create_offboarding_checklist(
        self,
        employee_id: UUID,
        exit_date: date | None = None,
        reason: str | None = None,
    ) -> dict[str, Any]:
        """
        POST /offboarding — create an offboarding checklist with default & dynamic asset recovery items.
        Allowed roles: hr_admin, super_admin only.
        """
        # RBAC (project doc §3.2 step 2): POST /offboarding (§5.6) is restricted to
        # hr_admin/super_admin — same grant as onboarding's checklist create, so
        # both share (resource="employee", action="create") without collision.
        check_permission(self.current_user, "employee", "create", self.db)

        target_user = self.db.query(User).filter(User.id == employee_id).first()
        if not target_user:
            raise AppError(
                status_code=404,
                code="not_found",
                message="Employee not found.",
            )

        # Check for existing active offboarding checklist
        existing = (
            self.db.query(Checklist)
            .filter(
                Checklist.employee_id == employee_id,
                Checklist.type == ChecklistType.offboarding,
                Checklist.status == ChecklistStatus.in_progress,
            )
            .first()
        )
        if existing:
            raise AppError(
                status_code=400,
                code="bad_request",
                message="An active offboarding checklist already exists for this employee.",
            )

        # Transition target user status to offboarding and record exit date if provided
        target_user.status = UserStatus.offboarding
        if exit_date:
            target_user.date_of_exit = exit_date

        # Determine owner roles for default items
        hr_role = self.db.query(Role).filter(Role.name == "hr_admin").first()
        it_role = self.db.query(Role).filter(Role.name == "it_admin").first()

        fallback_role_id = self.current_user.role_id or uuid.uuid4()
        hr_role_id = hr_role.id if hr_role else fallback_role_id
        it_role_id = it_role.id if it_role else fallback_role_id

        now = datetime.now(timezone.utc)
        checklist = Checklist(
            id=uuid.uuid4(),
            employee_id=employee_id,
            type=ChecklistType.offboarding,
            status=ChecklistStatus.in_progress,
            created_at=now,
            updated_at=now,
        )
        checklist.employee = target_user
        checklist.items = []
        self.db.add(checklist)
        self.db.flush()

        # Seed initial system access task
        sort_counter = 1
        access_item = ChecklistItem(
            id=uuid.uuid4(),
            checklist_id=checklist.id,
            task_name="Revoke System Access & Deactivate SSO Credentials",
            owner_role_id=it_role_id,
            status=ChecklistItemStatus.pending,
            sort_order=sort_counter,
            created_at=now,
        )
        checklist.items.append(access_item)
        self.db.add(access_item)
        sort_counter += 1

        # Query active asset assignments for dynamic asset recovery items
        active_assignments = (
            self.db.query(AssetAssignment)
            .options(joinedload(AssetAssignment.asset))
            .filter(
                AssetAssignment.employee_id == employee_id,
                AssetAssignment.returned_at.is_(None),
            )
            .all()
        )

        for assignment in active_assignments:
            asset_name = assignment.asset.name if assignment.asset else "Assigned Asset"
            asset_tag = assignment.asset.asset_tag if assignment.asset else "N/A"
            task_title = f"Retrieve Asset: {asset_name} ({asset_tag})"
            asset_item = ChecklistItem(
                id=uuid.uuid4(),
                checklist_id=checklist.id,
                task_name=task_title,
                owner_role_id=it_role_id,
                asset_assignment_id=assignment.id,
                status=ChecklistItemStatus.pending,
                sort_order=sort_counter,
                created_at=now,
            )
            checklist.items.append(asset_item)
            self.db.add(asset_item)
            sort_counter += 1

        # Seed standard HR exit tasks
        hr_tasks = [
            "Conduct Exit Interview & Collect Feedback",
            "Settle Final Pay, Expenses & Benefits Clearance",
            "Archive Employee Record & Physical Badge Collection",
        ]
        for task_name in hr_tasks:
            item = ChecklistItem(
                id=uuid.uuid4(),
                checklist_id=checklist.id,
                task_name=task_name,
                owner_role_id=hr_role_id,
                status=ChecklistItemStatus.pending,
                sort_order=sort_counter,
                created_at=now,
            )
            checklist.items.append(item)
            self.db.add(item)
            sort_counter += 1

        # Dispatch real DB notifications to IT Admin and HR Admin
        notify_roles = self.db.query(User).join(Role, User.role_id == Role.id).filter(
            Role.name.in_(["it_admin", "hr_admin"]),
            User.id != self.current_user.user_id,
        ).all()
        for recipient in notify_roles:
            notification = Notification(
                id=uuid.uuid4(),
                user_id=recipient.id,
                type="offboarding_assigned",
                title="New Offboarding Checklist Created",
                message=f"Offboarding checklist created for {target_user.full_name}.",
                related_entity_type="checklist",
                related_entity_id=checklist.id,
                channel=NotificationChannel.in_app,
                is_critical=False,
            )
            self.db.add(notification)

        # Audit log entry
        audit_log = AuditLog(
            id=uuid.uuid4(),
            actor_id=self.current_user.user_id,
            action="offboarding.checklist_created",
            entity_type="checklist",
            entity_id=checklist.id,
            after_state={
                "employee_id": str(employee_id),
                "type": "offboarding",
                "exit_date": str(exit_date) if exit_date else None,
                "reason": reason,
            },
            ip_address=self.ip_address,
        )
        self.db.add(audit_log)

        self.db.commit()
        return self._format_checklist_response(checklist)

    def get_offboarding_checklist(self, checklist_id: UUID) -> dict[str, Any]:
        """
        GET /offboarding/{checklist_id} — detail view of offboarding checklist.
        Allowed roles: hr_admin, it_admin, super_admin, assigned manager.
        """
        checklist = (
            self.db.query(Checklist)
            .options(
                joinedload(Checklist.employee),
                joinedload(Checklist.items).joinedload(ChecklistItem.owner_role),
                joinedload(Checklist.items).joinedload(ChecklistItem.completer),
            )
            .filter(
                Checklist.id == checklist_id,
                Checklist.type == ChecklistType.offboarding,
            )
            .first()
        )
        if not checklist:
            raise AppError(
                status_code=404,
                code="not_found",
                message="Offboarding checklist not found.",
            )

        # NOT ported to check_permission(): same OR-of-role-and-ABAC pattern as
        # OnboardingService.get_onboarding_checklist — is_assigned_manager depends
        # on this specific employee's manager_id, so the whole gate is dynamic
        # (§3.2 step 3) and is left unchanged. See report.
        user_role = (self.current_user.role or "").lower()
        is_hr_or_admin = user_role in ("hr_admin", "it_admin", "super_admin")
        is_assigned_manager = (
            user_role == "manager"
            and checklist.employee
            and checklist.employee.manager_id
            and str(checklist.employee.manager_id) == str(self.current_user.user_id)
        )

        if not (is_hr_or_admin or is_assigned_manager):
            raise AppError(
                status_code=403,
                code="forbidden",
                message="You do not have permission to view this offboarding checklist.",
            )

        return self._format_checklist_response(checklist)

    def update_checklist_item(
        self, checklist_id: UUID, item_id: UUID, new_status: ChecklistItemStatus
    ) -> dict[str, Any]:
        """
        PATCH /offboarding/{checklist_id}/items/{item_id} — status update with asset return side effects.
        Allowed roles: matching owner_role_id user, hr_admin, super_admin.
        Pessimistic row lock on Checklist prevents concurrent modifications.
        Note: Does NOT auto-complete parent checklist or terminate employee (must be invoked via POST /complete).
        """
        # NOT ported to check_permission(): "matching owner_role_id OR
        # hr_admin/super_admin" — the brief's own canonical dynamic-ABAC example
        # (§3.2 step 3, per-item owner_role_id), left exactly as-is. See report.
        user_role = (self.current_user.role or "").lower()

        # Pessimistic row locking on parent Checklist row
        checklist = (
            self.db.query(Checklist)
            .filter(
                Checklist.id == checklist_id,
                Checklist.type == ChecklistType.offboarding,
            )
            .with_for_update()
            .first()
        )
        if not checklist:
            raise AppError(
                status_code=404,
                code="not_found",
                message="Offboarding checklist not found.",
            )

        item = (
            self.db.query(ChecklistItem)
            .filter(
                ChecklistItem.id == item_id,
                ChecklistItem.checklist_id == checklist_id,
            )
            .first()
        )
        if not item:
            raise AppError(
                status_code=404,
                code="not_found",
                message="Checklist item not found.",
            )

        # RBAC check: matching owner_role_id OR hr_admin / super_admin
        is_admin_override = user_role in ("hr_admin", "super_admin")
        is_matching_role = (
            self.current_user.role_id
            and str(self.current_user.role_id) == str(item.owner_role_id)
        )

        if not (is_admin_override or is_matching_role):
            raise AppError(
                status_code=403,
                code="forbidden",
                message="You do not have permission to update this checklist item.",
            )

        now = datetime.now(timezone.utc)
        item.status = new_status
        if new_status == ChecklistItemStatus.done:
            item.completed_by = self.current_user.user_id
            item.completed_at = now

            # Forward asset-return side effect
            if item.asset_assignment_id:
                assignment = (
                    self.db.query(AssetAssignment)
                    .filter(AssetAssignment.id == item.asset_assignment_id)
                    .first()
                )
                if assignment and assignment.returned_at is None:
                    assignment.returned_at = now
                    assignment.condition_at_return = "Returned during offboarding checklist completion"

                    asset = (
                        self.db.query(Asset)
                        .filter(Asset.id == assignment.asset_id)
                        .first()
                    )
                    if asset:
                        asset.status = AssetStatus.in_stock
                        asset.current_holder_id = None
        elif new_status in (ChecklistItemStatus.pending, ChecklistItemStatus.in_progress):
            item.completed_by = None
            item.completed_at = None

        checklist.updated_at = now

        # Audit log for item update
        audit_log = AuditLog(
            id=uuid.uuid4(),
            actor_id=self.current_user.user_id,
            action="offboarding.item_updated",
            entity_type="checklist_item",
            entity_id=item.id,
            after_state={
                "status": new_status.value if hasattr(new_status, "value") else str(new_status),
                "checklist_id": str(checklist_id),
            },
            ip_address=self.ip_address,
        )
        self.db.add(audit_log)

        self.db.commit()

        owner_role_name = item.owner_role.name if (hasattr(item, "owner_role") and item.owner_role) else None
        completed_by_name = item.completer.full_name if (hasattr(item, "completer") and item.completer) else None

        return {
            "id": item.id,
            "checklist_id": item.checklist_id,
            "task_name": item.task_name,
            "owner_role_id": item.owner_role_id,
            "owner_role_name": owner_role_name,
            "status": item.status,
            "completed_by": item.completed_by,
            "completed_by_name": completed_by_name,
            "asset_assignment_id": item.asset_assignment_id,
            "completed_at": item.completed_at,
            "sort_order": item.sort_order if item.sort_order is not None else 0,
            "created_at": item.created_at or now,
        }

    def complete_offboarding(self, checklist_id: UUID) -> dict[str, Any]:
        """
        POST /offboarding/{checklist_id}/complete — Complete offboarding checklist and terminate employee.
        Allowed roles: hr_admin, super_admin only.
        Independently re-checks that all checklist items are done, transitions employee status to terminated,
        revokes all active sessions, and dispatches notification.
        """
        # RBAC (project doc §3.2 step 2): POST /offboarding/{id}/complete (§5.6) is
        # restricted to hr_admin/super_admin. This is a final sign-off action
        # (checklist -> completed, employee -> terminated, sessions revoked), so
        # it's mapped to (resource="employee", action="approve") rather than
        # "update" — keeping the "update" pair reserved for PATCH-profile field
        # edits, which grant the same two roles but for a different operation.
        check_permission(self.current_user, "employee", "approve", self.db)

        checklist = (
            self.db.query(Checklist)
            .options(
                joinedload(Checklist.employee),
                joinedload(Checklist.items).joinedload(ChecklistItem.owner_role),
                joinedload(Checklist.items).joinedload(ChecklistItem.completer),
            )
            .filter(
                Checklist.id == checklist_id,
                Checklist.type == ChecklistType.offboarding,
            )
            .with_for_update()
            .first()
        )
        if not checklist:
            raise AppError(
                status_code=404,
                code="not_found",
                message="Offboarding checklist not found.",
            )

        # Independently re-check all items are done
        all_items = checklist.items or []
        incomplete_items = [
            i for i in all_items
            if (i.status.value if hasattr(i.status, "value") else str(i.status)) != ChecklistItemStatus.done.value
        ]
        if incomplete_items:
            raise AppError(
                status_code=400,
                code="bad_request",
                message="Cannot complete offboarding checklist until all items are marked done.",
            )

        now = datetime.now(timezone.utc)
        checklist.status = ChecklistStatus.completed
        checklist.completed_at = now
        checklist.updated_at = now

        target_user = checklist.employee
        if target_user:
            target_user.status = UserStatus.terminated
            if not target_user.date_of_exit:
                target_user.date_of_exit = now.date()

            # Session revocation: revoke all active sessions for target employee
            self.db.query(DBSessionModel).filter(
                DBSessionModel.user_id == target_user.id,
                DBSessionModel.revoked_at.is_(None),
            ).update({"revoked_at": now}, synchronize_session=False)

            # Notification
            notification = Notification(
                id=uuid.uuid4(),
                user_id=target_user.id,
                type="offboarding_completed",
                title="Offboarding Completed",
                message=f"Offboarding completed for {target_user.full_name}. Account terminated.",
                related_entity_type="checklist",
                related_entity_id=checklist.id,
                channel=NotificationChannel.in_app,
                is_critical=False,
            )
            self.db.add(notification)

        # Audit log for offboarding completion
        audit_log = AuditLog(
            id=uuid.uuid4(),
            actor_id=self.current_user.user_id,
            action="offboarding.completed",
            entity_type="checklist",
            entity_id=checklist.id,
            after_state={
                "status": "completed",
                "employee_status": "terminated",
                "employee_id": str(checklist.employee_id),
            },
            ip_address=self.ip_address,
        )
        self.db.add(audit_log)

        self.db.commit()
        return self._format_checklist_response(checklist)
