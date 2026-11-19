"""
Onboarding recommendations, backend side:
- GET /onboarding/joiner-history: what recent joiners got in their first weeks
  (equipment categories, licences), without who they are; HR only.
- POST /onboarding/new-joiner `extra_items`: the usual items become real,
  audited checklist tasks after the standard ones, without duplicates.
"""
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import CurrentUser, get_current_user
from app.db.session import Base, get_db
from app.main import app
from app.models.assets import Asset, AssetAssignment, AssetStatus, LicenseAssignment, SoftwareLicense
from app.models.auth import Department, PasswordToken, Permission, Role, RolePermission, Session as SessionModel, User, UserStatus
from app.models.lifecycle import Checklist, ChecklistItem
from app.models.system import AuditLog, Notification

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)
client = TestClient(app)
ROLES = ["super_admin", "hr_admin", "it_admin", "manager", "employee", "auditor"]


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
    for model in (ChecklistItem, Checklist, LicenseAssignment, SoftwareLicense, AssetAssignment, Asset, Notification, AuditLog,
                  PasswordToken, SessionModel, User, Department, RolePermission, Permission, Role):
        db.query(model).delete()
    roles = {n: Role(id=uuid.uuid4(), name=n, is_system_role=True) for n in ROLES}
    db.add_all(roles.values())
    perm = Permission(id=uuid.uuid4(), resource="employee", action="create")
    db.add(perm)
    db.flush()
    for n in ("super_admin", "hr_admin"):
        db.add(RolePermission(role_id=roles[n].id, permission_id=perm.id))
    db.commit()
    db.close()
    yield
    app.dependency_overrides.clear()


def _role_id(name):
    db = TestingSessionLocal()
    rid = db.query(Role.id).filter(Role.name == name).scalar()
    db.close()
    return rid


def _act_as(role_name):
    db = TestingSessionLocal()
    uid = uuid.uuid4()
    db.add(User(id=uid, employee_code=f"RST-{secrets.token_hex(3)}", full_name="Actor", email=f"{uid.hex[:8]}@example.com",
                password_hash="h", role_id=_role_id(role_name), status=UserStatus.active, designation="HR", date_of_joining=date(2020, 1, 1)))
    db.commit()
    db.close()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=uid, role=role_name, session_id=uuid.uuid4(), email="a@example.com", full_name="Actor", role_id=_role_id(role_name))
    return uid


def _seed_history():
    """Two designers in Product (laptop + Figma in their first weeks; one got a monitor months later), one engineer."""
    db = TestingSessionLocal()
    product = Department(id=uuid.uuid4(), name="Product")
    db.add(product)
    figma = SoftwareLicense(id=uuid.uuid4(), name="Figma", vendor="Figma", total_seats=10)
    db.add(figma)
    joined = date.today() - timedelta(days=200)
    at = lambda days: datetime.combine(joined, datetime.min.time(), tzinfo=timezone.utc) + timedelta(days=days)  # noqa: E731
    people = []
    for i, (title, dept) in enumerate([("Product Designer", product.id), ("Product Designer", product.id), ("Backend Engineer", None)]):
        u = User(id=uuid.uuid4(), employee_code=f"H-{i}", full_name=f"Secret Name {i}", email=f"secret{i}@example.com", password_hash="h",
                 role_id=_role_id("employee"), status=UserStatus.active, designation=title, department_id=dept, date_of_joining=joined)
        db.add(u)
        people.append(u)
    db.flush()
    actor = people[2].id
    for i, u in enumerate(people):
        laptop = Asset(id=uuid.uuid4(), asset_tag=f"L-{i}", name="Laptop", category="laptop", status=AssetStatus.assigned)
        db.add(laptop)
        db.flush()
        db.add(AssetAssignment(asset_id=laptop.id, employee_id=u.id, assigned_by=actor, assigned_at=at(2), condition_at_assignment="New"))
    late = Asset(id=uuid.uuid4(), asset_tag="M-1", name="Monitor", category="monitor", status=AssetStatus.assigned)
    db.add(late)
    db.flush()
    db.add(AssetAssignment(asset_id=late.id, employee_id=people[0].id, assigned_by=actor, assigned_at=at(150), condition_at_assignment="New"))
    for u in people[:2]:
        db.add(LicenseAssignment(license_id=figma.id, user_id=u.id, assigned_at=at(3)))
    db.commit()
    ids = (product.id, figma.id)
    db.close()
    return ids


