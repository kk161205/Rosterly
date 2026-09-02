"""
Comprehensive Unit & Integration Tests for Employee Profile Detail API (§5.4).
Verifies 100% of allowed and denied permission matrix cells across all 6 endpoints for all 6 roles.
"""
import datetime
import io
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.main import app
from app.models.assets import Asset, AssetAssignment, AssetCategory
from app.models.auth import Department, Role, User, UserStatus
from app.models.lifecycle import Document, DocumentType
from app.models.system import AuditLog
from app.schemas.employee_profile import EmployeeProfileUpdateRequest
from app.services.employee_directory_service import EmployeeDirectoryService
from app.services.employee_profile_service import EmployeeProfileService

client = TestClient(app)


def create_mock_user(
    user_id=None,
    full_name="John Doe",
    email="john@example.com",
    role_name="employee",
    dept_id=None,
    dept_name="Engineering",
    mgr_id=None,
    phone="+1234567890",
):
    uid = user_id or uuid.uuid4()
    did = dept_id or uuid.uuid4()
    rid = uuid.uuid4()

    role = Role(id=rid, name=role_name)
    dept = Department(id=did, name=dept_name)

    user = User(
        id=uid,
        employee_code="RST-0001",
        full_name=full_name,
        email=email,
        password_hash="hashed",
        role_id=rid,
        department_id=did,
        manager_id=mgr_id,
        designation="Software Engineer",
        phone=phone,
        status=UserStatus.active,
        date_of_joining=datetime.date(2025, 1, 1),
        created_at=datetime.datetime.now(datetime.timezone.utc),
    )
    user.role = role
    user.department = dept
    return user


def set_user_context(user_id: uuid.UUID, role: str, dept_id: uuid.UUID = None):
    curr_u = CurrentUser(
        user_id=user_id,
        role=role,
        session_id=uuid.uuid4(),
        department_id=dept_id,
        email=f"{role}@example.com",
        full_name=f"User {role}",
    )
    app.dependency_overrides[get_current_user] = lambda: curr_u
    return curr_u


# ============================================================================
# 1. GET /api/v1/employees/{id}
# ============================================================================

def test_get_employee_profile_self_allowed():
    emp_id = uuid.uuid4()
    dept_id = uuid.uuid4()
    set_user_context(emp_id, "employee", dept_id)

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id, dept_id=dept_id)
    mock_db.query().outerjoin().outerjoin().outerjoin().filter().first.return_value = (
        mock_user,
        "Engineering",
        "employee",
        "Manager One",
    )
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}")
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == str(emp_id)
        assert data["full_name"] == "John Doe"
    finally:
        app.dependency_overrides.clear()


def test_get_employee_profile_self_other_employee_denied_403():
    emp_self = uuid.uuid4()
    emp_other = uuid.uuid4()
    set_user_context(emp_self, "employee")

    mock_db = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_other}")
        assert res.status_code == 403
        assert res.json()["error"]["code"] == "forbidden"
    finally:
        app.dependency_overrides.clear()


def test_get_employee_profile_manager_own_dept_allowed():
    mgr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    dept_id = uuid.uuid4()
    set_user_context(mgr_id, "manager", dept_id)

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id, dept_id=dept_id)
    mock_db.query().outerjoin().outerjoin().outerjoin().filter().first.return_value = (
        mock_user,
        "Engineering",
        "employee",
        "Manager One",
    )
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}")
        assert res.status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_get_employee_profile_manager_out_of_dept_denied_403():
    mgr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    mgr_dept = uuid.uuid4()
    emp_dept = uuid.uuid4()
    set_user_context(mgr_id, "manager", mgr_dept)

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id, dept_id=emp_dept)
    mock_db.query().outerjoin().outerjoin().outerjoin().filter().first.return_value = (
        mock_user,
        "Marketing",
        "employee",
        "Manager Two",
    )
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}")
        assert res.status_code == 403
        assert res.json()["error"]["code"] == "forbidden"
    finally:
        app.dependency_overrides.clear()


