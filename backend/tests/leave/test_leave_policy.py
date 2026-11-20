"""
Company leave policy: leave types and holidays are the
company's own; balances are created on first use (pro-rated for joiners, with
carry-forward); HR can adjust; people can cancel; approvers see who's off.
"""
from datetime import date
from decimal import Decimal
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.auth import User
from app.models.leave_attendance import AttendanceRecord, AttendanceStatus, LeaveBalance, LeaveType
from app.models.system import AuditLog
from app.modules.leave.policy import entitlement
from tests.leave.conftest import TestingSessionLocal

client = TestClient(app)
API = "/api/v1"


@pytest.fixture(autouse=True)
def _today(monkeypatch):
    monkeypatch.setattr("app.modules.leave.service.local_today", lambda: date(2026, 6, 1))


def _type(world, name):
    return str(world["types"][name])


# ------------------------------------------------------------ entitlement maths

def _lt(annual, pro_rate=True):
    return LeaveType(name="x", annual_days=Decimal(annual), carry_forward_max=Decimal("0"), pro_rate_on_join=pro_rate)


@pytest.mark.parametrize(
    ("joined", "year", "expected"),
    [
        (date(2024, 3, 1), 2026, Decimal("12")),  # joined before this year: full allowance
        (date(2026, 1, 15), 2026, Decimal("12")),  # joined in January: 12 of 12 months
        (date(2026, 7, 1), 2026, Decimal("6")),  # joined in July: 6 months left
        (date(2026, 10, 20), 2026, Decimal("3")),  # 3 months left
        (date(2026, 12, 1), 2026, Decimal("1")),  # 1 month left
        (date(2027, 2, 1), 2026, Decimal("0")),  # not yet joined
    ],
)
def test_pro_rated_allowance(joined, year, expected):
    assert entitlement(_lt("12"), joined, year) == expected


def test_pro_rating_rounds_to_half_days_and_can_be_switched_off():
    assert entitlement(_lt("15"), date(2026, 5, 1), 2026) == Decimal("10")  # 15 * 8/12 = 10
    assert entitlement(_lt("8"), date(2026, 4, 1), 2026) == Decimal("6")  # 8 * 9/12 = 6
    assert entitlement(_lt("7"), date(2026, 4, 1), 2026) == Decimal("5.5")  # 5.25 -> 5.5
    assert entitlement(_lt("12", pro_rate=False), date(2026, 10, 1), 2026) == Decimal("12")


# ------------------------------------------------------------ leave types

def test_hr_adds_a_leave_type_that_people_can_then_use(world, act_as):
    act_as("hr")
    res = client.post(f"{API}/leave-types", json={"name": "Comp-off", "annual_days": "3"})
    assert res.status_code == 201
    comp = res.json()
    assert comp["annual_days"] == "3.00" and comp["is_active"] is True

    act_as("emp")
    names = [t["name"] for t in client.get(f"{API}/leave-types").json()]
    assert "Comp-off" in names
    applied = client.post(f"{API}/leave-requests", json={"leave_type_id": comp["id"], "start_date": "2026-06-08", "end_date": "2026-06-09"})
    assert applied.status_code == 201  # emp joined 2025, so the full 3 days


def test_deactivated_types_are_hidden_and_cannot_be_used(world, act_as):
    act_as("hr")
    client.patch(f"{API}/leave-types/{_type(world, 'casual')}", json={"is_active": False})
    act_as("emp")
    assert "casual" not in [t["name"] for t in client.get(f"{API}/leave-types").json()]
    res = client.post(f"{API}/leave-requests", json={"leave_type_id": _type(world, "casual"), "start_date": "2026-06-08", "end_date": "2026-06-08"})
    assert res.status_code == 400
    act_as("hr")
    assert "casual" in [t["name"] for t in client.get(f"{API}/leave-types?include_inactive=true").json()]


