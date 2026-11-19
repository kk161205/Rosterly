"""
Two-step sign-in with an authenticator app (TOTP, RFC 6238).

Works with Google Authenticator, Microsoft Authenticator, Authy and others; no
email, SMS or paid service. Secrets are encrypted at rest (Fernet,
MFA_ENCRYPTION_KEY). A code is accepted for the current 30-second window and
one either side (phone clocks drift), and never twice. Recovery codes are
one-time and stored hashed. Pending sign-in challenges live in Postgres.
"""
import base64
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import pyotp
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.auth import MfaChallenge, MfaRecoveryCode, User

CHALLENGE_MINUTES = 10
MAX_CHALLENGE_ATTEMPTS = 5
RECOVERY_CODE_COUNT = 10
_STEP_SECONDS = 30


def _fernet() -> Fernet:
    key = settings.MFA_ENCRYPTION_KEY
    if not key:  # development only — production refuses to start without a key
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.JWT_SECRET_KEY.encode()).digest()).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None


def new_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(secret: str, account_email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=account_email, issuer_name=settings.MFA_ISSUER)


def _clean(code: str) -> str:
    return "".join(ch for ch in (code or "") if ch.isalnum()).lower()


def matching_step(secret: str, code: str, last_used_step: Optional[int], now: Optional[datetime] = None) -> Optional[int]:
    """The 30-second step a 6-digit code belongs to (current ±1), or None if it
    doesn't match or that step (or an earlier one) was already used."""
    digits = _clean(code)
    if len(digits) != 6 or not digits.isdigit():
        return None
    now = now or datetime.now(timezone.utc)
    current = int(now.timestamp()) // _STEP_SECONDS
    totp = pyotp.TOTP(secret)
    for step in (current, current - 1, current + 1):
        if last_used_step is not None and step <= last_used_step:
            continue
        if secrets.compare_digest(totp.at(step * _STEP_SECONDS), digits):
            return step
    return None


def _hash_code(code: str) -> str:
    return hashlib.sha256(_clean(code).encode()).hexdigest()


def new_recovery_codes(db: Session, user_id: uuid.UUID) -> list[str]:
    """Replaces the user's recovery codes with a fresh set; returns them once
    (formatted xxxx-xxxx). The caller commits."""
    db.query(MfaRecoveryCode).filter(MfaRecoveryCode.user_id == user_id).delete(synchronize_session=False)
    codes = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = secrets.token_hex(4)
        codes.append(f"{raw[:4]}-{raw[4:]}")
        db.add(MfaRecoveryCode(id=uuid.uuid4(), user_id=user_id, code_hash=_hash_code(raw)))
    return codes


def use_recovery_code(db: Session, user_id: uuid.UUID, code: str) -> bool:
    if len(_clean(code)) != 8:
        return False
    row = (
        db.query(MfaRecoveryCode)
        .filter(
            MfaRecoveryCode.user_id == user_id,
            MfaRecoveryCode.code_hash == _hash_code(code),
            MfaRecoveryCode.used_at.is_(None),
        )
        .with_for_update()
        .first()
    )
    if row is None:
        return False
    row.used_at = datetime.now(timezone.utc)
    return True


def verify_user_code(db: Session, user: User, code: str) -> bool:
    """An authenticator code (never reused) or an unused recovery code. Records
    the use; the caller commits."""
    secret = decrypt_secret(user.mfa_secret_encrypted)
    if secret:
        step = matching_step(secret, code, user.mfa_last_used_step)
        if step is not None:
            user.mfa_last_used_step = step
            return True
    return use_recovery_code(db, user.id, code)


def clear_mfa(db: Session, user: User) -> None:
    db.flush()  # write any pending recovery-code use before the codes are removed
    user.mfa_enabled = False
    user.mfa_secret_encrypted = None
    user.mfa_pending_secret_encrypted = None
    user.mfa_enabled_at = None
    user.mfa_last_used_step = None
    db.query(MfaRecoveryCode).filter(MfaRecoveryCode.user_id == user.id).delete(synchronize_session=False)


# ------------------------------------------------------------ sign-in challenges

def _challenge_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def create_challenge(db: Session, user_id: uuid.UUID) -> str:
    raw = secrets.token_urlsafe(32)
    db.add(
        MfaChallenge(
            id=uuid.uuid4(),
            challenge_hash=_challenge_hash(raw),
            user_id=user_id,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=CHALLENGE_MINUTES),
            attempts=0,
        )
    )
    return raw


def load_challenge(db: Session, raw: str) -> Optional[MfaChallenge]:
    """The live challenge for `raw` (locked), or None when unknown, used,
    expired or out of attempts."""
    if not raw:
        return None
    challenge = (
        db.query(MfaChallenge).filter(MfaChallenge.challenge_hash == _challenge_hash(raw)).with_for_update().first()
    )
    if challenge is None or challenge.consumed_at is not None or challenge.attempts >= MAX_CHALLENGE_ATTEMPTS:
        return None
    expires_at = challenge.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        return None
    return challenge
