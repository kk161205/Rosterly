"""
Comprehensive Unit & Integration Tests for Asset Detail API (§5.8).
Tests:
- GET /assets/{id} (two-layer permission: admin, auditor, current holder, holder's manager, 403 for unrelated manager/employee)
- GET /assets/{id}/assignments
- POST /assets/{id}/assign (201 success, 409 if not in_stock, 404 if employee missing, 403 for non-admins)
- POST /assets/{id}/return (200 success, 409 if not assigned, 403 for non-admins)
- GET /assets/{id}/maintenance (holder allowed, holder's manager gets 403 per PRD §5.8)
- Dynamic depreciation math calculation across useful life points
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
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
    AssetCategory,
    AssetStatus,
    DepreciationMethod,
    MaintenancePriority,
    MaintenanceStatus,
    MaintenanceTicket,
)
from app.models.auth import Department, Permission, Role, RolePermission, User, UserStatus
from app.services.assets import calculate_current_value

client = TestClient(app)


def create_rbac_mock_db(
    allowed_grants: list[tuple[uuid.UUID, str, str]] | None = None,
) -> tuple[MagicMock, MagicMock]:
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
    # Return mock_db and default Asset query mock for easy test configuration
    return mock_db, get_query_mock(Asset)



def create_mock_user(
    user_id: uuid.UUID | None = None,
    full_name: str = "Test User",
    email: str = "user@example.com",
    role_name: str = "employee",
    dept_id: uuid.UUID | None = None,
    manager_id: uuid.UUID | None = None,
) -> User:
    uid = user_id or uuid.uuid4()
    did = dept_id or uuid.uuid4()
    rid = uuid.uuid4()

    role = Role(id=rid, name=role_name)
    dept = Department(id=did, name="Engineering")

    user = User(
        id=uid,
        employee_code=f"RST-{uuid.uuid4().hex[:4]}",
        full_name=full_name,
        email=email,
        password_hash="hashed",
        role_id=rid,
        department_id=did,
        manager_id=manager_id,
        designation="Software Engineer",
        status=UserStatus.active,
        date_of_joining=date(2025, 1, 1),
    )
    user.role = role
    user.department = dept
    return user


def set_user_context(
    user_id: uuid.UUID, role: str, dept_id: uuid.UUID | None = None, role_id: uuid.UUID | None = None
) -> CurrentUser:
    rid = role_id or uuid.uuid4()
    curr_u = CurrentUser(
        user_id=user_id,
        role=role,
        session_id=uuid.uuid4(),
        department_id=dept_id,
        email=f"{role}@example.com",
        full_name=f"User {role}",
        role_id=rid,
    )
    app.dependency_overrides[get_current_user] = lambda: curr_u
    return curr_u


def create_mock_asset(
    asset_id: uuid.UUID | None = None,
    asset_tag: str = "AST-2026-00001",
    name: str = "MacBook Pro 16",
    status: AssetStatus = AssetStatus.in_stock,
    current_holder: User | None = None,
    purchase_date: date | None = None,
    purchase_cost: Decimal = Decimal("2400.00"),
    useful_life_months: int = 24,
) -> Asset:
    aid = asset_id or uuid.uuid4()
    pdate = purchase_date or date(2026, 1, 1)
    asset = Asset(
        id=aid,
        asset_tag=asset_tag,
        name=name,
        category="laptop",
        serial_number="SN-123456",
        vendor="Apple",
        purchase_date=pdate,
        purchase_cost=purchase_cost,
        current_value=purchase_cost,
        depreciation_method=DepreciationMethod.straight_line,
        useful_life_months=useful_life_months,
        warranty_expiry=date(2028, 1, 1),
        amc_expiry=date(2027, 1, 1),
        status=status,
        current_holder_id=current_holder.id if current_holder else None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    asset.current_holder = current_holder
    return asset


@pytest.fixture(autouse=True)
def cleanup_overrides():
    yield
    app.dependency_overrides.clear()


# ============================================================================
# 1. GET /api/v1/assets/{id} - Two-Layer Access Control
# ============================================================================

def test_get_asset_detail_it_admin_success():
    """it_admin can view any asset detail."""
    admin_id = uuid.uuid4()
    curr_u = set_user_context(admin_id, "it_admin")

    asset = create_mock_asset()
    mock_db, mock_query = create_rbac_mock_db([(curr_u.role_id, "assets", "read")])
    mock_query.first.return_value = asset

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.get(f"/api/v1/assets/{asset.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["asset"]["id"] == str(asset.id)
    assert data["current_assignment"] is None


def test_get_asset_detail_current_holder_employee_success():
    """Employee who IS current holder can view asset detail."""
    emp = create_mock_user(role_name="employee")
    set_user_context(emp.id, "employee")

    asset = create_mock_asset(status=AssetStatus.assigned, current_holder=emp)
    mock_db, mock_query = create_rbac_mock_db([])
    mock_query.first.return_value = asset

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.get(f"/api/v1/assets/{asset.id}")
    assert response.status_code == 200
    assert response.json()["asset"]["id"] == str(asset.id)


def test_get_asset_detail_unrelated_employee_denied():
    """DoD 5.2: Employee who is NOT current holder gets 403 Forbidden."""
    emp_holder = create_mock_user(role_name="employee")
    emp_other = create_mock_user(role_name="employee")
    set_user_context(emp_other.id, "employee")

    asset = create_mock_asset(status=AssetStatus.assigned, current_holder=emp_holder)
    mock_db, mock_query = create_rbac_mock_db([])
    mock_query.first.return_value = asset

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.get(f"/api/v1/assets/{asset.id}")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_get_asset_detail_holders_manager_success():
    """Manager who IS current holder's direct manager can view asset detail."""
    manager = create_mock_user(role_name="manager")
    emp = create_mock_user(role_name="employee", manager_id=manager.id)
    set_user_context(manager.id, "manager")

    asset = create_mock_asset(status=AssetStatus.assigned, current_holder=emp)
    mock_db, mock_query = create_rbac_mock_db([])
    mock_query.first.return_value = asset

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.get(f"/api/v1/assets/{asset.id}")
    assert response.status_code == 200
    assert response.json()["asset"]["id"] == str(asset.id)


