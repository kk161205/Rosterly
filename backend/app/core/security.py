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
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

import bcrypt
from fastapi import Depends, Header
from jose import JWTError, jwt
from sqlalchemy.orm import Session as DBSession, joinedload

from app.core.config import settings
from app.core.errors import ForbiddenError, UnauthenticatedError
from app.db.session import get_db
from app.models.auth import Session as SessionModel, User as UserModel, UserStatus


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
) -> Tuple[str, str]:
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


def create_refresh_token() -> Tuple[str, str]:
    raw_token = secrets.token_urlsafe(48)
    token_hash = hash_refresh_token(raw_token)
    return raw_token, token_hash


def create_password_reset_token(user_id: uuid.UUID | str) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=15)
    payload = {
        "sub": str(user_id),
        "type": "password_reset",
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def verify_password_reset_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "password_reset":
            return None
        return payload.get("sub")
    except JWTError:
        return None


class CurrentUser:
    """Populated from a validated, non-revoked session. Role is always the
    live DB value, never trusted from the JWT claim alone."""

    def __init__(
        self,
        user_id: uuid.UUID | str,
        role: str,
        session_id: uuid.UUID | str,
        email: Optional[str] = None,
        department_id: Optional[uuid.UUID | str] = None,
        full_name: Optional[str] = None,
        role_id: Optional[uuid.UUID | str] = None,
    ):
        self.user_id = uuid.UUID(str(user_id)) if isinstance(user_id, str) else user_id
        self.role = role
        self.session_id = uuid.UUID(str(session_id)) if isinstance(session_id, str) else session_id
        self.email = email
        self.department_id = uuid.UUID(str(department_id)) if department_id and isinstance(department_id, str) else department_id
        self.full_name = full_name
        self.role_id = uuid.UUID(str(role_id)) if role_id and isinstance(role_id, str) else role_id


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
        raise UnauthenticatedError("Invalid or expired token")

    jti = payload.get("jti")
    sub = payload.get("sub")
    if not jti or not sub:
        raise UnauthenticatedError("Malformed token")

    # 1. Zero-trust check: Lookup session, user and live role in ONE single query
    session = (
        db.query(SessionModel)
        .options(joinedload(SessionModel.user).joinedload(UserModel.role))
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
    )


def require_role(*allowed_roles: str):
    """Route-level role check — project doc §3.2 step 2."""

    def checker(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise ForbiddenError("You do not have permission to access this resource")
        return current_user

    return checker
