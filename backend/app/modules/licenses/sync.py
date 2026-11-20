"""
Keeping licences in step with a connected provider.

A connector (e.g. Microsoft 365 through Microsoft Graph, Google Workspace
through its License Manager API) only has to turn the provider's answer into
`ProviderSubscription`s and call `sync_from_provider`. Rosterly then:

- creates or updates one licence per subscription (matched on
  `external_sku_id`), marking it with the provider as its source;
- adds a seat for each assigned person it can match to a Rosterly account by
  email, and frees provider seats that are no longer assigned there;
- never touches licences or seats someone created by hand ("manual");
- audits what changed.

Call it on a schedule (the safety net) and from a provider change
notification when one is wired up (Microsoft Graph can notify on user
changes), so seats follow the provider as soon as a licence is added or
removed there.

Microsoft Graph mapping, for the connector (read-only, app permission
Organization.Read.All + User.Read.All):
  GET /subscribedSkus           → external_sku_id = skuId, name = skuPartNumber,
                                   total_seats = prepaidUnits.enabled
  GET /users?$select=mail,assignedLicenses → assigned_emails per skuId
"""
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.assets import LicenseAssignment, SoftwareLicense
from app.models.auth import User
from app.models.system import AuditLog
from app.modules.licenses.usage import release_seat

SYSTEM_IP = "provider-sync"


@dataclass
class ProviderSubscription:
    external_sku_id: str
    name: str
    vendor: str
    total_seats: int
    assigned_emails: list[str] = field(default_factory=list)


@dataclass
class SyncResult:
    licences_created: int = 0
    licences_updated: int = 0
    seats_added: int = 0
    seats_removed: int = 0
    unmatched_emails: list[str] = field(default_factory=list)


def sync_from_provider(db: Session, provider: str, subscriptions: list[ProviderSubscription]) -> SyncResult:
    """Applies the provider's current state. Commits once at the end."""
    if provider == "manual":
        raise ValueError("'manual' is not a provider")
    now = datetime.now(timezone.utc)
    result = SyncResult()

    for sub in subscriptions:
        lic = db.query(SoftwareLicense).filter(SoftwareLicense.external_sku_id == sub.external_sku_id).first()
        if lic is None:
            lic = SoftwareLicense(
                id=uuid.uuid4(),
                name=sub.name,
                vendor=sub.vendor,
                total_seats=max(sub.total_seats, 0),
                source=provider,
                external_sku_id=sub.external_sku_id,
            )
            db.add(lic)
            db.flush()
            result.licences_created += 1
        elif lic.source == "manual":
            continue  # a licence typed in by hand that happens to share the id — leave it alone
        else:
            if (lic.name, lic.vendor, lic.total_seats) != (sub.name, sub.vendor, sub.total_seats):
                lic.name, lic.vendor, lic.total_seats = sub.name, sub.vendor, max(sub.total_seats, 0)
                result.licences_updated += 1
        lic.last_synced_at = now

        wanted_emails = {e.strip().lower() for e in sub.assigned_emails if e and e.strip()}
        people = {
            u.email.lower(): u
            for u in db.query(User).filter(func.lower(User.email).in_(wanted_emails)).all()
        } if wanted_emails else {}
        result.unmatched_emails.extend(sorted(wanted_emails - set(people)))
        wanted_ids = {u.id for u in people.values()}

        active = (
            db.query(LicenseAssignment)
            .filter(LicenseAssignment.license_id == lic.id, LicenseAssignment.removed_at.is_(None))
            .all()
        )
        have_ids = {a.user_id for a in active}
        for seat in active:
            if seat.source == provider and seat.user_id not in wanted_ids:
                release_seat(db, seat, None)
                result.seats_removed += 1
        for user_id in wanted_ids - have_ids:
            db.add(LicenseAssignment(id=uuid.uuid4(), license_id=lic.id, user_id=user_id, source=provider))
            result.seats_added += 1

    if result.licences_created or result.licences_updated or result.seats_added or result.seats_removed:
        db.add(
            AuditLog(
                id=uuid.uuid4(),
                actor_id=None,
                action="software_license.synced",
                entity_type="software_license",
                entity_id=uuid.uuid5(uuid.NAMESPACE_URL, f"rosterly:license-provider:{provider}"),
                before_state=None,
                after_state={
                    "provider": provider,
                    "licences_created": result.licences_created,
                    "licences_updated": result.licences_updated,
                    "seats_added": result.seats_added,
                    "seats_removed": result.seats_removed,
                    "unmatched_emails": len(result.unmatched_emails),
                },
                ip_address=SYSTEM_IP,
            )
        )
    db.commit()
    return result
