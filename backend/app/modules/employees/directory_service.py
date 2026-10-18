"""
Employee Directory Service — handles employee directory querying, search,
status filtering, and ABAC row-level scoping for manager role.
"""
import math
import uuid as uuid_lib
from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select, union
from sqlalchemy.orm import Session, aliased

from app.core.errors import AppError
from app.core.role_policy import user_holds_role_ids
from app.core.security import CurrentUser, check_permission
from app.models.auth import Department, Role, User, UserRole, UserStatus
from app.models.system import AuditLog


class EmployeeDirectoryService:
    """Service providing sanitized employee directory data with ABAC department scoping for managers."""

    def __init__(self, db: Session, current_user: CurrentUser, ip_address: str | None = None):
        self.db = db
        self.current_user = current_user
        self.ip_address = ip_address or "unknown"

    def get_employees(
        self,
        search: str | None = None,
        department_id: UUID | None = None,
        status: str | None = None,
        role: str | None = None,
        view: str = "list",
        page: int = 1,
        page_size: int = 25,
    ) -> dict[str, Any]:
        """
        Query sanitized employee records matching filters with ABAC row-level scoping.
        Excludes sensitive financial and document fields per rules.md Zero-Trust.
        """
        # Multi-role (§5.14): the manager's department scope narrows only a user
        # whose ONLY role is manager — any other role held sees the full directory.
        manager_scoped = self.current_user.role_names == frozenset({"manager"})

        # Build alias for self-join to resolve manager_name
        ManagerUser = aliased(User)

        # Base query joining Department, Role, and ManagerUser
        query = (
            self.db.query(
                User.id,
                User.employee_code,
                User.full_name,
                User.email,
                User.designation,
                User.department_id,
                Department.name.label("department_name"),
                User.manager_id,
                ManagerUser.full_name.label("manager_name"),
                User.status,
                User.phone,
                User.date_of_joining,
            )
            .outerjoin(Department, User.department_id == Department.id)
            .outerjoin(Role, User.role_id == Role.id)
            .outerjoin(ManagerUser, User.manager_id == ManagerUser.id)
        )

        # ABAC row-level scoping: Manager role only sees employees in their department
        if manager_scoped:
            if not self.current_user.department_id:
                return {"items": [], "total": 0, "page": page, "page_size": page_size, "pages": 0}
            query = query.filter(User.department_id == self.current_user.department_id)

        # Apply search filter (name, email, employee_code, designation)
        if search and search.strip():
            term = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    User.full_name.ilike(term),
                    User.email.ilike(term),
                    User.employee_code.ilike(term),
                    User.designation.ilike(term),
                )
            )

        # Apply department filter
        if department_id:
            query = query.filter(User.department_id == department_id)

        # Apply status filter
        if status and status.strip():
            raw_status = status.strip().lower()
            try:
                enum_val = UserStatus(raw_status)
                query = query.filter(User.status == enum_val)
            except ValueError:
                query = query.filter(User.status == raw_status)

        # Apply role filter
        if role and role.strip():
            # Matches primary or additional roles.
            query = query.filter(
                user_holds_role_ids(select(Role.id).where(Role.name.ilike(role.strip())))
            )

        # Total matching records
        total = query.count()

        # Tree view still respects the documented page_size cap (§7 rule 3) —
        # it can't paginate a hierarchy meaningfully, but it must not return
        # an unbounded array either, so very large orgs only render their
        # first page_size employees in the chart.
        if view == "tree":
            rows = query.order_by(User.full_name.asc()).limit(page_size).all()
            items = [
                {
                    "id": r.id,
                    "employee_code": r.employee_code,
                    "full_name": r.full_name,
                    "email": r.email,
                    "designation": r.designation,
                    "department_id": r.department_id,
                    "department_name": r.department_name,
                    "manager_id": r.manager_id,
                    "manager_name": r.manager_name,
                    "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                    "phone": r.phone,
                    "date_of_joining": r.date_of_joining,
                }
                for r in rows
            ]
            return {
                "items": items,
                "total": total,
                "page": 1,
                "page_size": page_size,
                "pages": 1,
            }

        # Pagination for list view
        pages = math.ceil(total / page_size) if total > 0 else 0
        offset = (page - 1) * page_size
        rows = (
            query.order_by(User.full_name.asc())
            .offset(offset)
            .limit(page_size)
            .all()
        )

        items = [
            {
                "id": r.id,
                "employee_code": r.employee_code,
                "full_name": r.full_name,
                "email": r.email,
                "designation": r.designation,
                "department_id": r.department_id,
                "department_name": r.department_name,
                "manager_id": r.manager_id,
                "manager_name": r.manager_name,
                "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                "phone": r.phone,
                "date_of_joining": r.date_of_joining,
            }
            for r in rows
        ]

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": pages,
        }

    def get_filter_options(self) -> dict[str, Any]:
        """
        Query distinct departments, statuses, and roles populated from DB records.
        """
        # Multi-role (§5.14): the manager's department scope narrows only a user
        # whose ONLY role is manager — any other role held sees the full directory.
        manager_scoped = self.current_user.role_names == frozenset({"manager"})

        # Department counts from DB
        dept_query = (
            self.db.query(Department.id, Department.name, func.count(User.id))
            .join(User, User.department_id == Department.id)
        )
        if manager_scoped:
            dept_query = dept_query.filter(Department.id == self.current_user.department_id)
        dept_rows = dept_query.group_by(Department.id, Department.name).order_by(Department.name.asc()).all()

        dept_items = [
            {"value": str(d_id), "label": d_name, "count": d_count}
            for d_id, d_name, d_count in dept_rows
        ]

        # Status counts from DB
        status_query = (
            self.db.query(User.status, func.count(User.id))
            .filter(User.status.isnot(None))
        )
        if manager_scoped:
            status_query = status_query.filter(User.department_id == self.current_user.department_id)
        status_rows = status_query.group_by(User.status).all()

        status_items = [
            {
                "value": s_val.value if hasattr(s_val, "value") else str(s_val),
                "label": (s_val.value if hasattr(s_val, "value") else str(s_val)).replace("_", " ").title(),
                "count": s_count,
            }
            for s_val, s_count in status_rows
        ]

        # Role counts from DB
        # Everyone holding the role, as primary or additional (§5.14).
        holders = union(
            select(User.id.label("user_id"), User.role_id.label("role_id")),
            select(UserRole.user_id, UserRole.role_id),
        ).subquery()
        role_query = (
            self.db.query(Role.id, Role.name, func.count(User.id))
            .join(holders, holders.c.role_id == Role.id)
            .join(User, User.id == holders.c.user_id)
        )
        if manager_scoped:
            role_query = role_query.filter(User.department_id == self.current_user.department_id)
        role_rows = role_query.group_by(Role.id, Role.name).all()

        role_items = [
            {
                "value": r_name,
                "label": r_name.replace("_", " ").title(),
                "count": r_count,
                "role_id": str(r_id),
            }
            for r_id, r_name, r_count in role_rows
        ]

        return {
            "departments": dept_items,
            "statuses": status_items,
            "roles": role_items,
        }

    def delete_employee(self, employee_id: UUID) -> dict[str, Any]:
        """
        Soft-delete an employee record (Super Admin only) — sets status=terminated
        and preserves the row for audit history (§1 schema note: user-facing tables
        are soft-deletable, never hard-deleted).
        """
        # RBAC (project doc §3.2 step 2): DELETE /employees/{id} (§5.3) is restricted
        # to super_admin only. Mapped to (resource="employee", action="delete") —
        # ported from the hardcoded role-string check to a real role_permissions
        # lookup. No ABAC component here (not scoped by self/department).
        check_permission(self.current_user, "employee", "delete", self.db)

        target_user = self.db.query(User).filter(User.id == employee_id).first()
        if not target_user:
            raise AppError(status_code=404, code="not_found", message="Employee not found.")

        before_state = {"status": target_user.status.value}

        # Reassign direct reports manager_id to None
        self.db.query(User).filter(User.manager_id == employee_id).update({"manager_id": None})
        # If managing department, clear manager_id
        self.db.query(Department).filter(Department.manager_id == employee_id).update({"manager_id": None})

        target_user.status = UserStatus.terminated
        if not target_user.date_of_exit:
            target_user.date_of_exit = date.today()

        self.db.add(
            AuditLog(
                id=uuid_lib.uuid4(),
                actor_id=self.current_user.user_id,
                action="employee.deleted",
                entity_type="user",
                entity_id=target_user.id,
                before_state=before_state,
                after_state={"status": "terminated"},
                ip_address=self.ip_address,
            )
        )

        self.db.commit()

        return {"success": True, "message": f"Employee {target_user.full_name} was successfully deleted."}
