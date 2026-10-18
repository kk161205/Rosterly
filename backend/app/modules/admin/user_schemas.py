"""
User schemas for PRD §5.14 (User Management).
"""
from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreateRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255, description="Full name of user")
    email: EmailStr = Field(..., description="Corporate email address")
    role_id: UUID = Field(..., description="Role UUID to assign")
    department_id: Optional[UUID] = Field(None, description="Department UUID")
    designation: Optional[str] = Field(None, max_length=100, description="Job title / designation")
    date_of_joining: Optional[date] = Field(None, description="Date of joining")


class UserRoleUpdateRequest(BaseModel):
    role_id: UUID = Field(..., description="Primary role UUID")
    additional_role_ids: Optional[list[UUID]] = Field(
        None,
        description="Additional roles (§5.14 multi-role). Omitted = keep the current additional roles.",
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
    """GET /users/access-preview (§5.14): what a set of roles merges into."""

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
