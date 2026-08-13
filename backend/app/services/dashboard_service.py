from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.security import CurrentUser
from app.models.assets import (
    Asset,
    AssetAssignment,
    AssetStatus,
    MaintenanceStatus,
    MaintenanceTicket,
)
from app.models.auth import Department, Role, User, UserStatus
from app.models.leave_attendance import LeaveRequest, LeaveStatus
from app.models.lifecycle import (
    Checklist,
    ChecklistItem,
    ChecklistItemStatus,
    ChecklistStatus,
    ChecklistType,
    Document,
)
from app.models.requests import ApprovalStatus, Request, RequestApproval, RequestStatus
from app.models.system import AuditLog, Notification
from app.schemas.dashboard import (
    ActivityTimelineItem,
    AssignedAssetItem,
    AuditEventItem,
    EmployeeDashboardMetrics,
    EmployeeDashboardWidgets,
    ExpiringWarrantyItem,
    HRAdminDashboardMetrics,
    HRAdminDashboardWidgets,
    ITAdminDashboardMetrics,
    ITAdminDashboardWidgets,
    MaintenanceTicketItem,
    ManagerDashboardMetrics,
    ManagerDashboardWidgets,
    OnboardingOffboardingItem,
    PendingApprovalItem,
    RequestItem,
    SuperAdminDashboardMetrics,
    SuperAdminDashboardWidgets,
    TaskChecklistItem,
    TeamMemberItem,
)


