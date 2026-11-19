import logging
import uuid
import secrets
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
from app.core.password_tokens import consume_password_token, issue_password_token
from app.core.rate_limit import hit as rate_limit_hit
from app.core.mfa import create_challenge, load_challenge, verify_user_code
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    hash_refresh_token,
    verify_password,
)
from app.models.auth import (
    MfaChallenge,
    SIGN_IN_STATUSES,
    LoginAttempt,
    PasswordTokenPurpose,
    Session as SessionModel,
    User,
    UserStatus,
)
from app.models.system import AuditLog
from app.modules.auth.schemas import LoginResponse, MessageResponse, TokenResponse
from app.modules.notifications.email import email_delivery_available, send_password_reset_email

logger = logging.getLogger(__name__)


def _recent_failures(db: DBSession, email: str, now: Optional[datetime] = None) -> int:
    """Genuine credential and code failures for this email in the last 15 minutes. Attempts
    refused *because* the account was locked don't count, or a locked client would keep
    re-arming its own lock."""
    since = (now or datetime.now(timezone.utc)) - timedelta(minutes=15)
    return (
        db.query(LoginAttempt)
        .filter(
            LoginAttempt.email_attempted == email,
            LoginAttempt.success == False,  # noqa: E712
            LoginAttempt.failure_reason != "account_locked",
            LoginAttempt.created_at >= since,
        )
        .count()
    )


_DUMMY: list[str] = []


def _dummy_hash() -> str:
    """A real bcrypt hash to check against when the email has no account."""
    if not _DUMMY:
        _DUMMY.append(get_password_hash(secrets.token_urlsafe(16)))
    return _DUMMY[0]


def login(
    db: DBSession,
    email: str,
    password: str,
    device_fingerprint: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> LoginResponse:
    now = datetime.now(timezone.utc)

    # 1. Lockout check: 5 failed attempts in last 15 mins. Attempts rejected
    # *because* the account was already locked (failure_reason=account_locked)
    # are excluded from this count — otherwise a client that keeps hitting
    # /auth/login while locked would keep re-arming its own trailing window
    # and could stay locked out indefinitely. Only genuine credential/MFA
    # failures should trigger or extend a lock.
    failed_attempts_count = _recent_failures(db, email, now)

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
    password_ok = verify_password(password, user.password_hash if user else _dummy_hash())
    if not user or not password_ok:
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
    if user.status not in SIGN_IN_STATUSES:
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

    # 4. Two-step sign-in: the password was right; the code comes next.
    if user.mfa_enabled:
        challenge = create_challenge(db, user.id)
        db.add(
            LoginAttempt(
                user_id=user.id,
                email_attempted=email,
                success=True,
                failure_reason="mfa_required",
                device_fingerprint=device_fingerprint,
                ip_address=ip_address,
            )
        )
        db.commit()
        return LoginResponse(mfa_required=True, mfa_session_id=challenge)

    # 5. Successful login — issue tokens & session
    db.add(
        LoginAttempt(
            user_id=user.id,
            email_attempted=email,
            success=True,
            device_fingerprint=device_fingerprint,
            ip_address=ip_address,
        )
    )
    tokens = _issue_session(db, user, device_fingerprint, ip_address, user_agent)
    return LoginResponse(**tokens.model_dump(), mfa_required=False)


def _issue_session(
    db: DBSession,
    user: User,
    device_fingerprint: Optional[str],
    ip_address: Optional[str],
    user_agent: Optional[str],
) -> TokenResponse:
    """Creates the zero-trust session row and its tokens. Commits."""
    now = datetime.now(timezone.utc)
    role_name = user.role.name if user.role else "employee"
    access_token, jti = create_access_token(user.id, role_name)
    raw_refresh_token, refresh_hash = create_refresh_token()
    db.add(
        SessionModel(
            user_id=user.id,
            refresh_token_hash=refresh_hash,
            access_token_jti=jti,
            device_fingerprint=device_fingerprint,
            ip_address=ip_address,
            user_agent=user_agent,
            issued_at=now,
            expires_at=now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            last_seen_at=now,
        )
    )
    user.last_login_at = now
    db.commit()
    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        token_type="bearer",
    )


