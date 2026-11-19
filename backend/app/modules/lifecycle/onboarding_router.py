"""
Onboarding Workflow API routes.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.request_context import client_ip
from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.lifecycle import ChecklistStatus
from app.modules.lifecycle.onboarding_schemas import (
    JoinerHistoryResponse,
    ChecklistListResponse,
    ChecklistItemResponse,
    ChecklistItemUpdateRequest,
    ChecklistResponse,
    NewJoinerRequest,
    NewJoinerResponse,
    OnboardingCreateRequest,
)
from app.modules.lifecycle.onboarding_service import OnboardingService

router = APIRouter()


@router.post("", response_model=ChecklistResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ChecklistResponse, status_code=status.HTTP_201_CREATED)
def create_onboarding_checklist(
    payload: OnboardingCreateRequest,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChecklistResponse:
    """
    POST /onboarding — Kick off onboarding checklist for an employee.
    Allowed roles: hr_admin, super_admin only.
    """
    ip_address = client_ip(request)
    service = OnboardingService(db=db, current_user=current_user, ip_address=ip_address)
    data = service.create_onboarding_checklist(employee_id=payload.employee_id)
    return ChecklistResponse.model_validate(data)


@router.post("/new-joiner", response_model=NewJoinerResponse, status_code=status.HTTP_201_CREATED)
def add_new_joiner(
    payload: NewJoinerRequest,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NewJoinerResponse:
    """POST /onboarding/new-joiner: create the account and its checklist; returns a set-password link."""
    service = OnboardingService(db=db, current_user=current_user, ip_address=client_ip(request))
    return NewJoinerResponse.model_validate(service.add_new_joiner(payload))


@router.get("/joiner-history", response_model=JoinerHistoryResponse)
def joiner_history(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JoinerHistoryResponse:
    """GET /onboarding/joiner-history: what recent joiners got in their first weeks, without who they are. HR only."""
    return JoinerHistoryResponse(**OnboardingService(db, current_user).joiner_history())


@router.get("/{checklist_id}", response_model=ChecklistResponse)
def get_onboarding_checklist(
    checklist_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChecklistResponse:
    """
    GET /onboarding/{checklist_id} — Get detail view of an onboarding checklist.
    Allowed roles: hr_admin, it_admin, super_admin, assigned manager.
    """
    service = OnboardingService(db=db, current_user=current_user)
    data = service.get_onboarding_checklist(checklist_id=checklist_id)
    return ChecklistResponse.model_validate(data)


@router.patch("/{checklist_id}/items/{item_id}", response_model=ChecklistItemResponse)
def update_checklist_item(
    checklist_id: UUID,
    item_id: UUID,
    payload: ChecklistItemUpdateRequest,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChecklistItemResponse:
    """
    PATCH /onboarding/{checklist_id}/items/{item_id} — Update checklist item status.
    Allowed roles: matching owner_role_id user, hr_admin, super_admin.
    Cascading completion: marking the final item 'done' auto-completes the parent checklist.
    """
    ip_address = client_ip(request)
    service = OnboardingService(db=db, current_user=current_user, ip_address=ip_address)
    data = service.update_checklist_item(
        checklist_id=checklist_id, item_id=item_id, new_status=payload.status
    )
    return ChecklistItemResponse.model_validate(data)


@router.get("", response_model=ChecklistListResponse)
@router.get("/", response_model=ChecklistListResponse)
def list_onboardings(
    status: ChecklistStatus | None = Query(None, description="Filter checklists by status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChecklistListResponse:
    """
    GET /onboarding — List active/completed onboarding checklists.
    Allowed roles: hr_admin/super_admin (full); it_admin and manager (scoped —
    see OnboardingService.list_onboardings).
    """
    service = OnboardingService(db=db, current_user=current_user)
    data = service.list_onboardings(status_filter=status, page=page, page_size=page_size)
    return ChecklistListResponse.model_validate(data)
