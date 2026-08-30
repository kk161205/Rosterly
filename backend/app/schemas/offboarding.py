from datetime import date
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas.onboarding import (
    ChecklistItemResponse,
    ChecklistItemUpdateRequest,
    ChecklistResponse,
)


class OffboardingCreateRequest(BaseModel):
    employee_id: UUID
    exit_date: Optional[date] = None
    reason: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


__all__ = [
    "OffboardingCreateRequest",
    "ChecklistItemResponse",
    "ChecklistResponse",
    "ChecklistItemUpdateRequest",
]
