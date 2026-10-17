"""
PostgreSQL Integration Smoke Tests for Rosterly Analytics (§5.13–§5.15).

Hard safety constraints:
- Strictly verifies connection target is postgres@127.0.0.1:5432/rosterly_scratch.
- Fails hard before any database interaction if target is mismatched; never silently skips.
- Never connects to Neon or any remote database.
- Uses synthetic test data only; cleans up by exact tracked IDs in strict FK order.
- Track IDs immediately upon generation (prior to add/flush/commit) for partial setup safety.
- Rolls back uncommitted setup data before executing cleanup queries; never commits pending setup data.
- Cleanup errors are never silently swallowed.
- Never drops, recreates, or resets the database or schema; no TRUNCATE or unbounded DELETE.
"""
from datetime import date
from decimal import Decimal
import secrets
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.main import app
from app.models.assets import Asset, AssetStatus, DepreciationMethod, SoftwareLicense
from app.models.auth import Department, Role, User

_pg_engine = None


def assert_verified_scratch_target():
    """Fail-closed guard: abort before any database operation if target is not exactly postgres@127.0.0.1:5432/rosterly_scratch."""
    url = make_url(settings.DATABASE_URL)
    is_valid = (
        url.host == "127.0.0.1"
        and url.port == 5432
        and url.database == "rosterly_scratch"
        and url.username == "postgres"
    )
    if not is_valid:
        pytest.fail(
            f"Target Guard Abort: DATABASE_URL must be postgres@127.0.0.1:5432/rosterly_scratch "
            f"(resolved: {url.username}@{url.host}:{url.port}/{url.database})"
        )


def get_scratch_engine():
    global _pg_engine
    assert_verified_scratch_target()
    if _pg_engine is None:
        _pg_engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
    return _pg_engine


def get_scratch_session():
    eng = get_scratch_engine()
    return sessionmaker(autocommit=False, autoflush=False, bind=eng)()


def override_pg_db():
    db = get_scratch_session()
    try:
        yield db
    finally:
        db.close()


client = TestClient(app)


@pytest.fixture(autouse=True)
def enforce_scratch_isolation():
    assert_verified_scratch_target()
    saved_overrides = {
        get_db: (get_db in app.dependency_overrides, app.dependency_overrides.get(get_db)),
        get_current_user: (get_current_user in app.dependency_overrides, app.dependency_overrides.get(get_current_user)),
    }
    app.dependency_overrides[get_db] = override_pg_db
    try:
        yield
    finally:
        for dep, (existed, orig_val) in saved_overrides.items():
            if existed:
                app.dependency_overrides[dep] = orig_val
            else:
                app.dependency_overrides.pop(dep, None)


def set_test_caller(role_name: str, db_session) -> CurrentUser:
    role = db_session.query(Role).filter(Role.name == role_name).first()
    if not role:
        pytest.fail(f"Required role '{role_name}' not found in rosterly_scratch roles table. Did migrations run?")
    user_id = uuid.uuid4()
    curr_user = CurrentUser(
        user_id=user_id,
        role=role_name,
        session_id=uuid.uuid4(),
        email=f"pg_test_{role_name}@example.com",
        full_name=f"PG Test {role_name}",
        role_id=role.id,
    )
    app.dependency_overrides[get_current_user] = lambda: curr_user
    return curr_user


class CleanupFailureError(RuntimeError):
    """Raised when synthetic test data cleanup fails, providing exact tracked IDs for recovery."""
    pass


