from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.core.types import NormalizedEmail

from app.models.lifecycle import ChecklistItemStatus, ChecklistStatus, ChecklistType


class OnboardingCreateRequest(BaseModel):
    employee_id: UUID

    model_config = ConfigDict(extra="forbid")


class ExtraChecklistItem(BaseModel):
    """A task added to a new joiner's checklist beyond the standard ones — the usual
    equipment and licences for people like them, or HR's own."""

    task_name: str = Field(..., min_length=1, max_length=200)
    owner: Literal["it_admin", "hr_admin"]

    model_config = ConfigDict(extra="forbid")


class NewJoinerRequest(BaseModel):
    """ "Add new joiner": creates the person's account and their onboarding checklist."""

    full_name: str = Field(..., min_length=1, max_length=255)
    email: NormalizedEmail
    designation: str = Field(..., min_length=1, max_length=100)
    date_of_joining: date
    department_id: Optional[UUID] = None
    manager_id: Optional[UUID] = None
    role_id: Optional[UUID] = None  # defaults to employee
    extra_items: list[ExtraChecklistItem] = Field(default_factory=list, max_length=15)

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
    asset_assignment_id: Optional[UUID] = None
    license_assignment_id: Optional[UUID] = None
    completed_at: Optional[datetime] = None
    sort_order: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChecklistResponse(BaseModel):
    id: UUID
    employee_id: UUID
    employee_name: Optional[str] = None
    employee_designation: Optional[str] = None
    employee_department: Optional[str] = None
    date_of_joining: Optional[date] = None
    date_of_exit: Optional[date] = None
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
    page: int = 1
    page_size: int = 25
    total_pages: int = 0

    model_config = ConfigDict(from_attributes=True)


class NewJoinerResponse(BaseModel):
    checklist: "ChecklistResponse"
    # Shown once so HR can hand it over; also emailed when email delivery is on.
    set_password_link: str
    link_expires_in_minutes: int
    email_sent: bool


class JoinerHistoryItem(BaseModel):
    """One past joiner, without who they are: where they sat and what they got in their first weeks."""

    department_id: Optional[UUID] = None
    department_name: Optional[str] = None
    designation: str
    joined_on: date
    asset_categories: list[str]
    licences: list[dict]


class JoinerHistoryResponse(BaseModel):
    joiners: list[JoinerHistoryItem]
    standard_items: list[str]
