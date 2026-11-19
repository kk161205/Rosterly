"""
Single-use set-password links: password resets and new joiners' invites.

The link carries an opaque random token; only its SHA-256 is stored in
`password_tokens`. A token works once, until it expires, and issuing a new
link of the same purpose cancels the person's earlier unused ones — so
"create a new link" always invalidates the old one. Stored in Postgres, so it
holds across workers and restarts.
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.auth import PasswordToken, PasswordTokenPurpose

RESET_TOKEN_MINUTES = 15


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _lifetime(purpose: PasswordTokenPurpose) -> timedelta:
    if purpose == PasswordTokenPurpose.invite:
        return timedelta(hours=settings.INVITE_TOKEN_EXPIRE_HOURS)
    return timedelta(minutes=RESET_TOKEN_MINUTES)


def link_minutes(purpose: PasswordTokenPurpose) -> int:
    return int(_lifetime(purpose).total_seconds() // 60)


def issue_password_token(
    db: Session,
    user_id: uuid.UUID,
    purpose: PasswordTokenPurpose,
    created_by: Optional[uuid.UUID] = None,
) -> str:
    """Creates a link token and returns the raw value. Added to the caller's
    transaction — the caller commits."""
    now = datetime.now(timezone.utc)
    db.query(PasswordToken).filter(
        PasswordToken.user_id == user_id,
        PasswordToken.purpose == purpose,
        PasswordToken.used_at.is_(None),
    ).update({PasswordToken.used_at: now}, synchronize_session=False)

    raw = secrets.token_urlsafe(32)
    db.add(
        PasswordToken(
            id=uuid.uuid4(),
            user_id=user_id,
            token_hash=_hash(raw),
            purpose=purpose,
            expires_at=now + _lifetime(purpose),
            created_by=created_by,
        )
    )
    db.flush()
    return raw


def cancel_password_tokens(db: Session, user_id: uuid.UUID) -> None:
    """Every unused link for this person stops working — when they're deactivated or
    start leaving, an old invite or reset link must not let them back in. The caller commits."""
    db.query(PasswordToken).filter(PasswordToken.user_id == user_id, PasswordToken.used_at.is_(None)).update(
        {PasswordToken.used_at: datetime.now(timezone.utc)}, synchronize_session=False
    )


def consume_password_token(db: Session, raw: str) -> Optional[PasswordToken]:
    """Locks and marks the token used, returning it — or None when it is
    unknown, already used or expired. The caller commits."""
    if not raw:
        return None
    token = (
        db.query(PasswordToken)
        .filter(PasswordToken.token_hash == _hash(raw))
        .with_for_update()
        .first()
    )
    if token is None or token.used_at is not None:
        return None
    expires_at = token.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    if expires_at <= now:
        return None
    token.used_at = now
    return token