def test_leave_type_names_are_unique_and_changes_are_audited(world, act_as):
    act_as("hr")
    assert client.post(f"{API}/leave-types", json={"name": "SICK"}).status_code == 409
    client.patch(f"{API}/leave-types/{_type(world, 'sick')}", json={"annual_days": "12", "carry_forward_max": "5"})
    s = TestingSessionLocal()
    assert s.query(AuditLog).filter(AuditLog.action == "leave_type.updated").count() == 1
    s.close()


@pytest.mark.parametrize("who", ["emp", "mgr", "aud", "itadm"])
def test_only_hr_and_super_admins_manage_leave_policy(world, act_as, who):
    act_as(who)
    assert client.post(f"{API}/leave-types", json={"name": "Picnic"}).status_code == 403
    assert client.post(f"{API}/holidays", json={"date": "2026-08-15", "name": "Independence Day"}).status_code == 403
    assert client.get(f"{API}/leave-balances/{world['ids']['emp']}").status_code == 403
    assert client.get(f"{API}/holidays").status_code == 200  # everyone may read


# ------------------------------------------------------------ holidays

def test_holidays_are_listed_by_year_and_skip_working_days(world, act_as):
    act_as("hr")
    assert client.post(f"{API}/holidays", json={"date": "2026-06-10", "name": "Foundation Day"}).status_code == 201
    assert client.post(f"{API}/holidays", json={"date": "2026-06-10", "name": "Again"}).status_code == 409
    assert [h["name"] for h in client.get(f"{API}/holidays?year=2026").json()] == ["Foundation Day"]
    assert client.get(f"{API}/holidays?year=2027").json() == []
    act_as("emp")
    res = client.post(f"{API}/leave-requests", json={"leave_type_id": _type(world, "sick"), "start_date": "2026-06-08", "end_date": "2026-06-12"})
    assert res.json()["total_days"] == 4


# ------------------------------------------------------------ balances

def test_balances_are_created_with_carry_forward(world, act_as):
    s = TestingSessionLocal()
    t = s.get(LeaveType, world["types"]["earned"])
    t.annual_days, t.carry_forward_max = Decimal("15"), Decimal("4")
    s.commit()
    s.close()
    act_as("hr")
    res = client.get(f"{API}/leave-balances/{world['ids']['emp']}?year=2027")
    earned = next(b for b in res.json()["balances"] if b["leave_type"]["name"] == "earned")
    # 2026 left 10 days; at most 4 carry over, plus the 15-day allowance.
    assert Decimal(earned["balance_days"]) == Decimal("19")


def test_hr_adjusts_a_balance_with_a_reason(world, act_as):
    act_as("hr")
    url = f"{API}/leave-balances/{world['ids']['emp']}/adjust"
    res = client.post(url, json={"leave_type_id": _type(world, "casual"), "days": "2.5", "reason": "Worked a holiday"})
    assert res.status_code == 200
    casual = next(b for b in res.json()["balances"] if b["leave_type"]["name"] == "casual")
    assert Decimal(casual["balance_days"]) == Decimal("3.5")
    assert client.post(url, json={"leave_type_id": _type(world, "casual"), "days": "-10", "reason": "x"}).status_code == 409
    assert client.post(url, json={"leave_type_id": _type(world, "unpaid"), "days": "1", "reason": "x"}).status_code == 409
    s = TestingSessionLocal()
    log = s.query(AuditLog).filter(AuditLog.action == "leave_balance.adjusted").one()
    assert log.after_state["reason"] == "Worked a holiday"
    s.close()


# ------------------------------------------------------------ cancel

def test_cancel_pending_leave(world, act_as):
    act_as("emp")
    leave = client.post(f"{API}/leave-requests", json={"leave_type_id": _type(world, "sick"), "start_date": "2026-06-08", "end_date": "2026-06-09"}).json()
    assert leave["can_cancel"] is True
    res = client.post(f"{API}/leave-requests/{leave['id']}/cancel")
    assert res.status_code == 200 and res.json()["status"] == "cancelled"
    assert client.post(f"{API}/leave-requests/{leave['id']}/cancel").status_code == 409


