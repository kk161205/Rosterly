"""
Rate limits kept in Postgres (`rate_limit_events`), so they hold across
workers and restarts. Used per email for forgot-password and per client IP
for the public auth endpoints.
"""
import random
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.core.request_context import client_ip
from app.db.session import get_db
from app.models.system import RateLimitEvent

_PRUNE_AFTER = timedelta(days=1)


def hit(db: Session, key: str, limit: int, window_seconds: int) -> bool:
    """Records one attempt for `key` and returns True if the limit was already
    reached in the window (the attempt is then not recorded). Commits."""
    now = datetime.now(timezone.utc)
    since = now - timedelta(seconds=window_seconds)
    count = (
        db.query(RateLimitEvent)
        .filter(RateLimitEvent.key == key, RateLimitEvent.created_at >= since)
        .count()
    )
    if count >= limit:
        return True
    db.add(RateLimitEvent(id=uuid.uuid4(), key=key, created_at=now))
    # Occasionally drop old rows so the table stays small without a job.
    if random.random() < 0.02:
        db.query(RateLimitEvent).filter(RateLimitEvent.created_at < now - _PRUNE_AFTER).delete(
            synchronize_session=False
        )
    db.commit()
    return False


def limit_per_ip(name: str, limit: int, window_seconds: int):
    """Route dependency: at most `limit` calls per client IP per window."""

    def dependency(request: Request, db: Session = Depends(get_db)) -> None:
        if settings.AUTH_RATE_LIMITS_ENABLED and hit(db, f"ip:{client_ip(request)}:{name}", limit, window_seconds):
            raise AppError(429, "rate_limited", "Too many attempts. Please wait a few minutes and try again.")

    return dependency