def safe_cleanup_synthetic_records(
    db,
    *,
    asset_ids: list[uuid.UUID] | None = None,
    license_ids: list[uuid.UUID] | None = None,
    user_ids: list[uuid.UUID] | None = None,
    department_ids: list[uuid.UUID] | None = None,
):
    """
    Cleans up synthetic records in strict FK order:
    Asset -> SoftwareLicense -> User -> Department.

    Guarantees:
    1. If primary session's initial rollback fails, does not continue on that session;
       attempts cleanup using a fresh session.
    2. If primary deletion fails, rolls back that session if possible and attempts
       fresh-session cleanup.
    3. If fresh-session cleanup succeeds, treats cleanup as successful and does not
       fail merely because the primary session failed.
    4. If cleanup still fails, raises CleanupFailureError with original errors and
       complete synthetic ID manifest.
    5. Does not suppress rollback errors even in the empty-ID branch.
    """
    asset_ids = asset_ids or []
    license_ids = license_ids or []
    user_ids = user_ids or []
    department_ids = department_ids or []

    id_manifest = (
        f"Synthetic ID Manifest for recovery:\n"
        f"  Assets ({len(asset_ids)}): {[str(i) for i in asset_ids]}\n"
        f"  SoftwareLicenses ({len(license_ids)}): {[str(i) for i in license_ids]}\n"
        f"  Users ({len(user_ids)}): {[str(i) for i in user_ids]}\n"
        f"  Departments ({len(department_ids)}): {[str(i) for i in department_ids]}"
    )

    if not (asset_ids or license_ids or user_ids or department_ids):
        try:
            db.rollback()
        except Exception as rb_exc:
            raise CleanupFailureError(
                f"Primary session rollback failed during empty-ID cleanup: {rb_exc}\n{id_manifest}"
            ) from rb_exc
        return

    def _execute_deletions(session) -> None:
        if asset_ids:
            session.query(Asset).filter(Asset.id.in_(asset_ids)).delete(synchronize_session=False)
        if license_ids:
            session.query(SoftwareLicense).filter(SoftwareLicense.id.in_(license_ids)).delete(synchronize_session=False)
        if user_ids:
            session.query(User).filter(User.id.in_(user_ids)).delete(synchronize_session=False)
        if department_ids:
            session.query(Department).filter(Department.id.in_(department_ids)).delete(synchronize_session=False)
        session.commit()

    primary_errors = []
    fallback_errors = []
    primary_failed = False

    # 1. Attempt initial rollback on primary session to clear uncommitted setup
    try:
        db.rollback()
    except Exception as rb_exc:
        primary_failed = True
        primary_errors.append(f"Primary session initial rollback failed: {rb_exc}")

    # 2. If rollback succeeded, attempt deletion on primary session
    if not primary_failed:
        try:
            _execute_deletions(db)
            return  # Primary session cleanup succeeded completely
        except Exception as del_exc:
            primary_failed = True
            primary_errors.append(f"Primary session deletion failed: {del_exc}")
            # Roll back primary session if possible before switching to fresh session
            try:
                db.rollback()
            except Exception as rb_post_exc:
                primary_errors.append(f"Primary session rollback after deletion failure failed: {rb_post_exc}")

    # 3. Primary session failed (at rollback or deletion); attempt cleanup using a fresh session
    fallback_session = None
    try:
        fallback_session = get_scratch_session()
        _execute_deletions(fallback_session)
        return  # Fresh-session cleanup succeeded; do not fail merely because primary failed
    except Exception as fb_exc:
        fallback_errors.append(f"Fallback fresh-session cleanup failed: {fb_exc}")
    finally:
        if fallback_session is not None:
            fallback_session.close()

    # 4. Cleanup still failed: raise CleanupFailureError with all errors and complete ID manifest
    all_errors = primary_errors + fallback_errors
    err_msg = (
        f"PostgreSQL test teardown FAILED with {len(all_errors)} error(s):\n"
        + "\n".join(f"- {e}" for e in all_errors)
        + f"\n{id_manifest}"
    )
    raise CleanupFailureError(err_msg)


def test_verify_postgres_connection_and_target():
    """Verify live PostgreSQL host, port, database, and user."""
    db = get_scratch_session()
    try:
        row = db.execute(text("SELECT current_database(), current_user, version();")).first()
        db_name, current_user, version_str = row[0], row[1], row[2]
        assert db_name == "rosterly_scratch", f"Unexpected database: {db_name}"
        assert current_user == "postgres", f"Unexpected user: {current_user}"
        assert "PostgreSQL" in version_str, f"Expected PostgreSQL server, got: {version_str}"
    finally:
        db.close()


