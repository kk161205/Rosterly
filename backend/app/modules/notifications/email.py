"""
Outgoing email (project doc §1.19, §5.1, §5.14, §6).

One place builds and sends every email: account invites, password resets and
the critical-notification channel used by the dispatch worker
(app/modules/notifications/dispatch.py).

Delivery is OFF until a developer supplies real SMTP credentials and sets
EMAIL_DELIVERY_ENABLED=true (rules.md §4.5 — no fake credentials or provider).
While it is off, send_email() logs that delivery is disabled and returns False;
callers treat that as "not sent" and never fail the user's action because of it.

Never log a link or token from these emails (rules.md §5.3) — identifiers only.
"""
import logging
import smtplib
from email.message import EmailMessage
from urllib.parse import urlencode

from app.core.config import settings

logger = logging.getLogger(__name__)


def smtp_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)


def email_delivery_available() -> bool:
    return settings.EMAIL_DELIVERY_ENABLED and smtp_configured()


def send_email(to_address: str, subject: str, body: str) -> bool:
    """Sends one plain-text email. Returns True only on a confirmed send."""
    if not email_delivery_available():
        logger.info("Email delivery disabled or SMTP not configured — email not sent")
        return False
    if not to_address:
        logger.warning("Email has no recipient address — not sent")
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM_ADDRESS
    msg["To"] = to_address
    msg.set_content(body)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
        return True
    except Exception:
        logger.exception("Failed to send email")
        return False


def _set_password_link(token: str) -> str:
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return f"{base}/reset-password?{urlencode({'token': token})}"


def send_invite_email(to_address: str, full_name: str, token: str) -> bool:
    """§5.14: invite with a set-password link (activates the account when used)."""
    body = (
        f"Hi {full_name},\n\n"
        "An account has been created for you on Rosterly.\n"
        "Set your password to activate it:\n\n"
        f"{_set_password_link(token)}\n\n"
        f"This link expires in {settings.INVITE_TOKEN_EXPIRE_HOURS} hours and can be used once."
    )
    return send_email(to_address, "You're invited to Rosterly", body)


def send_password_reset_email(to_address: str, full_name: str, token: str) -> bool:
    """§5.1: forgot-password reset link."""
    body = (
        f"Hi {full_name},\n\n"
        "We received a request to reset your Rosterly password:\n\n"
        f"{_set_password_link(token)}\n\n"
        "This link expires in 15 minutes and can be used once. "
        "If you didn't ask for this, you can ignore this email."
    )
    return send_email(to_address, "Reset your Rosterly password", body)
