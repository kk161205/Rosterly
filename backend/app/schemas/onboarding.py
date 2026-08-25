from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.lifecycle import ChecklistItemStatus, ChecklistStatus, ChecklistType


class OnboardingCreateRequest(BaseModel):
    employee_id: UUID

    model_config = ConfigDict(extra="forbid")


class ChecklistItemResponse(BaseModel):
    id: UUID
    checklist_id: UUID
    task_name: str
    owner_role_id: UUID
    owner_role_name: Optional[str] = None
    status: ChecklistItemStatus
    completed_by: Optional[UUID] = None
    completed_by_name: Optional[str] = None
    completed_at: Optional[datetime] = None
    sort_order: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChecklistResponse(BaseModel):
    id: UUID
    employee_id: UUID
    employee_name: Optional[str] = None
    type: ChecklistType
    status: ChecklistStatus
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    progress_percentage: int = 0
    total_items: int = 0
    completed_items: int = 0
    items: list[ChecklistItemResponse] = []

    model_config = ConfigDict(from_attributes=True)


class ChecklistItemUpdateRequest(BaseModel):
    status: ChecklistItemStatus

    model_config = ConfigDict(extra="forbid")


class ChecklistListResponse(BaseModel):
    checklists: list[ChecklistResponse] = []
    total: int

    model_config = ConfigDict(from_attributes=True)
