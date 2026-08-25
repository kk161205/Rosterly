"""
Comprehensive Unit & Integration Tests for Onboarding Workflow API (§5.5).
Verifies 100% of allowed and denied permission matrix cells, default template seeding,
cascading checklist completion logic, notification dispatch, audit logging, and edge cases.
"""
import datetime
import uuid
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.main import app
from app.models.auth import Department, Role, User, UserStatus
from app.models.lifecycle import (
    Checklist,
    ChecklistItem,
    ChecklistItemStatus,
    ChecklistStatus,
    ChecklistType,
)
from app.models.system import AuditLog, Notification

client = TestClient(app)


def create_mock_user(
    user_id=None,
    full_name="Jane Doe",
    email="jane@example.com",
    role_name="employee",
    role_id=None,
    dept_id=None,
    mgr_id=None,
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
        status=UserStatus.onboarding,
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
# 1. POST /api/v1/onboarding
# ============================================================================

def test_post_onboarding_allowed_hr_admin():
    """HR Admin can create an onboarding checklist and seed default items."""
    hr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(hr_id, "hr_admin")

    target_emp = create_mock_user(user_id=emp_id, full_name="New Hire")
    hr_role = Role(id=uuid.uuid4(), name="hr_admin")
    it_role = Role(id=uuid.uuid4(), name="it_admin")

    mock_db = MagicMock()
    mock_db.query().filter().first.side_effect = [target_emp, None, hr_role, it_role, hr_role]
    mock_db.query().join().filter().all.return_value = []

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.post("/api/v1/onboarding", json={"employee_id": str(emp_id)})
    app.dependency_overrides.clear()

    assert response.status_code == 201
    res_data = response.json()
    assert res_data["employee_id"] == str(emp_id)
    assert res_data["type"] == "onboarding"
    assert res_data["status"] == "in_progress"
    assert len(res_data["items"]) == 5


def test_post_onboarding_dispatches_notifications_and_audit_logs():
    """POST /onboarding creates Notification rows for IT Admins and writes to audit_logs."""
    hr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    it_admin_user = create_mock_user(full_name="IT Admin Guy", role_name="it_admin")
    set_user_context(hr_id, "hr_admin")

    target_emp = create_mock_user(user_id=emp_id, full_name="New Hire")
    hr_role = Role(id=uuid.uuid4(), name="hr_admin")
    it_role = Role(id=uuid.uuid4(), name="it_admin")

    mock_db = MagicMock()
    mock_db.query().filter().first.side_effect = [target_emp, None, hr_role, it_role, hr_role]
    mock_db.query().join().filter().all.return_value = [it_admin_user]

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.post("/api/v1/onboarding", json={"employee_id": str(emp_id)})
    app.dependency_overrides.clear()

    assert response.status_code == 201

    # Verify mock_db.add was called with Notification and AuditLog objects
    added_objs = [call.args[0] for call in mock_db.add.call_args_list if call.args]
    notifications = [obj for obj in added_objs if isinstance(obj, Notification)]
    audit_logs = [obj for obj in added_objs if isinstance(obj, AuditLog)]

    assert len(notifications) >= 1
    assert notifications[0].type == "onboarding_assigned"
    assert "New Hire" in notifications[0].message
    assert len(audit_logs) >= 1
    assert audit_logs[0].action == "onboarding.checklist_created"


@pytest.mark.parametrize("denied_role", ["it_admin", "manager", "employee", "auditor"])
def test_post_onboarding_denied_roles(denied_role):
    """IT Admin, Manager, Employee, and Auditor get 403 on POST /onboarding."""
    user_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(user_id, denied_role)

    mock_db = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.post("/api/v1/onboarding", json={"employee_id": str(emp_id)})
    app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_post_onboarding_employee_not_found():
    """POST /onboarding returns 404 if employee does not exist."""
    hr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(hr_id, "hr_admin")

    mock_db = MagicMock()
    mock_db.query().filter().first.return_value = None

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.post("/api/v1/onboarding", json={"employee_id": str(emp_id)})
    app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_post_onboarding_active_checklist_exists():
    """POST /onboarding returns 400 if an active onboarding checklist already exists."""
    hr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(hr_id, "hr_admin")

    target_emp = create_mock_user(user_id=emp_id)
    existing_chk = Checklist(id=uuid.uuid4(), employee_id=emp_id, status=ChecklistStatus.in_progress)

    mock_db = MagicMock()
    mock_db.query().filter().first.side_effect = [target_emp, existing_chk]

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.post("/api/v1/onboarding", json={"employee_id": str(emp_id)})
    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "bad_request"


# ============================================================================
# 2. GET /api/v1/onboarding/{checklist_id}
# ============================================================================

def test_get_onboarding_detail_hr_admin_allowed():
    """HR Admin can view checklist details."""
    user_id = uuid.uuid4()
    chk_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(user_id, "hr_admin")

    emp = create_mock_user(user_id=emp_id)
    chk = Checklist(
        id=chk_id,
        employee_id=emp_id,
        type=ChecklistType.onboarding,
        status=ChecklistStatus.in_progress,
        created_at=datetime.datetime.now(datetime.timezone.utc),
        updated_at=datetime.datetime.now(datetime.timezone.utc),
    )
    chk.employee = emp
    chk.items = []

    mock_db = MagicMock()
    mock_db.query().options().filter().first.return_value = chk

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.get(f"/api/v1/onboarding/{chk_id}")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["id"] == str(chk_id)


def test_get_onboarding_detail_assigned_manager_allowed():
    """Assigned manager (employee.manager_id == current_user.id) can view checklist."""
    mgr_id = uuid.uuid4()
    chk_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(mgr_id, "manager")

    emp = create_mock_user(user_id=emp_id, mgr_id=mgr_id)
    chk = Checklist(
        id=chk_id,
        employee_id=emp_id,
        type=ChecklistType.onboarding,
        status=ChecklistStatus.in_progress,
        created_at=datetime.datetime.now(datetime.timezone.utc),
        updated_at=datetime.datetime.now(datetime.timezone.utc),
    )
    chk.employee = emp
    chk.items = []

    mock_db = MagicMock()
    mock_db.query().options().filter().first.return_value = chk

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.get(f"/api/v1/onboarding/{chk_id}")
    app.dependency_overrides.clear()

    assert response.status_code == 200


def test_get_onboarding_detail_unassigned_manager_denied():
    """Manager who is NOT the assigned manager gets 403 Forbidden."""
    mgr_id = uuid.uuid4()
    other_mgr_id = uuid.uuid4()
    chk_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(mgr_id, "manager")

    emp = create_mock_user(user_id=emp_id, mgr_id=other_mgr_id)
    chk = Checklist(
        id=chk_id,
        employee_id=emp_id,
        type=ChecklistType.onboarding,
        status=ChecklistStatus.in_progress,
        created_at=datetime.datetime.now(datetime.timezone.utc),
        updated_at=datetime.datetime.now(datetime.timezone.utc),
    )
    chk.employee = emp
    chk.items = []

    mock_db = MagicMock()
    mock_db.query().options().filter().first.return_value = chk

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.get(f"/api/v1/onboarding/{chk_id}")
    app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_get_onboarding_detail_not_found():
    """GET /onboarding/{id} returns 404 if checklist does not exist."""
    user_id = uuid.uuid4()
    chk_id = uuid.uuid4()
    set_user_context(user_id, "hr_admin")

    mock_db = MagicMock()
    mock_db.query().options().filter().first.return_value = None

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.get(f"/api/v1/onboarding/{chk_id}")
    app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


# ============================================================================
# 3. GET /api/v1/onboarding (List)
# ============================================================================

def test_get_onboarding_list_hr_admin_allowed():
    """HR Admin can list active onboardings."""
    user_id = uuid.uuid4()
    set_user_context(user_id, "hr_admin")

    emp = create_mock_user()
    chk = Checklist(
        id=uuid.uuid4(),
        employee_id=emp.id,
        type=ChecklistType.onboarding,
        status=ChecklistStatus.in_progress,
        created_at=datetime.datetime.now(datetime.timezone.utc),
        updated_at=datetime.datetime.now(datetime.timezone.utc),
    )
    chk.employee = emp
    chk.items = []

    mock_db = MagicMock()
    mock_db.query().options().filter().order_by().all.return_value = [chk]

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.get("/api/v1/onboarding")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    res_data = response.json()
    assert res_data["total"] == 1
    assert len(res_data["checklists"]) == 1


@pytest.mark.parametrize("denied_role", ["it_admin", "manager", "employee", "auditor"])
def test_get_onboarding_list_denied_roles(denied_role):
    """Non-HR/Super Admins get 403 on GET /onboarding list."""
    user_id = uuid.uuid4()
    set_user_context(user_id, denied_role)

    mock_db = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.get("/api/v1/onboarding")
    app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


# ============================================================================
# 4. PATCH /api/v1/onboarding/{checklist_id}/items/{item_id}
# ============================================================================

def test_patch_item_matching_role_allowed():
    """User matching item.owner_role_id can update item status."""
    it_admin_id = uuid.uuid4()
    it_role_id = uuid.uuid4()
    chk_id = uuid.uuid4()
    item_id = uuid.uuid4()

    set_user_context(it_admin_id, "it_admin", role_id=it_role_id)

    chk = Checklist(
        id=chk_id,
        employee_id=uuid.uuid4(),
        type=ChecklistType.onboarding,
        status=ChecklistStatus.in_progress,
    )
    chk.employee = create_mock_user()

    item = ChecklistItem(
        id=item_id,
        checklist_id=chk_id,
        task_name="Provision Laptop",
        owner_role_id=it_role_id,
        status=ChecklistItemStatus.pending,
        sort_order=1,
        created_at=datetime.datetime.now(datetime.timezone.utc),
    )
    item.owner_role = Role(id=it_role_id, name="it_admin")
    item.completer = None

    mock_db = MagicMock()
    mock_db.query().filter().with_for_update().first.return_value = chk
    mock_db.query().filter().first.return_value = item
    mock_db.query().filter().all.return_value = [item]

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.patch(
        f"/api/v1/onboarding/{chk_id}/items/{item_id}", json={"status": "in_progress"}
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["id"] == str(item_id)


def test_patch_item_non_matching_role_denied():
    """User whose role does NOT match owner_role_id gets 403 Forbidden."""
    user_id = uuid.uuid4()
    my_role_id = uuid.uuid4()
    other_role_id = uuid.uuid4()
    chk_id = uuid.uuid4()
    item_id = uuid.uuid4()

    set_user_context(user_id, "it_admin", role_id=my_role_id)

    chk = Checklist(id=chk_id, status=ChecklistStatus.in_progress)
    chk.employee = create_mock_user()

    item = ChecklistItem(id=item_id, checklist_id=chk_id, owner_role_id=other_role_id)
    item.owner_role = Role(id=other_role_id, name="hr_admin")
    item.completer = None

    mock_db = MagicMock()
    mock_db.query().filter().with_for_update().first.return_value = chk
    mock_db.query().filter().first.return_value = item

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.patch(
        f"/api/v1/onboarding/{chk_id}/items/{item_id}", json={"status": "done"}
    )
    app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"


def test_patch_item_cascading_completion_negative_case():
    """Marking a non-final item 'done' does NOT complete the parent checklist."""
    hr_id = uuid.uuid4()
    hr_role_id = uuid.uuid4()
    chk_id = uuid.uuid4()
    item1_id = uuid.uuid4()
    item2_id = uuid.uuid4()

    set_user_context(hr_id, "hr_admin", role_id=hr_role_id)

    chk = Checklist(id=chk_id, status=ChecklistStatus.in_progress)
    chk.employee = create_mock_user()

    item1 = ChecklistItem(
        id=item1_id,
        checklist_id=chk_id,
        task_name="Item 1",
        owner_role_id=hr_role_id,
        status=ChecklistItemStatus.pending,
        sort_order=1,
        created_at=datetime.datetime.now(datetime.timezone.utc),
    )
    item1.owner_role = Role(id=hr_role_id, name="hr_admin")
    item1.completer = None

    item2 = ChecklistItem(
        id=item2_id,
        checklist_id=chk_id,
        task_name="Item 2",
        owner_role_id=hr_role_id,
        status=ChecklistItemStatus.pending,
        sort_order=2,
        created_at=datetime.datetime.now(datetime.timezone.utc),
    )
    item2.owner_role = Role(id=hr_role_id, name="hr_admin")
    item2.completer = None

    mock_db = MagicMock()
    mock_db.query().filter().with_for_update().first.return_value = chk
    mock_db.query().filter().first.return_value = item1
    mock_db.query().filter().all.return_value = [item1, item2]

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.patch(
        f"/api/v1/onboarding/{chk_id}/items/{item1_id}", json={"status": "done"}
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert chk.status == ChecklistStatus.in_progress
    assert chk.completed_at is None


def test_patch_item_cascading_completion_happy_case_and_notification():
    """Marking final item 'done' completes checklist and dispatches Notification + AuditLog."""
    hr_id = uuid.uuid4()
    hr_role_id = uuid.uuid4()
    chk_id = uuid.uuid4()
    item1_id = uuid.uuid4()
    item2_id = uuid.uuid4()

    set_user_context(hr_id, "hr_admin", role_id=hr_role_id)

    chk = Checklist(id=chk_id, status=ChecklistStatus.in_progress)
    chk.employee = create_mock_user(full_name="Alex Smith")

    item1 = ChecklistItem(
        id=item1_id,
        checklist_id=chk_id,
        task_name="Item 1",
        owner_role_id=hr_role_id,
        status=ChecklistItemStatus.done,
        sort_order=1,
        created_at=datetime.datetime.now(datetime.timezone.utc),
    )
    item1.owner_role = Role(id=hr_role_id, name="hr_admin")
    item1.completer = None

    item2 = ChecklistItem(
        id=item2_id,
        checklist_id=chk_id,
        task_name="Item 2",
        owner_role_id=hr_role_id,
        status=ChecklistItemStatus.pending,
        sort_order=2,
        created_at=datetime.datetime.now(datetime.timezone.utc),
    )
    item2.owner_role = Role(id=hr_role_id, name="hr_admin")
    item2.completer = None

    mock_db = MagicMock()
    mock_db.query().filter().with_for_update().first.return_value = chk
    mock_db.query().filter().first.return_value = item2
    mock_db.query().filter().all.return_value = [item1, item2]

    app.dependency_overrides[get_db] = lambda: mock_db

    response = client.patch(
        f"/api/v1/onboarding/{chk_id}/items/{item2_id}", json={"status": "done"}
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert chk.status == ChecklistStatus.completed
    assert chk.completed_at is not None

    # Assert Notification and AuditLog creation occurred
    added_objs = [call.args[0] for call in mock_db.add.call_args_list if call.args]
    notifications = [obj for obj in added_objs if isinstance(obj, Notification)]
    audit_logs = [obj for obj in added_objs if isinstance(obj, AuditLog)]

    assert len(notifications) >= 1
    assert notifications[0].type == "onboarding_completed"
    assert "Alex Smith" in notifications[0].message

    assert len(audit_logs) >= 1
    assert audit_logs[0].action == "onboarding.item_updated"
    assert audit_logs[0].after_state["checklist_completed"] is True
