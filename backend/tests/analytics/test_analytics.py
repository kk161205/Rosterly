"""
§5.15 Analytics (revised 18 Oct 2026) — every figure checked against a
hand-computed value on a real SQLite database.

- RBAC per report (savings, cost-by-department, budget, follow-ups, turnaround)
- Date validation and the standard error envelope
- Savings: unused seats × cost per seat per year; idle stock ≥ 90 days at book value
- Cost by department: hardware vs. licences, Unassigned bucket
- Budget: end of useful life (purchase + useful life) by quarter, past-EOL, warranties ≤ 90 days
- Follow-ups: devices leavers still hold; joiners ready on day one; upcoming joiners not ready
- Turnaround: per-step approval time from when the step became active; stuck requests;
  repair time by priority; repeat-repair assets
"""
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
import secrets
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
    AssetStatus,
    DepreciationMethod,
    MaintenancePriority,
    MaintenanceStatus,
    MaintenanceTicket,
    SoftwareLicense,
)
from app.models.auth import Department, Permission, Role, RolePermission, User, UserStatus
from app.models.lifecycle import Checklist, ChecklistItem, ChecklistItemStatus, ChecklistStatus, ChecklistType
from app.models.requests import (
    ApprovalStatus,
    Request,
    RequestApproval,
    RequestPriority,
    RequestStatus,
    RequestType,
)
from app.modules.analytics.service import add_months

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)
client = TestClient(app)

SEED_ROLES = ["super_admin", "hr_admin", "it_admin", "manager", "employee", "auditor"]
ANALYTICS_PERMISSIONS = {
    ("analytics", "savings"): ["super_admin", "it_admin", "auditor"],
    ("analytics", "cost_by_department"): ["super_admin", "it_admin", "hr_admin", "auditor"],
    ("analytics", "budget_forecast"): ["super_admin", "it_admin", "auditor"],
    ("analytics", "follow_ups"): ["super_admin", "hr_admin", "auditor"],
    ("analytics", "turnaround"): ["super_admin", "it_admin", "hr_admin", "auditor"],
}
TODAY = date.today()
NOW = datetime.now(timezone.utc)


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
    for model in (
        RequestApproval, Request, MaintenanceTicket, ChecklistItem, Checklist, AssetAssignment, Asset,
        SoftwareLicense, User, RolePermission, Permission, Department, Role,
    ):
        db.query(model).delete()
    db.commit()
    roles = {n: Role(id=uuid.uuid4(), name=n, description=n, is_system_role=True) for n in SEED_ROLES}
    db.add_all(roles.values())
    db.flush()
    for (res, act), names in ANALYTICS_PERMISSIONS.items():
        p = Permission(id=uuid.uuid4(), resource=res, action=act)
        db.add(p)
        db.flush()
        db.add_all(RolePermission(role_id=roles[n].id, permission_id=p.id) for n in names)
    db.commit()
    db.close()
    yield
    app.dependency_overrides.pop(get_current_user, None)


def act_as(role_name: str) -> uuid.UUID:
    db = TestingSessionLocal()
    role = db.query(Role).filter(Role.name == role_name).one()
    uid = uuid.uuid4()
    db.add(User(id=uid, employee_code=f"RST-{secrets.token_hex(2).upper()}", full_name=f"User {role_name}",
                email=f"{uid.hex[:8]}@example.com", password_hash="h", role_id=role.id, status=UserStatus.active,
                designation="Staff", date_of_joining=date(2025, 1, 1)))
    db.commit()
    current = CurrentUser(user_id=uid, role=role_name, session_id=uuid.uuid4(), role_id=role.id)
    app.dependency_overrides[get_current_user] = lambda: current
    db.close()
    return uid


def person(db, name: str, **kw) -> User:
    role = db.query(Role).filter(Role.name == "employee").one()
    uid = uuid.uuid4()
    u = User(id=uid, employee_code=f"RST-{secrets.token_hex(2).upper()}", full_name=name,
             email=f"{uid.hex[:8]}@example.com", password_hash="h", role_id=role.id,
             status=kw.pop("status", UserStatus.active), designation="Staff",
             date_of_joining=kw.pop("date_of_joining", date(2025, 1, 1)), **kw)
    db.add(u)
    db.flush()
    return u


