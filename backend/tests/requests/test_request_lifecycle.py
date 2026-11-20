"""
Requests from submission to done:
a manager who can't act never blocks a request, approved requests are
fulfilled by the right team, and approval chains can't be built so that a
request would wait forever.
"""
from datetime import date
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import CurrentUser, get_current_user
from app.db.session import Base, get_db
from app.main import app
from app.models.assets import Asset, AssetAssignment, MaintenanceTicket
from app.models.auth import Permission, Role, RolePermission, Session as SessionModel, User, UserStatus
from app.models.requests import ApprovalChainStep, ApprovalChainTemplate, Request, RequestApproval, RequestType
from app.models.system import AuditLog, Notification

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)
client = TestClient(app)

ROLE_NAMES = ["super_admin", "it_admin", "hr_admin", "manager", "employee", "auditor"]
GRANTS = {
    ("request", "create"): ROLE_NAMES,
    ("request", "read"): ROLE_NAMES,
    ("request", "update"): ROLE_NAMES,
    ("request", "approve"): ["manager", "hr_admin", "it_admin", "super_admin"],
    ("request", "fulfil"): ["it_admin", "hr_admin", "super_admin"],
    ("user", "update"): ["super_admin", "hr_admin"],
    ("approval_chain", "create"): ["super_admin"],
    ("approval_chain", "read"): ["super_admin"],
    ("maintenance_ticket", "create"): ["it_admin", "super_admin"],
}


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def w():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    for model in (Notification, AuditLog, MaintenanceTicket, AssetAssignment, Asset, RequestApproval, Request,
                  ApprovalChainStep, ApprovalChainTemplate, SessionModel, User, RolePermission, Permission, Role):
        db.query(model).delete()
    roles = {n: Role(id=uuid.uuid4(), name=n, is_system_role=True) for n in ROLE_NAMES}
    db.add_all(roles.values())
    db.flush()
    for (res, act), names in GRANTS.items():
        perm = Permission(id=uuid.uuid4(), resource=res, action=act)
        db.add(perm)
        db.flush()
        db.add_all(RolePermission(role_id=roles[n].id, permission_id=perm.id) for n in names)

    def person(name, role, manager=None, status=UserStatus.active):
        u = User(id=uuid.uuid4(), employee_code=f"RST-{uuid.uuid4().hex[:5]}", full_name=name, email=f"{name}@example.com",
                 password_hash="h", role_id=roles[role].id, manager_id=manager.id if manager else None, status=status,
                 designation="Staff", date_of_joining=date(2025, 1, 1))
        db.add(u)
        db.flush()
        return u

    boss = person("boss", "manager")
    ids = {
        "boss": boss.id,
        "emp": person("emp", "employee", manager=boss).id,
        "it": person("it", "it_admin").id,
        "hr": person("hr", "hr_admin").id,
        "root": person("root", "super_admin").id,
    }
    gone_boss = person("gone", "manager", status=UserStatus.inactive)
    ids["orphan"] = person("orphan", "employee", manager=gone_boss).id

    for rtype, steps in ((RequestType.asset_request, ["manager", "it_admin"]), (RequestType.other, ["manager", "hr_admin"])):
        t = ApprovalChainTemplate(id=uuid.uuid4(), request_type=rtype, name=f"{rtype.value} chain", is_active=True)
        db.add(t)
        db.flush()
        for i, rn in enumerate(steps, start=1):
            db.add(ApprovalChainStep(id=uuid.uuid4(), template_id=t.id, step_order=i, approver_role_id=roles[rn].id))
    db.commit()
    state = {"ids": ids, "roles": {k: v.id for k, v in roles.items()}}
    db.close()
    yield state
    app.dependency_overrides.clear()


ROLE_OF = {"boss": "manager", "emp": "employee", "it": "it_admin", "hr": "hr_admin", "root": "super_admin", "orphan": "employee"}


def as_(w, who):
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=w["ids"][who], role=ROLE_OF[who], session_id=uuid.uuid4(), role_id=w["roles"][ROLE_OF[who]]
    )


def submit(w, who="emp", rtype="asset_request", title="New laptop"):
    as_(w, who)
    res = client.post("/api/v1/requests", json={"request_type": rtype, "title": title, "description": "Need it"})
    assert res.status_code == 201, res.text
    return res.json()


def approve_all(w, req_id, *who):
    for p in who:
        as_(w, p)
        assert client.post(f"/api/v1/requests/{req_id}/approve", json={}).status_code == 200


# ------------------------------------------------------------ B11

def test_an_inactive_manager_is_skipped_at_submission(w):
    req = submit(w, who="orphan")
    steps = req["approvals"]
    assert steps[0]["status"] == "skipped" and steps[1]["status"] == "pending"
    assert req["waiting_on_role"] == "it_admin"