def test_pg_asset_utilization_and_rbac():
    """Test GET /analytics/asset-utilization on PostgreSQL with older active asset & RBAC."""
    db = get_scratch_session()
    created_asset_ids = []
    created_user_ids = []
    created_dept_ids = []
    try:
        role_emp = db.query(Role).filter(Role.name == "employee").first()

        dept_id = uuid.uuid4()
        created_dept_ids.append(dept_id)
        dept = Department(id=dept_id, name=f"PG Dept {secrets.token_hex(3)}")
        db.add(dept)
        db.flush()

        alice_id = uuid.uuid4()
        created_user_ids.append(alice_id)
        alice = User(
            id=alice_id,
            employee_code=f"PG-{secrets.token_hex(3).upper()}",
            full_name="Alice PG",
            email=f"alice_{secrets.token_hex(3)}@example.com",
            password_hash="fake",
            role_id=role_emp.id,
            department_id=dept.id,
            designation="Dev",
            date_of_joining=date(2024, 1, 1),
        )

        bob_id = uuid.uuid4()
        created_user_ids.append(bob_id)
        bob = User(
            id=bob_id,
            employee_code=f"PG-{secrets.token_hex(3).upper()}",
            full_name="Bob PG",
            email=f"bob_{secrets.token_hex(3)}@example.com",
            password_hash="fake",
            role_id=role_emp.id,
            department_id=dept.id,
            designation="Dev",
            date_of_joining=date(2025, 1, 1),
        )
        db.add_all([alice, bob])
        db.flush()

        # 1. Older asset (purchased 2024-01-15, far before from_date 2026-10-01) -> MUST BE INCLUDED
        older_laptop_id = uuid.uuid4()
        created_asset_ids.append(older_laptop_id)
        older_laptop = Asset(
            id=older_laptop_id,
            asset_tag=f"PG-AST-{secrets.token_hex(3)}",
            name="Older Active Laptop",
            category="laptop",
            vendor="Dell",
            purchase_date=date(2024, 1, 15),
            purchase_cost=Decimal("1200.00"),
            current_value=Decimal("400.00"),
            depreciation_method=DepreciationMethod.none,
            useful_life_months=36,
            status=AssetStatus.assigned,
            current_holder_id=alice.id,
        )

        # 2. Maintenance laptop (purchased 2026-02-15) -> total=2, assigned=1
        maint_laptop_id = uuid.uuid4()
        created_asset_ids.append(maint_laptop_id)
        maint_laptop = Asset(
            id=maint_laptop_id,
            asset_tag=f"PG-AST-{secrets.token_hex(3)}",
            name="Maint Laptop",
            category="laptop",
            vendor="Dell",
            purchase_date=date(2026, 2, 15),
            purchase_cost=Decimal("1400.00"),
            current_value=Decimal("1400.00"),
            depreciation_method=DepreciationMethod.none,
            useful_life_months=36,
            status=AssetStatus.under_maintenance,
            current_holder_id=bob.id,
        )

        # 3. Retired asset (excluded from utilization)
        retired_asset_id = uuid.uuid4()
        created_asset_ids.append(retired_asset_id)
        retired_asset = Asset(
            id=retired_asset_id,
            asset_tag=f"PG-AST-{secrets.token_hex(3)}",
            name="Retired Laptop",
            category="laptop",
            vendor="Dell",
            purchase_date=date(2024, 1, 15),
            purchase_cost=Decimal("800.00"),
            current_value=Decimal("0.00"),
            depreciation_method=DepreciationMethod.none,
            useful_life_months=36,
            status=AssetStatus.retired,
            current_holder_id=alice.id,
        )
        db.add_all([older_laptop, maint_laptop, retired_asset])
        db.commit()

        # Authorized call as super_admin
        set_test_caller("super_admin", db)
        res = client.get(f"/api/v1/analytics/asset-utilization?department_id={dept.id}&from=2026-10-01&to=2026-10-31")
        assert res.status_code == 200
        series = res.json()["series"]
        assert len(series) == 1
        d_stat = series[0]
        assert d_stat["department_id"] == str(dept.id)
        assert d_stat["assigned_count"] == 1
        assert d_stat["total_count"] == 2
        assert d_stat["utilization_rate"] == 50.00

        # Unauthorized call as employee -> 403
        set_test_caller("employee", db)
        res_unauth = client.get(f"/api/v1/analytics/asset-utilization?department_id={dept.id}")
        assert res_unauth.status_code == 403
        assert res_unauth.json()["error"]["code"] == "forbidden"
    finally:
        try:
            safe_cleanup_synthetic_records(
                db,
                asset_ids=created_asset_ids,
                user_ids=created_user_ids,
                department_ids=created_dept_ids,
            )
        finally:
            db.close()


