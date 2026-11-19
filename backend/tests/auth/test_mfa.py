"""
Two-step sign-in: setup → enable → sign in with a
code → disable; super admin reset; the company "require for admins" policy is
enforced by the API, not just the UI; company settings permissions.
"""
import uuid
from datetime import date

import pyotp
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import get_password_hash
from app.db.session import Base, get_db
from app.main import app
from app.models.auth import (
    LoginAttempt,
    MfaChallenge,
    MfaRecoveryCode,
    Role,
    Session as SessionModel,
    User,
    UserStatus,
)
from app.models.system import AuditLog, CompanySetting

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
    for model in (MfaRecoveryCode, MfaChallenge, AuditLog, CompanySetting, LoginAttempt, SessionModel, User, Role):
        db.query(model).delete()
    for name in ("super_admin", "hr_admin", "it_admin", "manager", "employee", "auditor"):
        db.add(Role(id=uuid.uuid4(), name=name, is_system_role=True))
    db.commit()
    db.close()
    yield
    app.dependency_overrides.clear()


def _user(email: str, role: str) -> uuid.UUID:
    db = TestingSessionLocal()
    uid = uuid.uuid4()
    db.add(
        User(
            id=uid, employee_code=f"RST-{uid.hex[:4]}", full_name=email.split("@")[0], email=email,
            password_hash=get_password_hash(PASSWORD), role_id=db.query(Role.id).filter(Role.name == role).scalar(),
            designation="Staff", status=UserStatus.active, date_of_joining=date(2025, 1, 1),
        )
    )
    db.commit()
    db.close()
    return uid


def _sign_in(email: str) -> dict:
    res = client.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def _turn_on(headers: dict) -> tuple[str, list[str]]:
    setup = client.post(f"{API}/auth/mfa/setup", headers=headers)
    assert setup.status_code == 200
    secret = setup.json()["secret"]
    assert setup.json()["otpauth_uri"].startswith("otpauth://totp/")
    res = client.post(f"{API}/auth/mfa/enable", headers=headers, json={"code": pyotp.TOTP(secret).now()})
    assert res.status_code == 200, res.text
    return secret, res.json()["recovery_codes"]


def test_setup_enable_and_sign_in_with_a_code_or_a_recovery_code():
    _user("asha@example.com", "employee")
    headers = _sign_in("asha@example.com")
    secret, codes = _turn_on(headers)
    assert len(codes) == 10
    assert client.get(f"{API}/auth/me", headers=headers).json()["mfa_enabled"] is True

    login = client.post(f"{API}/auth/login", json={"email": "asha@example.com", "password": PASSWORD}).json()
    assert login["mfa_required"] is True
    used = client.post(f"{API}/auth/mfa/verify", json={"mfa_session_id": login["mfa_session_id"], "code": codes[0]})
    assert used.status_code == 200

    # A recovery code works once.
    login = client.post(f"{API}/auth/login", json={"email": "asha@example.com", "password": PASSWORD}).json()
    again = client.post(f"{API}/auth/mfa/verify", json={"mfa_session_id": login["mfa_session_id"], "code": codes[0]})
    assert again.status_code == 401

    db = TestingSessionLocal()
    stored = db.query(User).filter(User.email == "asha@example.com").one()
    assert secret not in (stored.mfa_secret_encrypted or "")  # encrypted at rest
    assert db.query(AuditLog).filter(AuditLog.action == "user.mfa_enabled").count() == 1
    db.close()


def test_enable_rejects_a_wrong_code():
    _user("ben@example.com", "employee")
    headers = _sign_in("ben@example.com")
    client.post(f"{API}/auth/mfa/setup", headers=headers)
    res = client.post(f"{API}/auth/mfa/enable", headers=headers, json={"code": "000000"})
    assert res.status_code == 400


def test_disable_needs_password_and_code():
    _user("cara@example.com", "employee")
    headers = _sign_in("cara@example.com")
    _, codes = _turn_on(headers)
    assert client.post(f"{API}/auth/mfa/setup", headers=headers).status_code == 409  # already on

    bad = client.post(f"{API}/auth/mfa/disable", headers=headers, json={"password": "wrong", "code": codes[1]})
    assert bad.status_code == 400
    good = client.post(f"{API}/auth/mfa/disable", headers=headers, json={"password": PASSWORD, "code": codes[2]})
    assert good.status_code == 200
    assert client.get(f"{API}/auth/me", headers=headers).json()["mfa_enabled"] is False
    login = client.post(f"{API}/auth/login", json={"email": "cara@example.com", "password": PASSWORD}).json()
    assert login["mfa_required"] is False


