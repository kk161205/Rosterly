"""
§5.2a Home — Inbox (GET /inbox).

Role scoping (decisions need request:approve, tickets need maintenance_ticket:update,
tasks follow checklist owner_role_id), the evidence checks on a decision, the
done-today strip, and INR formatting. Real SQLite so the request service creates
the approval chain exactly as in production.
"""
from datetime import date, datetime, timedelta, timezone
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
from app.models.assets import (
    Asset,
    AssetAssignment,
    AssetCategory,
    AssetStatus,
    DepreciationMethod,
    MaintenancePriority,
    MaintenanceStatus,
    MaintenanceTicket,
)
from app.models.auth import Permission, Role, RolePermission, User, UserStatus
from app.models.lifecycle import Checklist, ChecklistItem, ChecklistItemStatus, ChecklistStatus, ChecklistType
from app.models.requests import (
    ApprovalChainStep,
    ApprovalChainTemplate,
    Request,
    RequestApproval,
    RequestType,
)
from app.models.system import AuditLog, Notification
from app.modules.inbox.service import format_inr

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)
client = TestClient(app)

ROLE_NAMES = ["super_admin", "it_admin", "hr_admin", "manager", "employee", "auditor"]
GRANTS = {
    ("request", "create"): ROLE_NAMES,
    ("request", "read"): ROLE_NAMES,
    ("request", "approve"): ["manager", "hr_admin", "it_admin", "super_admin"],
    ("maintenance_ticket", "update"): ["it_admin", "super_admin"],
    ("maintenance_ticket", "read"): ["it_admin", "super_admin"],
}
THRESHOLD = Decimal("50000")


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
    for model in (Notification, AuditLog, RequestApproval, Request, ApprovalChainStep, ApprovalChainTemplate,
                  ChecklistItem, Checklist, MaintenanceTicket, AssetAssignment, Asset,
                  User, RolePermission, Permission, Role):
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
    high = ApprovalChainTemplate(id=uuid.uuid4(), request_type=RequestType.asset_request,
                                 name="High-Value Asset Request", min_amount=THRESHOLD, is_active=True)
    db.add_all([std, high])
    db.flush()
    db.add_all([
        ApprovalChainStep(id=uuid.uuid4(), template_id=std.id, step_order=1, approver_role_id=roles["manager"].id),
        ApprovalChainStep(id=uuid.uuid4(), template_id=std.id, step_order=2, approver_role_id=roles["it_admin"].id),
        ApprovalChainStep(id=uuid.uuid4(), template_id=high.id, step_order=1, approver_role_id=roles["manager"].id),
        ApprovalChainStep(id=uuid.uuid4(), template_id=high.id, step_order=2, approver_role_id=roles["it_admin"].id),
        ApprovalChainStep(id=uuid.uuid4(), template_id=high.id, step_order=3,
                          approver_role_id=roles["super_admin"].id),
    ])
    db.commit()
    db.close()
    yield
    app.dependency_overrides.clear()


def _user(role_name: str, manager_id=None, name=None, status=UserStatus.active, date_of_exit=None) -> User:
    db = TestingSessionLocal()
    role = db.query(Role).filter(Role.name == role_name).one()
    uid = uuid.uuid4()
    user = User(id=uid, employee_code=f"RST-{uid.hex[:5].upper()}", full_name=name or f"{role_name} user",
                email=f"{uid.hex[:8]}@example.com", password_hash="h", role_id=role.id,
                manager_id=manager_id, status=status, designation="Staff",
                date_of_joining=date(2025, 1, 1), date_of_exit=date_of_exit)
    db.add(user)
    db.commit()
    db.refresh(user)
    db.expunge(user)
    db.close()
    return user