def test_get_employee_profile_it_admin_denied_403():
    it_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(it_id, "it_admin")

    mock_db = MagicMock()
    # No (employee, read) role_permissions grant for it_admin — RBAC gate in
    # EmployeeProfileService.get_employee_profile (check_permission) must deny.
    mock_db.query().join().filter().first.return_value = None
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}")
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_get_employee_profile_hr_admin_allowed():
    hr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(hr_id, "hr_admin")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    mock_db.query().outerjoin().outerjoin().outerjoin().filter().first.return_value = (
        mock_user,
        "Engineering",
        "employee",
        "Manager One",
    )
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}")
        assert res.status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_get_employee_profile_super_admin_allowed():
    sa_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(sa_id, "super_admin")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    mock_db.query().outerjoin().outerjoin().outerjoin().filter().first.return_value = (
        mock_user,
        "Engineering",
        "employee",
        "Manager One",
    )
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}")
        assert res.status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_get_employee_profile_auditor_allowed():
    auditor_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(auditor_id, "auditor")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    mock_db.query().outerjoin().outerjoin().outerjoin().filter().first.return_value = (
        mock_user,
        "Engineering",
        "employee",
        "Manager One",
    )
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}")
        assert res.status_code == 200
    finally:
        app.dependency_overrides.clear()


# ============================================================================
# 2. PATCH /api/v1/employees/{id}
# ============================================================================

def test_patch_employee_self_phone_allowed():
    emp_id = uuid.uuid4()
    set_user_context(emp_id, "employee")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    mock_db.query().filter().first.return_value = mock_user
    mock_db.query().outerjoin().outerjoin().outerjoin().filter().first.return_value = (
        mock_user,
        "Engineering",
        "employee",
        "Manager One",
    )
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.patch(f"/api/v1/employees/{emp_id}", json={"phone": "+999999999"})
        assert res.status_code == 200
        assert mock_user.phone == "+999999999"
    finally:
        app.dependency_overrides.clear()


def test_patch_employee_self_other_employee_denied_403():
    emp_self = uuid.uuid4()
    emp_other = uuid.uuid4()
    set_user_context(emp_self, "employee")

    mock_db = MagicMock()
    # No (employee, update) role_permissions grant for employee (non-self) — RBAC
    # gate in EmployeeProfileService.patch_employee_profile (check_permission)
    # must deny before any write is attempted.
    mock_db.query().join().filter().first.return_value = None
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.patch(f"/api/v1/employees/{emp_other}", json={"phone": "+12345"})
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize(
    "restricted_field,value",
    [
        ("full_name", "Hacker Name"),
        ("designation", "CEO"),
        ("department_id", str(uuid.uuid4())),
        ("role_id", str(uuid.uuid4())),
        ("status", "inactive"),
        ("manager_id", str(uuid.uuid4())),
        ("address", "123 Main St"),
    ],
)
def test_patch_employee_self_every_restricted_field_rejected_400(restricted_field, value):
    emp_id = uuid.uuid4()
    set_user_context(emp_id, "employee")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    mock_db.query().filter().first.return_value = mock_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.patch(f"/api/v1/employees/{emp_id}", json={restricted_field: value})
        assert res.status_code == 400
        data = res.json()
        assert data["error"]["code"] == "bad_request"
    finally:
        app.dependency_overrides.clear()


def test_patch_employee_manager_denied_403():
    mgr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(mgr_id, "manager")

    mock_db = MagicMock()
    # No (employee, update) role_permissions grant for manager — RBAC gate in
    # EmployeeProfileService.patch_employee_profile (check_permission) must deny.
    mock_db.query().join().filter().first.return_value = None
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.patch(f"/api/v1/employees/{emp_id}", json={"phone": "+12345"})
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_patch_employee_it_admin_denied_403():
    it_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(it_id, "it_admin")

    mock_db = MagicMock()
    # No (employee, update) role_permissions grant for it_admin — RBAC gate in
    # EmployeeProfileService.patch_employee_profile (check_permission) must deny.
    mock_db.query().join().filter().first.return_value = None
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.patch(f"/api/v1/employees/{emp_id}", json={"phone": "+12345"})
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_patch_employee_auditor_denied_403():
    auditor_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(auditor_id, "auditor")

    mock_db = MagicMock()
    # No (employee, update) role_permissions grant for auditor — RBAC gate in
    # EmployeeProfileService.patch_employee_profile (check_permission) must deny.
    mock_db.query().join().filter().first.return_value = None
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.patch(f"/api/v1/employees/{emp_id}", json={"phone": "+12345"})
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_patch_employee_hr_admin_allowed_all_fields():
    hr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    new_dept_id = uuid.uuid4()
    new_role_id = uuid.uuid4()
    new_mgr_id = uuid.uuid4()
    set_user_context(hr_id, "hr_admin")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    mock_dept = Department(id=new_dept_id, name="HR")
    mock_role = Role(id=new_role_id, name="hr_admin")
    mock_mgr = create_mock_user(user_id=new_mgr_id)

    mock_db.query().filter().first.side_effect = [
        mock_user,
        mock_dept,
        mock_role,
        mock_mgr,
    ]
    mock_db.query().outerjoin().outerjoin().outerjoin().filter().first.return_value = (
        mock_user,
        "HR",
        "hr_admin",
        "Manager Boss",
    )
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        payload = {
            "full_name": "Updated Name",
            "designation": "Lead HR",
            "department_id": str(new_dept_id),
            "role_id": str(new_role_id),
            "status": "active",
            "manager_id": str(new_mgr_id),
            "phone": "+111222333",
        }
        res = client.patch(f"/api/v1/employees/{emp_id}", json=payload)
        assert res.status_code == 200
        assert mock_user.full_name == "Updated Name"
        assert mock_user.designation == "Lead HR"
    finally:
        app.dependency_overrides.clear()


