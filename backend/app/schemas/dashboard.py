from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# --- Shared Item Schemas ---

class AssignedAssetItem(BaseModel):
    id: UUID
    name: str
    asset_tag: str
    category: str
    serial_number: str | None = None
    assigned_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class RequestItem(BaseModel):
    id: UUID
    title: str
    request_type: str
    status: str
    priority: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PendingApprovalItem(BaseModel):
    id: UUID
    title: str
    request_type: str
    requester_name: str
    priority: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TaskChecklistItem(BaseModel):
    id: UUID
    checklist_id: UUID
    task_name: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ActivityTimelineItem(BaseModel):
    id: UUID
    title: str
    message: str
    created_at: datetime
    activity_type: str | None = None

    model_config = ConfigDict(from_attributes=True)


class TeamMemberItem(BaseModel):
    id: UUID
    full_name: str
    designation: str
    status: str
    email: str

    model_config = ConfigDict(from_attributes=True)


class OnboardingOffboardingItem(BaseModel):
    id: UUID
    employee_name: str
    department: str | None = None
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MaintenanceTicketItem(BaseModel):
    id: UUID
    asset_name: str
    issue_description: str
    priority: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExpiringWarrantyItem(BaseModel):
    id: UUID
    asset_tag: str
    name: str
    warranty_expiry: date | None = None

    model_config = ConfigDict(from_attributes=True)


class AuditEventItem(BaseModel):
    id: UUID
    actor_name: str
    action: str
    entity_type: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Role-Specific Schemas ---

class EmployeeDashboardMetrics(BaseModel):
    my_assigned_assets_count: int = 0
    my_open_requests_count: int = 0
    pending_tasks_count: int = 0
    unread_alerts_count: int = 0


class EmployeeDashboardWidgets(BaseModel):
    my_assigned_assets: list[AssignedAssetItem] = Field(default_factory=list)
    my_open_requests: list[RequestItem] = Field(default_factory=list)
    pending_action_items: list[TaskChecklistItem] = Field(default_factory=list)
    recent_activity: list[ActivityTimelineItem] = Field(default_factory=list)


class ManagerDashboardMetrics(EmployeeDashboardMetrics):
    pending_approvals_count: int = 0
    team_headcount: int = 0
    dept_asset_allocation: int = 0


class ManagerDashboardWidgets(EmployeeDashboardWidgets):
    pending_approvals: list[PendingApprovalItem] = Field(default_factory=list)
    team_members: list[TeamMemberItem] = Field(default_factory=list)


class HRAdminDashboardMetrics(BaseModel):
    active_onboardings_count: int = 0
    active_offboardings_count: int = 0
    document_expiry_watchlist_count: int = 0
    total_employees_count: int = 0
    unread_alerts_count: int = 0


class HRAdminDashboardWidgets(BaseModel):
    active_onboardings: list[OnboardingOffboardingItem] = Field(default_factory=list)
    active_offboardings: list[OnboardingOffboardingItem] = Field(default_factory=list)
    pending_action_items: list[TaskChecklistItem] = Field(default_factory=list)
    recent_activity: list[ActivityTimelineItem] = Field(default_factory=list)


class ITAdminDashboardMetrics(BaseModel):
    open_maintenance_tickets_count: int = 0
    warranty_expiring_count: int = 0
    available_stock_count: int = 0
    total_assets_count: int = 0
    unread_alerts_count: int = 0


class ITAdminDashboardWidgets(BaseModel):
    open_maintenance_tickets: list[MaintenanceTicketItem] = Field(default_factory=list)
    expiring_warranties: list[ExpiringWarrantyItem] = Field(default_factory=list)
    pending_action_items: list[TaskChecklistItem] = Field(default_factory=list)
    recent_activity: list[ActivityTimelineItem] = Field(default_factory=list)


class SuperAdminDashboardMetrics(BaseModel):
    total_users_count: int = 0
    total_assets_count: int = 0
    system_health: str = "healthy"
    audit_events_count: int = 0
    unread_alerts_count: int = 0


class SuperAdminDashboardWidgets(BaseModel):
    system_overview: dict[str, Any] = Field(default_factory=dict)
    audit_events_feed: list[AuditEventItem] = Field(default_factory=list)
    recent_activity: list[ActivityTimelineItem] = Field(default_factory=list)


# --- Top-Level Dashboard Response Envelope ---

class DashboardResponse(BaseModel):
    role: str
    metrics: dict[str, Any]
    widgets: dict[str, Any]

    model_config = ConfigDict(from_attributes=True)