def _asset(tag: str, name: str, status=AssetStatus.in_stock, holder_id=None) -> Asset:
    db = TestingSessionLocal()
    asset = Asset(id=uuid.uuid4(), asset_tag=tag, name=name, category=AssetCategory.laptop, vendor="Dell",
                  purchase_date=date(2025, 1, 1), purchase_cost=Decimal("90000"), current_value=Decimal("80000"),
                  depreciation_method=DepreciationMethod.straight_line, useful_life_months=36,
                  status=status, current_holder_id=holder_id)
    db.add(asset)
    if holder_id:
        db.add(AssetAssignment(id=uuid.uuid4(), asset_id=asset.id, employee_id=holder_id, assigned_by=holder_id,
                               assigned_at=datetime.now(timezone.utc), condition_at_assignment="good"))
    db.commit()
    db.refresh(asset)
    db.expunge(asset)
    db.close()
    return asset


def _act_as(user: User, role_name: str) -> None:
    current = CurrentUser(user_id=user.id, role=role_name, session_id=uuid.uuid4(),
                          email=user.email, full_name=user.full_name, role_id=user.role_id)
    app.dependency_overrides[get_current_user] = lambda: current


def _submit(cost: str, related_asset_id=None) -> str:
    payload = {"request_type": "asset_request", "title": "New laptop",
               "description": "Replacement for a failing machine", "estimated_cost": cost}
    if related_asset_id:
        payload["related_asset_id"] = str(related_asset_id)
    res = client.post("/api/v1/requests", json=payload)
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _inbox() -> dict:
    res = client.get("/api/v1/inbox")
    assert res.status_code == 200, res.text
    return res.json()


# ---------------------------------------------------------------- formatting

def test_format_inr_uses_indian_grouping():
    assert format_inr(Decimal("249900")) == "₹2,49,900"
    assert format_inr(Decimal("18500")) == "₹18,500"
    assert format_inr(Decimal("500")) == "₹500"
    assert format_inr(Decimal("12345678")) == "₹1,23,45,678"


# ---------------------------------------------------------------- decisions

def test_manager_sees_direct_report_request_with_chain_and_checks():
    manager = _user("manager")
    employee = _user("employee", manager_id=manager.id, name="Asha Rao")
    _asset("AST-0001", "ThinkPad T14", status=AssetStatus.assigned, holder_id=employee.id)
    _act_as(employee, "employee")
    req_id = _submit("249900")

    _act_as(manager, "manager")
    body = _inbox()
    assert body["counts"] == {"decisions": 1, "tasks": 0, "tickets": 0}
    item = body["items"][0]
    assert item["id"] == f"approval:{req_id}"
    assert item["kind"] == "approval"
    assert "₹2,49,900" in item["meta"]

    detail = item["approval"]
    assert detail["total_steps"] == 3 and detail["current_step"] == 1
    assert [s["is_current"] for s in detail["chain"]] == [True, False, False]
    texts = [c["text"] for c in detail["checks"]]
    assert any("high-value threshold" in t and "Super admin" in t for t in texts)
    assert any("Asha currently holds 1 asset: ThinkPad T14" in t for t in texts)
    assert detail["attention_count"] == 1


def test_below_threshold_cost_passes_and_unavailable_asset_needs_attention():
    manager = _user("manager")
    holder = _user("employee", name="Ravi Kumar")
    employee = _user("employee", manager_id=manager.id, name="Asha Rao")
    wanted = _asset("AST-0002", "Dell monitor", status=AssetStatus.assigned, holder_id=holder.id)
    _act_as(employee, "employee")
    _submit("18500", related_asset_id=wanted.id)

    _act_as(manager, "manager")
    checks = _inbox()["items"][0]["approval"]["checks"]
    by_status = {c["status"]: c["text"] for c in checks if c["status"] != "info"}
    assert "below the ₹50,000" in by_status["pass"]
    assert "AST-0002 is assigned to Ravi Kumar" in by_status["attention"]


def test_offboarding_requester_is_flagged():
    manager = _user("manager")
    leaving = _user("employee", manager_id=manager.id, name="Asha Rao",
                    status=UserStatus.offboarding, date_of_exit=date(2026, 11, 30))
    _act_as(leaving, "employee")
    _submit("8000")

    _act_as(manager, "manager")
    checks = _inbox()["items"][0]["approval"]["checks"]
    assert {"status": "attention", "text": "Asha is offboarding (last day 30 Nov 2026)."} in checks


