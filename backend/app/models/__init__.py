from app.db.session import Base
from app.models.assets import (
    Asset,
    AssetAssignment,
    AssetCategory,
    AssetStatus,
    DepreciationMethod,
    MaintenancePriority,
    MaintenanceStatus,
    MaintenanceTicket,
    SoftwareLicense,
)
from app.models.auth import (
    Department,
    LoginAttempt,
    Permission,
    Role,
    RolePermission,
    Session,
    User,
    UserStatus,
)
from app.models.leave_attendance import (
    AttendanceRecord,
    AttendanceStatus,
    LeaveBalance,
    LeaveRequest,
    LeaveStatus,
    LeaveType,
)
from app.models.lifecycle import (
    Checklist,
    ChecklistItem,
    ChecklistItemStatus,
    ChecklistStatus,
    ChecklistType,
    Document,
    DocumentType,
)
from app.models.requests import (
    ApprovalChainStep,
    ApprovalChainTemplate,
    ApprovalStatus,
    Request,
    RequestApproval,
    RequestPriority,
    RequestStatus,
    RequestType,
)
from app.models.system import (
    AuditLog,
    Notification,
    NotificationChannel,
)

__all__ = [
    "Base",
    # Auth
    "Role",
    "Permission",
    "RolePermission",
    "Department",
    "User",
    "UserStatus",
    "Session",
    "LoginAttempt",
    # Assets
    "SoftwareLicense",
    "Asset",
    "AssetCategory",
    "AssetStatus",
    "DepreciationMethod",
    "AssetAssignment",
    "MaintenanceTicket",
    "MaintenancePriority",
    "MaintenanceStatus",
    # Requests
    "ApprovalChainTemplate",
    "ApprovalChainStep",
    "Request",
    "RequestApproval",
    "RequestType",
    "RequestPriority",
    "RequestStatus",
    "ApprovalStatus",
    # Lifecycle
    "Checklist",
    "ChecklistItem",
    "ChecklistType",
    "ChecklistStatus",
    "ChecklistItemStatus",
    "Document",
    "DocumentType",
    # Leave & Attendance
    "LeaveRequest",
    "LeaveBalance",
    "AttendanceRecord",
    "LeaveType",
    "LeaveStatus",
    "AttendanceStatus",
    # System
    "Notification",
    "NotificationChannel",
    "AuditLog",
]
