"""
§5.16 Notifications Center: strictly self-scoped list, mark read, mark all read.

Real in-memory SQLite. Expected values are hand-computed from the seed below.

Seed for user A (created_at increases with the index, so newest first is n6..n0):
  n0 approval_needed          unread      -> approvals
  n1 request_status_change    read        -> approvals
  n2 warranty_expiring        unread      -> hardware
  n3 license_renewal          read        -> hardware
  n4 task_assigned            unread      -> system
  n5 account_updated          unread      -> system
  n6 mystery_type             unread      -> system (unknown types are System Alerts)
A: 7 total, 5 unread.  Approvals 2, hardware 2, system 3.
User B has 2 unread rows (b0, b1) that A must never see or touch.
"""
from datetime import date, datetime, timedelta, timezone
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import CurrentUser, get_current_user
from app.db.session import Base, get_db
from app.main import app
from app.models.auth import Role, User, UserStatus
from app.models.system import Notification

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)
client = TestClient(app)

ROLE_NAMES = ["super_admin", "it_admin", "hr_admin", "manager", "employee", "auditor"]
BASE_TIME = datetime(2026, 5, 1, 9, 0, tzinfo=timezone.utc)

A_SEED = [  # (type, is_read)
    ("approval_needed", False),
    ("request_status_change", True),
    ("warranty_expiring", False),
    ("license_renewal", True),
    ("task_assigned", False),
    ("account_updated", False),
    ("mystery_type", False),
]


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def _make_user(db, role: Role, label: str) -> User:
    uid = uuid.uuid4()
    user = User(id=uid, employee_code=f"RST-{uid.hex[:5].upper()}", full_name=label,
                email=f"{uid.hex[:8]}@example.com", password_hash="h", role_id=role.id,
                status=UserStatus.active, designation="Staff", date_of_joining=date(2025, 1, 1))
    db.add(user)
    return user


def _note(db, user, ntype: str, is_read: bool, minutes: int, title: str | None = None) -> Notification:
    n = Notification(id=uuid.uuid4(), user_id=user.id, type=ntype, title=title or f"{ntype} title",
                     message="msg", is_read=is_read, created_at=BASE_TIME + timedelta(minutes=minutes))
    db.add(n)
    return n


@pytest.fixture(autouse=True)
def seed():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    for model in (Notification, User, Role):
        db.query(model).delete()
    db.commit()
    roles = {name: Role(id=uuid.uuid4(), name=name, is_system_role=True) for name in ROLE_NAMES}
    db.add_all(roles.values())
    db.flush()
    a = _make_user(db, roles["employee"], "User A")
    b = _make_user(db, roles["employee"], "User B")
    db.flush()
    for i, (ntype, is_read) in enumerate(A_SEED):
        _note(db, a, ntype, is_read, minutes=i, title=f"n{i}")
    _note(db, b, "approval_needed", False, minutes=100, title="b0")
    _note(db, b, "task_assigned", False, minutes=101, title="b1")
    db.commit()
    state = {"a": a.id, "b": b.id, "roles": {n: r.id for n, r in roles.items()}}
    db.close()
    yield state
    app.dependency_overrides.clear()


def _act_as(user_id, role_name="employee", role_id=None):
    current = CurrentUser(user_id=user_id, role=role_name, session_id=uuid.uuid4(), role_id=role_id)
    app.dependency_overrides[get_current_user] = lambda: current


def _titles(res) -> list[str]:
    return [i["title"] for i in res.json()["items"]]


def _unread_ids(user_id) -> set:
    db = TestingSessionLocal()
    rows = db.query(Notification).filter(Notification.user_id == user_id, Notification.is_read.is_(False)).all()
    ids = {n.id for n in rows}
    db.close()
    return ids


def _id_of(owner_id, title):
    db = TestingSessionLocal()
    nid = db.query(Notification).filter(Notification.user_id == owner_id, Notification.title == title).one().id
    db.close()
    return nid


# ------------------------------------------------------------------ list

def test_list_is_newest_first_and_self_scoped(seed):
    _act_as(seed["a"])
    res = client.get("/api/v1/notifications")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 7
    assert body["unread_count"] == 5
    assert _titles(res) == ["n6", "n5", "n4", "n3", "n2", "n1", "n0"]  # no b0/b1


def test_list_item_shape(seed):
    _act_as(seed["a"])
    item = client.get("/api/v1/notifications", params={"page_size": 1}).json()["items"][0]
    assert set(item) == {"id", "type", "title", "message", "related_entity_type", "related_entity_id",
                         "is_critical", "is_read", "created_at"}
    assert item["type"] == "mystery_type" and item["is_read"] is False


def test_unread_only(seed):
    _act_as(seed["a"])
    res = client.get("/api/v1/notifications", params={"unread_only": "true"})
    assert _titles(res) == ["n6", "n5", "n4", "n2", "n0"]
    assert res.json()["total"] == 5


@pytest.mark.parametrize("category,expected", [
    ("approvals", ["n1", "n0"]),
    ("hardware", ["n3", "n2"]),
    ("system", ["n6", "n5", "n4"]),  # includes the unknown type
])
def test_category_tabs(seed, category, expected):
    _act_as(seed["a"])
    res = client.get("/api/v1/notifications", params={"category": category})
    assert _titles(res) == expected
    assert res.json()["total"] == len(expected)


def test_category_and_unread_only_combine(seed):
    _act_as(seed["a"])
    res = client.get("/api/v1/notifications", params={"category": "hardware", "unread_only": "true"})
    assert _titles(res) == ["n2"]
    assert res.json()["total"] == 1


