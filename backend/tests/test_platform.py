"""Cross-cutting production behaviour: error envelope, headers, config checks."""
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import DEV_JWT_SECRET, Settings
from app.main import app

client = TestClient(app)


def test_unknown_route_uses_the_error_envelope():
    res = client.get("/api/v1/does-not-exist")
    assert res.status_code == 404
    assert res.json() == {"error": {"code": "not_found", "message": "Not Found", "field_errors": None}}


def test_wrong_method_uses_the_error_envelope():
    res = client.delete("/health")
    assert res.status_code == 405
    assert res.json()["error"]["code"] == "method_not_allowed"


def test_every_response_has_a_request_id_and_security_headers():
    res = client.get("/health", headers={"X-Request-ID": "abc123"})
    assert res.headers["X-Request-ID"] == "abc123"
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"
    assert "default-src 'none'" in res.headers["Content-Security-Policy"]
    assert client.get("/health").headers["X-Request-ID"]  # generated when not sent


def test_health_does_not_reveal_the_environment():
    assert client.get("/health").json() == {"status": "ok"}


GOOD_PRODUCTION = {
    "ENVIRONMENT": "production",
    "JWT_SECRET_KEY": "x" * 40,
    "DATABASE_URL": "postgresql://u:p@db.example.com/rosterly",
    "CORS_ORIGINS": "https://rosterly.vercel.app",
    "FRONTEND_BASE_URL": "https://rosterly.vercel.app",
    "MFA_ENCRYPTION_KEY": "q8WqzCQK1n0Bbm9pX4Xc2B7y3jE5h0iY6F1sK2lD3aQ=",
}


def test_production_config_accepts_real_values():
    assert Settings(_env_file=None, **GOOD_PRODUCTION).is_production


@pytest.mark.parametrize(
    "override",
    [
        {"JWT_SECRET_KEY": DEV_JWT_SECRET},
        {"JWT_SECRET_KEY": "short"},
        {"DATABASE_URL": "postgresql://rosterly:changeme@localhost:5432/rosterly"},
        {"CORS_ORIGINS": "http://localhost:5173"},
        {"FRONTEND_BASE_URL": "http://localhost:5173"},
        {"MFA_ENCRYPTION_KEY": ""},
    ],
)
def test_production_refuses_development_defaults(override):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{**GOOD_PRODUCTION, **override})
