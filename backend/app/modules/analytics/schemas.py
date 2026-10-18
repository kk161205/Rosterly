"""
Analytics schemas — PRD §5.15 (revised 18 Oct 2026).

Each report answers a question someone acts on:
- savings: what we pay for and don't use (unused licence seats, idle stock)
- cost-by-department: where the money went
- budget: what needs replacing or loses warranty soon
- follow-ups: devices leavers still hold, joiners not ready for day one
- turnaround: how long approvals and repairs take, and what is stuck
"""
from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------- cost by department (unchanged)

class DepartmentCostItem(BaseModel):
    department_id: Optional[UUID] = None
    department_name: str
    hardware_cost: Decimal
    software_cost: Decimal
    total_cost: Decimal

    model_config = ConfigDict(from_attributes=True)


class CostByDepartmentResponse(BaseModel):
    series: list[DepartmentCostItem]


# ---------------------------------------------------------------- savings

class UnusedLicenceItem(BaseModel):
    license_id: UUID
    name: str
    vendor: str
    total_seats: int
    assigned_seats: int
    unused_seats: int
    cost_per_seat: Optional[Decimal] = None
    # cost_per_seat is per seat per (annual) renewal — see spec §1.18
    unused_cost_per_year: Decimal
    renewal_date: Optional[date] = None


class IdleAssetItem(BaseModel):
    asset_id: UUID
    asset_tag: str
    name: str
    category: str
    in_stock_since: date
    days_idle: int
    current_value: Decimal


class SavingsResponse(BaseModel):
    unused_licences: list[UnusedLicenceItem]
    unused_licence_cost_per_year: Decimal
    idle_assets: list[IdleAssetItem]
    idle_asset_value: Decimal
    idle_threshold_days: int


# ---------------------------------------------------------------- budget

class BudgetAssetItem(BaseModel):
    asset_id: UUID
    asset_tag: str
    name: str
    holder_name: Optional[str] = None
    date: date
    purchase_cost: Decimal


class ReplacementQuarter(BaseModel):
    label: str  # e.g. "Oct–Dec 2026"
    start: date
    count: int
    replacement_cost: Decimal
    assets: list[BudgetAssetItem]


class BudgetResponse(BaseModel):
    past_end_of_life_count: int
    past_end_of_life_cost: Decimal
    replacements: list[ReplacementQuarter]
    replacement_cost_12_months: Decimal
    warranties_expiring: list[BudgetAssetItem]


# ---------------------------------------------------------------- follow-ups

class UnreturnedAsset(BaseModel):
    asset_id: UUID
    asset_tag: str
    name: str
    current_value: Decimal


class LeaverWithDevices(BaseModel):
    employee_id: UUID
    full_name: str
    date_of_exit: Optional[date] = None
    checklist_id: UUID
    assets: list[UnreturnedAsset]


class UpcomingJoiner(BaseModel):
    employee_id: UUID
    full_name: str
    date_of_joining: date
    checklist_id: UUID
    open_tasks: int


class FollowUpsResponse(BaseModel):
    leavers: list[LeaverWithDevices]
    unreturned_count: int
    unreturned_value: Decimal
    joiners_in_period: int
    joiners_ready_on_day_one: int
    upcoming_not_ready: list[UpcomingJoiner]


# ---------------------------------------------------------------- turnaround

class StepTurnaround(BaseModel):
    role_name: Optional[str] = None
    decisions: int
    median_hours: float


class StuckRequest(BaseModel):
    request_id: UUID
    title: str
    waiting_on_role: Optional[str] = None
    waiting_days: int


class PriorityTurnaround(BaseModel):
    priority: str
    resolved: int
    median_hours: float


class RepeatAsset(BaseModel):
    asset_id: UUID
    asset_tag: str
    name: str
    tickets: int


class TurnaroundResponse(BaseModel):
    approval_median_hours: Optional[float] = None
    approvals_by_step: list[StepTurnaround]
    stuck_requests: list[StuckRequest]
    stuck_threshold_days: int
    repair_median_hours: Optional[float] = None
    repairs_by_priority: list[PriorityTurnaround]
    repeat_assets: list[RepeatAsset]
