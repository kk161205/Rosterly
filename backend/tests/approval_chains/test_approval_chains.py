"""
§5.18 Approval Chain Configuration (super_admin only).

Two layers: RBAC through the create_rbac_mock_db pattern (every other role is
403 on every endpoint), and behaviour on real in-memory SQLite with
hand-computed expectations.

Seed templates:
  T_STD   asset_request   min_amount NULL    active   steps: manager, it_admin
  T_HIGH  asset_request   min_amount 50000   active   steps: manager, it_admin, super_admin
  T_ACC   access_request  min_amount NULL    active   steps: it_admin
"""
from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import CurrentUser, get_current_user
from app.db.session import Base, get_db
from app.main import app
from app.models.auth import Permission, Role, RolePermission, User, UserStatus
from app.models.requests import (
    ApprovalChainStep,
    ApprovalChainTemplate,
    Request,
    RequestApproval,
    RequestStatus,
    RequestType,
)
from app.models.system import AuditLog, Notification

client = TestClient(app)
URL = "/api/v1/approval-chains"

ROLE_NAMES = ["super_admin", "it_admin", "hr_admin", "manager", "employee", "auditor"]
DENIED_ROLES = [r for r in ROLE_NAMES if r != "super_admin"]
CHAIN_ACTIONS = ["read", "create", "update", "delete"]


# ---------------------------------------------------------------- RBAC (mock db)

def create_rbac_mock_db(allowed_grants: list[tuple[uuid.UUID, str, str]] | None = None) -> MagicMock:
    """Mock session: a RolePermission lookup returns a grant only for the given
    (role_id, resource, action) tuples; every other query is an empty chain."""
    mock_db = MagicMock()
    entity_query = MagicMock()
    for name in ("options", "join", "outerjoin", "filter", "order_by", "offset", "limit", "with_for_update"):
        getattr(entity_query, name).return_value = entity_query
    entity_query.first.return_value = None
    entity_query.all.return_value = []
    grants = set(allowed_grants or [])

    def query_dispatcher(*entities):
        if entities and entities[0] is RolePermission:
            rp_query = MagicMock()
            rp_query.join.return_value = rp_query

            def rp_filter(*criteria):
                filter_mock = MagicMock()
                vals = [getattr(c.right, "value", None) for c in criteria if hasattr(c, "right")]
                role_ids = vals[0] if isinstance(vals[0], (list, tuple, set, frozenset)) else [vals[0]]
                hit = any((rid, vals[1], vals[2]) in grants for rid in role_ids)
                filter_mock.first.return_value = (
                    RolePermission(role_id=role_ids[0], permission_id=uuid.uuid4()) if hit else None
                )
                return filter_mock

            rp_query.filter.side_effect = rp_filter
            return rp_query
        return entity_query

    mock_db.query.side_effect = query_dispatcher
    return mock_db


def _mock_session_as(role_name: str, grants: list[tuple[str, str]]):
    role_id = uuid.uuid4()
    mock_db = create_rbac_mock_db([(role_id, res, act) for res, act in grants])
    app.dependency_overrides[get_db] = lambda: mock_db
    current = CurrentUser(user_id=uuid.uuid4(), role=role_name, session_id=uuid.uuid4(), role_id=role_id)
    app.dependency_overrides[get_current_user] = lambda: current


BODY = {"request_type": "asset_request", "name": "X", "min_amount": None,
        "steps": [{"step_order": 1, "approver_role_id": str(uuid.uuid4())}]}
PUT_BODY = {"name": "X", "min_amount": None, "is_active": True,
            "steps": [{"step_order": 1, "approver_role_id": str(uuid.uuid4())}]}
ENDPOINTS = [
    ("get", URL, None),
    ("post", URL, BODY),
    ("put", f"{URL}/{uuid.uuid4()}", PUT_BODY),
    ("delete", f"{URL}/{uuid.uuid4()}", None),
]


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.mark.parametrize("role", DENIED_ROLES)
@pytest.mark.parametrize("method,path,body", ENDPOINTS, ids=["list", "create", "update", "delete"])
def test_every_role_except_super_admin_is_403(role, method, path, body):
    _mock_session_as(role, grants=[])
    res = client.request(method, path, json=body)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "forbidden"