def test_request_is_not_in_other_managers_or_next_step_inbox():
    manager = _user("manager")
    other_manager = _user("manager")
    it_admin = _user("it_admin")
    employee = _user("employee", manager_id=manager.id)
    _act_as(employee, "employee")
    _submit("8000")

    for user, role in ((other_manager, "manager"), (it_admin, "it_admin")):
        _act_as(user, role)
        assert _inbox()["counts"]["decisions"] == 0


def test_employee_without_approve_permission_gets_no_decisions():
    employee = _user("employee")
    _act_as(employee, "employee")
    _submit("8000")
    body = _inbox()
    assert body["counts"] == {"decisions": 0, "tasks": 0, "tickets": 0}
    assert body["items"] == [] and body["done_today"] == []


def test_approved_step_moves_to_done_today_and_next_approver():
    manager = _user("manager")
    it_admin = _user("it_admin")
    employee = _user("employee", manager_id=manager.id)
    _act_as(employee, "employee")
    req_id = _submit("8000")

    _act_as(manager, "manager")
    assert client.post(f"/api/v1/requests/{req_id}/approve", json={}).status_code == 200
    body = _inbox()
    assert body["counts"]["decisions"] == 0
    assert [(d["kind"], d["outcome"]) for d in body["done_today"]] == [("approval", "Approved")]

    _act_as(it_admin, "it_admin")
    assert _inbox()["counts"]["decisions"] == 1


# ---------------------------------------------------------------- tasks

def _checklist(employee: User, owner_role_name: str, ctype=ChecklistType.onboarding,
               cstatus=ChecklistStatus.in_progress) -> None:
    db = TestingSessionLocal()
    role = db.query(Role).filter(Role.name == owner_role_name).one()
    checklist = Checklist(id=uuid.uuid4(), employee_id=employee.id, type=ctype, status=cstatus)
    db.add(checklist)
    db.flush()
    db.add_all([
        ChecklistItem(id=uuid.uuid4(), checklist_id=checklist.id, task_name="Provision laptop",
                      owner_role_id=role.id, status=ChecklistItemStatus.pending, sort_order=1),
        ChecklistItem(id=uuid.uuid4(), checklist_id=checklist.id, task_name="Create email account",
                      owner_role_id=role.id, status=ChecklistItemStatus.done, sort_order=2),
    ])
    db.commit()
    db.close()


def test_tasks_follow_owner_role_and_skip_done_and_completed_checklists():
    it_admin = _user("it_admin")
    hr_admin = _user("hr_admin")
    joiner = _user("employee", name="Neha Singh")
    _checklist(joiner, "it_admin")
    _checklist(_user("employee"), "it_admin", cstatus=ChecklistStatus.completed)

    _act_as(it_admin, "it_admin")
    body = _inbox()
    assert body["counts"]["tasks"] == 1
    task = body["items"][0]
    assert task["kind"] == "task" and task["title"] == "Provision laptop"
    assert task["meta"] == "Onboarding · Neha Singh · joined 01 Jan 2025"
    assert task["task"]["employee"]["full_name"] == "Neha Singh"

    _act_as(hr_admin, "hr_admin")
    assert _inbox()["counts"]["tasks"] == 0


def test_tasks_are_ordered_by_key_date_and_use_future_tense_for_upcoming():
    it_admin = _user("it_admin")
    soon = date.today() + timedelta(days=3)
    later = date.today() + timedelta(days=20)
    db = TestingSessionLocal()
    for name, joining in (("Later Joiner", later), ("Soon Joiner", soon)):
        db.query(User).filter(User.id == _user("employee", name=name).id).update({User.date_of_joining: joining})
    db.commit()
    later_user = db.query(User).filter(User.full_name == "Later Joiner").one()
    soon_user = db.query(User).filter(User.full_name == "Soon Joiner").one()
    db.expunge_all()
    db.close()
    _checklist(later_user, "it_admin")
    _checklist(soon_user, "it_admin")

    _act_as(it_admin, "it_admin")
    metas = [i["meta"] for i in _inbox()["items"]]
    assert metas[0].startswith("Onboarding · Soon Joiner · joins ")
    assert metas[1].startswith("Onboarding · Later Joiner · joins ")


