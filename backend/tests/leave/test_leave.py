"""
Leave requests: apply, mine, pending-approval, approve, reject.

RBAC through the create_rbac_mock_db pattern; behaviour on real in-memory
SQLite (see conftest.py for the cast and dates) with hand-computed values.
Calendar 2026: Fri 06-05, Sat 06-06, Sun 06-07, Mon 06-08 .. Fri 06-12.
"""
from datetime import date
from decimal import Decimal
import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.main import app
from app.models.leave_attendance import (
    Holiday,
    AttendanceRecord,
    AttendanceStatus,
    LeaveBalance,
    LeaveRequest,
    LeaveStatus,
)
from app.models.system import AuditLog, Notification
from app.modules.leave.policy import working_days as business_days
from tests.leave.conftest import TestingSessionLocal
from tests.leave.mock_db import create_rbac_mock_db

client = TestClient(app)
URL = "/api/v1/leave-requests"


# ---------------------------------------------------------------- pure business-day maths

def test_business_days_fri_to_mon_is_two():
    assert business_days(date(2026, 6, 5), date(2026, 6, 8)) == [date(2026, 6, 5), date(2026, 6, 8)]


def test_business_days_mon_to_fri_is_five_and_weekend_is_zero():
    assert len(business_days(date(2026, 6, 8), date(2026, 6, 12))) == 5
    assert business_days(date(2026, 6, 6), date(2026, 6, 7)) == []
    assert len(business_days(date(2026, 6, 10), date(2026, 6, 10))) == 1  # a single Wednesday, inclusive


def test_business_days_exclude_holidays_and_span_two_weeks():
    assert len(business_days(date(2026, 6, 8), date(2026, 6, 12), {date(2026, 6, 10)})) == 4
    assert len(business_days(date(2026, 6, 5), date(2026, 6, 15))) == 7  # Fri, Mon-Fri, Mon


# ---------------------------------------------------------------- RBAC (mock db)

ENDPOINTS = [
    ("get", f"{URL}/pending-approval", None),
    ("post", f"{URL}/{uuid.uuid4()}/approve", {}),
    ("post", f"{URL}/{uuid.uuid4()}/reject", {"comments": "no"}),
]


@pytest.mark.parametrize("role", ["employee", "it_admin", "auditor"])
@pytest.mark.parametrize("method,path,body", ENDPOINTS, ids=["pending", "approve", "reject"])
def test_roles_without_the_approve_grant_are_403(role, method, path, body):
    role_id = uuid.uuid4()
    mock_db = create_rbac_mock_db([])
    app.dependency_overrides[get_db] = lambda: mock_db
    current = CurrentUser(user_id=uuid.uuid4(), role=role, session_id=uuid.uuid4(), role_id=role_id)
    app.dependency_overrides[get_current_user] = lambda: current
    try:
        res = client.request(method, path, json=body)
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 403 and res.json()["error"]["code"] == "forbidden"


@pytest.mark.parametrize("role", ["manager", "hr_admin", "super_admin"])
def test_roles_with_the_approve_grant_pass_the_permission_check(role):
    role_id = uuid.uuid4()
    mock_db = create_rbac_mock_db([(role_id, "leave_request", "approve")])
    app.dependency_overrides[get_db] = lambda: mock_db
    current = CurrentUser(user_id=uuid.uuid4(), role=role, session_id=uuid.uuid4(), role_id=role_id)
    app.dependency_overrides[get_current_user] = lambda: current
    try:
        res = client.get(f"{URL}/pending-approval")
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 200 and res.json()["items"] == []


def test_requires_authentication():
    for method, path in (("post", URL), ("get", f"{URL}/mine"), ("get", f"{URL}/pending-approval")):
        assert getattr(client, method)(path).status_code == 401, path


# ---------------------------------------------------------------- helpers

_WORLD: dict = {}


