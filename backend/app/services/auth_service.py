import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.errors import (
    AccountLockedError,
    AppError,
    UnauthenticatedError,
    ValidationAppError,
)
from app.core.security import (
    consume_mfa_challenge,
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    get_password_hash,
    hash_refresh_token,
    invalidate_session_cache,
    is_forgot_password_rate_limited,
    mark_reset_token_used,
    peek_mfa_challenge,
    register_mfa_challenge,
    verify_password,
    verify_password_reset_token,
)
from app.models.auth import LoginAttempt, Session as SessionModel, User, UserStatus
from app.schemas.auth import LoginResponse, MessageResponse, TokenResponse

logger = logging.getLogger(__name__)


def login(
    db: DBSession,
    email: str,
    password: str,
    device_fingerprint: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> LoginResponse:
    now = datetime.now(timezone.utc)
    fifteen_mins_ago = now - timedelta(minutes=15)

    # 1. Lockout check: 5 failed attempts in last 15 mins
    failed_attempts_count = (
        db.query(LoginAttempt)
        .filter(
            LoginAttempt.email_attempted == email,
            LoginAttempt.success == False,  # noqa: E712
            LoginAttempt.created_at >= fifteen_mins_ago,
        )
        .count()
    )

    if failed_attempts_count >= 5:
        attempt = LoginAttempt(
            email_attempted=email,
            success=False,
            failure_reason="account_locked",
            device_fingerprint=device_fingerprint,
            ip_address=ip_address,
        )
        db.add(attempt)
        db.commit()
        raise AccountLockedError()

    # 2. User lookup
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.password_hash):
        attempt = LoginAttempt(
            user_id=user.id if user else None,
            email_attempted=email,
            success=False,
            failure_reason="invalid_credentials",
            device_fingerprint=device_fingerprint,
            ip_address=ip_address,
        )
        db.add(attempt)
        db.commit()
        raise UnauthenticatedError("Invalid email or password", code="invalid_credentials")

    # 3. Check active status
    if user.status != UserStatus.active:
        attempt = LoginAttempt(
            user_id=user.id,
            email_attempted=email,
            success=False,
            failure_reason="user_inactive",
            device_fingerprint=device_fingerprint,
            ip_address=ip_address,
        )
        db.add(attempt)
        db.commit()
        raise UnauthenticatedError("User account is inactive or disabled", code="account_disabled")

    # 4. MFA Check
    if user.mfa_enabled:
        mfa_session_id = str(uuid.uuid4())
        register_mfa_challenge(mfa_session_id, user.id)
        attempt = LoginAttempt(
            user_id=user.id,
            email_attempted=email,
            success=True,
            failure_reason="mfa_required",
            device_fingerprint=device_fingerprint,
            ip_address=ip_address,
        )
        db.add(attempt)
        db.commit()
        return LoginResponse(mfa_required=True, mfa_session_id=mfa_session_id)

    # 5. Successful login — issue tokens & session
    role_name = user.role.name if user.role else "employee"
    access_token, jti = create_access_token(user.id, role_name)
    raw_refresh_token, refresh_hash = create_refresh_token()
    expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    session = SessionModel(
        user_id=user.id,
        refresh_token_hash=refresh_hash,
        access_token_jti=jti,
        device_fingerprint=device_fingerprint,
        ip_address=ip_address,
        user_agent=user_agent,
        issued_at=now,
        expires_at=expires_at,
        last_seen_at=now,
    )
    db.add(session)
    user.last_login_at = now

    attempt = LoginAttempt(
        user_id=user.id,
        email_attempted=email,
        success=True,
        device_fingerprint=device_fingerprint,
        ip_address=ip_address,
    )
    db.add(attempt)
    db.commit()

    return LoginResponse(
        access_token=access_token,
        refresh_token=raw_refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        token_type="bearer",
        mfa_required=False,
    )


def verify_mfa(
    db: DBSession,
    mfa_session_id: str,
    code: str,
    device_fingerprint: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> TokenResponse:
    # NOTE: no real SMS/TOTP provider is wired up yet (needs a provider credential
    # decision — rules.md §4.5), so the verification code itself is still the fixed
    # "123456" dev value. What this function DOES guarantee is that completing MFA
    # can only ever issue a session for the specific user who triggered this exact
    # mfa_session_id — that binding is looked up below, not inferred from whichever
    # login attempt happened to be most recent.
    user_id = peek_mfa_challenge(mfa_session_id)
    if not user_id:
        raise UnauthenticatedError("MFA session expired or invalid", code="mfa_invalid")

    if code != "123456":
        raise UnauthenticatedError("Invalid MFA verification code", code="mfa_invalid")

    # Code confirmed correct — now consume the challenge so it can't be replayed.
    consume_mfa_challenge(mfa_session_id)

    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.status != UserStatus.active:
        raise UnauthenticatedError("User inactive or missing", code="account_disabled")

    now = datetime.now(timezone.utc)
    role_name = user.role.name if user.role else "employee"
    access_token, jti = create_access_token(user.id, role_name)
    raw_refresh_token, refresh_hash = create_refresh_token()
    expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    session = SessionModel(
        user_id=user.id,
        refresh_token_hash=refresh_hash,
        access_token_jti=jti,
        device_fingerprint=device_fingerprint,
        ip_address=ip_address,
        user_agent=user_agent,
        issued_at=now,
        expires_at=expires_at,
        last_seen_at=now,
    )
    db.add(session)
    user.last_login_at = now
    db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        token_type="bearer",
    )


