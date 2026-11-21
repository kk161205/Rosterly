"""Suite-wide test settings."""
import pytest

from app.core.config import settings


@pytest.fixture(autouse=True)
def _no_auth_rate_limits(monkeypatch):
    """Tests sign in far more often than any person would; the per-IP auth
    limits are switched on only in the tests that check them."""
    monkeypatch.setattr(settings, "AUTH_RATE_LIMITS_ENABLED", False)