@pytest.fixture(autouse=True)
def _remember_world(request):
    """Lets the helpers map leave-type names to the seeded ids."""
    if "world" in request.fixturenames:
        _WORLD.clear()
        _WORLD.update(request.getfixturevalue("world"))

def _apply(act_as, who, leave_type="sick", start="2026-06-08", end="2026-06-10", reason="Unwell"):
    type_id = str(_WORLD["types"][leave_type]) if leave_type in _WORLD["types"] else str(uuid.uuid4())
    act_as(who)
    return client.post(URL, json={"leave_type_id": type_id, "start_date": start, "end_date": end, "reason": reason})


def _balance(world, who, leave_type, year=2026):
    s = TestingSessionLocal()
    row = s.query(LeaveBalance).filter_by(employee_id=world["ids"][who], leave_type_id=world["types"][leave_type],
                                          year=year).first()
    s.close()
    return Decimal(row.balance_days) if row else None


def _attendance(world, who):
    s = TestingSessionLocal()
    rows = s.query(AttendanceRecord).filter_by(employee_id=world["ids"][who]).order_by(AttendanceRecord.date).all()
    out = [(r.date, r.status) for r in rows]
    s.close()
    return out


def _count(model, **filters):
    s = TestingSessionLocal()
    n = s.query(model).filter_by(**filters).count()
    s.close()
    return n


def _notes(user_id):
    s = TestingSessionLocal()
    rows = s.query(Notification).filter_by(user_id=user_id).all()
    s.close()
    return rows


def _set_balance(world, who, leave_type, days):
    s = TestingSessionLocal()
    s.query(LeaveBalance).filter_by(employee_id=world["ids"][who], leave_type_id=world["types"][leave_type]).update(
        {"balance_days": Decimal(days)})
    s.commit()
    s.close()


# ---------------------------------------------------------------- POST /leave-requests

def test_apply_counts_business_days_across_a_weekend(world, act_as):
    res = _apply(act_as, "emp", "sick", "2026-06-05", "2026-06-08")  # Fri -> Mon
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["total_days"] == 2
    assert body["status"] == "pending" and body["approver_id"] is None
    assert body["employee_name"] == "emp" and body["leave_type"]["name"] == "sick" and body["reason"] == "Unwell"
    assert _balance(world, "emp", "sick") == Decimal("5")  # nothing deducted until approval


def test_apply_notifies_the_manager_only(world, act_as):
    leave_id = _apply(act_as, "emp").json()["id"]
    mgr_notes = _notes(world["ids"]["mgr"])
    assert len(mgr_notes) == 1
    n = mgr_notes[0]
    assert (n.type, n.is_critical, n.related_entity_type, str(n.related_entity_id)) == (
        "approval_needed", False, "leave_request", leave_id)
    assert n.channel.value == "in_app"
    assert "3 day(s)" in n.message
    for other in ("hr", "hr2", "admin", "mgr2", "emp"):
        assert _notes(world["ids"][other]) == []


def test_apply_without_a_manager_notifies_every_active_hr_admin(world, act_as):
    assert _apply(act_as, "nomgr", "unpaid").status_code == 201
    assert len(_notes(world["ids"]["hr"])) == 1 and len(_notes(world["ids"]["hr2"])) == 1
    assert _notes(world["ids"]["hr_off"]) == []  # inactive
    assert _notes(world["ids"]["mgr"]) == [] and _notes(world["ids"]["admin"]) == []


@pytest.mark.parametrize("who", ["emp", "mgr", "hr", "admin", "aud", "itadm"])
def test_any_authenticated_role_can_apply(world, act_as, who):
    assert _apply(act_as, who, "unpaid").status_code == 201


@pytest.mark.parametrize("start,end,field", [
    ("2026-06-10", "2026-06-09", "end_date"),     # end before start
    ("2026-06-06", "2026-06-07", "start_date"),   # Sat-Sun: no business day
    ("2026-12-30", "2027-01-02", "end_date"),     # crosses a year boundary
])
def test_apply_validation(world, act_as, start, end, field):
    res = _apply(act_as, "emp", "sick", start, end)
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "validation_error" and field in res.json()["error"]["field_errors"]
    assert _count(LeaveRequest) == 0