def test_it_ticket_request_type_reads_as_it_ticket():
    manager = _user("manager")
    employee = _user("employee", manager_id=manager.id)
    db = TestingSessionLocal()
    std = db.query(ApprovalChainTemplate).filter(ApprovalChainTemplate.min_amount.is_(None)).one()
    std.request_type = RequestType.it_ticket
    db.commit()
    db.close()
    _act_as(employee, "employee")
    res = client.post("/api/v1/requests", json={"request_type": "it_ticket", "title": "VPN drops",
                                                "description": "Disconnects every few minutes"})
    assert res.status_code == 201, res.text

    _act_as(manager, "manager")
    assert _inbox()["items"][0]["meta"] == "IT ticket"


# ---------------------------------------------------------------- tickets

def _ticket(asset: Asset, reporter: User, assigned_to=None, status=MaintenanceStatus.open, resolved_at=None):
    db = TestingSessionLocal()
    db.add(MaintenanceTicket(id=uuid.uuid4(), asset_id=asset.id, reported_by=reporter.id,
                             issue_description="Battery swells and the lid will not close",
                             priority=MaintenancePriority.high, status=status,
                             assigned_to=assigned_to, resolved_at=resolved_at))
    db.commit()
    db.close()


def test_tickets_show_mine_and_unassigned_only_for_it_roles():
    it_admin = _user("it_admin")
    other_it = _user("it_admin")
    reporter = _user("employee")
    laptop = _asset("AST-0003", "MacBook Air")
    _ticket(laptop, reporter)                                   # unassigned → shown
    _ticket(laptop, reporter, assigned_to=it_admin.id)          # mine → shown
    _ticket(laptop, reporter, assigned_to=other_it.id)          # someone else's → hidden
    _ticket(laptop, reporter, assigned_to=it_admin.id, status=MaintenanceStatus.resolved,
            resolved_at=datetime.now(timezone.utc) - timedelta(hours=2))      # done today
    _ticket(laptop, reporter, assigned_to=it_admin.id, status=MaintenanceStatus.closed,
            resolved_at=datetime.now(timezone.utc) - timedelta(days=3))       # too old

    _act_as(it_admin, "it_admin")
    body = _inbox()
    assert body["counts"]["tickets"] == 2
    tickets = [i["ticket"] for i in body["items"] if i["kind"] == "ticket"]
    assert sorted(t["assigned_to_me"] for t in tickets) == [False, True]
    assert body["items"][0]["meta"] == "AST-0003 · High priority"
    assert [(d["kind"], d["outcome"]) for d in body["done_today"]] == [("ticket", "Resolved")]

    _act_as(reporter, "employee")
    assert _inbox()["counts"]["tickets"] == 0


def test_inbox_requires_authentication():
    app.dependency_overrides.pop(get_current_user, None)
    assert client.get("/api/v1/inbox").status_code == 401


def test_ticket_list_names_the_asset():
    it_admin = _user("it_admin")
    reporter = _user("employee")
    _ticket(_asset("AST-0042", "ThinkPad X1"), reporter)
    _act_as(it_admin, "it_admin")
    res = client.get("/api/v1/maintenance-tickets")
    assert res.status_code == 200, res.text
    item = res.json()["items"][0]
    assert (item["asset_tag"], item["asset_name"]) == ("AST-0042", "ThinkPad X1")


def test_checklist_list_carries_the_persons_key_details():
    hr_admin = _user("hr_admin")
    joiner = _user("employee", name="Neha Singh")
    _checklist(joiner, "it_admin")
    _act_as(hr_admin, "hr_admin")
    res = client.get("/api/v1/onboarding")
    assert res.status_code == 200, res.text
    item = res.json()["checklists"][0]
    assert item["employee_name"] == "Neha Singh"
    assert item["employee_designation"] == "Staff"
    assert item["date_of_joining"] == "2025-01-01"
    assert item["date_of_exit"] is None
