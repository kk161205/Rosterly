"""Company settings: code defaults, overrides, validation and audit."""
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.company_settings import get_setting, set_setting
from app.core.errors import ValidationAppError
from app.db.session import Base
from app.models.system import AuditLog

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Session = sessionmaker(bind=engine)
Base.metadata.create_all(bind=engine)


@pytest.fixture
def db():
    session = Session()
    yield session
    session.rollback()
    session.close()


def test_defaults_apply_without_rows(db):
    assert get_setting(db, "security.require_mfa_for_admins") is False
    assert get_setting(db, "attendance.manual_check_in") is True


def test_change_is_stored_and_audited(db):
    actor = uuid.uuid4()
    set_setting(db, "security.require_mfa_for_admins", True, actor, "1.2.3.4")
    db.flush()
    assert get_setting(db, "security.require_mfa_for_admins") is True
    log = db.query(AuditLog).filter(AuditLog.action == "company_setting.updated").one()
    assert log.before_state == {"key": "security.require_mfa_for_admins", "value": False}
    assert log.after_state == {"key": "security.require_mfa_for_admins", "value": True}


def test_rejects_unknown_keys_and_wrong_types(db):
    with pytest.raises(ValidationAppError):
        set_setting(db, "nope", True, uuid.uuid4(), "x")
    with pytest.raises(ValidationAppError):
        set_setting(db, "attendance.manual_check_in", "yes", uuid.uuid4(), "x")
