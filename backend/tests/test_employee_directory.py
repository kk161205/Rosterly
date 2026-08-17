"""
Unit & Integration Tests for Employee Directory API (`GET /api/v1/employees`).
Tests ABAC manager row-scoping, employee sanitized field set, search, filtering, and pagination.
"""
import datetime
import uuid
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.main import app
from app.models.auth import UserStatus
from app.services.employee_directory_service import EmployeeDirectoryService

client = TestClient(app)


def mock_row(
    user_id: uuid.UUID = None,
    full_name: str = "Test User",
    email: str = "test@example.com",
    department_id: uuid.UUID = None,
    department_name: str = "Engineering",
    status: UserStatus = UserStatus.active,
):
    row = MagicMock()
    row.id = user_id or uuid.uuid4()
    row.employee_code = "RST-0001"
    row.full_name = full_name
    row.email = email
    row.designation = "Software Engineer"
    row.department_id = department_id or uuid.uuid4()
    row.department_name = department_name
    row.manager_id = uuid.uuid4()
    row.manager_name = "Manager One"
    row.status = status
    row.phone = "+1234567890"
    row.date_of_joining = datetime.date(2025, 1, 15)
    return row


def test_employee_directory_unauthenticated():
    response = client.get("/api/v1/employees")
    assert response.status_code == 401
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "unauthenticated"


def test_employee_directory_employee_role():
    user = CurrentUser(
        user_id=uuid.uuid4(),
        role="employee",
        session_id=uuid.uuid4(),
    )
    app.dependency_overrides[get_current_user] = lambda: user

    mock_db = MagicMock()
    sample_row = mock_row()

    # Setup query mock chain for total count and pagination limit/offset
    query_mock = MagicMock()
    query_mock.outerjoin.return_value = query_mock
    query_mock.filter.return_value = query_mock
    query_mock.order_by.return_value = query_mock
    query_mock.offset.return_value = query_mock
    query_mock.limit.return_value = query_mock
    query_mock.count.return_value = 1
    query_mock.all.return_value = [sample_row]
    mock_db.query.return_value = query_mock

    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        response = client.get("/api/v1/employees")
        assert response.status_code == 200
        payload = response.json()

        assert "items" in payload
        assert "total" in payload
        assert payload["total"] == 1
        assert len(payload["items"]) == 1

        item = payload["items"][0]
        assert item["full_name"] == "Test User"
        assert item["employee_code"] == "RST-0001"
        assert item["designation"] == "Software Engineer"
        assert item["department_name"] == "Engineering"

        # Explicit negative assertions: no sensitive/salary/document fields returned
        assert "salary" not in item
        assert "documents" not in item
        assert "password_hash" not in item
        assert "mfa_enabled" not in item

    finally:
        app.dependency_overrides.clear()


def test_employee_directory_manager_scoping():
    manager_dept_id = uuid.uuid4()
    other_dept_id = uuid.uuid4()

    manager_user = CurrentUser(
        user_id=uuid.uuid4(),
        role="manager",
        session_id=uuid.uuid4(),
        department_id=manager_dept_id,
    )
    app.dependency_overrides[get_current_user] = lambda: manager_user

    mock_db = MagicMock()

    # Manager dept user
    row_in_dept = mock_row(
        full_name="Team Member",
        department_id=manager_dept_id,
        department_name="Engineering",
    )

    query_mock = MagicMock()
    query_mock.outerjoin.return_value = query_mock
    query_mock.filter.return_value = query_mock
    query_mock.order_by.return_value = query_mock
    query_mock.offset.return_value = query_mock
    query_mock.limit.return_value = query_mock
    query_mock.count.return_value = 1
    query_mock.all.return_value = [row_in_dept]
    mock_db.query.return_value = query_mock

    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        # 1. Normal manager call (defaults to own department)
        response = client.get("/api/v1/employees")
        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 1
        assert payload["items"][0]["department_name"] == "Engineering"

        # 2. Negative test: Manager tries to pass query param department_id for another department
        # Service logic forces User.department_id == manager_dept_id
        service = EmployeeDirectoryService(db=mock_db, current_user=manager_user)
        # Verify that get_employees applies manager department filter regardless of department_id query param
        res = service.get_employees(department_id=other_dept_id)
        assert res["total"] == 1
        # The filter calls logged on query_mock confirm manager_dept_id was applied
        filter_args = [call.args[0] for call in query_mock.filter.call_args_list]
        # Ensure binary expression with manager_dept_id exists in filters
        dept_filter_found = any(
            hasattr(arg, "right") and str(arg.right.value) == str(manager_dept_id)
            for arg in filter_args
            if hasattr(arg, "right") and hasattr(arg.right, "value")
        )
        assert dept_filter_found, "Manager department filter was not applied to query"

    finally:
        app.dependency_overrides.clear()


def test_employee_directory_hr_admin_scoping():
    hr_user = CurrentUser(
        user_id=uuid.uuid4(),
        role="hr_admin",
        session_id=uuid.uuid4(),
    )
    app.dependency_overrides[get_current_user] = lambda: hr_user

    mock_db = MagicMock()
    row1 = mock_row(full_name="User One")
    row2 = mock_row(full_name="User Two")

    query_mock = MagicMock()
    query_mock.outerjoin.return_value = query_mock
    query_mock.filter.return_value = query_mock
    query_mock.order_by.return_value = query_mock
    query_mock.offset.return_value = query_mock
    query_mock.limit.return_value = query_mock
    query_mock.count.return_value = 2
    query_mock.all.return_value = [row1, row2]
    mock_db.query.return_value = query_mock

    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        response = client.get("/api/v1/employees")
        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 2
        assert len(payload["items"]) == 2

    finally:
        app.dependency_overrides.clear()


def test_employee_directory_search_filter_pagination():
    admin_user = CurrentUser(
        user_id=uuid.uuid4(),
        role="super_admin",
        session_id=uuid.uuid4(),
    )
    app.dependency_overrides[get_current_user] = lambda: admin_user

    mock_db = MagicMock()
    row_found = mock_row(full_name="Alice Smith", email="alice@example.com")

    query_mock = MagicMock()
    query_mock.outerjoin.return_value = query_mock
    query_mock.filter.return_value = query_mock
    query_mock.order_by.return_value = query_mock
    query_mock.offset.return_value = query_mock
    query_mock.limit.return_value = query_mock
    query_mock.count.return_value = 1
    query_mock.all.return_value = [row_found]
    mock_db.query.return_value = query_mock

    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        response = client.get("/api/v1/employees?search=alice&status=active&page=1&page_size=10")
        assert response.status_code == 200
        payload = response.json()
        assert payload["total"] == 1
        assert payload["page"] == 1
        assert payload["page_size"] == 10
        assert payload["pages"] == 1
        assert payload["items"][0]["full_name"] == "Alice Smith"

    finally:
        app.dependency_overrides.clear()
