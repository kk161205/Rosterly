"""
Asset lifecycle scheduled jobs (project doc §6, §7 rule 5).

Task paths referenced by app/core/celery_app.py's beat schedule:
  - app.services.assets.run_depreciation_job        (daily, crontab 02:00 UTC)
  - app.services.assets.check_warranty_amc_expiry    (daily, crontab 03:00 UTC)

Celery tasks run outside FastAPI's request scope, so each task opens and
closes its own SQLAlchemy session via app.db.session.SessionLocal (see
app/db/session.py) instead of using the get_db() request dependency.

ASSUMPTIONS — flagged for developer/finance confirmation, not silently
decided (project doc §6 leaves these "TBD by finance input" / unspecified):
  1. straight_line depreciation floors at $0 salvage value. The doc marks
     the salvage floor as "TBD by finance input"; no floor value has been
     supplied, so this implementation depreciates evenly to zero over
     useful_life_months. If finance specifies a non-zero salvage floor,
     `calculate_current_value()` is the single place to change.
  2. declining_balance applies a fixed 20%/year reduction (~1.667%/month,
     compounded monthly on the remaining current_value). The doc does not
     specify a rate at all — this is a placeholder, not a confirmed
     business rule, and should be treated as an open §0 gap until a
     developer/finance signs off on the real rate.
"""
import logging
import uuid
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from app.core.celery_app import celery_app
from app.db.session import SessionLocal
from app.models.assets import Asset, AssetStatus, DepreciationMethod
from app.models.auth import Role, User
from app.models.system import Notification, NotificationChannel

logger = logging.getLogger(__name__)

# --- Depreciation assumptions (see module docstring) ---------------------
# declining_balance: fixed annual reduction rate applied per month elapsed.
# Doc §6 does not specify a number; 20%/year is a common default but is a
# placeholder pending real finance/developer sign-off.
DECLINING_BALANCE_ANNUAL_RATE = Decimal("0.20")

WARRANTY_EXPIRY_WINDOW_DAYS = 30

_TWO_PLACES = Decimal("0.01")


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)


def calculate_current_value(asset: Asset, as_of: Optional[date] = None) -> Decimal:
    """
    Pure calculation of an asset's depreciated current_value as of a given
    date. Deliberately has no DB interaction so it can be unit tested
    directly against plain Asset instances.
    """
    as_of = as_of or date.today()
    purchase_cost = Decimal(asset.purchase_cost)

    method = asset.depreciation_method
    method_value = method.value if hasattr(method, "value") else str(method)

    if method_value == DepreciationMethod.none.value:
        # doc §6: "none" leaves current_value equal to purchase_cost permanently.
        return _quantize(purchase_cost)

    months_elapsed = (
        (as_of.year - asset.purchase_date.year) * 12
        + (as_of.month - asset.purchase_date.month)
    )
    months_elapsed = max(months_elapsed, 0)

    useful_life = asset.useful_life_months or 0

    if method_value == DepreciationMethod.straight_line.value:
        if useful_life <= 0:
            return _quantize(purchase_cost)
        capped_months = min(months_elapsed, useful_life)
        remaining_fraction = Decimal(useful_life - capped_months) / Decimal(useful_life)
        value = purchase_cost * remaining_fraction
        return _quantize(max(value, Decimal("0")))

    if method_value == DepreciationMethod.declining_balance.value:
        # Stop reducing once the asset has passed its useful life, same as
        # straight_line — declining balance alone never mathematically
        # reaches zero, so a cap keeps the two methods consistent.
        capped_months = min(months_elapsed, useful_life) if useful_life > 0 else months_elapsed
        monthly_rate = DECLINING_BALANCE_ANNUAL_RATE / Decimal("12")
        value = purchase_cost * (Decimal("1") - monthly_rate) ** capped_months
        return _quantize(max(value, Decimal("0")))

    # Unknown/unexpected method value — leave current_value unchanged rather
    # than guessing.
    return _quantize(Decimal(asset.current_value))


def _run_depreciation_job(db, as_of: Optional[date] = None) -> dict:
    """
    Business logic behind run_depreciation_job, split out from the Celery
    task body so it can be unit tested against a mocked db session. Writes
    ONLY assets.current_value — never status, never a notification (doc §6).
    """
    as_of = as_of or date.today()
    assets = db.query(Asset).filter(Asset.status != AssetStatus.retired).all()

    updated = 0
    for asset in assets:
        new_value = calculate_current_value(asset, as_of=as_of)
        if asset.current_value != new_value:
            asset.current_value = new_value
            updated += 1

    db.commit()
    return {"updated": updated}


@celery_app.task(name="app.services.assets.run_depreciation_job")
def run_depreciation_job() -> dict:
    """Nightly depreciation recalculation — see module docstring."""
    db = SessionLocal()
    try:
        result = _run_depreciation_job(db)
        logger.info("run_depreciation_job: recalculated %s asset(s)", result["updated"])
        return result
    finally:
        db.close()


def _run_warranty_amc_expiry_check(db, as_of: Optional[date] = None) -> dict:
    """
    Business logic behind check_warranty_amc_expiry, split out so it can be
    unit tested against a mocked db session. The "exactly N days out"
    matching is done in Python (not as a SQL date-equality filter) so the
    boundary logic is directly testable without a real database.
    """
    as_of = as_of or date.today()
    target_date = as_of + timedelta(days=WARRANTY_EXPIRY_WINDOW_DAYS)

    candidate_assets = (
        db.query(Asset).filter(Asset.status != AssetStatus.retired).all()
    )

    expiring_assets = [
        asset
        for asset in candidate_assets
        if asset.warranty_expiry == target_date or asset.amc_expiry == target_date
    ]

    created = 0
    if expiring_assets:
        it_admins = (
            db.query(User)
            .join(Role, User.role_id == Role.id)
            .filter(Role.name == "it_admin")
            .all()
        )

        for asset in expiring_assets:
            expiring_fields = []
            if asset.warranty_expiry == target_date:
                expiring_fields.append("warranty")
            if asset.amc_expiry == target_date:
                expiring_fields.append("AMC")
            field_label = " & ".join(expiring_fields)

            for admin in it_admins:
                notification = Notification(
                    id=uuid.uuid4(),
                    user_id=admin.id,
                    type="warranty_expiring",
                    title="Asset Warranty/AMC Expiring Soon",
                    message=(
                        f"{field_label} for asset {asset.name} ({asset.asset_tag}) "
                        f"expires on {target_date.isoformat()} (30 days from now)."
                    ),
                    related_entity_type="asset",
                    related_entity_id=asset.id,
                    channel=NotificationChannel.both,
                    is_critical=True,
                )
                db.add(notification)
                created += 1

    db.commit()
    return {"created": created}


@celery_app.task(name="app.services.assets.check_warranty_amc_expiry")
def check_warranty_amc_expiry() -> dict:
    """Daily warranty/AMC expiry notification job — see module docstring."""
    db = SessionLocal()
    try:
        result = _run_warranty_amc_expiry_check(db)
        logger.info(
            "check_warranty_amc_expiry: created %s notification(s)", result["created"]
        )
        return result
    finally:
        db.close()
