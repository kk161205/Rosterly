"""The client IP behind a proxy can't be forged from the left of X-Forwarded-For."""
from types import SimpleNamespace

import pytest

from app.core import request_context
from app.core.config import Settings


def _req(headers: dict, peer: str = "10.0.0.9"):
    return SimpleNamespace(headers={k.lower(): v for k, v in headers.items()}, client=SimpleNamespace(host=peer))


def test_uses_the_entry_the_trusted_proxy_added_not_what_the_client_sent(monkeypatch):
    monkeypatch.setattr(request_context.settings, "TRUSTED_PROXY_HOPS", 1)
    monkeypatch.setattr(request_context.settings, "CLIENT_IP_HEADER", "")
    assert request_context.client_ip(_req({"X-Forwarded-For": "1.2.3.4, 203.0.113.7"})) == "203.0.113.7"
    assert request_context.client_ip(_req({})) == "10.0.0.9"


def test_a_proxy_written_header_wins_when_configured(monkeypatch):
    monkeypatch.setattr(request_context.settings, "CLIENT_IP_HEADER", "True-Client-IP")
    assert request_context.client_ip(_req({"True-Client-IP": "198.51.100.2", "X-Forwarded-For": "1.1.1.1"})) == "198.51.100.2"


def test_locally_the_tcp_peer_is_used(monkeypatch):
    monkeypatch.setattr(request_context.settings, "TRUSTED_PROXY_HOPS", 0)
    monkeypatch.setattr(request_context.settings, "CLIENT_IP_HEADER", "")
    assert request_context.client_ip(_req({"X-Forwarded-For": "6.6.6.6"})) == "10.0.0.9"


def test_production_refuses_a_malformed_mfa_key_and_trailing_slash_origins():
    base = dict(_env_file=None, ENVIRONMENT="production", JWT_SECRET_KEY="x" * 40, DATABASE_URL="postgresql://u:p@db.example.com/r",
                FRONTEND_BASE_URL="https://app.example.com")
    with pytest.raises(ValueError, match="Fernet"):
        Settings(**base, CORS_ORIGINS="https://app.example.com", MFA_ENCRYPTION_KEY="not-a-key")
    with pytest.raises(ValueError, match="must not end with"):
        Settings(**base, CORS_ORIGINS="https://app.example.com/", MFA_ENCRYPTION_KEY="x")
