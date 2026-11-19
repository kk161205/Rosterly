"""
Two-step sign-in, self-service.

  setup   → a new secret is stored as *pending* and returned with an otpauth
            URI the page shows as a QR code;
  enable  → the person types the current code; the pending secret becomes
            theirs and 10 one-time recovery codes are returned (shown once);
  disable → needs their password and a current code; refused while the
            company requires it for their role.

A super admin can reset someone's two-step sign-in (lost phone); that also
signs them out everywhere. Every change is audited.
"""
import uuid
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session, selectinload

from app.core.company_settings import get_setting
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.core.mfa import (
    clear_mfa,
    decrypt_secret,
    encrypt_secret,
    matching_step,
    new_recovery_codes,
    new_secret,
    provisioning_uri,
    verify_user_code,
)
from app.core.role_policy import is_super_admin, user_role_names
from app.core.security import MFA_POLICY_ROLES, CurrentUser, verify_password
from app.models.auth import User
from app.models.system import AuditLog
from app.modules.auth.schemas import MFARecoveryCodesResponse, MFASetupResponse, MessageResponse
from app.modules.auth.service import logout_all_user_sessions


class MfaService:
    def __init__(self, db: Session, current_user: CurrentUser, ip_address: str):
        self.db = db
        self.current_user = current_user
        self.ip_address = ip_address

    def _me(self) -> User:
        return self.db.query(User).filter(User.id == self.current_user.user_id).with_for_update().one()

    def _audit(self, action: str, user_id: UUID, after: dict) -> None:
        self.db.add(
            AuditLog(
                id=uuid.uuid4(),
                actor_id=self.current_user.user_id,
                action=action,
                entity_type="user",
                entity_id=user_id,
                before_state=None,
                after_state=after,
                ip_address=self.ip_address,
            )
        )

    def setup(self) -> MFASetupResponse:
        user = self._me()
        if user.mfa_enabled:
            raise ConflictError("Two-step sign-in is already on. Turn it off first to set up a new phone.")
        secret = new_secret()
        user.mfa_pending_secret_encrypted = encrypt_secret(secret)
        self.db.commit()
        return MFASetupResponse(secret=secret, otpauth_uri=provisioning_uri(secret, user.email))

    def enable(self, code: str) -> MFARecoveryCodesResponse:
        user = self._me()
        if user.mfa_enabled:
            raise ConflictError("Two-step sign-in is already on.")
        secret = decrypt_secret(user.mfa_pending_secret_encrypted)
        if not secret:
            raise ConflictError("Start setup again — scan the QR code first.")
        step = matching_step(secret, code, None)
        if step is None:
            raise ValidationAppError(
                "That code didn't match. Check the time on your phone and try the newest code.",
                field_errors={"code": "That code didn't match."},
            )
        user.mfa_secret_encrypted = user.mfa_pending_secret_encrypted
        user.mfa_pending_secret_encrypted = None
        user.mfa_enabled = True
        user.mfa_enabled_at = datetime.now(timezone.utc)
        user.mfa_last_used_step = step
        codes = new_recovery_codes(self.db, user.id)
        self._audit("user.mfa_enabled", user.id, {"mfa_enabled": True})
        self.db.commit()
        return MFARecoveryCodesResponse(recovery_codes=codes)

    def disable(self, password: str, code: str) -> MessageResponse:
        user = self._me()
        if not user.mfa_enabled:
            raise ConflictError("Two-step sign-in is already off.")
        if self.current_user.has_role(*MFA_POLICY_ROLES) and get_setting(self.db, "security.require_mfa_for_admins"):
            raise ForbiddenError("Your company requires two-step sign-in for your role, so it can't be turned off.")
        if not verify_password(password, user.password_hash) or not verify_user_code(self.db, user, code):
            raise ValidationAppError("Your password or code wasn't right.", field_errors={"code": "Check your password and code."})
        clear_mfa(self.db, user)
        self._audit("user.mfa_disabled", user.id, {"mfa_enabled": False})
        self.db.commit()
        return MessageResponse(message="Two-step sign-in is off.")

    def reset_for(self, user_id: UUID) -> MessageResponse:
        """POST /users/{id}/mfa/reset — super admin only."""
        if not is_super_admin(self.current_user):
            raise ForbiddenError("Only a super admin can reset two-step sign-in.")
        target = (
            self.db.query(User)
            .options(selectinload(User.role), selectinload(User.additional_roles))
            .filter(User.id == user_id)
            .with_for_update()
            .first()
        )
        if target is None:
            raise NotFoundError("User not found.")
        if target.id == self.current_user.user_id:
            raise ForbiddenError("You can't reset your own two-step sign-in here. Use your profile.")
        if not target.mfa_enabled:
            raise ConflictError("Two-step sign-in isn't on for this person.")
        clear_mfa(self.db, target)
        self._audit("user.mfa_reset", target.id, {"mfa_enabled": False, "roles": user_role_names(target)})
        logout_all_user_sessions(self.db, target.id)
        self.db.commit()
        return MessageResponse(message="Two-step sign-in was reset and they were signed out everywhere.")