def test_deactivating_a_manager_moves_their_waiting_steps_to_hr(w):
    req = submit(w)
    as_(w, "root")
    assert client.patch(f"/api/v1/users/{w['ids']['boss']}/status", json={"status": "inactive"}).status_code == 200
    db = TestingSessionLocal()
    step = db.query(RequestApproval).filter_by(request_id=uuid.UUID(req["id"]), step_order=1).one()
    assert step.approver_id is None and step.approver_role_id == w["roles"]["hr_admin"]
    assert db.query(Notification).filter_by(user_id=w["ids"]["hr"], title="Request moved to you").count() == 1
    db.close()
    as_(w, "hr")
    assert client.post(f"/api/v1/requests/{req['id']}/approve", json={}).status_code == 200


# ------------------------------------------------------------ fulfilment

def test_it_fulfils_an_approved_asset_request_and_the_requester_hears(w):
    req = submit(w)
    approve_all(w, req["id"], "boss", "it")

    as_(w, "it")
    queue = client.get("/api/v1/requests/to-fulfil").json()
    assert [r["id"] for r in queue["items"]] == [req["id"]]
    res = client.post(f"/api/v1/requests/{req['id']}/fulfilment", json={"status": "in_progress", "note": "Ordered, arrives Friday"})
    assert res.status_code == 200 and res.json()["status"] == "in_progress"
    res = client.post(f"/api/v1/requests/{req['id']}/fulfilment", json={"status": "completed", "note": "Collect from IT desk"})
    body = res.json()
    assert body["status"] == "completed" and body["fulfilled_by_name"] == "it" and body["fulfilment_note"] == "Collect from IT desk"
    assert client.post(f"/api/v1/requests/{req['id']}/fulfilment", json={"status": "in_progress"}).status_code == 409

    db = TestingSessionLocal()
    titles = [t for (t,) in db.query(Notification.title).filter_by(user_id=w["ids"]["emp"])]
    assert {"Request approved", "Your request is being worked on", "Your request is done"} <= set(titles)
    assert db.query(AuditLog).filter_by(action="request.fulfilment_updated").count() == 2
    db.close()


def test_the_right_team_fulfils_each_kind_of_request(w):
    other = submit(w, rtype="other", title="Parking pass")
    approve_all(w, other["id"], "boss", "hr")
    as_(w, "it")
    assert client.post(f"/api/v1/requests/{other['id']}/fulfilment", json={"status": "completed"}).status_code == 403
    assert client.get("/api/v1/requests/to-fulfil").json()["items"] == []
    as_(w, "hr")
    assert client.get(f"/api/v1/requests/{other['id']}").status_code == 200  # can open it to fulfil
    assert client.post(f"/api/v1/requests/{other['id']}/fulfilment", json={"status": "completed"}).status_code == 200


def test_pending_requests_cannot_be_fulfilled_and_employees_cannot_fulfil(w):
    req = submit(w)
    as_(w, "it")
    assert client.post(f"/api/v1/requests/{req['id']}/fulfilment", json={"status": "completed"}).status_code == 409
    as_(w, "emp")
    assert client.post(f"/api/v1/requests/{req['id']}/fulfilment", json={"status": "completed"}).status_code == 403
    assert client.get("/api/v1/requests/to-fulfil").status_code == 403


# ------------------------------------------------------------ B12 chain checks

def test_chains_reject_roles_that_cannot_approve_and_double_manager_steps(w):
    as_(w, "root")
    url = "/api/v1/approval-chains"
    bad_role = client.post(url, json={"request_type": "it_ticket", "name": "Bad", "steps": [
        {"step_order": 1, "approver_role_id": str(w["roles"]["employee"])}]})
    assert bad_role.status_code == 400 and "can't approve" in bad_role.json()["error"]["field_errors"]["steps.approver_role_id"]
    double = client.post(url, json={"request_type": "it_ticket", "name": "Double", "steps": [
        {"step_order": 1, "approver_role_id": str(w["roles"]["manager"])},
        {"step_order": 2, "approver_role_id": str(w["roles"]["manager"])}]})
    assert double.status_code == 400 and "only one manager step" in double.json()["error"]["field_errors"]["steps"]


# ------------------------------------------------------------ S4 ticket priority

def test_only_it_sets_ticket_priority_when_reporting(w):
    db = TestingSessionLocal()
    asset = Asset(id=uuid.uuid4(), asset_tag="AST-1", name="Laptop", category="laptop", vendor="Dell",
                  purchase_date=date(2025, 1, 1), purchase_cost=1000,
                  current_holder_id=w["ids"]["emp"])
    db.add(asset)
    db.add(AssetAssignment(id=uuid.uuid4(), asset_id=asset.id, employee_id=w["ids"]["emp"], assigned_by=w["ids"]["it"], condition_at_assignment="Good"))
    db.commit()
    asset_id = str(asset.id)
    db.close()
    as_(w, "emp")
    res = client.post("/api/v1/maintenance-tickets", json={"asset_id": asset_id, "issue_description": "Screen flickers", "priority": "critical"})
    assert res.status_code == 201 and res.json()["priority"] == "medium"
    as_(w, "it")
    res = client.post("/api/v1/maintenance-tickets", json={"asset_id": asset_id, "issue_description": "Battery", "priority": "high"})
    assert res.json()["priority"] == "high"
