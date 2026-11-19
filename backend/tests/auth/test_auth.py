import uuid
from datetime import datetime, timedelta, timezone

import pyotp
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.mfa import encrypt_secret
from app.core.password_tokens import issue_password_token
from app.core.security import get_password_hash
from app.db.session import Base, get_db
from app.main import app
from app.models.system import RateLimitEvent
from app.models.auth import (
    LoginAttempt,
    PasswordToken,
    PasswordTokenPurpose,
    Role,
    Session as SessionModel,
    User,
    UserStatus,
)

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
MFA_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

Base.metadata.create_all(bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()

    # Clean previous test data
    db.query(SessionModel).delete()
    db.query(LoginAttempt).delete()
    db.query(User).delete()
    db.query(Role).delete()
    db.commit()

    # Seed roles
    role_emp = Role(id=uuid.uuid4(), name="employee", description="Employee role", is_system_role=True)
    role_admin = Role(id=uuid.uuid4(), name="super_admin", description="Admin role", is_system_role=True)
    db.add(role_emp)
    db.add(role_admin)
    db.commit()

    # Seed test user
    hashed_pwd = get_password_hash("Password123!")
    user = User(
        id=uuid.uuid4(),
        employee_code="RST-0001",
        full_name="Test User",
        email="testuser@example.com",
        password_hash=hashed_pwd,
        role_id=role_emp.id,
        designation="Software Engineer",
        status=UserStatus.active,
        mfa_enabled=False,
    )
    db.add(user)

    # Seed MFA user
    mfa_user = User(
        id=uuid.uuid4(),
        employee_code="RST-0002",
        full_name="MFA User",
        email="mfauser@example.com",
        password_hash=hashed_pwd,
        role_id=role_emp.id,
        designation="Security Specialist",
        status=UserStatus.active,
        mfa_enabled=True,
        mfa_secret_encrypted=encrypt_secret(MFA_SECRET),
    )
    db.add(mfa_user)

    # Seed Inactive user
    inactive_user = User(
        id=uuid.uuid4(),
        employee_code="RST-0003",
        full_name="Inactive User",
        email="inactive@example.com",
        password_hash=hashed_pwd,
        role_id=role_emp.id,
        designation="Former Employee",
        status=UserStatus.terminated,
        mfa_enabled=False,
    )
    db.add(inactive_user)

    db.commit()
    db.close()

    yield


def test_login_success():
    response = client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"email": "testuser@example.com", "password": "Password123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert data["mfa_required"] is False


def test_login_invalid_password():
    response = client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"email": "testuser@example.com", "password": "WrongPassword!"},
    )
    assert response.status_code == 401
    data = response.json()
    assert data["error"]["code"] == "invalid_credentials"
    assert data["error"]["message"] == "Invalid email or password"


def _mfa_login() -> str:
    resp = client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"email": "mfauser@example.com", "password": "Password123!"},
    )
    assert resp.status_code == 200
    assert resp.json()["mfa_required"] is True
    return resp.json()["mfa_session_id"]


def _verify(session_id: str, code: str):
    return client.post(f"{settings.API_V1_PREFIX}/auth/mfa/verify", json={"mfa_session_id": session_id, "code": code})


def test_login_mfa_required_then_authenticator_code_signs_in():
    session_id = _mfa_login()
    resp = _verify(session_id, pyotp.TOTP(MFA_SECRET).now())
    assert resp.status_code == 200
    assert "access_token" in resp.json() and "refresh_token" in resp.json()


def test_the_old_fixed_code_no_longer_works():
    assert _verify(_mfa_login(), "123456").status_code == 401


def test_mfa_wrong_session_id_rejected():
    _mfa_login()
    resp = _verify(str(uuid.uuid4()), pyotp.TOTP(MFA_SECRET).now())
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "mfa_invalid"


def test_mfa_session_is_single_use_and_codes_are_not_reused():
    code = pyotp.TOTP(MFA_SECRET).now()
    session_id = _mfa_login()
    assert _verify(session_id, code).status_code == 200
    assert _verify(session_id, code).status_code == 401
    # A fresh sign-in can't replay the same code either.
    assert _verify(_mfa_login(), code).status_code == 401


def test_mfa_challenge_dies_after_five_wrong_codes():
    session_id = _mfa_login()
    for _ in range(5):
        assert _verify(session_id, "000000").status_code == 401
    assert _verify(session_id, pyotp.TOTP(MFA_SECRET).now()).status_code == 401
    db = TestingSessionLocal()
    assert db.query(LoginAttempt).filter(LoginAttempt.failure_reason == "mfa_failed").count() == 5
    db.close()


