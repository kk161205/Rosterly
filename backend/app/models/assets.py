import enum
import uuid

from sqlalchemy import (
    Index,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func, text

from app.db.session import Base


class AssetCategory(str, enum.Enum):
    laptop = "laptop"
    monitor = "monitor"
    mobile = "mobile"
    software_license = "software_license"
    furniture = "furniture"
    other = "other"


class AssetStatus(str, enum.Enum):
    in_stock = "in_stock"
    assigned = "assigned"
    under_maintenance = "under_maintenance"
    retired = "retired"
    lost = "lost"


class MaintenancePriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class MaintenanceStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"
    closed = "closed"


class SoftwareLicense(Base):
    __tablename__ = "software_licenses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    vendor = Column(String(255), nullable=False)
    total_seats = Column(Integer, nullable=False)
    cost_per_seat = Column(Numeric(12, 2), nullable=True)
    renewal_date = Column(Date, nullable=True)
    # Where seats come from: "manual" (IT assigns
    # them here) or a connected provider such as "microsoft_365", which keeps
    # them in step through app/modules/licenses/sync.py.
    source = Column(String(50), nullable=False, default="manual")
    external_sku_id = Column(String(255), nullable=True, unique=True)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    assignments = relationship("LicenseAssignment", back_populates="license", cascade="all, delete-orphan")


class LicenseAssignment(Base):
    """One person holding one seat of a licence.
    removed_at null = the seat is in use. Rows are kept after removal so the
    history stays readable. A person holds at most one active seat per licence."""

    __tablename__ = "license_assignments"
    __table_args__ = (
        Index(
            "uq_license_assignments_active",
            "license_id",
            "user_id",
            unique=True,
            postgresql_where=text("removed_at IS NULL"),
            sqlite_where=text("removed_at IS NULL"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    license_id = Column(UUID(as_uuid=True), ForeignKey("software_licenses.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    source = Column(String(50), nullable=False, default="manual")
    external_id = Column(String(255), nullable=True)
    assigned_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    removed_at = Column(DateTime(timezone=True), nullable=True)
    removed_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    license = relationship("SoftwareLicense", back_populates="assignments")
    user = relationship("User", foreign_keys=[user_id])


class Asset(Base):
    __tablename__ = "assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_tag = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    # Open, admin-extensible field (not a closed enum) — the frontend sources
    # suggested values from GET /assets/meta (distinct values already in use)
    # plus a free-text "add new category" affordance on asset creation.
    # AssetCategory below is kept only as a seed/reference list, not a DB constraint.
    category = Column(String(100), nullable=False)
    serial_number = Column(String(100), nullable=True, index=True)
    # Only name and category are required: someone adding a
    # monitor found in a cupboard may not know where or when it was bought.
    vendor = Column(String(255), nullable=True)
    purchase_date = Column(Date, nullable=True)
    purchase_cost = Column(Numeric(12, 2), nullable=True)
    # Optional expected life; drives "What to budget for" (replacements due).
    # There is no depreciation: an asset's life is told by its status.
    useful_life_months = Column(Integer, nullable=True)
    warranty_expiry = Column(Date, nullable=True)
    amc_expiry = Column(Date, nullable=True)
    status = Column(Enum(AssetStatus, name="asset_status_enum", native_enum=False), default=AssetStatus.in_stock, nullable=False)
    current_holder_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    current_holder = relationship("User", foreign_keys=[current_holder_id])
    assignments = relationship("AssetAssignment", back_populates="asset", cascade="all, delete-orphan")
    maintenance_tickets = relationship("MaintenanceTicket", back_populates="asset", cascade="all, delete-orphan")


class AssetAssignment(Base):
    __tablename__ = "asset_assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    assigned_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    returned_at = Column(DateTime(timezone=True), nullable=True)
    condition_at_assignment = Column(Text, nullable=False)
    condition_at_return = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    asset = relationship("Asset", back_populates="assignments")
    employee = relationship("User", foreign_keys=[employee_id])
    assigner = relationship("User", foreign_keys=[assigned_by])


class MaintenanceTicket(Base):
    __tablename__ = "maintenance_tickets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    reported_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    assigned_to = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    issue_description = Column(Text, nullable=False)
    priority = Column(Enum(MaintenancePriority, name="maintenance_priority_enum", native_enum=False), default=MaintenancePriority.medium, nullable=False)
    status = Column(Enum(MaintenanceStatus, name="maintenance_status_enum", native_enum=False), default=MaintenanceStatus.open, nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    asset = relationship("Asset", back_populates="maintenance_tickets")
    reporter = relationship("User", foreign_keys=[reported_by])
    assignee = relationship("User", foreign_keys=[assigned_to])
