import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    get_password_hash,
)
from app.db.session import Base, get_db
from app.main import app
from app.models.auth import (
    LoginAttempt,
    Role,
    Session as SessionModel,
    User,
    UserStatus,
)

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

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


def test_login_mfa_required():
    response = client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"email": "mfauser@example.com", "password": "Password123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["mfa_required"] is True
    assert "mfa_session_id" in data

    # Verify MFA endpoint
    mfa_resp = client.post(
        f"{settings.API_V1_PREFIX}/auth/mfa/verify",
        json={"mfa_session_id": data["mfa_session_id"], "code": "123456"},
    )
    assert mfa_resp.status_code == 200
    mfa_data = mfa_resp.json()
    assert "access_token" in mfa_data
    assert "refresh_token" in mfa_data


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


def test_forgot_password_generic_message():
    resp = client.post(
        f"{settings.API_V1_PREFIX}/auth/forgot-password",
        json={"email": "nonexistent@example.com"},
    )
    assert resp.status_code == 200
    assert "If an account with that email exists" in resp.json()["message"]


def test_reset_password_revokes_all_sessions():
    # Login to create an active session
    login_resp = client.post(
        f"{settings.API_V1_PREFIX}/auth/login",
        json={"email": "testuser@example.com", "password": "Password123!"},
    )
    access_token = login_resp.json()["access_token"]

    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "testuser@example.com").first()
    reset_token = create_password_reset_token(user.id)
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