def test_mfa_resend_endpoint_is_gone():
    assert client.post(f"{settings.API_V1_PREFIX}/auth/mfa/resend", json={"mfa_session_id": "x"}).status_code == 404


def test_account_lockout_after_5_failures():
    email = "testuser@example.com"
    # Make 5 failed attempts
    for _ in range(5):
        resp = client.post(
            f"{settings.API_V1_PREFIX}/auth/login",
            json={"email": email, "password": "WrongPassword!"},
        )
        assert resp.status_code == 401

    # 6th attempt should return 400 account_locked
    locked_resp = client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert locked_resp.status_code == 400
    data = locked_resp.json()
    assert data["error"]["code"] == "account_locked"


def test_lockout_does_not_self_extend_from_polling_while_locked():
    """Regression test: attempts rejected *because* the account was already
    locked (failure_reason=account_locked) must not themselves count toward
    triggering a new lock — otherwise a client that keeps hitting /auth/login
    while locked can keep the account locked indefinitely. Simulates the
    original 5 genuine failures aging out of the 15-minute window, with a
    burst of more-recent account_locked rows in between (as if the client
    kept polling while locked) — login should succeed once the genuine
    failures are outside the window, regardless of the polling noise."""
    email = "lockouttest@example.com"
    db = TestingSessionLocal()
    now = datetime.now(timezone.utc)
    try:
        user = User(
            id=uuid.uuid4(),
            employee_code="RST-9999",
            full_name="Lockout Test User",
            email=email,
            password_hash=get_password_hash("Password123!"),
            role_id=db.query(Role).filter(Role.name == "employee").first().id,
            designation="Tester",
            status=UserStatus.active,
            date_of_joining=datetime.now(timezone.utc).date(),
        )
        db.add(user)

        # 5 genuine failures, well outside the trailing 15-minute window.
        for _ in range(5):
            db.add(
                LoginAttempt(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    email_attempted=email,
                    success=False,
                    failure_reason="invalid_credentials",
                    created_at=now - timedelta(minutes=20),
                )
            )
        # A burst of "already locked" rejections logged recently — simulating
        # a client that kept polling /auth/login while locked.
        for _ in range(10):
            db.add(
                LoginAttempt(
                    id=uuid.uuid4(),
                    email_attempted=email,
                    success=False,
                    failure_reason="account_locked",
                    created_at=now - timedelta(minutes=1),
                )
            )
        db.commit()
    finally:
        db.close()

    resp = client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert resp.status_code == 200
    assert resp.json()["mfa_required"] is False


def test_token_refresh_and_rotation():
    login_resp = client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"email": "testuser@example.com", "password": "Password123!"},
    )
    login_data = login_resp.json()
    refresh_token = login_data["refresh_token"]

    refresh_resp = client.post(
        f"{settings.API_V1_PREFIX}/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refresh_resp.status_code == 200
    refresh_data = refresh_resp.json()
    assert "access_token" in refresh_data
    assert "refresh_token" in refresh_data
    assert refresh_data["refresh_token"] != refresh_token  # Rotated

    # Using old refresh token should fail
    old_refresh_resp = client.post(
        f"{settings.API_V1_PREFIX}/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert old_refresh_resp.status_code == 401
    assert old_refresh_resp.json()["error"]["code"] == "token_invalid"


def test_forgot_password_generic_message_when_email_is_on(monkeypatch):
    monkeypatch.setattr("app.modules.auth.service.email_delivery_available", lambda: True)
    monkeypatch.setattr("app.modules.auth.service.send_password_reset_email", lambda *a: True)
    for email in ("nonexistent@example.com", "testuser@example.com"):
        resp = client.post(f"{settings.API_V1_PREFIX}/auth/forgot-password", json={"email": email})
        assert resp.status_code == 200
        assert "If an account with that email exists" in resp.json()["message"]


def test_forgot_password_says_ask_an_admin_when_email_is_off():
    resp = client.post(f"{settings.API_V1_PREFIX}/auth/forgot-password", json={"email": "testuser@example.com"})
    assert resp.status_code == 200
    assert "Ask your HR or IT admin" in resp.json()["message"]


def test_login_email_is_case_insensitive():
    resp = client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"email": "TestUser@Example.com", "password": "Password123!"},
    )
    assert resp.status_code == 200


