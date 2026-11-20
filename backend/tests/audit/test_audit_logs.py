"""
Audit Log Viewer: GET /audit-logs.

Two layers:
  * RBAC (create_rbac_mock_db pattern): (audit_log, read) is granted to
    super_admin and auditor only; every other role is 403.
  * Behaviour (real in-memory SQLite) against hand-computed values.

Seed (all UTC), newest first is L5, L4, L3, L2, L1:
  L1 2026-03-01 12:00  Alice  create  user
  L2 2026-03-02 09:00  Alice  update  asset
  L3 2026-03-03 23:30  Bob    delete  asset
  L4 2026-03-05 10:00  system update  user     (no actor)
  L5 2026-03-10 08:00  Bob    create  asset
"""
from datetime import date, datetime, timezone
from unittest.mock import MagicMock
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import CurrentUser, get_current_user
from app.db.session import Base, get_db
from app.main import app
from app.models.auth import Permission, Role, RolePermission, User, UserStatus
from app.models.system import AuditLog

client = TestClient(app)
URL = "/api/v1/audit-logs"

ROLE_NAMES = ["super_admin", "it_admin", "hr_admin", "manager", "employee", "auditor"]
ALLOWED_ROLES = ["super_admin", "auditor"]
DENIED_ROLES = [r for r in ROLE_NAMES if r not in ALLOWED_ROLES]


# ---------------------------------------------------------------- RBAC (mock db)

def create_rbac_mock_db(allowed_grants: list[tuple[uuid.UUID, str, str]] | None = None) -> MagicMock:
    """Mock session: a RolePermission lookup returns a grant only for the given
    (role_id, resource, action) tuples; every other query is an empty chain."""
    mock_db = MagicMock()
    entity_query = MagicMock()
    for name in ("options", "join", "outerjoin", "filter", "order_by", "offset", "limit"):
        getattr(entity_query, name).return_value = entity_query
    entity_query.count.return_value = 0
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


def _mock_session_as(role_name: str, granted: bool):
    role_id = uuid.uuid4()
    mock_db = create_rbac_mock_db([(role_id, "audit_log", "read")] if granted else [])
    app.dependency_overrides[get_db] = lambda: mock_db
    current = CurrentUser(user_id=uuid.uuid4(), role=role_name, session_id=uuid.uuid4(), role_id=role_id)
    app.dependency_overrides[get_current_user] = lambda: current
    return mock_db


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


@pytest.mark.parametrize("role", DENIED_ROLES)
def test_roles_without_the_grant_get_403(role):
    _mock_session_as(role, granted=False)
    res = client.get(URL)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "forbidden"


@pytest.mark.parametrize("role", DENIED_ROLES)
def test_denied_role_gets_403_even_with_invalid_dates(role):
    """Authorization is checked before validation, so a denied role never learns anything."""
    _mock_session_as(role, granted=False)
    res = client.get(URL, params={"from": "2026-03-10", "to": "2026-03-01"})
    assert res.status_code == 403


@pytest.mark.parametrize("role", ALLOWED_ROLES)
def test_roles_with_the_grant_get_200(role):
    _mock_session_as(role, granted=True)
    res = client.get(URL)
    assert res.status_code == 200
    assert res.json() == {"items": [], "total": 0}


def test_requires_authentication():
    res = client.get(URL)
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "unauthenticated"


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


def _utc(y, m, d, h, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=timezone.utc)


