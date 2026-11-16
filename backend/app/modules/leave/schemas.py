"""
Leave & Attendance schemas — project doc §5.20.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.leave_attendance import AttendanceStatus, LeaveStatus, LeaveType


class LeaveRequestCreate(BaseModel):
    leave_type: LeaveType
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
    leave_type: LeaveType
    start_date: date
    end_date: date
    total_days: int  # business days (Mon-Fri), excluding holiday-marked dates
    status: LeaveStatus
    approver_id: Optional[UUID]
    approver_name: Optional[str]
    reason: Optional[str]
    decision_comments: Optional[str]
    created_at: datetime
    updated_at: datetime


class LeaveBalanceItem(BaseModel):
    leave_type: LeaveType
    year: int
    balance_days: Decimal


class MyLeaveResponse(BaseModel):
    items: list[LeaveRequestResponse]
    total: int
    page: int
    page_size: int
    # PRD Addition: current-year balances for the four balance cards.
    balances: list[LeaveBalanceItem]


class PendingLeaveResponse(BaseModel):
    items: list[LeaveRequestResponse]
    total: int
    page: int
    page_size: int


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
