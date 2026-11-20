import enum
import uuid

from sqlalchemy import (
    Boolean,
    String,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.session import Base


class LeaveStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    cancelled = "cancelled"


class AttendanceStatus(str, enum.Enum):
    present = "present"
    absent = "absent"
    half_day = "half_day"
    on_leave = "on_leave"
    holiday = "holiday"


class LeaveType(Base):
    """A kind of leave the company offers. HR edits the seeded defaults and adds its own. A type that has
    been used is deactivated, never deleted.

    annual_days null = no limit (no balance kept, nothing deducted).
    carry_forward_max: unused days that roll into next year (0 = they lapse).
    pro_rate_on_join: joiners get a share for the months left in the year."""

    __tablename__ = "leave_types"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(60), nullable=False, unique=True)
    annual_days = Column(Numeric(5, 2), nullable=True)
    carry_forward_max = Column(Numeric(5, 2), nullable=False, default=0)
    is_paid = Column(Boolean, nullable=False, default=True)
    pro_rate_on_join = Column(Boolean, nullable=False, default=True)
    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    @property
    def unlimited(self) -> bool:
        return self.annual_days is None


class Holiday(Base):
    """A company holiday. Not counted as a working day."""

    __tablename__ = "holidays"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    date = Column(Date, nullable=False, unique=True)
    name = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    leave_type_id = Column(UUID(as_uuid=True), ForeignKey("leave_types.id", ondelete="RESTRICT"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(Enum(LeaveStatus, name="leave_status_enum", native_enum=False), default=LeaveStatus.pending, nullable=False)
    approver_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reason = Column(Text, nullable=True)
    # Approver's note on approve/reject, shown in the history table's note drawer.
    decision_comments = Column(Text, nullable=True)
    # Working days taken off the balance at approval — a cancel refunds exactly this,
    # even if company holidays changed in between. Null for pending/unlimited leave.
    days_deducted = Column(Numeric(5, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    employee = relationship("User", foreign_keys=[employee_id])
    approver = relationship("User", foreign_keys=[approver_id])
    leave_type = relationship("LeaveType")


class LeaveBalance(Base):
    """Days left of one leave type for one person in one year. Created on first
    use (pro-rated for joiners, plus carry-forward from last year)."""

    __tablename__ = "leave_balances"
    __table_args__ = (UniqueConstraint("employee_id", "leave_type_id", "year", name="uq_leave_balances_employee_type_year"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    leave_type_id = Column(UUID(as_uuid=True), ForeignKey("leave_types.id", ondelete="RESTRICT"), nullable=False)
    year = Column(Integer, nullable=False)
    balance_days = Column(Numeric(5, 2), nullable=False)
    # Days carried in from last year (already included in balance_days), kept so the carry
    # can be corrected when last year's balance changes later.
    carried_in = Column(Numeric(5, 2), nullable=False, default=0, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    employee = relationship("User", foreign_keys=[employee_id])
    leave_type = relationship("LeaveType")


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (UniqueConstraint("employee_id", "date", name="uq_attendance_records_employee_date"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False, index=True)
    status = Column(Enum(AttendanceStatus, name="attendance_status_enum", native_enum=False), nullable=False)
    check_in_time = Column(DateTime(timezone=True), nullable=True)
    check_out_time = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    employee = relationship("User", foreign_keys=[employee_id])