@pytest.fixture
def seeded():
    app.dependency_overrides[get_db] = _override_get_db
    db = TestingSessionLocal()
    for model in (AuditLog, RolePermission, Permission, User, Role):
        db.query(model).delete()
    db.commit()

    roles = {n: Role(id=uuid.uuid4(), name=n, is_system_role=True) for n in ROLE_NAMES}
    db.add_all(roles.values())
    db.flush()
    perm = Permission(id=uuid.uuid4(), resource="audit_log", action="read")
    db.add(perm)
    db.flush()
    db.add_all(RolePermission(role_id=roles[n].id, permission_id=perm.id) for n in ALLOWED_ROLES)

    def user(name, email):
        uid = uuid.uuid4()
        u = User(id=uid, employee_code=f"RST-{uid.hex[:5].upper()}", full_name=name, email=email,
                 password_hash="h", role_id=roles["employee"].id, status=UserStatus.active,
                 designation="Staff", date_of_joining=date(2025, 1, 1))
        db.add(u)
        return u

    alice = user("Alice Rao", "alice@example.com")
    bob = user("Bob Iyer", "bob@example.com")
    db.flush()

    entity = uuid.uuid4()
    logs = {}
    for key, actor, action, etype, when in [
        ("L1", alice, "create", "user", _utc(2026, 3, 1, 12)),
        ("L2", alice, "update", "asset", _utc(2026, 3, 2, 9)),
        ("L3", bob, "delete", "asset", _utc(2026, 3, 3, 23, 30)),
        ("L4", None, "update", "user", _utc(2026, 3, 5, 10)),
        ("L5", bob, "create", "asset", _utc(2026, 3, 10, 8)),
    ]:
        logs[key] = AuditLog(id=uuid.uuid4(), actor_id=actor.id if actor else None, action=action,
                             entity_type=etype, entity_id=entity, before_state={"k": key + "-before"},
                             after_state={"k": key + "-after"}, ip_address=f"10.0.0.{key[1]}",
                             created_at=when)
    db.add_all(logs.values())
    db.commit()
    state = {"alice": alice.id, "bob": bob.id, "roles": {n: r.id for n, r in roles.items()},
             "logs": {k: v.id for k, v in logs.items()}}
    db.close()
    _act_as(state, "auditor")
    return state


def _act_as(state, role_name):
    current = CurrentUser(user_id=uuid.uuid4(), role=role_name, session_id=uuid.uuid4(),
                          role_id=state["roles"][role_name])
    app.dependency_overrides[get_current_user] = lambda: current


def _keys(state, res) -> list[str]:
    by_id = {v: k for k, v in state["logs"].items()}
    return [by_id[uuid.UUID(i["id"])] for i in res.json()["items"]]


@pytest.mark.parametrize("role", ALLOWED_ROLES)
def test_super_admin_and_auditor_see_all_newest_first(seeded, role):
    _act_as(seeded, role)
    res = client.get(URL)
    assert res.status_code == 200
    assert res.json()["total"] == 5
    assert _keys(seeded, res) == ["L5", "L4", "L3", "L2", "L1"]


@pytest.mark.parametrize("role", DENIED_ROLES)
def test_other_roles_are_403_against_real_grants(seeded, role):
    _act_as(seeded, role)
    assert client.get(URL).status_code == 403


def test_item_fields_with_actor_and_system_event(seeded):
    items = client.get(URL).json()["items"]
    l5, l4 = items[0], items[1]
    assert l5["actor"] == {"id": str(seeded["bob"]), "full_name": "Bob Iyer", "email": "bob@example.com"}
    assert l5["action"] == "create" and l5["entity_type"] == "asset"
    assert l5["before_state"] == {"k": "L5-before"} and l5["after_state"] == {"k": "L5-after"}
    assert l5["ip_address"] == "10.0.0.5"
    assert l5["created_at"].startswith("2026-03-10T08:00:00")
    assert set(l5) == {"id", "actor", "action", "entity_type", "entity_id", "before_state", "after_state",
                       "ip_address", "created_at"}
    assert l4["actor"] is None  # system event


def test_filter_actor(seeded):
    res = client.get(URL, params={"actor_id": str(seeded["alice"])})
    assert _keys(seeded, res) == ["L2", "L1"] and res.json()["total"] == 2


def test_filter_action(seeded):
    res = client.get(URL, params={"action": "update"})
    assert _keys(seeded, res) == ["L4", "L2"] and res.json()["total"] == 2


