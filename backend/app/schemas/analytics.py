"""
Analytics schemas for PRD §5.15 (Analytics Dashboard).
"""
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CategoryUtilizationItem(BaseModel):
    category: str
    assigned: int
    total: int

    model_config = ConfigDict(from_attributes=True)


class DepartmentUtilizationItem(BaseModel):
    department_id: Optional[UUID] = None
    department_name: str
    assigned_count: int
    total_count: int
    utilization_rate: float
    categories: list[CategoryUtilizationItem] = []

    model_config = ConfigDict(from_attributes=True)


class AssetUtilizationResponse(BaseModel):
    series: list[DepartmentUtilizationItem]

    model_config = ConfigDict(from_attributes=True)


class DepartmentCostItem(BaseModel):
    department_id: Optional[UUID] = None
    department_name: str
    hardware_cost: Decimal
    software_cost: Decimal
    total_cost: Decimal

    model_config = ConfigDict(from_attributes=True)


class CostByDepartmentResponse(BaseModel):
    series: list[DepartmentCostItem]

    model_config = ConfigDict(from_attributes=True)


class HeadcountAssetRatioItem(BaseModel):
    date: str
    headcount: int
    asset_count: int
    ratio: float

    model_config = ConfigDict(from_attributes=True)


class HeadcountAssetRatioResponse(BaseModel):
    series: list[HeadcountAssetRatioItem]

    model_config = ConfigDict(from_attributes=True)


class LicenseUsageItem(BaseModel):
    license_id: UUID
    name: str
    vendor: str
    total_seats: int
    assigned_seats: int
    available_seats: int
    utilization_rate: float
    cost_per_seat: Optional[Decimal] = None
    status: str

    model_config = ConfigDict(from_attributes=True)


class LicenseUsageResponse(BaseModel):
    items: list[LicenseUsageItem]

    model_config = ConfigDict(from_attributes=True)
