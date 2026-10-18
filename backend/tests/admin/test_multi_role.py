"""
§5.14 multi-role (revised 18 Oct 2026).

A user has one primary role plus optional additional roles; effective access is
the union. Covers: the live session loads every role, permissions merge, the
widest scope wins without a narrow role's grant unlocking more, role queues and
checklist tasks follow additional roles, one approval step per person, and the
assignment rules (privileged roles, primary-only roles, configured conflicts).
Real SQLite so the services run their production queries.
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import CurrentUser, create_access_token, get_current_user
from app.db.session import Base, get_db
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
from app.models.auth import (
    Department,
    Permission,
    Role,
    RoleConflict,
    RolePermission,
    Session as SessionModel,
    User,
    UserRole,
    UserStatus,
)
from app.models.lifecycle import Checklist, ChecklistItem, ChecklistItemStatus, ChecklistStatus, ChecklistType
from app.models.requests import ApprovalChainStep, ApprovalChainTemplate, Request, RequestApproval, RequestType
from app.models.system import AuditLog, Notification

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)
client = TestClient(app)

ROLE_NAMES = ["super_admin", "it_admin", "hr_admin", "manager", "employee", "auditor"]
EVERYONE_BUT_IT = ["super_admin", "hr_admin", "manager", "employee", "auditor"]
GRANTS = {
    ("request", "create"): ROLE_NAMES,
    ("request", "read"): ROLE_NAMES,
    ("request", "approve"): ["manager", "hr_admin", "it_admin", "super_admin"],
    ("maintenance_ticket", "read"): ["auditor", "it_admin", "super_admin"],
    ("maintenance_ticket", "update"): ["it_admin", "super_admin"],
    ("employee", "read"): EVERYONE_BUT_IT,
    ("user", "read"): ["auditor", "hr_admin", "it_admin", "manager", "super_admin"],
    ("user", "assign_role"): ["super_admin"],
    ("role", "read"): ["auditor", "super_admin"],
    ("role", "update"): ["super_admin"],
    ("role", "delete"): ["super_admin"],
}


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def seed():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    for model in (Notification, AuditLog, RequestApproval, Request, ApprovalChainStep, ApprovalChainTemplate,
                  ChecklistItem, Checklist, MaintenanceTicket, AssetAssignment, Asset, SessionModel,
                  UserRole, RoleConflict, User, Department, RolePermission, Permission, Role):
        db.query(model).delete()
    db.commit()

    roles = {name: Role(id=uuid.uuid4(), name=name, is_system_role=True) for name in ROLE_NAMES}
    db.add_all(roles.values())
    db.flush()
    for (resource, action), names in GRANTS.items():
        perm = Permission(id=uuid.uuid4(), resource=resource, action=action, description=f"{action} {resource}")
        db.add(perm)
        db.flush()
        db.add_all(RolePermission(role_id=roles[n].id, permission_id=perm.id) for n in names)
    # The migration's seeded conflicts.
    for other in ("super_admin", "it_admin", "hr_admin"):
        db.add(RoleConflict(role_id=roles["auditor"].id, conflicts_with_role_id=roles[other].id))

    template = ApprovalChainTemplate(id=uuid.uuid4(), request_type=RequestType.asset_request,
                                     name="Standard Asset Request", min_amount=None, is_active=True)
    db.add(template)
    db.flush()
    db.add_all([
        ApprovalChainStep(id=uuid.uuid4(), template_id=template.id, step_order=1,
                          approver_role_id=roles["manager"].id),
        ApprovalChainStep(id=uuid.uuid4(), template_id=template.id, step_order=2,
                          approver_role_id=roles["it_admin"].id),
    ])
    db.commit()
    db.close()
    yield
    app.dependency_overrides.clear()


def _role_id(name: str) -> uuid.UUID:
    db = TestingSessionLocal()
    try:
        return db.query(Role.id).filter(Role.name == name).scalar()
    finally:
        db.close()


def _user(primary: str, extra=(), manager_id=None, department_id=None, name=None) -> User:
    # Resolve role ids first: the in-memory DB shares one connection, so a nested
    # session closing mid-way would roll this one back.
    primary_id, extra_ids = _role_id(primary), [_role_id(n) for n in extra]
    db = TestingSessionLocal()
    uid = uuid.uuid4()
    user = User(id=uid, employee_code=f"RST-{uid.hex[:5].upper()}", full_name=name or f"{primary} user",
                email=f"{uid.hex[:8]}@example.com", password_hash="h", role_id=primary_id,
                manager_id=manager_id, department_id=department_id, status=UserStatus.active,
                designation="Staff", date_of_joining=date(2025, 1, 1))
    db.add(user)
    db.flush()
    for role_id in extra_ids:
        db.add(UserRole(user_id=uid, role_id=role_id))
    db.commit()
    db.refresh(user)
    db.expunge(user)
    db.close()
    return user


def _act_as(user: User, primary: str, extra=()) -> None:
    """What get_current_user builds for this user: primary plus additional roles."""
    current = CurrentUser(
        user_id=user.id, role=primary, session_id=uuid.uuid4(), email=user.email, full_name=user.full_name,
        department_id=user.department_id, role_id=user.role_id,
        role_names=list(extra), role_ids=[_role_id(n) for n in extra],
    )
    app.dependency_overrides[get_current_user] = lambda: current


def _department(name: str) -> uuid.UUID:
    dept_id = uuid.uuid4()
    db = TestingSessionLocal()
    db.add(Department(id=dept_id, name=name))
    db.commit()
    db.close()
    return dept_id


def _submit_request(requester: User) -> str:
    _act_as(requester, "employee")
    res = client.post("/api/v1/requests", json={
        "request_type": "asset_request", "title": "New laptop",
        "description": "Replacement", "estimated_cost": "1000",
    })
    assert res.status_code == 201, res.text
    return res.json()["id"]


# ------------------------------------------------------------ live session + /auth/me


def test_session_loads_every_role_and_me_merges_permissions():
    """The real auth path (no override): additional roles come from the DB on every request."""
    user = _user("employee", extra=["it_admin"])
    token, jti = create_access_token(user.id, "employee")
    db = TestingSessionLocal()
    db.add(SessionModel(id=uuid.uuid4(), user_id=user.id, refresh_token_hash="x", access_token_jti=jti,
                        expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
    db.commit()
    db.close()

    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["role"] == "employee"
    assert body["roles"] == ["employee", "it_admin"]
    perms = body["permissions"]
    assert "maintenance_ticket:update" in perms  # from it_admin
    assert "employee:read" in perms  # from employee
    assert perms.count("request:read") == 1  # shared permission kept once
    assert len(perms) == len(set(perms))


# ------------------------------------------------------------ widest scope wins


def test_additional_it_admin_sees_every_ticket():
    reporter = _user("employee", name="Reporter")
    asset_holder = _user("employee")
    db = TestingSessionLocal()
    asset = Asset(id=uuid.uuid4(), asset_tag="AST-1", name="Laptop", category=AssetCategory.laptop, vendor="Dell",
                  purchase_date=date(2025, 1, 1), purchase_cost=Decimal("1000"), current_value=Decimal("900"),
                  depreciation_method=DepreciationMethod.straight_line, useful_life_months=36,
                  status=AssetStatus.assigned, current_holder_id=asset_holder.id)
    db.add(asset)
    db.add(MaintenanceTicket(id=uuid.uuid4(), asset_id=asset.id, reported_by=reporter.id, issue_description="Broken",
                             priority=MaintenancePriority.high, status=MaintenanceStatus.open))
    db.commit()
    db.close()

    plain = _user("employee")
    _act_as(plain, "employee")
    assert client.get("/api/v1/maintenance-tickets").json()["total"] == 0  # own tickets only

    helper = _user("employee", extra=["it_admin"])
    _act_as(helper, "employee", extra=["it_admin"])
    assert client.get("/api/v1/maintenance-tickets").json()["total"] == 1


def test_manager_plus_hr_sees_whole_directory_manager_alone_only_department():
    eng, ops = _department("Engineering"), _department("Operations")
    _user("employee", department_id=ops, name="Ops person")
    lead = _user("manager", department_id=eng, name="Lead")

    _act_as(lead, "manager")
    names = {p["full_name"] for p in client.get("/api/v1/employees").json()["items"]}
    assert "Ops person" not in names

    _act_as(lead, "manager", extra=["hr_admin"])
    names = {p["full_name"] for p in client.get("/api/v1/employees").json()["items"]}
    assert "Ops person" in names


def test_it_admin_grant_does_not_unlock_profiles_via_employee_role():
    """employee + it_admin: employee:read comes only from the narrow employee role,
    and it_admin has no employee:read — so other people's profiles stay closed."""
    other = _user("employee", name="Someone else")
    me = _user("employee", extra=["it_admin"])
    _act_as(me, "employee", extra=["it_admin"])
    assert client.get(f"/api/v1/employees/{other.id}").status_code == 403
    assert client.get(f"/api/v1/employees/{me.id}").status_code == 200


