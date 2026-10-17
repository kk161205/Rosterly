"""
User Management Service — PRD §5.14 (User Management).
Handles user listing, search, creation, role change, status toggle,
force logout, session revocation, and assignable roles.
"""
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session, joinedload

from app.core.errors import AppError, ConflictError, ForbiddenError, NotFoundError
from app.core.security import CurrentUser, check_permission, get_password_hash
from app.models.auth import Department, Role, Session as SessionModel, User, UserStatus
from app.models.system import AuditLog
from app.schemas.auth import MessageResponse
from app.schemas.users import (
    AssignableRoleResponse,
    UserCreateRequest,
    UserListItemResponse,
    UserListResponse,
    UserResponse,
    UserRoleUpdateRequest,
    UserStatusUpdateRequest,
)


def invalidate_user_session_cache(user_id: UUID | str) -> None:
    """Invalidates session/user related caches upon revocation."""
    try:
        from app.services.dashboard_service import invalidate_dashboard_cache
        invalidate_dashboard_cache(str(user_id))
    except Exception:
        pass


class UserManagementService:
    def __init__(self, db: Session, current_user: CurrentUser, ip_address: Optional[str] = None):
        self.db = db
        self.current_user = current_user
        self.ip_address = ip_address or "127.0.0.1"

    def revoke_all_user_sessions(self, user_id: UUID) -> int:
        """
        Revokes all active sessions for target user and invalidates session cache.
        Zero-trust session revocation per PRD §2.4 and §5.14.
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
        invalidate_user_session_cache(user_id)
        return count

    def _generate_next_employee_code(self) -> str:
        """
        Generates a race-safe, unique employee code formatted as RST-XXXX.
        Supports both PostgreSQL sequences and SQLite autoincrement.
        """
        dialect_name = self.db.bind.dialect.name if self.db and self.db.bind else "sqlite"
        while True:
            if dialect_name == "postgresql":
                self.db.execute(text("CREATE SEQUENCE IF NOT EXISTS employee_code_seq START WITH 1 INCREMENT BY 1"))
                seq_num = self.db.execute(text("SELECT nextval('employee_code_seq')")).scalar()
            else:
                self.db.execute(text("CREATE TABLE IF NOT EXISTS employee_code_sequence (id INTEGER PRIMARY KEY AUTOINCREMENT)"))
                self.db.execute(text("INSERT INTO employee_code_sequence DEFAULT VALUES"))
                seq_num = self.db.execute(text("SELECT last_insert_rowid()")).scalar()

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
        GET /users (PRD §5.14):
        Query user accounts with search, role_id, status filters and pagination.
        Includes last_login_at. Never leaks password_hash.
        Access: super_admin, hr_admin.
        """
        check_permission(self.current_user, "user", "read", self.db)

        query = (
            self.db.query(User, Role.name.label("role_name"), Department.name.label("department_name"))
            .join(Role, Role.id == User.role_id)
            .outerjoin(Department, Department.id == User.department_id)
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
            query = query.filter(User.role_id == role_id)

        if status:
            clean_status = status.strip().lower()
            query = query.filter(User.status == clean_status)

        total = query.count()
        offset = (page - 1) * page_size
        rows = query.order_by(User.created_at.desc()).offset(offset).limit(page_size).all()

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
                    department_id=user.department_id,
                    department_name=dept_name,
                    designation=user.designation,
                    status=user.status.value if hasattr(user.status, "value") else str(user.status),
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
        GET /users/assignable-roles (PRD §5.14 addition):
        Returns roles that the current caller is permitted to assign.
        - super_admin: can assign all roles.
        - non-super_admin (hr_admin): cannot assign super_admin or it_admin.
        Access: super_admin, hr_admin.
        """
        check_permission(self.current_user, "user", "read", self.db)

        roles = self.db.query(Role).order_by(Role.name.asc()).all()
        is_super_admin = (self.current_user.role or "").lower() == "super_admin"

        results: list[AssignableRoleResponse] = []
        for r in roles:
            if not is_super_admin and r.name.lower() in ("super_admin", "it_admin"):
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

    def create_user(self, payload: UserCreateRequest) -> UserResponse:
        """
        POST /users (PRD §5.14):
        Creates a new user account in inactive/pending-invite status.
        - Non-super_admin callers receive 403 Forbidden if role_id resolves to super_admin or it_admin.
        - Email lowercased; 409 Conflict if duplicate.
        - Validates role_id and department_id exist.
        - Auto-generates race-safe unique employee_code.
        - Defaults designation and date_of_joining if omitted.
        - Does NOT set a plaintext password; sets inactive status and random unusable password hash.
        - Writes to audit_logs in same transaction.
        Access: super_admin, hr_admin.
        """
        check_permission(self.current_user, "user", "create", self.db)

        # Validate role exists
        target_role = self.db.query(Role).filter(Role.id == payload.role_id).first()
        if not target_role:
            raise NotFoundError(f"Role with ID '{payload.role_id}' not found.")

        # Explicit role-limited check: callers who are not super_admin cannot assign super_admin or it_admin
        is_super_admin = (self.current_user.role or "").lower() == "super_admin"
        if not is_super_admin and target_role.name.lower() in ("super_admin", "it_admin"):
            raise ForbiddenError(
                f"You do not have permission to assign the '{target_role.name}' role."
            )

        # Validate department if provided
        dept_name: Optional[str] = None
        if payload.department_id:
            dept = self.db.query(Department).filter(Department.id == payload.department_id).first()
            if not dept:
                raise NotFoundError(f"Department with ID '{payload.department_id}' not found.")
            dept_name = dept.name

        # Clean & validate email uniqueness
        clean_email = payload.email.strip().lower()
        existing_email = self.db.query(User.id).filter(func.lower(User.email) == clean_email).first()
        if existing_email:
            raise ConflictError(f"User with email '{clean_email}' already exists.")

        # Generate race-safe unique employee code
        employee_code = self._generate_next_employee_code()

        # Defaults for designation and date_of_joining
        designation = payload.designation.strip() if payload.designation else "Employee"
        date_of_joining = payload.date_of_joining or datetime.now(timezone.utc).date()

        # Set status=inactive pending invite set-password
        # TODO: Implement email invitation token and dispatch set-password email when invite system is built
        random_secret = secrets.token_urlsafe(32)
        password_hash = get_password_hash(random_secret)

        new_user = User(
            id=uuid.uuid4(),
            employee_code=employee_code,
            full_name=payload.full_name.strip(),
            email=clean_email,
            password_hash=password_hash,
            role_id=target_role.id,
            department_id=payload.department_id,
            designation=designation,
            status=UserStatus.inactive,
            date_of_joining=date_of_joining,
        )
        self.db.add(new_user)

        audit_log = AuditLog(
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
                "role_id": str(target_role.id),
                "role_name": target_role.name,
                "department_id": str(payload.department_id) if payload.department_id else None,
                "status": UserStatus.inactive.value,
            },
            ip_address=self.ip_address,
        )
        self.db.add(audit_log)
        self.db.commit()
        self.db.refresh(new_user)

        return UserResponse(
            id=new_user.id,
            employee_code=new_user.employee_code,
            full_name=new_user.full_name,
            email=new_user.email,
            role_id=new_user.role_id,
            role_name=target_role.name,
            department_id=new_user.department_id,
            department_name=dept_name,
            designation=new_user.designation,
            status=new_user.status.value if hasattr(new_user.status, "value") else str(new_user.status),
            last_login_at=new_user.last_login_at,
            created_at=new_user.created_at,
        )

    def update_user_role(self, user_id: UUID, payload: UserRoleUpdateRequest) -> UserResponse:
        """
        PATCH /users/{id}/role (PRD §5.14):
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
            .with_for_update()
            .first()
        )
        if not target_user:
            raise NotFoundError(f"User with ID '{user_id}' not found.")

        new_role = self.db.query(Role).filter(Role.id == payload.role_id).first()
        if not new_role:
            raise NotFoundError(f"Role with ID '{payload.role_id}' not found.")

        old_role_name = target_user.role.name if target_user.role else "unknown"
        old_role_id = target_user.role_id

        target_user.role_id = new_role.id

        # Zero-trust revocation of all active sessions for this user
        self.revoke_all_user_sessions(target_user.id)

        audit_log = AuditLog(
            id=uuid.uuid4(),
            actor_id=self.current_user.user_id,
            action="user.role_changed",
            entity_type="user",
            entity_id=target_user.id,
            before_state={"role_id": str(old_role_id), "role_name": old_role_name},
            after_state={"role_id": str(new_role.id), "role_name": new_role.name},
            ip_address=self.ip_address,
        )
        self.db.add(audit_log)
        self.db.commit()
        self.db.refresh(target_user)

        return UserResponse(
            id=target_user.id,
            employee_code=target_user.employee_code,
            full_name=target_user.full_name,
            email=target_user.email,
            role_id=target_user.role_id,
            role_name=new_role.name,
            department_id=target_user.department_id,
            department_name=target_user.department.name if target_user.department else None,
            designation=target_user.designation,
            status=target_user.status.value if hasattr(target_user.status, "value") else str(target_user.status),
            last_login_at=target_user.last_login_at,
            created_at=target_user.created_at,
        )

    def update_user_status(self, user_id: UUID, payload: UserStatusUpdateRequest) -> UserResponse:
        """
        PATCH /users/{id}/status (PRD §5.14):
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
            .with_for_update()
            .first()
        )
        if not target_user:
            raise NotFoundError(f"User with ID '{user_id}' not found.")

        # Non-super_admin callers cannot modify status of super_admin or it_admin users
        is_super_admin = (self.current_user.role or "").lower() == "super_admin"
        target_role_name = (target_user.role.name if target_user.role else "").lower()
        if not is_super_admin and target_role_name in ("super_admin", "it_admin"):
            raise ForbiddenError(
                f"You do not have permission to modify status of {target_role_name} users."
            )

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
        if clean_status == "inactive":
            self.revoke_all_user_sessions(target_user.id)

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

        return UserResponse(
            id=target_user.id,
            employee_code=target_user.employee_code,
            full_name=target_user.full_name,
            email=target_user.email,
            role_id=target_user.role_id,
            role_name=target_user.role.name if target_user.role else "unknown",
            department_id=target_user.department_id,
            department_name=target_user.department.name if target_user.department else None,
            designation=target_user.designation,
            status=target_user.status.value if hasattr(target_user.status, "value") else str(target_user.status),
            last_login_at=target_user.last_login_at,
            created_at=target_user.created_at,
        )

    def force_logout(self, user_id: UUID) -> MessageResponse:
        """
        POST /users/{id}/force-logout (PRD §5.14):
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
