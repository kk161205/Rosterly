import enum
import uuid

from sqlalchemy import (
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
from sqlalchemy.sql import func

from app.db.session import Base


class AssetCategory(str, enum.Enum):
    laptop = "laptop"
    monitor = "monitor"
    mobile = "mobile"
    software_license = "software_license"
    furniture = "furniture"
    other = "other"


class DepreciationMethod(str, enum.Enum):
    straight_line = "straight_line"
    declining_balance = "declining_balance"
    none = "none"


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
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    assets = relationship("Asset", back_populates="license")


class Asset(Base):
    __tablename__ = "assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_tag = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    category = Column(Enum(AssetCategory, name="asset_category_enum", native_enum=False), nullable=False)
    serial_number = Column(String(100), nullable=True, index=True)
    vendor = Column(String(255), nullable=False)
    purchase_date = Column(Date, nullable=False)
    purchase_cost = Column(Numeric(12, 2), nullable=False)
    current_value = Column(Numeric(12, 2), nullable=False)
    depreciation_method = Column(Enum(DepreciationMethod, name="depreciation_method_enum", native_enum=False), nullable=False)
    useful_life_months = Column(Integer, nullable=False)
    warranty_expiry = Column(Date, nullable=True)
    amc_expiry = Column(Date, nullable=True)
    status = Column(Enum(AssetStatus, name="asset_status_enum", native_enum=False), default=AssetStatus.in_stock, nullable=False)
    current_holder_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    license_id = Column(UUID(as_uuid=True), ForeignKey("software_licenses.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    current_holder = relationship("User", foreign_keys=[current_holder_id])
    license = relationship("SoftwareLicense", back_populates="assets")
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