class DashboardService:
    def __init__(self, db: Session, current_user: CurrentUser):
        self.db = db
        self.user = current_user

    def get_dashboard_data(self) -> dict[str, Any]:
        role_name = (self.user.role or "").lower()

        if role_name == "employee":
            metrics, widgets = self._get_employee_dashboard()
        elif role_name == "manager":
            metrics, widgets = self._get_manager_dashboard()
        elif role_name == "hr_admin":
            metrics, widgets = self._get_hr_admin_dashboard()
        elif role_name == "it_admin":
            metrics, widgets = self._get_it_admin_dashboard()
        elif role_name in ("super_admin", "auditor"):
            metrics, widgets = self._get_super_admin_dashboard()
        else:
            # Fallback to employee payload for custom/unknown roles
            metrics, widgets = self._get_employee_dashboard()

        return {
            "role": role_name,
            "metrics": metrics,
            "widgets": widgets,
        }

    # --- Role Compilers ---

    def _get_employee_dashboard(self) -> tuple[dict[str, Any], dict[str, Any]]:
        user_id = self.user.user_id

        # 1. My Assigned Assets
        assignments = (
            self.db.query(AssetAssignment)
            .options(joinedload(AssetAssignment.asset))
            .filter(
                AssetAssignment.employee_id == user_id,
                AssetAssignment.returned_at.is_(None),
            )
            .all()
        )
        assigned_assets_list = [
            AssignedAssetItem(
                id=a.asset.id if a.asset else a.asset_id,
                name=a.asset.name if a.asset else "Unknown Asset",
                asset_tag=a.asset.asset_tag if a.asset else "",
                category=str(a.asset.category.value) if (a.asset and hasattr(a.asset.category, "value")) else str(getattr(a.asset, "category", "")),
                serial_number=a.asset.serial_number if a.asset else None,
                assigned_at=a.assigned_at,
            )
            for a in assignments
        ]

        # 2. My Open Requests
        open_requests = (
            self.db.query(Request)
            .filter(
                Request.requester_id == user_id,
                Request.status.in_([RequestStatus.pending, RequestStatus.in_progress]),
            )
            .order_by(Request.created_at.desc())
            .limit(10)
            .all()
        )
        open_requests_list = [
            RequestItem(
                id=r.id,
                title=r.title,
                request_type=str(r.request_type.value) if hasattr(r.request_type, "value") else str(r.request_type),
                status=str(r.status.value) if hasattr(r.status, "value") else str(r.status),
                priority=str(r.priority.value) if hasattr(r.priority, "value") else str(r.priority),
                created_at=r.created_at,
            )
            for r in open_requests
        ]

        # 3. Pending Action Items (from checklists assigned to user)
        pending_items = (
            self.db.query(ChecklistItem)
            .join(Checklist)
            .filter(
                Checklist.employee_id == user_id,
                ChecklistItem.status.in_([ChecklistItemStatus.pending, ChecklistItemStatus.in_progress]),
            )
            .order_by(ChecklistItem.created_at.desc())
            .limit(10)
            .all()
        )
        pending_tasks_list = [
            TaskChecklistItem(
                id=item.id,
                task_name=item.task_name,
                status=str(item.status.value) if hasattr(item.status, "value") else str(item.status),
                created_at=item.created_at,
            )
            for item in pending_items
        ]

        # 4. Notifications / Recent Activity
        notifications = (
            self.db.query(Notification)
            .filter(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc())
            .limit(10)
            .all()
        )
        unread_count = (
            self.db.query(func.count(Notification.id))
            .filter(Notification.user_id == user_id, Notification.is_read.is_(False))
            .scalar()
            or 0
        )
        recent_activity_list = [
            ActivityTimelineItem(
                id=n.id,
                title=n.title,
                message=n.message,
                created_at=n.created_at,
                activity_type=n.type,
            )
            for n in notifications
        ]

        metrics = EmployeeDashboardMetrics(
            my_assigned_assets_count=len(assigned_assets_list),
            my_open_requests_count=len(open_requests_list),
            pending_tasks_count=len(pending_tasks_list),
            unread_alerts_count=unread_count,
        ).model_dump()

        widgets = EmployeeDashboardWidgets(
            my_assigned_assets=assigned_assets_list,
            my_open_requests=open_requests_list,
            pending_action_items=pending_tasks_list,
            recent_activity=recent_activity_list,
        ).model_dump()

        return metrics, widgets

    def _get_manager_dashboard(self) -> tuple[dict[str, Any], dict[str, Any]]:
        emp_metrics, emp_widgets = self._get_employee_dashboard()
        user_id = self.user.user_id
        dept_id = self.user.department_id

        # 1. Pending Approvals Queue
        pending_approvals = (
            self.db.query(RequestApproval)
            .options(joinedload(RequestApproval.request).joinedload(Request.requester))
            .filter(
                RequestApproval.approver_id == user_id,
                RequestApproval.status == ApprovalStatus.pending,
            )
            .order_by(RequestApproval.created_at.desc())
            .limit(10)
            .all()
        )
        pending_approvals_list = [
            PendingApprovalItem(
                id=pa.request.id if pa.request else pa.id,
                title=pa.request.title if pa.request else "Approval Request",
                request_type=str(pa.request.request_type.value) if (pa.request and hasattr(pa.request.request_type, "value")) else str(getattr(pa.request, "request_type", "")),
                requester_name=pa.request.requester.full_name if (pa.request and pa.request.requester) else "Employee",
                priority=str(pa.request.priority.value) if (pa.request and hasattr(pa.request.priority, "value")) else "medium",
                created_at=pa.created_at,
            )
            for pa in pending_approvals
        ]

        # Additional pending leave requests for direct reports / department
        pending_leaves_count = 0
        if dept_id or user_id:
            leave_filters = [LeaveRequest.status == LeaveStatus.pending]
            sub_filters = []
            if user_id:
                sub_filters.append(LeaveRequest.approver_id == user_id)
                sub_filters.append(User.manager_id == user_id)
            if dept_id:
                sub_filters.append(User.department_id == dept_id)

            pending_leaves_count = (
                self.db.query(func.count(LeaveRequest.id))
                .join(User, LeaveRequest.employee_id == User.id)
                .filter(and_(*leave_filters, or_(*sub_filters)))
                .scalar()
                or 0
            )

        total_pending_approvals = len(pending_approvals_list) + pending_leaves_count

        # 2. Team Members & Headcount
        team_members_list = []
        team_headcount = 0
        dept_asset_count = 0

        if dept_id:
            team_members = (
                self.db.query(User)
                .filter(User.department_id == dept_id, User.status == UserStatus.active)
                .order_by(User.full_name.asc())
                .limit(10)
                .all()
            )
            team_headcount = (
                self.db.query(func.count(User.id))
                .filter(User.department_id == dept_id, User.status == UserStatus.active)
                .scalar()
                or 0
            )
            team_members_list = [
                TeamMemberItem(
                    id=u.id,
                    full_name=u.full_name,
                    designation=u.designation,
                    status=str(u.status.value) if hasattr(u.status, "value") else str(u.status),
                    email=u.email,
                )
                for u in team_members
            ]
            dept_asset_count = (
                self.db.query(func.count(AssetAssignment.id))
                .join(User, AssetAssignment.employee_id == User.id)
                .filter(
                    User.department_id == dept_id,
                    AssetAssignment.returned_at.is_(None),
                )
                .scalar()
                or 0
            )

        metrics = ManagerDashboardMetrics(
            **emp_metrics,
            pending_approvals_count=total_pending_approvals,
            team_headcount=team_headcount,
            dept_asset_allocation=dept_asset_count,
        ).model_dump()

        widgets = ManagerDashboardWidgets(
            **emp_widgets,
            pending_approvals=pending_approvals_list,
            team_members=team_members_list,
        ).model_dump()

        return metrics, widgets

    def _get_hr_admin_dashboard(self) -> tuple[dict[str, Any], dict[str, Any]]:
        # 1. Onboarding Checklists
        onboardings = (
            self.db.query(Checklist)
            .options(joinedload(Checklist.employee).joinedload(User.department))
            .filter(
                Checklist.type == ChecklistType.onboarding,
                Checklist.status == ChecklistStatus.in_progress,
            )
            .order_by(Checklist.created_at.desc())
            .limit(10)
            .all()
        )
        active_onboardings_list = [
            OnboardingOffboardingItem(
                id=c.id,
                employee_name=c.employee.full_name if c.employee else "Employee",
                department=c.employee.department.name if (c.employee and c.employee.department) else None,
                status=str(c.status.value) if hasattr(c.status, "value") else str(c.status),
                created_at=c.created_at,
            )
            for c in onboardings
        ]
        onboardings_count = (
            self.db.query(func.count(Checklist.id))
            .filter(
                Checklist.type == ChecklistType.onboarding,
                Checklist.status == ChecklistStatus.in_progress,
            )
            .scalar()
            or 0
        )

        # 2. Offboarding Checklists
        offboardings = (
            self.db.query(Checklist)
            .options(joinedload(Checklist.employee).joinedload(User.department))
            .filter(
                Checklist.type == ChecklistType.offboarding,
                Checklist.status == ChecklistStatus.in_progress,
            )
            .order_by(Checklist.created_at.desc())
            .limit(10)
            .all()
        )
        active_offboardings_list = [
            OnboardingOffboardingItem(
                id=c.id,
                employee_name=c.employee.full_name if c.employee else "Employee",
                department=c.employee.department.name if (c.employee and c.employee.department) else None,
                status=str(c.status.value) if hasattr(c.status, "value") else str(c.status),
                created_at=c.created_at,
            )
            for c in offboardings
        ]
        offboardings_count = (
            self.db.query(func.count(Checklist.id))
            .filter(
                Checklist.type == ChecklistType.offboarding,
                Checklist.status == ChecklistStatus.in_progress,
            )
            .scalar()
            or 0
        )

        # 3. Total Active Employees
        total_employees = (
            self.db.query(func.count(User.id))
            .filter(User.status == UserStatus.active)
            .scalar()
            or 0
        )

        # 4. Document Watchlist (Confidential documents or recent uploads)
        doc_expiry_watchlist_count = (
            self.db.query(func.count(Document.id))
            .filter(Document.is_confidential.is_(True))
            .scalar()
            or 0
        )

        # 5. Pending Action Items assigned to HR role
        hr_role_id = self.user.role_id
        pending_items = []
        if hr_role_id:
            pending_items = (
                self.db.query(ChecklistItem)
                .filter(
                    ChecklistItem.owner_role_id == hr_role_id,
                    ChecklistItem.status.in_([ChecklistItemStatus.pending, ChecklistItemStatus.in_progress]),
                )
                .order_by(ChecklistItem.created_at.desc())
                .limit(10)
                .all()
            )
        pending_action_items = [
            TaskChecklistItem(
                id=item.id,
                task_name=item.task_name,
                status=str(item.status.value) if hasattr(item.status, "value") else str(item.status),
                created_at=item.created_at,
            )
            for item in pending_items
        ]

        # 6. Notifications / Unread Alerts
        notifications = (
            self.db.query(Notification)
            .filter(Notification.user_id == self.user.user_id)
            .order_by(Notification.created_at.desc())
            .limit(10)
            .all()
        )
        unread_count = (
            self.db.query(func.count(Notification.id))
            .filter(Notification.user_id == self.user.user_id, Notification.is_read.is_(False))
            .scalar()
            or 0
        )
        recent_activity_list = [
            ActivityTimelineItem(
                id=n.id,
                title=n.title,
                message=n.message,
                created_at=n.created_at,
                activity_type=n.type,
            )
            for n in notifications
        ]

        metrics = HRAdminDashboardMetrics(
            active_onboardings_count=onboardings_count,
            active_offboardings_count=offboardings_count,
            document_expiry_watchlist_count=doc_expiry_watchlist_count,
            total_employees_count=total_employees,
            unread_alerts_count=unread_count,
        ).model_dump()

        widgets = HRAdminDashboardWidgets(
            active_onboardings=active_onboardings_list,
            active_offboardings=active_offboardings_list,
            pending_action_items=pending_action_items,
            recent_activity=recent_activity_list,
        ).model_dump()

        return metrics, widgets

    def _get_it_admin_dashboard(self) -> tuple[dict[str, Any], dict[str, Any]]:
        today = date.today()
        thirty_days_later = today + timedelta(days=30)

        # 1. Open Maintenance Tickets
        open_tickets = (
            self.db.query(MaintenanceTicket)
            .options(joinedload(MaintenanceTicket.asset))
            .filter(
                MaintenanceTicket.status.in_([MaintenanceStatus.open, MaintenanceStatus.in_progress])
            )
            .order_by(MaintenanceTicket.created_at.desc())
            .limit(10)
            .all()
        )
        open_tickets_list = [
            MaintenanceTicketItem(
                id=t.id,
                asset_name=t.asset.name if t.asset else "Unknown Asset",
                issue_description=t.issue_description,
                priority=str(t.priority.value) if hasattr(t.priority, "value") else str(t.priority),
                status=str(t.status.value) if hasattr(t.status, "value") else str(t.status),
                created_at=t.created_at,
            )
            for t in open_tickets
        ]
        open_tickets_count = (
            self.db.query(func.count(MaintenanceTicket.id))
            .filter(MaintenanceTicket.status.in_([MaintenanceStatus.open, MaintenanceStatus.in_progress]))
            .scalar()
            or 0
        )

        # 2. Warranty Expiring in 30 Days
        expiring_assets = (
            self.db.query(Asset)
            .filter(
                Asset.warranty_expiry.is_not(None),
                Asset.warranty_expiry >= today,
                Asset.warranty_expiry <= thirty_days_later,
            )
            .order_by(Asset.warranty_expiry.asc())
            .limit(10)
            .all()
        )
        expiring_warranties_list = [
            ExpiringWarrantyItem(
                id=a.id,
                asset_tag=a.asset_tag,
                name=a.name,
                warranty_expiry=a.warranty_expiry,
            )
            for a in expiring_assets
        ]
        warranty_expiring_count = (
            self.db.query(func.count(Asset.id))
            .filter(
                Asset.warranty_expiry.is_not(None),
                Asset.warranty_expiry >= today,
                Asset.warranty_expiry <= thirty_days_later,
            )
            .scalar()
            or 0
        )

        # 3. Available Stock & Total Assets
        available_stock_count = (
            self.db.query(func.count(Asset.id))
            .filter(Asset.status == AssetStatus.in_stock)
            .scalar()
            or 0
        )
        total_assets_count = self.db.query(func.count(Asset.id)).scalar() or 0

        # 4. Pending Tasks for IT Admin
        it_role_id = self.user.role_id
        pending_items = []
        if it_role_id:
            pending_items = (
                self.db.query(ChecklistItem)
                .filter(
                    ChecklistItem.owner_role_id == it_role_id,
                    ChecklistItem.status.in_([ChecklistItemStatus.pending, ChecklistItemStatus.in_progress]),
                )
                .order_by(ChecklistItem.created_at.desc())
                .limit(10)
                .all()
            )
        pending_action_items = [
            TaskChecklistItem(
                id=item.id,
                task_name=item.task_name,
                status=str(item.status.value) if hasattr(item.status, "value") else str(item.status),
                created_at=item.created_at,
            )
            for item in pending_items
        ]

        # 5. Notifications
        notifications = (
            self.db.query(Notification)
            .filter(Notification.user_id == self.user.user_id)
            .order_by(Notification.created_at.desc())
            .limit(10)
            .all()
        )
        unread_count = (
            self.db.query(func.count(Notification.id))
            .filter(Notification.user_id == self.user.user_id, Notification.is_read.is_(False))
            .scalar()
            or 0
        )
        recent_activity_list = [
            ActivityTimelineItem(
                id=n.id,
                title=n.title,
                message=n.message,
                created_at=n.created_at,
                activity_type=n.type,
            )
            for n in notifications
        ]

        metrics = ITAdminDashboardMetrics(
            open_maintenance_tickets_count=open_tickets_count,
            warranty_expiring_count=warranty_expiring_count,
            available_stock_count=available_stock_count,
            total_assets_count=total_assets_count,
            unread_alerts_count=unread_count,
        ).model_dump()

        widgets = ITAdminDashboardWidgets(
            open_maintenance_tickets=open_tickets_list,
            expiring_warranties=expiring_warranties_list,
            pending_action_items=pending_action_items,
            recent_activity=recent_activity_list,
        ).model_dump()

        return metrics, widgets

    def _get_super_admin_dashboard(self) -> tuple[dict[str, Any], dict[str, Any]]:
        total_users = self.db.query(func.count(User.id)).scalar() or 0
        active_users = self.db.query(func.count(User.id)).filter(User.status == UserStatus.active).scalar() or 0
        total_assets = self.db.query(func.count(Asset.id)).scalar() or 0
        assigned_assets = self.db.query(func.count(Asset.id)).filter(Asset.status == AssetStatus.assigned).scalar() or 0
        pending_requests = self.db.query(func.count(Request.id)).filter(Request.status == RequestStatus.pending).scalar() or 0

        # Audit events in last 24h
        now = datetime.now(timezone.utc)
        one_day_ago = now - timedelta(days=1)
        audit_count_24h = (
            self.db.query(func.count(AuditLog.id))
            .filter(AuditLog.created_at >= one_day_ago)
            .scalar()
            or 0
        )

        audit_logs = (
            self.db.query(AuditLog)
            .options(joinedload(AuditLog.actor))
            .order_by(AuditLog.created_at.desc())
            .limit(15)
            .all()
        )
        audit_feed_list = [
            AuditEventItem(
                id=a.id,
                actor_name=a.actor.full_name if a.actor else "System",
                action=a.action,
                entity_type=a.entity_type,
                created_at=a.created_at,
            )
            for a in audit_logs
        ]

        notifications = (
            self.db.query(Notification)
            .filter(Notification.user_id == self.user.user_id)
            .order_by(Notification.created_at.desc())
            .limit(10)
            .all()
        )
        unread_count = (
            self.db.query(func.count(Notification.id))
            .filter(Notification.user_id == self.user.user_id, Notification.is_read.is_(False))
            .scalar()
            or 0
        )
        recent_activity_list = [
            ActivityTimelineItem(
                id=n.id,
                title=n.title,
                message=n.message,
                created_at=n.created_at,
                activity_type=n.type,
            )
            for n in notifications
        ]

        metrics = SuperAdminDashboardMetrics(
            total_users_count=total_users,
            total_assets_count=total_assets,
            system_health="healthy",
            audit_events_count=audit_count_24h,
            unread_alerts_count=unread_count,
        ).model_dump()

        widgets = SuperAdminDashboardWidgets(
            system_overview={
                "total_users": total_users,
                "active_users": active_users,
                "total_assets": total_assets,
                "assigned_assets": assigned_assets,
                "pending_requests": pending_requests,
            },
            audit_events_feed=audit_feed_list,
            recent_activity=recent_activity_list,
        ).model_dump()

        return metrics, widgets