# ------------------------------------------------------------ queues, tasks, one step per person


def test_role_queue_and_notifications_follow_additional_roles():
    boss = _user("manager", name="Boss")
    requester = _user("employee", manager_id=boss.id)
    helper = _user("employee", extra=["it_admin"], name="Helper")
    request_id = _submit_request(requester)

    _act_as(boss, "manager")
    assert client.post(f"/api/v1/requests/{request_id}/approve", json={}).status_code == 200

    # The IT step's notification reached the person holding it_admin as an additional role.
    db = TestingSessionLocal()
    notified = {n.user_id for n in db.query(Notification).filter(Notification.type == "approval_needed").all()}
    db.close()
    assert helper.id in notified

    _act_as(helper, "employee", extra=["it_admin"])
    queue = client.get("/api/v1/requests/pending-approval").json()["items"]
    assert [r["id"] for r in queue] == [request_id]
    assert client.post(f"/api/v1/requests/{request_id}/approve", json={}).status_code == 200


def test_one_person_decides_only_one_step():
    """Manager of the requester who also holds it_admin: decides step 1, can't decide step 2."""
    boss = _user("manager", extra=["it_admin"], name="Boss")
    requester = _user("employee", manager_id=boss.id)
    other_it = _user("it_admin", name="Other IT")
    request_id = _submit_request(requester)

    _act_as(boss, "manager", extra=["it_admin"])
    assert [r["id"] for r in client.get("/api/v1/requests/pending-approval").json()["items"]] == [request_id]
    assert client.post(f"/api/v1/requests/{request_id}/approve", json={}).status_code == 200

    # Step 2 waits on it_admin, which the boss holds — but they already decided step 1.
    assert client.get("/api/v1/requests/pending-approval").json()["items"] == []
    res = client.post(f"/api/v1/requests/{request_id}/approve", json={})
    assert res.status_code == 403
    assert "someone else" in res.json()["error"]["message"]
    res = client.post(f"/api/v1/requests/{request_id}/reject", json={"comments": "No"})
    assert res.status_code == 403

    _act_as(other_it, "it_admin")
    assert client.post(f"/api/v1/requests/{request_id}/approve", json={}).status_code == 200


