"""
daily license-renewal notification job.

Real in-memory SQLite. Run date is 2026-06-01, so the window is 2026-06-01..2026-07-01:
  A renews 2026-06-15 (14 days)  -> notified
  B renews 2026-07-01 (30 days)  -> notified (boundary is inclusive)
  C renews 2026-07-02 (31 days)  -> NOT notified on 06-01, notified on 06-02
  D renews 2026-05-31 (past)     -> never
  E has no renewal date          -> never
Recipients: active it_admins only - 2 primary + 1 holding it_admin as an additional role = 3.
Not recipients: inactive it_admin, hr_admin.
"""
from datetime import date
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.celery_app import celery_app
from app.db.session import Base
from app.models.assets import SoftwareLicense
from app.models.auth import Role, User, UserRole, UserStatus
from app.models.system import Notification, NotificationChannel
from app.modules.licenses.jobs import _run_license_renewal_check

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)

TODAY = date(2026, 6, 1)


@pytest.fixture
def db():
    session = TestingSessionLocal()
    for model in (Notification, UserRole, SoftwareLicense, User, Role):
        session.query(model).delete()
    session.commit()

    roles = {n: Role(id=uuid.uuid4(), name=n, is_system_role=True) for n in ("it_admin", "hr_admin", "employee")}
    session.add_all(roles.values())
    session.flush()

    def user(role, status=UserStatus.active):
        uid = uuid.uuid4()
        u = User(id=uid, employee_code=f"RST-{uid.hex[:5].upper()}", full_name=f"{role} {uid.hex[:4]}",
                 email=f"{uid.hex[:8]}@example.com", password_hash="h", role_id=roles[role].id, status=status,
                 designation="Staff", date_of_joining=date(2025, 1, 1))
        session.add(u)
        session.flush()
        return u

    session.info["admins"] = {user("it_admin").id, user("it_admin").id}
    extra = user("employee")
    session.add(UserRole(user_id=extra.id, role_id=roles["it_admin"].id, assigned_by=extra.id))
    session.info["admins"].add(extra.id)
    user("it_admin", status=UserStatus.inactive)
    user("hr_admin")

    for key, name, renewal in [("A", "Alpha", date(2026, 6, 15)), ("B", "Beta", date(2026, 7, 1)),
                               ("C", "Gamma", date(2026, 7, 2)), ("D", "Delta", date(2026, 5, 31)),
                               ("E", "Epsilon", None)]:
        lic = SoftwareLicense(id=uuid.uuid4(), name=name, vendor="Vendor", total_seats=5, renewal_date=renewal)
        session.add(lic)
        session.info[key] = lic.id
    session.commit()
    yield session
    session.close()


def _notifs(db, **filters):
    return db.query(Notification).filter_by(type="license_renewal", **filters).all()


def test_notifies_every_active_it_admin_for_licenses_in_the_window(db):
    result = _run_license_renewal_check(db, as_of=TODAY)
    assert result == {"created": 6}  # 2 licenses (A, B) x 3 recipients
    rows = _notifs(db)
    assert len(rows) == 6
    assert {n.user_id for n in rows} == db.info["admins"]
    assert {n.related_entity_id for n in rows} == {db.info["A"], db.info["B"]}
    for n in rows:
        assert n.channel == NotificationChannel.both and n.is_critical is True and n.is_read is False
        assert n.related_entity_type == "software_license"
    alpha = next(n for n in rows if n.related_entity_id == db.info["A"])
    assert alpha.message == "Alpha (Vendor) renews on 2026-06-15."


def test_license_renewing_in_31_days_is_not_notified(db):
    _run_license_renewal_check(db, as_of=TODAY)
    assert _notifs(db, related_entity_id=db.info["C"]) == []
    assert _notifs(db, related_entity_id=db.info["D"]) == []  # already past
    assert _notifs(db, related_entity_id=db.info["E"]) == []  # no date


def test_second_run_the_same_day_creates_nothing(db):
    assert _run_license_renewal_check(db, as_of=TODAY) == {"created": 6}
    assert _run_license_renewal_check(db, as_of=TODAY) == {"created": 0}
    assert len(_notifs(db)) == 6


def test_next_day_only_notifies_what_newly_entered_the_window(db):
    _run_license_renewal_check(db, as_of=TODAY)
    # 06-02: C (07-02) is now exactly 30 days out; A and B were already notified.
    assert _run_license_renewal_check(db, as_of=date(2026, 6, 2)) == {"created": 3}
    assert len(_notifs(db, related_entity_id=db.info["C"])) == 3
    assert len(_notifs(db)) == 9


def test_changed_renewal_date_notifies_again_once(db):
    _run_license_renewal_check(db, as_of=TODAY)
    db.query(SoftwareLicense).filter(SoftwareLicense.id == db.info["A"]).update({"renewal_date": date(2026, 6, 20)})
    db.commit()
    assert _run_license_renewal_check(db, as_of=TODAY) == {"created": 3}  # new date, new reminder
    assert _run_license_renewal_check(db, as_of=TODAY) == {"created": 0}


def test_no_it_admins_means_no_notifications(db):
    db.query(UserRole).delete()
    db.query(User).update({"status": UserStatus.inactive})
    db.commit()
    assert _run_license_renewal_check(db, as_of=TODAY) == {"created": 0}
    assert _notifs(db) == []


def test_job_runs_through_the_daily_catch_up_and_is_registered():
    from app.core.daily_jobs import _jobs

    assert celery_app.conf.beat_schedule["daily-jobs-catch-up"]["task"] == "app.core.celery_app.run_daily_jobs"
    assert "license_renewals" in _jobs()
    assert "app.modules.licenses.jobs" in celery_app.conf.include
    celery_app.loader.import_default_modules()
    assert "app.modules.licenses.jobs.check_license_renewals" in celery_app.tasks
