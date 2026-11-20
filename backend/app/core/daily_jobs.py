"""
Daily background jobs that catch up.

On Render's free tier the service sleeps after 15 minutes without traffic, so
a job scheduled for a fixed time can be missed. Instead, `run_due_daily_jobs`
runs hourly (and when the worker starts): each daily job runs at most once per
day, the first time the worker is awake that day. `job_runs` records the last
run. Every job is also safe to run twice.
"""
import logging
from datetime import date
from typing import Optional
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.core.clock import local_today
from app.models.system import JobRun

logger = logging.getLogger(__name__)


def _jobs() -> dict[str, Callable[[Session], dict]]:
    # Imported here so the job modules (which import the Celery app) load lazily.
    from app.modules.assets.jobs import _run_warranty_amc_expiry_check
    from app.modules.licenses.jobs import _run_license_renewal_check

    return {
        "warranty_amc_expiry": _run_warranty_amc_expiry_check,
        "license_renewals": _run_license_renewal_check,
    }


def run_due_daily_jobs(db: Session, today: Optional[date] = None) -> dict[str, dict]:
    """Runs each daily job that hasn't run today; returns what ran."""
    today = today or local_today()
    ran: dict[str, dict] = {}
    for name, job in _jobs().items():
        row = db.get(JobRun, name)
        if row is not None and row.last_run_on >= today:
            continue
        try:
            result = job(db)
        except Exception:  # one failing job must not stop the others
            db.rollback()
            logger.exception("Daily job %s failed", name)
            continue
        row = db.get(JobRun, name)
        if row is None:
            db.add(JobRun(name=name, last_run_on=today, last_result=result))
        else:
            row.last_run_on, row.last_result = today, result
        db.commit()
        ran[name] = result
        logger.info("Daily job %s ran: %s", name, result)
    return ran