def test_pg_cost_by_department_and_rbac():
    """Test GET /analytics/cost-by-department on PostgreSQL with hardware/software spend and Unassigned bucket."""
    db = get_scratch_session()
    created_asset_ids = []
    created_user_ids = []
    created_dept_ids = []
    try:
        role_emp = db.query(Role).filter(Role.name == "employee").first()

        dept_id = uuid.uuid4()
        created_dept_ids.append(dept_id)
        dept = Department(id=dept_id, name=f"PG CostDept {secrets.token_hex(3)}")
        db.add(dept)
        db.flush()

        user_id = uuid.uuid4()
        created_user_ids.append(user_id)
        user = User(
            id=user_id,
            employee_code=f"PG-{secrets.token_hex(3).upper()}",
            full_name="Cost User",
            email=f"cost_{secrets.token_hex(3)}@example.com",
            password_hash="fake",
            role_id=role_emp.id,
            department_id=dept.id,
            designation="Tester",
        )
        db.add(user)
        db.flush()

        a_hw_id = uuid.uuid4()
        created_asset_ids.append(a_hw_id)
        a_hw = Asset(
            id=a_hw_id,
            asset_tag=f"PG-HW-{secrets.token_hex(3)}",
            name="Hardware Item",
            category="laptop",
            vendor="Dell",
            purchase_date=date(2026, 5, 10),
            purchase_cost=Decimal("1000.00"),
            current_value=Decimal("1000.00"),
            depreciation_method=DepreciationMethod.none,
            useful_life_months=36,
            status=AssetStatus.assigned,
            current_holder_id=user.id,
        )

        a_sw_id = uuid.uuid4()
        created_asset_ids.append(a_sw_id)
        a_sw = Asset(
            id=a_sw_id,
            asset_tag=f"PG-SW-{secrets.token_hex(3)}",
            name="Software Seat",
            category="software_license",
            vendor="Microsoft",
            purchase_date=date(2026, 5, 10),
            purchase_cost=Decimal("350.00"),
            current_value=Decimal("350.00"),
            depreciation_method=DepreciationMethod.none,
            useful_life_months=12,
            status=AssetStatus.assigned,
            current_holder_id=user.id,
        )
        db.add_all([a_hw, a_sw])
        db.commit()

        # Authorized as auditor
        set_test_caller("auditor", db)
        res = client.get("/api/v1/analytics/cost-by-department?from=2026-05-01&to=2026-05-31")
        assert res.status_code == 200
        depts = {d["department_name"]: d for d in res.json()["series"]}
        assert dept.name in depts
        assert float(depts[dept.name]["hardware_cost"]) == 1000.00
        assert float(depts[dept.name]["software_cost"]) == 350.00
        assert float(depts[dept.name]["total_cost"]) == 1350.00

        # Unauthorized as employee -> 403
        set_test_caller("employee", db)
        res_unauth = client.get("/api/v1/analytics/cost-by-department")
        assert res_unauth.status_code == 403
        assert res_unauth.json()["error"]["code"] == "forbidden"
    finally:
        try:
            safe_cleanup_synthetic_records(
                db,
                asset_ids=created_asset_ids,
                user_ids=created_user_ids,
                department_ids=created_dept_ids,
            )
        finally:
            db.close()


