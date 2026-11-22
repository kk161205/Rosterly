"""The company's calendar date, whatever timezone the server runs in."""
from datetime import datetime, timezone

from app.core import clock
from app.core.config import settings


def test_a_stored_moment_gets_the_companys_date(monkeypatch):
    late_utc = datetime(2026, 11, 22, 18, 40, tzinfo=timezone.utc)  # 00:10 on the 23rd in India
    monkeypatch.setattr(settings, "ATTENDANCE_TIMEZONE", "Asia/Kolkata")
    assert clock.local_date(late_utc).isoformat() == "2026-11-23"
    assert clock.local_date(late_utc.replace(tzinfo=None)).isoformat() == "2026-11-23"  # naive means UTC
    monkeypatch.setattr(settings, "ATTENDANCE_TIMEZONE", "America/Los_Angeles")
    assert clock.local_date(late_utc).isoformat() == "2026-11-22"
