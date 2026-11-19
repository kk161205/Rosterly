"""
Adding people and departments:
- POST /onboarding/new-joiner creates the account (status onboarding) and the
  checklist in one step and returns a single-use set-password link;
- onboarding people can sign in once they set a password and become active
  when their checklist is done;
- POST /users/{id}/sign-in-link gives admins a fresh link to hand over;
- departments can be added, renamed, given a head and deleted when empty.
"""
import secrets
import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import CurrentUser, get_current_user
from app.db.session import Base, get_db
from app.main import app
from app.models.auth import (
    Department,
    PasswordToken,
    Permission,
    Role,
    RolePermission,
    Session as SessionModel,
    User,
    UserStatus,
)
from app.models.lifecycle import Checklist, ChecklistItem
from app.models.system import AuditLog, Notification

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)
client = TestClient(app)

SEED_ROLES = ["super_admin", "hr_admin", "it_admin", "manager", "employee", "auditor"]
PERMISSIONS_MAP = {
    ("employee", "create"): ["super_admin", "hr_admin"],
    ("employee", "read"): ["super_admin", "hr_admin", "manager", "auditor", "employee"],
    ("user", "update"): ["super_admin", "hr_admin"],
    ("department", "create"): ["super_admin", "hr_admin"],
    ("department", "update"): ["super_admin", "hr_admin"],
    ("department", "delete"): ["super_admin", "hr_admin"],
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
    for model in (ChecklistItem, Checklist, Notification, AuditLog, PasswordToken, SessionModel, User,
                  Department, RolePermission, Permission, Role):
        db.query(model).delete()
    db.commit()
    roles = {}
    for name in SEED_ROLES:
        roles[name] = Role(id=uuid.uuid4(), name=name, is_system_role=True)
        db.add(roles[name])
    db.flush()
    for (resource, action), names in PERMISSIONS_MAP.items():
        perm = Permission(id=uuid.uuid4(), resource=resource, action=action)
        db.add(perm)
        db.flush()
        for rn in names:
            db.add(RolePermission(role_id=roles[rn].id, permission_id=perm.id))
    db.commit()
    db.close()
    yield
    app.dependency_overrides.clear()


def _role_id(name):
    db = TestingSessionLocal()
    rid = db.query(Role.id).filter(Role.name == name).scalar()
    db.close()
    return rid


def _make_user(role_name, status=UserStatus.active, last_login_at=None, department_id=None):
    db = TestingSessionLocal()
    uid = uuid.uuid4()
    user = User(
        id=uid, employee_code=f"RST-{secrets.token_hex(3).upper()}", full_name=f"{role_name} person",
        email=f"{role_name}_{uid.hex[:6]}@example.com", password_hash="h", role_id=_role_id(role_name),
        status=status, designation="Staff", date_of_joining=date(2025, 1, 1), last_login_at=last_login_at,
        department_id=department_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.expunge(user)
    db.close()
    return user


def _act_as(role_name):
    user = _make_user(role_name)
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=user.id, role=role_name, session_id=uuid.uuid4(), email=user.email,
        full_name=user.full_name, role_id=_role_id(role_name),
    )
    return user


def _token_from(link: str) -> str:
    return link.split("token=", 1)[1]


JOINER = {"full_name": "Riya Sen", "email": "Riya.Sen@Example.com", "designation": "Analyst",
          "date_of_joining": "2026-12-01"}


# ------------------------------------------------------------ new joiner

def test_hr_adds_a_new_joiner_with_account_checklist_and_link():
    _act_as("hr_admin")
    res = client.post("/api/v1/onboarding/new-joiner", json=JOINER)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["checklist"]["employee_name"] == "Riya Sen"
    assert "reset-password?token=" in body["set_password_link"]
    assert body["link_expires_in_minutes"] == 72 * 60
    assert body["email_sent"] is False  # delivery is off in tests

    db = TestingSessionLocal()
    joiner = db.query(User).filter(User.email == "riya.sen@example.com").one()
    assert joiner.status == UserStatus.onboarding
    assert joiner.role_id == _role_id("employee")
    assert db.query(AuditLog).filter(AuditLog.action == "user.created", AuditLog.entity_id == joiner.id).count() == 1
    db.close()


def test_hr_cannot_add_a_privileged_new_joiner_but_super_admin_can():
    _act_as("hr_admin")
    res = client.post("/api/v1/onboarding/new-joiner", json={**JOINER, "role_id": str(_role_id("it_admin"))})
    assert res.status_code == 403
    _act_as("super_admin")
    res = client.post("/api/v1/onboarding/new-joiner", json={**JOINER, "role_id": str(_role_id("it_admin"))})
    assert res.status_code == 201


@pytest.mark.parametrize("role", ["employee", "manager", "it_admin", "auditor"])
def test_other_roles_cannot_add_new_joiners(role):
    _act_as(role)
    assert client.post("/api/v1/onboarding/new-joiner", json=JOINER).status_code == 403


def test_duplicate_email_is_refused_and_nothing_is_created():
    _act_as("hr_admin")
    assert client.post("/api/v1/onboarding/new-joiner", json=JOINER).status_code == 201
    res = client.post("/api/v1/onboarding/new-joiner", json={**JOINER, "email": "riya.sen@EXAMPLE.com"})
    assert res.status_code == 409
    db = TestingSessionLocal()
    assert db.query(Checklist).count() == 1
    db.close()


def test_new_joiner_signs_in_while_onboarding_and_becomes_active_when_done():
    _act_as("hr_admin")
    body = client.post("/api/v1/onboarding/new-joiner", json=JOINER).json()
    token = _token_from(body["set_password_link"])
    assert client.post("/api/v1/auth/reset-password", json={"token": token, "new_password": "Str0ngPass!"}).status_code == 200

    login = client.post("/api/v1/auth/login", json={"email": "riya.sen@example.com", "password": "Str0ngPass!"})
    assert login.status_code == 200, login.text

    db = TestingSessionLocal()
    assert db.query(User.status).filter(User.email == "riya.sen@example.com").scalar() == UserStatus.onboarding
    db.close()

    checklist_id = body["checklist"]["id"]
    for item in body["checklist"]["items"]:
        res = client.patch(f"/api/v1/onboarding/{checklist_id}/items/{item['id']}", json={"status": "done"})
        assert res.status_code == 200, res.text

    db = TestingSessionLocal()
    assert db.query(User.status).filter(User.email == "riya.sen@example.com").scalar() == UserStatus.active
    assert db.query(AuditLog).filter(AuditLog.action == "user.onboarding_completed").count() == 1
    db.close()


# ------------------------------------------------------------ sign-in links

def test_admin_creates_a_sign_in_link_and_a_new_one_cancels_the_old():
    _act_as("hr_admin")
    person = _make_user("employee", last_login_at=None, status=UserStatus.inactive)
    first = client.post(f"/api/v1/users/{person.id}/sign-in-link")
    assert first.status_code == 200
    assert first.json()["purpose"] == "invite"
    second = client.post(f"/api/v1/users/{person.id}/sign-in-link").json()

    url = "/api/v1/auth/reset-password"
    assert client.post(url, json={"token": _token_from(first.json()["link"]), "new_password": "Str0ngPass!"}).status_code == 400
    assert client.post(url, json={"token": _token_from(second["link"]), "new_password": "Str0ngPass!"}).status_code == 200


def test_sign_in_link_for_someone_who_has_signed_in_is_a_short_reset_link():
    from datetime import datetime, timezone

    _act_as("hr_admin")
    person = _make_user("employee", last_login_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    body = client.post(f"/api/v1/users/{person.id}/sign-in-link").json()
    assert body["purpose"] == "reset"
    assert body["expires_in_minutes"] == 15


def test_hr_cannot_create_links_for_privileged_people_or_leavers():
    _act_as("hr_admin")
    assert client.post(f"/api/v1/users/{_make_user('it_admin').id}/sign-in-link").status_code == 403
    leaver = _make_user("employee", status=UserStatus.terminated)
    assert client.post(f"/api/v1/users/{leaver.id}/sign-in-link").status_code == 409


def test_employees_cannot_create_sign_in_links():
    _act_as("employee")
    assert client.post(f"/api/v1/users/{_make_user('employee').id}/sign-in-link").status_code == 403


def test_post_users_no_longer_exists():
    _act_as("super_admin")
    res = client.post("/api/v1/users", json={"full_name": "x", "email": "x@example.com", "role_id": str(uuid.uuid4())})
    assert res.status_code == 405


# ------------------------------------------------------------ departments

def test_hr_adds_renames_sets_head_and_deletes_an_empty_department():
    hr = _act_as("hr_admin")
    res = client.post("/api/v1/departments", json={"name": "Finance"})
    assert res.status_code == 201
    dept_id = res.json()["id"]
    assert res.json()["code"] == "F"

    res = client.patch(f"/api/v1/departments/{dept_id}", json={"name": "Finance & Accounts", "manager_id": str(hr.id)})
    assert res.status_code == 200
    assert res.json()["manager_name"] == hr.full_name

    assert client.delete(f"/api/v1/departments/{dept_id}").status_code == 204
    db = TestingSessionLocal()
    actions = {a for (a,) in db.query(AuditLog.action).filter(AuditLog.entity_type == "department")}
    assert actions == {"department.created", "department.updated", "department.deleted"}
    db.close()


def test_department_names_are_unique_and_departments_with_people_stay():
    _act_as("hr_admin")
    dept_id = client.post("/api/v1/departments", json={"name": "Sales"}).json()["id"]
    assert client.post("/api/v1/departments", json={"name": "sales"}).status_code == 409
    _make_user("employee", department_id=uuid.UUID(dept_id))
    res = client.delete(f"/api/v1/departments/{dept_id}")
    assert res.status_code == 409
    assert "still in Sales" in res.json()["error"]["message"]


@pytest.mark.parametrize("role", ["employee", "manager", "it_admin", "auditor"])
def test_only_hr_and_super_admins_edit_departments(role):
    _act_as(role)
    assert client.post("/api/v1/departments", json={"name": "Ops"}).status_code == 403
    assert client.get("/api/v1/departments").status_code == 200


# ------------------------------------------------------------ review fixes (security)

def test_hr_cannot_offboard_a_privileged_person_or_themselves_but_super_admin_can():
    hr = _act_as("hr_admin")
    for role in ("super_admin", "it_admin"):
        target = _make_user(role)
        res = client.post("/api/v1/offboarding", json={"employee_id": str(target.id)})
        assert res.status_code == 403, res.text
    assert client.post("/api/v1/offboarding", json={"employee_id": str(hr.id)}).status_code == 400
    it = _make_user("it_admin")
    _act_as("super_admin")
    assert client.post("/api/v1/offboarding", json={"employee_id": str(it.id)}).status_code == 201


def test_deactivating_someone_cancels_their_unused_sign_in_link():
    _act_as("hr_admin")
    person = _make_user("employee", last_login_at=None, status=UserStatus.inactive)
    link = client.post(f"/api/v1/users/{person.id}/sign-in-link").json()["link"]
    assert client.patch(f"/api/v1/users/{person.id}/status", json={"status": "active"}).status_code == 200
    assert client.patch(f"/api/v1/users/{person.id}/status", json={"status": "inactive"}).status_code == 200
    res = client.post("/api/v1/auth/reset-password", json={"token": _token_from(link), "new_password": "Str0ngPass!"})
    assert res.status_code == 400  # the old link no longer brings them back
