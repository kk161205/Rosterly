"""
Leave API — project doc §5.20. /mine and /pending-approval are declared before
any /{id} route so they are never captured as an id.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

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
)
from app.modules.leave.service import LeaveService

router = APIRouter()


def get_service(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LeaveService:
    client_ip = request.client.host if request.client else "127.0.0.1"
    return LeaveService(db=db, current_user=current_user, ip_address=client_ip)


@router.post("", response_model=LeaveRequestResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=LeaveRequestResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def apply_for_leave(data: LeaveRequestCreate, service: LeaveService = Depends(get_service)) -> LeaveRequestResponse:
    """POST /leave-requests (§5.20): 409 insufficient_balance / leave_overlap."""
    return service.apply(data)


@router.get("/mine", response_model=MyLeaveResponse)
def my_leave_requests(
    status: Optional[LeaveStatus] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    service: LeaveService = Depends(get_service),
) -> MyLeaveResponse:
    """GET /leave-requests/mine (§5.20): own history plus current-year balances (PRD Addition)."""
    return service.my_requests(status, page, page_size)


@router.get("/pending-approval", response_model=PendingLeaveResponse)
def pending_leave_approvals(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    service: LeaveService = Depends(get_service),
) -> PendingLeaveResponse:
    """GET /leave-requests/pending-approval (§5.20): direct reports (manager) or everyone (hr_admin, super_admin)."""
    return service.pending_approval(page, page_size)


@router.post("/{leave_id}/approve", response_model=LeaveRequestResponse)
def approve_leave(
    leave_id: UUID, data: LeaveDecision = LeaveDecision(), service: LeaveService = Depends(get_service)
) -> LeaveRequestResponse:
    """POST /leave-requests/{id}/approve (§5.20): deducts the balance and marks the days on_leave."""
    return service.approve(leave_id, data)


@router.post("/{leave_id}/reject", response_model=LeaveRequestResponse)
def reject_leave(
    leave_id: UUID, data: LeaveRejection, service: LeaveService = Depends(get_service)
) -> LeaveRequestResponse:
    """POST /leave-requests/{id}/reject (§5.20): comments required."""
    return service.reject(leave_id, data)