def test_cancel_approved_future_leave_refunds_days_and_clears_attendance(world, act_as):
    act_as("emp")
    leave = client.post(f"{API}/leave-requests", json={"leave_type_id": _type(world, "sick"), "start_date": "2026-06-08", "end_date": "2026-06-09"}).json()
    act_as("mgr")
    assert client.post(f"{API}/leave-requests/{leave['id']}/approve", json={}).status_code == 200
    act_as("emp")
    assert client.post(f"{API}/leave-requests/{leave['id']}/cancel").status_code == 200
    s = TestingSessionLocal()
    bal = s.query(LeaveBalance).filter_by(employee_id=world["ids"]["emp"], leave_type_id=world["types"]["sick"], year=2026).one()
    assert Decimal(bal.balance_days) == Decimal("5")
    assert s.query(AttendanceRecord).filter_by(employee_id=world["ids"]["emp"], status=AttendanceStatus.on_leave).count() == 0
    s.close()


def test_approved_leave_that_has_started_cannot_be_cancelled(world, act_as, monkeypatch):
    act_as("emp")
    leave = client.post(f"{API}/leave-requests", json={"leave_type_id": _type(world, "sick"), "start_date": "2026-06-08", "end_date": "2026-06-09"}).json()
    act_as("mgr")
    client.post(f"{API}/leave-requests/{leave['id']}/approve", json={})
    monkeypatch.setattr("app.modules.leave.service.local_today", lambda: date(2026, 6, 8))
    act_as("emp")
    assert client.post(f"{API}/leave-requests/{leave['id']}/cancel").status_code == 409


def test_nobody_else_can_cancel_your_leave(world, act_as):
    act_as("emp")
    leave = client.post(f"{API}/leave-requests", json={"leave_type_id": _type(world, "sick"), "start_date": "2026-06-08", "end_date": "2026-06-08"}).json()
    for who in ("mgr", "hr", "emp2"):
        act_as(who)
        assert client.post(f"{API}/leave-requests/{leave['id']}/cancel").status_code == 404


# ------------------------------------------------------------ team calendar

def test_team_view_shows_approved_and_pending_for_your_reports_only(world, act_as):
    act_as("emp")
    first = client.post(f"{API}/leave-requests", json={"leave_type_id": _type(world, "sick"), "start_date": "2026-06-08", "end_date": "2026-06-08"}).json()
    client.post(f"{API}/leave-requests", json={"leave_type_id": _type(world, "sick"), "start_date": "2026-06-10", "end_date": "2026-06-10"})
    act_as("emp2")
    client.post(f"{API}/leave-requests", json={"leave_type_id": _type(world, "unpaid"), "start_date": "2026-06-08", "end_date": "2026-06-08"})
    act_as("mgr")
    client.post(f"{API}/leave-requests/{first['id']}/approve", json={})

    window = {"from": "2026-06-01", "to": "2026-06-30"}
    mine = client.get(f"{API}/leave-requests/team", params=window).json()["items"]
    assert sorted((i["employee_name"], i["status"]) for i in mine) == [("emp", "approved"), ("emp", "pending")]

    act_as("hr")
    everyone = client.get(f"{API}/leave-requests/team", params=window).json()["items"]
    assert {i["employee_name"] for i in everyone} == {"emp", "emp2"}

    act_as("emp")
    assert client.get(f"{API}/leave-requests/team", params=window).status_code == 403
    act_as("mgr")
    assert client.get(f"{API}/leave-requests/team", params={"from": "2026-01-01", "to": "2026-12-31"}).status_code == 400


def test_joiners_get_a_pro_rated_balance_automatically(world, act_as):
    s = TestingSessionLocal()
    t = s.get(LeaveType, world["types"]["earned"])
    t.annual_days = Decimal("12")
    s.query(User).filter(User.id == world["ids"]["emp2"]).update({User.date_of_joining: date(2026, 7, 1)})
    s.commit()
    s.close()
    act_as("emp2")
    balances = client.get(f"{API}/leave-requests/mine").json()["balances"]
    earned = next(b for b in balances if b["leave_type"]["name"] == "earned")
    assert Decimal(earned["balance_days"]) == Decimal("6")
    assert uuid.UUID(earned["leave_type"]["id"]) == world["types"]["earned"]