def refresh_tokens(db: DBSession, raw_refresh_token: str) -> TokenResponse:
    refresh_hash = hash_refresh_token(raw_refresh_token)
    session = db.query(SessionModel).filter(SessionModel.refresh_token_hash == refresh_hash).first()

    if not session or session.revoked_at is not None:
        raise UnauthenticatedError("Invalid or revoked refresh token", code="token_invalid")

    now = datetime.now(timezone.utc)
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at <= now:
        raise UnauthenticatedError("Refresh token has expired", code="token_expired")

    user = db.query(User).filter(User.id == session.user_id).first()
    if not user or user.status != UserStatus.active:
        raise UnauthenticatedError("User account is inactive", code="account_disabled")

    # Rotate tokens per PRD §2.3
    role_name = user.role.name if user.role else "employee"
    new_access_token, new_jti = create_access_token(user.id, role_name)
    new_raw_refresh, new_refresh_hash = create_refresh_token()

    old_jti = session.access_token_jti
    session.access_token_jti = new_jti
    session.refresh_token_hash = new_refresh_hash
    session.expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    session.last_seen_at = now
    db.commit()
    invalidate_session_cache(jti=old_jti, session_id=session.id)

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_raw_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        token_type="bearer",
    )


def forgot_password(db: DBSession, email: str) -> MessageResponse:
    # Always return the same 200 message regardless of user existence or rate
    # limiting (PRD §5.1) — never let the response shape reveal either signal.
    if is_forgot_password_rate_limited(email):
        return MessageResponse(
            message="If an account with that email exists, a password reset link has been sent."
        )

    user = db.query(User).filter(User.email == email).first()
    if user:
        reset_token = create_password_reset_token(user.id)
        # Never log the raw token (rules.md §5.3) — identifiers only.
        logger.info(f"Password reset requested for user_id={user.id}")

    return MessageResponse(
        message="If an account with that email exists, a password reset link has been sent."
    )


def reset_password(db: DBSession, token: str, new_password: str) -> MessageResponse:
    result = verify_password_reset_token(token)
    if not result:
        raise ValidationAppError("Invalid or expired password reset token")
    user_id_str, jti = result

    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        raise ValidationAppError("Invalid reset token payload")

    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise ValidationAppError("User not found")

    user.password_hash = get_password_hash(new_password)
    mark_reset_token_used(jti)

    # PRD §2.4 & §5.1: password change triggers logout-all-devices
    logout_all_user_sessions(db, str(user.id))

    db.commit()
    return MessageResponse(message="Password has been reset successfully.")


def logout_session(db: DBSession, session_id: uuid.UUID | str) -> MessageResponse:
    try:
        session_uuid = uuid.UUID(str(session_id)) if not isinstance(session_id, uuid.UUID) else session_id
    except (ValueError, AttributeError):
        raise AppError(400, "invalid_id", "Invalid session ID format")

    session = db.query(SessionModel).filter(SessionModel.id == session_uuid).first()
    if session:
        session.revoked_at = datetime.now(timezone.utc)
        db.commit()
        invalidate_session_cache(session_id=session.id, jti=session.access_token_jti)

    return MessageResponse(message="Logged out successfully.")


def logout_all_user_sessions(db: DBSession, user_id: uuid.UUID | str) -> MessageResponse:
    try:
        user_uuid = uuid.UUID(str(user_id)) if not isinstance(user_id, uuid.UUID) else user_id
    except (ValueError, AttributeError):
        raise AppError(400, "invalid_id", "Invalid user ID format")

    now = datetime.now(timezone.utc)
    active_sessions = (
        db.query(SessionModel)
        .filter(
            SessionModel.user_id == user_uuid,
            SessionModel.revoked_at.is_(None),
        )
        .all()
    )
    for session in active_sessions:
        session.revoked_at = now
    db.commit()
    invalidate_session_cache(user_id=user_uuid)

    return MessageResponse(message="All sessions have been revoked.")