def asset(db, tag: str, **kw) -> Asset:
    defaults = dict(name=tag, category="laptop", vendor="Dell", purchase_date=date(2025, 1, 1),
                    purchase_cost=Decimal("100000"), current_value=Decimal("80000"),
                    depreciation_method=DepreciationMethod.straight_line, useful_life_months=36,
                    status=AssetStatus.in_stock)
    defaults.update(kw)
    a = Asset(id=uuid.uuid4(), asset_tag=tag, **defaults)
    db.add(a)
    db.flush()
    return a


# ---------------------------------------------------------------- access

@pytest.mark.parametrize("path,allowed", [
    ("/api/v1/analytics/savings", {"super_admin", "it_admin", "auditor"}),
    ("/api/v1/analytics/cost-by-department", {"super_admin", "it_admin", "hr_admin", "auditor"}),
    ("/api/v1/analytics/budget", {"super_admin", "it_admin", "auditor"}),
    ("/api/v1/analytics/follow-ups", {"super_admin", "hr_admin", "auditor"}),
    ("/api/v1/analytics/turnaround", {"super_admin", "it_admin", "hr_admin", "auditor"}),
])
def test_each_report_is_limited_to_its_roles(path, allowed):
    for role in SEED_ROLES:
        act_as(role)
        res = client.get(path)
        assert res.status_code == (200 if role in allowed else 403), (path, role, res.text)


def test_removed_reports_are_gone():
    act_as("super_admin")
    for path in ("asset-utilization", "headcount-asset-ratio", "license-usage"):
        assert client.get(f"/api/v1/analytics/{path}").status_code == 404


def test_date_validation_uses_the_error_envelope():
    act_as("super_admin")
    res = client.get("/api/v1/analytics/turnaround?from=2026-10-20&to=2026-10-10")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "validation_error"
    res = client.get("/api/v1/analytics/cost-by-department?from=2020-01-01&to=2026-01-01")
    assert res.status_code == 400
    assert "cannot exceed 5 years" in res.json()["error"]["message"]


def test_empty_database_returns_empty_reports():
    act_as("super_admin")
    savings = client.get("/api/v1/analytics/savings").json()
    assert savings["unused_licences"] == [] and savings["idle_assets"] == []
    assert Decimal(savings["unused_licence_cost_per_year"]) == 0
    budget = client.get("/api/v1/analytics/budget").json()
    assert budget["replacements"] == [] and budget["past_end_of_life_count"] == 0
    turnaround = client.get("/api/v1/analytics/turnaround").json()
    assert turnaround["approval_median_hours"] is None and turnaround["repair_median_hours"] is None


# ---------------------------------------------------------------- savings

