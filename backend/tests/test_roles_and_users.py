"""
Unit & Integration Tests for PRD §5.13 (Role & Permission Management)
and PRD §5.14 (User Management).
Covers:
- 10 endpoints x 6 roles RBAC matrix tests
- Lockout protections (super_admin permissions & self-modification)
- Role deletion guards (system role, user ref, approval chain step ref)
- Non-super_admin limitations (cannot assign or modify super_admin/it_admin)
- User creation (inactive status, email lowercase, employee_code, audit)
- Session revocation on role change, deactivation, and force-logout
- Audit logging with before/after state
"""
from datetime import date, datetime, timezone
import secrets
from unittest.mock import patch
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import CurrentUser, get_current_user, get_password_hash
from app.db.session import Base, get_db
from app.main import app
from app.models.auth import Department, Permission, Role, RolePermission, Session as SessionModel, User, UserStatus
from app.models.lifecycle import Checklist, ChecklistItem, ChecklistItemStatus, ChecklistType
from app.models.requests import ApprovalChainStep, ApprovalChainTemplate, RequestType
from app.models.system import AuditLog

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)

client = TestClient(app)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


# Core seeds for testing
SEED_ROLES = ["super_admin", "hr_admin", "it_admin", "manager", "employee", "auditor"]

PERMISSIONS_MAP = {
    ("role", "read"): ["super_admin"],
    ("role", "create"): ["super_admin"],
    ("role", "update"): ["super_admin"],
    ("role", "delete"): ["super_admin"],
    ("user", "read"): ["super_admin", "hr_admin"],
    ("user", "create"): ["super_admin", "hr_admin"],
    ("user", "update"): ["super_admin", "hr_admin"],
    ("user", "assign_role"): ["super_admin"],
    ("user", "force_logout"): ["super_admin"],
}


@pytest.fixture(autouse=True)
def setup_database():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()

    # Clear tables
    db.query(AuditLog).delete()
    db.query(SessionModel).delete()
    db.query(ChecklistItem).delete()
    db.query(Checklist).delete()
    db.query(ApprovalChainStep).delete()
    db.query(ApprovalChainTemplate).delete()
    db.query(User).delete()
    db.query(RolePermission).delete()
    db.query(Permission).delete()
    db.query(Department).delete()
    db.query(Role).delete()
    db.commit()

    # Seed roles
    role_objs = {}
    for r_name in SEED_ROLES:
        r = Role(id=uuid.uuid4(), name=r_name, description=f"{r_name} role", is_system_role=True)
        db.add(r)
        role_objs[r_name] = r
    db.commit()

    # Seed permissions & grants
    perm_objs = {}
    for (res, act), r_names in PERMISSIONS_MAP.items():
        p = Permission(id=uuid.uuid4(), resource=res, action=act, description=f"{res}:{act}")
        db.add(p)
        perm_objs[(res, act)] = p
        db.flush()
        for rn in r_names:
            db.add(RolePermission(role_id=role_objs[rn].id, permission_id=p.id))
    db.commit()

    # Seed test department
    dept = Department(id=uuid.uuid4(), name="Engineering")
    db.add(dept)
    db.commit()

    db.close()


def set_user(role_name: str, user_id: uuid.UUID = None) -> tuple[CurrentUser, User]:
    db = TestingSessionLocal()
    role = db.query(Role).filter(Role.name == role_name).first()
    uid = user_id or uuid.uuid4()
    user = User(
        id=uid,
        employee_code=f"RST-{secrets.token_hex(2).upper()}",
        full_name=f"User {role_name}",
        email=f"{role_name}_{uid.hex[:4]}@example.com",
        password_hash="fake_hash",
        role_id=role.id,
        status=UserStatus.active,
        designation="Staff",
        date_of_joining=date(2025, 1, 1),
    )
    db.add(user)
    db.commit()

    curr_user = CurrentUser(
        user_id=uid,
        role=role_name,
        session_id=uuid.uuid4(),
        email=user.email,
        full_name=user.full_name,
        role_id=role.id,
    )
    app.dependency_overrides[get_current_user] = lambda: curr_user
    db.close()
    return curr_user, user


