"""Department schemas: the list and the departments settings."""
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DepartmentItem(BaseModel):
    id: UUID
    name: str
    code: str | None = None # initials of the name, computed
    head_count: int = 0  # active members
    manager_id: Optional[UUID] = None  # department head
    manager_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    manager_id: Optional[UUID] = None

    model_config = ConfigDict(extra="forbid")


class DepartmentUpdate(BaseModel):
    """Partial update: rename and/or set the head (send manager_id null to clear it)."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    manager_id: Optional[UUID] = None

    model_config = ConfigDict(extra="forbid")
