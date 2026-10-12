import enum
from datetime import datetime
from decimal import Decimal
from typing import Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.requests import ApprovalStatus, RequestPriority, RequestStatus, RequestType


class RequestCreate(BaseModel):
    request_type: RequestType
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1)
    related_asset_id: Optional[uuid.UUID] = None
    estimated_cost: Optional[Decimal] = Field(default=None, ge=Decimal("0.00"))
    priority: RequestPriority = RequestPriority.medium

    @model_validator(mode="after")
    def validate_request_fields(self) -> "RequestCreate":
        if self.related_asset_id is not None and self.request_type != RequestType.asset_request:
            raise ValueError("related_asset_id is only permitted for asset_request")
        if self.estimated_cost is not None and self.estimated_cost < Decimal("0.00"):
            raise ValueError("estimated_cost must be greater than or equal to 0")
        return self


class RequestApprovalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    request_id: uuid.UUID
    step_order: int
    approver_id: Optional[uuid.UUID] = None
    approver_name: Optional[str] = None
    approver_role_id: Optional[uuid.UUID] = None
    approver_role_name: Optional[str] = None
    status: ApprovalStatus
    decision_at: Optional[datetime] = None
    comments: Optional[str] = None
    created_at: datetime


class RequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    requester_id: uuid.UUID
    requester_name: Optional[str] = None
    requester_email: Optional[str] = None
    requester_department: Optional[str] = None
    request_type: RequestType
    title: str
    description: str
    related_asset_id: Optional[uuid.UUID] = None
    related_asset_name: Optional[str] = None
    estimated_cost: Optional[Decimal] = None
    priority: RequestPriority
    status: RequestStatus
    current_step: int
    created_at: datetime
    updated_at: datetime


class RequestDetailResponse(RequestResponse):
    approvals: list[RequestApprovalResponse] = Field(default_factory=list)


class RequestListResponse(BaseModel):
    items: list[RequestResponse]
    total: int
    page: int
    page_size: int


class ApprovalAction(BaseModel):
    comments: Optional[str] = None


class RejectAction(BaseModel):
    comments: str = Field(..., min_length=1)
