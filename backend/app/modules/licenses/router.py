"""
Software License Management API — project doc §5.19.
Read: it_admin, super_admin, auditor. Write: it_admin, super_admin (via permissions).
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.modules.licenses.schemas import (
    LicenseCreate,
    LicenseHoldersResponse,
    LicenseListResponse,
    LicenseResponse,
    LicenseUpdate,
)
from app.modules.licenses.service import LicenseService

router = APIRouter()


def get_service(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LicenseService:
    client_ip = request.client.host if request.client else "127.0.0.1"
    return LicenseService(db=db, current_user=current_user, ip_address=client_ip)


@router.get("", response_model=LicenseListResponse)
@router.get("/", response_model=LicenseListResponse, include_in_schema=False)
def list_licenses(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    service: LicenseService = Depends(get_service),
) -> LicenseListResponse:
    """GET /software-licenses (§5.19): each item carries a computed seats_used."""
    return service.list_licenses(page, page_size)


@router.post("", response_model=LicenseResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=LicenseResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_license(data: LicenseCreate, service: LicenseService = Depends(get_service)) -> LicenseResponse:
    """POST /software-licenses (§5.19)."""
    return service.create_license(data)


@router.get("/{license_id}/holders", response_model=LicenseHoldersResponse)
def get_license_holders(license_id: UUID, service: LicenseService = Depends(get_service)) -> LicenseHoldersResponse:
    """GET /software-licenses/{id}/holders (§5.19): employees currently holding a seat."""
    return service.get_holders(license_id)


@router.patch("/{license_id}", response_model=LicenseResponse)
def update_license(
    license_id: UUID, data: LicenseUpdate, service: LicenseService = Depends(get_service)
) -> LicenseResponse:
    """PATCH /software-licenses/{id} (§5.19): 409 if total_seats would drop below seats_used."""
    return service.update_license(license_id, data)
