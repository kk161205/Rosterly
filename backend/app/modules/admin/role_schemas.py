"""
Role schemas (roles and what they can do).
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RoleRef(BaseModel):
    id: UUID
    name: str

    model_config = ConfigDict(from_attributes=True)


class RoleResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    is_system_role: bool
    user_count: int = 0 # people holding it as primary OR additional role
    conflicts_with: list[RoleRef] = []  # roles one person may not hold together with this one
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


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


class RoleConflictsUpdateRequest(BaseModel):
    role_ids: list[UUID] = Field(..., description="Full replacement list of roles this role can't be combined with")
