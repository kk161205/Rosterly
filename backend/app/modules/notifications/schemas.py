"""
Notifications Center schemas — project doc §5.16.
"""
from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class NotificationCategory(str, Enum):
    """PRD Addition: the frontend's filter tabs ("All" is the absence of a category)."""

    approvals = "approvals"
    hardware = "hardware"
    system = "system"


# PRD Addition: notification `type` -> tab. Types are those in §6 and those
# the codebase actually emits. Anything not listed (task_assigned,
# onboarding_*/offboarding_*, account_updated, unknown) is a System Alert.
APPROVAL_TYPES = frozenset({"approval_needed", "request_status_change"})
HARDWARE_TYPES = frozenset({"warranty_expiring", "license_renewal"})


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: str
    title: str
    message: str
    related_entity_type: str | None
    related_entity_id: UUID | None
    is_critical: bool
    is_read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    total: int
    unread_count: int


class MarkAllReadResponse(BaseModel):
    updated_count: int
