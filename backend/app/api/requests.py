from typing import Optional
import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.requests import RequestPriority, RequestStatus, RequestType
from app.schemas.requests import (
    ApprovalAction,
    RejectAction,
    RequestCreate,
    RequestDetailResponse,
    RequestListResponse,
    RequestResponse,
)
from app.services.request_service import RequestService

router = APIRouter()


def _get_ip_address(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


@router.post("", response_model=RequestDetailResponse, status_code=status.HTTP_201_CREATED)
def create_request(
    data: RequestCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    POST /requests (PRD §5.11):
    Create a new unified request, resolve its approval chain, and notify step 1.
    """
    service = RequestService(db=db, current_user=current_user, ip_address=_get_ip_address(request))
    return service.create_request(data)


@router.get("/mine", response_model=RequestListResponse, status_code=status.HTTP_200_OK)
def get_my_requests(
    request: Request,
    status: Optional[RequestStatus] = Query(None, description="Filter by request status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(25, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    GET /requests/mine (PRD §5.11):
    Retrieve paginated requests submitted by the authenticated user.
    """
    service = RequestService(db=db, current_user=current_user, ip_address=_get_ip_address(request))
    return service.get_my_requests(status=status, page=page, page_size=page_size)


@router.get("/pending-approval", response_model=RequestListResponse, status_code=status.HTTP_200_OK)
def get_pending_approvals(
    request: Request,
    type: Optional[RequestType] = Query(None, description="Filter by request type"),
    priority: Optional[RequestPriority] = Query(None, description="Filter by priority"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(25, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    GET /requests/pending-approval (PRD §5.12):
    Approvals Queue: actionable current-step requests routed to caller.
    Registered BEFORE /{id} to avoid route shadowing.
    """
    service = RequestService(db=db, current_user=current_user, ip_address=_get_ip_address(request))
    return service.get_pending_approvals(request_type=type, priority=priority, page=page, page_size=page_size)


@router.get("/{id}", response_model=RequestDetailResponse, status_code=status.HTTP_200_OK)
def get_request_detail(
    id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    GET /requests/{id} (PRD §5.11):
    Detailed view with full approval chain progression.
    Accessible to requester, assigned approvers, super_admin, and auditor.
    """
    service = RequestService(db=db, current_user=current_user, ip_address=_get_ip_address(request))
    return service.get_request_detail(id)


@router.post("/{id}/cancel", response_model=RequestDetailResponse, status_code=status.HTTP_200_OK)
def cancel_request(
    id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    POST /requests/{id}/cancel (PRD §5.11):
    Requester cancels own request while pending. Closes open approval steps.
    """
    service = RequestService(db=db, current_user=current_user, ip_address=_get_ip_address(request))
    return service.cancel_request(id)


@router.post("/{id}/approve", response_model=RequestDetailResponse, status_code=status.HTTP_200_OK)
def approve_request(
    id: uuid.UUID,
    request: Request,
    data: ApprovalAction = ApprovalAction(),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    POST /requests/{id}/approve (PRD §5.12):
    Approve the current step. Row locked; 409 if already acted. Advances step or marks approved.
    """
    service = RequestService(db=db, current_user=current_user, ip_address=_get_ip_address(request))
    return service.approve_request(id, data)


@router.post("/{id}/reject", response_model=RequestDetailResponse, status_code=status.HTTP_200_OK)
def reject_request(
    id: uuid.UUID,
    data: RejectAction,
    request: Request,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    POST /requests/{id}/reject (PRD §5.12):
    Reject request with mandatory comments. Stops further steps and marks remaining as skipped.
    """
    service = RequestService(db=db, current_user=current_user, ip_address=_get_ip_address(request))
    return service.reject_request(id, data)
