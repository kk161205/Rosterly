"""
Unit & Integration Tests for PRD §5.15 (Analytics Dashboard).
Covers:
- RBAC tests: allowed-roles and denied-roles for all 4 endpoints
- Date validation: from > to, >5-year range, defaults, standard error envelope
- Empty-data handling (returns empty series/items, no error)
- Zero-headcount handling (ratio = 0.0, no division by zero)
- Strict metric math verification against hand-computed values:
  - Asset utilization (assigned / non-retired per department, category breakdowns)
  - Cost by department (hardware vs. software allocation, Unassigned bucket)
  - Headcount-to-asset ratio trend over historical tenure and acquisition dates
  - License usage vs. entitlement (strictly > 90% warning, zero-seats, over-allocation)
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import secrets
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import CurrentUser, get_current_user
from app.db.session import Base, get_db
from app.main import app
from app.models.assets import (
    Asset,
    AssetCategory,
    AssetStatus,
    DepreciationMethod,
    SoftwareLicense,
)
from app.models.auth import Department, Permission, Role, RolePermission, User, UserStatus

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

SEED_ROLES = ["super_admin", "hr_admin", "it_admin", "manager", "employee", "auditor"]

# Exact role matrix from PRD §5.15
ANALYTICS_PERMISSIONS = {
    ("analytics", "asset_utilization"): ["super_admin", "it_admin", "auditor"],
    ("analytics", "cost_by_department"): ["super_admin", "it_admin", "hr_admin", "auditor"],
    ("analytics", "headcount_asset_ratio"): ["super_admin", "hr_admin", "auditor"],
    ("analytics", "license_usage"): ["super_admin", "it_admin", "auditor"],
}


@pytest.fixture(autouse=True)
def setup_database():
    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()

    # Clear tables
    db.query(Asset).delete()
    db.query(SoftwareLicense).delete()
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
    for (res, act), r_names in ANALYTICS_PERMISSIONS.items():
        p = Permission(id=uuid.uuid4(), resource=res, action=act, description=f"{res}:{act}")
        db.add(p)
        db.flush()
        for rn in r_names:
            db.add(RolePermission(role_id=role_objs[rn].id, permission_id=p.id))
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
# 1. RBAC Tests: Allowed & Denied Roles per §5.15 Table
# ==============================================================================

def test_rbac_asset_utilization():
    """GET /analytics/asset-utilization: super_admin, it_admin, auditor (200); others (403)."""
    for r in SEED_ROLES:
        set_user(r)
        res = client.get("/api/v1/analytics/asset-utilization")
        if r in ("super_admin", "it_admin", "auditor"):
            assert res.status_code == 200, f"Expected 200 for {r}, got {res.status_code}"
            assert "series" in res.json()
        else:
            assert res.status_code == 403, f"Expected 403 for {r}, got {res.status_code}"


def test_rbac_cost_by_department():
    """GET /analytics/cost-by-department: super_admin, it_admin, hr_admin, auditor (200); others (403)."""
    for r in SEED_ROLES:
        set_user(r)
        res = client.get("/api/v1/analytics/cost-by-department")
        if r in ("super_admin", "it_admin", "hr_admin", "auditor"):
            assert res.status_code == 200, f"Expected 200 for {r}, got {res.status_code}"
            assert "series" in res.json()
        else:
            assert res.status_code == 403, f"Expected 403 for {r}, got {res.status_code}"


def test_rbac_headcount_asset_ratio():
    """GET /analytics/headcount-asset-ratio: super_admin, hr_admin, auditor (200); others (403)."""
    for r in SEED_ROLES:
        set_user(r)
        res = client.get("/api/v1/analytics/headcount-asset-ratio")
        if r in ("super_admin", "hr_admin", "auditor"):
            assert res.status_code == 200, f"Expected 200 for {r}, got {res.status_code}"
            assert "series" in res.json()
        else:
            assert res.status_code == 403, f"Expected 403 for {r}, got {res.status_code}"


def test_rbac_license_usage():
    """GET /analytics/license-usage: super_admin, it_admin, auditor (200); others (403)."""
    for r in SEED_ROLES:
        set_user(r)
        res = client.get("/api/v1/analytics/license-usage")
        if r in ("super_admin", "it_admin", "auditor"):
            assert res.status_code == 200, f"Expected 200 for {r}, got {res.status_code}"
            assert "items" in res.json()
        else:
            assert res.status_code == 403, f"Expected 403 for {r}, got {res.status_code}"


# ==============================================================================
# 2. Date Validation & Default Boundaries
# ==============================================================================

def test_date_validation_from_after_to_rejected():
    """from > to rejected with 400 and standard error envelope."""
    set_user("super_admin")
    res = client.get("/api/v1/analytics/asset-utilization?from=2026-10-20&to=2026-10-10")
    assert res.status_code == 400
    data = res.json()
    assert data["error"]["code"] == "validation_error"
    assert "earlier than or equal" in data["error"]["message"]


def test_date_validation_exceeding_five_years_rejected():
    """Date range > 5 years rejected with 400."""
    set_user("super_admin")
    res = client.get("/api/v1/analytics/cost-by-department?from=2020-01-01&to=2026-01-01")
    assert res.status_code == 400
    data = res.json()
    assert data["error"]["code"] == "validation_error"
    assert "cannot exceed 5 years" in data["error"]["message"]


def test_date_defaults_when_omitted():
    """When both dates omitted, default to last 30 days without error."""
    set_user("super_admin")
    res = client.get("/api/v1/analytics/headcount-asset-ratio")
    assert res.status_code == 200
    # Last 30 days yields daily milestones (approximately 31 points)
    series = res.json()["series"]
    assert len(series) >= 30


def test_date_single_bound_and_inclusive_boundaries():
    """Verify supplying only 'from', only 'to', and inclusive date boundaries."""
    set_user("super_admin")
    db = TestingSessionLocal()
    role_emp = db.query(Role).filter(Role.name == "employee").first()

    # 1. Test only 'from' supplied: defaults 'to' to today
    res_from_only = client.get("/api/v1/analytics/headcount-asset-ratio?from=2026-09-17")
    assert res_from_only.status_code == 200
    series_from = res_from_only.json()["series"]
    assert series_from[0]["date"] == "2026-09-17"
    assert series_from[-1]["date"] == date.today().isoformat()

    # 2. Test only 'to' supplied: defaults 'from' to to_date - 30 days
    res_to_only = client.get("/api/v1/analytics/headcount-asset-ratio?to=2026-05-31")
    assert res_to_only.status_code == 200
    series_to = res_to_only.json()["series"]
    assert series_to[0]["date"] == "2026-05-01"
    assert series_to[-1]["date"] == "2026-05-31"

    # 3. Test inclusive date boundaries on cost-by-department:
    # Asset A: on from_date (2026-06-01) -> INCLUDED
    # Asset B: inside range (2026-06-15) -> INCLUDED
    # Asset C: on to_date (2026-06-30) -> INCLUDED
    # Asset D: 1 day before from_date (2026-05-31) -> EXCLUDED
    # Asset E: 1 day after to_date (2026-07-01) -> EXCLUDED
    dept = Department(id=uuid.uuid4(), name="BoundaryDept")
    db.add(dept)
    db.flush()

    user = User(
        id=uuid.uuid4(),
        employee_code="RST-BD1",
        full_name="Boundary User",
        email="boundary@example.com",
        password_hash="h",
        role_id=role_emp.id,
        department_id=dept.id,
        designation="Tester",
    )
    db.add(user)
    db.flush()

    dates_costs = [
        (date(2026, 6, 1), Decimal("100.00")),   # exactly 'from'
        (date(2026, 6, 15), Decimal("200.00")),  # mid
        (date(2026, 6, 30), Decimal("400.00")),  # exactly 'to'
        (date(2026, 5, 31), Decimal("1000.00")), # day before
        (date(2026, 7, 1), Decimal("2000.00")),  # day after
    ]
    for d, cost in dates_costs:
        db.add(
            Asset(
                id=uuid.uuid4(),
                asset_tag=f"AST-BD-{secrets.token_hex(3)}",
                name="Boundary Asset",
                category="laptop",
                vendor="Dell",
                purchase_date=d,
                purchase_cost=cost,
                current_value=cost,
                depreciation_method=DepreciationMethod.none,
                useful_life_months=36,
                status=AssetStatus.assigned,
                current_holder_id=user.id,
            )
        )
    db.commit()
    db.close()

    res_bound = client.get("/api/v1/analytics/cost-by-department?from=2026-06-01&to=2026-06-30")
    assert res_bound.status_code == 200
    depts = {s["department_name"]: s for s in res_bound.json()["series"]}
    assert "BoundaryDept" in depts
    # Hand-computed: 100 + 200 + 400 = 700.00 (day before 1000 and day after 2000 are excluded)
    assert float(depts["BoundaryDept"]["total_cost"]) == 700.00


# ==============================================================================
# 3. Empty Data & Zero Headcount
# ==============================================================================

def test_empty_data_returns_empty_series_or_items():
    """Empty database returns empty list, not 404 or 500 error."""
    set_user("super_admin")
    res_util = client.get("/api/v1/analytics/asset-utilization?from=2026-01-01&to=2026-01-10")
    assert res_util.status_code == 200
    assert res_util.json() == {"series": []}

    res_cost = client.get("/api/v1/analytics/cost-by-department?from=2026-01-01&to=2026-01-10")
    assert res_cost.status_code == 200
    assert res_cost.json() == {"series": []}

    res_lic = client.get("/api/v1/analytics/license-usage")
    assert res_lic.status_code == 200
    assert res_lic.json() == {"items": []}


def test_zero_headcount_does_not_divide_by_zero():
    """Zero headcount on historical milestone yields ratio = 0.0 without error."""
    set_user("super_admin")
    # Date range in the distant past before any users joined
    res = client.get("/api/v1/analytics/headcount-asset-ratio?from=2015-01-01&to=2015-01-05")
    assert res.status_code == 200
    series = res.json()["series"]
    assert len(series) > 0
    for pt in series:
        assert pt["headcount"] == 0
        assert pt["ratio"] == 0.0


# ==============================================================================
# 4. Strict Metric Math Verification Against Hand-Computed Values
# ==============================================================================

def test_asset_utilization_hand_computed_math():
    """
    Hand-computed verification for Asset Utilization:
    - Dept Engineering: 2 employees (Alice, Bob)
      - Alice holds: Laptop 1 (assigned, cat=laptop), Monitor 1 (assigned, cat=monitor)
      - Bob holds: Laptop 2 (under_maintenance, cat=laptop)
      - Alice holds: Laptop 3 (retired, cat=laptop) -> excluded from non-retired
      - Unassigned stock: Laptop 4 (in_stock, cat=laptop) -> excluded from department rows
    Expected Engineering:
      - assigned_count = 2 (Laptop 1, Monitor 1)
      - total_count = 3 (Laptop 1, Monitor 1, Laptop 2)
      - utilization_rate = round(2 / 3 * 100, 2) = 66.67
      - categories:
        - "laptop": assigned = 1, total = 2
        - "monitor": assigned = 1, total = 1
    """
    set_user("super_admin")
    db = TestingSessionLocal()
    role_emp = db.query(Role).filter(Role.name == "employee").first()

    dept_eng = Department(id=uuid.uuid4(), name="Engineering")
    dept_sales = Department(id=uuid.uuid4(), name="Sales")
    db.add_all([dept_eng, dept_sales])
    db.flush()

    alice = User(
        id=uuid.uuid4(),
        employee_code="RST-ALICE",
        full_name="Alice",
        email="alice@example.com",
        password_hash="h",
        role_id=role_emp.id,
        department_id=dept_eng.id,
        designation="Eng",
    )
    bob = User(
        id=uuid.uuid4(),
        employee_code="RST-BOB",
        full_name="Bob",
        email="bob@example.com",
        password_hash="h",
        role_id=role_emp.id,
        department_id=dept_eng.id,
        designation="Eng",
    )
    db.add_all([alice, bob])
    db.flush()

    p_date = date(2026, 1, 15)

    a1 = Asset(
        id=uuid.uuid4(),
        asset_tag="AST-001",
        name="Laptop 1",
        category="laptop",
        vendor="Dell",
        purchase_date=p_date,
        purchase_cost=Decimal("1000.00"),
        current_value=Decimal("1000.00"),
        depreciation_method=DepreciationMethod.none,
        useful_life_months=36,
        status=AssetStatus.assigned,
        current_holder_id=alice.id,
    )
    a2 = Asset(
        id=uuid.uuid4(),
        asset_tag="AST-002",
        name="Monitor 1",
        category="monitor",
        vendor="LG",
        purchase_date=p_date,
        purchase_cost=Decimal("300.00"),
        current_value=Decimal("300.00"),
        depreciation_method=DepreciationMethod.none,
        useful_life_months=36,
        status=AssetStatus.assigned,
        current_holder_id=alice.id,
    )
    a3 = Asset(
        id=uuid.uuid4(),
        asset_tag="AST-003",
        name="Laptop 2",
        category="laptop",
        vendor="Lenovo",
        purchase_date=p_date,
        purchase_cost=Decimal("1200.00"),
        current_value=Decimal("1200.00"),
        depreciation_method=DepreciationMethod.none,
        useful_life_months=36,
        status=AssetStatus.under_maintenance,
        current_holder_id=bob.id,
    )
    a4_retired = Asset(
        id=uuid.uuid4(),
        asset_tag="AST-004",
        name="Laptop 3 Retired",
        category="laptop",
        vendor="Dell",
        purchase_date=p_date,
        purchase_cost=Decimal("800.00"),
        current_value=Decimal("0.00"),
        depreciation_method=DepreciationMethod.none,
        useful_life_months=36,
        status=AssetStatus.retired,
        current_holder_id=alice.id,
    )
    a5_unassigned = Asset(
        id=uuid.uuid4(),
        asset_tag="AST-005",
        name="In Stock Laptop",
        category="laptop",
        vendor="Dell",
        purchase_date=p_date,
        purchase_cost=Decimal("1500.00"),
        current_value=Decimal("1500.00"),
        depreciation_method=DepreciationMethod.none,
        useful_life_months=36,
        status=AssetStatus.in_stock,
        current_holder_id=None,
    )
    a6_lost = Asset(
        id=uuid.uuid4(),
        asset_tag="AST-006",
        name="Lost Tablet",
        category="tablet",
        vendor="Apple",
        purchase_date=p_date,
        purchase_cost=Decimal("600.00"),
        current_value=Decimal("600.00"),
        depreciation_method=DepreciationMethod.none,
        useful_life_months=24,
        status=AssetStatus.lost,
        current_holder_id=bob.id,
    )
    db.add_all([a1, a2, a3, a4_retired, a5_unassigned, a6_lost])
    db.commit()
    dept_eng_id = dept_eng.id
    db.close()

    res = client.get("/api/v1/analytics/asset-utilization?from=2026-01-01&to=2026-01-31")
    assert res.status_code == 200
    series = res.json()["series"]
    assert len(series) == 1
    eng_stat = series[0]
    assert eng_stat["department_id"] == str(dept_eng_id)
    assert eng_stat["department_name"] == "Engineering"
    # Denominator = 4 (Laptop 1 [assigned], Monitor 1 [assigned], Laptop 2 [under_maintenance], Tablet [lost])
    # Numerator = 2 (Laptop 1 [assigned], Monitor 1 [assigned])
    # Excluded: Laptop 3 [retired] and In Stock Laptop [unassigned / no holder]
    assert eng_stat["assigned_count"] == 2
    assert eng_stat["total_count"] == 4
    assert eng_stat["utilization_rate"] == 50.00

    # Check categories breakdown
    cats = {c["category"]: c for c in eng_stat["categories"]}
    assert cats["laptop"]["assigned"] == 1
    assert cats["laptop"]["total"] == 2
    assert cats["monitor"]["assigned"] == 1
    assert cats["monitor"]["total"] == 1
    assert cats["tablet"]["assigned"] == 0
    assert cats["tablet"]["total"] == 1

    # Filter by specific department_id
    res_filt = client.get(f"/api/v1/analytics/asset-utilization?department_id={dept_eng_id}&from=2026-01-01&to=2026-01-31")
    assert res_filt.status_code == 200
    assert len(res_filt.json()["series"]) == 1

    # Filter by non-existent department returns empty series
    res_none = client.get(f"/api/v1/analytics/asset-utilization?department_id={uuid.uuid4()}&from=2026-01-01&to=2026-01-31")
    assert res_none.status_code == 200
    assert res_none.json()["series"] == []


def test_asset_utilization_includes_older_assets_before_from_date():
    """
    Regression test: Asset utilization represents active fleet capacity.
    Assets purchased before 'from_date' (e.g. 2 years ago) MUST be included
    in utilization, provided purchase_date <= to_date and status != 'retired'.
    Assets purchased after 'to_date' are excluded.
    """
    set_user("super_admin")
    db = TestingSessionLocal()
    role_emp = db.query(Role).filter(Role.name == "employee").first()

    dept = Department(id=uuid.uuid4(), name="Operations")
    db.add(dept)
    db.flush()

    worker = User(
        id=uuid.uuid4(),
        employee_code="RST-OPS1",
        full_name="Ops Worker",
        email="ops@example.com",
        password_hash="h",
        role_id=role_emp.id,
        department_id=dept.id,
        designation="Operator",
    )
    db.add(worker)
    db.flush()

    # Asset 1: Purchased 2024-01-15 (older asset, far before from_date 2026-10-01) -> INCLUDED
    older_asset = Asset(
        id=uuid.uuid4(),
        asset_tag="AST-OLD-1",
        name="Legacy Laptop",
        category="laptop",
        vendor="Lenovo",
        purchase_date=date(2024, 1, 15),
        purchase_cost=Decimal("1200.00"),
        current_value=Decimal("400.00"),
        depreciation_method=DepreciationMethod.none,
        useful_life_months=36,
        status=AssetStatus.assigned,
        current_holder_id=worker.id,
    )
    # Asset 2: Purchased 2026-11-15 (after to_date 2026-10-31) -> EXCLUDED
    future_asset = Asset(
        id=uuid.uuid4(),
        asset_tag="AST-FUT-1",
        name="Future Laptop",
        category="laptop",
        vendor="Lenovo",
        purchase_date=date(2026, 11, 15),
        purchase_cost=Decimal("1500.00"),
        current_value=Decimal("1500.00"),
        depreciation_method=DepreciationMethod.none,
        useful_life_months=36,
        status=AssetStatus.assigned,
        current_holder_id=worker.id,
    )
    db.add_all([older_asset, future_asset])
    db.commit()
    dept_id = dept.id
    db.close()

    res = client.get(f"/api/v1/analytics/asset-utilization?department_id={dept_id}&from=2026-10-01&to=2026-10-31")
    assert res.status_code == 200
    series = res.json()["series"]
    assert len(series) == 1
    stat = series[0]
    assert stat["department_name"] == "Operations"
    # The older 2024 asset is included; the future asset is excluded
    assert stat["total_count"] == 1
    assert stat["assigned_count"] == 1
    assert stat["utilization_rate"] == 100.0


def test_cost_by_department_hand_computed_math():
    """
    Hand-computed verification for Cost by Department:
    - Dept Engineering has:
      - Laptop 1 (1000.00, hardware)
      - Software License 1 (500.00, software_license)
    - Unassigned has:
      - Laptop In Stock (1500.00, hardware)
    Expected:
      - Engineering: hardware = 1000.00, software = 500.00, total = 1500.00
      - Unassigned: hardware = 1500.00, software = 0.00, total = 1500.00
    """
    set_user("super_admin")
    db = TestingSessionLocal()
    role_emp = db.query(Role).filter(Role.name == "employee").first()

    dept_eng = Department(id=uuid.uuid4(), name="Engineering")
    db.add(dept_eng)
    db.flush()

    emp = User(
        id=uuid.uuid4(),
        employee_code="RST-EMP1",
        full_name="Emp 1",
        email="emp1@example.com",
        password_hash="h",
        role_id=role_emp.id,
        department_id=dept_eng.id,
        designation="Eng",
    )
    db.add(emp)
    db.flush()

    p_date = date(2026, 2, 10)

    a1 = Asset(
        id=uuid.uuid4(),
        asset_tag="AST-C1",
        name="Laptop Hardware",
        category="laptop",
        vendor="Dell",
        purchase_date=p_date,
        purchase_cost=Decimal("1000.00"),
        current_value=Decimal("1000.00"),
        depreciation_method=DepreciationMethod.none,
        useful_life_months=36,
        status=AssetStatus.assigned,
        current_holder_id=emp.id,
    )
    a2_sw = Asset(
        id=uuid.uuid4(),
        asset_tag="AST-C2",
        name="Software Seat",
        category="software_license",
        vendor="Microsoft",
        purchase_date=p_date,
        purchase_cost=Decimal("500.00"),
        current_value=Decimal("500.00"),
        depreciation_method=DepreciationMethod.none,
        useful_life_months=12,
        status=AssetStatus.assigned,
        current_holder_id=emp.id,
    )
    a3_unassigned = Asset(
        id=uuid.uuid4(),
        asset_tag="AST-C3",
        name="Unassigned Stock",
        category="laptop",
        vendor="Apple",
        purchase_date=p_date,
        purchase_cost=Decimal("1500.00"),
        current_value=Decimal("1500.00"),
        depreciation_method=DepreciationMethod.none,
        useful_life_months=36,
        status=AssetStatus.in_stock,
        current_holder_id=None,
    )
    db.add_all([a1, a2_sw, a3_unassigned])
    db.commit()
    dept_eng_id = dept_eng.id
    db.close()

    res = client.get("/api/v1/analytics/cost-by-department?from=2026-02-01&to=2026-02-28")
    assert res.status_code == 200
    series = res.json()["series"]
    assert len(series) == 2

    by_dept = {s["department_name"]: s for s in series}
    eng = by_dept["Engineering"]
    assert eng["department_id"] == str(dept_eng_id)
    assert float(eng["hardware_cost"]) == 1000.00
    assert float(eng["software_cost"]) == 500.00
    assert float(eng["total_cost"]) == 1500.00

    unassigned = by_dept["Unassigned"]
    assert unassigned["department_id"] is None
    assert float(unassigned["hardware_cost"]) == 1500.00
    assert float(unassigned["software_cost"]) == 0.00
    assert float(unassigned["total_cost"]) == 1500.00


def test_headcount_asset_ratio_hand_computed_math():
    """
    Hand-computed verification for Headcount-to-Asset Ratio Trend:
    - User 1: joined 2026-03-01, no exit date
    - User 2: joined 2026-03-15, exited 2026-03-25
    - Asset 1: purchased 2026-03-05 (status assigned)
    - Asset 2: purchased 2026-03-20 (status in_stock)
    Tested dates:
      - 2026-03-10: User 1 active (hc=1), Asset 1 purchased (ac=1) -> ratio = 1.00
      - 2026-03-22: User 1 and User 2 active (hc=2), Asset 1 and 2 purchased (ac=2) -> ratio = 1.00
      - 2026-03-28: User 2 exited, only User 1 (hc=1), Asset 1 and 2 purchased (ac=2) -> ratio = 2.00
    """
    _, sa_user = set_user("super_admin")
    db = TestingSessionLocal()
    # Set super_admin join date in the future so only u1 and u2 are active during March 2026 test window
    db.query(User).filter(User.id == sa_user.id).update({"date_of_joining": date(2027, 1, 1)})
    role_emp = db.query(Role).filter(Role.name == "employee").first()

    u1 = User(
        id=uuid.uuid4(),
        employee_code="RST-H1",
        full_name="Permanent User",
        email="perm@example.com",
        password_hash="h",
        role_id=role_emp.id,
        date_of_joining=date(2026, 3, 1),
        date_of_exit=None,
        status=UserStatus.active,
        designation="Dev",
    )
    u2 = User(
        id=uuid.uuid4(),
        employee_code="RST-H2",
        full_name="Temporary User",
        email="temp@example.com",
        password_hash="h",
        role_id=role_emp.id,
        date_of_joining=date(2026, 3, 15),
        date_of_exit=date(2026, 3, 25),
        status=UserStatus.terminated,
        designation="Contractor",
    )
    db.add_all([u1, u2])

    a1 = Asset(
        id=uuid.uuid4(),
        asset_tag="AST-H1",
        name="Asset 1",
        category="laptop",
        vendor="Dell",
        purchase_date=date(2026, 3, 5),
        purchase_cost=Decimal("1000.00"),
        current_value=Decimal("1000.00"),
        depreciation_method=DepreciationMethod.none,
        useful_life_months=36,
        status=AssetStatus.assigned,
    )
    a2 = Asset(
        id=uuid.uuid4(),
        asset_tag="AST-H2",
        name="Asset 2",
        category="laptop",
        vendor="Dell",
        purchase_date=date(2026, 3, 20),
        purchase_cost=Decimal("1000.00"),
        current_value=Decimal("1000.00"),
        depreciation_method=DepreciationMethod.none,
        useful_life_months=36,
        status=AssetStatus.in_stock,
    )
    db.add_all([a1, a2])
    db.commit()
    db.close()

    res = client.get("/api/v1/analytics/headcount-asset-ratio?from=2026-03-01&to=2026-03-31")
    assert res.status_code == 200
    series = res.json()["series"]
    by_date = {s["date"]: s for s in series}

    # 2026-03-10: hc=1, ac=1, ratio=1.00
    pt_10 = by_date["2026-03-10"]
    assert pt_10["headcount"] == 1
    assert pt_10["asset_count"] == 1
    assert pt_10["ratio"] == 1.00

    # 2026-03-22: hc=2, ac=2, ratio=1.00
    pt_22 = by_date["2026-03-22"]
    assert pt_22["headcount"] == 2
    assert pt_22["asset_count"] == 2
    assert pt_22["ratio"] == 1.00

    # 2026-03-28: hc=1, ac=2, ratio=2.00
    pt_28 = by_date["2026-03-28"]
    assert pt_28["headcount"] == 1
    assert pt_28["asset_count"] == 2
    assert pt_28["ratio"] == 2.00


def test_license_usage_hand_computed_math_and_thresholds():
    """
    Hand-computed verification for License Usage:
    - Lic 1: 10 seats, 9 assigned -> 90.00% utilization -> status "ok" (not > 90)
    - Lic 2: 10 seats, 10 assigned -> 100.00% utilization -> status "warning" (> 90)
    - Lic 3: 10 seats, 11 assigned (over-allocated) -> 110.00% utilization -> status "warning"
    - Lic 4: 0 seats, 0 assigned -> 0.0% -> status "ok"
    - Lic 5: 0 seats, 2 assigned -> 0.0% -> status "warning"
    """
    set_user("super_admin")
    db = TestingSessionLocal()

    lic1 = SoftwareLicense(id=uuid.uuid4(), name="Lic 90 Pct", vendor="V1", total_seats=10, cost_per_seat=Decimal("10.00"))
    lic2 = SoftwareLicense(id=uuid.uuid4(), name="Lic 100 Pct", vendor="V2", total_seats=10, cost_per_seat=Decimal("20.00"))
    lic3 = SoftwareLicense(id=uuid.uuid4(), name="Lic Over", vendor="V3", total_seats=10, cost_per_seat=Decimal("30.00"))
    lic4 = SoftwareLicense(id=uuid.uuid4(), name="Lic Zero Empty", vendor="V4", total_seats=0, cost_per_seat=Decimal("0.00"))
    lic5 = SoftwareLicense(id=uuid.uuid4(), name="Lic Zero Assigned", vendor="V5", total_seats=0, cost_per_seat=Decimal("0.00"))
    db.add_all([lic1, lic2, lic3, lic4, lic5])
    db.flush()

    def create_assigned_assets(license_id, count):
        for i in range(count):
            a = Asset(
                id=uuid.uuid4(),
                asset_tag=f"AST-L-{secrets.token_hex(3)}",
                name="Software Seat Asset",
                category="software_license",
                vendor="Vendor",
                purchase_date=date(2026, 1, 1),
                purchase_cost=Decimal("10.00"),
                current_value=Decimal("10.00"),
                depreciation_method=DepreciationMethod.none,
                useful_life_months=12,
                status=AssetStatus.assigned,
                license_id=license_id,
            )
            db.add(a)

    create_assigned_assets(lic1.id, 9)
    create_assigned_assets(lic2.id, 10)
    create_assigned_assets(lic3.id, 11)
    create_assigned_assets(lic5.id, 2)
    db.commit()
    db.close()

    res = client.get("/api/v1/analytics/license-usage")
    assert res.status_code == 200
    items = {it["name"]: it for it in res.json()["items"]}

    # Lic 1: 90.00%, status "ok"
    assert items["Lic 90 Pct"]["assigned_seats"] == 9
    assert items["Lic 90 Pct"]["available_seats"] == 1
    assert items["Lic 90 Pct"]["utilization_rate"] == 90.00
    assert items["Lic 90 Pct"]["status"] == "ok"

    # Lic 2: 100.00%, status "warning"
    assert items["Lic 100 Pct"]["assigned_seats"] == 10
    assert items["Lic 100 Pct"]["available_seats"] == 0
    assert items["Lic 100 Pct"]["utilization_rate"] == 100.00
    assert items["Lic 100 Pct"]["status"] == "warning"

    # Lic 3: 110.00%, status "warning"
    assert items["Lic Over"]["assigned_seats"] == 11
    assert items["Lic Over"]["available_seats"] == -1
    assert items["Lic Over"]["utilization_rate"] == 110.00
    assert items["Lic Over"]["status"] == "warning"

    # Lic 4: 0 seats, 0 assigned -> 0.0%, status "ok"
    assert items["Lic Zero Empty"]["total_seats"] == 0
    assert items["Lic Zero Empty"]["assigned_seats"] == 0
    assert items["Lic Zero Empty"]["utilization_rate"] == 0.0
    assert items["Lic Zero Empty"]["status"] == "ok"

    # Lic 5: 0 seats, 2 assigned -> 0.0%, status "warning"
    assert items["Lic Zero Assigned"]["total_seats"] == 0
    assert items["Lic Zero Assigned"]["assigned_seats"] == 2
    assert items["Lic Zero Assigned"]["utilization_rate"] == 0.0
    assert items["Lic Zero Assigned"]["status"] == "warning"
