"""
Software-license seat usage — the single definition (project doc §1.18).

    seats_used = COUNT(assets WHERE license_id = <license> AND status = 'assigned')

Shared by the license endpoints (§5.19) and Analytics savings (§5.15) so the
two can never disagree. Do not redefine it elsewhere.
"""
from sqlalchemy import case, func
from sqlalchemy.orm import Query, Session

from app.models.assets import Asset, AssetStatus, SoftwareLicense


def license_seats_query(db: Session) -> Query:
    """Rows of (SoftwareLicense, seats_used) — one per license, in one query."""
    seats_used = func.count(case((Asset.status == AssetStatus.assigned, Asset.id), else_=None))
    return (
        db.query(SoftwareLicense, seats_used.label("seats_used"))
        .outerjoin(Asset, Asset.license_id == SoftwareLicense.id)
        .group_by(SoftwareLicense.id)
    )
