import uuid
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.main import app

client = TestClient(app)


def mock_db_session():
    mock_session = MagicMock()
    # Return 0 for count queries by default
    mock_session.query.return_value.filter.return_value.scalar.return_value = 0
    mock_session.query.return_value.filter.return_value.all.return_value = []
    mock_session.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []
    mock_session.query.return_value.options.return_value.filter.return_value.all.return_value = []
    mock_session.query.return_value.options.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []
    mock_session.query.return_value.options.return_value.order_by.return_value.limit.return_value.all.return_value = []
    mock_session.query.return_value.scalar.return_value = 0
    return mock_session


@pytest.fixture(autouse=True)
def override_db():
    mock_s = mock_db_session()
    app.dependency_overrides[get_db] = lambda: mock_s
    yield mock_s
    app.dependency_overrides.clear()


def test_dashboard_unauthenticated():
    response = client.get("/api/v1/dashboard/summary")
    assert response.status_code == 401
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "unauthenticated"


def test_dashboard_invalid_token():
    response = client.get("/api/v1/dashboard/summary", headers={"Authorization": "Bearer invalid_token_xyz"})
    assert response.status_code == 401
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "unauthenticated"


def test_dashboard_employee():
    user = CurrentUser(
        user_id=uuid.uuid4(),
        role="employee",
        session_id=uuid.uuid4(),
    )
    app.dependency_overrides[get_current_user] = lambda: user

    response = client.get("/api/v1/dashboard/summary")
    assert response.status_code == 200
    payload = response.json()

    assert payload["role"] == "employee"
    assert "metrics" in payload
    assert "widgets" in payload
    assert "my_assigned_assets_count" in payload["metrics"]
    assert "my_assigned_assets" in payload["widgets"]


def test_dashboard_manager():
    user = CurrentUser(
        user_id=uuid.uuid4(),
        role="manager",
        session_id=uuid.uuid4(),
        department_id=uuid.uuid4(),
    )
    app.dependency_overrides[get_current_user] = lambda: user

    response = client.get("/api/v1/dashboard/summary")
    assert response.status_code == 200
    payload = response.json()

    assert payload["role"] == "manager"
    assert "metrics" in payload
    assert "widgets" in payload
    assert "pending_approvals_count" in payload["metrics"]
    assert "team_headcount" in payload["metrics"]
    assert "pending_approvals" in payload["widgets"]
    assert "team_members" in payload["widgets"]


def test_dashboard_hr_admin():
    user = CurrentUser(
        user_id=uuid.uuid4(),
        role="hr_admin",
        session_id=uuid.uuid4(),
        role_id=uuid.uuid4(),
    )
    app.dependency_overrides[get_current_user] = lambda: user

    response = client.get("/api/v1/dashboard/summary")
    assert response.status_code == 200
    payload = response.json()

    assert payload["role"] == "hr_admin"
    assert "metrics" in payload
    assert "widgets" in payload
    assert "active_onboardings_count" in payload["metrics"]
    assert "active_offboardings_count" in payload["metrics"]
    assert "active_onboardings" in payload["widgets"]
    assert "active_offboardings" in payload["widgets"]


def test_dashboard_it_admin():
    user = CurrentUser(
        user_id=uuid.uuid4(),
        role="it_admin",
        session_id=uuid.uuid4(),
        role_id=uuid.uuid4(),
    )
    app.dependency_overrides[get_current_user] = lambda: user

    response = client.get("/api/v1/dashboard/summary")
    assert response.status_code == 200
    payload = response.json()

    assert payload["role"] == "it_admin"
    assert "metrics" in payload
    assert "widgets" in payload
    assert "open_maintenance_tickets_count" in payload["metrics"]
    assert "available_stock_count" in payload["metrics"]
    assert "open_maintenance_tickets" in payload["widgets"]
    assert "expiring_warranties" in payload["widgets"]


def test_dashboard_super_admin():
    user = CurrentUser(
        user_id=uuid.uuid4(),
        role="super_admin",
        session_id=uuid.uuid4(),
    )
    app.dependency_overrides[get_current_user] = lambda: user

    response = client.get("/api/v1/dashboard/summary")
    assert response.status_code == 200
    payload = response.json()

    assert payload["role"] == "super_admin"
    assert "metrics" in payload
    assert "widgets" in payload
    assert "total_users_count" in payload["metrics"]
    assert "system_health" in payload["metrics"]
    assert "system_overview" in payload["widgets"]
    assert "audit_events_feed" in payload["widgets"]


def test_dashboard_auditor():
    user = CurrentUser(
        user_id=uuid.uuid4(),
        role="auditor",
        session_id=uuid.uuid4(),
    )
    app.dependency_overrides[get_current_user] = lambda: user

    response = client.get("/api/v1/dashboard")
    assert response.status_code == 200
    payload = response.json()

    assert payload["role"] == "auditor"
    assert "metrics" in payload
    assert "widgets" in payload
    assert "total_users_count" in payload["metrics"]
    assert "audit_events_feed" in payload["widgets"]
