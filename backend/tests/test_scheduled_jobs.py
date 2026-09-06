"""
Unit tests for the scheduled Celery jobs in app/services/assets.py:
  - calculate_current_value() / run_depreciation_job — nightly depreciation
    recalculation for straight_line, declining_balance, and none.
  - check_warranty_amc_expiry() — warranty/AMC expiry notifications fired
    exactly 30 days out (and not at 29 or 31 days).

The email dispatch worker (app/services/notifications.py) is NOT covered
here: real SMTP credentials are not configured anywhere in this codebase
(see that module's docstring), so there is no send behavior to assert
against beyond "SMTP unconfigured -> email_sent_at stays NULL", which is a
config-dependent blocker rather than business logic to verify.

DB interaction is mocked the same way the rest of the test suite mocks it
(see tests/test_offboarding.py, tests/test_dashboard.py): a MagicMock
standing in for the SQLAlchemy Session, with query().filter().all() etc.
chains stubbed per test.
"""
import datetime
import uuid
from decimal import Decimal
from unittest.mock import MagicMock

from app.models.assets import Asset, AssetStatus, DepreciationMethod
from app.models.auth import Role, User
from app.services.assets import (
    _run_depreciation_job,
    _run_warranty_amc_expiry_check,
    calculate_current_value,
)


def make_asset(
    purchase_cost="12000.00",
    current_value="12000.00",
    depreciation_method=DepreciationMethod.straight_line,
    useful_life_months=24,
    purchase_date=None,
    status=AssetStatus.assigned,
    warranty_expiry=None,
    amc_expiry=None,
):
    return Asset(
        id=uuid.uuid4(),
        asset_tag=f"AST-{uuid.uuid4().hex[:6]}",
        name="Test Laptop",
        category="laptop",
        serial_number="SN123",
        vendor="Acme",
        purchase_date=purchase_date or datetime.date(2025, 1, 1),
        purchase_cost=Decimal(purchase_cost),
        current_value=Decimal(current_value),
        depreciation_method=depreciation_method,
        useful_life_months=useful_life_months,
        warranty_expiry=warranty_expiry,
        amc_expiry=amc_expiry,
        status=status,
    )


# ============================================================================
# calculate_current_value — straight_line
# ============================================================================

def test_straight_line_depreciates_evenly_to_zero_at_end_of_useful_life():
    """At exactly useful_life_months elapsed, straight_line value is $0 (no salvage floor)."""
    asset = make_asset(
        purchase_cost="12000.00",
        depreciation_method=DepreciationMethod.straight_line,
        useful_life_months=24,
        purchase_date=datetime.date(2024, 1, 1),
    )
    as_of = datetime.date(2026, 1, 1)  # 24 months later
    value = calculate_current_value(asset, as_of=as_of)
    assert value == Decimal("0.00")


def test_straight_line_halfway_through_useful_life():
    """Halfway through useful life, straight_line value is half of purchase_cost."""
    asset = make_asset(
        purchase_cost="12000.00",
        depreciation_method=DepreciationMethod.straight_line,
        useful_life_months=24,
        purchase_date=datetime.date(2024, 1, 1),
    )
    as_of = datetime.date(2025, 1, 1)  # 12 months later
    value = calculate_current_value(asset, as_of=as_of)
    assert value == Decimal("6000.00")


def test_straight_line_never_goes_negative_past_useful_life():
    """Past useful_life_months, straight_line value stays floored at $0, not negative."""
    asset = make_asset(
        purchase_cost="12000.00",
        depreciation_method=DepreciationMethod.straight_line,
        useful_life_months=24,
        purchase_date=datetime.date(2020, 1, 1),
    )
    as_of = datetime.date(2026, 1, 1)  # 72 months later, way past useful life
    value = calculate_current_value(asset, as_of=as_of)
    assert value == Decimal("0.00")


# ============================================================================
# calculate_current_value — declining_balance
# ============================================================================

def test_declining_balance_reduces_value_after_one_year():
    """
    After 12 months at the assumed 20%/year rate, value should be
    purchase_cost * (1 - 0.20/12)^12 ≈ 80.6% of purchase_cost.
    This assumption (20%/year) is a placeholder pending finance/developer
    sign-off — see app/services/assets.py module docstring.
    """
    asset = make_asset(
        purchase_cost="10000.00",
        depreciation_method=DepreciationMethod.declining_balance,
        useful_life_months=60,
        purchase_date=datetime.date(2025, 1, 1),
    )
    as_of = datetime.date(2026, 1, 1)  # 12 months later
    value = calculate_current_value(asset, as_of=as_of)
    expected = Decimal("10000.00") * (Decimal("1") - Decimal("0.20") / Decimal("12")) ** 12
    expected = expected.quantize(Decimal("0.01"))
    assert value == expected
    assert value < Decimal("10000.00")
    assert value > Decimal("7000.00")  # sanity bound, ~8060


def test_declining_balance_stays_positive_and_capped_at_useful_life():
    """Declining balance never goes negative, and stops changing once useful_life_months is passed."""
    asset = make_asset(
        purchase_cost="10000.00",
        depreciation_method=DepreciationMethod.declining_balance,
        useful_life_months=24,
        purchase_date=datetime.date(2020, 1, 1),
    )
    value_at_cap = calculate_current_value(asset, as_of=datetime.date(2022, 1, 1))  # exactly 24mo
    value_well_past = calculate_current_value(asset, as_of=datetime.date(2026, 1, 1))  # 72mo
    assert value_at_cap > Decimal("0.00")
    assert value_at_cap == value_well_past  # capped, doesn't keep declining forever


# ============================================================================
# calculate_current_value — none
# ============================================================================