# ==============================================================================
# 1. 10 Endpoints x 6 Roles Access Matrix Tests
# ==============================================================================

def test_roles_get_roles_access_matrix():
    """GET /api/v1/roles is super_admin only; all other 5 roles get 403."""
    for r in SEED_ROLES:
        set_user(r)
        res = client.get("/api/v1/roles")
        if r == "super_admin":
            assert res.status_code == 200, f"Expected 200 for {r}, got {res.status_code}"
            assert isinstance(res.json(), list)
            assert len(res.json()) >= 6
            # Assert user_count field is present
            assert "user_count" in res.json()[0]
        else:
            assert res.status_code == 403, f"Expected 403 for {r}, got {res.status_code}"


def test_roles_post_role_access_matrix():
    """POST /api/v1/roles is super_admin only; all other 5 roles get 403."""
    payload = {"name": "SecurityOfficer", "description": "Custom role"}
    for r in SEED_ROLES:
        set_user(r)
        payload["name"] = f"Sec_{r}"
        res = client.post("/api/v1/roles", json=payload)
        if r == "super_admin":
            assert res.status_code == 201
            assert res.json()["name"] == f"Sec_{r}"
            assert res.json()["is_system_role"] is False
        else:
            assert res.status_code == 403


def test_roles_get_permissions_access_matrix():
    """GET /api/v1/roles/{id}/permissions is super_admin only."""
    db = TestingSessionLocal()
    target_role = db.query(Role).first()
    db.close()

    for r in SEED_ROLES:
        set_user(r)
        res = client.get(f"/api/v1/roles/{target_role.id}/permissions")
        if r == "super_admin":
            assert res.status_code == 200
            assert "permissions" in res.json()
        else:
            assert res.status_code == 403


def test_roles_put_permissions_access_matrix():
    """PUT /api/v1/roles/{id}/permissions is super_admin only."""
    db = TestingSessionLocal()
    # Create custom role to test
    custom_role = Role(id=uuid.uuid4(), name="TempRole", is_system_role=False)
    db.add(custom_role)
    db.commit()
    target_id = custom_role.id
    db.close()

    for r in SEED_ROLES:
        set_user(r)
        res = client.put(f"/api/v1/roles/{target_id}/permissions", json={"permission_ids": []})
        if r == "super_admin":
            assert res.status_code == 200
        else:
            assert res.status_code == 403


def test_roles_delete_role_access_matrix():
    """DELETE /api/v1/roles/{id} is super_admin only."""
    db = TestingSessionLocal()
    custom_role = Role(id=uuid.uuid4(), name="DeleteTestRole", is_system_role=False)
    db.add(custom_role)
    db.commit()
    target_id = custom_role.id
    db.close()

    for r in ["hr_admin", "it_admin", "manager", "employee", "auditor"]:
        set_user(r)
        res = client.delete(f"/api/v1/roles/{target_id}")
        assert res.status_code == 403

    set_user("super_admin")
    res = client.delete(f"/api/v1/roles/{target_id}")
    assert res.status_code == 204


def test_users_get_users_access_matrix():
    """GET /api/v1/users allows super_admin and hr_admin; others get 403."""
    for r in SEED_ROLES:
        set_user(r)
        res = client.get("/api/v1/users")
        if r in ("super_admin", "hr_admin"):
            assert res.status_code == 200
            assert "items" in res.json()
        else:
            assert res.status_code == 403


def test_users_post_user_access_matrix():
    """POST /api/v1/users allows super_admin and hr_admin; others get 403."""
    db = TestingSessionLocal()
    emp_role = db.query(Role).filter(Role.name == "employee").first()
    db.close()

    for r in SEED_ROLES:
        set_user(r)
        payload = {
            "full_name": f"New User {r}",
            "email": f"new_{r}@example.com",
            "role_id": str(emp_role.id),
        }
        res = client.post("/api/v1/users", json=payload)
        if r in ("super_admin", "hr_admin"):
            assert res.status_code == 201
        else:
            assert res.status_code == 403