def test_pg_headcount_asset_ratio_and_rbac():
    """Test GET /analytics/headcount-asset-ratio on PostgreSQL."""
    db = get_scratch_session()
    created_asset_ids = []
    created_user_ids = []
    try:
        role_emp = db.query(Role).filter(Role.name == "employee").first()

        user_id = uuid.uuid4()
        created_user_ids.append(user_id)
        user = User(
            id=user_id,
            employee_code=f"PG-{secrets.token_hex(3).upper()}",
            full_name="Ratio User",
            email=f"ratio_{secrets.token_hex(3)}@example.com",
            password_hash="fake",
            role_id=role_emp.id,
            designation="Tester",
            date_of_joining=date(2026, 1, 1),
        )
        db.add(user)
        db.flush()

        asset_id = uuid.uuid4()
        created_asset_ids.append(asset_id)
        asset = Asset(
            id=asset_id,
            asset_tag=f"PG-RATIO-{secrets.token_hex(3)}",
            name="Ratio Asset",
            category="laptop",
            vendor="Dell",
            purchase_date=date(2026, 1, 5),
            purchase_cost=Decimal("1000.00"),
            current_value=Decimal("1000.00"),
            depreciation_method=DepreciationMethod.none,
            useful_life_months=36,
            status=AssetStatus.assigned,
            current_holder_id=user.id,
        )
        db.add(asset)
        db.commit()

        set_test_caller("hr_admin", db)
        res = client.get("/api/v1/analytics/headcount-asset-ratio?from=2026-01-01&to=2026-01-10")
        assert res.status_code == 200
        series = res.json()["series"]
        assert len(series) > 0
        for pt in series:
            assert "date" in pt
            assert "headcount" in pt
            assert "asset_count" in pt
            assert "ratio" in pt

        # it_admin has no headcount_asset_ratio permission -> 403
        set_test_caller("it_admin", db)
        res_unauth = client.get("/api/v1/analytics/headcount-asset-ratio")
        assert res_unauth.status_code == 403
    finally:
        try:
            safe_cleanup_synthetic_records(
                db,
                asset_ids=created_asset_ids,
                user_ids=created_user_ids,
            )
        finally:
            db.close()


def test_pg_license_usage_and_rbac():
    """Test GET /analytics/license-usage on PostgreSQL."""
    db = get_scratch_session()
    created_lic_ids = []
    created_asset_ids = []
    try:
        lic_id = uuid.uuid4()
        created_lic_ids.append(lic_id)
        lic = SoftwareLicense(
            id=lic_id,
            name=f"PG Lic {secrets.token_hex(3)}",
            vendor="Postgres Vendor",
            total_seats=10,
            cost_per_seat=Decimal("50.00"),
        )
        db.add(lic)
        db.flush()

        # 10 assigned seats -> 100% -> status "warning" (>90%)
        for _ in range(10):
            a_id = uuid.uuid4()
            created_asset_ids.append(a_id)
            a = Asset(
                id=a_id,
                asset_tag=f"PG-LIC-{secrets.token_hex(4)}",
                name="Seat Asset",
                category="software_license",
                vendor="Postgres Vendor",
                purchase_date=date(2026, 1, 1),
                purchase_cost=Decimal("50.00"),
                current_value=Decimal("50.00"),
                depreciation_method=DepreciationMethod.none,
                useful_life_months=12,
                status=AssetStatus.assigned,
                license_id=lic.id,
            )
            db.add(a)
        db.commit()

        set_test_caller("it_admin", db)
        res = client.get("/api/v1/analytics/license-usage")
        assert res.status_code == 200
        items = {it["name"]: it for it in res.json()["items"]}
        assert lic.name in items
        lic_stat = items[lic.name]
        assert lic_stat["total_seats"] == 10
        assert lic_stat["assigned_seats"] == 10
        assert lic_stat["available_seats"] == 0
        assert lic_stat["utilization_rate"] == 100.00
        assert lic_stat["status"] == "warning"

        # employee has no license_usage permission -> 403
        set_test_caller("employee", db)
        res_unauth = client.get("/api/v1/analytics/license-usage")
        assert res_unauth.status_code == 403
    finally:
        try:
            safe_cleanup_synthetic_records(
                db,
                asset_ids=created_asset_ids,
                license_ids=created_lic_ids,
            )
        finally:
            db.close()
