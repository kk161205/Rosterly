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
from fastapi import Depends, Header
from jose import jwt, JWTError

from app.core.config import settings
from app.core.errors import AppError


class CurrentUser:
    """Populated from a validated, non-revoked session. Role is always the
    live DB value, never trusted from the JWT claim alone."""

    def __init__(self, user_id: str, role: str, session_id: str):
        self.user_id = user_id
        self.role = role
        self.session_id = session_id


async def get_current_user(authorization: str = Header(default=None)) -> CurrentUser:
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

    # --- Required next steps (project doc §2.2) ---
    # 1. session = db.query(Session).filter_by(access_token_jti=jti).first()
    #    if not session or session.revoked_at is not None: raise 401
    # 2. user = db.query(User).filter_by(id=sub).first()
    #    role = user.role.name  <-- live value, never payload["role"]
    # 3. session.last_seen_at = now(); db.commit()
    #
    # Raising here deliberately until the DB layer exists, so this can
    # never silently pass with a fake/hardcoded user — see rules.md §1.1.
    raise NotImplementedError(
        "Wire this up to the sessions/users tables before using this dependency. "
        "Do not stub a fake CurrentUser to unblock other work — build the DB layer first."
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
