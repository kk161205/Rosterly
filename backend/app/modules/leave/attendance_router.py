"""
Attendance API.
"""
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.modules.leave.attendance_service import AttendanceService
from app.modules.leave.schemas import AttendanceListResponse, AttendanceRecordResponse

router = APIRouter()


def get_service(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AttendanceService:
    return AttendanceService(db=db, current_user=current_user)


@router.get("", response_model=AttendanceListResponse)
@router.get("/", response_model=AttendanceListResponse, include_in_schema=False)
def list_attendance(
    employee_id: Optional[UUID] = Query(None),
    date_from: Optional[date] = Query(None, alias="from", description="Inclusive start date (default: start of month)"),
    date_to: Optional[date] = Query(None, alias="to", description="Inclusive end date (default: end of month)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    service: AttendanceService = Depends(get_service),
) -> AttendanceListResponse:
    """GET /attendance: self; manager for own department; hr_admin/super_admin for all. Max 92 days."""
    return service.list_records(employee_id, date_from, date_to, page, page_size)


@router.post("/check-in", response_model=AttendanceRecordResponse, status_code=status.HTTP_201_CREATED)
def check_in(service: AttendanceService = Depends(get_service)) -> AttendanceRecordResponse:
    """POST /attendance/check-in: 403 when manual mode is off; 409 on a second check-in."""
    return service.check_in()


@router.post("/check-out", response_model=AttendanceRecordResponse)
def check_out(service: AttendanceService = Depends(get_service)) -> AttendanceRecordResponse:
    """POST /attendance/check-out: needs an open check-in today; once only."""
    return service.check_out()
