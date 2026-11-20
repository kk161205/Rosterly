"""
Celery app + beat schedule for the background jobs.

  - Daily jobs (warranty/AMC expiry, licence renewals) run through
    app.core.daily_jobs.run_due_daily_jobs: checked hourly and when the worker
    starts, each runs once per day — so a sleeping free-tier host still catches up.
  - Email dispatch runs every 2 minutes.

On Render the worker runs in the same service as the API (start command in
the README); the broker is Render's Key Value (Redis-compatible) service.
Task implementations live in their feature modules; don't add a second task
runner.
"""
from celery import Celery
from celery.schedules import crontab
from celery.signals import worker_ready

from app.core.config import settings

# Modules that define tasks. The worker is started with
# `celery -A app.core.celery_app worker`, which imports only this file — without
# `include`, the scheduled tasks below would never be registered and beat's
# messages would be rejected as unregistered.
TASK_MODULES = [
    "app.core.celery_app",
    "app.modules.assets.jobs",
    "app.modules.licenses.jobs",
    "app.modules.notifications.dispatch",
]

celery_app = Celery(
    "rosterly",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=TASK_MODULES,
)

celery_app.conf.beat_schedule = {
    "daily-jobs-catch-up": {
        "task": "app.core.celery_app.run_daily_jobs",
        "schedule": crontab(minute=5),  # every hour; each daily job still runs once a day
    },
    "email-dispatch-worker": {
        "task": "app.modules.notifications.dispatch.dispatch_pending_emails",
        "schedule": 120.0,  # every 2 minutes
    },
}
celery_app.conf.timezone = "UTC"
celery_app.conf.task_ignore_result = True  # nothing reads results; keeps the small Key Value free


@celery_app.task(name="app.core.celery_app.run_daily_jobs")
def run_daily_jobs() -> dict:
    """Runs whichever daily jobs haven't run today (app/core/daily_jobs.py)."""
    from app.core.daily_jobs import run_due_daily_jobs
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        return run_due_daily_jobs(db)
    finally:
        db.close()


@worker_ready.connect
def _catch_up_on_start(**_kwargs) -> None:
    """The worker just woke up (e.g. after the host slept): catch up now."""
    run_daily_jobs.delay()