def test_apply_rejects_unknown_leave_type(world, act_as):
    assert _apply(act_as, "emp", "vacation").status_code == 400


def test_insufficient_balance_is_409(world, act_as):
    res = _apply(act_as, "emp", "casual", "2026-06-08", "2026-06-09")  # 2 days, balance 1
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "insufficient_balance"
    assert _count(LeaveRequest) == 0


def test_request_equal_to_the_balance_is_allowed(world, act_as):
    assert _apply(act_as, "emp", "casual", "2026-06-08", "2026-06-08").status_code == 201  # 1 day, balance 1


def test_balances_come_from_the_leave_type_and_unlimited_types_skip_the_check(world, act_as):
    assert _apply(act_as, "emp", "no-such-type").status_code == 400          # unknown or inactive type
    assert _apply(act_as, "emp2", "sick").status_code == 409                 # sick's allowance is 0 here
    assert _apply(act_as, "emp2", "unpaid", "2026-06-08", "2026-06-12").status_code == 201  # unpaid: no check


def test_balance_uses_the_start_dates_year(world, act_as):
    # emp has 2026 balances only; 2027-01-04 is a Monday.
    assert _apply(act_as, "emp", "sick", "2027-01-04", "2027-01-04").status_code == 409


def test_overlap_with_pending_or_approved_leave_is_409(world, act_as):
    assert _apply(act_as, "emp", "sick", "2026-06-08", "2026-06-10").status_code == 201
    for start, end in (("2026-06-10", "2026-06-12"), ("2026-06-08", "2026-06-08"), ("2026-06-05", "2026-06-08")):
        res = _apply(act_as, "emp", "sick", start, end)
        assert res.status_code == 409 and res.json()["error"]["code"] == "leave_overlap", (start, end)
    assert _apply(act_as, "emp", "sick", "2026-06-11", "2026-06-12").status_code == 201  # adjacent is fine
    assert _count(LeaveRequest, employee_id=world["ids"]["emp"]) == 2


def test_overlap_ignores_rejected_and_other_peoples_leave(world, act_as):
    first = _apply(act_as, "emp", "sick", "2026-06-08", "2026-06-10").json()["id"]
    act_as("mgr")
    assert client.post(f"{URL}/{first}/reject", json={"comments": "busy"}).status_code == 200
    assert _apply(act_as, "emp", "sick", "2026-06-08", "2026-06-10").status_code == 201
    assert _apply(act_as, "emp2", "unpaid", "2026-06-08", "2026-06-10").status_code == 201


def test_holiday_dates_are_not_counted(world, act_as):
    s = TestingSessionLocal()
    s.add(Holiday(id=uuid.uuid4(), date=date(2026, 6, 10), name="Company holiday"))
    s.commit()
    s.close()
    res = _apply(act_as, "emp", "sick", "2026-06-08", "2026-06-12")  # Mon-Fri minus Wed
    assert res.status_code == 201 and res.json()["total_days"] == 4
    # Pending days count against the balance: 5 - 4 pending leaves 1.
    over = _apply(act_as, "emp", "sick", "2026-06-15", "2026-06-16")
    assert over.status_code == 409 and over.json()["error"]["code"] == "insufficient_balance"
    assert _apply(act_as, "emp", "sick", "2026-06-15", "2026-06-15").status_code == 201


# ---------------------------------------------------------------- GET /leave-requests/mine

