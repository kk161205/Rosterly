"""
Software License Management service — project doc §5.19.

seats_used comes from the shared definition in usage.py (also used by
Analytics). Writes log to audit_logs in the same transaction (§7 rule 5).
"""
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.core.security import CurrentUser, check_permission
from app.models.assets import Asset, AssetStatus, SoftwareLicense
from app.models.auth import User
from app.models.system import AuditLog
from app.modules.licenses.schemas import (
    LicenseCreate,
    LicenseHolder,
    LicenseHoldersResponse,
    LicenseListResponse,
    LicenseResponse,
    LicenseUpdate,
)
from app.modules.licenses.usage import license_seats_query


class LicenseService:
    def __init__(self, db: Session, current_user: CurrentUser, ip_address: Optional[str] = None):
        self.db = db
        self.current_user = current_user
        self.ip_address = ip_address or "127.0.0.1"

    @staticmethod
    def _response(lic: SoftwareLicense, seats_used: int) -> LicenseResponse:
        return LicenseResponse(
            id=lic.id,
            name=lic.name,
            vendor=lic.vendor,
            total_seats=lic.total_seats,
            seats_used=seats_used,
            cost_per_seat=lic.cost_per_seat,
            renewal_date=lic.renewal_date,
            created_at=lic.created_at,
            updated_at=lic.updated_at,
        )

    @staticmethod
    def _snapshot(lic: SoftwareLicense) -> dict:
        return {
            "name": lic.name,
            "vendor": lic.vendor,
            "total_seats": lic.total_seats,
            "cost_per_seat": str(lic.cost_per_seat) if lic.cost_per_seat is not None else None,
            "renewal_date": lic.renewal_date.isoformat() if lic.renewal_date else None,
        }

    def _audit(self, action: str, entity_id: UUID, before: Optional[dict], after: dict) -> None:
        self.db.add(
            AuditLog(
                id=uuid4(),
                actor_id=self.current_user.user_id,
                action=action,
                entity_type="software_license",
                entity_id=entity_id,
                before_state=before,
                after_state=after,
                ip_address=self.ip_address,
            )
        )

    def _seats_used(self, license_id: UUID) -> int:
        row = license_seats_query(self.db).filter(SoftwareLicense.id == license_id).first()
        return row.seats_used if row else 0

    # ------------------------------------------------------------ endpoints

    def list_licenses(self, page: int, page_size: int) -> LicenseListResponse:
        check_permission(self.current_user, "software_license", "read", self.db)
        total = self.db.query(SoftwareLicense).count()
        rows = (
            license_seats_query(self.db)
            .order_by(SoftwareLicense.name, SoftwareLicense.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return LicenseListResponse(items=[self._response(lic, used) for lic, used in rows], total=total)

    def get_holders(self, license_id: UUID) -> LicenseHoldersResponse:
        check_permission(self.current_user, "software_license", "read", self.db)
        if self.db.query(SoftwareLicense.id).filter(SoftwareLicense.id == license_id).first() is None:
            raise NotFoundError("Software license not found")
        # Same population as seats_used (status = assigned), narrowed to rows with a current holder.
        rows = (
            self.db.query(Asset, User)
            .join(User, User.id == Asset.current_holder_id)
            .filter(Asset.license_id == license_id, Asset.status == AssetStatus.assigned)
            .order_by(User.full_name, Asset.asset_tag)
            .all()
        )
        return LicenseHoldersResponse(
            holders=[
                LicenseHolder(
                    employee_id=user.id,
                    full_name=user.full_name,
                    email=user.email,
                    asset_id=asset.id,
                    asset_tag=asset.asset_tag,
                    asset_name=asset.name,
                )
                for asset, user in rows
            ]
        )

    def create_license(self, data: LicenseCreate) -> LicenseResponse:
        check_permission(self.current_user, "software_license", "create", self.db)
        lic = SoftwareLicense(
            id=uuid4(),
            name=data.name.strip(),
            vendor=data.vendor.strip(),
            total_seats=data.total_seats,
            cost_per_seat=data.cost_per_seat,
            renewal_date=data.renewal_date,
        )
        if not lic.name or not lic.vendor:
            raise ValidationAppError(
                "Validation failed",
                field_errors={("name" if not lic.name else "vendor"): "Must not be blank."},
            )
        self.db.add(lic)
        self.db.flush()
        self._audit("software_license.created", lic.id, None, self._snapshot(lic))
        self.db.commit()
        self.db.refresh(lic)
        return self._response(lic, 0)

    def update_license(self, license_id: UUID, data: LicenseUpdate) -> LicenseResponse:
        check_permission(self.current_user, "software_license", "update", self.db)
        sent = data.model_fields_set
        if not sent:
            raise ValidationAppError("Validation failed", field_errors={"general": "No fields to update."})
        for field in ("name", "vendor", "total_seats"):
            if field in sent and getattr(data, field) is None:
                raise ValidationAppError("Validation failed", field_errors={field: "Cannot be null."})

        lic = self.db.query(SoftwareLicense).filter(SoftwareLicense.id == license_id).with_for_update().first()
        if lic is None:
            raise NotFoundError("Software license not found")

        seats_used = self._seats_used(license_id)
        if "total_seats" in sent and data.total_seats < seats_used:
            raise ConflictError(
                f"total_seats cannot be below the {seats_used} seat(s) currently in use.", code="conflict"
            )

        before = self._snapshot(lic)
        for field in sent:
            value = getattr(data, field)
            setattr(lic, field, value.strip() if isinstance(value, str) else value)
        if not lic.name or not lic.vendor:
            raise ValidationAppError(
                "Validation failed",
                field_errors={("name" if not lic.name else "vendor"): "Must not be blank."},
            )
        self.db.flush()
        self._audit("software_license.updated", lic.id, before, self._snapshot(lic))
        self.db.commit()
        self.db.refresh(lic)
        return self._response(lic, seats_used)