def test_unread_count_ignores_category_and_page(seed):
    _act_as(seed["a"])
    for params in ({}, {"category": "approvals"}, {"category": "hardware", "unread_only": "true"},
                   {"page": 2, "page_size": 2}, {"page": 99}):
        res = client.get("/api/v1/notifications", params=params)
        assert res.status_code == 200
        assert res.json()["unread_count"] == 5, params


def test_pagination_pages(seed):
    _act_as(seed["a"])
    p1 = client.get("/api/v1/notifications", params={"page": 1, "page_size": 3})
    p3 = client.get("/api/v1/notifications", params={"page": 3, "page_size": 3})
    assert _titles(p1) == ["n6", "n5", "n4"]
    assert _titles(p3) == ["n0"]
    assert p1.json()["total"] == p3.json()["total"] == 7


def test_pagination_bounds_and_bad_category(seed):
    _act_as(seed["a"])
    for params in ({"page_size": 101}, {"page_size": 0}, {"page": 0}, {"category": "bogus"}):
        res = client.get("/api/v1/notifications", params=params)
        assert res.status_code == 400, params
        assert res.json()["error"]["code"] == "validation_error"


def test_default_page_size_is_25(seed):
    db = TestingSessionLocal()
    user = db.query(User).filter(User.id == seed["b"]).one()
    for i in range(30):
        _note(db, user, "task_assigned", True, minutes=200 + i)
    db.commit()
    db.close()
    _act_as(seed["b"])
    body = client.get("/api/v1/notifications").json()
    assert len(body["items"]) == 25
    assert body["total"] == 32  # 2 seeded + 30
    assert body["unread_count"] == 2


@pytest.mark.parametrize("role", ROLE_NAMES)
def test_every_role_can_use_own_notifications(seed, role):
    """No permission row is needed: all three endpoints work for every role."""
    _act_as(seed["a"], role_name=role, role_id=seed["roles"][role])
    assert client.get("/api/v1/notifications").status_code == 200
    assert client.patch(f"/api/v1/notifications/{_id_of(seed['a'], 'n0')}/read").status_code == 200
    assert client.post("/api/v1/notifications/mark-all-read").status_code == 200


def test_requires_authentication():
    app.dependency_overrides.pop(get_current_user, None)
    for method, path in (("get", "/api/v1/notifications"), ("post", "/api/v1/notifications/mark-all-read"),
                         ("patch", f"/api/v1/notifications/{uuid.uuid4()}/read")):
        res = getattr(client, method)(path)
        assert res.status_code == 401, path
        assert res.json()["error"]["code"] == "unauthenticated"


# ------------------------------------------------------------------ mark one

def test_mark_read_updates_and_returns_notification(seed):
    _act_as(seed["a"])
    nid = _id_of(seed["a"], "n4")
    res = client.patch(f"/api/v1/notifications/{nid}/read")
    assert res.status_code == 200
    assert res.json()["id"] == str(nid) and res.json()["is_read"] is True
    assert client.get("/api/v1/notifications").json()["unread_count"] == 4


def test_mark_read_is_idempotent(seed):
    _act_as(seed["a"])
    nid = _id_of(seed["a"], "n1")  # already read
    for _ in range(2):
        res = client.patch(f"/api/v1/notifications/{nid}/read")
        assert res.status_code == 200
        assert res.json()["is_read"] is True
    assert client.get("/api/v1/notifications").json()["unread_count"] == 5


def test_cannot_mark_another_users_notification_read(seed):
    _act_as(seed["a"])
    b_id = _id_of(seed["b"], "b0")
    res = client.patch(f"/api/v1/notifications/{b_id}/read")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"
    assert b_id in _unread_ids(seed["b"])  # untouched


def test_other_users_and_missing_ids_look_identical(seed):
    _act_as(seed["a"])
    other = client.patch(f"/api/v1/notifications/{_id_of(seed['b'], 'b1')}/read")
    missing = client.patch(f"/api/v1/notifications/{uuid.uuid4()}/read")
    assert other.status_code == missing.status_code == 404
    assert other.json() == missing.json()


def test_list_never_shows_another_users_rows(seed):
    _act_as(seed["b"])
    res = client.get("/api/v1/notifications")
    assert _titles(res) == ["b1", "b0"]
    assert res.json()["total"] == 2


def test_malformed_id_is_validation_error(seed):
    _act_as(seed["a"])
    res = client.patch("/api/v1/notifications/not-a-uuid/read")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "validation_error"


# ------------------------------------------------------------------ mark all

def test_mark_all_read_only_touches_callers_unread_rows(seed):
    b_unread_before = _unread_ids(seed["b"])
    assert len(b_unread_before) == 2
    _act_as(seed["a"])
    res = client.post("/api/v1/notifications/mark-all-read")
    assert res.status_code == 200
    assert res.json() == {"updated_count": 5}  # n0, n2, n4, n5, n6
    assert _unread_ids(seed["a"]) == set()
    assert _unread_ids(seed["b"]) == b_unread_before  # B's unread rows untouched
    assert client.get("/api/v1/notifications").json()["unread_count"] == 0


def test_mark_all_read_twice_updates_zero(seed):
    _act_as(seed["a"])
    assert client.post("/api/v1/notifications/mark-all-read").json() == {"updated_count": 5}
    assert client.post("/api/v1/notifications/mark-all-read").json() == {"updated_count": 0}
