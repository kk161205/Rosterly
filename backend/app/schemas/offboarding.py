from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas.onboarding import (
    ChecklistListResponse,
    ChecklistItemResponse,
    ChecklistItemUpdateRequest,
    ChecklistResponse,
)


class OffboardingCreateRequest(BaseModel):
    employee_id: UUID

    model_config = ConfigDict(extra="forbid")


__all__ = [
    "OffboardingCreateRequest",
    "ChecklistItemResponse",
    "ChecklistResponse",
    "ChecklistItemUpdateRequest",
    "ChecklistListResponse",
]
