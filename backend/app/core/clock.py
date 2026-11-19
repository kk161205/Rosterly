"""
"Today" for business rules — in the company's timezone (ATTENDANCE_TIMEZONE,
Asia/Kolkata by default), not the server's. Render runs in UTC, so date.today()
would still be yesterday in India until 05:30.
"""
from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.core.config import settings


def local_today() -> date:
    return datetime.now(ZoneInfo(settings.ATTENDANCE_TIMEZONE)).date()
