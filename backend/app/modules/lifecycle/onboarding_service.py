"""
Onboarding Workflow Service — handles creation, retrieval, item status updating with cascading
completion logic, and listing of onboarding checklists.
"""
from datetime import datetime, timedelta, timezone
import uuid
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.clock import local_today
from app.core.errors import AppError
from app.core.password_tokens import link_minutes
from app.core.role_policy import user_holds_role_names
from app.core.security import CurrentUser, check_permission
from app.models.assets import Asset, AssetAssignment, LicenseAssignment, SoftwareLicense
from app.models.auth import Department, PasswordTokenPurpose, Role, User, UserStatus
from app.models.lifecycle import (
    Checklist,
    ChecklistItem,
    ChecklistItemStatus,
    ChecklistStatus,
    ChecklistType,
)
from app.models.system import AuditLog, Notification, NotificationChannel
from app.modules.admin.user_service import UserManagementService
from app.modules.notifications.email import send_invite_email, set_password_link


# Every new joiner's checklist starts with these; the usual equipment and
# licences for people like them are added on top (`extra_items`).
STANDARD_ITEMS: list[tuple[str, str]] = [
    ("Collect Signed Employment Contract & ID Proof", "hr_admin"),
    ("Provision Corporate Email and SSO Accounts", "it_admin"),
    ("Issue Laptop, Monitor, and Hardware Accessories", "it_admin"),
    ("Assign Workspace & Physical Access Credentials", "hr_admin"),
    ("Schedule Team Intro and Orientation Session", "hr_admin"),
]
# What counts as "got in their first weeks" for the recommendations.
FIRST_WEEKS_BEFORE = timedelta(days=14)
FIRST_WEEKS_AFTER = timedelta(days=60)
HISTORY_LIMIT = 100


