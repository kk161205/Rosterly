"""
§5.20 Attendance: GET /attendance, check-in, check-out.

Real in-memory SQLite, cast in conftest.py. emp (dept D1, manager mgr) has
records: 06-01 present, 06-02 on_leave, 06-03 holiday, 07-01 present.
"""
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo
import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.security import CurrentUser, get_current_user
from app.main import app
from app.models.leave_attendance import AttendanceRecord, AttendanceStatus
from tests.leave.conftest import TestingSessionLocal

client = TestClient(app)
URL = "/api/v1/attendance"


def _today_local() -> date:
    return datetime.now(timezone.utc).astimezone(ZoneInfo(settings.ATTENDANCE_TIMEZONE)).date()


def _add(who_id, day, status, check_in=None):
    s = TestingSessionLocal()
    s.add(AttendanceRecord(id=uuid.uuid4(), employee_id=who_id, date=day, status=status, check_in_time=check_in))
    s.commit()
    s.close()


def _rows(who_id):
    s = TestingSessionLocal()
    rows = s.query(AttendanceRecord).filter_by(employee_id=who_id).all()
    s.close()
    return rows


@pytest.fixture
def seeded(world):
    emp = world["ids"]["emp"]
    _add(emp, date(2026, 6, 1), AttendanceStatus.present, datetime(2026, 6, 1, 4, 0, tzinfo=timezone.utc))
    _add(emp, date(2026, 6, 2), AttendanceStatus.on_leave)
    _add(emp, date(2026, 6, 3), AttendanceStatus.holiday)
    _add(emp, date(2026, 7, 1), AttendanceStatus.present)
    return world


def _dates(res):
    return [r["date"] for r in res.json()["records"]]


# ---------------------------------------------------------------- GET /attendance

def test_requires_authentication():
    for method, path in (("get", URL), ("post", f"{URL}/check-in"), ("post", f"{URL}/check-out")):
        assert getattr(client, method)(path).status_code == 401, path


def test_self_by_default_within_the_window(seeded, act_as):
    act_as("emp")
    res = client.get(URL, params={"from": "2026-06-01", "to": "2026-06-30"})
    assert res.status_code == 200
    assert _dates(res) == ["2026-06-01", "2026-06-02", "2026-06-03"]  # ascending, July excluded
    assert [r["status"] for r in res.json()["records"]] == ["present", "on_leave", "holiday"]
    assert res.json()["total"] == 3 and res.json()["records"][0]["check_in_time"] is not None
    assert res.json()["records"][1]["check_in_time"] is None


def test_default_window_is_the_current_month_and_from_alone_runs_to_month_end(seeded, act_as):
    act_as("emp")
    assert client.get(URL).status_code == 200  # no params: current month, no error
    only_from = client.get(URL, params={"from": "2026-06-02"})
    assert _dates(only_from) == ["2026-06-02", "2026-06-03"]  # to = 06-30
    only_to = client.get(URL, params={"to": "2026-06-02"})
    assert _dates(only_to) == ["2026-06-01", "2026-06-02"]  # from = 06-01


def test_pagination(seeded, act_as):
    act_as("emp")
    page = client.get(URL, params={"from": "2026-06-01", "to": "2026-06-30", "page": 2, "page_size": 2}).json()
    assert [r["date"] for r in page["records"]] == ["2026-06-03"] and page["total"] == 3
    assert client.get(URL, params={"page_size": 101}).status_code == 400


def test_range_validation_and_cap(seeded, act_as):
    act_as("emp")
    bad = client.get(URL, params={"from": "2026-06-10", "to": "2026-06-01"})
    assert bad.status_code == 400 and "from" in bad.json()["error"]["field_errors"]
    ok = client.get(URL, params={"from": "2026-06-01", "to": "2026-08-31"})  # exactly 92 days
    assert ok.status_code == 200 and _dates(ok) == ["2026-06-01", "2026-06-02", "2026-06-03", "2026-07-01"]
    too_long = client.get(URL, params={"from": "2026-06-01", "to": "2026-09-01"})  # 93 days
    assert too_long.status_code == 400 and "to" in too_long.json()["error"]["field_errors"]
    assert client.get(URL, params={"from": "yesterday"}).status_code == 400


def test_manager_reads_own_department_only(seeded, act_as):
    emp = str(seeded["ids"]["emp"])
    act_as("mgr")  # D1, same as emp
    res = client.get(URL, params={"employee_id": emp, "from": "2026-06-01", "to": "2026-06-30"})
    assert res.status_code == 200 and res.json()["total"] == 3
    act_as("mgr2")  # D2: outside emp's department
    denied = client.get(URL, params={"employee_id": emp, "from": "2026-06-01", "to": "2026-06-30"})
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "forbidden"


def test_manager_cannot_read_someone_in_another_department(seeded, act_as):
    act_as("mgr")
    assert client.get(URL, params={"employee_id": str(seeded["ids"]["emp2"])}).status_code == 403  # emp2 is D2
    assert client.get(URL, params={"employee_id": str(uuid.uuid4())}).status_code == 403  # unknown: no leak


def test_manager_without_a_department_cannot_read_others(seeded):
    nodept = CurrentUser(user_id=seeded["ids"]["mgr"], role="manager", session_id=uuid.uuid4(),
                         role_id=seeded["roles"]["manager"], department_id=None)
    app.dependency_overrides[get_current_user] = lambda: nodept
    assert client.get(URL, params={"employee_id": str(seeded["ids"]["nomgr"])}).status_code == 403


