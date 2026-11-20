"""
Leave & Attendance schemas (leave types, holidays and
balances are company-editable).
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.leave_attendance import AttendanceStatus, LeaveStatus


# ------------------------------------------------------------ leave types

class LeaveTypeResponse(BaseModel):
    id: UUID
    name: str
    annual_days: Optional[Decimal]  # null = no limit
    carry_forward_max: Decimal
    is_paid: bool
    pro_rate_on_join: bool
    is_active: bool
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


class LeaveTypeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    annual_days: Optional[Decimal] = Field(default=None, ge=0, le=366, max_digits=5, decimal_places=2)
    carry_forward_max: Decimal = Field(default=Decimal("0"), ge=0, le=366, max_digits=5, decimal_places=2)
    is_paid: bool = True
    pro_rate_on_join: bool = True

    model_config = ConfigDict(extra="forbid")


class LeaveTypeUpdate(BaseModel):
    """Partial update. Send annual_days null to make the type unlimited."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    annual_days: Optional[Decimal] = Field(default=None, ge=0, le=366, max_digits=5, decimal_places=2)
    carry_forward_max: Optional[Decimal] = Field(default=None, ge=0, le=366, max_digits=5, decimal_places=2)
    is_paid: Optional[bool] = None
    pro_rate_on_join: Optional[bool] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None

    model_config = ConfigDict(extra="forbid")


class LeaveTypeRef(BaseModel):
    id: UUID
    name: str
    is_paid: bool
    unlimited: bool


# ------------------------------------------------------------ holidays

class HolidayResponse(BaseModel):
    id: UUID
    date: date
    name: str

    model_config = ConfigDict(from_attributes=True)


class HolidayCreate(BaseModel):
    date: date
    name: str = Field(min_length=1, max_length=100)

    model_config = ConfigDict(extra="forbid")


# ------------------------------------------------------------ requests

class LeaveRequestCreate(BaseModel):
    leave_type_id: UUID
    start_date: date
    end_date: date
    reason: Optional[str] = Field(default=None, max_length=2000)


class LeaveDecision(BaseModel):
    """Approve: comments optional."""

    comments: Optional[str] = Field(default=None, max_length=2000)


class LeaveRejection(BaseModel):
    """Reject: comments required (non-blank is enforced in the service)."""

    comments: str = Field(min_length=1, max_length=2000)


class LeaveRequestResponse(BaseModel):
    id: UUID
    employee_id: UUID
    employee_name: Optional[str]
    employee_email: Optional[str]
    leave_type: LeaveTypeRef
    start_date: date
    end_date: date
    total_days: int  # working days: Mon–Fri, not company holidays
    status: LeaveStatus
    approver_id: Optional[UUID]
    approver_name: Optional[str]
    reason: Optional[str]
    decision_comments: Optional[str]
    can_cancel: bool = False  # the requester may still cancel it
    created_at: datetime
    updated_at: datetime


# ------------------------------------------------------------ balances

class LeaveBalanceItem(BaseModel):
    leave_type: LeaveTypeRef
    year: int
    annual_days: Optional[Decimal]  # null = no limit
    balance_days: Optional[Decimal]  # left this year; null = no limit
    pending_days: Decimal  # asked for, not yet decided


class MyLeaveResponse(BaseModel):
    items: list[LeaveRequestResponse]
    total: int
    page: int
    page_size: int
    balances: list[LeaveBalanceItem]  # every active leave type, this year


class EmployeeBalancesResponse(BaseModel):
    employee_id: UUID
    year: int
    balances: list[LeaveBalanceItem]


class BalanceAdjustment(BaseModel):
    """HR adds (positive) or removes (negative) days, with a reason. Audited."""

    leave_type_id: UUID
    days: Decimal = Field(ge=-366, le=366, max_digits=5, decimal_places=2)
    reason: str = Field(min_length=1, max_length=500)
    year: Optional[int] = None  # defaults to this year

    model_config = ConfigDict(extra="forbid")


class PendingLeaveResponse(BaseModel):
    items: list[LeaveRequestResponse]
    total: int
    page: int
    page_size: int


class TeamLeaveResponse(BaseModel):
    """Who's off when (approved and pending) for the people the caller looks after."""

    items: list[LeaveRequestResponse]


# ------------------------------------------------------------ attendance

class AttendanceRecordResponse(BaseModel):
    id: UUID
    employee_id: UUID
    date: date
    status: AttendanceStatus
    check_in_time: Optional[datetime]
    check_out_time: Optional[datetime]


class AttendanceListResponse(BaseModel):
    records: list[AttendanceRecordResponse]
    total: int
    page: int
    page_size: int
