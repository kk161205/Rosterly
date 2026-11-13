"""
Software License Management schemas — project doc §5.19.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class LicenseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    vendor: str = Field(min_length=1, max_length=255)
    total_seats: int = Field(gt=0)
    cost_per_seat: Optional[Decimal] = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    renewal_date: Optional[date] = None


class LicenseUpdate(BaseModel):
    """Partial update: only the fields sent are changed (renewal_date/cost_per_seat may be sent as null)."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    vendor: Optional[str] = Field(default=None, min_length=1, max_length=255)
    total_seats: Optional[int] = Field(default=None, gt=0)
    cost_per_seat: Optional[Decimal] = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    renewal_date: Optional[date] = None


class LicenseResponse(BaseModel):
    id: UUID
    name: str
    vendor: str
    total_seats: int
    seats_used: int
    cost_per_seat: Optional[Decimal]
    renewal_date: Optional[date]
    created_at: datetime
    updated_at: datetime


class LicenseListResponse(BaseModel):
    items: list[LicenseResponse]
    total: int


class LicenseHolder(BaseModel):
    employee_id: UUID
    full_name: str
    email: str
    asset_id: UUID
    asset_tag: str
    asset_name: str


class LicenseHoldersResponse(BaseModel):
    holders: list[LicenseHolder]
