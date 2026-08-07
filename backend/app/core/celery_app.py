"""
Celery app + beat schedule for the three scheduled jobs defined in
project doc §6:
  - Nightly depreciation job (assets.current_value recalculation)
  - Daily warranty/AMC expiry check (30-day-out notifications)
  - Email dispatch worker (short interval, sends queued notifications)

Task implementations belong in app/services/ — this file only wires up
the schedule. See rules.md §3 rule 1: don't add a second parallel task
runner if one already exists here, extend this file.
"""
from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "rosterly",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.beat_schedule = {
    "nightly-depreciation": {
        "task": "app.services.assets.run_depreciation_job",
        "schedule": crontab(hour=2, minute=0),
    },
    "daily-warranty-expiry-check": {
        "task": "app.services.assets.check_warranty_amc_expiry",
        "schedule": crontab(hour=3, minute=0),
    },
    "email-dispatch-worker": {
        "task": "app.services.notifications.dispatch_pending_emails",
        "schedule": 120.0,  # every 2 minutes
    },
}
celery_app.conf.timezone = "UTC"
