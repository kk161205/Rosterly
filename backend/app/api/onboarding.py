"""
Onboarding Workflow API routes — project doc §5.5.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.lifecycle import ChecklistStatus
from app.schemas.onboarding import (
    ChecklistListResponse,
    ChecklistItemResponse,
    ChecklistItemUpdateRequest,
    ChecklistResponse,
    OnboardingCreateRequest,
)
from app.services.onboarding_service import OnboardingService

router = APIRouter()


@router.post("", response_model=ChecklistResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ChecklistResponse, status_code=status.HTTP_201_CREATED)
def create_onboarding_checklist(
    payload: OnboardingCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChecklistResponse:
    """
    POST /onboarding — Kick off onboarding checklist for an employee (PRD §5.5).
    Allowed roles: hr_admin, super_admin only.
    """
    service = OnboardingService(db=db, current_user=current_user)
    data = service.create_onboarding_checklist(employee_id=payload.employee_id)
    return ChecklistResponse.model_validate(data)


@router.get("/{checklist_id}", response_model=ChecklistResponse)
def get_onboarding_checklist(
    checklist_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChecklistResponse:
    """
    GET /onboarding/{checklist_id} — Get detail view of an onboarding checklist (PRD §5.5).
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
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChecklistItemResponse:
    """
    PATCH /onboarding/{checklist_id}/items/{item_id} — Update checklist item status (PRD §5.5).
    Allowed roles: matching owner_role_id user, hr_admin, super_admin.
    Cascading completion: marking the final item 'done' auto-completes the parent checklist.
    """
    service = OnboardingService(db=db, current_user=current_user)
    data = service.update_checklist_item(
        checklist_id=checklist_id, item_id=item_id, new_status=payload.status
    )
    return ChecklistItemResponse.model_validate(data)


@router.get("", response_model=ChecklistListResponse)
@router.get("/", response_model=ChecklistListResponse)
def list_onboardings(
    status: ChecklistStatus | None = Query(None, description="Filter checklists by status"),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChecklistListResponse:
    """
    GET /onboarding — List active/completed onboarding checklists (PRD §5.5).
    Allowed roles: hr_admin, super_admin only.
    """
    service = OnboardingService(db=db, current_user=current_user)
    data = service.list_onboardings(status_filter=status)
    return ChecklistListResponse.model_validate(data)
