"""
Personal preferences: defaults without a row, partial
updates, palette validation, self only, and the company AI switch.
"""
import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import get_password_hash
from app.db.session import Base, get_db
from app.main import app
from app.models.auth import LoginAttempt, Role, Session as SessionModel, User, UserStatus
from app.models.system import AuditLog, CompanySetting, UserPreference

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)
client = TestClient(app)
API = "/api/v1"
PASSWORD = "Password123!"


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_database():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    for model in (UserPreference, AuditLog, CompanySetting, LoginAttempt, SessionModel, User, Role):
        db.query(model).delete()
    for name in ("super_admin", "hr_admin", "it_admin", "manager", "employee", "auditor"):
        db.add(Role(id=uuid.uuid4(), name=name, is_system_role=True))
    db.commit()
    db.close()
    yield
    app.dependency_overrides.clear()


def _sign_in_new(email: str, role: str = "employee") -> dict:
    db = TestingSessionLocal()
    uid = uuid.uuid4()
    db.add(
        User(
            id=uid, employee_code=f"RST-{uid.hex[:6]}", full_name=email.split("@")[0], email=email,
            password_hash=get_password_hash(PASSWORD), role_id=db.query(Role.id).filter(Role.name == role).scalar(),
            designation="Staff", status=UserStatus.active, date_of_joining=date(2025, 1, 1),
        )
    )
    db.commit()
    db.close()
    res = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_defaults_without_saving_anything():
    me = _sign_in_new("asha@example.com")
    res = client.get(f"{API}/me/preferences", headers=me)
    assert res.status_code == 200
    body = res.json()
    assert {k: body[k] for k in ("accent", "assistant_enabled", "guide_style", "voice_enabled", "company_assistant_enabled")} == {
        "accent": "navy", "assistant_enabled": True, "guide_style": "show", "voice_enabled": False, "company_assistant_enabled": True,
    }


def test_partial_update_keeps_the_rest_and_is_per_person():
    asha = _sign_in_new("asha@example.com")
    ravi = _sign_in_new("ravi@example.com")
    first = client.patch(f"{API}/me/preferences", headers=asha, json={"accent": "sage"})
    assert first.status_code == 200 and first.json()["accent"] == "sage"
    second = client.patch(f"{API}/me/preferences", headers=asha, json={"guide_style": "take", "assistant_enabled": False})
    assert second.json() | {"updated_at": None} == {
        "accent": "sage", "assistant_enabled": False, "guide_style": "take", "voice_enabled": False,
        "company_assistant_enabled": True, "updated_at": None,
    }
    assert client.get(f"{API}/me/preferences", headers=ravi).json()["accent"] == "navy"  # Ravi's own defaults


def test_rejects_colours_outside_the_palette_and_unknown_fields():
    me = _sign_in_new("asha@example.com")
    for body, field in (({"accent": "#ff0000"}, "accent"), ({"guide_style": "fly"}, "guide_style"), ({"user_id": str(uuid.uuid4())}, "user_id")):
        res = client.patch(f"{API}/me/preferences", headers=me, json=body)
        assert res.status_code == 400
        assert res.json()["error"]["code"] == "validation_error" and field in res.json()["error"]["field_errors"]
    assert client.get(f"{API}/me/preferences", headers=me).json()["accent"] == "navy"  # nothing was saved


def test_needs_sign_in():
    assert client.get(f"{API}/me/preferences").status_code == 401


def test_company_switch_is_super_admin_only_and_reported_to_everyone():
    root = _sign_in_new("root@example.com", "super_admin")
    hr = _sign_in_new("hr@example.com", "hr_admin")
    me = _sign_in_new("asha@example.com")
    assert client.put(f"{API}/company-settings/ai.assistant_enabled", headers=hr, json={"value": False}).status_code == 403
    res = client.put(f"{API}/company-settings/ai.assistant_enabled", headers=root, json={"value": False})
    assert res.status_code == 200 and res.json()["value"] is False
    assert client.get(f"{API}/me/preferences", headers=me).json()["company_assistant_enabled"] is False
    db = TestingSessionLocal()
    assert db.query(AuditLog).filter(AuditLog.action == "company_setting.updated").count() == 1
    db.close()