def test_users_patch_role_access_matrix():
    """PATCH /api/v1/users/{id}/role is super_admin only."""
    db = TestingSessionLocal()
    emp_role = db.query(Role).filter(Role.name == "employee").first()
    mgr_role = db.query(Role).filter(Role.name == "manager").first()
    target_user = User(
        id=uuid.uuid4(),
        employee_code="RST-TARG",
        full_name="Target User",
        email="target@example.com",
        password_hash="hash",
        role_id=emp_role.id,
        status=UserStatus.active,
        designation="Dev",
    )
    db.add(target_user)
    db.commit()
    target_id = target_user.id
    mgr_role_id = mgr_role.id
    db.close()

    for r in ["hr_admin", "it_admin", "manager", "employee", "auditor"]:
        set_user(r)
        res = client.patch(f"/api/v1/users/{target_id}/role", json={"role_id": str(mgr_role_id)})
        assert res.status_code == 403

    set_user("super_admin")
    res = client.patch(f"/api/v1/users/{target_id}/role", json={"role_id": str(mgr_role_id)})
    assert res.status_code == 200
    assert res.json()["role_name"] == "manager"


def test_users_patch_status_access_matrix():
    """PATCH /api/v1/users/{id}/status allows super_admin and hr_admin (for non-admin users); others get 403."""
    db = TestingSessionLocal()
    emp_role = db.query(Role).filter(Role.name == "employee").first()
    target_user = User(
        id=uuid.uuid4(),
        employee_code="RST-STAT",
        full_name="Status Target",
        email="status_target@example.com",
        password_hash="hash",
        role_id=emp_role.id,
        status=UserStatus.active,
        designation="Dev",
    )
    db.add(target_user)
    db.commit()
    target_id = target_user.id
    db.close()

    for r in ["it_admin", "manager", "employee", "auditor"]:
        set_user(r)
        res = client.patch(f"/api/v1/users/{target_id}/status", json={"status": "inactive"})
        assert res.status_code == 403

    set_user("hr_admin")
    res = client.patch(f"/api/v1/users/{target_id}/status", json={"status": "inactive"})
    assert res.status_code == 200
    assert res.json()["status"] == "inactive"

    set_user("super_admin")
    res = client.patch(f"/api/v1/users/{target_id}/status", json={"status": "active"})
    assert res.status_code == 200
    assert res.json()["status"] == "active"


def test_users_force_logout_access_matrix():
    """POST /api/v1/users/{id}/force-logout is super_admin only."""
    db = TestingSessionLocal()
    emp_role = db.query(Role).filter(Role.name == "employee").first()
    target_user = User(
        id=uuid.uuid4(),
        employee_code="RST-FLOG",
        full_name="Logout Target",
        email="logout_target@example.com",
        password_hash="hash",
        role_id=emp_role.id,
        status=UserStatus.active,
        designation="Dev",
    )
    db.add(target_user)
    db.commit()
    target_id = target_user.id
    db.close()

    for r in ["hr_admin", "it_admin", "manager", "employee", "auditor"]:
        set_user(r)
        res = client.post(f"/api/v1/users/{target_id}/force-logout")
        assert res.status_code == 403

    set_user("super_admin")
    res = client.post(f"/api/v1/users/{target_id}/force-logout")
    assert res.status_code == 200
    assert "revoked" in res.json()["message"]


# ==============================================================================
# 2. PRD 5.13 Role & Permission Detailed Rules
# ==============================================================================