def test_super_admin_resets_someones_mfa_and_signs_them_out():
    _user("root@example.com", "super_admin")
    _user("dev@example.com", "employee")
    dev_headers = _sign_in("dev@example.com")
    _turn_on(dev_headers)

    admin_headers = _sign_in("root@example.com")
    db = TestingSessionLocal()
    dev_id = db.query(User.id).filter(User.email == "dev@example.com").scalar()
    db.close()
    res = client.post(f"{API}/users/{dev_id}/mfa/reset", headers=admin_headers)
    assert res.status_code == 200
    assert client.get(f"{API}/auth/me", headers=dev_headers).status_code == 401  # signed out everywhere
    login = client.post(f"{API}/auth/login", json={"email": "dev@example.com", "password": PASSWORD}).json()
    assert login["mfa_required"] is False


def test_only_super_admins_reset_mfa():
    _user("hr@example.com", "hr_admin")
    target = _user("emp@example.com", "employee")
    res = client.post(f"{API}/users/{target}/mfa/reset", headers=_sign_in("hr@example.com"))
    assert res.status_code == 403


def test_company_policy_blocks_admins_until_they_set_up_mfa():
    _user("root@example.com", "super_admin")
    _user("it@example.com", "it_admin")
    _user("emp@example.com", "employee")
    root = _sign_in("root@example.com")

    res = client.put(f"{API}/company-settings/security.require_mfa_for_admins", headers=root, json={"value": True})
    # The super admin themselves now must set it up before anything else.
    assert res.status_code == 200
    blocked = client.get(f"{API}/company-settings", headers=root)
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "mfa_setup_required"

    it = _sign_in("it@example.com")
    me = client.get(f"{API}/auth/me", headers=it).json()
    assert me["mfa_setup_required"] is True
    assert client.get(f"{API}/company-settings", headers=it).status_code == 403
    _turn_on(it)
    assert client.get(f"{API}/company-settings", headers=it).status_code == 200

    # Employees aren't covered by the policy.
    emp = _sign_in("emp@example.com")
    assert client.get(f"{API}/auth/me", headers=emp).json()["mfa_setup_required"] is False
    assert client.get(f"{API}/company-settings", headers=emp).status_code == 200


def test_admins_cannot_turn_mfa_off_while_the_policy_requires_it():
    _user("root@example.com", "super_admin")
    root = _sign_in("root@example.com")
    _, codes = _turn_on(root)
    client.put(f"{API}/company-settings/security.require_mfa_for_admins", headers=root, json={"value": True})
    res = client.post(f"{API}/auth/mfa/disable", headers=root, json={"password": PASSWORD, "code": codes[0]})
    assert res.status_code == 403


def test_settings_editors_and_audit():
    _user("hr@example.com", "hr_admin")
    hr = _sign_in("hr@example.com")
    items = {i["key"]: i for i in client.get(f"{API}/company-settings", headers=hr).json()}
    assert items["attendance.manual_check_in"] == {"key": "attendance.manual_check_in", "value": True, "can_edit": True}
    assert items["security.require_mfa_for_admins"]["can_edit"] is False
    assert client.put(f"{API}/company-settings/security.require_mfa_for_admins", headers=hr, json={"value": True}).status_code == 403
    assert client.put(f"{API}/company-settings/attendance.manual_check_in", headers=hr, json={"value": False}).status_code == 200
    assert client.put(f"{API}/company-settings/attendance.manual_check_in", headers=hr, json={"value": "no"}).status_code == 400
    db = TestingSessionLocal()
    assert db.query(AuditLog).filter(AuditLog.action == "company_setting.updated").count() == 1
    db.close()


def test_wrong_codes_lock_the_account_across_every_open_challenge():
    _user("lock@example.com", "employee")
    _turn_on(_sign_in("lock@example.com"))
    sessions = [client.post(f"{API}/auth/login", json={"email": "lock@example.com", "password": PASSWORD}).json()["mfa_session_id"] for _ in range(3)]
    for i in range(5):  # spread five wrong codes over several challenges
        res = client.post(f"{API}/auth/mfa/verify", json={"mfa_session_id": sessions[i % 3], "code": "000000"})
        assert res.status_code == 401
    locked = client.post(f"{API}/auth/mfa/verify", json={"mfa_session_id": sessions[2], "code": "000000"})
    assert locked.status_code == 423 or locked.json()["error"]["code"] == "account_locked", locked.text
