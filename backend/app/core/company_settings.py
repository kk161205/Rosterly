"""
Company-editable single-value settings.

Each setting has a code default here, so a fresh install works without any
rows; a row in `company_settings` overrides it once someone changes it. Every
change is written to `audit_logs` in the same transaction.
Lists (leave types, holidays, categories…) have their own tables.
"""
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import ValidationAppError
from app.models.system import AuditLog, CompanySetting

# key -> (default, type)
DEFAULTS: dict[str, tuple[Any, type]] = {
    # Admins (super_admin, hr_admin, it_admin, auditor) must use two-step sign-in.
    "security.require_mfa_for_admins": (False, bool),
    # People may check in and out themselves on the Leave page.
    "attendance.manual_check_in": (True, bool),
    # The AI Guide and onboarding recommendations, for everyone.
    "ai.assistant_enabled": (True, bool),
}

# Who may change each setting: security is super admin
# only; people settings are HR's too. Everyone signed in may read them.
EDITORS: dict[str, frozenset[str]] = {
    "security.require_mfa_for_admins": frozenset({"super_admin"}),
    "attendance.manual_check_in": frozenset({"super_admin", "hr_admin"}),
    "ai.assistant_enabled": frozenset({"super_admin"}),
}

# A placeholder entity id for audit rows about settings (settings have string keys).
SETTINGS_ENTITY_ID = uuid.uuid5(uuid.NAMESPACE_URL, "rosterly:company-settings")


def get_setting(db: Session, key: str) -> Any:
    default, _ = DEFAULTS[key]
    row = db.get(CompanySetting, key)
    return default if row is None else row.value


def set_setting(db: Session, key: str, value: Any, actor_id: uuid.UUID, ip_address: str) -> Any:
    """Validates, stores and audits one setting. The caller commits."""
    if key not in DEFAULTS:
        raise ValidationAppError("Unknown setting", field_errors={"key": f"'{key}' is not a setting"})
    _, kind = DEFAULTS[key]
    if not isinstance(value, kind):
        raise ValidationAppError("Validation failed", field_errors={key: f"Must be a {kind.__name__}"})

    before = get_setting(db, key)
    row = db.get(CompanySetting, key)
    if row is None:
        db.add(CompanySetting(key=key, value=value, updated_by=actor_id))
    else:
        row.value = value
        row.updated_by = actor_id
    db.add(
        AuditLog(
            id=uuid.uuid4(),
            actor_id=actor_id,
            action="company_setting.updated",
            entity_type="company_setting",
            entity_id=SETTINGS_ENTITY_ID,
            before_state={"key": key, "value": before},
            after_state={"key": key, "value": value},
            ip_address=ip_address,
        )
    )
    return value
