"""
Daily software-license renewal notification job.

Task path referenced by app/core/celery_app.py's beat schedule:
  - app.modules.licenses.jobs.check_license_renewals  (daily)

Every license whose renewal_date falls from today through today + 30 days
notifies every active it_admin: type `license_renewal`, channel `both`,
is_critical. The job is idempotent: a recipient already holding a
`license_renewal` notification for the same license and the same renewal date
(matched on user_id, type, related_entity_id and the ISO date in the message)
is skipped, so a daily run never re-notifies. If the renewal date moves, the
new date notifies once more.
"""
import logging
import uuid
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.clock import local_today
from app.core.celery_app import celery_app
from app.core.role_policy import user_holds_role_names
from app.db.session import SessionLocal
from app.models.assets import SoftwareLicense
from app.models.auth import User, UserStatus
from app.models.system import Notification, NotificationChannel

logger = logging.getLogger(__name__)

RENEWAL_WINDOW_DAYS = 30
NOTIFICATION_TYPE = "license_renewal"


def _message(license_: SoftwareLicense) -> str:
    return f"{license_.name} ({license_.vendor}) renews on {license_.renewal_date.isoformat()}."


def _run_license_renewal_check(db: Session, as_of: Optional[date] = None) -> dict:
    """Business logic behind check_license_renewals, split out for testing."""
    as_of = as_of or local_today()
    window_end = as_of + timedelta(days=RENEWAL_WINDOW_DAYS)

    licenses = (
        db.query(SoftwareLicense)
        .filter(SoftwareLicense.renewal_date.isnot(None), SoftwareLicense.renewal_date >= as_of,
                SoftwareLicense.renewal_date <= window_end)
        .all()
    )
    if not licenses:
        return {"created": 0}

    recipients = (
        db.query(User).filter(user_holds_role_names(["it_admin"]), User.status == UserStatus.active).all()
    )
    if not recipients:
        return {"created": 0}

    existing = {
        (user_id, related_id, message)
        for user_id, related_id, message in db.query(
            Notification.user_id, Notification.related_entity_id, Notification.message
        )
        .filter(
            Notification.type == NOTIFICATION_TYPE,
            Notification.related_entity_id.in_([lic.id for lic in licenses]),
        )
        .all()
    }

    created = 0
    for lic in licenses:
        message = _message(lic)
        for admin in recipients:
            if (admin.id, lic.id, message) in existing:
                continue
            db.add(
                Notification(
                    id=uuid.uuid4(),
                    user_id=admin.id,
                    type=NOTIFICATION_TYPE,
                    title="Software License Renewal Coming Up",
                    message=message,
                    related_entity_type="software_license",
                    related_entity_id=lic.id,
                    channel=NotificationChannel.both,
                    is_critical=True,
                )
            )
            created += 1

    db.commit()
    return {"created": created}


@celery_app.task(name="app.modules.licenses.jobs.check_license_renewals")
def check_license_renewals() -> dict:
    """Daily license-renewal notification job — see module docstring."""
    db = SessionLocal()
    try:
        result = _run_license_renewal_check(db)
        logger.info("check_license_renewals: created %s notification(s)", result["created"])
        return result
    finally:
        db.close()