# ------------------------------------------------------------ review fixes (balances)

def _set_earned(annual, cap):
    s = TestingSessionLocal()
    t = s.query(LeaveType).filter_by(name="earned").one()
    t.annual_days, t.carry_forward_max = Decimal(annual), Decimal(cap)
    s.commit()
    s.close()


def _earned(world, who, year):
    act_as_hr = client.get(f"{API}/leave-balances/{world['ids'][who]}?year={year}")
    return Decimal(next(b for b in act_as_hr.json()["balances"] if b["leave_type"]["name"] == "earned")["balance_days"])


def test_carry_forward_follows_leave_taken_after_next_years_row_exists(world, act_as):
    _set_earned("15", "10")
    act_as("hr")
    assert _earned(world, "emp", 2027) == Decimal("25")  # 15 + 10 carried, row created early
    act_as("emp")
    leave = client.post(f"{API}/leave-requests", json={"leave_type_id": _type(world, "earned"), "start_date": "2026-06-08", "end_date": "2026-06-10"}).json()
    act_as("mgr")
    assert client.post(f"{API}/leave-requests/{leave['id']}/approve", json={}).status_code == 200
    act_as("hr")
    assert _earned(world, "emp", 2027) == Decimal("22")  # 7 left in 2026, so 7 carried
    act_as("emp")
    assert client.post(f"{API}/leave-requests/{leave['id']}/cancel").status_code == 200
    act_as("hr")
    assert _earned(world, "emp", 2027) == Decimal("25")


def test_unused_allowance_carries_even_if_last_years_balance_was_never_opened(world, act_as):
    _set_earned("15", "15")
    act_as("hr")
    assert _earned(world, "nomgr", 2027) == Decimal("30")  # 15 this year + 15 unused from 2026


def test_cancel_refunds_exactly_what_was_taken_even_if_holidays_changed(world, act_as):
    act_as("emp")
    leave = client.post(f"{API}/leave-requests", json={"leave_type_id": _type(world, "sick"), "start_date": "2026-06-08", "end_date": "2026-06-12"}).json()
    act_as("mgr")
    assert client.post(f"{API}/leave-requests/{leave['id']}/approve", json={}).status_code == 200
    act_as("hr")
    assert client.post(f"{API}/holidays", json={"date": "2026-06-10", "name": "New holiday"}).status_code == 201
    act_as("emp")
    assert client.post(f"{API}/leave-requests/{leave['id']}/cancel").status_code == 200
    s = TestingSessionLocal()
    bal = s.query(LeaveBalance).filter_by(employee_id=world["ids"]["emp"], leave_type_id=world["types"]["sick"], year=2026).one()
    assert Decimal(bal.balance_days) == Decimal("5")  # all five back, not four
    assert s.query(AttendanceRecord).filter_by(employee_id=world["ids"]["emp"], status=AttendanceStatus.on_leave).count() == 0
    s.close()


def test_two_overlapping_requests_cannot_both_be_approved(world, act_as):
    from app.models.leave_attendance import LeaveRequest, LeaveStatus

    s = TestingSessionLocal()
    ids = []
    for _ in range(2):  # as if double-submitted
        r = LeaveRequest(id=uuid.uuid4(), employee_id=world["ids"]["emp"], leave_type_id=world["types"]["sick"],
                         start_date=date(2026, 6, 8), end_date=date(2026, 6, 9), status=LeaveStatus.pending, approver_id=world["ids"]["mgr"])
        s.add(r)
        ids.append(str(r.id))
    s.commit()
    s.close()
    act_as("mgr")
    assert client.post(f"{API}/leave-requests/{ids[0]}/approve", json={}).status_code == 200
    second = client.post(f"{API}/leave-requests/{ids[1]}/approve", json={})
    assert second.status_code == 409 and second.json()["error"]["code"] == "leave_overlap"
