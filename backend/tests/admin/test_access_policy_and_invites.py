"""
Cross-path access rules and the (delivery-disabled) invite flow.

- §5.14 privileged-role rule applied to BOTH role-changing paths:
  POST/PATCH /users (§5.14) and PATCH /employees/{id} (§5.4), so HR can't use
  the profile edit to grant or remove super_admin / it_admin.
- §6 critical account_updated notification on every role change.
- §5.14 invite: email is built but not sent while EMAIL_DELIVERY_ENABLED is off;
  the invite link activates a never-signed-in account, never a deactivated one.
- GET /users rejects unknown status values with 400, not a database error.
"""
from datetime import date, datetime, timezone
import secrets
from unittest.mock import patch
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import (
    INVITE_TOKEN_PURPOSE,
    CurrentUser,
    create_password_reset_token,
    get_current_user,
)
from app.db.session import Base, get_db
from app.main import app
from app.models.auth import Permission, Role, RolePermission, Session as SessionModel, User, UserStatus
from app.models.system import AuditLog, Notification, NotificationChannel
from app.modules.notifications import email as email_service

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)

client = TestClient(app)

SEED_ROLES = ["super_admin", "hr_admin", "it_admin", "manager", "employee", "auditor"]
PERMISSIONS_MAP = {
    ("employee", "read"): ["super_admin", "hr_admin", "manager", "auditor", "employee"],
    ("employee", "update"): ["super_admin", "hr_admin"],
    ("user", "read"): ["super_admin", "hr_admin"],
    ("user", "create"): ["super_admin", "hr_admin"],
    ("user", "update"): ["super_admin", "hr_admin"],
    ("user", "assign_role"): ["super_admin"],
}


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
    for model in (Notification, AuditLog, SessionModel, User, RolePermission, Permission, Role):
        db.query(model).delete()
    db.commit()

    roles = {}
    for name in SEED_ROLES:
        roles[name] = Role(id=uuid.uuid4(), name=name, is_system_role=True)
        db.add(roles[name])
    db.flush()
    for (resource, action), role_names in PERMISSIONS_MAP.items():
        perm = Permission(id=uuid.uuid4(), resource=resource, action=action)
        db.add(perm)
        db.flush()
        for rn in role_names:
            db.add(RolePermission(role_id=roles[rn].id, permission_id=perm.id))
    db.commit()
    db.close()
    yield
    app.dependency_overrides.clear()


def _role_id(name: str) -> uuid.UUID:
    db = TestingSessionLocal()
    rid = db.query(Role.id).filter(Role.name == name).scalar()
    db.close()
    return rid


