"""
Leave policy API: leave types, company holidays and
balances. Everyone signed in can read types and holidays (the leave form needs
them); changing anything needs leave_policy:manage (hr_admin, super_admin).
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.core.request_context import client_ip
from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.modules.leave.policy import LeavePolicyService
from app.modules.leave.schemas import (
    BalanceAdjustment,
    EmployeeBalancesResponse,
    HolidayCreate,
    HolidayResponse,
    LeaveTypeCreate,
    LeaveTypeResponse,
    LeaveTypeUpdate,
)
from app.modules.leave.service import local_today

types_router = APIRouter()
holidays_router = APIRouter()
balances_router = APIRouter()


def get_service(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LeavePolicyService:
    return LeavePolicyService(db=db, current_user=current_user, ip_address=client_ip(request))


# ------------------------------------------------------------ /leave-types

@types_router.get("", response_model=list[LeaveTypeResponse])
def list_leave_types(
    include_inactive: bool = Query(False), service: LeavePolicyService = Depends(get_service)
) -> list[LeaveTypeResponse]:
    """GET /leave-types: the company's leave types (active ones unless include_inactive)."""
    return service.list_types(include_inactive)


@types_router.post("", response_model=LeaveTypeResponse, status_code=status.HTTP_201_CREATED)
def create_leave_type(data: LeaveTypeCreate, service: LeavePolicyService = Depends(get_service)) -> LeaveTypeResponse:
    """POST /leave-types: add a leave type (e.g. Maternity, Comp-off)."""
    return service.create_type(data)


@types_router.patch("/{type_id}", response_model=LeaveTypeResponse)
def update_leave_type(
    type_id: UUID, data: LeaveTypeUpdate, service: LeavePolicyService = Depends(get_service)
) -> LeaveTypeResponse:
    """PATCH /leave-types/{id}: change its rules, or deactivate it (is_active false)."""
    return service.update_type(type_id, data)


# ------------------------------------------------------------ /holidays

@holidays_router.get("", response_model=list[HolidayResponse])
def list_holidays(
    year: Optional[int] = Query(None, ge=2000, le=2100), service: LeavePolicyService = Depends(get_service)
) -> list[HolidayResponse]:
    """GET /holidays?year=: company holidays for a year (this year by default)."""
    return service.list_holidays(year or local_today().year)


@holidays_router.post("", response_model=HolidayResponse, status_code=status.HTTP_201_CREATED)
def add_holiday(data: HolidayCreate, service: LeavePolicyService = Depends(get_service)) -> HolidayResponse:
    """POST /holidays: add a company holiday."""
    return service.add_holiday(data)


@holidays_router.delete("/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_holiday(holiday_id: UUID, service: LeavePolicyService = Depends(get_service)) -> Response:
    """DELETE /holidays/{id}: remove a company holiday."""
    service.delete_holiday(holiday_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ------------------------------------------------------------ /leave-balances

@balances_router.get("/{employee_id}", response_model=EmployeeBalancesResponse)
def employee_balances(
    employee_id: UUID,
    year: Optional[int] = Query(None, ge=2000, le=2100),
    service: LeavePolicyService = Depends(get_service),
) -> EmployeeBalancesResponse:
    """GET /leave-balances/{employee_id}?year=: someone's balances (HR, super admin)."""
    y = year or local_today().year
    return EmployeeBalancesResponse(employee_id=employee_id, year=y, balances=service.employee_balances(employee_id, y))


@balances_router.post("/{employee_id}/adjust", response_model=EmployeeBalancesResponse)
def adjust_balance(
    employee_id: UUID, data: BalanceAdjustment, service: LeavePolicyService = Depends(get_service)
) -> EmployeeBalancesResponse:
    """POST /leave-balances/{employee_id}/adjust: add or remove days with a reason (audited)."""
    this_year = local_today().year
    balances = service.adjust(employee_id, data, this_year)
    return EmployeeBalancesResponse(employee_id=employee_id, year=data.year or this_year, balances=balances)