def test_post_role_duplicate_name_rejected_409():
    """POST /roles: name unique (409 Conflict on duplicate)."""
    set_user("super_admin")
    res1 = client.post("/api/v1/roles", json={"name": "DuplicateRole", "description": "Desc"})
    assert res1.status_code == 201

    res2 = client.post("/api/v1/roles", json={"name": "DuplicateRole", "description": "Other"})
    assert res2.status_code == 409
    assert res2.json()["error"]["code"] == "conflict"


def test_put_permissions_lockout_protection():
    """Lockout protection: reject change that removes super_admin's core role/user permissions."""
    set_user("super_admin")
    db = TestingSessionLocal()
    sa_role = db.query(Role).filter(Role.name == "super_admin").first()
    # Find one non-core permission or empty list
    db.close()

    # Attempting to set empty list for super_admin must be rejected
    res = client.put(f"/api/v1/roles/{sa_role.id}/permissions", json={"permission_ids": []})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "lockout_protection"
    assert "cannot remove core role or user management permissions" in res.json()["error"]["message"]


def test_put_permissions_allows_empty_list_for_non_super_admin():
    """Non-super_admin roles are allowed to have an empty permission list."""
    set_user("super_admin")
    db = TestingSessionLocal()
    custom_role = Role(id=uuid.uuid4(), name="EmptyPermRole", is_system_role=False)
    db.add(custom_role)
    db.commit()
    target_id = custom_role.id
    db.close()

    res = client.put(f"/api/v1/roles/{target_id}/permissions", json={"permission_ids": []})
    assert res.status_code == 200
    assert res.json()["permissions"] == []


def test_put_permissions_invalid_permission_id_rejected():
    """PUT /roles/{id}/permissions: rejects nonexistent permission IDs."""
    set_user("super_admin")
    db = TestingSessionLocal()
    custom_role = Role(id=uuid.uuid4(), name="InvalidPermRole", is_system_role=False)
    db.add(custom_role)
    db.commit()
    target_id = custom_role.id
    db.close()

    fake_id = str(uuid.uuid4())
    res = client.put(f"/api/v1/roles/{target_id}/permissions", json={"permission_ids": [fake_id]})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "invalid_permission_ids"


def test_put_permissions_atomic_replace_writes_audit_log():
    """PUT /roles/{id}/permissions writes before and after state to audit_logs."""
    set_user("super_admin")
    db = TestingSessionLocal()
    custom_role = Role(id=uuid.uuid4(), name="AuditPermRole", is_system_role=False)
    db.add(custom_role)
    db.flush()
    perm1 = db.query(Permission).filter(Permission.resource == "role", Permission.action == "read").first()
    perm2 = db.query(Permission).filter(Permission.resource == "user", Permission.action == "read").first()
    # Add initial grant
    db.add(RolePermission(role_id=custom_role.id, permission_id=perm1.id))
    db.commit()
    target_id = custom_role.id
    perm2_id = perm2.id
    db.close()

    res = client.put(f"/api/v1/roles/{target_id}/permissions", json={"permission_ids": [str(perm2_id)]})
    assert res.status_code == 200
    assert len(res.json()["permissions"]) == 1
    assert res.json()["permissions"][0]["id"] == str(perm2_id)

    # Verify audit log
    db = TestingSessionLocal()
    log = (
        db.query(AuditLog)
        .filter(AuditLog.entity_id == target_id, AuditLog.action == "role.permissions_updated")
        .first()
    )
    assert log is not None
    assert "role:read" in log.before_state["permissions"]
    assert "user:read" in log.after_state["permissions"]
    db.close()


def test_delete_role_blocked_for_system_role():
    """DELETE /roles/{id}: 409 Conflict if is_system_role is True."""
    set_user("super_admin")
    db = TestingSessionLocal()
    sa_role = db.query(Role).filter(Role.name == "super_admin").first()
    db.close()

    res = client.delete(f"/api/v1/roles/{sa_role.id}")
    assert res.status_code == 409
    assert "System roles cannot be deleted" in res.json()["error"]["message"]