def test_patch_employee_super_admin_allowed_all_fields():
    sa_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(sa_id, "super_admin")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    mock_db.query().filter().first.return_value = mock_user
    mock_db.query().outerjoin().outerjoin().outerjoin().filter().first.return_value = (
        mock_user,
        "Engineering",
        "super_admin",
        "Manager Boss",
    )
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.patch(f"/api/v1/employees/{emp_id}", json={"designation": "Principal Engineer"})
        assert res.status_code == 200
        assert mock_user.designation == "Principal Engineer"
    finally:
        app.dependency_overrides.clear()


def test_patch_employee_unknown_field_400_validation_error():
    emp_id = uuid.uuid4()
    set_user_context(emp_id, "hr_admin")

    mock_db = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.patch(f"/api/v1/employees/{emp_id}", json={"unknown_field": "val"})
        assert res.status_code == 400
        assert res.json()["error"]["code"] == "validation_error"
    finally:
        app.dependency_overrides.clear()


# ============================================================================
# 3. GET /api/v1/employees/{id}/documents
# ============================================================================

def test_get_documents_self_includes_confidential():
    emp_id = uuid.uuid4()
    set_user_context(emp_id, "employee")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    doc1 = Document(
        id=uuid.uuid4(),
        employee_id=emp_id,
        doc_type=DocumentType.contract,
        file_name="contract.pdf",
        file_url="/uploads/documents/contract.pdf",
        is_confidential=True,
        uploaded_by=emp_id,
        uploaded_at=datetime.datetime.now(datetime.timezone.utc),
    )
    mock_db.query().filter().first.return_value = mock_user
    mock_db.query().outerjoin().filter().order_by().all.return_value = [(doc1, "John Doe")]
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}/documents")
        assert res.status_code == 200
        docs = res.json()
        assert len(docs) == 1
        assert docs[0]["is_confidential"] is True
    finally:
        app.dependency_overrides.clear()


def test_get_documents_self_other_employee_denied_403():
    emp_self = uuid.uuid4()
    emp_other = uuid.uuid4()
    set_user_context(emp_self, "employee")

    mock_db = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_other}/documents")
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_get_documents_auditor_excludes_confidential():
    auditor_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(auditor_id, "auditor")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    doc_non_conf = Document(
        id=uuid.uuid4(),
        employee_id=emp_id,
        doc_type=DocumentType.policy_ack,
        file_name="policy.pdf",
        file_url="/uploads/documents/policy.pdf",
        is_confidential=False,
        uploaded_by=emp_id,
        uploaded_at=datetime.datetime.now(datetime.timezone.utc),
    )

    filter_mock = MagicMock()
    mock_db.query().filter().first.return_value = mock_user
    mock_db.query().outerjoin().filter().filter.return_value = filter_mock
    filter_mock.order_by().all.return_value = [(doc_non_conf, "John Doe")]
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}/documents")
        assert res.status_code == 200
        docs = res.json()
        assert len(docs) == 1
        assert docs[0]["is_confidential"] is False
    finally:
        app.dependency_overrides.clear()