def _make_user(role_name: str, status: UserStatus = UserStatus.active, last_login_at=None) -> User:
    db = TestingSessionLocal()
    uid = uuid.uuid4()
    user = User(
        id=uid,
        employee_code=f"RST-{secrets.token_hex(3).upper()}",
        full_name=f"{role_name} person",
        email=f"{role_name}_{uid.hex[:6]}@example.com",
        password_hash="h",
        role_id=_role_id(role_name),
        status=status,
        designation="Staff",
        date_of_joining=date(2025, 1, 1),
        last_login_at=last_login_at,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.expunge(user)
    db.close()
    return user


def _act_as(role_name: str) -> User:
    user = _make_user(role_name)
    current = CurrentUser(
        user_id=user.id,
        role=role_name,
        session_id=uuid.uuid4(),
        email=user.email,
        full_name=user.full_name,
        role_id=user.role_id,
    )
    app.dependency_overrides[get_current_user] = lambda: current
    return user


# ---------------------------------------------------------------- privileged roles

@pytest.mark.parametrize("privileged", ["super_admin", "it_admin"])
def test_hr_cannot_grant_privileged_role_via_employee_edit(privileged):
    _act_as("hr_admin")
    target = _make_user("employee")
    res = client.patch(f"/api/v1/employees/{target.id}", json={"role_id": str(_role_id(privileged))})
    assert res.status_code == 403
    db = TestingSessionLocal()
    assert db.query(User.role_id).filter(User.id == target.id).scalar() == _role_id("employee")
    db.close()


@pytest.mark.parametrize("field", ["role_id", "status"])
def test_hr_cannot_change_privileged_user_via_employee_edit(field):
    _act_as("hr_admin")
    target = _make_user("it_admin")
    payload = {"role_id": str(_role_id("employee"))} if field == "role_id" else {"status": "inactive"}
    res = client.patch(f"/api/v1/employees/{target.id}", json=payload)
    assert res.status_code == 403


def test_hr_can_change_non_privileged_role_via_employee_edit_and_user_is_notified():
    _act_as("hr_admin")
    target = _make_user("employee")
    res = client.patch(f"/api/v1/employees/{target.id}", json={"role_id": str(_role_id("manager"))})
    assert res.status_code == 200

    db = TestingSessionLocal()
    note = db.query(Notification).filter(Notification.user_id == target.id).one()
    assert note.type == "account_updated"
    assert note.is_critical is True
    assert note.channel == NotificationChannel.both
    assert "manager" in note.message
    db.close()


def test_super_admin_can_grant_privileged_role_via_employee_edit():
    _act_as("super_admin")
    target = _make_user("employee")
    res = client.patch(f"/api/v1/employees/{target.id}", json={"role_id": str(_role_id("it_admin"))})
    assert res.status_code == 200


def test_user_management_role_change_notifies_affected_user():
    _act_as("super_admin")
    target = _make_user("employee")
    res = client.patch(f"/api/v1/users/{target.id}/role", json={"role_id": str(_role_id("manager"))})
    assert res.status_code == 200

    db = TestingSessionLocal()
    note = db.query(Notification).filter(Notification.user_id == target.id).one()
    assert note.type == "account_updated" and note.is_critical
    db.close()


# ---------------------------------------------------------------- invites

def test_create_user_builds_invite_but_sends_nothing_while_delivery_disabled():
    _act_as("hr_admin")
    with patch.object(email_service.smtplib, "SMTP") as smtp:
        res = client.post(
            "/api/v1/users",
            json={"full_name": "New Hire", "email": "New.Hire@Example.com", "role_id": str(_role_id("employee"))},
        )
    assert res.status_code == 201
    assert res.json()["status"] == "inactive"
    smtp.assert_not_called()


def test_send_email_uses_smtp_only_when_enabled_and_configured():
    settings = email_service.settings
    with patch.object(email_service.smtplib, "SMTP") as smtp:
        assert email_service.send_email("a@example.com", "s", "b") is False
        smtp.assert_not_called()

        with patch.multiple(
            settings,
            EMAIL_DELIVERY_ENABLED=True,
            SMTP_HOST="smtp.example.com",
            SMTP_USER="u",
            SMTP_PASSWORD="p",
        ):
            assert email_service.send_email("a@example.com", "s", "b") is True
        smtp.assert_called_once()


def test_invite_link_activates_never_signed_in_account():
    invited = _make_user("employee", status=UserStatus.inactive)
    token = create_password_reset_token(invited.id, purpose=INVITE_TOKEN_PURPOSE)
    res = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Str0ng!pass"})
    assert res.status_code == 200

    db = TestingSessionLocal()
    assert db.query(User.status).filter(User.id == invited.id).scalar() == UserStatus.active
    assert db.query(AuditLog).filter(AuditLog.action == "user.invite_accepted").count() == 1
    db.close()


def test_invite_link_never_reactivates_a_deactivated_account():
    deactivated = _make_user(
        "employee", status=UserStatus.inactive, last_login_at=datetime(2026, 1, 5, tzinfo=timezone.utc)
    )
    token = create_password_reset_token(deactivated.id, purpose=INVITE_TOKEN_PURPOSE)
    client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Str0ng!pass"})

    db = TestingSessionLocal()
    assert db.query(User.status).filter(User.id == deactivated.id).scalar() == UserStatus.inactive
    db.close()


def test_reset_token_cannot_be_replayed():
    user = _make_user("employee")
    token = create_password_reset_token(user.id)
    first = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Str0ng!pass"})
    second = client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "An0ther!pass"})
    assert first.status_code == 200
    assert second.status_code == 400


# ---------------------------------------------------------------- validation

def test_get_users_unknown_status_is_400():
    _act_as("hr_admin")
    res = client.get("/api/v1/users", params={"status": "banana"})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "validation_error"