def test_requires_authentication():
    assert client.get(URL).status_code == 401


def test_each_endpoint_checks_its_own_permission():
    """A role holding only approval_chain:read can list but not write."""
    _mock_session_as("auditor", grants=[("approval_chain", "read")])
    assert client.get(URL).status_code == 200
    for method, path, body in ENDPOINTS[1:]:
        assert client.request(method, path, json=body).status_code == 403, method


# ---------------------------------------------------------------- behaviour (real SQLite)

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def world():
    app.dependency_overrides[get_db] = _override_get_db
    db = TestingSessionLocal()
    for model in (AuditLog, Notification, RequestApproval, Request, ApprovalChainStep, ApprovalChainTemplate,
                  User, RolePermission, Permission, Role):
        db.query(model).delete()
    db.commit()

    roles = {n: Role(id=uuid.uuid4(), name=n, is_system_role=True) for n in ROLE_NAMES}
    db.add_all(roles.values())
    db.flush()
    grants = {("approval_chain", a): ["super_admin"] for a in CHAIN_ACTIONS}
    grants[("request", "create")] = ROLE_NAMES
    grants[("request", "read")] = ROLE_NAMES
    for (res, act), names in grants.items():
        perm = Permission(id=uuid.uuid4(), resource=res, action=act)
        db.add(perm)
        db.flush()
        db.add_all(RolePermission(role_id=roles[n].id, permission_id=perm.id) for n in names)

    def template(rtype, name, min_amount, role_names):
        t = ApprovalChainTemplate(id=uuid.uuid4(), request_type=rtype, name=name, min_amount=min_amount,
                                  is_active=True)
        db.add(t)
        db.flush()
        for i, rn in enumerate(role_names, start=1):
            db.add(ApprovalChainStep(id=uuid.uuid4(), template_id=t.id, step_order=i,
                                     approver_role_id=roles[rn].id))
        return t

    t_std = template(RequestType.asset_request, "Standard", None, ["manager", "it_admin"])
    t_high = template(RequestType.asset_request, "High", Decimal("50000"), ["manager", "it_admin", "super_admin"])
    t_acc = template(RequestType.access_request, "Access", None, ["it_admin"])

    def user(role_name, manager_id=None):
        uid = uuid.uuid4()
        u = User(id=uid, employee_code=f"RST-{uid.hex[:5].upper()}", full_name=f"{role_name} user",
                 email=f"{uid.hex[:8]}@example.com", password_hash="h", role_id=roles[role_name].id,
                 manager_id=manager_id, status=UserStatus.active, designation="Staff",
                 date_of_joining=date(2025, 1, 1))
        db.add(u)
        db.flush()
        return u

    admin = user("super_admin")
    manager = user("manager")
    employee = user("employee", manager_id=manager.id)
    db.commit()
    state = {
        "roles": {n: r.id for n, r in roles.items()},
        "std": t_std.id, "high": t_high.id, "acc": t_acc.id,
        "admin": (admin.id, roles["super_admin"].id),
        "employee": (employee.id, roles["employee"].id),
    }
    db.close()
    _act_as(*state["admin"], "super_admin")
    return state


def _act_as(user_id, role_id, role_name):
    current = CurrentUser(user_id=user_id, role=role_name, session_id=uuid.uuid4(), role_id=role_id)
    app.dependency_overrides[get_current_user] = lambda: current


def _submit_request(world, cost: str, asset_request=True) -> dict:
    """Submit a request as the employee; returns the response JSON."""
    _act_as(*world["employee"], "employee")
    payload = {"request_type": "asset_request" if asset_request else "access_request", "title": "Laptop",
               "description": "Needed for work"}
    if asset_request:
        payload["estimated_cost"] = cost
    res = client.post("/api/v1/requests", json=payload)
    assert res.status_code == 201, res.text
    _act_as(*world["admin"], "super_admin")
    return res.json()


