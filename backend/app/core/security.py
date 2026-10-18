"""
Zero-trust session enforcement — project doc §2.

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
import time
import uuid
from datetime import datetime, timedelta, timezone
from threading import Lock
from collections.abc import Iterable
from typing import Optional

import bcrypt
from fastapi import Depends, Header
from jose import JWTError, jwt
from sqlalchemy.orm import Session as DBSession, joinedload

from app.core.config import settings
from app.core.errors import ForbiddenError, UnauthenticatedError
from app.db.session import get_db
from app.models.auth import (
    Permission,
    Role,
    RolePermission,
    Session as SessionModel,
    User as UserModel,
    UserStatus,
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


RESET_TOKEN_PURPOSE = "reset"
INVITE_TOKEN_PURPOSE = "invite"


def create_password_reset_token(
    user_id: uuid.UUID | str,
    purpose: str = RESET_TOKEN_PURPOSE,
) -> str:
    """Set-password token. purpose="reset" (forgot password, 15 min) or
    purpose="invite" (§5.14 account invite, INVITE_TOKEN_EXPIRE_HOURS) — an
    invite token also activates the invited account when it is used."""
    now = datetime.now(timezone.utc)
    if purpose == INVITE_TOKEN_PURPOSE:
        expire = now + timedelta(hours=settings.INVITE_TOKEN_EXPIRE_HOURS)
    else:
        expire = now + timedelta(minutes=15)
    payload = {
        "sub": str(user_id),
        "type": "password_reset",
        "purpose": purpose,
        "jti": str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def verify_password_reset_token(token: str) -> Optional[tuple[str, str, str, int]]:
    """Returns (user_id, jti, purpose, exp) if the token is structurally valid,
    unexpired, and not yet consumed. Caller (auth_service.reset_password) is
    responsible for marking the jti consumed via mark_reset_token_used() once
    the password is actually reset."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "password_reset":
            return None
        jti = payload.get("jti")
        sub = payload.get("sub")
        if not jti or not sub:
            return None
        if is_reset_token_used(jti):
            return None
        return sub, jti, payload.get("purpose", RESET_TOKEN_PURPOSE), int(payload["exp"])
    except (JWTError, KeyError, TypeError, ValueError):
        return None


# MFA challenge binding — maps a one-time mfa_session_id to the specific user
# who triggered it, so verify_mfa() can never complete a different user's login.
# In-memory only (Phase 1); a multi-worker deployment would need this in Redis/DB.
_MFA_CHALLENGES: dict[str, tuple[uuid.UUID, float]] = {}
_MFA_CHALLENGES_LOCK = Lock()
_MFA_CHALLENGE_TTL_SECONDS = 600.0  # 10 minutes


def register_mfa_challenge(mfa_session_id: str, user_id: uuid.UUID) -> None:
    with _MFA_CHALLENGES_LOCK:
        _MFA_CHALLENGES[mfa_session_id] = (user_id, time.time() + _MFA_CHALLENGE_TTL_SECONDS)


def peek_mfa_challenge(mfa_session_id: str) -> Optional[uuid.UUID]:
    """Returns the bound user_id without consuming it, so a wrong code can be retried."""
    with _MFA_CHALLENGES_LOCK:
        entry = _MFA_CHALLENGES.get(mfa_session_id)
    if not entry:
        return None
    user_id, expires_at = entry
    if time.time() > expires_at:
        return None
    return user_id


def consume_mfa_challenge(mfa_session_id: str) -> Optional[uuid.UUID]:
    """Pops and returns the bound user_id if the challenge exists and hasn't expired.
    Single-use: call only once the code has been verified correct."""
    with _MFA_CHALLENGES_LOCK:
        entry = _MFA_CHALLENGES.pop(mfa_session_id, None)
    if not entry:
        return None
    user_id, expires_at = entry
    if time.time() > expires_at:
        return None
    return user_id


# Password-reset single-use tracking — records consumed token jtis so a leaked/
# forwarded reset link can't be replayed a second time within its validity window.
_USED_RESET_TOKENS: dict[str, float] = {}
_USED_RESET_TOKENS_LOCK = Lock()


def is_reset_token_used(jti: str) -> bool:
    with _USED_RESET_TOKENS_LOCK:
        expires_at = _USED_RESET_TOKENS.get(jti)
        if expires_at is None:
            return False
        if time.time() > expires_at:
            del _USED_RESET_TOKENS[jti]
            return False
        return True