def test_savings_unused_seats_and_idle_stock():
    """
    Figma: 10 seats at ₹1,200, 3 assigned → 7 unused × 1,200 = ₹8,400 a year.
    Slack: 5 seats, 5 assigned → nothing unused, not listed.
    Idle: MON-OLD added 200 days ago, never assigned → idle 200 days at ₹6,000;
          LT-BACK returned 100 days ago → idle 100 days at ₹50,000;
          LT-NEW returned 10 days ago → not idle.
    """
    act_as("it_admin")
    db = TestingSessionLocal()
    holder = person(db, "Holder")
    figma = SoftwareLicense(id=uuid.uuid4(), name="Figma", vendor="Figma", total_seats=10, cost_per_seat=Decimal("1200"))
    slack = SoftwareLicense(id=uuid.uuid4(), name="Slack", vendor="Slack", total_seats=5, cost_per_seat=Decimal("800"))
    db.add_all([figma, slack])
    db.flush()
    for i in range(3):
        asset(db, f"FIG-{i}", category="software_license", license_id=figma.id, status=AssetStatus.assigned, current_holder_id=holder.id)
    for i in range(5):
        asset(db, f"SLK-{i}", category="software_license", license_id=slack.id, status=AssetStatus.assigned, current_holder_id=holder.id)
    old = asset(db, "MON-OLD", category="monitor", current_value=Decimal("6000"))
    old.created_at = NOW - timedelta(days=200)
    back = asset(db, "LT-BACK", current_value=Decimal("50000"))
    db.add(AssetAssignment(id=uuid.uuid4(), asset_id=back.id, employee_id=holder.id, assigned_by=holder.id,
                           assigned_at=NOW - timedelta(days=300), returned_at=NOW - timedelta(days=100),
                           condition_at_assignment="Good"))
    recent = asset(db, "LT-NEW", current_value=Decimal("70000"))
    db.add(AssetAssignment(id=uuid.uuid4(), asset_id=recent.id, employee_id=holder.id, assigned_by=holder.id,
                           assigned_at=NOW - timedelta(days=50), returned_at=NOW - timedelta(days=10),
                           condition_at_assignment="Good"))
    db.commit()
    db.close()

    body = client.get("/api/v1/analytics/savings").json()
    assert [(x["name"], x["unused_seats"], Decimal(x["unused_cost_per_year"])) for x in body["unused_licences"]] == [
        ("Figma", 7, Decimal("8400"))
    ]
    assert Decimal(body["unused_licence_cost_per_year"]) == Decimal("8400")
    idle = {x["asset_tag"]: x for x in body["idle_assets"]}
    assert set(idle) == {"MON-OLD", "LT-BACK"}
    assert idle["MON-OLD"]["days_idle"] == 200 and idle["LT-BACK"]["days_idle"] == 100
    assert Decimal(body["idle_asset_value"]) == Decimal("56000")
    assert [x["asset_tag"] for x in body["idle_assets"]] == ["LT-BACK", "MON-OLD"]  # most value first


# ---------------------------------------------------------------- cost by department

def test_cost_by_department_hardware_vs_licences():
    act_as("hr_admin")
    db = TestingSessionLocal()
    eng = Department(id=uuid.uuid4(), name="Engineering")
    db.add(eng)
    db.flush()
    emp = person(db, "Eng person", department_id=eng.id)
    p = date(2026, 2, 10)
    asset(db, "C1", purchase_date=p, purchase_cost=Decimal("1000"), status=AssetStatus.assigned, current_holder_id=emp.id)
    asset(db, "C2", category="software_license", purchase_date=p, purchase_cost=Decimal("500"),
          status=AssetStatus.assigned, current_holder_id=emp.id)
    asset(db, "C3", purchase_date=p, purchase_cost=Decimal("1500"))
    db.commit()
    db.close()
    series = {s["department_name"]: s for s in client.get(
        "/api/v1/analytics/cost-by-department?from=2026-02-01&to=2026-02-28").json()["series"]}
    assert (Decimal(series["Engineering"]["hardware_cost"]), Decimal(series["Engineering"]["software_cost"])) == (
        Decimal("1000"), Decimal("500"))
    assert Decimal(series["Unassigned"]["total_cost"]) == Decimal("1500")


# ---------------------------------------------------------------- budget

