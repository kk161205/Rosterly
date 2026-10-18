"""
Email dispatch worker (project doc §6, §7 rule 5).

Task path referenced by app/core/celery_app.py's beat schedule:
  - app.modules.notifications.dispatch.dispatch_pending_emails  (every 120s)

Celery tasks run outside FastAPI's request scope, so the task opens and
closes its own SQLAlchemy session via app.db.session.SessionLocal (see
app/db/session.py) instead of using the get_db() request dependency.

Sending goes through app/modules/notifications/email.py, which stays disabled until
real SMTP credentials are supplied and EMAIL_DELIVERY_ENABLED=true (rules.md
§4.5). While delivery is unavailable, _send_email returns False and the caller
deliberately does NOT stamp email_sent_at — the row stays pending and is sent
on a later run once delivery is switched on.
"""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.celery_app import celery_app
from app.db.session import SessionLocal
from app.models.system import Notification, NotificationChannel
from app.modules.notifications.email import send_email

logger = logging.getLogger(__name__)


def notify_role_changed(db: Session, user_id: uuid.UUID, new_role_name: str) -> None:
    """
    §6 trigger "Role changed": critical account_updated notification to the
    affected user, sent in-app and by email regardless of their email
    preference. Added to the caller's transaction — the caller commits.
    """
    db.add(
        Notification(
            id=uuid.uuid4(),
            user_id=user_id,
            type="account_updated",
            title="Your access role was changed",
            message=(
                f"Your role is now '{new_role_name}'. You have been signed out "
                "of all devices — sign in again to continue with your new permissions."
            ),
            related_entity_type="user",
            related_entity_id=user_id,
            channel=NotificationChannel.both,
            is_critical=True,
        )
    )


def _send_email(notification: Notification) -> bool:
    """
    Sends one notification by email. Returns True only on a confirmed send,
    so the caller knows whether to stamp email_sent_at.
    """
    recipient_email = notification.user.email if notification.user else None
    if not recipient_email:
        logger.warning(
            "Notification %s has no resolvable recipient email — skipping send",
            notification.id,
        )
        return False
    return send_email(recipient_email, notification.title, notification.message)


def _run_dispatch_pending_emails(db) -> dict:
    """
    Business logic behind dispatch_pending_emails, split out from the Celery
    task body so it can be unit tested against a mocked db session.
    """
    pending = (
        db.query(Notification)
        .filter(
            or_(
                Notification.channel == NotificationChannel.email,
                Notification.channel == NotificationChannel.both,
            ),
            Notification.email_sent_at.is_(None),
        )
        .all()
    )

    sent = 0
    skipped = 0
    for notification in pending:
        if _send_email(notification):
            notification.email_sent_at = datetime.now(timezone.utc)
            sent += 1
        else:
            skipped += 1

    db.commit()
    return {"sent": sent, "skipped": skipped}


@celery_app.task(name="app.modules.notifications.dispatch.dispatch_pending_emails")
def dispatch_pending_emails() -> dict:
    """
    Short-interval email dispatch worker — picks up notifications rows
    where channel IN (email, both) and email_sent_at IS NULL, sends via
    email, and stamps email_sent_at on success. See module docstring for
    the current SMTP-configuration blocker.
    """
    db = SessionLocal()
    try:
        result = _run_dispatch_pending_emails(db)
        if result["skipped"]:
            logger.warning(
                "dispatch_pending_emails: %s notification(s) left pending "
                "(SMTP unavailable or send failed), %s sent",
                result["skipped"],
                result["sent"],
            )
        return result
    finally:
        db.close()
