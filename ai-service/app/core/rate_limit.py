"""Per-person limits on AI calls, kept in memory: the service runs as one instance."""
import time
from collections import defaultdict, deque

from app.core.config import settings


class RateLimiter:
    def __init__(self, per_minute: int | None = None, per_day: int | None = None):
        self.per_minute = per_minute if per_minute is not None else settings.AI_RATE_PER_MINUTE
        self.per_day = per_day if per_day is not None else settings.AI_RATE_PER_DAY
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, now: float | None = None) -> bool:
        now = time.time() if now is None else now
        hits = self._hits[key]
        while hits and now - hits[0] > 86_400:
            hits.popleft()
        last_minute = sum(1 for t in hits if now - t <= 60)
        if last_minute >= self.per_minute or len(hits) >= self.per_day:
            return False
        hits.append(now)
        return True


limiter = RateLimiter()