def test_delete_role_blocked_if_user_references_it():
    """DELETE /roles/{id}: 409 Conflict if any user references the role."""
    set_user("super_admin")
    db = TestingSessionLocal()
    custom_role = Role(id=uuid.uuid4(), name="InUseRole", is_system_role=False)
    db.add(custom_role)
    db.flush()
    user = User(
        id=uuid.uuid4(),
        employee_code="RST-INUSE",
        full_name="In Use User",
        email="inuse@example.com",
        password_hash="hash",
        role_id=custom_role.id,
        status=UserStatus.active,
        designation="Dev",
    )
    db.add(user)
    db.commit()
    target_id = custom_role.id
    db.close()

    res = client.delete(f"/api/v1/roles/{target_id}")
    assert res.status_code == 409
    assert "referenced by 1 user" in res.json()["error"]["message"]


def test_delete_role_blocked_if_approval_chain_step_references_it():
    """DELETE /roles/{id}: 409 Conflict if referenced by approval_chain_steps."""
    set_user("super_admin")
    db = TestingSessionLocal()
    custom_role = Role(id=uuid.uuid4(), name="StepRole", is_system_role=False)
    db.add(custom_role)
    db.flush()
    template = ApprovalChainTemplate(
        id=uuid.uuid4(),
        request_type=RequestType.it_ticket,
        name="Test Chain",
        is_active=True,
    )
    db.add(template)
    db.flush()
    step = ApprovalChainStep(
        id=uuid.uuid4(),
        template_id=template.id,
        step_order=1,
        approver_role_id=custom_role.id,
    )
    db.add(step)
    db.commit()
    target_id = custom_role.id
    db.close()

    res = client.delete(f"/api/v1/roles/{target_id}")
    assert res.status_code == 409
    assert "referenced by 1 approval chain step" in res.json()["error"]["message"]


def test_delete_role_blocked_if_checklist_item_references_it():
    """DELETE /roles/{id}: 409 Conflict if referenced by checklist_items."""
    set_user("super_admin")
    db = TestingSessionLocal()
    custom_role = Role(id=uuid.uuid4(), name="ChecklistRole", is_system_role=False)
    db.add(custom_role)
    db.flush()
    emp_role = db.query(Role).filter(Role.name == "employee").first()
    emp = User(
        id=uuid.uuid4(),
        employee_code="RST-CHKLST",
        full_name="Checklist User",
        email="chk@example.com",
        password_hash="h",
        role_id=emp_role.id,
        status=UserStatus.active,
        designation="Dev",
    )
    db.add(emp)
    db.flush()
    cl = Checklist(id=uuid.uuid4(), employee_id=emp.id, type=ChecklistType.onboarding)
    db.add(cl)
    db.flush()
    item = ChecklistItem(
        id=uuid.uuid4(),
        checklist_id=cl.id,
        task_name="Task",
        owner_role_id=custom_role.id,
    )
    db.add(item)
    db.commit()
    target_id = custom_role.id
    db.close()

    res = client.delete(f"/api/v1/roles/{target_id}")
    assert res.status_code == 409
    assert "checklist item" in res.json()["error"]["message"]


# ==============================================================================
# 3. PRD 5.14 User Management Detailed Rules
# ==============================================================================

def test_hr_admin_cannot_assign_super_admin_or_it_admin_on_post():
    """hr_admin gets 403 Forbidden if role_id resolves to super_admin or it_admin."""
    set_user("hr_admin")
    db = TestingSessionLocal()
    sa_role = db.query(Role).filter(Role.name == "super_admin").first()
    it_role = db.query(Role).filter(Role.name == "it_admin").first()
    db.close()

    # Attempt super_admin
    res1 = client.post(
        "/api/v1/users",
        json={"full_name": "Try SA", "email": "sa_try@example.com", "role_id": str(sa_role.id)},
    )
    assert res1.status_code == 403
    assert "super_admin" in res1.json()["error"]["message"]

    # Attempt it_admin
    res2 = client.post(
        "/api/v1/users",
        json={"full_name": "Try IT", "email": "it_try@example.com", "role_id": str(it_role.id)},
    )
    assert res2.status_code == 403
    assert "it_admin" in res2.json()["error"]["message"]


