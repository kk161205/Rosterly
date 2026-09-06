"""
Email dispatch worker (project doc §6, §7 rule 5).

Task path referenced by app/core/celery_app.py's beat schedule:
  - app.services.notifications.dispatch_pending_emails  (every 120s)

Celery tasks run outside FastAPI's request scope, so the task opens and
closes its own SQLAlchemy session via app.db.session.SessionLocal (see
app/db/session.py) instead of using the get_db() request dependency.

SMTP BLOCKER (rules.md §4.5): app/core/config.py already defines SMTP_HOST /
SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_FROM_ADDRESS settings, but as of
this writing backend/.env leaves SMTP_HOST, SMTP_USER and SMTP_PASSWORD all
empty — there is no real SMTP provider configured anywhere in this codebase.
Per rules.md §4.5 ("if a task requires a new secret/credential that doesn't
exist yet, ask the developer rather than stubbing in a fake value"), we do
NOT invent fake credentials or a fake provider here.

The query/filtering logic below (which rows are "pending", how they're
selected) is fully implemented and correct. The actual send step
(`_send_email`) checks whether SMTP is configured; when it isn't, it logs a
clear warning and returns False, and the caller deliberately does NOT stamp
email_sent_at in that case — the row stays pending and will be correctly
picked up and sent on a later run once real SMTP credentials are supplied.
This is a genuine blocker requiring a developer to supply real SMTP
credentials (or swap in whatever transactional email provider is chosen);
it is not something this job can resolve on its own.
"""
import logging
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Optional

from sqlalchemy import or_

from app.core.celery_app import celery_app
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.system import Notification, NotificationChannel

logger = logging.getLogger(__name__)


def _smtp_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)


def _send_email(notification: Notification) -> bool:
    """
    Attempts to send one notification via SMTP using Python's stdlib
    smtplib/email (no new dependency). Returns True only on a confirmed
    successful send; False in every other case (unconfigured SMTP, missing
    recipient email, or a send failure), so the caller knows not to stamp
    email_sent_at.
    """
    if not _smtp_configured():
        logger.warning(
            "SMTP not configured — notification email not sent (id=%s)",
            notification.id,
        )
        return False

    recipient_email = notification.user.email if notification.user else None
    if not recipient_email:
        logger.warning(
            "Notification %s has no resolvable recipient email — skipping send",
            notification.id,
        )
        return False

    msg = EmailMessage()
    msg["Subject"] = notification.title
    msg["From"] = settings.SMTP_FROM_ADDRESS
    msg["To"] = recipient_email
    msg.set_content(notification.message)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
        return True
    except Exception:
        logger.exception("Failed to send notification email (id=%s)", notification.id)
        return False


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


@celery_app.task(name="app.services.notifications.dispatch_pending_emails")
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
