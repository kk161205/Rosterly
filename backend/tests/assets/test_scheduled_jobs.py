"""
Scheduled jobs: the warranty/AMC alert looks at a 30-day
window and never repeats itself, and daily jobs catch up once per day after
the host has been asleep (app/core/daily_jobs.py).
"""
import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.daily_jobs import run_due_daily_jobs
from app.db.session import Base
from app.models.assets import Asset, AssetStatus, SoftwareLicense
from app.models.auth import Role, User, UserStatus
from app.models.system import JobRun, Notification
from app.modules.assets.jobs import _run_warranty_amc_expiry_check

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Session = sessionmaker(bind=engine)
Base.metadata.create_all(bind=engine)
TODAY = date(2026, 6, 1)


@pytest.fixture
def db():
    s = Session()
    for model in (Notification, JobRun, Asset, SoftwareLicense, User, Role):
        s.query(model).delete()
    roles = {n: Role(id=uuid.uuid4(), name=n, is_system_role=True) for n in ("it_admin", "employee")}
    s.add_all(roles.values())
    s.flush()
    for name, role, status in (("it1", "it_admin", UserStatus.active), ("it2", "it_admin", UserStatus.active),
                               ("it_gone", "it_admin", UserStatus.inactive), ("emp", "employee", UserStatus.active)):
        s.add(User(id=uuid.uuid4(), employee_code=f"RST-{name}", full_name=name, email=f"{name}@example.com",
                   password_hash="h", role_id=roles[role].id, status=status, designation="Staff",
                   date_of_joining=date(2025, 1, 1)))
    s.commit()
    yield s
    s.close()


def asset(db, tag, warranty=None, amc=None, status=AssetStatus.in_stock):
    a = Asset(id=uuid.uuid4(), asset_tag=tag, name=f"Laptop {tag}", category="laptop", status=status,
              warranty_expiry=warranty, amc_expiry=amc)
    db.add(a)
    db.commit()
    return a


def alerts(db):
    return db.query(Notification).filter(Notification.type == "warranty_expiring").all()


def test_alerts_everything_ending_within_30_days_to_active_it_admins_only(db):
    asset(db, "A1", warranty=TODAY + timedelta(days=3))
    asset(db, "A2", amc=TODAY + timedelta(days=30))
    asset(db, "A3", warranty=TODAY + timedelta(days=31))  # outside the window
    asset(db, "A4", warranty=TODAY - timedelta(days=1))  # already ended
    asset(db, "A5", warranty=TODAY + timedelta(days=5), status=AssetStatus.retired)
    result = _run_warranty_amc_expiry_check(db, as_of=TODAY)
    assert result == {"created": 4}  # 2 assets × 2 active IT admins
    recipients = {n.user_id for n in alerts(db)}
    names = {u.full_name for u in db.query(User).filter(User.id.in_(recipients))}
    assert names == {"it1", "it2"}
    assert all(n.is_critical and n.channel.value == "both" for n in alerts(db))


def test_a_missed_day_still_alerts_and_reruns_do_not_repeat(db):
    asset(db, "B1", warranty=TODAY + timedelta(days=30))
    _run_warranty_amc_expiry_check(db, as_of=TODAY - timedelta(days=2))  # was outside the window then
    assert alerts(db) == []
    assert _run_warranty_amc_expiry_check(db, as_of=TODAY)["created"] == 2  # caught on a later day
    assert _run_warranty_amc_expiry_check(db, as_of=TODAY + timedelta(days=1))["created"] == 0  # no repeats


def test_a_new_end_date_alerts_again(db):
    a = asset(db, "C1", warranty=TODAY + timedelta(days=10))
    _run_warranty_amc_expiry_check(db, as_of=TODAY)
    a.warranty_expiry = TODAY + timedelta(days=20)  # extended
    db.commit()
    assert _run_warranty_amc_expiry_check(db, as_of=TODAY)["created"] == 2


def test_warranty_and_amc_ending_together_are_two_alerts(db):
    asset(db, "D1", warranty=TODAY + timedelta(days=7), amc=TODAY + timedelta(days=7))
    assert _run_warranty_amc_expiry_check(db, as_of=TODAY)["created"] == 4


def test_daily_jobs_run_once_per_day_and_catch_up(db):
    asset(db, "E1", warranty=TODAY + timedelta(days=3))
    first = run_due_daily_jobs(db, today=TODAY)
    assert set(first) == {"warranty_amc_expiry", "license_renewals"}
    assert run_due_daily_jobs(db, today=TODAY) == {}  # already ran today
    assert set(run_due_daily_jobs(db, today=TODAY + timedelta(days=3))) == {"warranty_amc_expiry", "license_renewals"}
    assert db.get(JobRun, "warranty_amc_expiry").last_run_on == TODAY + timedelta(days=3)
