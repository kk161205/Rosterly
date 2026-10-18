"""
Maintenance Tickets API routes — project doc §5.10.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.models.assets import MaintenancePriority, MaintenanceStatus
from app.modules.assets.schemas import (
    MaintenanceTicketCreateRequest,
    MaintenanceTicketListResponse,
    MaintenanceTicketResponse,
    MaintenanceTicketUpdateRequest,
)
from app.modules.assets.router import get_asset_service
from app.modules.assets.service import AssetService

router = APIRouter()


@router.get("", response_model=MaintenanceTicketListResponse)
@router.get("/", response_model=MaintenanceTicketListResponse)
def list_maintenance_tickets(
    status: MaintenanceStatus | None = Query(None, description="Filter by status"),
    priority: MaintenancePriority | None = Query(None, description="Filter by priority"),
    assigned_to: UUID | None = Query(None, description="Filter by assigned technician"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    service: AssetService = Depends(get_asset_service),
) -> MaintenanceTicketListResponse:
    """
    GET /api/v1/maintenance-tickets — List maintenance tickets (PRD §5.10).
    - Roles: it_admin, super_admin, auditor (all tickets); employee (own reported tickets only).
    """
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
    service: AssetService = Depends(get_asset_service),
) -> MaintenanceTicketResponse:
    """
    POST /api/v1/maintenance-tickets — Raise a service ticket for an asset (PRD §5.10).
    - Roles: it_admin, super_admin (any asset).
    - Any other authenticated role: only for an asset currently assigned to them.
    """
    return service.create_maintenance_ticket(payload)


@router.patch("/{id}", response_model=MaintenanceTicketResponse)
def update_maintenance_ticket(
    id: UUID,
    payload: MaintenanceTicketUpdateRequest,
    service: AssetService = Depends(get_asset_service),
) -> MaintenanceTicketResponse:
    """
    PATCH /api/v1/maintenance-tickets/{id} — Update maintenance ticket details (PRD §5.10).
    - Roles: it_admin, super_admin ONLY (403 for employee/auditor/manager).
    - Auto-sets resolved_at when status='resolved'; clears resolved_at when un-resolving to open/in_progress.
    """
    return service.update_maintenance_ticket(ticket_id=id, payload=payload)