def test_get_documents_manager_denied_403():
    mgr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(mgr_id, "manager")

    mock_db = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}/documents")
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_get_documents_it_admin_denied_403():
    it_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(it_id, "it_admin")

    mock_db = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}/documents")
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_get_documents_hr_admin_includes_confidential():
    hr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(hr_id, "hr_admin")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    doc_conf = Document(
        id=uuid.uuid4(),
        employee_id=emp_id,
        doc_type=DocumentType.contract,
        file_name="salary_contract.pdf",
        file_url="/uploads/documents/salary_contract.pdf",
        is_confidential=True,
        uploaded_by=hr_id,
        uploaded_at=datetime.datetime.now(datetime.timezone.utc),
    )
    mock_db.query().filter().first.return_value = mock_user
    mock_db.query().outerjoin().filter().order_by().all.return_value = [(doc_conf, "HR Admin")]
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}/documents")
        assert res.status_code == 200
        docs = res.json()
        assert len(docs) == 1
        assert docs[0]["is_confidential"] is True
    finally:
        app.dependency_overrides.clear()


def test_get_documents_super_admin_includes_confidential():
    sa_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(sa_id, "super_admin")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    doc_conf = Document(
        id=uuid.uuid4(),
        employee_id=emp_id,
        doc_type=DocumentType.contract,
        file_name="salary_contract.pdf",
        file_url="/uploads/documents/salary_contract.pdf",
        is_confidential=True,
        uploaded_by=sa_id,
        uploaded_at=datetime.datetime.now(datetime.timezone.utc),
    )
    mock_db.query().filter().first.return_value = mock_user
    mock_db.query().outerjoin().filter().order_by().all.return_value = [(doc_conf, "Super Admin")]
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}/documents")
        assert res.status_code == 200
        docs = res.json()
        assert len(docs) == 1
        assert docs[0]["is_confidential"] is True
    finally:
        app.dependency_overrides.clear()


# ============================================================================
# 4. POST /api/v1/employees/{id}/documents
# ============================================================================

def test_upload_document_self_allowed():
    emp_id = uuid.uuid4()
    set_user_context(emp_id, "employee")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    mock_db.query().filter().first.return_value = mock_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        file_content = b"%PDF-1.4 sample content"
        files = {"file": ("test.pdf", io.BytesIO(file_content), "application/pdf")}
        data = {"doc_type": "contract", "is_confidential": "false"}

        res = client.post(f"/api/v1/employees/{emp_id}/documents", data=data, files=files)
        assert res.status_code == 201
        payload = res.json()
        assert payload["file_name"] == "test.pdf"
        assert payload["doc_type"] == "contract"
    finally:
        app.dependency_overrides.clear()


def test_upload_document_self_other_employee_denied_403():
    emp_self = uuid.uuid4()
    emp_other = uuid.uuid4()
    set_user_context(emp_self, "employee")

    mock_db = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        file_content = b"%PDF-1.4 sample content"
        files = {"file": ("test.pdf", io.BytesIO(file_content), "application/pdf")}
        data = {"doc_type": "contract"}

        res = client.post(f"/api/v1/employees/{emp_other}/documents", data=data, files=files)
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_upload_document_path_traversal_sanitized():
    emp_id = uuid.uuid4()
    set_user_context(emp_id, "employee")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    mock_db.query().filter().first.return_value = mock_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        file_content = b"%PDF-1.4 sample content"
        # Path traversal filename attempt
        files = {"file": ("../../etc/passwd.pdf", io.BytesIO(file_content), "application/pdf")}
        data = {"doc_type": "contract"}

        res = client.post(f"/api/v1/employees/{emp_id}/documents", data=data, files=files)
        assert res.status_code == 201
        payload = res.json()
        # Display filename sanitized to basename
        assert payload["file_name"] == "passwd.pdf"
        assert ".." not in payload["file_url"]
    finally:
        app.dependency_overrides.clear()


def test_upload_document_manager_denied_403():
    mgr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(mgr_id, "manager")

    mock_db = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        file_content = b"%PDF-1.4"
        files = {"file": ("test.pdf", io.BytesIO(file_content), "application/pdf")}
        data = {"doc_type": "contract"}

        res = client.post(f"/api/v1/employees/{emp_id}/documents", data=data, files=files)
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_upload_document_it_admin_denied_403():
    it_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(it_id, "it_admin")

    mock_db = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        files = {"file": ("test.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")}
        data = {"doc_type": "contract"}

        res = client.post(f"/api/v1/employees/{emp_id}/documents", data=data, files=files)
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_upload_document_auditor_denied_403():
    auditor_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(auditor_id, "auditor")

    mock_db = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        files = {"file": ("test.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")}
        data = {"doc_type": "contract"}

        res = client.post(f"/api/v1/employees/{emp_id}/documents", data=data, files=files)
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_upload_document_hr_admin_allowed():
    hr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(hr_id, "hr_admin")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    mock_db.query().filter().first.return_value = mock_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        files = {"file": ("hr_doc.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")}
        data = {"doc_type": "offer_letter"}

        res = client.post(f"/api/v1/employees/{emp_id}/documents", data=data, files=files)
        assert res.status_code == 201
    finally:
        app.dependency_overrides.clear()


