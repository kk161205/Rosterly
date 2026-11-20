"""
Audit Log Viewer API. super_admin and auditor only,
enforced via the (audit_log, read) permission.
"""
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.modules.audit.schemas import AuditLogListResponse
from app.modules.audit.service import AuditLogService

router = APIRouter()


@router.get("", response_model=AuditLogListResponse)
@router.get("/", response_model=AuditLogListResponse, include_in_schema=False)
def list_audit_logs(
    actor_id: UUID | None = Query(None),
    action: str | None = Query(None),
    entity_type: str | None = Query(None),
    date_from: date | None = Query(None, alias="from", description="Inclusive start date (ISO)"),
    date_to: date | None = Query(None, alias="to", description="Inclusive end date (ISO)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuditLogListResponse:
    """GET /audit-logs: newest first; read-only, writes nothing to audit_logs."""
    return AuditLogService(db=db, current_user=current_user).list_logs(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )
