"""
Onboarding Workflow Service — handles creation, retrieval, item status updating with cascading
completion logic, and listing of onboarding checklists (§5.5).
"""
from datetime import datetime, timezone
import uuid
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.core.errors import AppError
from app.core.security import CurrentUser
from app.models.auth import Role, User
from app.models.lifecycle import (
    Checklist,
    ChecklistItem,
    ChecklistItemStatus,
    ChecklistStatus,
    ChecklistType,
)
from app.models.system import AuditLog, Notification, NotificationChannel


class OnboardingService:
    """Service providing core business logic for Onboarding Workflow (§5.5)."""

    def __init__(self, db: Session, current_user: CurrentUser, ip_address: str | None = None):
        self.db = db
        self.current_user = current_user
        self.ip_address = ip_address or "unknown"

    def _format_checklist_response(self, checklist: Checklist) -> dict[str, Any]:
        """Helper to format a Checklist ORM object into response structure with progress stats."""
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
                    "id": item.id,
                    "checklist_id": item.checklist_id,
                    "task_name": item.task_name,
                    "owner_role_id": item.owner_role_id,
                    "owner_role_name": item.owner_role.name if item.owner_role else None,
                    "status": item.status,
                    "completed_by": item.completed_by,
                    "completed_by_name": item.completer.full_name if item.completer else None,
                    "completed_at": item.completed_at,
                    "sort_order": item.sort_order,
                    "created_at": item.created_at,
                }
            )

        progress = int((completed_count / total_count) * 100) if total_count > 0 else 0
        checklist_status = (
            checklist.status.value
            if hasattr(checklist.status, "value")
            else str(checklist.status)
        )

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

    def create_onboarding_checklist(self, employee_id: UUID) -> dict[str, Any]:
        """
        POST /onboarding — create an onboarding checklist with fixed default items (§5.5).
        Allowed roles: hr_admin, super_admin only.
        """
        user_role = (self.current_user.role or "").lower()
        if user_role not in ("hr_admin", "super_admin"):
            raise AppError(
                status_code=403,
                code="forbidden",
                message="Only HR Admin or Super Admin can create onboarding checklists.",
            )

        target_user = self.db.query(User).filter(User.id == employee_id).first()
        if not target_user:
            raise AppError(
                status_code=404,
                code="not_found",
                message="Employee not found.",
            )

        # Check for existing active onboarding checklist
        existing = (
            self.db.query(Checklist)
            .filter(
                Checklist.employee_id == employee_id,
                Checklist.type == ChecklistType.onboarding,
                Checklist.status == ChecklistStatus.in_progress,
            )
            .first()
        )
        if existing:
            raise AppError(
                status_code=400,
                code="bad_request",
                message="An active onboarding checklist already exists for this employee.",
            )

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
            type=ChecklistType.onboarding,
            status=ChecklistStatus.in_progress,
            created_at=now,
            updated_at=now,
        )
        checklist.employee = target_user
        checklist.items = []
        self.db.add(checklist)
        self.db.flush()

        # Seed fixed default items (PRD §5.5)
        default_items = [
            ("Collect Signed Employment Contract & ID Proof", hr_role_id, 1),
            ("Provision Corporate Email and SSO Accounts", it_role_id, 2),
            ("Issue Laptop, Monitor, and Hardware Accessories", it_role_id, 3),
            ("Assign Workspace & Physical Access Credentials", hr_role_id, 4),
            ("Schedule Team Intro and Orientation Session", hr_role_id, 5),
        ]

        for task_name, owner_role_id, sort_order in default_items:
            item = ChecklistItem(
                id=uuid.uuid4(),
                checklist_id=checklist.id,
                task_name=task_name,
                owner_role_id=owner_role_id,
                status=ChecklistItemStatus.pending,
                sort_order=sort_order,
                created_at=now,
            )
            checklist.items.append(item)
            self.db.add(item)

        # Dispatch real DB notifications to IT Admin and HR Admin — "Facilities" has
        # no seed role in this system (RBAC §3.1 only has 6 roles), so facilities-
        # owned tasks are attributed to hr_admin (see the template above) and HR is
        # notified alongside IT rather than the un-modelled "Facilities" recipient.
        notify_roles = self.db.query(User).join(Role, User.role_id == Role.id).filter(
            Role.name.in_(["it_admin", "hr_admin"]),
            User.id != self.current_user.user_id,
        ).all()
        for recipient in notify_roles:
            notification = Notification(
                id=uuid.uuid4(),
                user_id=recipient.id,
                type="onboarding_assigned",
                title="New Onboarding Checklist Created",
                message=f"Onboarding checklist created for {target_user.full_name}.",
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
            action="onboarding.checklist_created",
            entity_type="checklist",
            entity_id=checklist.id,
            after_state={"employee_id": str(employee_id), "type": "onboarding"},
            ip_address=self.ip_address,
        )
        self.db.add(audit_log)

        self.db.commit()
        return self._format_checklist_response(checklist)

    def get_onboarding_checklist(self, checklist_id: UUID) -> dict[str, Any]:
        """
        GET /onboarding/{checklist_id} — detail view of onboarding checklist (§5.5).
        Allowed roles: hr_admin, it_admin, super_admin, assigned manager.
        """
        checklist = (
            self.db.query(Checklist)
            .options(
                joinedload(Checklist.employee),
                joinedload(Checklist.items).joinedload(ChecklistItem.owner_role),
                joinedload(Checklist.items).joinedload(ChecklistItem.completer),
            )
            .filter(Checklist.id == checklist_id)
            .first()
        )
        if not checklist:
            raise AppError(
                status_code=404,
                code="not_found",
                message="Checklist not found.",
            )

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
                message="You do not have permission to view this onboarding checklist.",
            )

        return self._format_checklist_response(checklist)

    def update_checklist_item(
        self, checklist_id: UUID, item_id: UUID, new_status: ChecklistItemStatus
    ) -> dict[str, Any]:
        """
        PATCH /onboarding/{checklist_id}/items/{item_id} — status update with cascading completion (§5.5).
        Allowed roles: matching owner_role_id user, hr_admin, super_admin.
        Pessimistic row lock on Checklist prevents race conditions on concurrent final item completion.
        """
        user_role = (self.current_user.role or "").lower()

        # Pessimistic row locking on parent Checklist row
        checklist = (
            self.db.query(Checklist)
            .filter(Checklist.id == checklist_id)
            .with_for_update()
            .first()
        )
        if not checklist:
            raise AppError(
                status_code=404,
                code="not_found",
                message="Checklist not found.",
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
        elif new_status in (ChecklistItemStatus.pending, ChecklistItemStatus.in_progress):
            item.completed_by = None
            item.completed_at = None

        # Check cascading completion across all items in checklist
        all_items = (
            self.db.query(ChecklistItem)
            .filter(ChecklistItem.checklist_id == checklist_id)
            .all()
        )

        all_done = all(
            (getattr(i, "id", None) == item_id and new_status == ChecklistItemStatus.done)
            or (getattr(i, "id", None) != item_id and getattr(i, "status", None) == ChecklistItemStatus.done)
            for i in (all_items or [])
        )

        if all_done:
            checklist.status = ChecklistStatus.completed
            checklist.completed_at = now
        else:
            checklist.status = ChecklistStatus.in_progress
            checklist.completed_at = None

        checklist.updated_at = now

        # Notification on task / checklist status update
        employee_name = checklist.employee.full_name if (hasattr(checklist, "employee") and checklist.employee) else "Employee"
        if all_done:
            notification = Notification(
                id=uuid.uuid4(),
                user_id=checklist.employee_id,
                type="onboarding_completed",
                title="Onboarding Completed",
                message=f"All onboarding tasks for {employee_name} have been completed.",
                related_entity_type="checklist",
                related_entity_id=checklist.id,
                channel=NotificationChannel.in_app,
                is_critical=False,
            )
            self.db.add(notification)

        # Audit log for item update & cascading completion
        audit_log = AuditLog(
            id=uuid.uuid4(),
            actor_id=self.current_user.user_id,
            action="onboarding.item_updated",
            entity_type="checklist_item",
            entity_id=item.id,
            after_state={
                "status": new_status.value if hasattr(new_status, "value") else str(new_status),
                "checklist_id": str(checklist_id),
                "checklist_completed": all_done,
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
            "completed_at": item.completed_at,
            "sort_order": item.sort_order,
            "created_at": item.created_at or now,
        }

    def list_onboardings(
        self, status_filter: Optional[ChecklistStatus] = None
    ) -> dict[str, Any]:
        """
        GET /onboarding — list active / completed onboarding checklists (§5.5).
        Allowed roles: hr_admin, super_admin only.
        """
        user_role = (self.current_user.role or "").lower()
        if user_role not in ("hr_admin", "super_admin"):
            raise AppError(
                status_code=403,
                code="forbidden",
                message="Only HR Admin or Super Admin can view the onboarding checklist list.",
            )

        query = (
            self.db.query(Checklist)
            .options(
                joinedload(Checklist.employee),
                joinedload(Checklist.items).joinedload(ChecklistItem.owner_role),
                joinedload(Checklist.items).joinedload(ChecklistItem.completer),
            )
            .filter(Checklist.type == ChecklistType.onboarding)
        )

        if status_filter:
            query = query.filter(Checklist.status == status_filter)

        checklists = query.order_by(Checklist.created_at.desc()).all()
        formatted_checklists = [self._format_checklist_response(c) for c in checklists]

        return {
            "checklists": formatted_checklists,
            "total": len(formatted_checklists),
        }