def test_mine_lists_only_own_newest_first_with_status_filter(world, act_as):
    a = _apply(act_as, "emp", "sick", "2026-06-08", "2026-06-08").json()["id"]
    b = _apply(act_as, "emp", "sick", "2026-06-09", "2026-06-09").json()["id"]
    _apply(act_as, "emp2", "unpaid")
    act_as("mgr")
    client.post(f"{URL}/{a}/reject", json={"comments": "no"})
    act_as("emp")
    body = client.get(f"{URL}/mine").json()
    assert body["total"] == 2 and [i["id"] for i in body["items"]] == [b, a]
    only = client.get(f"{URL}/mine", params={"status": "rejected"}).json()
    assert [i["id"] for i in only["items"]] == [a] and only["items"][0]["decision_comments"] == "no"
    assert client.get(f"{URL}/mine", params={"status": "nonsense"}).status_code == 400
    page = client.get(f"{URL}/mine", params={"page": 2, "page_size": 1}).json()
    assert [i["id"] for i in page["items"]] == [a] and page["total"] == 2


def test_mine_returns_current_year_balances_for_the_four_cards(world, act_as, monkeypatch):
    monkeypatch.setattr("app.modules.leave.service.local_today", lambda: date(2026, 6, 1))
    act_as("emp")
    res = client.get(f"{URL}/mine")
    def by_type(body):
        return {b["leave_type"]["name"]: (b["year"], None if b["balance_days"] is None else Decimal(b["balance_days"]))
                for b in body["balances"]}
    assert by_type(res.json()) == {"sick": (2026, Decimal("5")), "casual": (2026, Decimal("1")),
                                   "earned": (2026, Decimal("10")), "unpaid": (2026, None)}
    assert [b["leave_type"]["name"] for b in res.json()["balances"]] == ["sick", "casual", "earned", "unpaid"]
    monkeypatch.setattr("app.modules.leave.service.local_today", lambda: date(2027, 1, 4))
    next_year = by_type(client.get(f"{URL}/mine").json())
    assert next_year == {"sick": (2027, Decimal("0")), "casual": (2027, Decimal("0")),
                         "earned": (2027, Decimal("0")), "unpaid": (2027, None)}


# ---------------------------------------------------------------- GET /leave-requests/pending-approval

def _seed_pending(act_as):
    ids = {}
    ids["emp"] = _apply(act_as, "emp", "sick", "2026-06-08", "2026-06-08").json()["id"]
    ids["nomgr"] = _apply(act_as, "nomgr", "unpaid").json()["id"]
    ids["emp2"] = _apply(act_as, "emp2", "unpaid").json()["id"]
    ids["hr"] = _apply(act_as, "hr", "unpaid").json()["id"]
    return ids


def _pending_ids(act_as, who):
    act_as(who)
    res = client.get(f"{URL}/pending-approval")
    assert res.status_code == 200, res.text
    return {i["id"] for i in res.json()["items"]}, res.json()["total"]


def test_manager_sees_only_direct_reports(world, act_as):
    ids = _seed_pending(act_as)
    got, total = _pending_ids(act_as, "mgr")
    assert got == {ids["emp"]} and total == 1
    got2, _ = _pending_ids(act_as, "mgr2")
    assert got2 == {ids["emp2"]}  # and not emp's


def test_hr_and_super_admin_see_everyone_but_themselves(world, act_as):
    ids = _seed_pending(act_as)
    got, total = _pending_ids(act_as, "hr")
    assert got == {ids["emp"], ids["nomgr"], ids["emp2"]} and total == 3  # not hr's own
    got_admin, _ = _pending_ids(act_as, "admin")
    assert got_admin == {ids["emp"], ids["nomgr"], ids["emp2"], ids["hr"]}  # admin may decide hr's


def test_pending_excludes_decided_requests_and_shapes_items(world, act_as):
    ids = _seed_pending(act_as)
    act_as("mgr")
    client.post(f"{URL}/{ids['emp']}/approve", json={})
    assert _pending_ids(act_as, "mgr") == (set(), 0)
    got, _ = _pending_ids(act_as, "hr")
    assert ids["emp"] not in got
    body = client.get(f"{URL}/pending-approval").json()  # still acting as hr: nomgr and emp2 remain
    assert (body["total"], body["page"], body["page_size"]) == (2, 1, 25)
    assert {i["employee_name"] for i in body["items"]} == {"nomgr", "emp2"}
    assert all(i["status"] == "pending" and i["total_days"] >= 1 for i in body["items"])


