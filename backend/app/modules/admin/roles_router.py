"""
Roles API. The six roles are fixed: this API lists
them and what each can do, and edits role conflicts. super_admin only.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.request_context import client_ip
from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.modules.admin.role_schemas import (
    RoleConflictsUpdateRequest,
    RoleRef,
    RolePermissionsResponse,
    RoleResponse,
)
from app.modules.admin.role_service import RoleManagementService

router = APIRouter()


def get_role_service(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RoleManagementService:
    ip = client_ip(request)
    return RoleManagementService(db=db, current_user=current_user, ip_address=ip)


@router.get("", response_model=list[RoleResponse])
@router.get("/", response_model=list[RoleResponse])
def get_roles(
    service: RoleManagementService = Depends(get_role_service),
) -> list[RoleResponse]:
    """GET /roles: List all roles including user_count. super_admin only."""
    return service.get_roles()


@router.get("/{id}/permissions", response_model=RolePermissionsResponse)
def get_role_permissions(
    id: UUID,
    service: RoleManagementService = Depends(get_role_service),
) -> RolePermissionsResponse:
    """GET /roles/{id}/permissions: View role permissions matrix. super_admin only."""
    return service.get_role_permissions(role_id=id)


@router.put("/{id}/conflicts", response_model=list[RoleRef])
def replace_role_conflicts(
    id: UUID,
    payload: RoleConflictsUpdateRequest,
    service: RoleManagementService = Depends(get_role_service),
) -> list[RoleRef]:
    """PUT /roles/{id}/conflicts: roles this role can't be combined with. role:update."""
    return service.replace_role_conflicts(role_id=id, payload=payload)