class OnboardingService:
    """Service providing core business logic for Onboarding Workflow."""

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
                    "asset_assignment_id": item.asset_assignment_id,
                    "completed_at": item.completed_at,
                    "sort_order": item.sort_order,
                    "created_at": item.created_at,
                }
            )

        progress = int((completed_count / total_count) * 100) if total_count > 0 else 0

        now_utc = datetime.now(timezone.utc)
        return {
            "id": checklist.id,
            "employee_id": checklist.employee_id,
            "employee_name": checklist.employee.full_name if (hasattr(checklist, "employee") and checklist.employee) else None,
            # Who and when, so lists can say "joins 20 Oct" / "leaves 31 Oct" without another call
            "employee_designation": checklist.employee.designation if getattr(checklist, "employee", None) else None,
            "employee_department": (
                checklist.employee.department.name
                if getattr(checklist, "employee", None) and getattr(checklist.employee, "department", None)
                else None
            ),
            "date_of_joining": checklist.employee.date_of_joining if getattr(checklist, "employee", None) else None,
            "date_of_exit": checklist.employee.date_of_exit if getattr(checklist, "employee", None) else None,
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

    def create_onboarding_checklist(self, employee_id: UUID, commit: bool = True, extra_items: Optional[list] = None) -> dict[str, Any]:
        """
        POST /onboarding — create an onboarding checklist with fixed default items.
        Allowed roles: hr_admin, super_admin only.
        """
        # RBAC (step 2): POST /onboarding is restricted to
        # hr_admin/super_admin. Checklists are a lifecycle sub-resource of
        # `employee` (schema — checklists.employee_id) — mapped to
        # (resource="employee", action="create") per the brief's guidance to fold
        # checklist actions into the employee resource rather than inventing a
        # `checklist` resource.
        check_permission(self.current_user, "employee", "create", self.db)

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

        # The standard items, then any extra ones — the usual equipment and
        # licences for people like them, or HR's own — without duplicates.
        role_ids = {"hr_admin": hr_role_id, "it_admin": it_role_id}
        default_items = [(name, role_ids[owner], i) for i, (name, owner) in enumerate(STANDARD_ITEMS, start=1)]
        seen = {name.lower() for name, _ in STANDARD_ITEMS}
        added: list[str] = []
        for extra in extra_items or []:
            name = extra.task_name.strip()
            if name and name.lower() not in seen:
                seen.add(name.lower())
                added.append(name)
                default_items.append((name, role_ids[extra.owner], len(default_items) + 1))

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
        # no seed role in this system (RBAC only has 6 roles), so facilities-
        # owned tasks are attributed to hr_admin (see the template above) and HR is
        # notified alongside IT rather than the un-modelled "Facilities" recipient.
        notify_roles = self.db.query(User).filter(
            user_holds_role_names(["it_admin", "hr_admin"]),
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
            after_state={"employee_id": str(employee_id), "type": "onboarding", **({"extra_items": added} if added else {})},
            ip_address=self.ip_address,
        )
        self.db.add(audit_log)

        if commit:
            self.db.commit()
        else:
            self.db.flush()
        return self._format_checklist_response(checklist)

    def add_new_joiner(self, payload) -> dict[str, Any]:
        """POST /onboarding/new-joiner.

        One step for HR: creates the account (status `onboarding`, role defaults
        to employee) and its onboarding checklist in one transaction, and
        returns a single-use set-password link to hand over. The link is
        emailed too when email delivery is on. The person can sign in once
        they've set a password, and becomes `active` when the checklist is done.
        """
        check_permission(self.current_user, "employee", "create", self.db)
        user, token = UserManagementService(self.db, self.current_user, self.ip_address).create_account(
            full_name=payload.full_name,
            email=payload.email,
            role_id=payload.role_id,
            department_id=payload.department_id,
            manager_id=payload.manager_id,
            designation=payload.designation,
            date_of_joining=payload.date_of_joining,
            status=UserStatus.onboarding,
        )
        checklist = self.create_onboarding_checklist(user.id, commit=False, extra_items=payload.extra_items)
        self.db.commit()
        email_sent = send_invite_email(user.email, user.full_name, token)
        return {
            "checklist": checklist,
            "set_password_link": set_password_link(token),
            "link_expires_in_minutes": link_minutes(PasswordTokenPurpose.invite),
            "email_sent": email_sent,
        }

    def joiner_history(self) -> dict[str, Any]:
        """GET /onboarding/joiner-history: what recent joiners received in their first
        weeks — equipment categories and licences — with where they sat, but not who they
        are. Read-only; for HR (the people who add joiners). The AI service turns it into
        the usual items for a new joiner."""
        check_permission(self.current_user, "employee", "create", self.db)
        since = local_today() - timedelta(days=3 * 365)
        joiners = (
            self.db.query(User.id, User.designation, User.date_of_joining, User.department_id, Department.name)
            .outerjoin(Department, Department.id == User.department_id)
            .filter(User.date_of_joining >= since, User.date_of_joining <= local_today())
            .order_by(User.date_of_joining.desc())
            .limit(HISTORY_LIMIT)
            .all()
        )
        ids = [j.id for j in joiners]
        joined = {j.id: j.date_of_joining for j in joiners}

        def first_weeks(user_id: UUID, when: datetime) -> bool:
            start = datetime.combine(joined[user_id], datetime.min.time(), tzinfo=timezone.utc)
            when = when if when.tzinfo else when.replace(tzinfo=timezone.utc)
            return start - FIRST_WEEKS_BEFORE <= when <= start + FIRST_WEEKS_AFTER

        assets: dict[UUID, set[str]] = {i: set() for i in ids}
        for user_id, category, assigned_at in (
            self.db.query(AssetAssignment.employee_id, Asset.category, AssetAssignment.assigned_at)
            .join(Asset, Asset.id == AssetAssignment.asset_id)
            .filter(AssetAssignment.employee_id.in_(ids))
            .all()
            if ids
            else []
        ):
            if first_weeks(user_id, assigned_at) and category and category != "software_license":
                assets[user_id].add(category)
        licences: dict[UUID, dict[str, str]] = {i: {} for i in ids}
        for user_id, licence_id, name, assigned_at in (
            self.db.query(LicenseAssignment.user_id, SoftwareLicense.id, SoftwareLicense.name, LicenseAssignment.assigned_at)
            .join(SoftwareLicense, SoftwareLicense.id == LicenseAssignment.license_id)
            .filter(LicenseAssignment.user_id.in_(ids))
            .all()
            if ids
            else []
        ):
            if first_weeks(user_id, assigned_at):
                licences[user_id][str(licence_id)] = name
        return {
            "joiners": [
                {
                    "department_id": j.department_id,
                    "department_name": j.name,
                    "designation": j.designation,
                    "joined_on": j.date_of_joining,
                    "asset_categories": sorted(assets[j.id]),
                    "licences": [{"id": k, "name": v} for k, v in sorted(licences[j.id].items(), key=lambda kv: kv[1])],
                }
                for j in joiners
            ],
            "standard_items": [name for name, _ in STANDARD_ITEMS],
        }

    def get_onboarding_checklist(self, checklist_id: UUID) -> dict[str, Any]:
        """
        GET /onboarding/{checklist_id} — detail view of onboarding checklist.
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
                Checklist.type == ChecklistType.onboarding,
            )
            .first()
        )
        if not checklist:
            raise AppError(
                status_code=404,
                code="not_found",
                message="Checklist not found.",
            )

        # NOT ported to check_permission(): this is an OR of a role-only clause
        # (hr_admin/it_admin/super_admin) and a dynamic ABAC clause (the specific
        # employee's assigned manager, step 3) — the overall gate depends on
        # more than the caller's role, so per step 2 of the brief it stays a
        # dynamic check rather than being split. Its role-only allowed set also
        # differs from every other "employee read" grant in this file (see report).
        is_hr_or_admin = self.current_user.has_role("hr_admin", "it_admin", "super_admin")
        is_assigned_manager = (
            self.current_user.has_role("manager")
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
        PATCH /onboarding/{checklist_id}/items/{item_id} — status update with cascading completion.
        Allowed roles: matching owner_role_id user, hr_admin, super_admin.
        Pessimistic row lock on Checklist prevents race conditions on concurrent final item completion.
        """
        # NOT ported to check_permission(): "matching owner_role_id OR
        # hr_admin/super_admin" is the brief's own canonical example of a dynamic
        # ABAC check (step 3) — is_matching_role depends on this specific
        # checklist item's owner_role_id, not just the caller's role — so the
        # whole gate, including its role-only half, is left exactly as-is.

        # Pessimistic row locking on parent Checklist row. Type-filtered so a
        # caller with a legitimate offboarding checklist ID can't have it
        # processed by the onboarding endpoint instead — that would run
        # onboarding's cascading-completion logic and skip offboarding's
        # asset-return side effect entirely (cross-workflow fix).
        checklist = (
            self.db.query(Checklist)
            .filter(
                Checklist.id == checklist_id,
                Checklist.type == ChecklistType.onboarding,
            )
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
        is_admin_override = self.current_user.has_role("hr_admin", "super_admin")
        is_matching_role = self.current_user.holds_role_id(item.owner_role_id)

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
            # A new joiner becomes active once their onboarding is done.
            joiner = self.db.query(User).filter(User.id == checklist.employee_id).first()
            if joiner is not None and joiner.status == UserStatus.onboarding:
                joiner.status = UserStatus.active
                self.db.add(
                    AuditLog(
                        id=uuid.uuid4(),
                        actor_id=self.current_user.user_id,
                        action="user.onboarding_completed",
                        entity_type="user",
                        entity_id=joiner.id,
                        before_state={"status": UserStatus.onboarding.value},
                        after_state={"status": UserStatus.active.value},
                        ip_address=self.ip_address,
                    )
                )
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
            "asset_assignment_id": item.asset_assignment_id,
            "completed_at": item.completed_at,
            "sort_order": item.sort_order,
            "created_at": item.created_at or now,
        }

    def list_onboardings(
        self,
        status_filter: Optional[ChecklistStatus] = None,
        page: int = 1,
        page_size: int = 25,
    ) -> dict[str, Any]:
        """
        GET /onboarding — list active / completed onboarding checklists.
        Allowed roles: hr_admin/super_admin (full); it_admin (checklists with at
        least one item owned by the IT role — "view + complete own tasks" per
        Access line); manager (checklists for their own direct reports
        "view own report's progress"). Previously this endpoint 403'd it_admin
        and manager entirely despite explicitly granting them access,
        leaving the Onboarding page a dead-end error screen for both roles.
        """
        query = (
            self.db.query(Checklist)
            .options(
                joinedload(Checklist.employee),
                joinedload(Checklist.items).joinedload(ChecklistItem.owner_role),
                joinedload(Checklist.items).joinedload(ChecklistItem.completer),
            )
            .filter(Checklist.type == ChecklistType.onboarding)
        )

        # Multi-role: each held role adds what it can see; widest wins.
        cu = self.current_user
        if not cu.has_role("hr_admin", "super_admin"):
            visible = []
            if cu.has_role("it_admin"):
                visible.append(Checklist.items.any(ChecklistItem.owner_role_id.in_(cu.role_ids)))
            if cu.has_role("manager"):
                visible.append(Checklist.employee.has(User.manager_id == cu.user_id))
            if not visible:
                raise AppError(
                    status_code=403,
                    code="forbidden",
                    message="You do not have permission to view the onboarding checklist list.",
                )
            query = query.filter(or_(*visible))

        if status_filter:
            query = query.filter(Checklist.status == status_filter)

        total = query.order_by(None).count()
        total_pages = -(-total // page_size) if total > 0 else 0
        offset = (page - 1) * page_size

        checklists = (
            query.order_by(Checklist.created_at.desc(), Checklist.id.desc()).offset(offset).limit(page_size).all()
        )
        formatted_checklists = [self._format_checklist_response(c) for c in checklists]

        return {
            "checklists": formatted_checklists,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }
