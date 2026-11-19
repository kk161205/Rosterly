"""
User schemas (User Management).
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class UserRoleUpdateRequest(BaseModel):
    role_id: UUID = Field(..., description="Primary role UUID")
    additional_role_ids: Optional[list[UUID]] = Field(
        None,
        description="Additional roles (multi-role). Omitted = keep the current additional roles.",
    )


class RoleRef(BaseModel):
    id: UUID
    name: str

    model_config = ConfigDict(from_attributes=True)


class AccessPreviewPermission(BaseModel):
    permission: str  # "resource:action"
    description: Optional[str] = None
    roles: list[str]  # which of the selected roles grant it


class AccessPreviewResponse(BaseModel):
    """GET /users/access-preview: what a set of roles merges into."""

    permissions: list[AccessPreviewPermission]
    conflicts: list[list[str]]  # role-name pairs that can't be held together


class UserStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="New account status: active or inactive")


class UserListItemResponse(BaseModel):
    id: UUID
    employee_code: str
    full_name: str
    email: str
    role_id: UUID
    role_name: str
    additional_roles: list[RoleRef] = []
    department_id: Optional[UUID] = None
    department_name: Optional[str] = None
    designation: str
    status: str
    mfa_enabled: bool = False
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class UserListResponse(BaseModel):
    items: list[UserListItemResponse]
    total: int
    page: int
    page_size: int

    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseModel):
    id: UUID
    employee_code: str
    full_name: str
    email: str
    role_id: UUID
    role_name: str
    additional_roles: list[RoleRef] = []
    department_id: Optional[UUID] = None
    department_name: Optional[str] = None
    designation: str
    status: str
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AssignableRoleResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    is_system_role: bool

    model_config = ConfigDict(from_attributes=True)


class SignInLinkResponse(BaseModel):
    """A single-use set-password link, shown once to the admin who made it."""

    link: str
    purpose: str  # "invite" (never signed in) or "reset"
    expires_in_minutes: int
