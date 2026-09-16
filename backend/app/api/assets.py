"""
Asset Inventory API routes — project doc §5.7.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.assets import AssetStatus
from app.schemas.assets import (
    AssetAssignRequest,
    AssetAssignmentResponse,
    AssetBulkUpdateRequest,
    AssetCreateRequest,
    AssetDetailResponse,
    AssetListResponse,
    AssetMetaResponse,
    AssetResponse,
    AssetReturnRequest,
    AssetSummaryResponse,
    AssetUpdateRequest,
    MaintenanceTicketResponse,
)
from app.services.asset_service import AssetService

router = APIRouter()


@router.get("", response_model=AssetListResponse)
@router.get("/", response_model=AssetListResponse)
def list_assets(
    search: str | None = Query(None, description="Search by name, asset tag, or serial number"),
    category: str | None = Query(None, description="Filter by category"),
    status: AssetStatus | None = Query(None, description="Filter by status"),
    department_id: UUID | None = Query(None, description="Filter by holder's department ID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
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


@router.get("/meta", response_model=AssetMetaResponse)
def get_asset_meta(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AssetMetaResponse:
    """
    GET /api/v1/assets/meta — real filter-option data for the Category and
    Status dropdowns (PRD §5.7 addition; rules.md §1.1). Categories are the
    distinct values currently in use (role-scoped); statuses are the fixed
    AssetStatus enum.
    """
    service = AssetService(db=db, current_user=current_user)
    return service.get_asset_meta()


@router.get("/summary", response_model=AssetSummaryResponse)
def get_asset_summary(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AssetSummaryResponse:
    """
    GET /api/v1/assets/summary — real aggregate counts for the Summary Ribbon
    (PRD §5.7 addition), computed server-side across the whole role-scoped
    catalog rather than derived client-side from one paginated page.
    """
    service = AssetService(db=db, current_user=current_user)
    return service.get_asset_summary()


@router.get("/lookup/{asset_tag}", response_model=AssetDetailResponse)
def lookup_asset_by_tag(
    asset_tag: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AssetDetailResponse:
    """
    GET /api/v1/assets/lookup/{asset_tag} — Fast QR tag lookup (PRD §5.9).
    - Roles: it_admin, super_admin ONLY (403 for auditor/manager/employee).
    - Returns 404 if tag does not exist.
    """
    service = AssetService(db=db, current_user=current_user)
    return service.get_asset_detail_by_tag(asset_tag=asset_tag)


@router.get("/{id}", response_model=AssetDetailResponse)
def get_asset_detail(
    id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AssetDetailResponse:
    """
    GET /api/v1/assets/{id} — Full asset record + current assignment (PRD §5.8).
    - Roles: it_admin, super_admin, auditor, current holder, holder's manager.
    """
    service = AssetService(db=db, current_user=current_user)
    return service.get_asset_detail(asset_id=id)


@router.get("/{id}/assignments", response_model=list[AssetAssignmentResponse])
def get_asset_assignments(
    id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AssetAssignmentResponse]:
    """
    GET /api/v1/assets/{id}/assignments — Full assignment history (PRD §5.8).
    - Roles: it_admin, super_admin, auditor, current holder, holder's manager.
    """
    service = AssetService(db=db, current_user=current_user)
    return service.get_asset_assignments(asset_id=id)


@router.get("/{id}/maintenance", response_model=list[MaintenanceTicketResponse])
def get_asset_maintenance(
    id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MaintenanceTicketResponse]:
    """
    GET /api/v1/assets/{id}/maintenance — Service tickets for an asset (PRD §5.8).
    - Roles: it_admin, super_admin, auditor, current holder ONLY.
    - Manager is explicitly excluded per PRD §5.8.
    """
    service = AssetService(db=db, current_user=current_user)
    return service.get_asset_maintenance(asset_id=id)


@router.post("/{id}/assign", response_model=AssetAssignmentResponse, status_code=status.HTTP_201_CREATED)
def assign_asset(
    id: UUID,
    payload: AssetAssignRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AssetAssignmentResponse:
    """
    POST /api/v1/assets/{id}/assign — Assign an in-stock asset to an employee (PRD §5.8).
    - Roles: it_admin, super_admin.
    - Concurrency-safe: pessimistic row locking via with_for_update() + status re-check.
    """
    service = AssetService(db=db, current_user=current_user)
    return service.assign_asset(asset_id=id, payload=payload)


@router.post("/{id}/return", response_model=AssetAssignmentResponse)
def return_asset(
    id: UUID,
    payload: AssetReturnRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AssetAssignmentResponse:
    """
    POST /api/v1/assets/{id}/return — Return an assigned asset to stock (PRD §5.8).
    - Roles: it_admin, super_admin.
    - Concurrency-safe: pessimistic row locking via with_for_update() + status re-check.
    """
    service = AssetService(db=db, current_user=current_user)
    return service.return_asset(asset_id=id, payload=payload)


@router.post("", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
def create_asset(
    payload: AssetCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
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
    current_user: CurrentUser = Depends(get_current_user),
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
    current_user: CurrentUser = Depends(get_current_user),
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
    current_user: CurrentUser = Depends(get_current_user),
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
