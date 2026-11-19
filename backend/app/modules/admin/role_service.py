"""
Role Management Service.

Rosterly has a fixed set of six roles: they can't be created, deleted or
have their permissions edited from the app. This service lists the roles and
what each can do (read-only), and manages role conflicts — pairs of roles one
person may not hold together.
"""
import uuid
from typing import Optional
from uuid import UUID

from sqlalchemy import func, or_, select, union
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.core.role_policy import user_holds_role_ids
from app.core.security import CurrentUser, check_permission
from app.models.auth import Permission, Role, RoleConflict, RolePermission, User, UserRole
from app.models.system import AuditLog
from app.modules.admin.role_schemas import (
    RoleConflictsUpdateRequest,
    RoleRef,
    PermissionItemResponse,
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
        GET /roles:
        Returns all roles with user_count for each role.
        Access: super_admin only.
        """
        check_permission(self.current_user, "role", "read", self.db)

        # Holders = primary OR additional (multi-role).
        holders = union(
            select(User.id.label("user_id"), User.role_id.label("role_id")),
            select(UserRole.user_id, UserRole.role_id),
        ).subquery()
        rows = (
            self.db.query(Role, func.count(holders.c.user_id).label("user_count"))
            .outerjoin(holders, holders.c.role_id == Role.id)
            .group_by(Role.id)
            .order_by(Role.name.asc())
            .all()
        )
        conflicts = self._conflict_map()

        results: list[RoleResponse] = []
        for role, user_count in rows:
            results.append(
                RoleResponse(
                    id=role.id,
                    name=role.name,
                    description=role.description,
                    is_system_role=role.is_system_role,
                    user_count=user_count,
                    conflicts_with=conflicts.get(role.id, []),
                    created_at=role.created_at,
                )
            )
        return results

    def _conflict_map(self) -> dict[UUID, list[RoleRef]]:
        """role id -> roles it can't be combined with, both directions of each stored pair."""
        names = dict(self.db.query(Role.id, Role.name).all())
        out: dict[UUID, list[RoleRef]] = {}
        for c in self.db.query(RoleConflict).all():
            out.setdefault(c.role_id, []).append(RoleRef(id=c.conflicts_with_role_id, name=names[c.conflicts_with_role_id]))
            out.setdefault(c.conflicts_with_role_id, []).append(RoleRef(id=c.role_id, name=names[c.role_id]))
        for refs in out.values():
            refs.sort(key=lambda r: r.name)
        return out

    def replace_role_conflicts(self, role_id: UUID, payload: RoleConflictsUpdateRequest) -> list[RoleRef]:
        """
        PUT /roles/{id}/conflicts (multi-role): replace the roles this role
        can't be combined with. A new conflict is refused while anyone already
        holds both roles — resolve their roles first. super_admin and employee
        can't be additional roles anyway, so they need no entry. Audit-logged.
        Access: role:update.
        """
        check_permission(self.current_user, "role", "update", self.db)
        role = self.db.query(Role).filter(Role.id == role_id).first()
        if not role:
            raise NotFoundError(f"Role with ID '{role_id}' not found.")

        wanted = set(payload.role_ids) - {role.id}
        others = self.db.query(Role).filter(Role.id.in_(wanted)).all() if wanted else []
        if len(others) != len(wanted):
            raise NotFoundError("One or more roles were not found.")

        existing = (
            self.db.query(RoleConflict)
            .filter(or_(RoleConflict.role_id == role.id, RoleConflict.conflicts_with_role_id == role.id))
            .all()
        )
        current = {c.conflicts_with_role_id if c.role_id == role.id else c.role_id: c for c in existing}

        for other in others:
            if other.id in current:
                continue
            both = (
                self.db.query(func.count(User.id))
                .filter(user_holds_role_ids([role.id]), user_holds_role_ids([other.id]))
                .scalar()
            )
            if both:
                raise ConflictError(
                    f"{both} {'person holds' if both == 1 else 'people hold'} both '{role.name}' and "
                    f"'{other.name}'. Change their roles first."
                )
            self.db.add(RoleConflict(role_id=role.id, conflicts_with_role_id=other.id))
        for other_id, row in current.items():
            if other_id not in wanted:
                self.db.delete(row)

        names = dict(self.db.query(Role.id, Role.name).all())
        self.db.add(
            AuditLog(
                id=uuid.uuid4(),
                actor_id=self.current_user.user_id,
                action="role.conflicts_updated",
                entity_type="role",
                entity_id=role.id,
                before_state={"conflicts_with": sorted(names[i] for i in current)},
                after_state={"conflicts_with": sorted(r.name for r in others)},
                ip_address=self.ip_address,
            )
        )
        self.db.commit()
        return sorted((RoleRef(id=r.id, name=r.name) for r in others), key=lambda r: r.name)

    def get_role_permissions(self, role_id: UUID) -> RolePermissionsResponse:
        """
        GET /roles/{id}/permissions:
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
