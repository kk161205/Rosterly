"""
Offboarding Workflow API routes — project doc §5.6.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.schemas.offboarding import (
    ChecklistItemResponse,
    ChecklistItemUpdateRequest,
    ChecklistResponse,
    OffboardingCreateRequest,
)
from app.services.offboarding_service import OffboardingService

router = APIRouter()


@router.post("", response_model=ChecklistResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ChecklistResponse, status_code=status.HTTP_201_CREATED)
def create_offboarding_checklist(
    payload: OffboardingCreateRequest,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChecklistResponse:
    """
    POST /offboarding — Kick off offboarding checklist for an employee (PRD §5.6).
    Allowed roles: hr_admin, super_admin only.
    """
    ip_address = request.client.host if request.client else None
    service = OffboardingService(db=db, current_user=current_user, ip_address=ip_address)
    data = service.create_offboarding_checklist(
        employee_id=payload.employee_id,
        exit_date=payload.exit_date,
        reason=payload.reason,
    )
    return ChecklistResponse.model_validate(data)


@router.get("/{checklist_id}", response_model=ChecklistResponse)
def get_offboarding_checklist(
    checklist_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChecklistResponse:
    """
    GET /offboarding/{checklist_id} — Get detail view of an offboarding checklist (PRD §5.6).
    Allowed roles: hr_admin, it_admin, super_admin, assigned manager.
    """
    service = OffboardingService(db=db, current_user=current_user)
    data = service.get_offboarding_checklist(checklist_id=checklist_id)
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
    PATCH /offboarding/{checklist_id}/items/{item_id} — Update checklist item status (PRD §5.6).
    Allowed roles: matching owner_role_id user, hr_admin, super_admin.
    Side effects: marking an asset-linked item 'done' auto-returns the asset to stock and clears current holder.
    Note: Does NOT auto-complete parent checklist or trigger termination.
    """
    ip_address = request.client.host if request.client else None
    service = OffboardingService(db=db, current_user=current_user, ip_address=ip_address)
    data = service.update_checklist_item(
        checklist_id=checklist_id, item_id=item_id, new_status=payload.status
    )
    return ChecklistItemResponse.model_validate(data)


@router.post("/{checklist_id}/complete", response_model=ChecklistResponse)
def complete_offboarding(
    checklist_id: UUID,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChecklistResponse:
    """
    POST /offboarding/{checklist_id}/complete — Complete offboarding checklist and terminate employee (PRD §5.6).
    Allowed roles: hr_admin, super_admin only.
    Verifies all items are marked 'done', transitions employee status to 'terminated', revokes active sessions.
    """
    ip_address = request.client.host if request.client else None
    service = OffboardingService(db=db, current_user=current_user, ip_address=ip_address)
    data = service.complete_offboarding(checklist_id=checklist_id)
    return ChecklistResponse.model_validate(data)