def test_post_user_success_fills_defaults_and_inactive_status():
    """POST /users creates inactive user, lowercases email, generates employee_code."""
    set_user("hr_admin")
    db = TestingSessionLocal()
    emp_role = db.query(Role).filter(Role.name == "employee").first()
    dept = db.query(Department).first()
    db.close()

    payload = {
        "full_name": "Alice Wonder",
        "email": "ALICE.Wonder@Example.COM",
        "role_id": str(emp_role.id),
        "department_id": str(dept.id),
    }
    res = client.post("/api/v1/users", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["email"] == "alice.wonder@example.com"
    assert data["status"] == "inactive"
    assert data["designation"] == "Employee"
    assert data["employee_code"].startswith("RST-")
    assert "password_hash" not in data

    # Verify audit log
    db = TestingSessionLocal()
    log = db.query(AuditLog).filter(AuditLog.entity_id == uuid.UUID(data["id"])).first()
    assert log is not None
    assert log.action == "user.created"
    assert log.after_state["status"] == "inactive"
    db.close()


def test_get_assignable_roles():
    """GET /users/assignable-roles filters out super_admin and it_admin for hr_admin."""
    set_user("hr_admin")
    res_hr = client.get("/api/v1/users/assignable-roles")
    assert res_hr.status_code == 200
    hr_roles = [r["name"] for r in res_hr.json()]
    assert "super_admin" not in hr_roles
    assert "it_admin" not in hr_roles
    assert "employee" in hr_roles
    assert "manager" in hr_roles

    set_user("super_admin")
    res_sa = client.get("/api/v1/users/assignable-roles")
    assert res_sa.status_code == 200
    sa_roles = [r["name"] for r in res_sa.json()]
    assert "super_admin" in sa_roles
    assert "it_admin" in sa_roles


def test_patch_user_role_self_change_rejected():
    """PATCH /users/{id}/role: rejects changing your own role (prevents self-lockout)."""
    curr_user, _ = set_user("super_admin")
    db = TestingSessionLocal()
    emp_role = db.query(Role).filter(Role.name == "employee").first()
    db.close()

    res = client.patch(
        f"/api/v1/users/{curr_user.user_id}/role",
        json={"role_id": str(emp_role.id)},
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "self_role_change_rejected"


def test_patch_user_role_revokes_sessions_and_writes_audit():
    """PATCH /users/{id}/role revokes active sessions and writes audit log."""
    set_user("super_admin")
    db = TestingSessionLocal()
    emp_role = db.query(Role).filter(Role.name == "employee").first()
    mgr_role = db.query(Role).filter(Role.name == "manager").first()
    target_user = User(
        id=uuid.uuid4(),
        employee_code="RST-SESS",
        full_name="Session User",
        email="sess@example.com",
        password_hash="h",
        role_id=emp_role.id,
        status=UserStatus.active,
        designation="Dev",
    )
    db.add(target_user)
    db.flush()
    # Add active session
    active_session = SessionModel(
        id=uuid.uuid4(),
        user_id=target_user.id,
        refresh_token_hash="hash",
        access_token_jti=str(uuid.uuid4()),
        expires_at=datetime.now(timezone.utc),
    )
    db.add(active_session)
    db.commit()
    target_id = target_user.id
    mgr_role_id = mgr_role.id
    db.close()

    res = client.patch(
        f"/api/v1/users/{target_id}/role",
        json={"role_id": str(mgr_role_id)},
    )
    assert res.status_code == 200
    assert res.json()["role_name"] == "manager"

    # Verify session revocation
    db = TestingSessionLocal()
    sess = db.query(SessionModel).filter(SessionModel.user_id == target_id).first()
    assert sess.revoked_at is not None

    # Verify audit log
    log = db.query(AuditLog).filter(AuditLog.entity_id == target_id, AuditLog.action == "user.role_changed").first()
    assert log is not None
    assert log.before_state["role_name"] == "employee"
    assert log.after_state["role_name"] == "manager"
    db.close()


def test_patch_user_status_validation_and_guards():
    """
    PATCH /users/{id}/status:
    - Accepts only active/inactive.
    - Nobody may deactivate themselves.
    - Never reactivates terminated or offboarding users.
    - hr_admin cannot change status of super_admin or it_admin.
    - Setting inactive revokes sessions.
    """
    curr_sa, _ = set_user("super_admin")
    db = TestingSessionLocal()
    sa_role = db.query(Role).filter(Role.name == "super_admin").first()
    it_role = db.query(Role).filter(Role.name == "it_admin").first()
    emp_role = db.query(Role).filter(Role.name == "employee").first()

    it_user = User(
        id=uuid.uuid4(),
        employee_code="RST-IT01",
        full_name="IT Admin",
        email="it@example.com",
        password_hash="h",
        role_id=it_role.id,
        status=UserStatus.active,
        designation="IT",
    )
    term_user = User(
        id=uuid.uuid4(),
        employee_code="RST-TRM",
        full_name="Terminated User",
        email="trm@example.com",
        password_hash="h",
        role_id=emp_role.id,
        status=UserStatus.terminated,
        designation="Former",
    )
    offboard_user = User(
        id=uuid.uuid4(),
        employee_code="RST-OFF",
        full_name="Offboarding User",
        email="off@example.com",
        password_hash="h",
        role_id=emp_role.id,
        status=UserStatus.offboarding,
        designation="Staff",
    )
    active_emp = User(
        id=uuid.uuid4(),
        employee_code="RST-ACT",
        full_name="Active Emp",
        email="act@example.com",
        password_hash="h",
        role_id=emp_role.id,
        status=UserStatus.active,
        designation="Staff",
    )
    db.add_all([it_user, term_user, offboard_user, active_emp])
    db.flush()
    # Add active session for active_emp
    active_sess = SessionModel(
        id=uuid.uuid4(),
        user_id=active_emp.id,
        refresh_token_hash="hash",
        access_token_jti=str(uuid.uuid4()),
        expires_at=datetime.now(timezone.utc),
    )
    db.add(active_sess)
    db.commit()

    it_user_id = it_user.id
    term_user_id = term_user.id
    offboard_user_id = offboard_user.id
    active_emp_id = active_emp.id
    db.close()

    # 1. Invalid status value rejected
    res = client.patch(f"/api/v1/users/{active_emp_id}/status", json={"status": "terminated"})
    assert res.status_code == 400
    assert "Status must be" in res.json()["error"]["message"] or "active" in res.json()["error"]["message"]

    # 2. Self deactivation rejected
    res = client.patch(f"/api/v1/users/{curr_sa.user_id}/status", json={"status": "inactive"})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "self_deactivation_rejected"

    # 3. Cannot reactivate terminated user
    res = client.patch(f"/api/v1/users/{term_user_id}/status", json={"status": "active"})
    assert res.status_code == 400
    assert "terminated" in res.json()["error"]["message"]

    # 4. Cannot reactivate offboarding user
    res = client.patch(f"/api/v1/users/{offboard_user_id}/status", json={"status": "active"})
    assert res.status_code == 400
    assert "offboarding" in res.json()["error"]["message"]

    # 5. hr_admin cannot modify status of it_admin or super_admin
    set_user("hr_admin")
    res = client.patch(f"/api/v1/users/{it_user_id}/status", json={"status": "inactive"})
    assert res.status_code == 403

    # 6. Deactivating active_emp revokes active sessions
    res = client.patch(f"/api/v1/users/{active_emp_id}/status", json={"status": "inactive"})
    assert res.status_code == 200
    assert res.json()["status"] == "inactive"

    db = TestingSessionLocal()
    sess = db.query(SessionModel).filter(SessionModel.user_id == active_emp_id).first()
    assert sess.revoked_at is not None
    db.close()


def test_force_logout_unknown_user_404_and_success_revocation():
    """POST /users/{id}/force-logout: 404 for unknown user, revokes sessions on success."""
    set_user("super_admin")
    fake_id = uuid.uuid4()
    res404 = client.post(f"/api/v1/users/{fake_id}/force-logout")
    assert res404.status_code == 404

    db = TestingSessionLocal()
    emp_role = db.query(Role).filter(Role.name == "employee").first()
    target_user = User(
        id=uuid.uuid4(),
        employee_code="RST-FLOG2",
        full_name="Logout User 2",
        email="logout2@example.com",
        password_hash="h",
        role_id=emp_role.id,
        status=UserStatus.active,
        designation="Dev",
    )
    db.add(target_user)
    db.flush()
    sess1 = SessionModel(
        id=uuid.uuid4(),
        user_id=target_user.id,
        refresh_token_hash="hash",
        access_token_jti=str(uuid.uuid4()),
        expires_at=datetime.now(timezone.utc),
    )
    sess2 = SessionModel(
        id=uuid.uuid4(),
        user_id=target_user.id,
        refresh_token_hash="hash",
        access_token_jti=str(uuid.uuid4()),
        expires_at=datetime.now(timezone.utc),
    )
    db.add_all([sess1, sess2])
    db.commit()
    target_id = target_user.id
    db.close()

    res = client.post(f"/api/v1/users/{target_id}/force-logout")
    assert res.status_code == 200

    db = TestingSessionLocal()
    active_count = (
        db.query(SessionModel)
        .filter(SessionModel.user_id == target_id, SessionModel.revoked_at.is_(None))
        .count()
    )
    assert active_count == 0

    log = db.query(AuditLog).filter(AuditLog.entity_id == target_id, AuditLog.action == "user.force_logout").first()
    assert log is not None
    assert log.after_state["revoked_sessions_count"] == 2
    db.close()


def test_get_users_search_filter_and_last_login():
    """GET /users: search by name/code, filter by role/status, pagination and last_login_at."""
    set_user("super_admin")
    db = TestingSessionLocal()
    emp_role = db.query(Role).filter(Role.name == "employee").first()
    mgr_role = db.query(Role).filter(Role.name == "manager").first()

    now = datetime.now(timezone.utc)
    u1 = User(
        id=uuid.uuid4(),
        employee_code="RST-FIND1",
        full_name="Searchable Developer",
        email="dev_find@example.com",
        password_hash="h",
        role_id=emp_role.id,
        status=UserStatus.active,
        designation="Lead Engineer",
        last_login_at=now,
    )
    u2 = User(
        id=uuid.uuid4(),
        employee_code="RST-FIND2",
        full_name="Searchable Manager",
        email="mgr_find@example.com",
        password_hash="h",
        role_id=mgr_role.id,
        status=UserStatus.inactive,
        designation="Engineering Lead",
    )
    db.add_all([u1, u2])
    db.commit()
    mgr_role_id = mgr_role.id
    db.close()

    # Search by full_name
    res_search = client.get("/api/v1/users?search=Searchable Developer")
    assert res_search.status_code == 200
    assert res_search.json()["total"] >= 1
    found = [x for x in res_search.json()["items"] if x["employee_code"] == "RST-FIND1"]
    assert len(found) == 1
    assert found[0]["last_login_at"] is not None

    # Filter by role_id
    res_role = client.get(f"/api/v1/users?role_id={mgr_role_id}")
    assert res_role.status_code == 200
    for it in res_role.json()["items"]:
        assert it["role_id"] == str(mgr_role_id)

    # Filter by status
    res_status = client.get("/api/v1/users?status=inactive")
    assert res_status.status_code == 200
    for it in res_status.json()["items"]:
        assert it["status"] == "inactive"