def test_history_shows_what_joiners_got_in_their_first_weeks_without_who_they_are():
    product_id, figma_id = _seed_history()
    _act_as("hr_admin")
    res = client.get("/api/v1/onboarding/joiner-history")
    assert res.status_code == 200
    body = res.json()
    designers = [j for j in body["joiners"] if j["designation"] == "Product Designer"]
    assert len(designers) == 2
    assert all(j["department_name"] == "Product" and j["department_id"] == str(product_id) for j in designers)
    assert all(j["licences"] == [{"id": str(figma_id), "name": "Figma"}] for j in designers)
    assert sorted(j["asset_categories"] for j in designers) == [["laptop"], ["laptop"]]  # the monitor came months later
    engineer = next(j for j in body["joiners"] if j["designation"] == "Backend Engineer")
    assert engineer["licences"] == [] and engineer["asset_categories"] == ["laptop"]
    text = res.text
    assert "Secret Name" not in text and "secret0@" not in text  # nothing identifying
    assert body["standard_items"][0] == "Collect Signed Employment Contract & ID Proof"


@pytest.mark.parametrize("role", ["employee", "manager", "it_admin", "auditor"])
def test_history_is_for_hr_only(role):
    _act_as(role)
    assert client.get("/api/v1/onboarding/joiner-history").status_code == 403


def test_new_joiner_gets_the_usual_items_after_the_standard_ones_without_duplicates():
    _act_as("hr_admin")
    res = client.post("/api/v1/onboarding/new-joiner", json={
        "full_name": "Meera Iyer", "email": "meera@example.com", "designation": "Product Designer", "date_of_joining": "2026-12-07",
        "extra_items": [
            {"task_name": "Prepare a laptop", "owner": "it_admin"},
            {"task_name": "Give a Figma seat", "owner": "it_admin"},
            {"task_name": "prepare a LAPTOP", "owner": "it_admin"},  # duplicate
            {"task_name": "Schedule Team Intro and Orientation Session", "owner": "hr_admin"},  # already standard
        ],
    })
    assert res.status_code == 201, res.text
    items = res.json()["checklist"]["items"]
    names = [i["task_name"] for i in sorted(items, key=lambda i: i["sort_order"])]
    assert names[:5] == [
        "Collect Signed Employment Contract & ID Proof", "Provision Corporate Email and SSO Accounts",
        "Issue Laptop, Monitor, and Hardware Accessories", "Assign Workspace & Physical Access Credentials",
        "Schedule Team Intro and Orientation Session",
    ]
    assert names[5:] == ["Prepare a laptop", "Give a Figma seat"]
    assert {i["owner_role_name"] for i in items if i["task_name"] == "Give a Figma seat"} == {"it_admin"}
    db = TestingSessionLocal()
    log = db.query(AuditLog).filter(AuditLog.action == "onboarding.checklist_created").one()
    assert log.after_state["extra_items"] == ["Prepare a laptop", "Give a Figma seat"]
    db.close()


def test_extra_items_are_checked():
    _act_as("hr_admin")
    base = {"full_name": "X", "email": "x@example.com", "designation": "Y", "date_of_joining": "2026-12-07"}
    assert client.post("/api/v1/onboarding/new-joiner", json={**base, "extra_items": [{"task_name": "Do it", "owner": "manager"}]}).status_code == 400
    assert client.post("/api/v1/onboarding/new-joiner", json={**base, "extra_items": [{"task_name": "a", "owner": "it_admin"}] * 16}).status_code == 400
