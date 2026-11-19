"""
Users API (User Management).
Listing users, assignable roles, sign-in links, role change, account status
and force global logout. New people are added through onboarding.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.request_context import client_ip
from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.modules.auth.mfa_service import MfaService
from app.modules.auth.schemas import MessageResponse
from app.modules.admin.user_schemas import (
    AccessPreviewResponse,
    AssignableRoleResponse,
    SignInLinkResponse,
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
    ip = client_ip(request)
    return UserManagementService(db=db, current_user=current_user, ip_address=ip)


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
    """GET /users: List users with filters and pagination. super_admin, hr_admin."""
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
    """GET /users/assignable-roles: Roles the caller is permitted to assign."""
    return service.get_assignable_roles()


@router.get("/access-preview", response_model=AccessPreviewResponse)
def access_preview(
    role_ids: list[UUID] = Query(default=[], description="Roles to merge"),
    service: UserManagementService = Depends(get_user_management_service),
) -> AccessPreviewResponse:
    """GET /users/access-preview: merged permissions of a role combination. super_admin."""
    return service.access_preview(role_ids)


@router.post("/{id}/sign-in-link", response_model=SignInLinkResponse)
def create_sign_in_link(
    id: UUID,
    service: UserManagementService = Depends(get_user_management_service),
) -> SignInLinkResponse:
    """POST /users/{id}/sign-in-link: a single-use set-password link to hand over. super_admin, hr_admin."""
    return service.create_sign_in_link(user_id=id)


@router.post("/{id}/mfa/reset", response_model=MessageResponse)
def reset_user_mfa(
    id: UUID,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    """POST /users/{id}/mfa/reset: clear someone's two-step sign-in (lost phone). super_admin only."""
    return MfaService(db=db, current_user=current_user, ip_address=client_ip(request)).reset_for(id)


@router.patch("/{id}/role", response_model=UserResponse)
def update_user_role(
    id: UUID,
    payload: UserRoleUpdateRequest,
    service: UserManagementService = Depends(get_user_management_service),
) -> UserResponse:
    """PATCH /users/{id}/role: Set primary role and additional roles. super_admin only."""
    return service.update_user_role(user_id=id, payload=payload)


@router.patch("/{id}/status", response_model=UserResponse)
def update_user_status(
    id: UUID,
    payload: UserStatusUpdateRequest,
    service: UserManagementService = Depends(get_user_management_service),
) -> UserResponse:
    """PATCH /users/{id}/status: Update account status. super_admin, hr_admin."""
    return service.update_user_status(user_id=id, payload=payload)


@router.post("/{id}/force-logout", response_model=MessageResponse)
def force_logout(
    id: UUID,
    service: UserManagementService = Depends(get_user_management_service),
) -> MessageResponse:
    """POST /users/{id}/force-logout: Revoke all sessions for user. super_admin only."""
    return service.force_logout(user_id=id)