def test_upload_document_super_admin_allowed():
    sa_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(sa_id, "super_admin")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    mock_db.query().filter().first.return_value = mock_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        files = {"file": ("sa_doc.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")}
        data = {"doc_type": "contract"}

        res = client.post(f"/api/v1/employees/{emp_id}/documents", data=data, files=files)
        assert res.status_code == 201
    finally:
        app.dependency_overrides.clear()


def test_upload_document_invalid_extension_rejected_400():
    emp_id = uuid.uuid4()
    set_user_context(emp_id, "hr_admin")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    mock_db.query().filter().first.return_value = mock_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        file_content = b"echo 'bad script'"
        files = {"file": ("malicious.exe", io.BytesIO(file_content), "application/octet-stream")}
        data = {"doc_type": "other"}

        res = client.post(f"/api/v1/employees/{emp_id}/documents", data=data, files=files)
        assert res.status_code == 400
        assert "Invalid file type" in res.json()["error"]["message"]
    finally:
        app.dependency_overrides.clear()


def test_upload_document_size_exceeded_rejected_400():
    emp_id = uuid.uuid4()
    set_user_context(emp_id, "hr_admin")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    mock_db.query().filter().first.return_value = mock_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        large_content = b"0" * (10 * 1024 * 1024 + 1)
        files = {"file": ("large.pdf", io.BytesIO(large_content), "application/pdf")}
        data = {"doc_type": "contract"}

        res = client.post(f"/api/v1/employees/{emp_id}/documents", data=data, files=files)
        assert res.status_code == 400
        assert "File size exceeds maximum allowed limit" in res.json()["error"]["message"]
    finally:
        app.dependency_overrides.clear()


# ============================================================================
# 5. DELETE /api/v1/employees/{id}/documents/{doc_id}
# ============================================================================

def test_delete_document_self_denied_403():
    emp_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    set_user_context(emp_id, "employee")

    mock_db = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.delete(f"/api/v1/employees/{emp_id}/documents/{doc_id}")
        assert res.status_code == 403
        assert "Only HR Admin or Super Admin" in res.json()["error"]["message"]
    finally:
        app.dependency_overrides.clear()


def test_delete_document_manager_denied_403():
    mgr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    set_user_context(mgr_id, "manager")

    mock_db = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.delete(f"/api/v1/employees/{emp_id}/documents/{doc_id}")
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_delete_document_it_admin_denied_403():
    it_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    set_user_context(it_id, "it_admin")

    mock_db = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.delete(f"/api/v1/employees/{emp_id}/documents/{doc_id}")
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_delete_document_auditor_denied_403():
    auditor_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    set_user_context(auditor_id, "auditor")

    mock_db = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.delete(f"/api/v1/employees/{emp_id}/documents/{doc_id}")
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_delete_document_hr_admin_allowed():
    hr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    set_user_context(hr_id, "hr_admin")

    mock_db = MagicMock()
    mock_doc = Document(
        id=doc_id,
        employee_id=emp_id,
        file_url="/uploads/documents/sample.pdf",
    )
    mock_db.query().filter().first.return_value = mock_doc
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.delete(f"/api/v1/employees/{emp_id}/documents/{doc_id}")
        assert res.status_code == 204
    finally:
        app.dependency_overrides.clear()


def test_delete_document_super_admin_allowed():
    sa_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    set_user_context(sa_id, "super_admin")

    mock_db = MagicMock()
    mock_doc = Document(
        id=doc_id,
        employee_id=emp_id,
        file_url="/uploads/documents/sample.pdf",
    )
    mock_db.query().filter().first.return_value = mock_doc
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.delete(f"/api/v1/employees/{emp_id}/documents/{doc_id}")
        assert res.status_code == 204
    finally:
        app.dependency_overrides.clear()


