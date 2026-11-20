"""
Licence seats: IT gives and frees seats,
offboarding reclaims them, and a connected provider keeps its licences in step
without touching manual ones.
"""
import uuid
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import CurrentUser, get_current_user
from app.db.session import Base, get_db
from app.main import app
from app.models.assets import LicenseAssignment, SoftwareLicense
from app.models.auth import Permission, Role, RolePermission, User, UserStatus
from app.models.lifecycle import Checklist, ChecklistItem
from app.models.system import AuditLog, Notification
from app.modules.licenses.sync import ProviderSubscription, sync_from_provider

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)
client = TestClient(app)
URL = "/api/v1/software-licenses"

GRANTS = {
    ("software_license", "read"): ["it_admin", "super_admin", "auditor"],
    ("software_license", "update"): ["it_admin", "super_admin"],
    ("employee", "create"): ["hr_admin", "super_admin"],
}


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def world():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    for model in (ChecklistItem, Checklist, Notification, AuditLog, LicenseAssignment, SoftwareLicense, User,
                  RolePermission, Permission, Role):
        db.query(model).delete()
    roles = {n: Role(id=uuid.uuid4(), name=n, is_system_role=True)
             for n in ("super_admin", "hr_admin", "it_admin", "manager", "employee", "auditor")}
    db.add_all(roles.values())
    db.flush()
    for (res, act), names in GRANTS.items():
        perm = Permission(id=uuid.uuid4(), resource=res, action=act)
        db.add(perm)
        db.flush()
        db.add_all(RolePermission(role_id=roles[n].id, permission_id=perm.id) for n in names)

    def user(name, role="employee", status=UserStatus.active):
        u = User(id=uuid.uuid4(), employee_code=f"RST-{uuid.uuid4().hex[:5]}", full_name=name,
                 email=f"{name.lower().replace(' ', '.')}@example.com", password_hash="h", role_id=roles[role].id,
                 status=status, designation="Staff", date_of_joining=date(2025, 1, 1))
        db.add(u)
        db.flush()
        return u

    people = {n: user(n) for n in ("Asha", "Ben", "Cara")}
    people["Gone"] = user("Gone", status=UserStatus.terminated)
    it = user("IT Person", "it_admin")
    hr = user("HR Person", "hr_admin")
    figma = SoftwareLicense(id=uuid.uuid4(), name="Figma", vendor="Figma", total_seats=2, cost_per_seat=Decimal("1200"))
    db.add(figma)
    db.commit()
    state = {"people": {k: v.id for k, v in people.items()}, "it": it.id, "hr": hr.id, "figma": figma.id,
             "roles": {k: v.id for k, v in roles.items()}}
    db.close()
    yield state
    app.dependency_overrides.clear()


def act_as(world, key, role):
    uid = world[key]
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=uid, role=role, session_id=uuid.uuid4(), role_id=world["roles"][role]
    )


def test_it_assigns_and_frees_seats(world):
    act_as(world, "it", "it_admin")
    asha, ben, cara = (world["people"][k] for k in ("Asha", "Ben", "Cara"))
    res = client.post(f"{URL}/{world['figma']}/assignments", json={"employee_id": str(asha)})
    assert res.status_code == 201
    assert [h["full_name"] for h in res.json()["holders"]] == ["Asha"]
    assert client.post(f"{URL}/{world['figma']}/assignments", json={"employee_id": str(asha)}).status_code == 409  # already has one
    assert client.post(f"{URL}/{world['figma']}/assignments", json={"employee_id": str(ben)}).status_code == 201
    full = client.post(f"{URL}/{world['figma']}/assignments", json={"employee_id": str(cara)})
    assert full.status_code == 409 and full.json()["error"]["code"] == "no_free_seats"

    seat_id = res.json()["holders"][0]["assignment_id"]
    freed = client.delete(f"{URL}/{world['figma']}/assignments/{seat_id}")
    assert freed.status_code == 200 and [h["full_name"] for h in freed.json()["holders"]] == ["Ben"]
    assert client.get(URL).json()["items"][0]["seats_used"] == 1
    db = TestingSessionLocal()
    actions = [a for (a,) in db.query(AuditLog.action).filter(AuditLog.entity_type == "software_license")]
    assert actions.count("software_license.seat_assigned") == 2 and "software_license.seat_removed" in actions
    db.close()


def test_people_who_cannot_sign_in_get_no_seat(world):
    act_as(world, "it", "it_admin")
    res = client.post(f"{URL}/{world['figma']}/assignments", json={"employee_id": str(world["people"]["Gone"])})
    assert res.status_code == 409


@pytest.mark.parametrize(("key", "role"), [("hr", "hr_admin")])
def test_only_it_and_super_admins_change_seats(world, key, role):
    act_as(world, key, role)
    res = client.post(f"{URL}/{world['figma']}/assignments", json={"employee_id": str(world["people"]["Asha"])})
    assert res.status_code == 403


def test_offboarding_lists_seats_and_completing_frees_them(world):
    act_as(world, "it", "it_admin")
    asha = world["people"]["Asha"]
    client.post(f"{URL}/{world['figma']}/assignments", json={"employee_id": str(asha)})

    act_as(world, "hr", "hr_admin")
    res = client.post("/api/v1/offboarding", json={"employee_id": str(asha)})
    assert res.status_code == 201, res.text
    checklist = res.json()
    seat_item = next(i for i in checklist["items"] if i["task_name"].startswith("Remove licence seat: Figma"))
    assert seat_item["license_assignment_id"]

    done = client.patch(f"/api/v1/offboarding/{checklist['id']}/items/{seat_item['id']}", json={"status": "done"})
    assert done.status_code == 200, done.text
    act_as(world, "it", "it_admin")
    assert client.get(URL).json()["items"][0]["seats_used"] == 0


def test_provider_sync_creates_updates_and_reconciles_without_touching_manual_seats(world):
    act_as(world, "it", "it_admin")
    client.post(f"{URL}/{world['figma']}/assignments", json={"employee_id": str(world["people"]["Asha"])})

    db = TestingSessionLocal()
    first = sync_from_provider(db, "microsoft_365", [
        ProviderSubscription("sku-e3", "Microsoft 365 E3", "Microsoft", 10, ["asha@example.com", "ben@example.com", "nobody@example.com"]),
    ])
    assert (first.licences_created, first.seats_added) == (1, 2)
    assert first.unmatched_emails == ["nobody@example.com"]

    second = sync_from_provider(db, "microsoft_365", [
        ProviderSubscription("sku-e3", "Microsoft 365 E3", "Microsoft", 12, ["ben@example.com", "cara@example.com"]),
    ])
    assert (second.licences_updated, second.seats_added, second.seats_removed) == (1, 1, 1)
    db.close()

    rows = {r["name"]: r for r in client.get(URL).json()["items"]}
    assert rows["Microsoft 365 E3"]["source"] == "microsoft_365"
    assert (rows["Microsoft 365 E3"]["total_seats"], rows["Microsoft 365 E3"]["seats_used"]) == (12, 2)
    assert rows["Figma"]["seats_used"] == 1  # the manual licence is untouched

    e3 = rows["Microsoft 365 E3"]["id"]
    holder = client.get(f"{URL}/{e3}/holders").json()["holders"][0]
    assert client.delete(f"{URL}/{e3}/assignments/{holder['assignment_id']}").status_code == 409  # provider-managed
    blocked = client.post(f"{URL}/{e3}/assignments", json={"employee_id": str(world["people"]["Asha"])})
    assert blocked.json()["error"]["code"] == "provider_managed"
