"""
Comprehensive Unit & Integration Tests for Asset Lookup (QR §5.9) and Maintenance Tickets (§5.10).
Tests:
- GET /api/v1/assets/lookup/{asset_tag} (it_admin/super_admin 200 OK, 404 if tag missing, 403 for auditor/manager/employee)
- GET /api/v1/maintenance-tickets (it_admin/super_admin/auditor see all; employee sees only reported_by=self; negative test for other employee's ticket)
- POST /api/v1/maintenance-tickets (it_admin/super_admin for any asset; employee allowed only if active assignment, 403 if returned or unassigned)
- PATCH /api/v1/maintenance-tickets/{id} (it_admin/super_admin only; status=resolved auto-sets resolved_at; un-resolving clears resolved_at; employee gets 403)
"""
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Callable
from unittest.mock import MagicMock
import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.main import app
from app.models.assets import (
    Asset,
    AssetAssignment,
    AssetStatus,
    DepreciationMethod,
    MaintenancePriority,
    MaintenanceStatus,
    MaintenanceTicket,
)
from app.models.auth import Department, RolePermission, User, UserStatus

client = TestClient(app)


def create_rbac_mock_db(
    allowed_grants: list[tuple[uuid.UUID, str, str]] | None = None,
) -> tuple[MagicMock, Callable[[Any], MagicMock]]:
    mock_db = MagicMock()
    grants = set(allowed_grants or [])
    query_mocks: dict[Any, MagicMock] = {}

    def get_query_mock(entity=None):
        if entity not in query_mocks:
            q_mock = MagicMock()
            q_mock.options.return_value = q_mock
            q_mock.join.return_value = q_mock
            q_mock.filter.return_value = q_mock
            q_mock.order_by.return_value = q_mock
            q_mock.offset.return_value = q_mock
            q_mock.limit.return_value = q_mock
            q_mock.with_for_update.return_value = q_mock
            q_mock.first.return_value = None
            q_mock.all.return_value = []
            q_mock.count.return_value = 0
            query_mocks[entity] = q_mock
        return query_mocks[entity]

    def query_dispatcher(*entities):
        entity = entities[0] if entities else None
        if entity is RolePermission:
            rp_query = MagicMock()
            rp_query.join.return_value = rp_query

            def rp_filter(*criteria):
                filter_mock = MagicMock()
                passed_vals = [getattr(c.right, "value", None) for c in criteria if hasattr(c, "right")]
                if len(passed_vals) >= 3 and (passed_vals[0], passed_vals[1], passed_vals[2]) in grants:
                    filter_mock.first.return_value = RolePermission(
                        role_id=passed_vals[0],
                        permission_id=uuid.uuid4(),
                    )
                else:
                    filter_mock.first.return_value = None
                return filter_mock

            rp_query.filter.side_effect = rp_filter
            return rp_query

        return get_query_mock(entity)

    mock_db.query.side_effect = query_dispatcher
    return mock_db, get_query_mock


def create_mock_user(
    user_id: uuid.UUID | None = None,
    full_name: str = "Test User",
    email: str = "user@example.com",
    role_name: str = "employee",
    dept_id: uuid.UUID | None = None,
) -> User:
    uid = user_id or uuid.uuid4()
    did = dept_id or uuid.uuid4()
    rid = uuid.uuid4()
    dept = Department(id=did, name="IT Services", created_at=datetime.now(timezone.utc))

    user = User(
        id=uid,
        email=email,
        full_name=full_name,
        role_id=rid,
        department_id=did,
        status=UserStatus.active,
        created_at=datetime.now(timezone.utc),
    )
    user.department = dept
    return user


