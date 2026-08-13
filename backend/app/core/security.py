"""
Zero-trust session enforcement — project doc §2.

CRITICAL: this is the piece rules.md §5 rule 1 explicitly warns against
simplifying. Every authenticated request must:
  1. Verify JWT signature and expiry (standard)
  2. Look up the session by access_token_jti — reject if revoked, even if
     the JWT itself is still technically valid
  3. Re-fetch the user's CURRENT role_id from the DB (not the JWT claim)
     for any permission check
  4. Update sessions.last_seen_at

Do not skip steps 2-3 "for now and add it later" — a role change or a
forced logout must take effect on the very next request, not on next
login. That guarantee only holds if this is built correctly from day one.

TODO (agent): implement against the actual `sessions` and `users` models
once app/models/ exists. This file defines the shape/contract; the DB
calls are intentionally left as the first real task, not stubbed with
fake data (see rules.md §1.1 — same principle applies to backend TODOs:
don't fake it, wire it to the real table once it exists).
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import Depends, Header
from jose import jwt, JWTError
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.errors import AppError
from app.db.session import get_db
from app.models.auth import Session as SessionModel, User, UserStatus


class CurrentUser:
    """Populated from a validated, non-revoked session. Role is always the
    live DB value, never trusted from the JWT claim alone."""

    def __init__(
        self,
        user_id: UUID | str,
        role: str,
        session_id: UUID | str,
        department_id: UUID | str | None = None,
        email: str | None = None,
        full_name: str | None = None,
        role_id: UUID | str | None = None,
    ):
        self.user_id = UUID(str(user_id)) if isinstance(user_id, str) else user_id
        self.role = role
        self.session_id = UUID(str(session_id)) if isinstance(session_id, str) else session_id
        self.department_id = UUID(str(department_id)) if department_id and isinstance(department_id, str) else department_id
        self.email = email
        self.full_name = full_name
        self.role_id = UUID(str(role_id)) if role_id and isinstance(role_id, str) else role_id


async def get_current_user(
    authorization: str = Header(default=None),
    db: Session = Depends(get_db),
) -> CurrentUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise AppError(401, "unauthenticated", "Missing or invalid Authorization header")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise AppError(401, "unauthenticated", "Invalid or expired token")

    jti = payload.get("jti")
    sub = payload.get("sub")
    if not jti or not sub:
        raise AppError(401, "unauthenticated", "Malformed token")

    # 1. Look up session by access_token_jti
    session_row = db.query(SessionModel).filter(SessionModel.access_token_jti == jti).first()
    if not session_row or session_row.revoked_at is not None:
        raise AppError(401, "unauthenticated", "Session is invalid or revoked")

    # 2. Fetch live user & current role from DB (never trust JWT claim alone)
    try:
        sub_uuid = UUID(sub) if isinstance(sub, str) else sub
    except ValueError:
        raise AppError(401, "unauthenticated", "Invalid user ID in token")

    user = (
        db.query(User)
        .options(joinedload(User.role))
        .filter(User.id == sub_uuid)
        .first()
    )
    if not user or user.status in (UserStatus.inactive, UserStatus.terminated):
        raise AppError(401, "unauthenticated", "User account is inactive or disabled")

    if not user.role:
        raise AppError(401, "unauthenticated", "User role not assigned")

    # 3. Update session last_seen_at
    session_row.last_seen_at = datetime.now(timezone.utc)
    db.commit()

    return CurrentUser(
        user_id=user.id,
        role=user.role.name,
        session_id=session_row.id,
        department_id=user.department_id,
        email=user.email,
        full_name=user.full_name,
        role_id=user.role_id,
    )


def require_role(*allowed_roles: str):
    """Route-level role check — project doc §3.2 step 2. Still requires the
    attribute (ABAC) scope check to be applied separately inside the handler
    where relevant (e.g. manager department scoping) — this only covers the
    role/permission layer, not the full §3.2 chain."""

    async def checker(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise AppError(403, "forbidden", "You do not have permission to access this resource")
        return current_user

    return checker