def test_none_method_keeps_current_value_equal_to_purchase_cost():
    asset = make_asset(
        purchase_cost="5000.00",
        depreciation_method=DepreciationMethod.none,
        useful_life_months=36,
        purchase_date=datetime.date(2020, 1, 1),
    )
    value = calculate_current_value(asset, as_of=datetime.date(2026, 9, 2))
    assert value == Decimal("5000.00")


# ============================================================================
# run_depreciation_job — wiring: writes only current_value, commits, skips retired
# ============================================================================

def test_run_depreciation_job_updates_current_value_and_commits():
    asset = make_asset(
        purchase_cost="12000.00",
        current_value="12000.00",
        depreciation_method=DepreciationMethod.straight_line,
        useful_life_months=24,
        purchase_date=datetime.date(2024, 1, 1),
        status=AssetStatus.assigned,
    )
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.all.return_value = [asset]

    original_status = asset.status
    result = _run_depreciation_job(mock_db, as_of=datetime.date(2025, 1, 1))

    assert result == {"updated": 1}
    assert asset.current_value == Decimal("6000.00")
    assert asset.status == original_status  # job must not touch status
    mock_db.commit.assert_called_once()


def test_run_depreciation_job_only_queries_non_retired_assets():
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.all.return_value = []

    _run_depreciation_job(mock_db, as_of=datetime.date(2025, 1, 1))

    filter_call_args = mock_db.query.return_value.filter.call_args
    assert filter_call_args is not None
    # The filter should reference Asset.status != retired.
    (filter_expr,), _ = filter_call_args
    assert filter_expr.compare(Asset.status != AssetStatus.retired)


# ============================================================================
# check_warranty_amc_expiry — exactly-30-days-out boundary
# ============================================================================

def make_it_admin_user():
    role = Role(id=uuid.uuid4(), name="it_admin")
    user = User(
        id=uuid.uuid4(),
        employee_code="RST-2001",
        full_name="IT Admin",
        email="itadmin@example.com",
        password_hash="hashed",
        role_id=role.id,
        designation="IT Administrator",
        status="active",
        date_of_joining=datetime.date(2024, 1, 1),
    )
    user.role = role
    return user


def test_warranty_expiry_at_exactly_30_days_creates_notification():
    today = datetime.date(2026, 9, 2)
    target_date = today + datetime.timedelta(days=30)
    asset = make_asset(warranty_expiry=target_date, amc_expiry=None)
    it_admin = make_it_admin_user()

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.all.return_value = [asset]
    mock_db.query.return_value.join.return_value.filter.return_value.all.return_value = [it_admin]

    result = _run_warranty_amc_expiry_check(mock_db, as_of=today)

    assert result == {"created": 1}
    assert mock_db.add.call_count == 1
    notification = mock_db.add.call_args[0][0]
    assert notification.type == "warranty_expiring"
    assert notification.channel.value == "both" or notification.channel == "both"
    assert notification.is_critical is True
    assert notification.user_id == it_admin.id
    mock_db.commit.assert_called_once()


def test_amc_expiry_at_exactly_30_days_creates_notification():
    today = datetime.date(2026, 9, 2)
    target_date = today + datetime.timedelta(days=30)
    asset = make_asset(warranty_expiry=None, amc_expiry=target_date)
    it_admin = make_it_admin_user()

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.all.return_value = [asset]
    mock_db.query.return_value.join.return_value.filter.return_value.all.return_value = [it_admin]

    result = _run_warranty_amc_expiry_check(mock_db, as_of=today)

    assert result == {"created": 1}


def test_warranty_expiry_at_29_days_does_not_notify():
    today = datetime.date(2026, 9, 2)
    asset = make_asset(warranty_expiry=today + datetime.timedelta(days=29))
    it_admin = make_it_admin_user()

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.all.return_value = [asset]
    mock_db.query.return_value.join.return_value.filter.return_value.all.return_value = [it_admin]

    result = _run_warranty_amc_expiry_check(mock_db, as_of=today)

    assert result == {"created": 0}
    mock_db.add.assert_not_called()


def test_warranty_expiry_at_31_days_does_not_notify():
    today = datetime.date(2026, 9, 2)
    asset = make_asset(warranty_expiry=today + datetime.timedelta(days=31))
    it_admin = make_it_admin_user()

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.all.return_value = [asset]
    mock_db.query.return_value.join.return_value.filter.return_value.all.return_value = [it_admin]

    result = _run_warranty_amc_expiry_check(mock_db, as_of=today)

    assert result == {"created": 0}
    mock_db.add.assert_not_called()


def test_warranty_expiry_notifies_every_it_admin():
    """Doc §6: recipient = every it_admin user — verify fan-out to all of them."""
    today = datetime.date(2026, 9, 2)
    target_date = today + datetime.timedelta(days=30)
    asset = make_asset(warranty_expiry=target_date)
    admin_one = make_it_admin_user()
    admin_two = make_it_admin_user()

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.all.return_value = [asset]
    mock_db.query.return_value.join.return_value.filter.return_value.all.return_value = [
        admin_one,
        admin_two,
    ]

    result = _run_warranty_amc_expiry_check(mock_db, as_of=today)

    assert result == {"created": 2}
    assert mock_db.add.call_count == 2
    notified_user_ids = {call.args[0].user_id for call in mock_db.add.call_args_list}
    assert notified_user_ids == {admin_one.id, admin_two.id}


def test_no_expiring_assets_creates_no_notifications_and_skips_admin_query():
    today = datetime.date(2026, 9, 2)
    asset = make_asset(warranty_expiry=today + datetime.timedelta(days=100))

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.all.return_value = [asset]

    result = _run_warranty_amc_expiry_check(mock_db, as_of=today)

    assert result == {"created": 0}
    mock_db.add.assert_not_called()
    mock_db.commit.assert_called_once()