def verify_mfa(
    db: DBSession,
    mfa_session_id: str,
    code: str,
    device_fingerprint: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> TokenResponse:
    """POST /auth/mfa/verify: the 6-digit code from the person's
    authenticator app, or one of their recovery codes. A challenge allows 5
    tries in 10 minutes; each wrong code counts toward the account lockout."""
    challenge = load_challenge(db, mfa_session_id)
    if challenge is None:
        raise UnauthenticatedError("This sign-in has expired. Enter your password again.", code="mfa_invalid")

    # The same lockout as the password step: every wrong code is a failed attempt for this
    # email, so five wrong codes in 15 minutes — across all open challenges — lock the account.
    email_of = db.query(User.email).filter(User.id == challenge.user_id).scalar()
    if email_of and _recent_failures(db, email_of) >= 5:
        db.query(MfaChallenge).filter(MfaChallenge.user_id == challenge.user_id, MfaChallenge.consumed_at.is_(None)).update(
            {MfaChallenge.consumed_at: datetime.now(timezone.utc)}, synchronize_session=False
        )
        db.add(LoginAttempt(user_id=challenge.user_id, email_attempted=email_of, success=False, failure_reason="account_locked",
                            device_fingerprint=device_fingerprint, ip_address=ip_address))
        db.commit()
        raise AccountLockedError()

    user = db.query(User).filter(User.id == challenge.user_id).first()
    if not user or user.status not in SIGN_IN_STATUSES or not user.mfa_enabled:
        challenge.consumed_at = datetime.now(timezone.utc)
        db.commit()
        raise UnauthenticatedError("User inactive or missing", code="account_disabled")

    if not verify_user_code(db, user, code):
        challenge.attempts += 1
        db.add(
            LoginAttempt(
                user_id=user.id,
                email_attempted=user.email,
                success=False,
                failure_reason="mfa_failed",
                device_fingerprint=device_fingerprint,
                ip_address=ip_address,
            )
        )
        db.commit()
        raise UnauthenticatedError("That code didn't work. Check your authenticator app and try again.", code="mfa_invalid")

    challenge.consumed_at = datetime.now(timezone.utc)
    db.add(
        LoginAttempt(
            user_id=user.id,
            email_attempted=user.email,
            success=True,
            device_fingerprint=device_fingerprint,
            ip_address=ip_address,
        )
    )
    return _issue_session(db, user, device_fingerprint, ip_address, user_agent)


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
    if not user or user.status not in SIGN_IN_STATUSES:
        raise UnauthenticatedError("User account is inactive", code="account_disabled")

    # Rotate tokens
    role_name = user.role.name if user.role else "employee"
    new_access_token, new_jti = create_access_token(user.id, role_name)
    new_raw_refresh, new_refresh_hash = create_refresh_token()

    session.access_token_jti = new_jti
    session.refresh_token_hash = new_refresh_hash
    session.expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    session.last_seen_at = now
    db.commit()

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_raw_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        token_type="bearer",
    )


FORGOT_PASSWORD_LIMIT = 3
FORGOT_PASSWORD_WINDOW_SECONDS = 900

SENT_MESSAGE = "If an account with that email exists, a password reset link has been sent."
ASK_ADMIN_MESSAGE = "Email isn't set up here yet. Ask your HR or IT admin to create a reset link for you."


def forgot_password(db: DBSession, email: str) -> MessageResponse:
    """emails a single-use, 15-minute reset link to active accounts. The
    response never reveals whether the account exists or was rate limited.
    While email delivery is off, it says so plainly instead of claiming a
    link was sent (admins create reset links from Users)."""
    if not email_delivery_available():
        return MessageResponse(message=ASK_ADMIN_MESSAGE)

    if rate_limit_hit(db, f"forgot:{email}", FORGOT_PASSWORD_LIMIT, FORGOT_PASSWORD_WINDOW_SECONDS):
        return MessageResponse(message=SENT_MESSAGE)

    user = db.query(User).filter(User.email == email).first()
    if user and user.status in SIGN_IN_STATUSES:
        token = issue_password_token(db, user.id, PasswordTokenPurpose.reset)
        db.commit()
        send_password_reset_email(user.email, user.full_name, token)
        # Never log the raw token — identifiers only.
        logger.info("Password reset requested for user_id=%s", user.id)

    return MessageResponse(message=SENT_MESSAGE)


def reset_password(db: DBSession, token: str, new_password: str, ip_address: str) -> MessageResponse:
    """sets a new password from a reset or invite link (single use) and
    signs the person out everywhere. An invite link also activates an
    invited account that has never signed in."""
    record = consume_password_token(db, token)
    if record is None:
        raise ValidationAppError("This link is invalid, already used or expired. Ask for a new one.")

    user = db.query(User).filter(User.id == record.user_id).first()
    if not user:
        raise ValidationAppError("This link is invalid, already used or expired. Ask for a new one.")

    user.password_hash = get_password_hash(new_password)

    # invite acceptance: an invited account (created inactive, never
    # signed in) becomes active when its invite link is used. A deliberately
    # deactivated account (has signed in before) is never reactivated this way.
    if (
        record.purpose == PasswordTokenPurpose.invite
        and user.status == UserStatus.inactive
        and user.last_login_at is None
    ):
        user.status = UserStatus.active
        db.add(
            AuditLog(
                id=uuid.uuid4(),
                actor_id=user.id,
                action="user.invite_accepted",
                entity_type="user",
                entity_id=user.id,
                before_state={"status": UserStatus.inactive.value},
                after_state={"status": UserStatus.active.value},
                ip_address=ip_address,
            )
        )

    # &: password change triggers logout-all-devices
    logout_all_user_sessions(db, str(user.id))

    db.commit()
    return MessageResponse(message="Password has been reset successfully.")


def logout_session(db: DBSession, session_id: uuid.UUID | str) -> MessageResponse:
    try:
        session_uuid = uuid.UUID(str(session_id)) if not isinstance(session_id, uuid.UUID) else session_id
    except (ValueError, AttributeError):
        raise AppError(400, "invalid_id", "Invalid session ID format") from None

    session = db.query(SessionModel).filter(SessionModel.id == session_uuid).first()
    if session:
        session.revoked_at = datetime.now(timezone.utc)
        db.commit()

    return MessageResponse(message="Logged out successfully.")


def logout_all_user_sessions(db: DBSession, user_id: uuid.UUID | str) -> MessageResponse:
    try:
        user_uuid = uuid.UUID(str(user_id)) if not isinstance(user_id, uuid.UUID) else user_id
    except (ValueError, AttributeError):
        raise AppError(400, "invalid_id", "Invalid user ID format") from None

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

    return MessageResponse(message="All sessions have been revoked.")
