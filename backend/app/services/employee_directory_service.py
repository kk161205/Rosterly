"""
Employee Directory Service — handles employee directory querying, search,
status filtering, and ABAC row-level scoping for manager role.
"""
import math
from typing import Any
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session, aliased

from app.core.security import CurrentUser
from app.models.auth import Department, User
from app.schemas.employee_directory import EmployeeDirectoryResponse, EmployeeListItem


class EmployeeDirectoryService:
    """Service providing sanitized employee directory data with ABAC department scoping for managers."""

    def __init__(self, db: Session, current_user: CurrentUser):
        self.db = db
        self.current_user = current_user

    def get_employees(
        self,
        search: str | None = None,
        department_id: UUID | str | None = None,
        status: str | None = None,
        view: str = "list",
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        ManagerUser = aliased(User)

        query = (
            self.db.query(
                User.id.label("id"),
                User.employee_code.label("employee_code"),
                User.full_name.label("full_name"),
                User.email.label("email"),
                User.designation.label("designation"),
                User.department_id.label("department_id"),
                Department.name.label("department_name"),
                User.manager_id.label("manager_id"),
                ManagerUser.full_name.label("manager_name"),
                User.status.label("status"),
                User.phone.label("phone"),
                User.date_of_joining.label("date_of_joining"),
            )
            .outerjoin(Department, User.department_id == Department.id)
            .outerjoin(ManagerUser, User.manager_id == ManagerUser.id)
        )

        role = (self.current_user.role or "").lower()

        # ABAC Row Scoping for Manager
        if role == "manager":
            query = query.filter(User.department_id == self.current_user.department_id)
        elif department_id:
            query = query.filter(User.department_id == department_id)

        # Full-text / field search
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

        # Status filter
        if status and status.strip():
            query = query.filter(User.status == status.strip())

        total = query.count()
        pages = math.ceil(total / page_size) if total > 0 else 1
        offset = (page - 1) * page_size

        rows = query.order_by(User.full_name.asc()).offset(offset).limit(page_size).all()

        items: list[EmployeeListItem] = []
        for r in rows:
            status_val = r.status.value if hasattr(r.status, "value") else str(r.status) if r.status else "active"
            items.append(
                EmployeeListItem(
                    id=r.id,
                    employee_code=r.employee_code,
                    full_name=r.full_name,
                    email=r.email,
                    designation=r.designation,
                    department_id=r.department_id,
                    department_name=r.department_name,
                    manager_id=r.manager_id,
                    manager_name=r.manager_name,
                    status=status_val,
                    phone=r.phone,
                    date_of_joining=r.date_of_joining,
                )
            )

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": pages,
        }