# ============================================================================
# 6. GET /api/v1/employees/{id}/assets
# ============================================================================

def test_get_assets_self_returns_current_and_history():
    emp_id = uuid.uuid4()
    set_user_context(emp_id, "employee")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    mock_db.query().filter().first.return_value = mock_user

    laptop = Asset(
        id=uuid.uuid4(),
        asset_tag="AST-001",
        name="MacBook Pro 16",
        category=AssetCategory.laptop,
        serial_number="C02XYZ123",
    )
    active_assign = AssetAssignment(
        id=uuid.uuid4(),
        asset_id=laptop.id,
        employee_id=emp_id,
        assigned_by=uuid.uuid4(),
        assigned_at=datetime.datetime.now(datetime.timezone.utc),
        returned_at=None,
        condition_at_assignment="New",
    )
    returned_assign = AssetAssignment(
        id=uuid.uuid4(),
        asset_id=laptop.id,
        employee_id=emp_id,
        assigned_by=uuid.uuid4(),
        assigned_at=datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=100),
        returned_at=datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=10),
        condition_at_assignment="Good",
        condition_at_return="Used",
    )

    mock_db.query().join().outerjoin().filter().order_by().all.return_value = [
        (active_assign, laptop, "IT Admin One"),
        (returned_assign, laptop, "IT Admin One"),
    ]
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}/assets")
        assert res.status_code == 200
        data = res.json()
        assert "current" in data
        assert "history" in data
        assert len(data["current"]) == 1
        assert len(data["history"]) == 1
        assert data["current"][0]["asset_tag"] == "AST-001"
    finally:
        app.dependency_overrides.clear()


def test_get_assets_self_other_employee_denied_403():
    emp_self = uuid.uuid4()
    emp_other = uuid.uuid4()
    set_user_context(emp_self, "employee")

    mock_db = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_other}/assets")
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_get_assets_manager_own_dept_allowed():
    mgr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    dept_id = uuid.uuid4()
    set_user_context(mgr_id, "manager", dept_id)

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id, dept_id=dept_id)
    mock_db.query().filter().first.return_value = mock_user
    mock_db.query().join().outerjoin().filter().order_by().all.return_value = []
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}/assets")
        assert res.status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_get_assets_manager_out_of_dept_denied_403():
    mgr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    mgr_dept = uuid.uuid4()
    emp_dept = uuid.uuid4()
    set_user_context(mgr_id, "manager", mgr_dept)

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id, dept_id=emp_dept)
    mock_db.query().filter().first.return_value = mock_user
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}/assets")
        assert res.status_code == 403
        assert "Managers may only view assets for employees within their own department" in res.json()["error"]["message"]
    finally:
        app.dependency_overrides.clear()


def test_get_assets_hr_admin_allowed():
    hr_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(hr_id, "hr_admin")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    mock_db.query().filter().first.return_value = mock_user
    mock_db.query().join().outerjoin().filter().order_by().all.return_value = []
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}/assets")
        assert res.status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_get_assets_it_admin_allowed():
    it_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(it_id, "it_admin")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    mock_db.query().filter().first.return_value = mock_user
    mock_db.query().join().outerjoin().filter().order_by().all.return_value = []
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}/assets")
        assert res.status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_get_assets_super_admin_allowed():
    sa_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(sa_id, "super_admin")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    mock_db.query().filter().first.return_value = mock_user
    mock_db.query().join().outerjoin().filter().order_by().all.return_value = []
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}/assets")
        assert res.status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_get_assets_auditor_allowed():
    auditor_id = uuid.uuid4()
    emp_id = uuid.uuid4()
    set_user_context(auditor_id, "auditor")

    mock_db = MagicMock()
    mock_user = create_mock_user(user_id=emp_id)
    mock_db.query().filter().first.return_value = mock_user
    mock_db.query().join().outerjoin().filter().order_by().all.return_value = []
    app.dependency_overrides[get_db] = lambda: mock_db

    try:
        res = client.get(f"/api/v1/employees/{emp_id}/assets")
        assert res.status_code == 200
    finally:
        app.dependency_overrides.clear()


# ============================================================================
# 7. Soft delete, offboard exit_date/reason, and session revocation on
#    role/status change — coverage added for the 5.1-5.5 review fix pass.
# ============================================================================

