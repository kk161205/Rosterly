"""
Maintenance Tickets API routes — project doc §5.10.

Only POST /maintenance-tickets is implemented here: it is the single write
§5.8's Asset Detail "Raise Ticket" action needs. The rest of §5.10 (the
Kanban list page: GET /maintenance-tickets, PATCH /maintenance-tickets/{id})
is a separate, not-yet-built page and is intentionally out of scope here.
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.schemas.assets import MaintenanceTicketCreateRequest, MaintenanceTicketResponse
from app.services.asset_service import AssetService

router = APIRouter()


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