def test_pending_pagination(world, act_as):
    _seed_pending(act_as)
    act_as("admin")
    page = client.get(f"{URL}/pending-approval", params={"page": 2, "page_size": 3}).json()
    assert page["total"] == 4 and len(page["items"]) == 1
    assert client.get(f"{URL}/pending-approval", params={"page_size": 101}).status_code == 400


@pytest.mark.parametrize("who", ["emp", "aud", "itadm"])
def test_other_roles_cannot_see_the_queue(world, act_as, who):
    act_as(who)
    assert client.get(f"{URL}/pending-approval").status_code == 403


# ---------------------------------------------------------------- approve

def test_approve_deducts_exact_days_and_creates_on_leave_rows(world, act_as):
    leave_id = _apply(act_as, "emp", "sick", "2026-06-08", "2026-06-10").json()["id"]  # Mon-Wed = 3
    act_as("mgr")
    res = client.post(f"{URL}/{leave_id}/approve", json={"comments": "Get well"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "approved" and body["approver_id"] == str(world["ids"]["mgr"])
    assert body["approver_name"] == "mgr" and body["decision_comments"] == "Get well" and body["total_days"] == 3
    assert _balance(world, "emp", "sick") == Decimal("2")  # 5 - 3
    assert _attendance(world, "emp") == [(date(2026, 6, 8), AttendanceStatus.on_leave),
                                         (date(2026, 6, 9), AttendanceStatus.on_leave),
                                         (date(2026, 6, 10), AttendanceStatus.on_leave)]


def test_approve_across_a_weekend_only_marks_business_days(world, act_as):
    leave_id = _apply(act_as, "emp", "sick", "2026-06-05", "2026-06-08").json()["id"]  # Fri-Mon = 2
    act_as("mgr")
    assert client.post(f"{URL}/{leave_id}/approve", json={}).status_code == 200
    assert _balance(world, "emp", "sick") == Decimal("3")
    assert [d for d, _ in _attendance(world, "emp")] == [date(2026, 6, 5), date(2026, 6, 8)]


def test_approve_updates_an_existing_attendance_row_instead_of_duplicating(world, act_as):
    s = TestingSessionLocal()
    s.add(AttendanceRecord(id=uuid.uuid4(), employee_id=world["ids"]["emp"], date=date(2026, 6, 9),
                           status=AttendanceStatus.absent))
    s.commit()
    s.close()
    leave_id = _apply(act_as, "emp", "sick", "2026-06-08", "2026-06-09").json()["id"]
    act_as("mgr")
    assert client.post(f"{URL}/{leave_id}/approve", json={}).status_code == 200
    assert _attendance(world, "emp") == [(date(2026, 6, 8), AttendanceStatus.on_leave),
                                         (date(2026, 6, 9), AttendanceStatus.on_leave)]


def test_approve_unpaid_creates_rows_without_touching_balances(world, act_as):
    leave_id = _apply(act_as, "emp", "unpaid", "2026-06-08", "2026-06-09").json()["id"]
    act_as("mgr")
    assert client.post(f"{URL}/{leave_id}/approve", json={}).status_code == 200
    assert len(_attendance(world, "emp")) == 2
    assert _balance(world, "emp", "unpaid") is None
    assert (_balance(world, "emp", "sick"), _balance(world, "emp", "casual")) == (Decimal("5"), Decimal("1"))


def test_approve_writes_audit_and_notifies_the_requester(world, act_as):
    leave_id = _apply(act_as, "emp", "sick", "2026-06-08", "2026-06-10").json()["id"]
    act_as("mgr")
    client.post(f"{URL}/{leave_id}/approve", json={"comments": "ok"})
    s = TestingSessionLocal()
    logs = s.query(AuditLog).filter_by(entity_id=uuid.UUID(leave_id)).all()
    s.close()
    assert len(logs) == 1
    log = logs[0]
    assert (log.action, log.entity_type, log.actor_id) == ("leave_request.approved", "leave_request",
                                                          world["ids"]["mgr"])
    assert log.before_state == {"status": "pending"}
    assert log.after_state["days"] == 3 and log.after_state["comments"] == "ok"
    assert (Decimal(log.after_state["balance_before"]), Decimal(log.after_state["balance_after"])) == (
        Decimal("5"), Decimal("2"))
    notes = [n for n in _notes(world["ids"]["emp"]) if n.type == "request_status_change"]
    assert len(notes) == 1
    assert notes[0].channel.value == "both" and notes[0].is_critical is True
    assert "approved" in notes[0].message and "ok" in notes[0].message


def test_second_approve_is_409_and_deducts_once(world, act_as):
    leave_id = _apply(act_as, "emp", "sick", "2026-06-08", "2026-06-10").json()["id"]
    act_as("mgr")
    assert client.post(f"{URL}/{leave_id}/approve", json={}).status_code == 200
    again = client.post(f"{URL}/{leave_id}/approve", json={})
    assert again.status_code == 409 and again.json()["error"]["code"] == "already_acted"
    act_as("hr")
    assert client.post(f"{URL}/{leave_id}/approve", json={}).status_code == 409  # a different approver, too
    assert client.post(f"{URL}/{leave_id}/reject", json={"comments": "late"}).status_code == 409
    assert _balance(world, "emp", "sick") == Decimal("2")
    assert len(_attendance(world, "emp")) == 3
    assert _count(AuditLog, action="leave_request.approved") == 1


def test_self_approval_and_self_rejection_are_403(world, act_as):
    hr_leave = _apply(act_as, "hr", "unpaid").json()["id"]
    act_as("hr")
    assert client.post(f"{URL}/{hr_leave}/approve", json={}).status_code == 403
    assert client.post(f"{URL}/{hr_leave}/reject", json={"comments": "x"}).status_code == 403
    admin_leave = _apply(act_as, "admin", "unpaid", "2026-06-15", "2026-06-15").json()["id"]
    act_as("admin")
    assert client.post(f"{URL}/{admin_leave}/approve", json={}).status_code == 403
    mgr_leave = _apply(act_as, "mgr", "unpaid", "2026-06-16", "2026-06-16").json()["id"]
    act_as("mgr")
    assert client.post(f"{URL}/{mgr_leave}/approve", json={}).status_code == 403
    assert _count(LeaveRequest, status=LeaveStatus.pending) == 3


def test_unrelated_manager_gets_403_and_does_not_see_it(world, act_as):
    leave_id = _apply(act_as, "emp", "sick", "2026-06-08", "2026-06-10").json()["id"]
    assert leave_id not in _pending_ids(act_as, "mgr2")[0]
    act_as("mgr2")
    for action, body in (("approve", {}), ("reject", {"comments": "no"})):
        res = client.post(f"{URL}/{leave_id}/{action}", json=body)
        assert res.status_code == 403 and res.json()["error"]["code"] == "forbidden"
    assert _count(LeaveRequest, status=LeaveStatus.pending) == 1
    assert _balance(world, "emp", "sick") == Decimal("5") and _attendance(world, "emp") == []


def test_manager_cannot_act_for_an_employee_without_a_manager_but_hr_can(world, act_as):
    leave_id = _apply(act_as, "nomgr", "unpaid", "2026-06-08", "2026-06-09").json()["id"]
    act_as("mgr")  # same department, but not their manager
    assert client.post(f"{URL}/{leave_id}/approve", json={}).status_code == 403
    act_as("hr2")
    res = client.post(f"{URL}/{leave_id}/approve", json={})
    assert res.status_code == 200 and res.json()["approver_id"] == str(world["ids"]["hr2"])


def test_hr_and_super_admin_can_approve_a_managed_employees_leave(world, act_as):
    first = _apply(act_as, "emp", "sick", "2026-06-08", "2026-06-08").json()["id"]
    second = _apply(act_as, "emp", "sick", "2026-06-09", "2026-06-09").json()["id"]
    act_as("hr")
    assert client.post(f"{URL}/{first}/approve", json={}).status_code == 200
    act_as("admin")
    assert client.post(f"{URL}/{second}/approve", json={}).status_code == 200
    assert _balance(world, "emp", "sick") == Decimal("3")


def test_approve_rechecks_the_balance_under_the_lock(world, act_as):
    leave_id = _apply(act_as, "emp", "sick", "2026-06-08", "2026-06-10").json()["id"]  # 3 days vs 5
    _set_balance(world, "emp", "sick", "2")  # balance dropped after submission
    act_as("mgr")
    res = client.post(f"{URL}/{leave_id}/approve", json={})
    assert res.status_code == 409 and res.json()["error"]["code"] == "insufficient_balance"
    assert _balance(world, "emp", "sick") == Decimal("2") and _attendance(world, "emp") == []
    assert _count(LeaveRequest, status=LeaveStatus.pending) == 1  # still pending: nothing half-applied


def test_approve_unknown_and_malformed_ids(world, act_as):
    act_as("mgr")
    assert client.post(f"{URL}/{uuid.uuid4()}/approve", json={}).status_code == 404
    assert client.post(f"{URL}/not-a-uuid/approve", json={}).status_code == 400


# ---------------------------------------------------------------- reject

@pytest.mark.parametrize("body", [{}, {"comments": ""}, {"comments": "   "}])
def test_reject_without_comments_is_400(world, act_as, body):
    leave_id = _apply(act_as, "emp", "sick", "2026-06-08", "2026-06-10").json()["id"]
    act_as("mgr")
    res = client.post(f"{URL}/{leave_id}/reject", json=body)
    assert res.status_code == 400 and res.json()["error"]["code"] == "validation_error"
    assert "comments" in res.json()["error"]["field_errors"]
    assert _count(LeaveRequest, status=LeaveStatus.pending) == 1


def test_reject_stores_the_note_notifies_and_changes_nothing_else(world, act_as):
    leave_id = _apply(act_as, "emp", "sick", "2026-06-08", "2026-06-10").json()["id"]
    act_as("mgr")
    res = client.post(f"{URL}/{leave_id}/reject", json={"comments": "  Team is short that week  "})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "rejected" and body["decision_comments"] == "Team is short that week"
    assert body["approver_id"] == str(world["ids"]["mgr"])
    assert _balance(world, "emp", "sick") == Decimal("5") and _attendance(world, "emp") == []
    s = TestingSessionLocal()
    log = s.query(AuditLog).filter_by(entity_id=uuid.UUID(leave_id)).one()
    s.close()
    assert log.action == "leave_request.rejected" and log.after_state["comments"] == "Team is short that week"
    note = [n for n in _notes(world["ids"]["emp"]) if n.type == "request_status_change"][0]
    assert note.channel.value == "both" and note.is_critical is True and "Team is short that week" in note.message
    act_as("emp")
    assert client.get(f"{URL}/mine").json()["items"][0]["decision_comments"] == "Team is short that week"


def test_reject_by_unrelated_manager_is_403_and_twice_is_409(world, act_as):
    leave_id = _apply(act_as, "emp", "sick", "2026-06-08", "2026-06-10").json()["id"]
    act_as("mgr2")
    assert client.post(f"{URL}/{leave_id}/reject", json={"comments": "no"}).status_code == 403
    act_as("mgr")
    assert client.post(f"{URL}/{leave_id}/reject", json={"comments": "no"}).status_code == 200
    again = client.post(f"{URL}/{leave_id}/reject", json={"comments": "no"})
    assert again.status_code == 409 and again.json()["error"]["code"] == "already_acted"
    assert _count(AuditLog, action="leave_request.rejected") == 1
