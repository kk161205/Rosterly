"""
Users API — PRD §5.14 (User Management).
Endpoints for listing users, assignable roles, user invitation/creation,
role change, account status toggle, and force global logout.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.modules.auth.schemas import MessageResponse
from app.modules.admin.user_schemas import (
    AccessPreviewResponse,
    AssignableRoleResponse,
    UserCreateRequest,
    UserListResponse,
    UserResponse,
    UserRoleUpdateRequest,
    UserStatusUpdateRequest,
)
from app.modules.admin.user_service import UserManagementService

router = APIRouter()


def get_user_management_service(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserManagementService:
    client_ip = request.client.host if request.client else "127.0.0.1"
    return UserManagementService(db=db, current_user=current_user, ip_address=client_ip)


@router.get("", response_model=UserListResponse)
@router.get("/", response_model=UserListResponse)
def get_users(
    search: Optional[str] = Query(None, description="Search by name, email, employee code, or designation"),
    role_id: Optional[UUID] = Query(None, description="Filter by role UUID"),
    status: Optional[str] = Query(None, description="Filter by user status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(25, ge=1, le=100, description="Items per page"),
    service: UserManagementService = Depends(get_user_management_service),
) -> UserListResponse:
    """GET /users (PRD §5.14): List users with filters and pagination. super_admin, hr_admin."""
    return service.get_users(
        search=search,
        role_id=role_id,
        status=status,
        page=page,
        page_size=page_size,
    )


@router.get("/assignable-roles", response_model=list[AssignableRoleResponse])
def get_assignable_roles(
    service: UserManagementService = Depends(get_user_management_service),
) -> list[AssignableRoleResponse]:
    """GET /users/assignable-roles (PRD §5.14): Roles the caller is permitted to assign."""
    return service.get_assignable_roles()


@router.get("/access-preview", response_model=AccessPreviewResponse)
def access_preview(
    role_ids: list[UUID] = Query(default=[], description="Roles to merge"),
    service: UserManagementService = Depends(get_user_management_service),
) -> AccessPreviewResponse:
    """GET /users/access-preview (§5.14): merged permissions of a role combination. super_admin."""
    return service.access_preview(role_ids)


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    service: UserManagementService = Depends(get_user_management_service),
) -> UserResponse:
    """POST /users (PRD §5.14): Invite/create user. super_admin, hr_admin."""
    return service.create_user(payload=payload)


@router.patch("/{id}/role", response_model=UserResponse)
def update_user_role(
    id: UUID,
    payload: UserRoleUpdateRequest,
    service: UserManagementService = Depends(get_user_management_service),
) -> UserResponse:
    """PATCH /users/{id}/role (PRD §5.14): Set primary role and additional roles. super_admin only."""
    return service.update_user_role(user_id=id, payload=payload)


@router.patch("/{id}/status", response_model=UserResponse)
def update_user_status(
    id: UUID,
    payload: UserStatusUpdateRequest,
    service: UserManagementService = Depends(get_user_management_service),
) -> UserResponse:
    """PATCH /users/{id}/status (PRD §5.14): Update account status. super_admin, hr_admin."""
    return service.update_user_status(user_id=id, payload=payload)


@router.post("/{id}/force-logout", response_model=MessageResponse)
def force_logout(
    id: UUID,
    service: UserManagementService = Depends(get_user_management_service),
) -> MessageResponse:
    """POST /users/{id}/force-logout (PRD §5.14): Revoke all sessions for user. super_admin only."""
    return service.force_logout(user_id=id)