def test_budget_replacements_by_quarter_and_warranties():
    """
    END-1: bought 34 months ago, 36-month life → end of life in ~2 months (this year's window).
    END-2: bought 30 months ago, 36-month life → ~6 months.
    PAST: bought 40 months ago, 36-month life → already past end of life, still in use.
    FAR:  bought last month, 36-month life → beyond 12 months, not listed.
    RETIRED past end of life → ignored. Warranty: W-SOON ends in 20 days, W-LATE in 120.
    """
    act_as("auditor")
    db = TestingSessionLocal()
    end1 = asset(db, "END-1", purchase_date=add_months(TODAY, -34), purchase_cost=Decimal("90000"))
    end2 = asset(db, "END-2", purchase_date=add_months(TODAY, -30), purchase_cost=Decimal("60000"))
    asset(db, "PAST", purchase_date=add_months(TODAY, -40), purchase_cost=Decimal("40000"), status=AssetStatus.assigned)
    asset(db, "FAR", purchase_date=add_months(TODAY, -1))
    asset(db, "RETIRED", purchase_date=add_months(TODAY, -50), status=AssetStatus.retired)
    asset(db, "W-SOON", purchase_date=add_months(TODAY, -1), warranty_expiry=TODAY + timedelta(days=20))
    asset(db, "W-LATE", purchase_date=add_months(TODAY, -1), warranty_expiry=TODAY + timedelta(days=120))
    db.commit()
    end1_date, end2_date = add_months(end1.purchase_date, 36), add_months(end2.purchase_date, 36)
    db.close()

    body = client.get("/api/v1/analytics/budget").json()
    assert body["past_end_of_life_count"] == 1 and Decimal(body["past_end_of_life_cost"]) == Decimal("40000")
    listed = {a["asset_tag"]: a for q in body["replacements"] for a in q["assets"]}
    assert set(listed) == {"END-1", "END-2"}
    assert listed["END-1"]["date"] == end1_date.isoformat() and listed["END-2"]["date"] == end2_date.isoformat()
    assert Decimal(body["replacement_cost_12_months"]) == Decimal("150000")
    for q in body["replacements"]:
        assert q["count"] == len(q["assets"]) and q["label"][-4:].isdigit()
    assert [w["asset_tag"] for w in body["warranties_expiring"]] == ["W-SOON"]


# ---------------------------------------------------------------- follow-ups

def test_follow_ups_leaver_devices_and_joiner_readiness():
    """
    Leaver Ravi (offboarding in progress) still holds LT-R (₹30,000) and PH-R (₹10,000).
    Joiners in the last 30 days: Asha (all tasks done the day before joining → ready),
    Bilal (one task done after day one → not ready). Chen joins in 5 days with 1 open task.
    """
    act_as("hr_admin")
    db = TestingSessionLocal()
    it_role = db.query(Role).filter(Role.name == "it_admin").one()
    ravi = person(db, "Ravi", status=UserStatus.offboarding, date_of_exit=TODAY + timedelta(days=7))
    for tag, value in (("LT-R", "30000"), ("PH-R", "10000")):
        a = asset(db, tag, current_value=Decimal(value), status=AssetStatus.assigned, current_holder_id=ravi.id)
        db.add(AssetAssignment(id=uuid.uuid4(), asset_id=a.id, employee_id=ravi.id, assigned_by=ravi.id,
                               assigned_at=NOW - timedelta(days=200), condition_at_assignment="Good"))
    db.add(Checklist(id=uuid.uuid4(), employee_id=ravi.id, type=ChecklistType.offboarding, status=ChecklistStatus.in_progress))

    def onboarding(name: str, joined: date, done_offsets: list):
        u = person(db, name, date_of_joining=joined)
        c = Checklist(id=uuid.uuid4(), employee_id=u.id, type=ChecklistType.onboarding,
                      status=ChecklistStatus.completed if all(o is not None for o in done_offsets) else ChecklistStatus.in_progress)
        db.add(c)
        db.flush()
        for i, offset in enumerate(done_offsets):
            done_at = datetime.combine(joined + timedelta(days=offset), time(12), tzinfo=timezone.utc) if offset is not None else None
            db.add(ChecklistItem(id=uuid.uuid4(), checklist_id=c.id, task_name=f"Task {i}", owner_role_id=it_role.id,
                                 status=ChecklistItemStatus.done if offset is not None else ChecklistItemStatus.pending,
                                 completed_at=done_at, sort_order=i))

    onboarding("Asha", TODAY - timedelta(days=10), [-1, -1])
    onboarding("Bilal", TODAY - timedelta(days=5), [-2, 3])
    onboarding("Chen", TODAY + timedelta(days=5), [-3, None])
    db.commit()
    db.close()

    body = client.get("/api/v1/analytics/follow-ups").json()
    assert [(x["full_name"], sorted(a["asset_tag"] for a in x["assets"])) for x in body["leavers"]] == [
        ("Ravi", ["LT-R", "PH-R"])
    ]
    assert body["unreturned_count"] == 2 and Decimal(body["unreturned_value"]) == Decimal("40000")
    assert (body["joiners_in_period"], body["joiners_ready_on_day_one"]) == (2, 1)
    assert [(x["full_name"], x["open_tasks"]) for x in body["upcoming_not_ready"]] == [("Chen", 1)]


