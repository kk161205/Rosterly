"""
§5.11/§5.12 approval routing when the requester has no reporting manager.

A manager step is created with status `skipped` (§1.13) and the chain starts at
the next step, so top-level staff aren't blocked; the remaining approvals still
apply. Uses a real SQLite database so the full create → approve flow runs.
"""
from datetime import date
from decimal import Decimal
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import CurrentUser, get_current_user
from app.db.session import Base, get_db
from app.main import app
from app.models.auth import Permission, Role, RolePermission, User, UserStatus
from app.models.requests import (
    ApprovalChainStep,
    ApprovalChainTemplate,
    Request,
    RequestApproval,
    RequestType,
)
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
}


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def seed():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    for model in (Notification, AuditLog, RequestApproval, Request, ApprovalChainStep,
                  ApprovalChainTemplate, User, RolePermission, Permission, Role):
        db.query(model).delete()
    db.commit()

    roles = {name: Role(id=uuid.uuid4(), name=name, is_system_role=True) for name in ROLE_NAMES}
    db.add_all(roles.values())
    db.flush()
    for (resource, action), names in GRANTS.items():
        perm = Permission(id=uuid.uuid4(), resource=resource, action=action)
        db.add(perm)
        db.flush()
        db.add_all(RolePermission(role_id=roles[n].id, permission_id=perm.id) for n in names)

    std = ApprovalChainTemplate(id=uuid.uuid4(), request_type=RequestType.asset_request,
                                name="Standard Asset Request", min_amount=None, is_active=True)
    db.add(std)
    db.flush()
    db.add_all([
        ApprovalChainStep(id=uuid.uuid4(), template_id=std.id, step_order=1, approver_role_id=roles["manager"].id),
        ApprovalChainStep(id=uuid.uuid4(), template_id=std.id, step_order=2, approver_role_id=roles["it_admin"].id),
    ])
    db.commit()
    db.close()
    yield
    app.dependency_overrides.clear()


def _user(role_name: str, manager_id=None) -> User:
    db = TestingSessionLocal()
    role = db.query(Role).filter(Role.name == role_name).one()
    uid = uuid.uuid4()
    user = User(id=uid, employee_code=f"RST-{uid.hex[:5].upper()}", full_name=f"{role_name} user",
                email=f"{uid.hex[:8]}@example.com", password_hash="h", role_id=role.id,
                manager_id=manager_id, status=UserStatus.active, designation="Staff",
                date_of_joining=date(2025, 1, 1))
    db.add(user)
    db.commit()
    db.refresh(user)
    db.expunge(user)
    db.close()
    return user


def _act_as(user: User, role_name: str) -> None:
    current = CurrentUser(user_id=user.id, role=role_name, session_id=uuid.uuid4(),
                          email=user.email, full_name=user.full_name, role_id=user.role_id)
    app.dependency_overrides[get_current_user] = lambda: current


def _submit() -> dict:
    res = client.post("/api/v1/requests", json={
        "request_type": "asset_request", "title": "Docking station",
        "description": "USB-C dock for the desk", "estimated_cost": str(Decimal("8000")),
    })
    assert res.status_code == 201, res.text
    return res.json()


def test_requester_without_manager_skips_manager_step_and_starts_at_it():
    it_admin = _user("it_admin")
    top_level = _user("employee", manager_id=None)
    _act_as(top_level, "employee")

    body = _submit()
    steps = sorted(body["approvals"], key=lambda a: a["step_order"])
    assert [s["status"] for s in steps] == ["skipped", "pending"]
    assert "no reporting manager" in steps[0]["comments"]
    assert body["current_step"] == 2

    db = TestingSessionLocal()
    notified = {n.user_id for n in db.query(Notification).filter(Notification.type == "approval_needed")}
    db.close()
    assert notified == {it_admin.id}


def test_it_admin_approval_completes_request_after_skipped_manager_step():
    it_admin = _user("it_admin")
    top_level = _user("employee", manager_id=None)
    _act_as(top_level, "employee")
    req_id = _submit()["id"]

    _act_as(it_admin, "it_admin")
    res = client.post(f"/api/v1/requests/{req_id}/approve", json={"comments": "Approved"})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "approved"


def test_requester_with_manager_keeps_both_steps_pending():
    manager = _user("manager")
    employee = _user("employee", manager_id=manager.id)
    _act_as(employee, "employee")

    body = _submit()
    assert [a["status"] for a in sorted(body["approvals"], key=lambda a: a["step_order"])] == ["pending", "pending"]
    assert body["current_step"] == 1


def test_manager_approval_advances_to_next_pending_step():
    manager = _user("manager")
    employee = _user("employee", manager_id=manager.id)
    _act_as(employee, "employee")
    req_id = _submit()["id"]

    _act_as(manager, "manager")
    res = client.post(f"/api/v1/requests/{req_id}/approve", json={})
    assert res.status_code == 200
    assert res.json()["status"] == "pending"
    assert res.json()["current_step"] == 2


def test_my_requests_say_who_they_are_waiting_on():
    manager = _user("manager")
    employee = _user("employee", manager_id=manager.id)
    _act_as(employee, "employee")
    _submit()

    res = client.get("/api/v1/requests/mine")
    assert res.status_code == 200, res.text
    item = res.json()["items"][0]
    assert item["total_steps"] == 2
    assert item["waiting_on_role"] == "manager"

    req_id = item["id"]
    _act_as(manager, "manager")
    client.post(f"/api/v1/requests/{req_id}/approve", json={})
    _act_as(employee, "employee")
    assert client.get("/api/v1/requests/mine").json()["items"][0]["waiting_on_role"] == "it_admin"
