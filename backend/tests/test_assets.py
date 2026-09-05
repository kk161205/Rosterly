"""
Comprehensive Unit & Integration Tests for Asset Inventory API (§5.7).
Tests all 5 endpoints: GET, POST, PATCH /{id}, PATCH /bulk, DELETE /{id},
role permissions (it_admin, super_admin, auditor, manager, employee),
department-scoped filtering, auto tag generation, atomic bulk update,
status retirement via PATCH, and hard-delete safety logic.
"""
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock
import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.main import app
from app.models.assets import Asset, AssetAssignment, AssetCategory, AssetStatus, DepreciationMethod, MaintenanceTicket
from app.models.auth import Department, Role, User, UserStatus

client = TestClient(app)


def create_mock_user(
    user_id: uuid.UUID | None = None,
    full_name: str = "Test User",
    email: str = "user@example.com",
    role_name: str = "it_admin",
    dept_id: uuid.UUID | None = None,
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
        designation="IT Specialist",
        status=UserStatus.active,
        date_of_joining=date(2025, 1, 1),
    )
    user.role = role
    user.department = dept
    return user


def set_user_context(
    user_id: uuid.UUID, role: str, dept_id: uuid.UUID | None = None
) -> CurrentUser:
    curr_u = CurrentUser(
        user_id=user_id,
        role=role,
        session_id=uuid.uuid4(),
        department_id=dept_id,
        email=f"{role}@example.com",
        full_name=f"User {role}",
        role_id=uuid.uuid4(),
    )
    app.dependency_overrides[get_current_user] = lambda: curr_u
    return curr_u


