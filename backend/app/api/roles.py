"""
Roles & Permissions API — PRD §5.13 (Role & Permission Management).
All endpoints restricted to super_admin via check_permission.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.schemas.roles import (
    RoleCreateRequest,
    RolePermissionsResponse,
    RoleResponse,
)
from app.services.role_management_service import RoleManagementService

router = APIRouter()


def get_role_service(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RoleManagementService:
    client_ip = request.client.host if request.client else "127.0.0.1"
    return RoleManagementService(db=db, current_user=current_user, ip_address=client_ip)


@router.get("", response_model=list[RoleResponse])
@router.get("/", response_model=list[RoleResponse])
def get_roles(
    service: RoleManagementService = Depends(get_role_service),
) -> list[RoleResponse]:
    """GET /roles (PRD §5.13): List all roles including user_count. super_admin only."""
    return service.get_roles()


@router.post("", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
def create_role(
    payload: RoleCreateRequest,
    service: RoleManagementService = Depends(get_role_service),
) -> RoleResponse:
    """POST /roles (PRD §5.13): Create custom role. super_admin only."""
    return service.create_role(payload=payload)


@router.get("/{id}/permissions", response_model=RolePermissionsResponse)
def get_role_permissions(
    id: UUID,
    service: RoleManagementService = Depends(get_role_service),
) -> RolePermissionsResponse:
    """GET /roles/{id}/permissions (PRD §5.13): View role permissions matrix. super_admin only."""
    return service.get_role_permissions(role_id=id)