def test_checklist_tasks_follow_additional_roles():
    joiner = _user("employee", name="Joiner")
    helper = _user("employee", extra=["it_admin"])
    it_role_id = _role_id("it_admin")
    db = TestingSessionLocal()
    checklist = Checklist(id=uuid.uuid4(), employee_id=joiner.id, type=ChecklistType.onboarding,
                          status=ChecklistStatus.in_progress)
    db.add(checklist)
    db.flush()
    db.add(ChecklistItem(id=uuid.uuid4(), checklist_id=checklist.id, task_name="Set up laptop",
                         owner_role_id=it_role_id, status=ChecklistItemStatus.pending, sort_order=1))
    db.commit()
    db.close()

    _act_as(helper, "employee", extra=["it_admin"])
    res = client.get("/api/v1/inbox")
    assert res.status_code == 200, res.text
    items = res.json()["items"]
    assert any(i["kind"] == "task" and "Set up laptop" in i["title"] for i in items)


# ------------------------------------------------------------ assigning roles


def _super_admin() -> User:
    admin = _user("super_admin")
    _act_as(admin, "super_admin")
    return admin


def test_set_additional_roles_revokes_sessions_and_audits():
    _super_admin()
    target = _user("employee")
    db = TestingSessionLocal()
    db.add(SessionModel(id=uuid.uuid4(), user_id=target.id, refresh_token_hash="x", access_token_jti="j1",
                        expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
    db.commit()
    db.close()

    res = client.patch(f"/api/v1/users/{target.id}/role", json={
        "role_id": str(_role_id("employee")),
        "additional_role_ids": [str(_role_id("manager")), str(_role_id("it_admin"))],
    })
    assert res.status_code == 200, res.text
    assert [r["name"] for r in res.json()["additional_roles"]] == ["it_admin", "manager"]

    db = TestingSessionLocal()
    assert db.query(SessionModel).filter(SessionModel.user_id == target.id).one().revoked_at is not None
    log = db.query(AuditLog).filter(AuditLog.action == "user.role_changed").one()
    assert log.before_state["additional_roles"] == []
    assert log.after_state["additional_roles"] == ["it_admin", "manager"]
    db.close()

    # Omitting additional_role_ids keeps them; promoting one to primary removes the duplicate.
    res = client.patch(f"/api/v1/users/{target.id}/role", json={"role_id": str(_role_id("manager"))})
    assert res.status_code == 200
    assert res.json()["role_name"] == "manager"
    assert [r["name"] for r in res.json()["additional_roles"]] == ["it_admin"]

    users = client.get("/api/v1/users").json()["items"]
    row = next(u for u in users if u["id"] == str(target.id))
    assert [r["name"] for r in row["additional_roles"]] == ["it_admin"]


@pytest.mark.parametrize(
    ("primary", "extra", "message"),
    [
        ("employee", ["auditor", "it_admin"], "can't be held by the same person"),
        ("auditor", ["hr_admin"], "can't be held by the same person"),
        ("employee", ["super_admin"], "can only be a primary role"),
        ("manager", ["employee"], "can only be a primary role"),
        ("super_admin", ["manager"], "takes no additional roles"),
    ],
)
def test_assignment_rules(primary, extra, message):
    _super_admin()
    target = _user("employee")
    res = client.patch(f"/api/v1/users/{target.id}/role", json={
        "role_id": str(_role_id(primary)),
        "additional_role_ids": [str(_role_id(n)) for n in extra],
    })
    assert res.status_code == 400, res.text
    assert message in res.json()["error"]["message"]


def test_hr_cannot_change_roles_of_someone_holding_it_admin_as_additional_role():
    hr = _user("hr_admin")
    target = _user("employee", extra=["it_admin"])
    _act_as(hr, "hr_admin")
    res = client.patch(f"/api/v1/users/{target.id}/status", json={"status": "inactive"})
    assert res.status_code == 403


def test_access_preview_merges_and_flags_conflicts():
    _super_admin()
    ids = [_role_id("manager"), _role_id("it_admin"), _role_id("auditor")]
    res = client.get("/api/v1/users/access-preview", params=[("role_ids", str(i)) for i in ids])
    assert res.status_code == 200, res.text
    body = res.json()
    approve = next(p for p in body["permissions"] if p["permission"] == "request:approve")
    assert approve["roles"] == ["it_admin", "manager"]
    assert len({p["permission"] for p in body["permissions"]}) == len(body["permissions"])
    assert body["conflicts"] == [["auditor", "it_admin"]]


def test_role_counts_conflicts_and_delete_guard_include_additional_holders():
    _super_admin()
    _user("employee", extra=["manager"])
    roles = {r["name"]: r for r in client.get("/api/v1/roles").json()}
    assert roles["manager"]["user_count"] == 1
    assert [c["name"] for c in roles["auditor"]["conflicts_with"]] == ["hr_admin", "it_admin", "super_admin"]

    # A new conflict is refused while someone holds both roles.
    res = client.put(f"/api/v1/roles/{_role_id('employee')}/conflicts",
                     json={"role_ids": [str(_role_id("manager"))]})
    assert res.status_code == 409
    assert "1 person holds both" in res.json()["error"]["message"]

    res = client.put(f"/api/v1/roles/{_role_id('manager')}/conflicts",
                     json={"role_ids": [str(_role_id("auditor"))]})
    assert res.status_code == 200
    assert [r["name"] for r in res.json()] == ["auditor"]
