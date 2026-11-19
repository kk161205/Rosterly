"""
Document vault storage and download:
files live in Postgres, types are checked from content, downloads follow the
same visibility rule as the list, uploads and deletes are audited.
"""
import io
import secrets
import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import CurrentUser, get_current_user
from app.db.session import Base, get_db
from app.main import app
from app.models.auth import Role, User, UserStatus
from app.models.lifecycle import Document, DocumentFile
from app.models.system import AuditLog

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)
client = TestClient(app)

PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_database():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    for model in (DocumentFile, Document, AuditLog, User, Role):
        db.query(model).delete()
    for name in ("super_admin", "hr_admin", "it_admin", "manager", "employee", "auditor"):
        db.add(Role(id=uuid.uuid4(), name=name, is_system_role=True))
    db.commit()
    db.close()
    yield
    app.dependency_overrides.clear()


def _person(role: str) -> uuid.UUID:
    db = TestingSessionLocal()
    uid = uuid.uuid4()
    db.add(
        User(
            id=uid, employee_code=f"RST-{secrets.token_hex(3)}", full_name=f"{role} person", email=f"{uid.hex[:8]}@example.com",
            password_hash="h", role_id=db.query(Role.id).filter(Role.name == role).scalar(), designation="Staff",
            status=UserStatus.active, date_of_joining=date(2025, 1, 1),
        )
    )
    db.commit()
    db.close()
    return uid


def _as(user_id: uuid.UUID, role: str) -> None:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=user_id, role=role, session_id=uuid.uuid4(), full_name=f"{role} person"
    )


def _upload(employee_id, name="contract.pdf", content=PDF, confidential=False):
    return client.post(
        f"/api/v1/employees/{employee_id}/documents",
        data={"doc_type": "contract", "is_confidential": str(confidential).lower()},
        files={"file": (name, io.BytesIO(content), "application/octet-stream")},
    )


def test_upload_stores_the_file_and_download_returns_it():
    emp = _person("employee")
    _as(emp, "employee")
    res = _upload(emp)
    assert res.status_code == 201, res.text
    doc = res.json()
    assert doc["file_url"] == f"/employees/{emp}/documents/{doc['id']}/download"

    dl = client.get(f"/api/v1{doc['file_url']}")
    assert dl.status_code == 200
    assert dl.content == PDF
    assert dl.headers["content-type"] == "application/pdf"
    assert dl.headers["content-disposition"].startswith("attachment;")
    assert dl.headers["cache-control"] == "no-store"

    db = TestingSessionLocal()
    assert db.query(AuditLog).filter(AuditLog.action == "document.uploaded").count() == 1
    db.close()


@pytest.mark.parametrize(
    ("name", "content"),
    [
        ("fake.pdf", b"<html><script>alert(1)</script></html>"),  # wrong content behind a .pdf name
        ("photo.pdf", PNG),  # real PNG, wrong extension
        ("notes.docx", b"PK\x03\x04"),  # not an allowed type
        ("empty.pdf", b""),
    ],
)
def test_uploads_are_checked_by_content(name, content):
    emp = _person("employee")
    _as(emp, "employee")
    res = _upload(emp, name=name, content=content)
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "file_invalid"


def test_png_with_png_extension_is_accepted():
    emp = _person("employee")
    _as(emp, "employee")
    assert _upload(emp, name="id.png", content=PNG).status_code == 201


def test_download_follows_the_list_rule():
    emp = _person("employee")
    _as(_person("hr_admin"), "hr_admin")
    open_doc = _upload(emp, name="policy.pdf").json()
    secret_doc = _upload(emp, name="salary.pdf", confidential=True).json()

    _as(_person("auditor"), "auditor")
    assert client.get(f"/api/v1{open_doc['file_url']}").status_code == 200
    assert client.get(f"/api/v1{secret_doc['file_url']}").status_code == 404  # hidden, not "forbidden"

    for role in ("manager", "it_admin", "employee"):
        _as(_person(role), role)
        assert client.get(f"/api/v1{open_doc['file_url']}").status_code == 404

    _as(emp, "employee")
    assert client.get(f"/api/v1{secret_doc['file_url']}").status_code == 200  # their own


def test_delete_removes_the_file_and_is_audited():
    emp = _person("employee")
    _as(_person("hr_admin"), "hr_admin")
    doc = _upload(emp).json()
    assert client.delete(f"/api/v1/employees/{emp}/documents/{doc['id']}").status_code == 204
    db = TestingSessionLocal()
    assert db.get(DocumentFile, uuid.UUID(doc["id"])) is None
    assert db.query(AuditLog).filter(AuditLog.action == "document.deleted").count() == 1
    db.close()
    assert client.get(f"/api/v1{doc['file_url']}").status_code == 404


def test_a_document_without_a_stored_file_says_so():
    emp = _person("employee")
    db = TestingSessionLocal()
    doc_id = uuid.uuid4()
    db.add(Document(id=doc_id, employee_id=emp, doc_type="contract", file_name="old.pdf",
                    file_url="/uploads/documents/old.pdf", uploaded_by=emp))
    db.commit()
    db.close()
    _as(emp, "employee")
    res = client.get(f"/api/v1/employees/{emp}/documents/{doc_id}/download")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "file_missing"
