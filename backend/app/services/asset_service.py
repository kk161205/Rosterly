from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import math
from typing import Any
import uuid
from uuid import UUID

from sqlalchemy import Column, String, and_, func, or_, text
from sqlalchemy.orm import Session, joinedload

from app.core.errors import AppError, ConflictError, ForbiddenError, NotFoundError
from app.core.security import CurrentUser
from app.models.assets import Asset, AssetAssignment, AssetCategory, AssetStatus, DepreciationMethod, MaintenanceTicket
from app.models.auth import Department, User
from app.models.system import AuditLog
from app.schemas.assets import (
    AssetBulkUpdateRequest,
    AssetCreateRequest,
    AssetListResponse,
    AssetResponse,
    AssetUpdateRequest,
    CurrentHolderNested,
)


class AssetService:
    def __init__(self, db: Session, current_user: CurrentUser):
        self.db = db
        self.current_user = current_user

    def _format_asset_response(self, asset: Asset, today: date | None = None) -> AssetResponse:
        if today is None:
            today = date.today()
        thirty_days = today + timedelta(days=30)

        is_expiring = False
        if asset.warranty_expiry and today <= asset.warranty_expiry <= thirty_days:
            is_expiring = True
        if asset.amc_expiry and today <= asset.amc_expiry <= thirty_days:
            is_expiring = True

        holder_nested = None
        if asset.current_holder:
            holder_nested = CurrentHolderNested(
                id=asset.current_holder.id,
                full_name=asset.current_holder.full_name,
                email=asset.current_holder.email,
                department_id=asset.current_holder.department_id,
                department_name=asset.current_holder.department.name if asset.current_holder.department else None,
            )

        return AssetResponse(
            id=asset.id,
            asset_tag=asset.asset_tag,
            name=asset.name,
            category=asset.category,
            serial_number=asset.serial_number,
            vendor=asset.vendor,
            purchase_date=asset.purchase_date,
            purchase_cost=asset.purchase_cost,
            current_value=asset.current_value,
            depreciation_method=asset.depreciation_method,
            useful_life_months=asset.useful_life_months,
            warranty_expiry=asset.warranty_expiry,
            amc_expiry=asset.amc_expiry,
            status=asset.status,
            current_holder_id=asset.current_holder_id,
            current_holder=holder_nested,
            license_id=asset.license_id,
            is_expiring_soon=is_expiring,
            created_at=asset.created_at,
            updated_at=asset.updated_at,
        )

    def list_assets(
        self,
        search: str | None = None,
        category: AssetCategory | None = None,
        status: AssetStatus | None = None,
        department_id: UUID | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> AssetListResponse:
        role = self.current_user.role
        if role not in ("it_admin", "super_admin", "auditor", "manager"):
            raise ForbiddenError("You do not have permission to view asset inventory")

        query = self.db.query(Asset).options(
            joinedload(Asset.current_holder).joinedload(User.department)
        )

        # Department scoping for manager vs full catalog for it_admin/super_admin/auditor
        if role == "manager":
            if not self.current_user.department_id:
                # Manager without department sees no assets
                return AssetListResponse(
                    items=[],
                    total=0,
                    page=page,
                    page_size=page_size,
                    total_pages=0,
                )
            # Manager can only see assets whose current holder is in manager's department
            query = query.join(User, Asset.current_holder_id == User.id).filter(
                User.department_id == self.current_user.department_id
            )
            # If query department_id is passed, check if it matches manager department
            if department_id and department_id != self.current_user.department_id:
                return AssetListResponse(
                    items=[],
                    total=0,
                    page=page,
                    page_size=page_size,
                    total_pages=0,
                )
        elif department_id:
            # For admin/auditor, filter by holder's department_id if provided
            query = query.join(User, Asset.current_holder_id == User.id).filter(
                User.department_id == department_id
            )

        # Filtering
        if category:
            query = query.filter(Asset.category == category)

        if status:
            query = query.filter(Asset.status == status)

        if search and search.strip():
            pattern = f"%{search.strip()}%"
            query = query.filter(
                (Asset.name.ilike(pattern))
                | (Asset.asset_tag.ilike(pattern))
                | (Asset.serial_number.ilike(pattern))
            )

        total = query.count()
        total_pages = math.ceil(total / page_size) if total > 0 else 0

        offset = (page - 1) * page_size
        items_db = query.order_by(Asset.created_at.desc()).offset(offset).limit(page_size).all()

        today = date.today()
        items = [self._format_asset_response(a, today=today) for a in items_db]

        return AssetListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    def _generate_next_asset_tag(self) -> str:
        dialect_name = self.db.bind.dialect.name if self.db and self.db.bind else "sqlite"
        current_year = datetime.now(timezone.utc).year

        if dialect_name == "postgresql":
            self.db.execute(text("CREATE SEQUENCE IF NOT EXISTS asset_tag_seq START WITH 1 INCREMENT BY 1"))
            seq_num = self.db.execute(text("SELECT nextval('asset_tag_seq')")).scalar()
        else:
            self.db.execute(text("CREATE TABLE IF NOT EXISTS asset_tag_sequence (id INTEGER PRIMARY KEY AUTOINCREMENT)"))
            self.db.execute(text("INSERT INTO asset_tag_sequence DEFAULT VALUES"))
            seq_num = self.db.execute(text("SELECT last_insert_rowid()")).scalar()

        return f"AST-{current_year}-{int(seq_num):05d}"

    def create_asset(self, payload: AssetCreateRequest) -> AssetResponse:
        """
        POST /assets: Auto-generate sequential asset_tag server-side (AST-YYYY-XXXXX).
        Validates depreciation_method and useful_life_months against strict enum and range bounds.
        """
        if self.current_user.role not in ("it_admin", "super_admin"):
            raise ForbiddenError("Only IT Admins and Super Admins can create assets")

        # Auto-generate asset_tag
        asset_tag = self._generate_next_asset_tag()

        # Initial current_value equals purchase_cost upon creation
        now = datetime.now(timezone.utc)
        asset = Asset(
            id=uuid.uuid4(),
            asset_tag=asset_tag,
            name=payload.name,
            category=payload.category,
            serial_number=payload.serial_number,
            vendor=payload.vendor,
            purchase_date=payload.purchase_date,
            purchase_cost=payload.purchase_cost,
            current_value=payload.purchase_cost,
            depreciation_method=payload.depreciation_method,
            useful_life_months=payload.useful_life_months,
            warranty_expiry=payload.warranty_expiry,
            amc_expiry=payload.amc_expiry,
            status=AssetStatus.in_stock,
            created_at=now,
            updated_at=now,
        )

        self.db.add(asset)
        self.db.flush()

        # Write audit log in same transaction
        self.db.add(
            AuditLog(
                actor_id=self.current_user.user_id,
                action="asset.created",
                entity_type="asset",
                entity_id=asset.id,
                after_state={
                    "asset_tag": asset.asset_tag,
                    "name": asset.name,
                    "category": asset.category.value,
                    "vendor": asset.vendor,
                    "purchase_cost": str(asset.purchase_cost),
                    "status": asset.status.value,
                },
            )
        )

        self.db.commit()
        self.db.refresh(asset)
        return self._format_asset_response(asset)

    def update_asset(self, asset_id: UUID, payload: AssetUpdateRequest) -> AssetResponse:
        """
        PATCH /assets/{id}: Update asset fields. Allows it_admin and super_admin to set status="retired".
        """
        if self.current_user.role not in ("it_admin", "super_admin"):
            raise ForbiddenError("Only IT Admins and Super Admins can update assets")

        asset = self.db.query(Asset).options(
            joinedload(Asset.current_holder).joinedload(User.department)
        ).filter(Asset.id == asset_id).first()

        if not asset:
            raise NotFoundError(f"Asset with ID {asset_id} not found")

        before_state = {
            "name": asset.name,
            "category": asset.category.value if asset.category else None,
            "status": asset.status.value if asset.status else None,
            "purchase_cost": str(asset.purchase_cost),
            "vendor": asset.vendor,
        }

        update_data = payload.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            if value is not None:
                setattr(asset, key, value)

        # If purchase_cost updated, sync current_value if not otherwise recalculated
        if "purchase_cost" in update_data and update_data["purchase_cost"] is not None:
            asset.current_value = update_data["purchase_cost"]

        self.db.add(
            AuditLog(
                actor_id=self.current_user.user_id,
                action="asset.updated",
                entity_type="asset",
                entity_id=asset.id,
                before_state=before_state,
                after_state={
                    "name": asset.name,
                    "category": asset.category.value if asset.category else None,
                    "status": asset.status.value if asset.status else None,
                    "purchase_cost": str(asset.purchase_cost),
                    "vendor": asset.vendor,
                },
            )
        )

        self.db.commit()
        self.db.refresh(asset)
        return self._format_asset_response(asset)

    def bulk_update_assets(self, payload: AssetBulkUpdateRequest) -> int:
        if self.current_user.role not in ("it_admin", "super_admin"):
            raise ForbiddenError("Only IT Admins and Super Admins can perform bulk status updates")

        asset_ids = payload.asset_ids
        if not asset_ids:
            return 0

        # Query all requested assets
        assets = self.db.query(Asset).filter(Asset.id.in_(asset_ids)).all()

        # Atomic whole-batch fails check
        found_ids = {a.id for a in assets}
        missing_ids = set(asset_ids) - found_ids
        if missing_ids:
            raise NotFoundError(f"Assets not found: {[str(m) for m in missing_ids]}")

        for asset in assets:
            before_status = asset.status.value
            asset.status = payload.status
            self.db.add(
                AuditLog(
                    actor_id=self.current_user.user_id,
                    action="asset.bulk_status_updated",
                    entity_type="asset",
                    entity_id=asset.id,
                    before_state={"status": before_status},
                    after_state={"status": payload.status.value},
                )
            )

        self.db.commit()
        return len(assets)

    def delete_asset(self, asset_id: UUID) -> None:
        if self.current_user.role != "super_admin":
            raise ForbiddenError("Hard deletion of assets is restricted to Super Admins only")

        asset = self.db.query(Asset).filter(Asset.id == asset_id).first()
        if not asset:
            raise NotFoundError(f"Asset with ID {asset_id} not found")

        # Safety Check: Check for assignment or maintenance history
        assignment_count = self.db.query(func.count(AssetAssignment.id)).filter(
            AssetAssignment.asset_id == asset_id
        ).scalar()

        ticket_count = self.db.query(func.count(MaintenanceTicket.id)).filter(
            MaintenanceTicket.asset_id == asset_id
        ).scalar()

        if (assignment_count or 0) > 0 or (ticket_count or 0) > 0:
            raise ConflictError(
                "Cannot hard-delete asset with existing assignment or maintenance history. Retire the asset instead."
            )

        asset_tag = asset.asset_tag
        self.db.add(
            AuditLog(
                actor_id=self.current_user.user_id,
                action="asset.hard_deleted",
                entity_type="asset",
                entity_id=asset_id,
                before_state={"asset_tag": asset_tag, "name": asset.name},
                after_state=None,
            )
        )

        self.db.delete(asset)
        self.db.commit()
