"""
Role Management Service — PRD §5.13 (Role & Permission Management).
Handles role listing, creation, permission matrix queries, atomic permission
replacement, and role deletion with safety guards.
"""
import uuid
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.core.security import CurrentUser, check_permission
from app.models.auth import Permission, Role, RolePermission, User
from app.models.system import AuditLog
from app.schemas.roles import (
    PermissionItemResponse,
    RoleCreateRequest,
    RolePermissionsResponse,
    RoleResponse,
)


class RoleManagementService:
    def __init__(self, db: Session, current_user: CurrentUser, ip_address: Optional[str] = None):
        self.db = db
        self.current_user = current_user
        self.ip_address = ip_address or "127.0.0.1"

    def get_roles(self) -> list[RoleResponse]:
        """
        GET /roles (PRD §5.13):
        Returns all roles with user_count for each role.
        Access: super_admin only.
        """
        check_permission(self.current_user, "role", "read", self.db)

        rows = (
            self.db.query(Role, func.count(User.id).label("user_count"))
            .outerjoin(User, User.role_id == Role.id)
            .group_by(Role.id)
            .order_by(Role.name.asc())
            .all()
        )

        results: list[RoleResponse] = []
        for role, user_count in rows:
            results.append(
                RoleResponse(
                    id=role.id,
                    name=role.name,
                    description=role.description,
                    is_system_role=role.is_system_role,
                    user_count=user_count,
                    created_at=role.created_at,
                )
            )
        return results

    def create_role(self, payload: RoleCreateRequest) -> RoleResponse:
        """
        POST /roles (PRD §5.13):
        Creates a custom role.
        - Name must be unique (409 Conflict on duplicate).
        - is_system_role is always False.
        - Writes to audit_logs in same transaction.
        Access: super_admin only.
        """
        check_permission(self.current_user, "role", "create", self.db)

        clean_name = payload.name.strip()
        existing = (
            self.db.query(Role)
            .filter(func.lower(Role.name) == func.lower(clean_name))
            .first()
        )
        if existing:
            raise ConflictError(f"Role with name '{clean_name}' already exists.")

        new_role = Role(
            id=uuid.uuid4(),
            name=clean_name,
            description=payload.description.strip() if payload.description else None,
            is_system_role=False,
        )
        self.db.add(new_role)

        audit_log = AuditLog(
            id=uuid.uuid4(),
            actor_id=self.current_user.user_id,
            action="role.created",
            entity_type="role",
            entity_id=new_role.id,
            before_state=None,
            after_state={
                "name": new_role.name,
                "description": new_role.description,
                "is_system_role": False,
            },
            ip_address=self.ip_address,
        )
        self.db.add(audit_log)
        self.db.commit()
        self.db.refresh(new_role)

        return RoleResponse(
            id=new_role.id,
            name=new_role.name,
            description=new_role.description,
            is_system_role=new_role.is_system_role,
            user_count=0,
            created_at=new_role.created_at,
        )

    def get_role_permissions(self, role_id: UUID) -> RolePermissionsResponse:
        """
        GET /roles/{id}/permissions (PRD §5.13):
        Returns full permission matrix state for the specified role.
        Access: super_admin only.
        """
        check_permission(self.current_user, "role", "read", self.db)

        role = self.db.query(Role).filter(Role.id == role_id).first()
        if not role:
            raise NotFoundError(f"Role with ID '{role_id}' not found.")

        permissions = (
            self.db.query(Permission)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .filter(RolePermission.role_id == role_id)
            .order_by(Permission.resource.asc(), Permission.action.asc())
            .all()
        )

        perm_items = [
            PermissionItemResponse(
                id=p.id,
                resource=p.resource,
                action=p.action,
                description=p.description,
            )
            for p in permissions
        ]

        return RolePermissionsResponse(
            role_id=role.id,
            role_name=role.name,
            permissions=perm_items,
        )
