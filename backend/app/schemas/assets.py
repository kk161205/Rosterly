from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.assets import AssetCategory, AssetStatus, DepreciationMethod


class CurrentHolderNested(BaseModel):
    id: UUID
    full_name: str
    email: str
    department_id: UUID | None = None
    department_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class AssetCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    category: AssetCategory
    serial_number: str | None = Field(None, max_length=100)
    vendor: str = Field(..., min_length=1, max_length=255)
    purchase_date: date
    purchase_cost: Decimal = Field(..., ge=0)
    depreciation_method: DepreciationMethod
    useful_life_months: int = Field(..., gt=0)
    warranty_expiry: date | None = None
    amc_expiry: date | None = None

    @field_validator("name", "vendor")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        v_stripped = v.strip()
        if not v_stripped:
            raise ValueError("Field cannot be empty or whitespace only")
        return v_stripped


class AssetUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    category: AssetCategory | None = None
    serial_number: str | None = Field(None, max_length=100)
    vendor: str | None = Field(None, min_length=1, max_length=255)
    purchase_date: date | None = None
    purchase_cost: Decimal | None = Field(None, ge=0)
    depreciation_method: DepreciationMethod | None = None
    useful_life_months: int | None = Field(None, gt=0)
    warranty_expiry: date | None = None
    amc_expiry: date | None = None
    status: AssetStatus | None = None

    @field_validator("name", "vendor")
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
    category: AssetCategory
    serial_number: str | None = None
    vendor: str
    purchase_date: date
    purchase_cost: Decimal
    current_value: Decimal
    depreciation_method: DepreciationMethod
    useful_life_months: int
    warranty_expiry: date | None = None
    amc_expiry: date | None = None
    status: AssetStatus
    current_holder_id: UUID | None = None
    current_holder: CurrentHolderNested | None = None
    license_id: UUID | None = None
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
