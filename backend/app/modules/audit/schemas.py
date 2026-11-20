"""
Audit Log Viewer schemas.
"""
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class AuditActor(BaseModel):
    id: UUID
    full_name: str
    email: str


class AuditLogItem(BaseModel):
    id: UUID
    actor: AuditActor | None  # null for system events
    action: str
    entity_type: str
    entity_id: UUID
    before_state: Any | None
    after_state: Any | None
    ip_address: str
    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogItem]
    total: int