def make_current_user(role: str, user_id=None, role_id=None, department_id=None) -> CurrentUser:
    return CurrentUser(
        user_id=user_id or uuid.uuid4(),
        role=role,
        session_id=uuid.uuid4(),
        role_id=role_id or uuid.uuid4(),
        department_id=department_id,
        full_name=f"{role} user",
        email=f"{role}@example.com",
    )


def make_target_user(**overrides) -> User:
    defaults = dict(
        id=uuid.uuid4(),
        employee_code="RST-2001",
        full_name="Target Employee",
        email="target@example.com",
        password_hash="hashed",
        role_id=uuid.uuid4(),
        department_id=uuid.uuid4(),
        manager_id=None,
        designation="Engineer",
        phone="+1000000000",
        status=UserStatus.active,
        date_of_exit=None,
    )
    defaults.update(overrides)
    return User(**defaults)


def test_delete_employee_soft_deletes_not_hard_deletes():
    admin = make_current_user("super_admin")
    target = make_target_user()

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = target
    mock_db.query.return_value.filter.return_value.update.return_value = None

    service = EmployeeDirectoryService(db=mock_db, current_user=admin, ip_address="203.0.113.5")
    result = service.delete_employee(employee_id=target.id)

    assert result["success"] is True
    mock_db.delete.assert_not_called()  # never hard-deleted
    assert target.status == UserStatus.terminated  # soft-deleted via status instead
    assert target.date_of_exit is not None

    audit_calls = [c.args[0] for c in mock_db.add.call_args_list if isinstance(c.args[0], AuditLog)]
    assert len(audit_calls) == 1
    assert audit_calls[0].action == "employee.deleted"
    assert audit_calls[0].ip_address == "203.0.113.5"


def test_manager_can_edit_own_phone():
    manager_id = uuid.uuid4()
    manager = make_current_user("manager", user_id=manager_id)
    target = make_target_user(id=manager_id, phone="+1000000000")

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = target

    service = EmployeeProfileService(db=mock_db, current_user=manager)
    with patch.object(
        EmployeeProfileService, "get_employee_profile", return_value={"id": manager_id, "phone": "+1999999999"}
    ):
        result = service.patch_employee_profile(
            employee_id=manager_id,
            payload=EmployeeProfileUpdateRequest(phone="+1999999999"),
        )

    assert target.phone == "+1999999999"
    assert result["phone"] == "+1999999999"


def test_manager_still_forbidden_from_editing_others():
    manager = make_current_user("manager")
    other_id = uuid.uuid4()

    mock_db = MagicMock()
    # No (employee, update) role_permissions grant for manager — RBAC gate in
    # EmployeeProfileService.patch_employee_profile (check_permission) must deny.
    mock_db.query().join().filter().first.return_value = None
    service = EmployeeProfileService(db=mock_db, current_user=manager)
    with pytest.raises(Exception) as exc_info:
        service.patch_employee_profile(
            employee_id=other_id,
            payload=EmployeeProfileUpdateRequest(designation="New Title"),
        )
    assert getattr(exc_info.value, "status_code", None) == 403


def test_role_change_triggers_full_session_revocation():
    hr = make_current_user("hr_admin")
    target = make_target_user()
    new_role_id = uuid.uuid4()

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.side_effect = [target, MagicMock(id=new_role_id)]

    service = EmployeeProfileService(db=mock_db, current_user=hr)
    with patch(
        "app.services.employee_profile_service.logout_all_user_sessions"
    ) as mock_logout_all, patch.object(
        EmployeeProfileService, "get_employee_profile", return_value={"id": target.id}
    ):
        service.patch_employee_profile(
            employee_id=target.id,
            payload=EmployeeProfileUpdateRequest(role_id=new_role_id),
        )
        mock_logout_all.assert_called_once_with(mock_db, target.id)


def test_phone_only_change_does_not_revoke_sessions():
    hr = make_current_user("hr_admin")
    target = make_target_user()

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = target

    service = EmployeeProfileService(db=mock_db, current_user=hr)
    with patch(
        "app.services.employee_profile_service.logout_all_user_sessions"
    ) as mock_logout_all, patch.object(
        EmployeeProfileService, "get_employee_profile", return_value={"id": target.id}
    ):
        service.patch_employee_profile(
            employee_id=target.id,
            payload=EmployeeProfileUpdateRequest(phone="+1888888888"),
        )
        mock_logout_all.assert_not_called()