def test_filter_entity_type(seeded):
    res = client.get(URL, params={"entity_type": "asset"})
    assert _keys(seeded, res) == ["L5", "L3", "L2"] and res.json()["total"] == 3


def test_filter_date_range_is_inclusive_of_whole_days(seeded):
    # L3 is 23:30 on the 3rd and L4 is on the 5th: both inside 03-03..03-05.
    res = client.get(URL, params={"from": "2026-03-03", "to": "2026-03-05"})
    assert _keys(seeded, res) == ["L4", "L3"] and res.json()["total"] == 2


def test_filter_from_only_and_to_only(seeded):
    assert _keys(seeded, client.get(URL, params={"from": "2026-03-05"})) == ["L5", "L4"]
    assert _keys(seeded, client.get(URL, params={"to": "2026-03-02"})) == ["L2", "L1"]


def test_from_equal_to_is_a_single_day(seeded):
    res = client.get(URL, params={"from": "2026-03-03", "to": "2026-03-03"})
    assert _keys(seeded, res) == ["L3"]


def test_filters_combine(seeded):
    res = client.get(URL, params={"actor_id": str(seeded["bob"]), "entity_type": "asset", "action": "create"})
    assert _keys(seeded, res) == ["L5"] and res.json()["total"] == 1
    none = client.get(URL, params={"actor_id": str(seeded["alice"]), "action": "delete"})
    assert none.json() == {"items": [], "total": 0}


def test_from_after_to_is_400_validation_error(seeded):
    res = client.get(URL, params={"from": "2026-03-10", "to": "2026-03-01"})
    assert res.status_code == 400
    err = res.json()["error"]
    assert err["code"] == "validation_error"
    assert "from" in err["field_errors"]


def test_bad_params_are_400(seeded):
    for params in ({"from": "not-a-date"}, {"actor_id": "nope"}, {"page_size": 101}, {"page": 0}):
        res = client.get(URL, params=params)
        assert res.status_code == 400, params
        assert res.json()["error"]["code"] == "validation_error"


def test_pagination(seeded):
    p1 = client.get(URL, params={"page": 1, "page_size": 2})
    p3 = client.get(URL, params={"page": 3, "page_size": 2})
    assert _keys(seeded, p1) == ["L5", "L4"]
    assert _keys(seeded, p3) == ["L1"]
    assert p1.json()["total"] == p3.json()["total"] == 5
    assert client.get(URL, params={"page": 9}).json() == {"items": [], "total": 5}


def test_default_page_size_is_25(seeded):
    db = TestingSessionLocal()
    for i in range(30):
        db.add(AuditLog(id=uuid.uuid4(), actor_id=None, action="update", entity_type="role",
                        entity_id=uuid.uuid4(), ip_address="1.1.1.1", created_at=_utc(2026, 4, 1, 0, i)))
    db.commit()
    db.close()
    body = client.get(URL).json()
    assert len(body["items"]) == 25 and body["total"] == 35


def test_route_never_writes_audit_logs(seeded):
    def count():
        db = TestingSessionLocal()
        n = db.query(AuditLog).count()
        db.close()
        return n

    before = count()
    client.get(URL)
    client.get(URL, params={"action": "update"})
    client.get(URL, params={"from": "2026-03-10", "to": "2026-03-01"})
    assert count() == before == 5


def test_actors_are_joined_not_queried_per_row(seeded):
    """Same number of SQL statements for 1 row and 5 rows -> no per-row actor lookup."""
    statements: list[str] = []

    def record(conn, cursor, statement, *args):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        client.get(URL, params={"page_size": 1})
        one_row = len(statements)
        statements.clear()
        client.get(URL, params={"page_size": 5})
        five_rows = len(statements)
        joined = [s for s in statements if "audit_logs" in s and "LEFT OUTER JOIN users" in s]
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert one_row == five_rows
    assert len(joined) == 1
