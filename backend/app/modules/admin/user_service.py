"""
User Management service.
Handles user listing, search, creation, role change, status toggle,
force logout, session revocation, and assignable roles.
"""
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.errors import AppError, ConflictError, NotFoundError
from app.core.role_policy import (
    PRIVILEGED_ROLES,
    assert_can_assign_role,
    assert_can_manage_user,
    conflicting_pairs,
    is_super_admin,
    set_additional_roles,
    user_holds_role_ids,
    user_role_names,
    validate_role_set,
)
from app.core.security import (
    CurrentUser,
    check_permission,
    get_password_hash,
)
from app.core.approver_resolution import reroute_pending_steps
from app.core.password_tokens import issue_password_token, link_minutes, cancel_password_tokens
from app.models.auth import (
    Department,
    PasswordTokenPurpose,
    Permission,
    Role,
    RolePermission,
    Session as SessionModel,
    User,
    UserStatus,
)
from app.models.system import AuditLog
from app.modules.auth.schemas import MessageResponse
from app.modules.admin.user_schemas import (
    AccessPreviewPermission,
    AccessPreviewResponse,
    AssignableRoleResponse,
    RoleRef,
    SignInLinkResponse,
    UserListItemResponse,
    UserListResponse,
    UserResponse,
    UserRoleUpdateRequest,
    UserStatusUpdateRequest,
)
from app.modules.dashboard.service import invalidate_dashboard_cache
from app.modules.notifications.email import set_password_link
from app.modules.notifications.dispatch import notify_role_changed


