"""
Asset scheduled job.

Task path referenced by app/core/celery_app.py's beat schedule:
  - app.modules.assets.jobs.check_warranty_amc_expiry   (daily)

Every asset (not retired) whose warranty or AMC ends within the next 30 days
notifies every active it_admin once: type `warranty_expiring`, channel `both`,
critical. It looks at a window, not one exact day, so a day the job
didn't run (e.g. the server was asleep) never loses an alert; and it skips a
person who already has the alert for that asset and that end date, so daily
runs don't repeat it.

There is no depreciation job: an asset's life is told by its status
.
"""
import logging
import uuid
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.clock import local_today
from app.core.celery_app import celery_app
from app.core.role_policy import user_holds_role_names
from app.db.session import SessionLocal
from app.models.assets import Asset, AssetStatus
from app.models.auth import User, UserStatus
from app.models.system import Notification, NotificationChannel

logger = logging.getLogger(__name__)

WARRANTY_EXPIRY_WINDOW_DAYS = 30
NOTIFICATION_TYPE = "warranty_expiring"


def _endings(asset: Asset, start: date, end: date) -> list[tuple[str, date]]:
    out = []
    if asset.warranty_expiry and start <= asset.warranty_expiry <= end:
        out.append(("warranty", asset.warranty_expiry))
    if asset.amc_expiry and start <= asset.amc_expiry <= end:
        out.append(("AMC", asset.amc_expiry))
    return out


def _run_warranty_amc_expiry_check(db: Session, as_of: Optional[date] = None) -> dict:
    """Business logic behind check_warranty_amc_expiry, split out for testing."""
    as_of = as_of or local_today()
    window_end = as_of + timedelta(days=WARRANTY_EXPIRY_WINDOW_DAYS)

    assets = (
        db.query(Asset)
        .filter(
            Asset.status != AssetStatus.retired,
            or_(
                Asset.warranty_expiry.between(as_of, window_end),
                Asset.amc_expiry.between(as_of, window_end),
            ),
        )
        .all()
    )
    if not assets:
        return {"created": 0}
    admins = db.query(User).filter(user_holds_role_names(["it_admin"]), User.status == UserStatus.active).all()
    if not admins:
        return {"created": 0}

    already = {
        (user_id, related_id, message)
        for user_id, related_id, message in db.query(
            Notification.user_id, Notification.related_entity_id, Notification.message
        ).filter(Notification.type == NOTIFICATION_TYPE, Notification.related_entity_id.in_([a.id for a in assets]))
    }

    created = 0
    for asset in assets:
        for label, ends_on in _endings(asset, as_of, window_end):
            message = f"The {label} for {asset.name} ({asset.asset_tag}) ends on {ends_on.isoformat()}."
            for admin in admins:
                if (admin.id, asset.id, message) in already:
                    continue
                db.add(
                    Notification(
                        id=uuid.uuid4(),
                        user_id=admin.id,
                        type=NOTIFICATION_TYPE,
                        title="Warranty or AMC ending soon",
                        message=message,
                        related_entity_type="asset",
                        related_entity_id=asset.id,
                        channel=NotificationChannel.both,
                        is_critical=True,
                    )
                )
                created += 1
    db.commit()
    return {"created": created}


@celery_app.task(name="app.modules.assets.jobs.check_warranty_amc_expiry")
def check_warranty_amc_expiry() -> dict:
    """Daily warranty/AMC expiry notification job — see module docstring."""
    db = SessionLocal()
    try:
        result = _run_warranty_amc_expiry_check(db)
        logger.info("check_warranty_amc_expiry: created %s notification(s)", result["created"])
        return result
    finally:
        db.close()
