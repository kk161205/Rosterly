"""
Employee Directory Service — handles employee directory querying, search,
status filtering, and ABAC row-level scoping for manager role.
"""
import math
import uuid as uuid_lib
from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, aliased

from app.core.errors import AppError
from app.core.security import CurrentUser, invalidate_session_cache
from app.models.auth import Department, Role, User, UserStatus
from app.models.system import AuditLog
from app.schemas.employee_directory import EmployeeDirectoryResponse, EmployeeListItem


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
        page_size: int = 20,
    ) -> dict[str, Any]:
        """
        Query sanitized employee records matching filters with ABAC row-level scoping.
        Excludes sensitive financial and document fields per rules.md Zero-Trust.
        """
        user_role = (self.current_user.role or "").lower()

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
        if user_role == "manager":
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
            query = query.filter(Role.name.ilike(role.strip()))

        # Total matching records
        total = query.count()

        # Tree view bypasses pagination to construct complete org hierarchy
        if view == "tree":
            rows = query.order_by(User.full_name.asc()).all()
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
                "page_size": total or 1,
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
        user_role = (self.current_user.role or "").lower()

        # Department counts from DB
        dept_query = (
            self.db.query(Department.id, Department.name, func.count(User.id))
            .join(User, User.department_id == Department.id)
        )
        if user_role == "manager":
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
        if user_role == "manager":
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
        role_query = (
            self.db.query(Role.name, func.count(User.id))
            .join(User, User.role_id == Role.id)
        )
        if user_role == "manager":
            role_query = role_query.filter(User.department_id == self.current_user.department_id)
        role_rows = role_query.group_by(Role.name).all()

        role_items = [
            {"value": r_name, "label": r_name.replace("_", " ").title(), "count": r_count}
            for r_name, r_count in role_rows
        ]

        return {
            "departments": dept_items,
            "statuses": status_items,
            "roles": role_items,
        }

    def offboard_employee(
        self, employee_id: UUID, exit_date: date | None = None, reason: str | None = None
    ) -> dict[str, Any]:
        """
        Initiate offboarding transition for an employee (§5.3 — exit_date/reason query params).
        """
        user_role = (self.current_user.role or "").lower()
        if user_role not in ("super_admin", "hr_admin"):
            raise AppError(status_code=403, code="forbidden", message="Only Super Admin or HR Admin can initiate offboarding.")

        target_user = self.db.query(User).filter(User.id == employee_id).first()
        if not target_user:
            raise AppError(status_code=404, code="not_found", message="Employee not found.")

        before_state = {"status": target_user.status.value, "date_of_exit": str(target_user.date_of_exit) if target_user.date_of_exit else None}

        target_user.status = UserStatus.offboarding
        target_user.date_of_exit = exit_date or target_user.date_of_exit

        self.db.add(
            AuditLog(
                id=uuid_lib.uuid4(),
                actor_id=self.current_user.user_id,
                action="employee.offboarded",
                entity_type="user",
                entity_id=target_user.id,
                before_state=before_state,
                after_state={
                    "status": "offboarding",
                    "date_of_exit": str(target_user.date_of_exit) if target_user.date_of_exit else None,
                    "reason": reason,
                },
                ip_address=self.ip_address,
            )
        )

        self.db.commit()
        self.db.refresh(target_user)
        invalidate_session_cache()

        dept_name = target_user.department.name if target_user.department else None
        mgr_name = target_user.manager.full_name if target_user.manager else None

        return {
            "id": target_user.id,
            "employee_code": target_user.employee_code,
            "full_name": target_user.full_name,
            "email": target_user.email,
            "designation": target_user.designation,
            "department_id": target_user.department_id,
            "department_name": dept_name,
            "manager_id": target_user.manager_id,
            "manager_name": mgr_name,
            "status": "offboarding",
            "phone": target_user.phone,
            "date_of_joining": target_user.date_of_joining,
        }

    def delete_employee(self, employee_id: UUID) -> dict[str, Any]:
        """
        Soft-delete an employee record (Super Admin only) — sets status=terminated
        and preserves the row for audit history (§1 schema note: user-facing tables
        are soft-deletable, never hard-deleted).
        """
        user_role = (self.current_user.role or "").lower()
        if user_role != "super_admin":
            raise AppError(status_code=403, code="forbidden", message="Only Super Admin can delete employee records.")

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
        invalidate_session_cache()

        return {"success": True, "message": f"Employee {target_user.full_name} was successfully deleted."}