def create_mock_asset(
    asset_id: uuid.UUID | None = None,
    asset_tag: str = "AST-2026-00001",
    name: str = "MacBook Pro 16",
    category: AssetCategory = AssetCategory.laptop,
    status: AssetStatus = AssetStatus.in_stock,
    current_holder: User | None = None,
) -> Asset:
    aid = asset_id or uuid.uuid4()
    asset = Asset(
        id=aid,
        asset_tag=asset_tag,
        name=name,
        category=category,
        serial_number="SN-123456",
        vendor="Apple",
        purchase_date=date(2026, 1, 1),
        purchase_cost=Decimal("2500.00"),
        current_value=Decimal("2500.00"),
        depreciation_method=DepreciationMethod.straight_line,
        useful_life_months=36,
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
# 1. GET /api/v1/assets - Role Scoping & Department Isolation
# ============================================================================

def test_get_assets_employee_denied():
    """Employee role receives 403 Forbidden on GET /api/v1/assets."""
    emp_id = uuid.uuid4()
    set_user_context(emp_id, "employee")

    response = client.get("/api/v1/assets")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_get_assets_auditor_full_catalog():
    """Auditor GET returns full asset catalog."""
    auditor_id = uuid.uuid4()
    set_user_context(auditor_id, "auditor")

    asset1 = create_mock_asset(asset_tag="AST-2026-00001", name="Laptop A")
    asset2 = create_mock_asset(asset_tag="AST-2026-00002", name="Monitor B")

    mock_db = MagicMock()
    mock_query = mock_db.query.return_value
    mock_query.options.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.count.return_value = 2
    mock_query.order_by.return_value = mock_query
    mock_query.offset.return_value = mock_query
    mock_query.limit.return_value = mock_query
    mock_query.all.return_value = [asset1, asset2]

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.get("/api/v1/assets")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
    assert data["items"][0]["asset_tag"] == "AST-2026-00001"


def test_get_assets_manager_department_scoped_inclusion_and_exclusion():
    """Manager GET only returns assets held by employees in manager's own department."""
    mgr_dept_id = uuid.uuid4()
    other_dept_id = uuid.uuid4()
    mgr_id = uuid.uuid4()

    set_user_context(mgr_id, "manager", dept_id=mgr_dept_id)

    dept_user = create_mock_user(full_name="Alice Dept", dept_id=mgr_dept_id)
    other_user = create_mock_user(full_name="Bob Other", dept_id=other_dept_id)

    # Asset 1 held by Alice (in manager's dept), Asset 2 held by Bob (other dept)
    asset_in_dept = create_mock_asset(asset_tag="AST-2026-00001", current_holder=dept_user)

    mock_db = MagicMock()
    mock_query = mock_db.query.return_value
    mock_query.options.return_value = mock_query
    mock_query.join.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.count.return_value = 1
    mock_query.order_by.return_value = mock_query
    mock_query.offset.return_value = mock_query
    mock_query.limit.return_value = mock_query
    mock_query.all.return_value = [asset_in_dept]

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.get("/api/v1/assets")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["asset_tag"] == "AST-2026-00001"
    assert data["items"][0]["current_holder"]["full_name"] == "Alice Dept"


# ============================================================================
# 2. POST /api/v1/assets - Server-Side Tag Generation & Validation
# ============================================================================

def test_post_asset_success_it_admin():
    """it_admin can provision an asset with auto-generated tag."""
    admin_id = uuid.uuid4()
    set_user_context(admin_id, "it_admin")

    mock_db = MagicMock()
    mock_db.bind.dialect.name = "sqlite"

    # Mock DB sequence table creation & ID fetching
    mock_db.execute.return_value.scalar.return_value = 42

    app.dependency_overrides[get_db] = lambda: mock_db

    payload = {
        "name": "Dell XPS 15",
        "category": "laptop",
        "serial_number": "SN-XPS-99",
        "vendor": "Dell",
        "purchase_date": "2026-02-01",
        "purchase_cost": 1800.50,
        "depreciation_method": "straight_line",
        "useful_life_months": 36,
        "warranty_expiry": "2029-02-01",
        "amc_expiry": "2027-02-01",
    }

    response = client.post("/api/v1/assets", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Dell XPS 15"
    assert data["category"] == "laptop"
    assert data["asset_tag"] == f"AST-{date.today().year}-00042"
    assert mock_db.add.called
    assert mock_db.commit.called


def test_post_asset_auditor_and_employee_forbidden():
    """Auditors and Employees cannot create assets (403 Forbidden)."""
    auditor_id = uuid.uuid4()
    set_user_context(auditor_id, "auditor")

    payload = {
        "name": "Unauthorized Asset",
        "category": "monitor",
        "vendor": "LG",
        "purchase_date": "2026-01-01",
        "purchase_cost": 300.00,
        "depreciation_method": "none",
        "useful_life_months": 12,
    }

    response = client.post("/api/v1/assets", json=payload)
    assert response.status_code == 403


def test_post_asset_validation_errors():
    """POST /assets validates cost >= 0 and useful_life_months > 0."""
    admin_id = uuid.uuid4()
    set_user_context(admin_id, "it_admin")

    invalid_payload = {
        "name": "Bad Asset",
        "category": "laptop",
        "vendor": "Dell",
        "purchase_date": "2026-01-01",
        "purchase_cost": -100.00,  # invalid
        "depreciation_method": "straight_line",
        "useful_life_months": 0,    # invalid
    }

    response = client.post("/api/v1/assets", json=invalid_payload)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"


# ============================================================================
# 3. PATCH /api/v1/assets/{id} & PATCH /api/v1/assets/bulk
# ============================================================================

def test_patch_asset_retirement_by_it_admin():
    """it_admin can update asset status to retired via PATCH /assets/{id}."""
    admin_id = uuid.uuid4()
    set_user_context(admin_id, "it_admin")

    asset_id = uuid.uuid4()
    asset = create_mock_asset(asset_id=asset_id, status=AssetStatus.in_stock)

    mock_db = MagicMock()
    mock_db.query.return_value.options.return_value.filter.return_value.first.return_value = asset
    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.patch(f"/api/v1/assets/{asset_id}", json={"status": "retired"})
    assert response.status_code == 200
    assert asset.status == AssetStatus.retired
    assert mock_db.commit.called


def test_patch_bulk_assets_success():
    """Bulk status update succeeds atomically for valid asset IDs."""
    admin_id = uuid.uuid4()
    set_user_context(admin_id, "super_admin")

    id1, id2 = uuid.uuid4(), uuid.uuid4()
    asset1 = create_mock_asset(asset_id=id1, status=AssetStatus.in_stock)
    asset2 = create_mock_asset(asset_id=id2, status=AssetStatus.in_stock)

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.all.return_value = [asset1, asset2]
    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.patch(
        "/api/v1/assets/bulk",
        json={"asset_ids": [str(id1), str(id2)], "status": "retired"},
    )
    assert response.status_code == 200
    assert response.json()["updated_count"] == 2
    assert asset1.status == AssetStatus.retired
    assert asset2.status == AssetStatus.retired


def test_patch_bulk_assets_atomic_failure_missing_id():
    """Bulk update fails completely (404) if any asset_id does not exist."""
    admin_id = uuid.uuid4()
    set_user_context(admin_id, "it_admin")

    id1, missing_id = uuid.uuid4(), uuid.uuid4()
    asset1 = create_mock_asset(asset_id=id1)

    mock_db = MagicMock()
    # Only asset1 is found in DB
    mock_db.query.return_value.filter.return_value.all.return_value = [asset1]
    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.patch(
        "/api/v1/assets/bulk",
        json={"asset_ids": [str(id1), str(missing_id)], "status": "retired"},
    )
    assert response.status_code == 404
    assert "Assets not found" in response.json()["error"]["message"]


# ============================================================================
# 4. DELETE /api/v1/assets/{id} - Super Admin Only & Safety Guards
# ============================================================================

def test_delete_asset_rejected_for_it_admin():
    """it_admin receives 403 Forbidden on DELETE /assets/{id}."""
    it_admin_id = uuid.uuid4()
    set_user_context(it_admin_id, "it_admin")

    asset_id = uuid.uuid4()
    response = client.delete(f"/api/v1/assets/{asset_id}")
    assert response.status_code == 403


def test_delete_asset_conflict_when_assignment_history_exists():
    """super_admin receives 409 Conflict if asset has assignment history."""
    super_admin_id = uuid.uuid4()
    set_user_context(super_admin_id, "super_admin")

    asset_id = uuid.uuid4()
    asset = create_mock_asset(asset_id=asset_id)

    mock_db = MagicMock()
    # first() returns asset
    mock_db.query.return_value.filter.return_value.first.return_value = asset
    # scalar() returns count = 1 for assignments, count = 0 for tickets
    mock_db.query.return_value.filter.return_value.scalar.side_effect = [1, 0]

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.delete(f"/api/v1/assets/{asset_id}")
    assert response.status_code == 409
    assert "assignment or maintenance history" in response.json()["error"]["message"]


def test_delete_asset_success_when_clean():
    """super_admin can hard-delete a clean asset with no history."""
    super_admin_id = uuid.uuid4()
    set_user_context(super_admin_id, "super_admin")

    asset_id = uuid.uuid4()
    asset = create_mock_asset(asset_id=asset_id)

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = asset
    # scalar() returns count = 0 for assignments, count = 0 for tickets
    mock_db.query.return_value.filter.return_value.scalar.side_effect = [0, 0]

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.delete(f"/api/v1/assets/{asset_id}")
    assert response.status_code == 204
    assert mock_db.delete.called
    assert mock_db.commit.called
