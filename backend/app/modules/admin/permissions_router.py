"""
Permissions API — PRD §5.13 (Role & Permission Management).
Lists every permission so the matrix can show and grant permissions a role
doesn't hold yet. super_admin only (role:read).
"""
from fastapi import APIRouter, Depends

from app.modules.admin.roles_router import get_role_service
from app.modules.admin.role_schemas import PermissionItemResponse
from app.modules.admin.role_service import RoleManagementService

router = APIRouter()


@router.get("", response_model=list[PermissionItemResponse])
@router.get("/", response_model=list[PermissionItemResponse])
def list_permissions(
    service: RoleManagementService = Depends(get_role_service),
) -> list[PermissionItemResponse]:
    """GET /permissions (PRD §5.13): All permissions, ordered by resource and action."""
    return service.list_permissions()
