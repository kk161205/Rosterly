import uuid
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user
from app.db.session import Base, get_db
from app.main import app
from app.models.auth import Department, Role, User, UserStatus
from app.models.requests import (
    ApprovalStatus,
    Request,
    RequestApproval,
    RequestPriority,
    RequestStatus,
    RequestType,
)
from app.modules.dashboard.service import DashboardService
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

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


def test_dashboard_manager_pending_approvals_filter():
    """
    Exercises the pending approvals filter in DashboardService (PRD §5.12 alignment):
    - Current step match: only approvals where step_order == request.current_step
    - Role queue guard: approvals with approver_id IS NULL only match caller's role_id
    - Direct assignment: approvals with approver_id == caller match directly
    - Self-request exclusion: caller's own requests are excluded even if caller is approver
    """
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=test_engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    db = TestingSession()

    try:
        role_mgr = Role(id=uuid.uuid4(), name="manager", description="Manager")
        role_it = Role(id=uuid.uuid4(), name="it_admin", description="IT Admin")
        dept = Department(id=uuid.uuid4(), name="Engineering")
        db.add_all([role_mgr, role_it, dept])
        db.commit()

        mgr_id = uuid.uuid4()
        manager = User(
            id=mgr_id,
            email="manager@example.com",
            full_name="Manager Bob",
            password_hash="x",
            role_id=role_mgr.id,
            department_id=dept.id,
            status=UserStatus.active,
            employee_code="E01",
            designation="Engineering Manager",
        )
        emp = User(
            id=uuid.uuid4(),
            email="emp@example.com",
            full_name="Employee Alice",
            password_hash="x",
            role_id=role_mgr.id,
            department_id=dept.id,
            status=UserStatus.active,
            employee_code="E02",
            designation="Software Engineer",
        )
        db.add_all([manager, emp])
        db.commit()

        # 1. Eligible: Direct assignment to manager, step 1 match, pending status, requester is emp
        r1 = Request(
            id=uuid.uuid4(),
            requester_id=emp.id,
            request_type=RequestType.asset_request,
            title="Eligible Direct Assignment",
            description="Laptop request",
            priority=RequestPriority.medium,
            status=RequestStatus.pending,
            current_step=1,
        )
        a1 = RequestApproval(
            id=uuid.uuid4(),
            request_id=r1.id,
            step_order=1,
            approver_id=mgr_id,
            approver_role_id=role_mgr.id,
            status=ApprovalStatus.pending,
        )

        # 2. Eligible: Role queue (approver_id is None, role matches manager), step 1 match, pending status
        r2 = Request(
            id=uuid.uuid4(),
            requester_id=emp.id,
            request_type=RequestType.asset_request,
            title="Eligible Role Queue",
            description="Monitor request",
            priority=RequestPriority.medium,
            status=RequestStatus.pending,
            current_step=1,
        )
        a2 = RequestApproval(
            id=uuid.uuid4(),
            request_id=r2.id,
            step_order=1,
            approver_id=None,
            approver_role_id=role_mgr.id,
            status=ApprovalStatus.pending,
        )

        # 3. Excluded by self-request: Requester is manager even though assigned to manager
        r3 = Request(
            id=uuid.uuid4(),
            requester_id=mgr_id,
            request_type=RequestType.asset_request,
            title="Self Request Excluded",
            description="Keyboard request",
            priority=RequestPriority.medium,
            status=RequestStatus.pending,
            current_step=1,
        )
        a3 = RequestApproval(
            id=uuid.uuid4(),
            request_id=r3.id,
            step_order=1,
            approver_id=mgr_id,
            approver_role_id=role_mgr.id,
            status=ApprovalStatus.pending,
        )

        # 4. Excluded by current step mismatch: request current_step=2, approval step_order=1
        r4 = Request(
            id=uuid.uuid4(),
            requester_id=emp.id,
            request_type=RequestType.asset_request,
            title="Step Mismatch Excluded",
            description="Desk request",
            priority=RequestPriority.medium,
            status=RequestStatus.pending,
            current_step=2,
        )
        a4 = RequestApproval(
            id=uuid.uuid4(),
            request_id=r4.id,
            step_order=1,
            approver_id=mgr_id,
            approver_role_id=role_mgr.id,
            status=ApprovalStatus.pending,
        )

        # 5. Excluded by role queue mismatch: approver_id is None, approver_role_id is IT Admin
        r5 = Request(
            id=uuid.uuid4(),
            requester_id=emp.id,
            request_type=RequestType.asset_request,
            title="Role Mismatch Excluded",
            description="Software license request",
            priority=RequestPriority.medium,
            status=RequestStatus.pending,
            current_step=1,
        )
        a5 = RequestApproval(
            id=uuid.uuid4(),
            request_id=r5.id,
            step_order=1,
            approver_id=None,
            approver_role_id=role_it.id,
            status=ApprovalStatus.pending,
        )

        db.add_all([r1, a1, r2, a2, r3, a3, r4, a4, r5, a5])
        db.commit()

        # Run DashboardService with manager context
        current_u = CurrentUser(
            user_id=mgr_id,
            role="manager",
            session_id=uuid.uuid4(),
            role_id=role_mgr.id,
            department_id=dept.id,
        )
        svc = DashboardService(db=db, current_user=current_u)
        metrics, widgets = svc._get_manager_dashboard()

        # Verify only eligible approvals (r1, r2) are returned
        assert metrics["pending_approvals_count"] == 2
        pending_titles = [item["title"] for item in widgets["pending_approvals"]]
        assert "Eligible Direct Assignment" in pending_titles
        assert "Eligible Role Queue" in pending_titles
        assert "Self Request Excluded" not in pending_titles
        assert "Step Mismatch Excluded" not in pending_titles
        assert "Role Mismatch Excluded" not in pending_titles

        # Also exercise via API endpoint with DB override
        app.dependency_overrides[get_current_user] = lambda: current_u
        app.dependency_overrides[get_db] = lambda: db
        resp = client.get("/api/v1/dashboard/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["metrics"]["pending_approvals_count"] == 2
        api_titles = [item["title"] for item in data["widgets"]["pending_approvals"]]
        assert "Eligible Direct Assignment" in api_titles
        assert "Eligible Role Queue" in api_titles
        assert "Self Request Excluded" not in api_titles
    finally:
        db.close()

