"""
§5.19 Software License Management.

RBAC through the create_rbac_mock_db pattern, behaviour on real in-memory
SQLite with hand-computed values.

seats_used = assets linked to the license with status 'assigned' (§1.18).

Seed:
  Figma   total 10 : 3 assigned (Alice x2, Bob x1) + 1 in_stock + 1 retired  -> seats_used 3
  M365    total  5 : 5 assigned (5 different holders)                         -> seats_used 5
  Empty   total  2 : no assets                                                -> seats_used 0
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
from app.models.assets import Asset, AssetStatus, DepreciationMethod, SoftwareLicense
from app.models.auth import Permission, Role, RolePermission, User, UserStatus
from app.models.system import AuditLog

client = TestClient(app)
URL = "/api/v1/software-licenses"

ROLE_NAMES = ["super_admin", "it_admin", "hr_admin", "manager", "employee", "auditor"]
READ_ROLES = ["super_admin", "it_admin", "auditor"]
WRITE_ROLES = ["super_admin", "it_admin"]
GRANTS = {
    ("software_license", "read"): READ_ROLES,
    ("software_license", "create"): WRITE_ROLES,
    ("software_license", "update"): WRITE_ROLES,
    ("analytics", "savings"): ["super_admin", "it_admin", "auditor"],
}


# ---------------------------------------------------------------- RBAC (mock db)

def create_rbac_mock_db(allowed_grants: list[tuple[uuid.UUID, str, str]] | None = None) -> MagicMock:
    """Mock session: a RolePermission lookup returns a grant only for the given
    (role_id, resource, action) tuples; every other query is an empty chain."""
    mock_db = MagicMock()
    entity_query = MagicMock()
    for name in ("options", "join", "outerjoin", "filter", "order_by", "offset", "limit", "group_by",
                 "with_for_update"):
        getattr(entity_query, name).return_value = entity_query
    entity_query.first.return_value = None
    entity_query.all.return_value = []
    entity_query.count.return_value = 0
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


def _mock_session_as(role_name: str):
    """Grants the role exactly what GRANTS gives it; nothing else."""
    role_id = uuid.uuid4()
    held = [(role_id, res, act) for (res, act), names in GRANTS.items() if role_name in names]
    mock_db = create_rbac_mock_db(held)
    app.dependency_overrides[get_db] = lambda: mock_db
    current = CurrentUser(user_id=uuid.uuid4(), role=role_name, session_id=uuid.uuid4(), role_id=role_id)
    app.dependency_overrides[get_current_user] = lambda: current


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


SOME_ID = uuid.uuid4()
NEW_BODY = {"name": "Slack", "vendor": "Salesforce", "total_seats": 5}
READ_ENDPOINTS = [("get", URL, None), ("get", f"{URL}/{SOME_ID}/holders", None)]
WRITE_ENDPOINTS = [("post", URL, NEW_BODY), ("patch", f"{URL}/{SOME_ID}", {"name": "New"})]


@pytest.mark.parametrize("role", [r for r in ROLE_NAMES if r not in READ_ROLES])
@pytest.mark.parametrize("method,path,body", READ_ENDPOINTS, ids=["list", "holders"])
def test_roles_without_read_are_403(role, method, path, body):
    _mock_session_as(role)
    res = client.request(method, path, json=body)
    assert res.status_code == 403 and res.json()["error"]["code"] == "forbidden"


@pytest.mark.parametrize("role", [r for r in ROLE_NAMES if r not in WRITE_ROLES])
@pytest.mark.parametrize("method,path,body", WRITE_ENDPOINTS, ids=["create", "update"])
def test_roles_without_write_are_403(role, method, path, body):
    _mock_session_as(role)  # includes auditor: read-only
    res = client.request(method, path, json=body)
    assert res.status_code == 403 and res.json()["error"]["code"] == "forbidden"


def test_requires_authentication():
    assert client.get(URL).status_code == 401


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
    for model in (AuditLog, Asset, SoftwareLicense, User, RolePermission, Permission, Role):
        db.query(model).delete()
    db.commit()

    roles = {n: Role(id=uuid.uuid4(), name=n, is_system_role=True) for n in ROLE_NAMES}
    db.add_all(roles.values())
    db.flush()
    for (res, act), names in GRANTS.items():
        perm = Permission(id=uuid.uuid4(), resource=res, action=act)
        db.add(perm)
        db.flush()
        db.add_all(RolePermission(role_id=roles[n].id, permission_id=perm.id) for n in names)

    def user(name, email):
        uid = uuid.uuid4()
        u = User(id=uid, employee_code=f"RST-{uid.hex[:5].upper()}", full_name=name, email=email,
                 password_hash="h", role_id=roles["employee"].id, status=UserStatus.active,
                 designation="Staff", date_of_joining=date(2025, 1, 1))
        db.add(u)
        db.flush()
        return u

    alice = user("Alice Rao", "alice@example.com")
    bob = user("Bob Iyer", "bob@example.com")
    others = [user(f"Holder {i}", f"h{i}@example.com") for i in range(5)]

    counter = {"n": 0}

    def asset(lic, status, holder=None, name="Seat"):
        counter["n"] += 1
        a = Asset(id=uuid.uuid4(), asset_tag=f"AST-{counter['n']:04d}", name=name, category="software_license",
                  vendor="V", purchase_date=date(2025, 1, 1), purchase_cost=Decimal("100"),
                  current_value=Decimal("100"), depreciation_method=DepreciationMethod.none,
                  useful_life_months=12, status=status, current_holder_id=holder.id if holder else None,
                  license_id=lic.id)
        db.add(a)
        return a

    figma = SoftwareLicense(id=uuid.uuid4(), name="Figma", vendor="Figma Inc", total_seats=10,
                            cost_per_seat=Decimal("1200.00"), renewal_date=date(2027, 1, 15))
    m365 = SoftwareLicense(id=uuid.uuid4(), name="M365", vendor="Microsoft", total_seats=5,
                           cost_per_seat=Decimal("2000.00"), renewal_date=None)
    empty = SoftwareLicense(id=uuid.uuid4(), name="Empty", vendor="Nobody", total_seats=2, cost_per_seat=None)
    db.add_all([figma, m365, empty])
    db.flush()
    asset(figma, AssetStatus.assigned, alice, "Figma seat 1")
    asset(figma, AssetStatus.assigned, alice, "Figma seat 2")
    asset(figma, AssetStatus.assigned, bob, "Figma seat 3")
    asset(figma, AssetStatus.in_stock)
    asset(figma, AssetStatus.retired)
    for h in others:
        asset(m365, AssetStatus.assigned, h)
    db.commit()

    state = {"roles": {n: r.id for n, r in roles.items()}, "figma": figma.id, "m365": m365.id, "empty": empty.id,
             "alice": alice.id, "bob": bob.id}
    db.close()
    _act_as(state, "it_admin")
    return state


def _act_as(state, role_name):
    current = CurrentUser(user_id=uuid.uuid4(), role=role_name, session_id=uuid.uuid4(),
                          role_id=state["roles"][role_name])
    app.dependency_overrides[get_current_user] = lambda: current


def _count_audit(**filters) -> int:
    db = TestingSessionLocal()
    n = db.query(AuditLog).filter_by(**filters).count()
    db.close()
    return n


# ---- GET list

@pytest.mark.parametrize("role", READ_ROLES)
def test_list_with_seats_used(world, role):
    _act_as(world, role)
    res = client.get(URL)
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 3
    rows = {i["name"]: i for i in body["items"]}
    assert [i["name"] for i in body["items"]] == ["Empty", "Figma", "M365"]
    assert (rows["Figma"]["seats_used"], rows["M365"]["seats_used"], rows["Empty"]["seats_used"]) == (3, 5, 0)
    assert rows["Figma"]["total_seats"] == 10 and rows["Figma"]["vendor"] == "Figma Inc"
    assert Decimal(rows["Figma"]["cost_per_seat"]) == Decimal("1200.00")
    assert rows["Figma"]["renewal_date"] == "2027-01-15" and rows["M365"]["renewal_date"] is None
    assert rows["Empty"]["cost_per_seat"] is None


def test_list_pagination(world):
    p1 = client.get(URL, params={"page": 1, "page_size": 2}).json()
    p2 = client.get(URL, params={"page": 2, "page_size": 2}).json()
    assert [i["name"] for i in p1["items"]] == ["Empty", "Figma"]
    assert [i["name"] for i in p2["items"]] == ["M365"]
    assert p1["total"] == p2["total"] == 3
    assert client.get(URL, params={"page_size": 101}).status_code == 400


def test_seats_used_matches_the_analytics_endpoint(world):
    """Analytics savings reports assigned_seats/unused_seats from the same shared definition."""
    licenses = {i["id"]: i for i in client.get(URL).json()["items"]}
    res = client.get("/api/v1/analytics/savings")
    assert res.status_code == 200, res.text
    unused = {i["license_id"]: i for i in res.json()["unused_licences"]}
    # M365 is fully used (5/5) so it is not listed as unused.
    assert set(unused) == {str(world["figma"]), str(world["empty"])}
    for lic_id, item in unused.items():
        lic = licenses[lic_id]
        assert item["assigned_seats"] == lic["seats_used"]
        assert item["unused_seats"] == lic["total_seats"] - lic["seats_used"]
    assert unused[str(world["figma"])]["assigned_seats"] == 3 and unused[str(world["figma"])]["unused_seats"] == 7
    assert unused[str(world["empty"])]["assigned_seats"] == 0 and unused[str(world["empty"])]["unused_seats"] == 2


# ---- GET holders

def test_holders(world):
    res = client.get(f"{URL}/{world['figma']}/holders")
    assert res.status_code == 200
    holders = res.json()["holders"]
    assert [(h["full_name"], h["email"], h["asset_name"]) for h in holders] == [
        ("Alice Rao", "alice@example.com", "Figma seat 1"),
        ("Alice Rao", "alice@example.com", "Figma seat 2"),
        ("Bob Iyer", "bob@example.com", "Figma seat 3"),
    ]
    assert all(h["asset_tag"].startswith("AST-") for h in holders)
    assert len(holders) == client.get(URL).json()["items"][1]["seats_used"]  # Figma: matches seats_used


def test_holders_of_unused_license_is_empty_and_unknown_is_404(world):
    assert client.get(f"{URL}/{world['empty']}/holders").json() == {"holders": []}
    assert client.get(f"{URL}/{uuid.uuid4()}/holders").status_code == 404


def test_auditor_can_read_holders(world):
    _act_as(world, "auditor")
    assert client.get(f"{URL}/{world['m365']}/holders").status_code == 200


# ---- POST

@pytest.mark.parametrize("role", WRITE_ROLES)
def test_create_license(world, role):
    _act_as(world, role)
    res = client.post(URL, json={"name": " Slack ", "vendor": "Salesforce", "total_seats": 25,
                                 "cost_per_seat": "850.50", "renewal_date": "2027-03-01"})
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["name"] == "Slack" and body["total_seats"] == 25 and body["seats_used"] == 0
    assert Decimal(body["cost_per_seat"]) == Decimal("850.50") and body["renewal_date"] == "2027-03-01"
    assert _count_audit(action="software_license.created", entity_id=uuid.UUID(body["id"])) == 1


def test_auditor_cannot_create_or_patch(world):
    _act_as(world, "auditor")
    assert client.post(URL, json=NEW_BODY).status_code == 403
    assert client.patch(f"{URL}/{world['figma']}", json={"name": "Hacked"}).status_code == 403
    assert _count_audit() == 0
    assert client.get(URL).json()["items"][1]["name"] == "Figma"


@pytest.mark.parametrize("body,field", [
    ({"name": "S", "vendor": "V", "total_seats": 0}, "total_seats"),
    ({"name": "S", "vendor": "V", "total_seats": -3}, "total_seats"),
    ({"name": "S", "vendor": "V", "total_seats": 5, "cost_per_seat": "-1"}, "cost_per_seat"),
    ({"vendor": "V", "total_seats": 5}, "name"),
    ({"name": "", "vendor": "V", "total_seats": 5}, "name"),
    ({"name": "S", "total_seats": 5}, "vendor"),
    ({"name": "S", "vendor": "V", "total_seats": 5, "renewal_date": "soon"}, "renewal_date"),
])
def test_create_validation(world, body, field):
    res = client.post(URL, json=body)
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "validation_error" and field in res.json()["error"]["field_errors"]
    assert client.get(URL).json()["total"] == 3


# ---- PATCH

def test_patch_updates_only_sent_fields_and_audits(world):
    res = client.patch(f"{URL}/{world['figma']}", json={"name": "Figma Pro", "total_seats": 12})
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["name"], body["total_seats"], body["seats_used"]) == ("Figma Pro", 12, 3)
    assert body["vendor"] == "Figma Inc" and body["renewal_date"] == "2027-01-15"  # untouched
    db = TestingSessionLocal()
    log = db.query(AuditLog).filter_by(action="software_license.updated", entity_id=world["figma"]).one()
    db.close()
    assert log.before_state["name"] == "Figma" and log.before_state["total_seats"] == 10
    assert log.after_state["name"] == "Figma Pro" and log.after_state["total_seats"] == 12


def test_patch_can_clear_renewal_date_and_cost(world):
    res = client.patch(f"{URL}/{world['figma']}", json={"renewal_date": None, "cost_per_seat": None})
    assert res.status_code == 200
    assert res.json()["renewal_date"] is None and res.json()["cost_per_seat"] is None


def test_patch_total_seats_below_seats_used_is_409(world):
    res = client.patch(f"{URL}/{world['figma']}", json={"total_seats": 2})  # 3 in use
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "conflict" and "3 seat" in res.json()["error"]["message"]
    assert client.get(URL).json()["items"][1]["total_seats"] == 10  # unchanged
    assert _count_audit(action="software_license.updated") == 0


def test_patch_total_seats_equal_to_seats_used_is_allowed(world):
    res = client.patch(f"{URL}/{world['figma']}", json={"total_seats": 3})
    assert res.status_code == 200 and res.json()["total_seats"] == 3


@pytest.mark.parametrize("body,field", [
    ({}, "general"),
    ({"total_seats": 0}, "total_seats"),
    ({"cost_per_seat": "-0.01"}, "cost_per_seat"),
    ({"name": None}, "name"),
    ({"total_seats": None}, "total_seats"),
    ({"name": ""}, "name"),
])
def test_patch_validation(world, body, field):
    res = client.patch(f"{URL}/{world['figma']}", json=body)
    assert res.status_code == 400 and field in res.json()["error"]["field_errors"]


def test_patch_unknown_license_is_404(world):
    assert client.patch(f"{URL}/{uuid.uuid4()}", json={"name": "x"}).status_code == 404
