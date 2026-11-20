from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.assets import AssetStatus, MaintenancePriority, MaintenanceStatus


class CurrentHolderNested(BaseModel):
    id: UUID
    full_name: str
    email: str
    department_id: UUID | None = None
    department_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class AssetCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    category: str = Field(..., min_length=1, max_length=100)
    serial_number: str | None = Field(None, max_length=100)
    vendor: str | None = Field(None, max_length=255)
    purchase_date: date | None = None
    purchase_cost: Decimal | None = Field(None, ge=0)
    useful_life_months: int | None = Field(None, gt=0, le=600)
    warranty_expiry: date | None = None
    amc_expiry: date | None = None

    @field_validator("name")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        v_stripped = v.strip()
        if not v_stripped:
            raise ValueError("Field cannot be empty or whitespace only")
        return v_stripped

    @field_validator("vendor", "serial_number")
    @classmethod
    def blank_to_none(cls, v: str | None) -> str | None:
        return (v.strip() or None) if v is not None else None


class AssetUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    category: str | None = Field(None, min_length=1, max_length=100)
    serial_number: str | None = Field(None, max_length=100)
    vendor: str | None = Field(None, min_length=1, max_length=255)
    purchase_date: date | None = None
    purchase_cost: Decimal | None = Field(None, ge=0)
    useful_life_months: int | None = Field(None, gt=0, le=600)
    warranty_expiry: date | None = None
    amc_expiry: date | None = None
    status: AssetStatus | None = None

    @field_validator("name")
    @classmethod
    def strip_whitespace_optional(cls, v: str | None) -> str | None:
        if v is not None:
            v_stripped = v.strip()
            if not v_stripped:
                raise ValueError("Field cannot be empty or whitespace only")
            return v_stripped
        return v


class AssetBulkUpdateRequest(BaseModel):
    asset_ids: list[UUID] = Field(..., min_length=1)
    status: AssetStatus


class AssetResponse(BaseModel):
    id: UUID
    asset_tag: str
    name: str
    category: str
    serial_number: str | None = None
    vendor: str | None = None
    purchase_date: date | None = None
    purchase_cost: Decimal | None = None
    useful_life_months: int | None = None
    warranty_expiry: date | None = None
    amc_expiry: date | None = None
    status: AssetStatus
    current_holder_id: UUID | None = None
    current_holder: CurrentHolderNested | None = None
    is_expiring_soon: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AssetListResponse(BaseModel):
    items: list[AssetResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class AssetMetaResponse(BaseModel):
    """GET /assets/meta — filter option source data."""

    categories: list[str]
    statuses: list[str]


class AssetSummaryResponse(BaseModel):
    """GET /assets/summary — real aggregate counts for the Summary Ribbon."""

    total: int
    deployed: int
    in_stock: int
    under_maintenance: int


# --- Section 5.8 Schemas ---

class AssetAssignRequest(BaseModel):
    employee_id: UUID
    condition_notes: str = Field(..., min_length=1)
    notes: str | None = None

    @field_validator("condition_notes")
    @classmethod
    def strip_condition_notes(cls, v: str) -> str:
        v_stripped = v.strip()
        if not v_stripped:
            raise ValueError("Condition notes cannot be empty or whitespace only")
        return v_stripped


class AssetReturnRequest(BaseModel):
    condition_notes: str = Field(..., min_length=1)
    notes: str | None = None

    @field_validator("condition_notes")
    @classmethod
    def strip_condition_notes(cls, v: str) -> str:
        v_stripped = v.strip()
        if not v_stripped:
            raise ValueError("Condition notes cannot be empty or whitespace only")
        return v_stripped


class AssetAssignmentResponse(BaseModel):
    id: UUID
    asset_id: UUID
    employee_id: UUID
    assigned_by: UUID
    assigned_at: datetime
    returned_at: datetime | None = None
    condition_at_assignment: str
    condition_at_return: str | None = None
    notes: str | None = None
    employee_name: str | None = None
    assigned_by_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class AssetDetailResponse(BaseModel):
    asset: AssetResponse
    current_assignment: AssetAssignmentResponse | None = None

    model_config = ConfigDict(from_attributes=True)


class MaintenanceTicketCreateRequest(BaseModel):
    """POST /maintenance-tickets (minimal slice for Raise Ticket action)."""

    asset_id: UUID
    issue_description: str = Field(..., min_length=1)
    priority: MaintenancePriority = MaintenancePriority.medium

    @field_validator("issue_description")
    @classmethod
    def strip_issue_description(cls, v: str) -> str:
        v_stripped = v.strip()
        if not v_stripped:
            raise ValueError("Issue description cannot be empty or whitespace only")
        return v_stripped


class MaintenanceTicketResponse(BaseModel):
    id: UUID
    asset_id: UUID
    asset_tag: str | None = None
    asset_name: str | None = None
    reported_by: UUID
    assigned_to: UUID | None = None
    issue_description: str
    priority: str
    status: str
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    reporter_name: str | None = None
    assignee_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class MaintenanceTicketUpdateRequest(BaseModel):
    """PATCH /maintenance-tickets/{id}."""

    status: MaintenanceStatus | None = None
    priority: MaintenancePriority | None = None
    assigned_to: UUID | None = None
    issue_description: str | None = Field(None, min_length=1)

    @field_validator("issue_description")
    @classmethod
    def strip_issue_description(cls, v: str | None) -> str | None:
        if v is not None:
            v_stripped = v.strip()
            if not v_stripped:
                raise ValueError("Issue description cannot be empty or whitespace only")
            return v_stripped
        return v


class MaintenanceTicketListResponse(BaseModel):
    """GET /maintenance-tickets."""

    items: list[MaintenanceTicketResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