def mark_reset_token_used(jti: str, token_exp: int) -> None:
    """Remembers a consumed jti until the token itself expires (15 min for a
    reset, INVITE_TOKEN_EXPIRE_HOURS for an invite), so it can't be replayed."""
    with _USED_RESET_TOKENS_LOCK:
        _USED_RESET_TOKENS[jti] = float(token_exp)


# Forgot-password rate limiting — sliding window per email, so a single address
# can't be used to spam token generation / log volume.
_FORGOT_PASSWORD_ATTEMPTS: dict[str, list[float]] = {}
_FORGOT_PASSWORD_LOCK = Lock()
_FORGOT_PASSWORD_WINDOW_SECONDS = 900.0  # 15 minutes
_FORGOT_PASSWORD_MAX_ATTEMPTS = 3


def is_forgot_password_rate_limited(email: str) -> bool:
    now = time.time()
    key = email.lower()
    with _FORGOT_PASSWORD_LOCK:
        attempts = [t for t in _FORGOT_PASSWORD_ATTEMPTS.get(key, []) if now - t < _FORGOT_PASSWORD_WINDOW_SECONDS]
        limited = len(attempts) >= _FORGOT_PASSWORD_MAX_ATTEMPTS
        if not limited:
            attempts.append(now)
        _FORGOT_PASSWORD_ATTEMPTS[key] = attempts
        return limited


class CurrentUser:
    """Populated from a validated, non-revoked session. Roles are always the
    live DB values, never trusted from the JWT claim alone.

    Multi-role (§5.14): `role` / `role_id` are the PRIMARY role (display, the
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
    ):
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


def get_current_user(
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
    # No caching here — §2.2 requires revocation to take effect on the very next
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

    if user.status != UserStatus.active:
        raise UnauthenticatedError("User account is inactive or disabled")

    # Live role name from DB
    live_role = user.role.name if user.role else "employee"

    # 3. Update last_seen_at with throttling (60s) to avoid expensive DB write & commit on every GET request
    last_seen = session.last_seen_at
    if last_seen is None or (now - (last_seen.replace(tzinfo=timezone.utc) if last_seen.tzinfo is None else last_seen)).total_seconds() > 60:
        session.last_seen_at = now
        db.commit()

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
    )


def check_permission(
    current_user: CurrentUser,
    resource: str,
    action: str,
    db: DBSession,
) -> None:
    """Role/permission check — project doc §3.2 step 2.

    Queries `role_permissions` joined to `permissions` for the caller's live
    `role_id` (never a cached/JWT-claimed role — `current_user.role_id` is
    populated fresh per-request by get_current_user() above, per the
    zero-trust model in §2). Raises ForbiddenError if no matching
    (resource, action) grant exists for the caller's role.

    This replaces the old hardcoded `current_user.role in (...)` string
    comparisons scattered across the service modules (rules.md §1.2 — the
    former require_role() dependency below was defined but never called
    anywhere, i.e. dead code, and has been removed rather than left
    alongside this real implementation).

    Only covers the RBAC/permission step. Attribute (ABAC) scoping — e.g.
    "manager scoped to their own department", "user whose role matches this
    specific checklist item's owner_role_id" — is a separate, later check
    (§3.2 step 3) that callers apply themselves after this passes; it is
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
    Multi-role: a grant on the primary OR any additional role counts (§5.14).
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
    must not unlock the company-wide view (§5.14 multi-role)."""
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
    """Union of every grant across `role_ids`, each permission once (§5.14:
    shared permissions are kept as one, the rest are merged)."""
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


def get_role_permissions(role_id: uuid.UUID, db: DBSession) -> list[str]:
    """
    Live role_permissions ⋈ permissions lookup for a role — the same source of
    truth check_permission() enforces against, exposed here for GET /auth/me
    (§5.1) to populate the full `permissions[]` list the client needs to
    correctly hide/disable UI elements (§3.2: the frontend's RBAC is UI
    convenience only, but it still needs to know its own permission set).
    Returned as "resource:action" strings.
    """
    grants = (
        db.query(Permission.resource, Permission.action)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .filter(RolePermission.role_id == role_id)
        .all()
    )
    return [f"{resource}:{action}" for resource, action in grants]
