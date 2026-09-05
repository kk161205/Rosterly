"""
Asset Inventory API routes — project doc §5.7.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user, require_role
from app.db.session import get_db
from app.models.assets import AssetCategory, AssetStatus
from app.schemas.assets import (
    AssetBulkUpdateRequest,
    AssetCreateRequest,
    AssetListResponse,
    AssetResponse,
    AssetUpdateRequest,
)
from app.services.asset_service import AssetService

router = APIRouter()


@router.get("", response_model=AssetListResponse)
@router.get("/", response_model=AssetListResponse)
def list_assets(
    search: str | None = Query(None, description="Search by name, asset tag, or serial number"),
    category: AssetCategory | None = Query(None, description="Filter by category"),
    status: AssetStatus | None = Query(None, description="Filter by status"),
    department_id: UUID | None = Query(None, description="Filter by holder's department ID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = Depends(require_role("it_admin", "super_admin", "auditor", "manager")),
    db: Session = Depends(get_db),
) -> AssetListResponse:
    """
    GET /api/v1/assets — Browse and search the asset catalog (PRD §5.7).
    - Roles: it_admin, super_admin, auditor (full catalog); manager (scoped to current holder's department).
    - Employee role receives 403 Forbidden.
    """
    service = AssetService(db=db, current_user=current_user)
    return service.list_assets(
        search=search,
        category=category,
        status=status,
        department_id=department_id,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
def create_asset(
    payload: AssetCreateRequest,
    current_user: CurrentUser = Depends(require_role("it_admin", "super_admin")),
    db: Session = Depends(get_db),
) -> AssetResponse:
    """
    POST /api/v1/assets — Provision a new asset (PRD §5.7).
    - Roles: it_admin, super_admin.
    - Auto-generates asset_tag server-side (AST-YYYY-XXXXX).
    """
    service = AssetService(db=db, current_user=current_user)
    return service.create_asset(payload)


@router.patch("/bulk", status_code=status.HTTP_200_OK)
def bulk_update_assets(
    payload: AssetBulkUpdateRequest,
    current_user: CurrentUser = Depends(require_role("it_admin", "super_admin")),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    """
    PATCH /api/v1/assets/bulk — Atomic bulk status update (PRD §5.7).
    - Roles: it_admin, super_admin.
    """
    service = AssetService(db=db, current_user=current_user)
    count = service.bulk_update_assets(payload)
    return {"updated_count": count}


@router.patch("/{id}", response_model=AssetResponse)
def update_asset(
    id: UUID,
    payload: AssetUpdateRequest,
    current_user: CurrentUser = Depends(require_role("it_admin", "super_admin")),
    db: Session = Depends(get_db),
) -> AssetResponse:
    """
    PATCH /api/v1/assets/{id} — Update an asset record (PRD §5.7).
    - Roles: it_admin, super_admin.
    - Note: standard retirement is performed via status='retired'.
    """
    service = AssetService(db=db, current_user=current_user)
    return service.update_asset(asset_id=id, payload=payload)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    id: UUID,
    current_user: CurrentUser = Depends(require_role("super_admin")),
    db: Session = Depends(get_db),
) -> Response:
    """
    DELETE /api/v1/assets/{id} — Hard delete an asset record (PRD §5.7).
    - Role: super_admin ONLY (it_admin receives 403 Forbidden).
    - Reserved for data-entry mistakes only; blocked (409 Conflict) if asset has assignment or maintenance history.
    """
    service = AssetService(db=db, current_user=current_user)
    service.delete_asset(asset_id=id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
