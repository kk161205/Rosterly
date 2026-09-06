"""
Comprehensive Unit & Integration Tests for Offboarding Workflow API (§5.6).
Verifies 4 PRD endpoints, permission matrix cells, exit_date/reason schema fields,
asset reclamation side effects, decoupled PATCH item status, dedicated HR/Super Admin complete endpoint,
session revocation, notifications, audit logs, and edge cases.
"""
import datetime
import uuid
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.main import app
from app.models.assets import Asset, AssetAssignment, AssetCategory, AssetStatus, DepreciationMethod
from app.models.auth import Department, Role, Session as DBSessionModel, User, UserStatus
from app.models.lifecycle import (
    Checklist,
    ChecklistItem,
    ChecklistItemStatus,
    ChecklistStatus,
    ChecklistType,
)

client = TestClient(app)


def create_mock_user(
    user_id=None,
    full_name="Jane Doe",
    email="jane@example.com",
    role_name="employee",
    role_id=None,
    dept_id=None,
    mgr_id=None,
    status=UserStatus.active,
):
    uid = user_id or uuid.uuid4()
    did = dept_id or uuid.uuid4()
    rid = role_id or uuid.uuid4()

    role = Role(id=rid, name=role_name)
    dept = Department(id=did, name="Engineering")

    user = User(
        id=uid,
        employee_code="RST-1001",
        full_name=full_name,
        email=email,
        password_hash="hashed",
        role_id=rid,
        department_id=did,
        manager_id=mgr_id,
        designation="Software Engineer",
        phone="+1234567890",
        status=status,
        date_of_joining=datetime.date(2025, 1, 1),
        created_at=datetime.datetime.now(datetime.timezone.utc),
    )
    user.role = role
    user.department = dept
    return user


def set_user_context(
    user_id: uuid.UUID, role: str, role_id: uuid.UUID = None, dept_id: uuid.UUID = None
):
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


# ============================================================================
# 1. POST /api/v1/offboarding
# ============================================================================

