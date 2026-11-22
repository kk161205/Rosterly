"""
"Today" for business rules — in the company's timezone (ATTENDANCE_TIMEZONE,
Asia/Kolkata by default), not the server's. Render runs in UTC, so date.today()
would still be yesterday in India until 05:30.
"""
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from app.core.config import settings


def local_today() -> date:
    return datetime.now(ZoneInfo(settings.ATTENDANCE_TIMEZONE)).date()


def local_date(moment: datetime) -> date:
    """The company's calendar date for a stored moment, so it compares with local_today().
    Naive timestamps are UTC (that is how they are stored)."""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(ZoneInfo(settings.ATTENDANCE_TIMEZONE)).date()
