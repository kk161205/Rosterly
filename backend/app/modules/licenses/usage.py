"""
Software-license seat usage — the single definition.

    seats_used = COUNT(license_assignments WHERE license_id = <license> AND removed_at IS NULL)

Shared by the license endpoints and Analytics savings so the
two can never disagree. Do not redefine it elsewhere.
"""
from datetime import datetime, timezone

from sqlalchemy import and_, func
from sqlalchemy.orm import Query, Session

from app.models.assets import LicenseAssignment, SoftwareLicense


def license_seats_query(db: Session) -> Query:
    """Rows of (SoftwareLicense, seats_used) — one per license, in one query."""
    seats_used = func.count(LicenseAssignment.id)
    return (
        db.query(SoftwareLicense, seats_used.label("seats_used"))
        .outerjoin(
            LicenseAssignment,
            and_(LicenseAssignment.license_id == SoftwareLicense.id, LicenseAssignment.removed_at.is_(None)),
        )
        .group_by(SoftwareLicense.id)
    )


def release_seat(db: Session, assignment: LicenseAssignment, removed_by) -> None:
    """Frees a seat (keeps the row for history). Used by IT removing a seat,
    offboarding reclaiming it, and provider sync. The caller commits."""
    assignment.removed_at = datetime.now(timezone.utc)
    assignment.removed_by = removed_by