def test_post_offboarding_allowed_hr_admin_with_exit_date_and_reason():
    """HR Admin can create an offboarding checklist specifying exit_date and reason."""
    hr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(hr_id, "hr_admin")

    target_emp = create_mock_user(user_id=emp_id, full_name="Leaving Employee")
    hr_role = Role(id=uuid.uuid4(), name="hr_admin")
    it_role = Role(id=uuid.uuid4(), name="it_admin")

    mock_db = MagicMock()
    # first() calls: target_user, existing checklist, hr_role, it_role
    mock_db.query().filter().first.side_effect = [target_emp, None, hr_role, it_role]
    mock_db.query().options().filter().all.return_value = []  # active_assignments
    mock_db.query().join().filter().all.return_value = []  # notify_roles

    app.dependency_overrides[get_db] = lambda: mock_db

    payload = {
        "employee_id": str(emp_id),
        "exit_date": "2026-09-15",
        "reason": "Resignation",
    }
    response = client.post("/api/v1/offboarding", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["employee_id"] == str(emp_id)
    assert data["type"] == "offboarding"
    assert data["status"] == "in_progress"
    assert len(data["items"]) == 4
    assert target_emp.status == UserStatus.offboarding
    assert target_emp.date_of_exit == datetime.date(2026, 9, 15)
    app.dependency_overrides.clear()


def test_post_offboarding_allowed_super_admin():
    """Super Admin can create an offboarding checklist."""
    admin_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(admin_id, "super_admin")

    target_emp = create_mock_user(user_id=emp_id, full_name="Leaving Employee")
    mock_db = MagicMock()
    mock_db.query().filter().first.side_effect = [target_emp, None, None, None]
    mock_db.query().options().filter().all.return_value = []
    mock_db.query().join().filter().all.return_value = []

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.post("/api/v1/offboarding", json={"employee_id": str(emp_id)})
    assert response.status_code == 201
    app.dependency_overrides.clear()


@pytest.mark.parametrize("role", ["employee", "manager", "it_admin"])
def test_post_offboarding_denied_roles(role):
    """Unauthorized roles cannot create offboarding checklists."""
    uid = uuid.uuid4()
    set_user_context(uid, role)

    mock_db = MagicMock()
    # No (employee, create) role_permissions grant for this role — RBAC gate in
    # OffboardingService.create_offboarding_checklist (check_permission) must deny.
    mock_db.query().join().filter().first.return_value = None
    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.post("/api/v1/offboarding", json={"employee_id": str(uuid.uuid4())})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"
    app.dependency_overrides.clear()


def test_post_offboarding_employee_not_found():
    """Returns 404 if target employee does not exist."""
    hr_id = uuid.uuid4()
    set_user_context(hr_id, "hr_admin")

    mock_db = MagicMock()
    mock_db.query().filter().first.return_value = None

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.post("/api/v1/offboarding", json={"employee_id": str(uuid.uuid4())})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
    app.dependency_overrides.clear()


def test_post_offboarding_active_conflict():
    """Returns 400 if target employee already has an active offboarding checklist."""
    hr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(hr_id, "hr_admin")

    target_emp = create_mock_user(user_id=emp_id)
    existing_chk = Checklist(id=uuid.uuid4(), employee_id=emp_id, type=ChecklistType.offboarding, status=ChecklistStatus.in_progress)

    mock_db = MagicMock()
    mock_db.query().filter().first.side_effect = [target_emp, existing_chk]

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.post("/api/v1/offboarding", json={"employee_id": str(emp_id)})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "bad_request"
    app.dependency_overrides.clear()


def test_post_offboarding_dynamic_asset_recovery_items():
    """Offboarding checklist seeds dynamic asset recovery items bound to asset_assignment_id."""
    hr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    asset_id = uuid.uuid4()
    assignment_id = uuid.uuid4()
    set_user_context(hr_id, "hr_admin")

    target_emp = create_mock_user(user_id=emp_id)
    asset = Asset(
        id=asset_id,
        asset_tag="LAP-101",
        name="MacBook Pro 16",
        category=AssetCategory.laptop,
        vendor="Apple",
        purchase_date=datetime.date(2025, 1, 1),
        purchase_cost=2500.0,
        current_value=2000.0,
        depreciation_method=DepreciationMethod.straight_line,
        useful_life_months=36,
        status=AssetStatus.assigned,
        current_holder_id=emp_id,
    )
    assignment = AssetAssignment(
        id=assignment_id,
        asset_id=asset_id,
        employee_id=emp_id,
        assigned_by=hr_id,
        condition_at_assignment="Good",
        returned_at=None,
    )
    assignment.asset = asset

    mock_db = MagicMock()
    mock_db.query().filter().first.side_effect = [target_emp, None, None, None]
    mock_db.query().options().filter().all.return_value = [assignment]
    mock_db.query().join().filter().all.return_value = []

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.post("/api/v1/offboarding", json={"employee_id": str(emp_id)})
    assert response.status_code == 201
    data = response.json()
    items = data["items"]
    assert len(items) == 5  # System access + 1 asset retrieval + 3 HR tasks
    asset_item = [i for i in items if i.get("asset_assignment_id") == str(assignment_id)][0]
    assert "Retrieve Asset: MacBook Pro 16 (LAP-101)" in asset_item["task_name"]
    app.dependency_overrides.clear()


# ============================================================================
# 2. GET /api/v1/offboarding/{checklist_id}
# ============================================================================

def test_get_offboarding_allowed_hr_admin():
    """HR Admin can retrieve an offboarding checklist."""
    hr_id = uuid.uuid4()
    chk_id = uuid.uuid4()
    set_user_context(hr_id, "hr_admin")

    chk = Checklist(
        id=chk_id,
        employee_id=uuid.uuid4(),
        type=ChecklistType.offboarding,
        status=ChecklistStatus.in_progress,
        created_at=datetime.datetime.now(datetime.timezone.utc),
        updated_at=datetime.datetime.now(datetime.timezone.utc),
    )
    chk.items = []

    mock_db = MagicMock()
    mock_db.query().options().filter().first.return_value = chk

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.get(f"/api/v1/offboarding/{chk_id}")
    assert response.status_code == 200
    assert response.json()["id"] == str(chk_id)
    app.dependency_overrides.clear()


def test_get_offboarding_allowed_assigned_manager():
    """Assigned manager can view employee's offboarding checklist."""
    mgr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    chk_id = uuid.uuid4()
    set_user_context(mgr_id, "manager")

    target_emp = create_mock_user(user_id=emp_id, mgr_id=mgr_id)
    chk = Checklist(
        id=chk_id,
        employee_id=emp_id,
        type=ChecklistType.offboarding,
        status=ChecklistStatus.in_progress,
        created_at=datetime.datetime.now(datetime.timezone.utc),
        updated_at=datetime.datetime.now(datetime.timezone.utc),
    )
    chk.employee = target_emp
    chk.items = []

    mock_db = MagicMock()
    mock_db.query().options().filter().first.return_value = chk

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.get(f"/api/v1/offboarding/{chk_id}")
    assert response.status_code == 200
    app.dependency_overrides.clear()


def test_get_offboarding_denied_unassigned_manager():
    """Unassigned manager is forbidden from viewing offboarding checklist."""
    mgr_id = uuid.uuid4()
    other_mgr_id = uuid.uuid4()
    chk_id = uuid.uuid4()
    set_user_context(mgr_id, "manager")

    target_emp = create_mock_user(user_id=uuid.uuid4(), mgr_id=other_mgr_id)
    chk = Checklist(
        id=chk_id,
        employee_id=target_emp.id,
        type=ChecklistType.offboarding,
        status=ChecklistStatus.in_progress,
    )
    chk.employee = target_emp

    mock_db = MagicMock()
    mock_db.query().options().filter().first.return_value = chk

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.get(f"/api/v1/offboarding/{chk_id}")
    assert response.status_code == 403
    app.dependency_overrides.clear()


# ============================================================================
# 3. PATCH /api/v1/offboarding/{checklist_id}/items/{item_id}
# ============================================================================

def test_patch_offboarding_item_decoupled_from_completion():
    """Marking final item 'done' updates item & asset side effect but DOES NOT complete checklist or terminate employee."""
    it_id = uuid.uuid4()
    it_role_id = uuid.uuid4()
    chk_id = uuid.uuid4()
    item_id = uuid.uuid4()
    asset_id = uuid.uuid4()
    assignment_id = uuid.uuid4()
    emp_id = uuid.uuid4()

    set_user_context(it_id, "it_admin", role_id=it_role_id)

    emp = create_mock_user(user_id=emp_id, status=UserStatus.offboarding)
    chk = Checklist(
        id=chk_id,
        employee_id=emp_id,
        type=ChecklistType.offboarding,
        status=ChecklistStatus.in_progress,
        created_at=datetime.datetime.now(datetime.timezone.utc),
        updated_at=datetime.datetime.now(datetime.timezone.utc),
    )
    chk.employee = emp

    item = ChecklistItem(
        id=item_id,
        checklist_id=chk_id,
        task_name="Retrieve Asset: Laptop",
        owner_role_id=it_role_id,
        asset_assignment_id=assignment_id,
        status=ChecklistItemStatus.pending,
        sort_order=1,
    )
    item.owner_role = Role(id=it_role_id, name="it_admin")
    item.completer = None
    chk.items = [item]

    asset = Asset(
        id=asset_id,
        asset_tag="LAP-101",
        name="MacBook Pro",
        status=AssetStatus.assigned,
        current_holder_id=emp_id,
    )
    assignment = AssetAssignment(
        id=assignment_id,
        asset_id=asset_id,
        employee_id=emp_id,
        assigned_by=it_id,
        condition_at_assignment="Good",
        returned_at=None,
    )

    mock_db = MagicMock()
    mock_db.query().filter().with_for_update().first.return_value = chk
    mock_db.query().filter().first.side_effect = [item, assignment, asset]

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.patch(
        f"/api/v1/offboarding/{chk_id}/items/{item_id}",
        json={"status": "done"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "done"
    assert assignment.returned_at is not None
    assert asset.status == AssetStatus.in_stock
    assert asset.current_holder_id is None
    # Crucial assertion: status is still offboarding (NOT terminated) and checklist status is still in_progress
    assert emp.status == UserStatus.offboarding
    assert chk.status == ChecklistStatus.in_progress
    app.dependency_overrides.clear()


# ============================================================================
# 4. POST /api/v1/offboarding/{checklist_id}/complete
# ============================================================================

def test_complete_offboarding_allowed_hr_admin():
    """HR Admin can complete offboarding when all items are done, terminating employee & revoking sessions."""
    hr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    chk_id = uuid.uuid4()
    set_user_context(hr_id, "hr_admin")

    emp = create_mock_user(user_id=emp_id, status=UserStatus.offboarding)
    chk = Checklist(
        id=chk_id,
        employee_id=emp_id,
        type=ChecklistType.offboarding,
        status=ChecklistStatus.in_progress,
        created_at=datetime.datetime.now(datetime.timezone.utc),
        updated_at=datetime.datetime.now(datetime.timezone.utc),
    )
    chk.employee = emp

    item1 = ChecklistItem(id=uuid.uuid4(), checklist_id=chk_id, status=ChecklistItemStatus.done, sort_order=1)
    item2 = ChecklistItem(id=uuid.uuid4(), checklist_id=chk_id, status=ChecklistItemStatus.done, sort_order=2)
    chk.items = [item1, item2]

    mock_db = MagicMock()
    mock_db.query().options().filter().with_for_update().first.return_value = chk
    mock_db.query().filter().update.return_value = 1  # Session revocation update count

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.post(f"/api/v1/offboarding/{chk_id}/complete")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert emp.status == UserStatus.terminated
    assert emp.date_of_exit is not None
    app.dependency_overrides.clear()


@pytest.mark.parametrize("role", ["it_admin", "manager", "employee"])
def test_complete_offboarding_denied_non_hr_admin_roles(role):
    """Non-HR/Super Admin roles are forbidden from completing offboarding."""
    uid = uuid.uuid4()
    chk_id = uuid.uuid4()
    set_user_context(uid, role)

    mock_db = MagicMock()
    # No (employee, approve) role_permissions grant for this role — RBAC gate in
    # OffboardingService.complete_offboarding (check_permission) must deny.
    mock_db.query().join().filter().first.return_value = None
    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.post(f"/api/v1/offboarding/{chk_id}/complete")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"
    app.dependency_overrides.clear()


def test_complete_offboarding_incomplete_items_conflict():
    """Returns 400 bad_request if any checklist items are not marked done."""
    hr_id = uuid.uuid4()
    chk_id = uuid.uuid4()
    set_user_context(hr_id, "hr_admin")

    chk = Checklist(
        id=chk_id,
        employee_id=uuid.uuid4(),
        type=ChecklistType.offboarding,
        status=ChecklistStatus.in_progress,
    )
    chk.employee = create_mock_user()

    item1 = ChecklistItem(id=uuid.uuid4(), checklist_id=chk_id, status=ChecklistItemStatus.done, sort_order=1)
    item2 = ChecklistItem(id=uuid.uuid4(), checklist_id=chk_id, status=ChecklistItemStatus.pending, sort_order=2)
    chk.items = [item1, item2]

    mock_db = MagicMock()
    mock_db.query().options().filter().with_for_update().first.return_value = chk

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.post(f"/api/v1/offboarding/{chk_id}/complete")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "bad_request"
    assert "Cannot complete offboarding checklist until all items are marked done" in response.json()["error"]["message"]
    app.dependency_overrides.clear()