def _body(world, **over):
    body = {"request_type": "asset_request", "name": "Mid", "min_amount": "20000",
            "steps": [{"step_order": 1, "approver_role_id": str(world["roles"]["hr_admin"])},
                      {"step_order": 2, "approver_role_id": str(world["roles"]["it_admin"])}]}
    body.update(over)
    return body


def _count(model, **filters) -> int:
    db = TestingSessionLocal()
    n = db.query(model).filter_by(**filters).count()
    db.close()
    return n


# ---- GET

def test_list_returns_ordered_steps_role_names_and_pending_counts(world):
    _submit_request(world, "1000")      # -> Standard
    _submit_request(world, "1000")      # -> Standard
    _submit_request(world, "90000")     # -> High
    res = client.get(URL)
    assert res.status_code == 200
    templates = res.json()["templates"]
    # ordered by request_type, then threshold (NULL first)
    assert [t["name"] for t in templates] == ["Access", "Standard", "High"]
    acc, std, high = templates
    assert [(s["step_order"], s["approver_role_name"]) for s in std["steps"]] == [(1, "manager"), (2, "it_admin")]
    assert [s["approver_role_name"] for s in high["steps"]] == ["manager", "it_admin", "super_admin"]
    assert (std["pending_request_count"], high["pending_request_count"], acc["pending_request_count"]) == (2, 1, 0)
    assert Decimal(high["min_amount"]) == Decimal("50000")
    assert acc["is_active"] is True and acc["warning"] is None


def test_list_only_counts_pending_requests(world):
    _submit_request(world, "1000")
    done = _submit_request(world, "1000")
    db = TestingSessionLocal()
    db.query(Request).filter(Request.id == uuid.UUID(done["id"])).update({"status": RequestStatus.approved})
    db.commit()
    db.close()
    std = next(t for t in client.get(URL).json()["templates"] if t["name"] == "Standard")
    assert std["pending_request_count"] == 1


def test_list_filters_by_request_type(world):
    res = client.get(URL, params={"request_type": "access_request"})
    assert [t["name"] for t in res.json()["templates"]] == ["Access"]
    assert client.get(URL, params={"request_type": "bogus"}).status_code == 400


# ---- POST

def test_create_template_returns_201_and_audits(world):
    res = client.post(URL, json=_body(world))
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["name"] == "Mid" and body["is_active"] is True and body["pending_request_count"] == 0
    assert Decimal(body["min_amount"]) == Decimal("20000")
    assert [(s["step_order"], s["approver_role_name"]) for s in body["steps"]] == [(1, "hr_admin"), (2, "it_admin")]
    assert _count(AuditLog, action="approval_chain.created", entity_id=uuid.UUID(body["id"])) == 1


@pytest.mark.parametrize("override,field", [
    ({"steps": []}, "steps"),
    ({"steps": [{"step_order": 1, "approver_role_id": "R1"}, {"step_order": 3, "approver_role_id": "R2"}]}, "steps"),
    ({"steps": [{"step_order": 1, "approver_role_id": "R1"}, {"step_order": 1, "approver_role_id": "R2"}]}, "steps"),
    ({"steps": [{"step_order": 0, "approver_role_id": "R1"}]}, "steps"),
    ({"steps": [{"step_order": 1, "approver_role_id": str(uuid.uuid4())}]}, "steps.approver_role_id"),
    ({"min_amount": "-1"}, "min_amount"),
    ({"request_type": "access_request", "min_amount": "100"}, "min_amount"),
    ({"name": "   "}, "name"),
], ids=["no-steps", "gap", "duplicate", "starts-at-0", "unknown-role", "negative-min", "min-on-access", "blank-name"])
def test_invalid_payloads_are_400_with_field_errors(world, override, field):
    override = dict(override)
    if "steps" in override:
        mapping = {"R1": str(world["roles"]["hr_admin"]), "R2": str(world["roles"]["it_admin"])}
        override["steps"] = [{**s, "approver_role_id": mapping.get(s["approver_role_id"], s["approver_role_id"])}
                             for s in override["steps"]]
    res = client.post(URL, json=_body(world, **override))
    assert res.status_code == 400, res.text
    err = res.json()["error"]
    assert err["code"] == "validation_error"
    assert field in err["field_errors"]
    assert _count(ApprovalChainTemplate) == 3  # nothing created