@pytest.mark.parametrize("who", ["hr", "admin"])
def test_hr_and_super_admin_read_everyone(seeded, act_as, who):
    act_as(who)
    for target in ("emp", "emp2"):
        res = client.get(URL, params={"employee_id": str(seeded["ids"][target]), "from": "2026-06-01",
                                      "to": "2026-06-30"})
        assert res.status_code == 200
    assert client.get(URL, params={"employee_id": str(seeded["ids"]["emp"]), "from": "2026-06-01",
                                   "to": "2026-06-30"}).json()["total"] == 3
    assert client.get(URL, params={"employee_id": str(uuid.uuid4())}).status_code == 404


@pytest.mark.parametrize("who", ["emp2", "nomgr", "aud", "itadm"])
def test_everyone_else_cannot_read_another_persons_attendance(seeded, act_as, who):
    act_as(who)
    assert client.get(URL, params={"employee_id": str(seeded["ids"]["emp"])}).status_code == 403
    assert client.get(URL, params={"employee_id": str(seeded["ids"][who])}).status_code == 200  # themselves


# ---------------------------------------------------------------- check-in / check-out

def test_check_in_creates_a_present_record_for_today(world, act_as):
    act_as("emp")
    res = client.post(f"{URL}/check-in")
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "present" and body["check_in_time"] is not None and body["check_out_time"] is None
    assert body["date"] == _today_local().isoformat() and body["employee_id"] == str(world["ids"]["emp"])
    assert len(_rows(world["ids"]["emp"])) == 1


@pytest.mark.parametrize("who", ["emp", "mgr", "hr", "admin", "aud", "itadm"])
def test_every_role_can_check_in_and_out(world, act_as, who):
    act_as(who)
    assert client.post(f"{URL}/check-in").status_code == 201
    assert client.post(f"{URL}/check-out").status_code == 200


def test_second_check_in_the_same_day_is_409(world, act_as):
    act_as("emp")
    assert client.post(f"{URL}/check-in").status_code == 201
    again = client.post(f"{URL}/check-in")
    assert again.status_code == 409 and again.json()["error"]["code"] == "already_checked_in"
    assert len(_rows(world["ids"]["emp"])) == 1


def test_check_in_after_check_out_is_still_409(world, act_as):
    act_as("emp")
    client.post(f"{URL}/check-in")
    client.post(f"{URL}/check-out")
    assert client.post(f"{URL}/check-in").status_code == 409


@pytest.mark.parametrize("status", [AttendanceStatus.on_leave, AttendanceStatus.holiday])
def test_check_in_on_a_leave_or_holiday_day_is_409(world, act_as, status):
    _add(world["ids"]["emp"], _today_local(), status)
    act_as("emp")
    res = client.post(f"{URL}/check-in")
    assert res.status_code == 409 and res.json()["error"]["code"] == "check_in_not_allowed"
    rows = _rows(world["ids"]["emp"])
    assert len(rows) == 1 and rows[0].status == status and rows[0].check_in_time is None


def test_check_in_fills_an_existing_absent_record(world, act_as):
    _add(world["ids"]["emp"], _today_local(), AttendanceStatus.absent)
    act_as("emp")
    res = client.post(f"{URL}/check-in")
    assert res.status_code == 201 and res.json()["status"] == "present"
    assert len(_rows(world["ids"]["emp"])) == 1


def test_check_out_sets_the_time_once(world, act_as):
    act_as("emp")
    client.post(f"{URL}/check-in")
    res = client.post(f"{URL}/check-out")
    assert res.status_code == 200
    assert res.json()["check_out_time"] is not None and res.json()["status"] == "present"
    again = client.post(f"{URL}/check-out")
    assert again.status_code == 409 and again.json()["error"]["code"] == "already_checked_out"


def test_check_out_without_an_open_check_in_is_409(world, act_as):
    act_as("emp")
    none = client.post(f"{URL}/check-out")
    assert none.status_code == 409 and none.json()["error"]["code"] == "no_open_check_in"
    _add(world["ids"]["emp"], _today_local(), AttendanceStatus.on_leave)  # a row exists but nobody checked in
    assert client.post(f"{URL}/check-out").status_code == 409


def test_check_in_is_per_person(world, act_as):
    act_as("emp")
    client.post(f"{URL}/check-in")
    act_as("emp2")
    assert client.post(f"{URL}/check-in").status_code == 201


def test_manual_mode_off_blocks_both_with_403(world, act_as, monkeypatch):
    act_as("emp")
    client.post(f"{URL}/check-in")
    monkeypatch.setattr(settings, "ATTENDANCE_MANUAL_CHECKIN_ENABLED", False)
    for path in ("check-in", "check-out"):
        res = client.post(f"{URL}/{path}")
        assert res.status_code == 403 and res.json()["error"]["code"] == "manual_checkin_disabled", path
    assert _rows(world["ids"]["emp"])[0].check_out_time is None
    act_as("emp2")
    assert client.post(f"{URL}/check-in").status_code == 403
    assert _rows(world["ids"]["emp2"]) == []


def test_today_follows_the_configured_timezone(world, act_as, monkeypatch):
    act_as("emp")
    monkeypatch.setattr(settings, "ATTENDANCE_TIMEZONE", "Pacific/Kiritimati")  # UTC+14
    res = client.post(f"{URL}/check-in")
    expected = datetime.now(timezone.utc).astimezone(ZoneInfo("Pacific/Kiritimati")).date().isoformat()
    assert res.status_code == 201 and res.json()["date"] == expected
    monkeypatch.setattr(settings, "ATTENDANCE_TIMEZONE", "Pacific/Pago_Pago")  # UTC-11, a day earlier
    other = client.post(f"{URL}/check-in")  # a different local date: allowed
    assert other.status_code == 201 and other.json()["date"] != expected