def test_new_link_cancels_the_previous_one_and_expired_links_fail():
    db = TestingSessionLocal()
    user_id = db.query(User.id).filter(User.email == "testuser@example.com").scalar()
    first = issue_password_token(db, user_id, PasswordTokenPurpose.reset)
    second = issue_password_token(db, user_id, PasswordTokenPurpose.reset)
    db.commit()
    db.close()

    url = f"{settings.API_V1_PREFIX}/auth/reset-password"
    assert client.post(url, json={"token": first, "new_password": "FirstNewPassword123!"}).status_code == 400
    assert client.post(url, json={"token": second, "new_password": "FirstNewPassword123!"}).status_code == 200

    db = TestingSessionLocal()
    stale = issue_password_token(db, user_id, PasswordTokenPurpose.reset)
    db.query(PasswordToken).filter(PasswordToken.used_at.is_(None)).update(
        {PasswordToken.expires_at: datetime.now(timezone.utc) - timedelta(minutes=1)}
    )
    db.commit()
    db.close()
    assert client.post(url, json={"token": stale, "new_password": "SecondNewPassword123!"}).status_code == 400


def test_login_is_rate_limited_per_ip(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_RATE_LIMITS_ENABLED", True)
    db = TestingSessionLocal()
    db.query(RateLimitEvent).delete()
    db.commit()
    db.close()
    codes = [
        client.post(
            f"{settings.API_V1_PREFIX}/auth/login", json={"email": f"nobody{i}@example.com", "password": "x"}
        ).status_code
        for i in range(21)
    ]
    assert codes[:20] == [401] * 20
    assert codes[20] == 429


def test_reset_password_revokes_all_sessions():
    # Login to create an active session
    login_resp = client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"email": "testuser@example.com", "password": "Password123!"},
    )
    access_token = login_resp.json()["access_token"]

    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "testuser@example.com").first()
    reset_token = issue_password_token(db, user.id, PasswordTokenPurpose.reset)
    db.commit()
    db.close()

    reset_resp = client.post(
        f"{settings.API_V1_PREFIX}/auth/reset-password",
        json={"token": reset_token, "new_password": "NewSecurePassword123!"},
    )
    assert reset_resp.status_code == 200

    # Request with old access_token should now be rejected (Zero Trust)
    logout_resp = client.post(
        f"{settings.API_V1_PREFIX}/auth/logout",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert logout_resp.status_code == 401
    assert logout_resp.json()["error"]["code"] == "unauthenticated"


def test_reset_password_token_cannot_be_replayed():
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "testuser@example.com").first()
    reset_token = issue_password_token(db, user.id, PasswordTokenPurpose.reset)
    db.commit()
    db.close()

    first = client.post(
        f"{settings.API_V1_PREFIX}/auth/reset-password",
        json={"token": reset_token, "new_password": "FirstNewPassword123!"},
    )
    assert first.status_code == 200

    # Replaying the same token (e.g. forwarded or reused) must be rejected even
    # though it hasn't naturally expired yet.
    second = client.post(
        f"{settings.API_V1_PREFIX}/auth/reset-password",
        json={"token": reset_token, "new_password": "SecondNewPassword123!"},
    )
    assert second.status_code == 400
    assert second.json()["error"]["code"] == "validation_error"


def test_forgot_password_does_not_log_raw_token(caplog):
    import logging

    with caplog.at_level(logging.INFO, logger="app.modules.auth.service"):
        client.post(
            f"{settings.API_V1_PREFIX}/auth/forgot-password",
            json={"email": "testuser@example.com"},
        )
    for record in caplog.records:
        assert "eyJ" not in record.message  # no raw JWT ever logged


def test_forgot_password_is_rate_limited(caplog):
    import logging
    from app.modules.auth import service as auth_service

    db = TestingSessionLocal()
    email = "testuser@example.com"

    with caplog.at_level(logging.INFO, logger="app.modules.auth.service"):
        for _ in range(5):
            auth_service.forgot_password(db, email)

    reset_logs = [r for r in caplog.records if "Password reset requested" in r.message]
    # Max 3 token-issuing attempts per 15-minute window — the rest are silently throttled.
    assert len(reset_logs) <= 3
    db.close()


def test_logout_and_logout_all_devices():
    login_resp = client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"email": "testuser@example.com", "password": "Password123!"},
    )
    access_token = login_resp.json()["access_token"]

    # Logout current session
    logout_resp = client.post(
        f"{settings.API_V1_PREFIX}/auth/logout",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert logout_resp.status_code == 200

    # Subsequent call with same token fails
    logout_again_resp = client.post(
        f"{settings.API_V1_PREFIX}/auth/logout",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert logout_again_resp.status_code == 401