def test_second_active_template_for_same_type_and_threshold_is_409(world):
    # Standard already owns (asset_request, NULL); High already owns (asset_request, 50000)
    for min_amount in (None, "50000"):
        res = client.post(URL, json=_body(world, min_amount=min_amount))
        assert res.status_code == 409, min_amount
        assert res.json()["error"]["code"] == "conflict"
    assert _count(ApprovalChainTemplate) == 3


def test_new_threshold_or_other_type_is_allowed(world):
    assert client.post(URL, json=_body(world, min_amount="75000")).status_code == 201
    other = _body(world, request_type="it_ticket", min_amount=None)
    assert client.post(URL, json=other).status_code == 201


# ---- PUT

def test_put_fully_replaces_steps_and_fields(world):
    body = {"name": "Standard v2", "min_amount": None, "is_active": True,
            "steps": [{"step_order": 1, "approver_role_id": str(world["roles"]["hr_admin"])}]}
    res = client.put(f"{URL}/{world['std']}", json=body)
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["name"] == "Standard v2"
    assert [(s["step_order"], s["approver_role_name"]) for s in out["steps"]] == [(1, "hr_admin")]
    assert _count(ApprovalChainStep, template_id=world["std"]) == 1  # old two steps are gone
    assert _count(AuditLog, action="approval_chain.updated", entity_id=world["std"]) == 1


def test_put_does_not_touch_in_flight_requests(world):
    created = _submit_request(world, "1000")  # routed through Standard: manager -> it_admin
    request_id = uuid.UUID(created["id"])
    db = TestingSessionLocal()
    before = [(a.step_order, a.approver_role_id) for a in
              db.query(RequestApproval).filter(RequestApproval.request_id == request_id)
              .order_by(RequestApproval.step_order)]
    db.close()
    assert before == [(1, world["roles"]["manager"]), (2, world["roles"]["it_admin"])]

    body = {"name": "Standard v2", "min_amount": None, "is_active": True,
            "steps": [{"step_order": 1, "approver_role_id": str(world["roles"]["hr_admin"])}]}
    assert client.put(f"{URL}/{world['std']}", json=body).status_code == 200

    db = TestingSessionLocal()
    after = [(a.step_order, a.approver_role_id) for a in
             db.query(RequestApproval).filter(RequestApproval.request_id == request_id)
             .order_by(RequestApproval.step_order)]
    db.close()
    assert after == before  # copied at creation: unchanged

    newer = _submit_request(world, "1000")  # a new request follows the new chain
    db = TestingSessionLocal()
    rows = db.query(RequestApproval).filter(RequestApproval.request_id == uuid.UUID(newer["id"])).all()
    db.close()
    assert [(a.step_order, a.approver_role_id) for a in rows] == [(1, world["roles"]["hr_admin"])]


def test_put_validates_like_post(world):
    base = {"name": "S", "min_amount": None, "is_active": True}
    hr = str(world["roles"]["hr_admin"])
    for steps in ([], [{"step_order": 2, "approver_role_id": hr}],
                  [{"step_order": 1, "approver_role_id": hr}, {"step_order": 1, "approver_role_id": hr}],
                  [{"step_order": 1, "approver_role_id": str(uuid.uuid4())}]):
        res = client.put(f"{URL}/{world['std']}", json={**base, "steps": steps})
        assert res.status_code == 400
        assert "steps" in res.json()["error"]["field_errors"] or "steps.approver_role_id" in res.json()["error"]["field_errors"]
    assert _count(ApprovalChainStep, template_id=world["std"]) == 2  # unchanged after failures
    # min_amount is not allowed on a non-asset template
    res = client.put(f"{URL}/{world['acc']}", json={**base, "min_amount": "10",
                                                    "steps": [{"step_order": 1, "approver_role_id": hr}]})
    assert res.status_code == 400 and "min_amount" in res.json()["error"]["field_errors"]


