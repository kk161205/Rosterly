"""
Shared world for the §5.20 Leave & Attendance tests: real in-memory SQLite.

People (all active):
  admin   super_admin
  hr      hr_admin                       (plus hr2 hr_admin, and hr_off inactive hr_admin)
  mgr     manager, dept D1
  mgr2    manager, dept D2 (unrelated to emp)
  emp     employee, dept D1, reports to mgr
  nomgr   employee, dept D1, no manager   -> hr_admin queue
  emp2    employee, dept D2, reports to mgr2
  aud     auditor, itadm it_admin

Dates used in 2026: Fri 06-05, Mon 06-08 .. Fri 06-12, Sat 06-06, Sun 06-07.
Balances (2026) for emp: sick 5, casual 1, earned 10.
"""
from datetime import date
from decimal import Decimal
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import CurrentUser, get_current_user
from app.db.session import Base, get_db
from app.main import app
from app.models.auth import Department, Permission, Role, RolePermission, User, UserRole, UserStatus
from app.models.leave_attendance import AttendanceRecord, LeaveBalance, LeaveRequest, LeaveType
from app.models.system import AuditLog, Notification

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)

ROLE_NAMES = ["super_admin", "it_admin", "hr_admin", "manager", "employee", "auditor"]


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def db():
    session = TestingSessionLocal()
    yield session
    session.close()


@pytest.fixture
def world():
    app.dependency_overrides[get_db] = _override_get_db
    s = TestingSessionLocal()
    for model in (AuditLog, Notification, AttendanceRecord, LeaveBalance, LeaveRequest, UserRole, User,
                  Department, RolePermission, Permission, Role):
        s.query(model).delete()
    s.commit()

    roles = {n: Role(id=uuid.uuid4(), name=n, is_system_role=True) for n in ROLE_NAMES}
    s.add_all(roles.values())
    s.flush()
    perm = Permission(id=uuid.uuid4(), resource="leave_request", action="approve")
    s.add(perm)
    s.flush()
    s.add_all(RolePermission(role_id=roles[n].id, permission_id=perm.id)
              for n in ("manager", "hr_admin", "super_admin"))

    d1 = Department(id=uuid.uuid4(), name="Engineering")
    d2 = Department(id=uuid.uuid4(), name="Finance")
    s.add_all([d1, d2])
    s.flush()

    def user(key, role, dept=None, manager=None, status=UserStatus.active):
        uid = uuid.uuid4()
        u = User(id=uid, employee_code=f"RST-{uid.hex[:5].upper()}", full_name=key, email=f"{key}@example.com",
                 password_hash="h", role_id=roles[role].id, department_id=dept.id if dept else None,
                 manager_id=manager.id if manager else None, status=status, designation="Staff",
                 date_of_joining=date(2025, 1, 1))
        s.add(u)
        s.flush()
        return u

    admin = user("admin", "super_admin")
    hr = user("hr", "hr_admin")
    hr2 = user("hr2", "hr_admin")
    hr_off = user("hr_off", "hr_admin", status=UserStatus.inactive)
    mgr = user("mgr", "manager", d1)
    mgr2 = user("mgr2", "manager", d2)
    emp = user("emp", "employee", d1, manager=mgr)
    nomgr = user("nomgr", "employee", d1)
    emp2 = user("emp2", "employee", d2, manager=mgr2)
    aud = user("aud", "auditor")
    itadm = user("itadm", "it_admin")

    for ltype, days in (("sick", "5"), ("casual", "1"), ("earned", "10")):
        s.add(LeaveBalance(id=uuid.uuid4(), employee_id=emp.id, leave_type=LeaveType(ltype), year=2026,
                           balance_days=Decimal(days)))
    s.commit()

    people = {u.full_name: u for u in (admin, hr, hr2, hr_off, mgr, mgr2, emp, nomgr, emp2, aud, itadm)}
    state = {
        "ids": {k: v.id for k, v in people.items()},
        "dept": {"d1": d1.id, "d2": d2.id},
        "roles": {n: r.id for n, r in roles.items()},
        "role_of": {k: v.role.name if v.role else None for k, v in people.items()},
        "dept_of": {k: v.department_id for k, v in people.items()},
    }
    s.close()
    yield state
    app.dependency_overrides.clear()


ROLE_FOR = {"admin": "super_admin", "hr": "hr_admin", "hr2": "hr_admin", "mgr": "manager", "mgr2": "manager",
            "emp": "employee", "nomgr": "employee", "emp2": "employee", "aud": "auditor", "itadm": "it_admin"}


@pytest.fixture
def act_as(world):
    """act_as("mgr") makes the next requests come from that person, with live role and department."""

    def _act(key: str):
        role = ROLE_FOR[key]
        current = CurrentUser(user_id=world["ids"][key], role=role, session_id=uuid.uuid4(),
                              role_id=world["roles"][role], department_id=world["dept_of"][key])
        app.dependency_overrides[get_current_user] = lambda: current

    return _act
