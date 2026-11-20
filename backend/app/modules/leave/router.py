"""
Leave API. /mine and /pending-approval are declared before
any /{id} route so they are never captured as an id.
"""
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.request_context import client_ip
from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.leave_attendance import LeaveStatus
from app.modules.leave.schemas import (
    LeaveDecision,
    LeaveRejection,
    LeaveRequestCreate,
    LeaveRequestResponse,
    MyLeaveResponse,
    PendingLeaveResponse,
    TeamLeaveResponse,
)
from app.modules.leave.service import LeaveService

router = APIRouter()


def get_service(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LeaveService:
    ip = client_ip(request)
    return LeaveService(db=db, current_user=current_user, ip_address=ip)


@router.post("", response_model=LeaveRequestResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=LeaveRequestResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def apply_for_leave(data: LeaveRequestCreate, service: LeaveService = Depends(get_service)) -> LeaveRequestResponse:
    """POST /leave-requests: 409 insufficient_balance / leave_overlap."""
    return service.apply(data)


@router.get("/mine", response_model=MyLeaveResponse)
def my_leave_requests(
    status: Optional[LeaveStatus] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    service: LeaveService = Depends(get_service),
) -> MyLeaveResponse:
    """GET /leave-requests/mine: own history plus current-year balances."""
    return service.my_requests(status, page, page_size)


@router.get("/pending-approval", response_model=PendingLeaveResponse)
def pending_leave_approvals(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    service: LeaveService = Depends(get_service),
) -> PendingLeaveResponse:
    """GET /leave-requests/pending-approval: direct reports (manager) or everyone (hr_admin, super_admin)."""
    return service.pending_approval(page, page_size)


@router.get("/team", response_model=TeamLeaveResponse)
def team_leave(
    date_from: date = Query(..., alias="from"),
    date_to: date = Query(..., alias="to"),
    service: LeaveService = Depends(get_service),
) -> TeamLeaveResponse:
    """GET /leave-requests/team: who's off when — approved and pending — for the people you approve."""
    return service.team(date_from, date_to)


@router.post("/{leave_id}/cancel", response_model=LeaveRequestResponse)
def cancel_leave(leave_id: UUID, service: LeaveService = Depends(get_service)) -> LeaveRequestResponse:
    """POST /leave-requests/{id}/cancel: withdraw pending leave, or approved leave that hasn't started."""
    return service.cancel(leave_id)


@router.post("/{leave_id}/approve", response_model=LeaveRequestResponse)
def approve_leave(
    leave_id: UUID, data: LeaveDecision = LeaveDecision(), service: LeaveService = Depends(get_service)
) -> LeaveRequestResponse:
    """POST /leave-requests/{id}/approve: deducts the balance and marks the days on_leave."""
    return service.approve(leave_id, data)


@router.post("/{leave_id}/reject", response_model=LeaveRequestResponse)
def reject_leave(
    leave_id: UUID, data: LeaveRejection, service: LeaveService = Depends(get_service)
) -> LeaveRequestResponse:
    """POST /leave-requests/{id}/reject: comments required."""
    return service.reject(leave_id, data)
