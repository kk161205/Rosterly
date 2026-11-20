"""
People who are leaving: nothing new is given to them, their account
isn't closed while they still hold a device or seat, a finished offboarding is
final, and approvals stop going to a manager who has left.
"""
import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.approver_resolution import resolve_manager_or_queue
from app.core.security import CurrentUser, get_current_user
from app.db.session import Base, get_db
from app.main import app
from app.models.assets import Asset, AssetAssignment, AssetStatus, LicenseAssignment, SoftwareLicense
from app.models.auth import Permission, Role, RolePermission, Session as SessionModel, User, UserStatus
from app.models.lifecycle import Checklist, ChecklistItem
from app.models.system import AuditLog, Notification

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)
client = TestClient(app)
GRANTS = {
    ("employee", "create"): ["super_admin", "hr_admin"],
    ("employee", "approve"): ["super_admin", "hr_admin"],
    ("assets", "update"): ["super_admin", "it_admin"],
    ("software_license", "update"): ["super_admin", "it_admin"],
}


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def world():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    for model in (ChecklistItem, Checklist, LicenseAssignment, SoftwareLicense, AssetAssignment, Asset, Notification, AuditLog,
                  SessionModel, User, RolePermission, Permission, Role):
        db.query(model).delete()
    roles = {n: Role(id=uuid.uuid4(), name=n, is_system_role=True) for n in ("super_admin", "hr_admin", "it_admin", "manager", "employee", "auditor")}
    db.add_all(roles.values())
    db.flush()
    for (res, act), names in GRANTS.items():
        perm = Permission(id=uuid.uuid4(), resource=res, action=act)
        db.add(perm)
        db.flush()
        db.add_all(RolePermission(role_id=roles[n].id, permission_id=perm.id) for n in names)
    people = {}
    for key, role in (("hr", "hr_admin"), ("it", "it_admin"), ("boss", "manager"), ("leaver", "employee")):
        uid = uuid.uuid4()
        db.add(User(id=uid, employee_code=f"L-{key}", full_name=key.title(), email=f"{key}@example.com", password_hash="h",
                    role_id=roles[role].id, status=UserStatus.active, designation="Staff", date_of_joining=date(2024, 1, 1)))
        people[key] = uid
    db.flush()
    db.query(User).filter(User.id == people["leaver"]).update({User.manager_id: people["boss"]})
    laptop = Asset(id=uuid.uuid4(), asset_tag="LAP-1", name="Laptop", category="laptop", status=AssetStatus.in_stock)
    lic = SoftwareLicense(id=uuid.uuid4(), name="Figma", vendor="Figma", total_seats=5)
    db.add_all([laptop, lic])
    ids = {"people": people, "roles": {n: r.id for n, r in roles.items()}, "laptop": laptop.id, "licence": lic.id}
    db.commit()
    db.close()
    yield ids
    app.dependency_overrides.clear()


def act_as(world, key, role):
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=world["people"][key], role=role, session_id=uuid.uuid4(), role_id=world["roles"][role])


def start_offboarding(world):
    act_as(world, "hr", "hr_admin")
    res = client.post("/api/v1/offboarding", json={"employee_id": str(world["people"]["leaver"])})
    assert res.status_code == 201, res.text
    return res.json()


def finish_items(checklist):
    for item in checklist["items"]:
        assert client.patch(f"/api/v1/offboarding/{checklist['id']}/items/{item['id']}", json={"status": "done"}).status_code == 200


def test_nothing_new_is_given_to_someone_who_is_leaving(world):
    start_offboarding(world)
    act_as(world, "it", "it_admin")
    res = client.post(f"/api/v1/assets/{world['laptop']}/assign", json={"employee_id": str(world["people"]["leaver"]), "condition_notes": "Good"})
    assert res.status_code == 409 and res.json()["error"]["code"] == "employee_leaving"
    seat = client.post(f"/api/v1/software-licenses/{world['licence']}/assignments", json={"employee_id": str(world["people"]["leaver"])})
    assert seat.status_code == 409 and seat.json()["error"]["code"] == "employee_leaving"


def test_the_account_isnt_closed_while_they_still_hold_something(world):
    checklist = start_offboarding(world)
    # A seat given behind the checklist's back (straight in the database, as an old flow might have).
    db = TestingSessionLocal()
    db.add(LicenseAssignment(license_id=world["licence"], user_id=world["people"]["leaver"]))
    db.commit()
    db.close()
    finish_items(checklist)
    res = client.post(f"/api/v1/offboarding/{checklist['id']}/complete")
    assert res.status_code == 409 and res.json()["error"]["code"] == "still_holding"
    assert "1 licence seat" in res.json()["error"]["message"]


def test_a_finished_offboarding_is_final_and_clears_them_as_a_manager(world):
    db = TestingSessionLocal()
    report = User(id=uuid.uuid4(), employee_code="L-rep", full_name="Report", email="rep@example.com", password_hash="h",
                  role_id=world["roles"]["employee"], status=UserStatus.active, designation="Staff",
                  date_of_joining=date(2024, 1, 1), manager_id=world["people"]["leaver"])
    db.add(report)
    db.commit()
    report_id = report.id
    db.close()
    checklist = start_offboarding(world)
    finish_items(checklist)
    assert client.post(f"/api/v1/offboarding/{checklist['id']}/complete").status_code == 200
    assert client.post(f"/api/v1/offboarding/{checklist['id']}/complete").status_code == 409  # not twice
    item = checklist["items"][0]
    assert client.patch(f"/api/v1/offboarding/{checklist['id']}/items/{item['id']}", json={"status": "pending"}).status_code == 409
    db = TestingSessionLocal()
    assert db.get(User, report_id).manager_id is None
    db.close()


def test_approvals_skip_a_manager_who_has_left(world):
    db = TestingSessionLocal()
    leaver = db.get(User, world["people"]["leaver"])
    queue = uuid.uuid4()
    assert resolve_manager_or_queue(leaver, queue) == (world["people"]["boss"], None)
    db.query(User).filter(User.id == world["people"]["boss"]).update({User.status: UserStatus.inactive})
    db.commit()
    db.expire_all()
    assert resolve_manager_or_queue(db.get(User, world["people"]["leaver"]), queue) == (None, queue)
    db.close()
