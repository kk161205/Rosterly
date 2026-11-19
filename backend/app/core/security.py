"""
Zero-trust session enforcement.

Every authenticated request MUST:
  1. Verify JWT signature and expiry (standard)
  2. Look up the session by access_token_jti — reject if revoked, even if
     the JWT itself is still technically valid
  3. Re-fetch the user's CURRENT role_id from the DB (not the JWT claim)
     for any permission check
  4. Update sessions.last_seen_at
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from collections.abc import Iterable
from typing import Optional

import bcrypt
from fastapi import Depends, Header, Request
from jose import JWTError, jwt
from sqlalchemy.orm import Session as DBSession, joinedload

from app.core.company_settings import get_setting
from app.core.config import settings
from app.core.errors import ForbiddenError, UnauthenticatedError
from app.db.session import get_db
from app.models.auth import (
    Permission,
    Role,
    RolePermission,
    Session as SessionModel,
    User as UserModel,
    SIGN_IN_STATUSES,
)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    password_bytes = plain_password.encode("utf-8")[:72]
    hashed_bytes = hashed_password.encode("utf-8")
    try:
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    password_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_access_token(
    user_id: uuid.UUID | str,
    role: str,
    jti: Optional[str] = None,
    expires_delta: Optional[timedelta] = None,
) -> tuple[str, str]:
    token_jti = jti or str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    payload = {
        "sub": str(user_id),
        "role": role,
        "jti": token_jti,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    encoded_jwt = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt, token_jti


def create_refresh_token() -> tuple[str, str]:
    raw_token = secrets.token_urlsafe(48)
    token_hash = hash_refresh_token(raw_token)
    return raw_token, token_hash


class CurrentUser:
    """Populated from a validated, non-revoked session. Roles are always the
    live DB values, never trusted from the JWT claim alone.

    Multi-role: `role` / `role_id` are the PRIMARY role (display, the
    dashboard's title); `role_names` / `role_ids` are every role held — primary
    plus additional. Access decisions use the sets: `has_role(...)` for
    scoping, `role_ids` for permission grants and role-queue matching.
    """

    def __init__(
        self,
        user_id: uuid.UUID | str,
        role: str,
        session_id: uuid.UUID | str,
        email: Optional[str] = None,
        department_id: Optional[uuid.UUID | str] = None,
        full_name: Optional[str] = None,
        role_id: Optional[uuid.UUID | str] = None,
        role_names: Optional[Iterable[str]] = None,
        role_ids: Optional[Iterable[uuid.UUID | str]] = None,
        mfa_enabled: bool = False,
        mfa_setup_required: bool = False,
        mfa_required_by_company: bool = False,
    ):
        self.mfa_required_by_company = mfa_required_by_company
        self.mfa_enabled = mfa_enabled
        self.mfa_setup_required = mfa_setup_required
        self.user_id = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id
        self.role = role
        self.session_id = uuid.UUID(str(session_id)) if isinstance(session_id, str) else session_id
        self.email = email
        self.department_id = uuid.UUID(str(department_id)) if department_id and isinstance(department_id, str) else department_id
        self.full_name = full_name
        self.role_id = uuid.UUID(str(role_id)) if role_id and isinstance(role_id, str) else role_id
        names = {(n or "").lower() for n in (role_names or ())} | {(role or "").lower()}
        self.role_names: frozenset[str] = frozenset(n for n in names if n)
        ids = {uuid.UUID(str(i)) for i in (role_ids or ())}
        if self.role_id:
            ids.add(self.role_id)
        self.role_ids: frozenset[uuid.UUID] = frozenset(ids)

    def has_role(self, *names: str) -> bool:
        """Whether ANY role held (primary or additional) is one of `names`."""
        return any(n in self.role_names for n in names)

    def holds_role_id(self, role_id: uuid.UUID | str | None) -> bool:
        """Whether a role-queue step / checklist owner role is one of ours."""
        return role_id is not None and uuid.UUID(str(role_id)) in self.role_ids


# Roles the "require two-step sign-in for admins" company setting covers.
MFA_POLICY_ROLES = frozenset({"super_admin", "hr_admin", "it_admin", "auditor"})
# What someone who must set up two-step sign-in can still reach.
_MFA_SETUP_PATHS = frozenset(
    f"{settings.API_V1_PREFIX}/auth/{p}" for p in ("me", "mfa/setup", "mfa/enable", "logout", "logout-all-devices")
)


def get_current_user(
    request: Request,
    authorization: str = Header(default=None),
    db: DBSession = Depends(get_db),
) -> CurrentUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthenticatedError("Missing or invalid Authorization header")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise UnauthenticatedError("Invalid or expired token") from None

    jti = payload.get("jti")
    sub = payload.get("sub")
    if not jti or not sub:
        raise UnauthenticatedError("Malformed token")

    # 1. Zero-trust check: Lookup session, user and live role in ONE single query.
    # No caching here — requires revocation to take effect on the very next
    # request, not after some TTL, so every request re-checks revoked_at live.
    session = (
        db.query(SessionModel)
        .options(
            joinedload(SessionModel.user).joinedload(UserModel.role),
            joinedload(SessionModel.user).selectinload(UserModel.additional_roles),
        )
        .filter(SessionModel.access_token_jti == jti)
        .first()
    )
    if not session or session.revoked_at is not None:
        raise UnauthenticatedError("Session has been revoked or is invalid")

    now = datetime.now(timezone.utc)
    if session.expires_at is not None:
        expires_at = session.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= now:
            raise UnauthenticatedError("Session has expired")

    user = session.user
    if not user:
        raise UnauthenticatedError("User no longer exists")

    if user.status not in SIGN_IN_STATUSES:
        raise UnauthenticatedError("User account is inactive or disabled")

    # Live role name from DB
    live_role = user.role.name if user.role else "employee"

    # 3. Update last_seen_at with throttling (60s) to avoid expensive DB write & commit on every GET request
    last_seen = session.last_seen_at
    if last_seen is None or (now - (last_seen.replace(tzinfo=timezone.utc) if last_seen.tzinfo is None else last_seen)).total_seconds() > 60:
        session.last_seen_at = now
        db.commit()

    held = {live_role, *(r.name for r in user.additional_roles)}
    mfa_required_by_company = bool(held & MFA_POLICY_ROLES) and bool(
        get_setting(db, "security.require_mfa_for_admins")
    )
    mfa_setup_required = mfa_required_by_company and not user.mfa_enabled
    if mfa_setup_required and request.url.path not in _MFA_SETUP_PATHS:
        raise ForbiddenError(
            "Your company requires two-step sign-in for your role. Set it up to continue.",
            code="mfa_setup_required",
        )

    return CurrentUser(
        user_id=user.id,
        role=live_role,
        session_id=session.id,
        email=user.email,
        department_id=user.department_id,
        full_name=user.full_name,
        role_id=user.role_id,
        role_names=[r.name for r in user.additional_roles],
        role_ids=[r.id for r in user.additional_roles],
        mfa_enabled=user.mfa_enabled,
        mfa_setup_required=mfa_setup_required,
        mfa_required_by_company=mfa_required_by_company,
    )


def check_permission(
    current_user: CurrentUser,
    resource: str,
    action: str,
    db: DBSession,
) -> None:
    """Role/permission check — step 2.

    Queries `role_permissions` joined to `permissions` for the caller's live
    `role_id` (never a cached/JWT-claimed role — `current_user.role_id` is
    populated fresh per-request by get_current_user() above, per the
    zero-trust model). Raises ForbiddenError if no matching
    (resource, action) grant exists for the caller's role.

    This replaces the old hardcoded `current_user.role in (...)` string
    comparisons scattered across the service modules (the
    former require_role() dependency below was defined but never called
    anywhere, i.e. dead code, and has been removed rather than left
    alongside this real implementation).

    Only covers the RBAC/permission step. Attribute (ABAC) scoping — e.g.
    "manager scoped to their own department", "user whose role matches this
    specific checklist item's owner_role_id" — is a separate, later check
    (step 3) that callers apply themselves after this passes; it is
    not expressible as a static (resource, action) grant and is therefore
    out of scope for this helper by design.
    """
    if not has_permission(current_user, resource, action, db):
        raise ForbiddenError("You do not have permission to do this")


def has_permission(
    current_user: CurrentUser,
    resource: str,
    action: str,
    db: DBSession,
) -> bool:
    """Whether any of the caller's live roles holds (resource, action) — the
    query behind check_permission(), for callers that branch instead of
    rejecting (e.g. the Inbox only shows sections the caller can act on).
    Multi-role: a grant on the primary OR any additional role counts.
    No roles at all = an empty IN, which matches nothing."""
    grant = (
        db.query(RolePermission)
        .join(Permission, Permission.id == RolePermission.permission_id)
        .filter(
            RolePermission.role_id.in_(list(current_user.role_ids)),
            Permission.resource == resource,
            Permission.action == action,
        )
        .first()
    )
    return grant is not None


def roles_granting(current_user: CurrentUser, resource: str, action: str, db: DBSession) -> set[str]:
    """Names of the caller's roles that grant (resource, action). For scoping
    rules that fall back to "any other role with the permission sees it all":
    a grant that only arrives via a narrowly-scoped role (employee, manager)
    must not unlock the company-wide view (multi-role)."""
    if not current_user.role_ids:
        return set()
    rows = (
        db.query(Role.name)
        .join(RolePermission, RolePermission.role_id == Role.id)
        .join(Permission, Permission.id == RolePermission.permission_id)
        .filter(
            Role.id.in_(list(current_user.role_ids)),
            Permission.resource == resource,
            Permission.action == action,
        )
        .all()
    )
    return {name.lower() for (name,) in rows}


def get_effective_permissions(role_ids: Iterable[uuid.UUID], db: DBSession) -> list[str]:
    """Union of every grant across `role_ids`, each permission once
    (shared permissions are kept as one, the rest are merged)."""
    ids = list(role_ids)
    if not ids:
        return []
    grants = (
        db.query(Permission.resource, Permission.action)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .filter(RolePermission.role_id.in_(ids))
        .distinct()
        .order_by(Permission.resource, Permission.action)
        .all()
    )
    return [f"{resource}:{action}" for resource, action in grants]