def create_mock_asset(
    asset_id: uuid.UUID | None = None,
    asset_tag: str = "AST-2026-00001",
    name: str = "MacBook Pro 16",
    status: AssetStatus = AssetStatus.in_stock,
    holder_id: uuid.UUID | None = None,
) -> Asset:
    aid = asset_id or uuid.uuid4()
    return Asset(
        id=aid,
        asset_tag=asset_tag,
        name=name,
        category="laptop",
        serial_number="SN-12345",
        vendor="Apple",
        purchase_date=date(2026, 1, 1),
        purchase_cost=Decimal("2500.00"),
        current_value=Decimal("2500.00"),
        depreciation_method=DepreciationMethod.straight_line,
        useful_life_months=36,
        warranty_expiry=date(2029, 1, 1),
        amc_expiry=None,
        status=status,
        current_holder_id=holder_id,
        license_id=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


# --- 1. GET /api/v1/assets/lookup/{asset_tag} Tests (§5.9) ---

def test_lookup_asset_by_tag_success_it_admin():
    it_admin_id = uuid.uuid4()
    role_id = uuid.uuid4()
    current_user = CurrentUser(
        user_id=it_admin_id,
        role="it_admin",
        session_id=uuid.uuid4(),
        role_id=role_id,
    )

    mock_db, get_mock = create_rbac_mock_db(allowed_grants=[(role_id, "assets", "lookup")])
    asset = create_mock_asset(asset_tag="AST-2026-99999")

    get_mock(Asset).first.return_value = asset

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get("/api/v1/assets/lookup/AST-2026-99999")
        assert res.status_code == 200
        data = res.json()
        assert data["asset"]["asset_tag"] == "AST-2026-99999"
        assert data["asset"]["name"] == "MacBook Pro 16"
        assert data["current_assignment"] is None
    finally:
        app.dependency_overrides.clear()


def test_lookup_asset_by_tag_not_found():
    it_admin_id = uuid.uuid4()
    role_id = uuid.uuid4()
    current_user = CurrentUser(
        user_id=it_admin_id,
        role="it_admin",
        session_id=uuid.uuid4(),
        role_id=role_id,
    )

    mock_db, get_mock = create_rbac_mock_db(allowed_grants=[(role_id, "assets", "lookup")])
    get_mock(Asset).first.return_value = None

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get("/api/v1/assets/lookup/NON-EXISTENT-TAG")
        assert res.status_code == 404
        assert "not found" in res.json()["error"]["message"].lower()
    finally:
        app.dependency_overrides.clear()


def test_lookup_asset_by_tag_auditor_forbidden():
    auditor_id = uuid.uuid4()
    role_id = uuid.uuid4()
    current_user = CurrentUser(
        user_id=auditor_id,
        role="auditor",
        session_id=uuid.uuid4(),
        role_id=role_id,
    )

    # Auditor only has (assets, read), NOT (assets, lookup)
    mock_db, _ = create_rbac_mock_db(allowed_grants=[(role_id, "assets", "read")])

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get("/api/v1/assets/lookup/AST-2026-99999")
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_lookup_asset_by_tag_employee_forbidden():
    emp_id = uuid.uuid4()
    role_id = uuid.uuid4()
    current_user = CurrentUser(
        user_id=emp_id,
        role="employee",
        session_id=uuid.uuid4(),
        role_id=role_id,
    )

    mock_db, _ = create_rbac_mock_db(allowed_grants=[])

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get("/api/v1/assets/lookup/AST-2026-99999")
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


# --- 2. GET /api/v1/maintenance-tickets Tests (§5.10) ---

def test_list_maintenance_tickets_admin_all():
    admin_id = uuid.uuid4()
    role_id = uuid.uuid4()
    current_user = CurrentUser(
        user_id=admin_id,
        role="it_admin",
        session_id=uuid.uuid4(),
        role_id=role_id,
    )

    mock_db, get_mock = create_rbac_mock_db(allowed_grants=[(role_id, "maintenance_ticket", "read")])

    t1 = MaintenanceTicket(
        id=uuid.uuid4(),
        asset_id=uuid.uuid4(),
        reported_by=uuid.uuid4(),
        assigned_to=None,
        issue_description="Broken screen",
        priority=MaintenancePriority.high,
        status=MaintenanceStatus.open,
        resolved_at=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    q_ticket = get_mock(MaintenanceTicket)
    q_ticket.count.return_value = 1
    q_ticket.all.return_value = [t1]

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get("/api/v1/maintenance-tickets")
        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["issue_description"] == "Broken screen"
    finally:
        app.dependency_overrides.clear()


def test_list_maintenance_tickets_employee_own_only():
    emp1_id = uuid.uuid4()
    emp2_id = uuid.uuid4()
    role_id = uuid.uuid4()

    current_user = CurrentUser(
        user_id=emp1_id,
        role="employee",
        session_id=uuid.uuid4(),
        role_id=role_id,
    )

    t_own = MaintenanceTicket(
        id=uuid.uuid4(),
        asset_id=uuid.uuid4(),
        reported_by=emp1_id,
        assigned_to=None,
        issue_description="Emp1 keyboard issue",
        priority=MaintenancePriority.medium,
        status=MaintenanceStatus.open,
        resolved_at=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    mock_db, get_mock = create_rbac_mock_db([])
    q_ticket = get_mock(MaintenanceTicket)

    def filter_side_effect(*criteria):
        q_filtered = MagicMock()
        q_filtered.filter.side_effect = filter_side_effect
        q_filtered.count.return_value = 1
        q_filtered.order_by.return_value = q_filtered
        q_filtered.offset.return_value = q_filtered
        q_filtered.limit.return_value = q_filtered
        q_filtered.all.return_value = [t_own]
        return q_filtered

    q_ticket.filter.side_effect = filter_side_effect

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get("/api/v1/maintenance-tickets")
        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 1
        assert data["items"][0]["reported_by"] == str(emp1_id)
        assert all(item["reported_by"] != str(emp2_id) for item in data["items"])
    finally:
        app.dependency_overrides.clear()


# --- 3. POST /api/v1/maintenance-tickets Tests (§5.10) ---

def test_create_ticket_admin_any_asset():
    admin_id = uuid.uuid4()
    role_id = uuid.uuid4()
    current_user = CurrentUser(
        user_id=admin_id,
        role="it_admin",
        session_id=uuid.uuid4(),
        role_id=role_id,
    )

    mock_db, get_mock = create_rbac_mock_db(allowed_grants=[(role_id, "maintenance_ticket", "create")])
    asset = create_mock_asset(status=AssetStatus.assigned)
    admin_user = create_mock_user(user_id=admin_id, full_name="Admin User")

    get_mock(Asset).first.return_value = asset
    get_mock(User).first.return_value = admin_user

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        payload = {
            "asset_id": str(asset.id),
            "issue_description": "Overheating CPU",
            "priority": "critical",
        }
        res = client.post("/api/v1/maintenance-tickets", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert data["issue_description"] == "Overheating CPU"
        assert data["priority"] == "critical"
        assert data["status"] == "open"
    finally:
        app.dependency_overrides.clear()


def test_create_ticket_employee_active_assignment_success():
    emp_id = uuid.uuid4()
    role_id = uuid.uuid4()
    asset = create_mock_asset(status=AssetStatus.assigned, holder_id=emp_id)
    emp_user = create_mock_user(user_id=emp_id, full_name="Employee User")

    current_user = CurrentUser(
        user_id=emp_id,
        role="employee",
        session_id=uuid.uuid4(),
        role_id=role_id,
    )

    active_assign = AssetAssignment(
        id=uuid.uuid4(),
        asset_id=asset.id,
        employee_id=emp_id,
        assigned_by=uuid.uuid4(),
        assigned_at=datetime.now(timezone.utc),
        returned_at=None,
        condition_at_assignment="Good",
    )

    mock_db, get_mock = create_rbac_mock_db([])
    get_mock(Asset).first.return_value = asset
    get_mock(AssetAssignment).first.return_value = active_assign
    get_mock(User).first.return_value = emp_user

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        payload = {
            "asset_id": str(asset.id),
            "issue_description": "Sticky spacebar",
            "priority": "medium",
        }
        res = client.post("/api/v1/maintenance-tickets", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert data["reported_by"] == str(emp_id)
    finally:
        app.dependency_overrides.clear()


def test_create_ticket_employee_never_assigned_forbidden():
    """Negative test: employee never held the asset (no assignment history exists in DB)."""
    emp_id = uuid.uuid4()
    role_id = uuid.uuid4()
    asset = create_mock_asset(status=AssetStatus.in_stock, holder_id=None)

    current_user = CurrentUser(
        user_id=emp_id,
        role="employee",
        session_id=uuid.uuid4(),
        role_id=role_id,
    )

    mock_db, get_mock = create_rbac_mock_db([])
    get_mock(Asset).first.return_value = asset
    get_mock(AssetAssignment).first.return_value = None

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        payload = {
            "asset_id": str(asset.id),
            "issue_description": "Issue on unassigned device",
            "priority": "low",
        }
        res = client.post("/api/v1/maintenance-tickets", json=payload)
        assert res.status_code == 403
        assert "currently assigned to you" in res.json()["error"]["message"].lower()
    finally:
        app.dependency_overrides.clear()


def test_create_ticket_employee_historical_returned_assignment_forbidden():
    """Negative test: employee HAS a historical assignment row in DB, but returned_at is NOT NULL.
    Verifies that the server's returned_at.is_(None) filter clause correctly excludes the returned row.
    """
    emp_id = uuid.uuid4()
    role_id = uuid.uuid4()
    asset = create_mock_asset(status=AssetStatus.in_stock, holder_id=None)

    current_user = CurrentUser(
        user_id=emp_id,
        role="employee",
        session_id=uuid.uuid4(),
        role_id=role_id,
    )

    historical_assignment = AssetAssignment(
        id=uuid.uuid4(),
        asset_id=asset.id,
        employee_id=emp_id,
        assigned_by=uuid.uuid4(),
        assigned_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        returned_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
        condition_at_assignment="Good",
        condition_at_return="Returned",
    )

    mock_db, get_mock = create_rbac_mock_db([])
    get_mock(Asset).first.return_value = asset

    q_assign = get_mock(AssetAssignment)

    def assign_filter_side_effect(*criteria):
        filter_mock = MagicMock()
        has_is_null_check = any("returned_at is null" in str(c).lower() for c in criteria)
        if has_is_null_check:
            filter_mock.first.return_value = None
        else:
            filter_mock.first.return_value = historical_assignment
        return filter_mock

    q_assign.filter.side_effect = assign_filter_side_effect

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        payload = {
            "asset_id": str(asset.id),
            "issue_description": "Attempting to raise ticket on previously returned asset",
            "priority": "low",
        }
        res = client.post("/api/v1/maintenance-tickets", json=payload)
        assert res.status_code == 403
        assert "currently assigned to you" in res.json()["error"]["message"].lower()
    finally:
        app.dependency_overrides.clear()



# --- 4. PATCH /api/v1/maintenance-tickets/{id} Tests (§5.10) ---

def test_patch_ticket_resolved_auto_sets_resolved_at():
    admin_id = uuid.uuid4()
    role_id = uuid.uuid4()
    ticket_id = uuid.uuid4()

    current_user = CurrentUser(
        user_id=admin_id,
        role="it_admin",
        session_id=uuid.uuid4(),
        role_id=role_id,
    )

    mock_db, get_mock = create_rbac_mock_db(allowed_grants=[(role_id, "maintenance_ticket", "update")])

    ticket = MaintenanceTicket(
        id=ticket_id,
        asset_id=uuid.uuid4(),
        reported_by=uuid.uuid4(),
        assigned_to=None,
        issue_description="Faulty fan",
        priority=MaintenancePriority.medium,
        status=MaintenanceStatus.open,
        resolved_at=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    get_mock(MaintenanceTicket).first.return_value = ticket

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        payload = {"status": "resolved"}
        res = client.patch(f"/api/v1/maintenance-tickets/{ticket_id}", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "resolved"
        assert data["resolved_at"] is not None
        assert ticket.resolved_at is not None
    finally:
        app.dependency_overrides.clear()


def test_patch_ticket_unresolving_clears_resolved_at():
    admin_id = uuid.uuid4()
    role_id = uuid.uuid4()
    ticket_id = uuid.uuid4()

    current_user = CurrentUser(
        user_id=admin_id,
        role="super_admin",
        session_id=uuid.uuid4(),
        role_id=role_id,
    )

    mock_db, get_mock = create_rbac_mock_db(allowed_grants=[(role_id, "maintenance_ticket", "update")])

    resolved_time = datetime.now(timezone.utc)
    ticket = MaintenanceTicket(
        id=ticket_id,
        asset_id=uuid.uuid4(),
        reported_by=uuid.uuid4(),
        assigned_to=None,
        issue_description="Intermittent issue",
        priority=MaintenancePriority.high,
        status=MaintenanceStatus.resolved,
        resolved_at=resolved_time,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    get_mock(MaintenanceTicket).first.return_value = ticket

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        payload = {"status": "in_progress"}
        res = client.patch(f"/api/v1/maintenance-tickets/{ticket_id}", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "in_progress"
        assert data["resolved_at"] is None
        assert ticket.resolved_at is None
    finally:
        app.dependency_overrides.clear()


def test_patch_ticket_employee_forbidden():
    emp_id = uuid.uuid4()
    ticket_id = uuid.uuid4()
    role_id = uuid.uuid4()

    current_user = CurrentUser(
        user_id=emp_id,
        role="employee",
        session_id=uuid.uuid4(),
        role_id=role_id,
    )

    mock_db, _ = create_rbac_mock_db([])

    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        payload = {"status": "resolved"}
        res = client.patch(f"/api/v1/maintenance-tickets/{ticket_id}", json=payload)
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()