class UserManagementService:
    def __init__(self, db: Session, current_user: CurrentUser, ip_address: Optional[str] = None):
        self.db = db
        self.current_user = current_user
        self.ip_address = ip_address or "127.0.0.1"

    def revoke_all_user_sessions(self, user_id: UUID) -> int:
        """
        Revokes all active sessions for target user and invalidates session cache.
        Zero-trust: a revoked session is refused on its very next request.
        """
        now = datetime.now(timezone.utc)
        count = (
            self.db.query(SessionModel)
            .filter(
                SessionModel.user_id == user_id,
                SessionModel.revoked_at.is_(None),
            )
            .update({"revoked_at": now}, synchronize_session=False)
        )
        invalidate_dashboard_cache(str(user_id))
        return count

    def _generate_next_employee_code(self) -> str:
        """
        Generates a race-safe, unique employee code formatted as RST-XXXX.
        PostgreSQL uses employee_code_seq (created by migration b3d5f7a9c1e2).
        SQLite test databases don't run migrations, so they count up from the
        current user total; the collision check below keeps codes unique.
        """
        dialect_name = self.db.bind.dialect.name if self.db and self.db.bind else "sqlite"
        fallback_num = self.db.query(func.count(User.id)).scalar() or 0
        while True:
            if dialect_name == "postgresql":
                seq_num = self.db.execute(text("SELECT nextval('employee_code_seq')")).scalar()
            else:
                fallback_num += 1
                seq_num = fallback_num

            code = f"RST-{int(seq_num):04d}"
            # Ensure no collision with seeded records
            exists = self.db.query(User.id).filter(User.employee_code == code).first()
            if not exists:
                return code

    def get_users(
        self,
        search: Optional[str] = None,
        role_id: Optional[UUID] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 25,
    ) -> UserListResponse:
        """
        GET /users:
        Query user accounts with search, role_id, status filters and pagination.
        Includes last_login_at. Never leaks password_hash.
        Access: super_admin, hr_admin.
        """
        check_permission(self.current_user, "user", "read", self.db)

        query = (
            self.db.query(User, Role.name.label("role_name"), Department.name.label("department_name"))
            .join(Role, Role.id == User.role_id)
            .outerjoin(Department, Department.id == User.department_id)
            .options(selectinload(User.additional_roles))
        )

        if search:
            term = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    User.full_name.ilike(term),
                    User.email.ilike(term),
                    User.employee_code.ilike(term),
                    User.designation.ilike(term),
                )
            )

        if role_id:
            query = query.filter(user_holds_role_ids([role_id]))

        if status:
            clean_status = status.strip().lower()
            allowed_statuses = {s.value for s in UserStatus}
            if clean_status not in allowed_statuses:
                raise AppError(
                    status_code=400,
                    code="validation_error",
                    message=f"Unknown status '{status}'.",
                    field_errors={"status": f"Must be one of: {', '.join(sorted(allowed_statuses))}"},
                )
            query = query.filter(User.status == UserStatus(clean_status))

        total = query.count()
        offset = (page - 1) * page_size
        rows = query.order_by(User.created_at.desc(), User.id.desc()).offset(offset).limit(page_size).all()

        items: list[UserListItemResponse] = []
        for user, role_name, dept_name in rows:
            items.append(
                UserListItemResponse(
                    id=user.id,
                    employee_code=user.employee_code,
                    full_name=user.full_name,
                    email=user.email,
                    role_id=user.role_id,
                    role_name=role_name,
                    additional_roles=[RoleRef(id=r.id, name=r.name) for r in user.additional_roles],
                    department_id=user.department_id,
                    department_name=dept_name,
                    designation=user.designation,
                    status=user.status.value if hasattr(user.status, "value") else str(user.status),
                    mfa_enabled=bool(user.mfa_enabled),
                    last_login_at=user.last_login_at,
                    created_at=user.created_at,
                )
            )

        return UserListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
        )

    def get_assignable_roles(self) -> list[AssignableRoleResponse]:
        """
        GET /users/assignable-roles:
        Returns roles that the current caller is permitted to assign.
        - super_admin: can assign all roles.
        - non-super_admin (hr_admin): cannot assign super_admin or it_admin.
        Access: super_admin, hr_admin.
        """
        check_permission(self.current_user, "user", "read", self.db)

        roles = self.db.query(Role).order_by(Role.name.asc()).all()
        caller_is_super_admin = is_super_admin(self.current_user)

        results: list[AssignableRoleResponse] = []
        for r in roles:
            if not caller_is_super_admin and r.name.lower() in PRIVILEGED_ROLES:
                continue
            results.append(
                AssignableRoleResponse(
                    id=r.id,
                    name=r.name,
                    description=r.description,
                    is_system_role=r.is_system_role,
                )
            )
        return results

    def create_account(
        self,
        *,
        full_name: str,
        email: str,
        role_id: Optional[UUID],
        department_id: Optional[UUID],
        manager_id: Optional[UUID],
        designation: str,
        date_of_joining,
        status: UserStatus,
    ) -> tuple[User, str]:
        """The one place accounts are created ("Add new joiner", bootstrap).

        Creates the user with an unusable random password, writes the audit row
        and issues a single-use set-password link. Returns (user, raw link token).
        Does not commit — the caller commits with the rest of its work.
        - Only super_admin may grant super_admin / it_admin.
        - The role defaults to `employee`.
        - Email must be unique (stored lower-case).
        """
        if role_id is None:
            target_role = self.db.query(Role).filter(Role.name == "employee").first()
        else:
            target_role = self.db.query(Role).filter(Role.id == role_id).first()
        if not target_role:
            raise NotFoundError("Role not found.")
        assert_can_assign_role(self.current_user, target_role.name)

        if department_id and not self.db.query(Department.id).filter(Department.id == department_id).first():
            raise NotFoundError("Department not found.")
        if manager_id and not self.db.query(User.id).filter(User.id == manager_id).first():
            raise NotFoundError("Manager not found.")

        clean_email = email.strip().lower()
        if self.db.query(User.id).filter(func.lower(User.email) == clean_email).first():
            raise ConflictError(f"Someone already has the email '{clean_email}'.")

        new_user = User(
            id=uuid.uuid4(),
            employee_code=self._generate_next_employee_code(),
            full_name=full_name.strip(),
            email=clean_email,
            password_hash=get_password_hash(secrets.token_urlsafe(32)),
            role_id=target_role.id,
            department_id=department_id,
            manager_id=manager_id,
            designation=designation.strip(),
            status=status,
            date_of_joining=date_of_joining,
        )
        self.db.add(new_user)
        self.db.add(
            AuditLog(
                id=uuid.uuid4(),
                actor_id=self.current_user.user_id,
                action="user.created",
                entity_type="user",
                entity_id=new_user.id,
                before_state=None,
                after_state={
                    "employee_code": new_user.employee_code,
                    "full_name": new_user.full_name,
                    "email": new_user.email,
                    "role_name": target_role.name,
                    "department_id": str(department_id) if department_id else None,
                    "manager_id": str(manager_id) if manager_id else None,
                    "status": status.value,
                },
                ip_address=self.ip_address,
            )
        )
        self.db.flush()
        token = issue_password_token(
            self.db, new_user.id, PasswordTokenPurpose.invite, created_by=self.current_user.user_id
        )
        return new_user, token

    def create_sign_in_link(self, user_id: UUID) -> SignInLinkResponse:
        """POST /users/{id}/sign-in-link.

        Creates a single-use set-password link for someone, shown once to the
        admin to hand over (email can't be sent while delivery is off). An
        account that has never signed in gets a 72-hour invite link (it also
        activates an invited account); anyone else a 15-minute reset link.
        A new link cancels the person's earlier unused ones. Audited.
        """
        check_permission(self.current_user, "user", "update", self.db)
        target = (
            self.db.query(User)
            .options(selectinload(User.role), selectinload(User.additional_roles))
            .filter(User.id == user_id)
            .first()
        )
        if not target:
            raise NotFoundError("User not found.")
        assert_can_manage_user(self.current_user, user_role_names(target))
        if target.status == UserStatus.terminated:
            raise ConflictError("This person has left; their account can't be signed in to.")

        purpose = PasswordTokenPurpose.invite if target.last_login_at is None else PasswordTokenPurpose.reset
        token = issue_password_token(self.db, target.id, purpose, created_by=self.current_user.user_id)
        self.db.add(
            AuditLog(
                id=uuid.uuid4(),
                actor_id=self.current_user.user_id,
                action="user.sign_in_link_created",
                entity_type="user",
                entity_id=target.id,
                before_state=None,
                after_state={"purpose": purpose.value},
                ip_address=self.ip_address,
            )
        )
        self.db.commit()
        return SignInLinkResponse(link=set_password_link(token), purpose=purpose.value, expires_in_minutes=link_minutes(purpose))

    def update_user_role(self, user_id: UUID, payload: UserRoleUpdateRequest) -> UserResponse:
        """
        PATCH /users/{id}/role:
        Assigns a new role to target user.
        - Locked with with_for_update().
        - Reject changing your own role (self-lockout protection).
        - Validates role exists.
        - Revokes all active sessions for target user immediately.
        - Writes to audit_logs in same transaction.
        Access: super_admin only.
        """
        check_permission(self.current_user, "user", "assign_role", self.db)

        # Self-role modification guard
        if str(user_id) == str(self.current_user.user_id):
            raise AppError(
                status_code=400,
                code="self_role_change_rejected",
                message="Cannot modify your own role to prevent self-lockout.",
            )

        target_user = (
            self.db.query(User)
            .options(joinedload(User.role), joinedload(User.department))
            .filter(User.id == user_id)
            # Lock only the users row: PostgreSQL rejects FOR UPDATE on the
            # nullable side of the eager-load outer joins.
            .with_for_update(of=User)
            .first()
        )
        if not target_user:
            raise NotFoundError(f"User with ID '{user_id}' not found.")

        new_role = self.db.query(Role).filter(Role.id == payload.role_id).first()
        if not new_role:
            raise NotFoundError(f"Role with ID '{payload.role_id}' not found.")

        current_extra = list(target_user.additional_roles)
        if payload.additional_role_ids is None:
            requested_extra = current_extra
        else:
            wanted = set(payload.additional_role_ids)
            requested_extra = self.db.query(Role).filter(Role.id.in_(wanted)).order_by(Role.name).all() if wanted else []
            missing = wanted - {r.id for r in requested_extra}
            if missing:
                raise NotFoundError(f"Role with ID '{next(iter(missing))}' not found.")

        # a user holding a privileged role (as any of their roles) can only
        # be changed by a super_admin; the same rule then checks every new role.
        assert_can_manage_user(self.current_user, user_role_names(target_user))
        extra = validate_role_set(self.db, self.current_user, new_role, requested_extra)

        old_role_name = target_user.role.name if target_user.role else "unknown"
        old_role_id = target_user.role_id
        old_extra_names = sorted(r.name for r in current_extra)
        new_extra_names = sorted(r.name for r in extra)

        if old_role_id == new_role.id and old_extra_names == new_extra_names:
            return self._user_response(target_user, new_role.name, extra)

        target_user.role_id = new_role.id
        set_additional_roles(self.db, target_user, extra, self.current_user.user_id)

        # Zero-trust revocation of all active sessions for this user
        self.revoke_all_user_sessions(target_user.id)

        # critical account_updated notification to the affected user
        notify_role_changed(self.db, target_user.id, " + ".join([new_role.name, *new_extra_names]))

        audit_log = AuditLog(
            id=uuid.uuid4(),
            actor_id=self.current_user.user_id,
            action="user.role_changed",
            entity_type="user",
            entity_id=target_user.id,
            before_state={
                "role_id": str(old_role_id),
                "role_name": old_role_name,
                "additional_roles": old_extra_names,
            },
            after_state={
                "role_id": str(new_role.id),
                "role_name": new_role.name,
                "additional_roles": new_extra_names,
            },
            ip_address=self.ip_address,
        )
        self.db.add(audit_log)
        self.db.commit()
        self.db.refresh(target_user)
        return self._user_response(target_user, new_role.name, extra)

    def _user_response(self, user: User, role_name: str, extra: list) -> UserResponse:
        return UserResponse(
            id=user.id,
            employee_code=user.employee_code,
            full_name=user.full_name,
            email=user.email,
            role_id=user.role_id,
            role_name=role_name,
            additional_roles=[RoleRef(id=r.id, name=r.name) for r in extra],
            department_id=user.department_id,
            department_name=user.department.name if user.department else None,
            designation=user.designation,
            status=user.status.value if hasattr(user.status, "value") else str(user.status),
            last_login_at=user.last_login_at,
            created_at=user.created_at,
        )

    def access_preview(self, role_ids: list[UUID]) -> AccessPreviewResponse:
        """
        GET /users/access-preview (multi-role): the merged permission set
        a combination of roles gives — each permission once, with the roles that
        grant it — plus any configured conflicts among them. Lets the Access
        page show exactly what saving would grant, computed by the same tables
        check_permission() enforces against. Access: user:assign_role.
        """
        check_permission(self.current_user, "user", "assign_role", self.db)
        roles = self.db.query(Role).filter(Role.id.in_(set(role_ids))).all() if role_ids else []
        if not roles:
            return AccessPreviewResponse(permissions=[], conflicts=[])

        rows = (
            self.db.query(Permission.resource, Permission.action, Permission.description, Role.name)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(Role, Role.id == RolePermission.role_id)
            .filter(Role.id.in_([r.id for r in roles]))
            .order_by(Permission.resource, Permission.action, Role.name)
            .all()
        )
        merged: dict[str, AccessPreviewPermission] = {}
        for resource, action, description, role_name in rows:
            key = f"{resource}:{action}"
            if key not in merged:
                merged[key] = AccessPreviewPermission(permission=key, description=description, roles=[])
            merged[key].roles.append(role_name)

        conflicts = [sorted([a.name, b.name]) for a, b in conflicting_pairs(self.db, roles)]
        return AccessPreviewResponse(permissions=list(merged.values()), conflicts=conflicts)

    def update_user_status(self, user_id: UUID, payload: UserStatusUpdateRequest) -> UserResponse:
        """
        PATCH /users/{id}/status:
        Updates account status: accepts only 'active' or 'inactive'.
        - Non-super_admin callers cannot change status of super_admin or it_admin users.
        - Cannot deactivate own account (self-deactivation protection).
        - Never reactivates terminated or offboarding users.
        - Transitioning to inactive revokes all active sessions immediately.
        - Writes to audit_logs in same transaction.
        Access: super_admin, hr_admin.
        """
        check_permission(self.current_user, "user", "update", self.db)

        clean_status = payload.status.strip().lower()
        if clean_status not in ("active", "inactive"):
            raise AppError(
                status_code=400,
                code="invalid_status",
                message="Account status can only be updated to 'active' or 'inactive'.",
            )

        target_user = (
            self.db.query(User)
            .options(joinedload(User.role), joinedload(User.department))
            .filter(User.id == user_id)
            # Lock only the users row: PostgreSQL rejects FOR UPDATE on the
            # nullable side of the eager-load outer joins.
            .with_for_update(of=User)
            .first()
        )
        if not target_user:
            raise NotFoundError(f"User with ID '{user_id}' not found.")

        # only super_admin may change a super_admin / it_admin user's status
        assert_can_manage_user(self.current_user, user_role_names(target_user))

        # Self-deactivation guard
        if str(user_id) == str(self.current_user.user_id) and clean_status != "active":
            raise AppError(
                status_code=400,
                code="self_deactivation_rejected",
                message="Cannot deactivate your own account.",
            )

        # Never reactivate offboarding or terminated users
        current_status_val = target_user.status.value if hasattr(target_user.status, "value") else str(target_user.status)
        if current_status_val in ("terminated", "offboarding"):
            raise AppError(
                status_code=400,
                code="invalid_status_transition",
                message=f"Cannot change status of user in '{current_status_val}' status.",
            )

        old_status = current_status_val
        target_user.status = UserStatus(clean_status)

        # If transitioning to inactive, immediately revoke all active sessions
        # and move any request steps waiting on them to HR.
        if clean_status == "inactive":
            self.revoke_all_user_sessions(target_user.id)
            reroute_pending_steps(self.db, target_user.id)
            cancel_password_tokens(self.db, target_user.id)

        audit_log = AuditLog(
            id=uuid.uuid4(),
            actor_id=self.current_user.user_id,
            action="user.status_changed",
            entity_type="user",
            entity_id=target_user.id,
            before_state={"status": old_status},
            after_state={"status": clean_status},
            ip_address=self.ip_address,
        )
        self.db.add(audit_log)
        self.db.commit()
        self.db.refresh(target_user)

        return self._user_response(
            target_user, target_user.role.name if target_user.role else "unknown", list(target_user.additional_roles)
        )

    def force_logout(self, user_id: UUID) -> MessageResponse:
        """
        POST /users/{id}/force-logout:
        Revokes all active sessions across all devices for target user and invalidates session cache.
        404 if user not found.
        Writes to audit_logs in same transaction.
        Access: super_admin only.
        """
        check_permission(self.current_user, "user", "force_logout", self.db)

        target_user = self.db.query(User).filter(User.id == user_id).first()
        if not target_user:
            raise NotFoundError(f"User with ID '{user_id}' not found.")

        revoked_count = self.revoke_all_user_sessions(target_user.id)

        audit_log = AuditLog(
            id=uuid.uuid4(),
            actor_id=self.current_user.user_id,
            action="user.force_logout",
            entity_type="user",
            entity_id=target_user.id,
            before_state=None,
            after_state={"revoked_sessions_count": revoked_count},
            ip_address=self.ip_address,
        )
        self.db.add(audit_log)
        self.db.commit()

        return MessageResponse(message=f"All active sessions for user {target_user.email} have been revoked.")
