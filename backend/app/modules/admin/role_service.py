"""
Role Management Service — PRD §5.13 (Role & Permission Management).
Handles role listing, creation, permission matrix queries, atomic permission
replacement, and role deletion with safety guards.
"""
import uuid
from typing import Optional
from uuid import UUID

from sqlalchemy import func, or_, select, union
from sqlalchemy.orm import Session

from app.core.errors import AppError, ConflictError, NotFoundError
from app.core.role_policy import user_holds_role_ids
from app.core.security import CurrentUser, check_permission
from app.models.auth import Permission, Role, RoleConflict, RolePermission, User, UserRole
from app.models.lifecycle import ChecklistItem
from app.models.requests import ApprovalChainStep, RequestApproval
from app.models.system import AuditLog
from app.modules.admin.role_schemas import (
    RoleConflictsUpdateRequest,
    RoleRef,
    PermissionItemResponse,
    RoleCreateRequest,
    RolePermissionsResponse,
    RolePermissionsUpdateRequest,
    RoleResponse,
)

CORE_SUPER_ADMIN_PERMISSIONS = {
    ("role", "read"),
    ("role", "create"),
    ("role", "update"),
    ("role", "delete"),
    ("user", "read"),
    ("user", "create"),
    ("user", "update"),
    ("user", "assign_role"),
    ("user", "force_logout"),
}


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

        # Holders = primary OR additional (§5.14 multi-role).
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
        PUT /roles/{id}/conflicts (§5.14 multi-role): replace the roles this role
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

    def list_permissions(self) -> list[PermissionItemResponse]:
        """
        GET /permissions (PRD §5.13):
        Every permission in the system — the rows of the permission matrix.
        The matrix needs these IDs to grant a permission a role doesn't have yet
        (GET /roles/{id}/permissions only returns the role's current grants).
        Access: super_admin only.
        """
        check_permission(self.current_user, "role", "read", self.db)

        permissions = (
            self.db.query(Permission)
            .order_by(Permission.resource.asc(), Permission.action.asc())
            .all()
        )
        return [
            PermissionItemResponse(
                id=p.id,
                resource=p.resource,
                action=p.action,
                description=p.description,
            )
            for p in permissions
        ]

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

    def replace_role_permissions(
        self, role_id: UUID, payload: RolePermissionsUpdateRequest
    ) -> RolePermissionsResponse:
        """
        PUT /roles/{id}/permissions (PRD §5.13):
        Full replace of role_permissions for that role in one atomic transaction.
        - Row-locks the role with with_for_update().
        - Validates all permission IDs exist (400 if any invalid).
        - Lockout protection: rejects removing core role or user management permissions from super_admin.
        - Allows an empty list for non-super_admin roles.
        - Writes to audit_logs with before and after states in same transaction.
        - Changes take effect on the next request with no re-login.
        Access: super_admin only.
        """
        check_permission(self.current_user, "role", "update", self.db)

        # Row-lock target role
        role = self.db.query(Role).filter(Role.id == role_id).with_for_update().first()
        if not role:
            raise NotFoundError(f"Role with ID '{role_id}' not found.")

        unique_perm_ids = list(dict.fromkeys(payload.permission_ids))

        # Validate permission IDs exist
        requested_perms: list[Permission] = []
        if unique_perm_ids:
            requested_perms = (
                self.db.query(Permission)
                .filter(Permission.id.in_(unique_perm_ids))
                .all()
            )
            if len(requested_perms) != len(unique_perm_ids):
                found_ids = {p.id for p in requested_perms}
                missing_ids = [str(pid) for pid in unique_perm_ids if pid not in found_ids]
                raise AppError(
                    status_code=400,
                    code="invalid_permission_ids",
                    message=f"One or more permission IDs do not exist: {', '.join(missing_ids)}",
                )

        # Lockout protection for super_admin role
        if role.name == "super_admin":
            new_grants = {(p.resource, p.action) for p in requested_perms}
            missing_core = CORE_SUPER_ADMIN_PERMISSIONS - new_grants
            if missing_core:
                missing_str = ", ".join(f"{r}:{a}" for r, a in sorted(missing_core))
                raise AppError(
                    status_code=400,
                    code="lockout_protection",
                    message=(
                        f"Lockout protection: cannot remove core role or user management "
                        f"permissions from super_admin ({missing_str})."
                    ),
                )

        # Fetch before state
        current_grants = (
            self.db.query(Permission.resource, Permission.action)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .filter(RolePermission.role_id == role_id)
            .order_by(Permission.resource.asc(), Permission.action.asc())
            .all()
        )
        before_state = [f"{r}:{a}" for r, a in current_grants]

        # Atomic replacement: delete old, insert new
        self.db.query(RolePermission).filter(RolePermission.role_id == role_id).delete(
            synchronize_session=False
        )

        for pid in unique_perm_ids:
            self.db.add(RolePermission(role_id=role_id, permission_id=pid))

        after_state = [f"{p.resource}:{p.action}" for p in sorted(requested_perms, key=lambda x: (x.resource, x.action))]

        audit_log = AuditLog(
            id=uuid.uuid4(),
            actor_id=self.current_user.user_id,
            action="role.permissions_updated",
            entity_type="role",
            entity_id=role_id,
            before_state={"permissions": before_state},
            after_state={"permissions": after_state},
            ip_address=self.ip_address,
        )
        self.db.add(audit_log)
        self.db.commit()

        perm_items = [
            PermissionItemResponse(
                id=p.id,
                resource=p.resource,
                action=p.action,
                description=p.description,
            )
            for p in requested_perms
        ]

        return RolePermissionsResponse(
            role_id=role.id,
            role_name=role.name,
            permissions=perm_items,
        )

    def delete_role(self, role_id: UUID) -> None:
        """
        DELETE /roles/{id} (PRD §5.13):
        Deletes a role with strict safety guards.
        - 409 Conflict if role is a system role (is_system_role=True).
        - 409 Conflict if referenced by any users row.
        - 409 Conflict if referenced by any approval_chain_steps row.
        - 409 Conflict if referenced by any checklist_items row.
        - Writes to audit_logs in same transaction.
        Access: super_admin only.
        """
        check_permission(self.current_user, "role", "delete", self.db)

        role = self.db.query(Role).filter(Role.id == role_id).with_for_update().first()
        if not role:
            raise NotFoundError(f"Role with ID '{role_id}' not found.")

        # Guard 1: System roles cannot be deleted
        if role.is_system_role:
            raise ConflictError("System roles cannot be deleted.")

        # Guard 2: Any users row references the role
        user_count = self.db.query(func.count(User.id)).filter(user_holds_role_ids([role_id])).scalar()
        if user_count and user_count > 0:
            raise ConflictError(
                f"Cannot delete role '{role.name}': referenced by {user_count} user(s)."
            )

        # Guard 3: Any approval_chain_steps row references the role
        step_count = (
            self.db.query(func.count(ApprovalChainStep.id))
            .filter(ApprovalChainStep.approver_role_id == role_id)
            .scalar()
        )
        if step_count and step_count > 0:
            raise ConflictError(
                f"Cannot delete role '{role.name}': referenced by {step_count} approval chain step(s)."
            )

        # Guard 4: Any request_approvals row routes to the role's queue
        # (FK is ON DELETE RESTRICT — without this guard the delete would fail as a 500)
        approval_count = (
            self.db.query(func.count(RequestApproval.id))
            .filter(RequestApproval.approver_role_id == role_id)
            .scalar()
        )
        if approval_count and approval_count > 0:
            raise ConflictError(
                f"Cannot delete role '{role.name}': referenced by {approval_count} request approval step(s)."
            )

        # Guard 5: Any checklist_items row references the role
        checklist_item_count = (
            self.db.query(func.count(ChecklistItem.id))
            .filter(ChecklistItem.owner_role_id == role_id)
            .scalar()
        )
        if checklist_item_count and checklist_item_count > 0:
            raise ConflictError(
                f"Cannot delete role '{role.name}': referenced by {checklist_item_count} checklist item(s)."
            )

        audit_log = AuditLog(
            id=uuid.uuid4(),
            actor_id=self.current_user.user_id,
            action="role.deleted",
            entity_type="role",
            entity_id=role_id,
            before_state={
                "name": role.name,
                "description": role.description,
                "is_system_role": role.is_system_role,
            },
            after_state=None,
            ip_address=self.ip_address,
        )
        self.db.add(audit_log)

        # Delete role (role_permissions CASCADE on foreign key)
        self.db.delete(role)
        self.db.commit()
