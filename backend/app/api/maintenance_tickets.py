"""
Maintenance Tickets API routes — project doc §5.10.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.assets import MaintenancePriority, MaintenanceStatus
from app.schemas.assets import (
    MaintenanceTicketCreateRequest,
    MaintenanceTicketListResponse,
    MaintenanceTicketResponse,
)
from app.services.asset_service import AssetService

router = APIRouter()


@router.get("", response_model=MaintenanceTicketListResponse)
@router.get("/", response_model=MaintenanceTicketListResponse)
def list_maintenance_tickets(
    status: MaintenanceStatus | None = Query(None, description="Filter by status"),
    priority: MaintenancePriority | None = Query(None, description="Filter by priority"),
    assigned_to: UUID | None = Query(None, description="Filter by assigned technician"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MaintenanceTicketListResponse:
    """
    GET /api/v1/maintenance-tickets — List maintenance tickets (PRD §5.10).
    - Roles: it_admin, super_admin, auditor (all tickets); employee (own reported tickets only).
    """
    service = AssetService(db=db, current_user=current_user)
    return service.list_maintenance_tickets(
        status=status,
        priority=priority,
        assigned_to=assigned_to,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=MaintenanceTicketResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=MaintenanceTicketResponse, status_code=status.HTTP_201_CREATED)
def create_maintenance_ticket(
    payload: MaintenanceTicketCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MaintenanceTicketResponse:
    """
    POST /api/v1/maintenance-tickets — Raise a service ticket for an asset (PRD §5.10).
    - Roles: it_admin, super_admin (any asset).
    - Any other authenticated role: only for an asset currently assigned to them.
    """
    service = AssetService(db=db, current_user=current_user)
    return service.create_maintenance_ticket(payload)