# ---------------------------------------------------------------- turnaround

def test_turnaround_steps_stuck_requests_and_repairs():
    """
    Request A (approved): created T, manager decided T+10h, IT decided T+10h+30h → manager 10h, IT 30h.
    Request B (approved, manager step skipped): created T, IT decided T+20h → IT 20h.
    Request C (pending at IT since manager decided 5 days ago) → stuck 5 days.
    C's manager decision (5 days ago, 120h after creation) also falls in the window.
    Approval times [10, 30, 20, 120] → median 25h; manager [10, 120] → 65h; IT [30, 20] → 25h.
    Tickets: high 4h and 8h (median 6h), low 48h; overall median of [4, 8, 48] = 8h.
    LT-REPEAT has 2 tickets in 90 days → repeat asset.
    """
    act_as("it_admin")
    db = TestingSessionLocal()
    roles = {r.name: r for r in db.query(Role).all()}
    requester = person(db, "Requester")
    t0 = NOW - timedelta(days=10)

    def request(title, status, current_step, steps):
        r = Request(id=uuid.uuid4(), requester_id=requester.id, request_type=RequestType.asset_request, title=title,
                    description="x", priority=RequestPriority.medium, status=status, current_step=current_step)
        db.add(r)
        db.flush()
        r.created_at = t0
        for order, (role, st, decided) in enumerate(steps, start=1):
            db.add(RequestApproval(id=uuid.uuid4(), request_id=r.id, step_order=order, approver_role_id=roles[role].id,
                                   status=st, decision_at=decided))
        return r

    request("A", RequestStatus.approved, 2, [
        ("manager", ApprovalStatus.approved, t0 + timedelta(hours=10)),
        ("it_admin", ApprovalStatus.approved, t0 + timedelta(hours=40)),
    ])
    request("B", RequestStatus.approved, 2, [
        ("manager", ApprovalStatus.skipped, None),
        ("it_admin", ApprovalStatus.approved, t0 + timedelta(hours=20)),
    ])
    request("C", RequestStatus.pending, 2, [
        ("manager", ApprovalStatus.approved, NOW - timedelta(days=5)),
        ("it_admin", ApprovalStatus.pending, None),
    ])

    laptop = asset(db, "LT-REPEAT")
    for priority, hours in ((MaintenancePriority.high, 4), (MaintenancePriority.high, 8), (MaintenancePriority.low, 48)):
        created = NOW - timedelta(days=3)
        t = MaintenanceTicket(id=uuid.uuid4(), asset_id=laptop.id, reported_by=requester.id, issue_description="Broken",
                              priority=priority, status=MaintenanceStatus.resolved, resolved_at=created + timedelta(hours=hours))
        db.add(t)
        db.flush()
        t.created_at = created
    db.commit()
    db.close()

    body = client.get("/api/v1/analytics/turnaround").json()
    assert body["approval_median_hours"] == 25.0
    steps = {s["role_name"]: s for s in body["approvals_by_step"]}
    assert (steps["manager"]["decisions"], steps["manager"]["median_hours"]) == (2, 65.0)
    assert [s["role_name"] for s in body["approvals_by_step"]] == ["manager", "it_admin"]  # slowest step first
    assert (steps["it_admin"]["decisions"], steps["it_admin"]["median_hours"]) == (2, 25.0)
    assert [(s["title"], s["waiting_on_role"], s["waiting_days"]) for s in body["stuck_requests"]] == [("C", "it_admin", 5)]
    assert body["repair_median_hours"] == 8.0
    assert [(p["priority"], p["resolved"], p["median_hours"]) for p in body["repairs_by_priority"]] == [
        ("high", 2, 6.0), ("low", 1, 48.0)
    ]
    assert [(a["asset_tag"], a["tickets"]) for a in body["repeat_assets"]] == [("LT-REPEAT", 3)]
