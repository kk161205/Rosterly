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

    def patch_employee_profile(
        self, employee_id: UUID, payload: EmployeeProfileUpdateRequest
    ) -> dict[str, Any]:
        """
        Update employee profile details with strict field-level access control (PRD §5.4).

        - Manager / IT Admin / Auditor -> 403 Forbidden
        - Self (Employee) -> Can only update 'phone'. Any restricted field or 'address' -> 400 Bad Request
        - HR Admin / Super Admin -> Can update full_name, designation, department_id, role_id, status, manager_id, phone
        """
        user_role = (self.current_user.role or "").lower()
        if user_role in ("manager", "it_admin", "auditor"):
            raise AppError(
                status_code=403,
                code="forbidden",
                message=f"Role '{user_role}' is not permitted to update employee profiles.",
            )

        target_user = self.db.query(User).filter(User.id == employee_id).first()
        if not target_user:
            raise AppError(status_code=404, code="not_found", message="Employee not found.")

        set_fields = payload.model_dump(exclude_unset=True)

        is_self = str(self.current_user.user_id) == str(employee_id) or user_role == "employee"

        if is_self:
            if str(self.current_user.user_id) != str(employee_id):
                raise AppError(
                    status_code=403,
                    code="forbidden",
                    message="Employees may only update their own profile.",
                )

            # Reject address explicitly if present
            if "address" in set_fields:
                raise AppError(
                    status_code=400,
                    code="bad_request",
                    message="Address field storage is not supported by database schema. Profile update rejected.",
                )

            # Validate that self only updates allowed field ('phone')
            allowed_self_fields = {"phone"}
            restricted_fields = set(set_fields.keys()) - allowed_self_fields
            if restricted_fields:
                restricted_field = sorted(list(restricted_fields))[0]
                raise AppError(
                    status_code=400,
                    code="bad_request",
                    message=f"Self role may only update phone. Restricted field '{restricted_field}' requires HR/Admin permissions.",
                )

        # Rejection of address field for HR/Admin as well since DB column does not exist
        if "address" in set_fields:
            raise AppError(
                status_code=400,
                code="bad_request",
                message="Address field storage is not supported by database schema.",
            )

        # Apply updates based on payload
        if "phone" in set_fields:
            target_user.phone = (payload.phone or "").strip() or None

        if user_role in ("hr_admin", "super_admin"):
            if "full_name" in set_fields and payload.full_name is not None:
                name_clean = payload.full_name.strip()
                if name_clean:
                    target_user.full_name = name_clean

            if "designation" in set_fields and payload.designation is not None:
                desig_clean = payload.designation.strip()
                if desig_clean:
                    target_user.designation = desig_clean

            if "department_id" in set_fields:
                if payload.department_id is not None:
                    dept = (
                        self.db.query(Department)
                        .filter(Department.id == payload.department_id)
                        .first()
                    )
                    if not dept:
                        raise AppError(
                            status_code=404,
                            code="not_found",
                            message="Department not found.",
                        )
                    target_user.department_id = dept.id
                else:
                    target_user.department_id = None

            if "role_id" in set_fields:
                if payload.role_id is not None:
                    role_obj = (
                        self.db.query(Role)
                        .filter(Role.id == payload.role_id)
                        .first()
                    )
                    if not role_obj:
                        raise AppError(
                            status_code=404,
                            code="not_found",
                            message="Role not found.",
                        )
                    target_user.role_id = role_obj.id

            if "status" in set_fields and payload.status is not None:
                target_user.status = payload.status

            if "manager_id" in set_fields:
                if payload.manager_id is not None:
                    if str(payload.manager_id) == str(employee_id):
                        raise AppError(
                            status_code=400,
                            code="bad_request",
                            message="An employee cannot be their own manager.",
                        )
                    mgr_user = (
                        self.db.query(User)
                        .filter(User.id == payload.manager_id)
                        .first()
                    )
                    if not mgr_user:
                        raise AppError(
                            status_code=404,
                            code="not_found",
                            message="Manager user not found.",
                        )
                    target_user.manager_id = mgr_user.id
                else:
                    target_user.manager_id = None

        self.db.commit()
        self.db.refresh(target_user)
        invalidate_session_cache()

        return self.get_employee_profile(employee_id=employee_id)

