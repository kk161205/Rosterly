"""
Role schemas for PRD §5.13 (Role & Permission Management).
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RoleItem(BaseModel):
    id: UUID
    name: str

    model_config = ConfigDict(from_attributes=True)


class RoleResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    is_system_role: bool
    user_count: int = 0
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class RoleCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50, description="Unique name of the role")
    description: Optional[str] = Field(None, max_length=500, description="Role description")


class PermissionItemResponse(BaseModel):
    id: UUID
    resource: str
    action: str
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class RolePermissionsResponse(BaseModel):
    role_id: UUID
    role_name: str
    permissions: list[PermissionItemResponse]

    model_config = ConfigDict(from_attributes=True)


class RolePermissionsUpdateRequest(BaseModel):
    permission_ids: list[UUID] = Field(..., description="Full replacement list of permission UUIDs for the role")