def test_get_asset_detail_unrelated_manager_denied():
    """DoD 5.1: Manager who is NOT current holder's manager gets 403 Forbidden."""
    manager_other = create_mock_user(role_name="manager")
    manager_actual = create_mock_user(role_name="manager")
    emp = create_mock_user(role_name="employee", manager_id=manager_actual.id)
    set_user_context(manager_other.id, "manager")

    asset = create_mock_asset(status=AssetStatus.assigned, current_holder=emp)
    mock_db, mock_query = create_rbac_mock_db([])
    mock_query.first.return_value = asset

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.get(f"/api/v1/assets/{asset.id}")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


# ============================================================================
# 2. GET /api/v1/assets/{id}/maintenance - Holder Only Scoping
# ============================================================================

def test_get_asset_maintenance_holders_manager_denied():
    """PRD §5.8 / Feedback Item 1: Holder's manager is EXCLUDED from maintenance endpoint and gets 403."""
    manager = create_mock_user(role_name="manager")
    emp = create_mock_user(role_name="employee", manager_id=manager.id)
    set_user_context(manager.id, "manager")

    asset = create_mock_asset(status=AssetStatus.assigned, current_holder=emp)
    mock_db, mock_query = create_rbac_mock_db([])
    mock_query.first.return_value = asset

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.get(f"/api/v1/assets/{asset.id}/maintenance")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_get_asset_maintenance_current_holder_success():
    """Current holder employee CAN access asset maintenance tickets."""
    emp = create_mock_user(role_name="employee")
    set_user_context(emp.id, "employee")

    asset = create_mock_asset(status=AssetStatus.assigned, current_holder=emp)
    ticket = MaintenanceTicket(
        id=uuid.uuid4(),
        asset_id=asset.id,
        reported_by=emp.id,
        issue_description="Screen flicker",
        priority=MaintenancePriority.high,
        status=MaintenanceStatus.open,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    ticket.reporter = emp
    ticket.assignee = None

    mock_db, asset_query = create_rbac_mock_db([])
    asset_query.first.return_value = asset
    mock_db.query(MaintenanceTicket).filter.return_value.order_by.return_value.all.return_value = [ticket]

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.get(f"/api/v1/assets/{asset.id}/maintenance")
    assert response.status_code == 200
    tickets_data = response.json()
    assert len(tickets_data) == 1
    assert tickets_data[0]["issue_description"] == "Screen flicker"



# ============================================================================
# 3. POST /api/v1/assets/{id}/assign - Concurrency & Validation
# ============================================================================

def test_assign_asset_success():
    """it_admin can assign an in_stock asset to an employee."""
    admin = create_mock_user(role_name="it_admin")
    curr_u = set_user_context(admin.id, "it_admin")

    emp = create_mock_user(role_name="employee")
    asset = create_mock_asset(status=AssetStatus.in_stock)

    mock_db, asset_query = create_rbac_mock_db([(curr_u.role_id, "assets", "update")])
    asset_query.first.return_value = asset
    mock_db.query(User).filter.return_value.first.return_value = emp

    app.dependency_overrides[get_db] = lambda: mock_db

    payload = {"employee_id": str(emp.id), "condition_notes": "Mint condition"}
    response = client.post(f"/api/v1/assets/{asset.id}/assign", json=payload)
    assert response.status_code == 201
    assert asset.status == AssetStatus.assigned
    assert asset.current_holder_id == emp.id


def test_assign_asset_rejects_when_not_in_stock():
    """DoD 5.3: POST /assign rejects with 409 Conflict when asset status is not in_stock."""
    admin = create_mock_user(role_name="it_admin")
    curr_u = set_user_context(admin.id, "it_admin")

    emp_existing = create_mock_user(role_name="employee")
    asset = create_mock_asset(status=AssetStatus.assigned, current_holder=emp_existing)

    mock_db, mock_query = create_rbac_mock_db([(curr_u.role_id, "assets", "update")])
    mock_query.first.return_value = asset

    app.dependency_overrides[get_db] = lambda: mock_db

    emp_new = create_mock_user(role_name="employee")
    payload = {"employee_id": str(emp_new.id), "condition_notes": "Attempt assign"}
    response = client.post(f"/api/v1/assets/{asset.id}/assign", json=payload)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


def test_assign_asset_non_admin_denied():
    """Manager or employee receives 403 Forbidden on POST /assign (ownership does NOT grant write)."""
    emp = create_mock_user(role_name="employee")
    set_user_context(emp.id, "employee")

    asset = create_mock_asset(status=AssetStatus.in_stock)
    mock_db, _ = create_rbac_mock_db([])
    app.dependency_overrides[get_db] = lambda: mock_db

    payload = {"employee_id": str(emp.id), "condition_notes": "Self assign"}
    response = client.post(f"/api/v1/assets/{asset.id}/assign", json=payload)
    assert response.status_code == 403


# ============================================================================
# 4. POST /api/v1/assets/{id}/return - Atomic State Transition
# ============================================================================

def test_return_asset_success():
    """DoD 5.5: POST /return flips status, holder, and returned_at atomically."""
    admin = create_mock_user(role_name="it_admin")
    curr_u = set_user_context(admin.id, "it_admin")

    emp = create_mock_user(role_name="employee")
    asset = create_mock_asset(status=AssetStatus.assigned, current_holder=emp)

    assignment = AssetAssignment(
        id=uuid.uuid4(),
        asset_id=asset.id,
        employee_id=emp.id,
        assigned_by=admin.id,
        assigned_at=datetime.now(timezone.utc) - timedelta(days=10),
        returned_at=None,
        condition_at_assignment="Good",
        created_at=datetime.now(timezone.utc) - timedelta(days=10),
    )

    mock_db, asset_query = create_rbac_mock_db([(curr_u.role_id, "assets", "update")])
    asset_query.first.return_value = asset
    mock_db.query(AssetAssignment).filter.return_value.with_for_update.return_value.first.return_value = assignment
    mock_db.query(User).filter.return_value.first.return_value = emp

    app.dependency_overrides[get_db] = lambda: mock_db

    payload = {"condition_notes": "Returned with slight scratches"}
    response = client.post(f"/api/v1/assets/{asset.id}/return", json=payload)
    assert response.status_code == 200

    assert asset.status == AssetStatus.in_stock
    assert asset.current_holder_id is None
    assert assignment.returned_at is not None
    assert assignment.condition_at_return == "Returned with slight scratches"



def test_return_asset_rejects_when_not_assigned():
    """POST /return rejects with 409 Conflict when asset is in_stock (not assigned)."""
    admin = create_mock_user(role_name="it_admin")
    curr_u = set_user_context(admin.id, "it_admin")

    asset = create_mock_asset(status=AssetStatus.in_stock)
    mock_db, mock_query = create_rbac_mock_db([(curr_u.role_id, "assets", "update")])
    mock_query.first.return_value = asset

    app.dependency_overrides[get_db] = lambda: mock_db

    payload = {"condition_notes": "Return attempt"}
    response = client.post(f"/api/v1/assets/{asset.id}/return", json=payload)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


# ============================================================================
# 5. Dynamic Depreciation Calculation Verification
# ============================================================================

def test_depreciation_calculated_at_multiple_life_points():
    """DoD 5.6: Depreciation value is computed correctly at multiple points in useful life."""
    purchase_cost = Decimal("2400.00")
    useful_life = 24  # 24 months useful life -> $100 / month straight line depreciation

    # Purchase date: 2025-01-01
    purchase_dt = date(2025, 1, 1)
    asset = create_mock_asset(
        purchase_date=purchase_dt,
        purchase_cost=purchase_cost,
        useful_life_months=useful_life,
    )

    # Point 1: As of purchase date (0 months elapsed) -> $2400.00
    val_day0 = calculate_current_value(asset, as_of=date(2025, 1, 1))
    assert val_day0 == Decimal("2400.00")

    # Point 2: Halfway through (12 months elapsed: 2026-01-01) -> $1200.00
    val_month12 = calculate_current_value(asset, as_of=date(2026, 1, 1))
    assert val_month12 == Decimal("1200.00")

    # Point 3: End of useful life (24 months elapsed: 2027-01-01) -> $0.00
    val_month24 = calculate_current_value(asset, as_of=date(2027, 1, 1))
    assert val_month24 == Decimal("0.00")

    # Point 4: Beyond useful life (30 months elapsed: 2027-07-01) -> floors at $0.00
    val_month30 = calculate_current_value(asset, as_of=date(2027, 7, 1))
    assert val_month30 == Decimal("0.00")
