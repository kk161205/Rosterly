"""
Approval Chain Configuration schemas.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.requests import RequestType


class ChainStepInput(BaseModel):
    step_order: int
    approver_role_id: UUID


class ChainTemplateCreate(BaseModel):
    request_type: RequestType
    name: str = Field(max_length=255)
    min_amount: Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    steps: list[ChainStepInput]


class ChainTemplateUpdate(BaseModel):
    """Full replace of name, threshold, active flag and the step list."""

    name: str = Field(max_length=255)
    min_amount: Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    is_active: bool
    steps: list[ChainStepInput]


class ChainStepResponse(BaseModel):
    step_order: int
    approver_role_id: UUID
    approver_role_name: str


class ChainTemplateResponse(BaseModel):
    id: UUID
    request_type: RequestType
    name: str
    min_amount: Optional[Decimal]
    is_active: bool
    steps: list[ChainStepResponse]
    pending_request_count: int  # in-flight requests routed through this template
    created_at: datetime
    updated_at: datetime
    # Set when a change leaves a request type with no active template.
    warning: Optional[str] = None


class ChainTemplateListResponse(BaseModel):
    templates: list[ChainTemplateResponse]
