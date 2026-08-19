"""
Employee Profile Service — handles detailed employee profile queries, profile updates,
document vault management, and asset assignment retrieval with fine-grained ABAC.
"""
import os
import uuid
from typing import Any
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session, aliased

from app.core.errors import AppError
from app.core.security import CurrentUser, invalidate_session_cache
from app.models.assets import Asset, AssetAssignment
from app.models.auth import Department, Role, User, UserStatus
from app.models.lifecycle import Document, DocumentType
from app.schemas.employee_profile import EmployeeProfileUpdateRequest


class EmployeeProfileService:
    """Service providing fine-grained ABAC for Employee Profile Detail (§5.4)."""

    def __init__(self, db: Session, current_user: CurrentUser):
        self.db = db
        self.current_user = current_user

    def get_employee_profile(self, employee_id: UUID) -> dict[str, Any]:
        """
        Get detailed employee profile record with row-level ABAC department scoping.
        Allowed roles: self, manager (own dept), hr_admin, super_admin, auditor.
        Denied roles: it_admin (403). Out-of-dept manager gets 403.
        """
        user_role = (self.current_user.role or "").lower()
        if user_role == "it_admin":
            raise AppError(
                status_code=403,
                code="forbidden",
                message="IT Admin does not have permission to view employee profile details.",
            )

        ManagerUser = aliased(User)
        target = (
            self.db.query(
                User,
                Department.name.label("department_name"),
                Role.name.label("role_name"),
                ManagerUser.full_name.label("manager_name"),
            )
            .outerjoin(Department, User.department_id == Department.id)
            .outerjoin(Role, User.role_id == Role.id)
            .outerjoin(ManagerUser, User.manager_id == ManagerUser.id)
            .filter(User.id == employee_id)
            .first()
        )

        if not target:
            raise AppError(status_code=404, code="not_found", message="Employee not found.")

        user_obj, dept_name, role_name, manager_name = target

        # Row-level department scoping for manager role
        if user_role == "manager":
            is_self = str(self.current_user.user_id) == str(employee_id)
            if not is_self:
                if (
                    not self.current_user.department_id
                    or user_obj.department_id != self.current_user.department_id
                ):
                    raise AppError(
                        status_code=403,
                        code="forbidden",
                        message="Managers may only view employees within their own department.",
                    )

        status_val = (
            user_obj.status.value
            if hasattr(user_obj.status, "value")
            else str(user_obj.status)
        )

        return {
            "id": user_obj.id,
            "employee_code": user_obj.employee_code,
            "full_name": user_obj.full_name,
            "email": user_obj.email,
            "role_id": user_obj.role_id,
            "role_name": role_name or "employee",
            "department_id": user_obj.department_id,
            "department_name": dept_name,
            "manager_id": user_obj.manager_id,
            "manager_name": manager_name,
            "designation": user_obj.designation,
            "phone": user_obj.phone,
            "status": status_val,
            "date_of_joining": user_obj.date_of_joining,
            "date_of_exit": user_obj.date_of_exit,
            "created_at": user_obj.created_at,
        }