def test_put_cannot_create_a_second_active_template_for_a_tier(world):
    hr = str(world["roles"]["hr_admin"])
    body = {"name": "High", "min_amount": None, "is_active": True, "steps": [{"step_order": 1, "approver_role_id": hr}]}
    res = client.put(f"{URL}/{world['high']}", json=body)  # would collide with Standard (asset_request, NULL)
    assert res.status_code == 409
    # keeping its own tier is fine (self excluded)
    ok = client.put(f"{URL}/{world['high']}", json={**body, "min_amount": "50000"})
    assert ok.status_code == 200


def test_deactivating_last_active_template_warns(world):
    hr = str(world["roles"]["hr_admin"])
    body = {"name": "Access", "min_amount": None, "is_active": False, "steps": [{"step_order": 1, "approver_role_id": hr}]}
    res = client.put(f"{URL}/{world['acc']}", json=body)
    assert res.status_code == 200
    warning = res.json()["warning"]
    assert "access_request" in warning and "no_approval_chain" in warning
    assert res.json()["is_active"] is False


def test_deactivating_one_of_several_does_not_warn(world):
    hr = str(world["roles"]["hr_admin"])
    body = {"name": "High", "min_amount": "50000", "is_active": False, "steps": [{"step_order": 1, "approver_role_id": hr}]}
    res = client.put(f"{URL}/{world['high']}", json=body)  # Standard asset_request stays active
    assert res.status_code == 200 and res.json()["warning"] is None


def test_put_unknown_template_is_404(world):
    hr = str(world["roles"]["hr_admin"])
    res = client.put(f"{URL}/{uuid.uuid4()}", json={"name": "x", "min_amount": None, "is_active": True,
                                                    "steps": [{"step_order": 1, "approver_role_id": hr}]})
    assert res.status_code == 404 and res.json()["error"]["code"] == "not_found"


# ---- DELETE

def test_delete_with_pending_request_is_409(world):
    _submit_request(world, "1000")
    res = client.delete(f"{URL}/{world['std']}")
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "conflict" and "1 pending" in res.json()["error"]["message"]
    assert _count(ApprovalChainTemplate, id=world["std"]) == 1
    assert _count(AuditLog, action="approval_chain.deleted") == 0


def test_delete_without_pending_request_is_204_and_audited(world):
    res = client.delete(f"{URL}/{world['high']}")
    assert res.status_code == 204 and res.content == b""
    assert _count(ApprovalChainTemplate, id=world["high"]) == 0
    assert _count(ApprovalChainStep, template_id=world["high"]) == 0
    assert _count(AuditLog, action="approval_chain.deleted", entity_id=world["high"]) == 1


def test_delete_ignores_resolved_requests(world):
    done = _submit_request(world, "1000")
    db = TestingSessionLocal()
    db.query(Request).filter(Request.id == uuid.UUID(done["id"])).update({"status": RequestStatus.rejected})
    db.commit()
    db.close()
    assert client.delete(f"{URL}/{world['std']}").status_code == 204


def test_delete_unknown_template_is_404(world):
    assert client.delete(f"{URL}/{uuid.uuid4()}").status_code == 404


# ---- create_request stores the template

def test_create_request_records_the_template_it_was_routed_through(world):
    low = _submit_request(world, "1000")
    high = _submit_request(world, "90000")
    access = _submit_request(world, "0", asset_request=False)
    db = TestingSessionLocal()
    stored = {rid: db.query(Request).filter(Request.id == uuid.UUID(rid)).one().approval_chain_template_id
              for rid in (low["id"], high["id"], access["id"])}
    db.close()
    assert stored == {low["id"]: world["std"], high["id"]: world["high"], access["id"]: world["acc"]}
