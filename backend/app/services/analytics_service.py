"""
Analytics Service — PRD §5.15 (Analytics Dashboard).
Calculates cross-cutting reporting:
- Asset Utilization by Department
- Cost per Department
- Headcount-to-Asset Ratio Over Time
- Software License Usage vs. Entitlement
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import CurrentUser, check_permission
from app.models.assets import Asset, AssetStatus
from app.models.auth import Department, User
from app.schemas.analytics import (
    AssetUtilizationResponse,
    CategoryUtilizationItem,
    CostByDepartmentResponse,
    DepartmentCostItem,
    DepartmentUtilizationItem,
)

MAX_DATE_RANGE_DAYS = 365 * 5  # 5-year maximum window


def resolve_date_range(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
) -> tuple[date, date]:
    """
    Resolves and validates analytics date range:
    - If both omitted: default to last 30 days ending today.
    - If from_date omitted: to_date - 30 days.
    - If to_date omitted: date.today() (if from_date <= today) or from_date + 30 days.
    - Validates from_date <= to_date.
    - Validates range does not exceed 5 years (1825 days).
    """
    today = date.today()

    if from_date is None and to_date is None:
        to_date = today
        from_date = today - timedelta(days=30)
    elif from_date is None and to_date is not None:
        from_date = to_date - timedelta(days=30)
    elif from_date is not None and to_date is None:
        to_date = today if from_date <= today else from_date + timedelta(days=30)

    if from_date > to_date:
        raise AppError(
            status_code=400,
            code="validation_error",
            message="'from' date must be earlier than or equal to 'to' date.",
            field_errors={"from": "Must be earlier than or equal to 'to'"},
        )

    if (to_date - from_date).days > MAX_DATE_RANGE_DAYS:
        raise AppError(
            status_code=400,
            code="validation_error",
            message="Date range cannot exceed 5 years.",
            field_errors={"date_range": "Exceeds 5 years maximum"},
        )

    return from_date, to_date


class AnalyticsService:
    def __init__(self, db: Session, current_user: CurrentUser):
        self.db = db
        self.current_user = current_user

    def get_asset_utilization(
        self,
        department_id: Optional[UUID] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ) -> AssetUtilizationResponse:
        """
        GET /analytics/asset-utilization (PRD §5.15):
        Reports asset utilization attributable to each department through their current holder.
        - Denominator: non-retired assets (status != 'retired').
        - Numerator: assigned assets (status == 'assigned').
        - Unassigned assets (no holder) are excluded from department utilization.
        - Filtered by purchase_date in [from, to] and optional department_id.
        Access: super_admin, it_admin, auditor.
        """
        check_permission(self.current_user, "analytics", "asset_utilization", self.db)
        resolved_from, resolved_to = resolve_date_range(from_date, to_date)

        # Single aggregation query grouping by department and category
        # Numerator and denominator use identical attribution: assets held by department members
        query = (
            self.db.query(
                Department.id.label("department_id"),
                Department.name.label("department_name"),
                Asset.category.label("category"),
                func.count(Asset.id).label("total_count"),
                func.count(
                    case((Asset.status == AssetStatus.assigned, Asset.id), else_=None)
                ).label("assigned_count"),
            )
            .join(User, Asset.current_holder_id == User.id)
            .join(Department, User.department_id == Department.id)
            .filter(
                Asset.status != AssetStatus.retired,
                Asset.purchase_date >= resolved_from,
                Asset.purchase_date <= resolved_to,
            )
        )

        if department_id:
            query = query.filter(Department.id == department_id)

        rows = (
            query.group_by(Department.id, Department.name, Asset.category)
            .order_by(Department.name.asc(), Asset.category.asc())
            .all()
        )

        if not rows:
            return AssetUtilizationResponse(series=[])

        # Group rows by department
        dept_map: dict[UUID, dict] = {}
        for dept_id, dept_name, category, total_count, assigned_count in rows:
            if dept_id not in dept_map:
                dept_map[dept_id] = {
                    "department_id": dept_id,
                    "department_name": dept_name,
                    "assigned_count": 0,
                    "total_count": 0,
                    "categories": [],
                }
            dept_map[dept_id]["assigned_count"] += assigned_count
            dept_map[dept_id]["total_count"] += total_count
            dept_map[dept_id]["categories"].append(
                CategoryUtilizationItem(
                    category=category,
                    assigned=assigned_count,
                    total=total_count,
                )
            )

        series: list[DepartmentUtilizationItem] = []
        for d_id, d_data in dept_map.items():
            tot = d_data["total_count"]
            asgn = d_data["assigned_count"]
            rate = round((asgn / tot) * 100, 2) if tot > 0 else 0.0
            series.append(
                DepartmentUtilizationItem(
                    department_id=d_data["department_id"],
                    department_name=d_data["department_name"],
                    assigned_count=asgn,
                    total_count=tot,
                    utilization_rate=rate,
                    categories=d_data["categories"],
                )
            )

        return AssetUtilizationResponse(series=series)

    def get_cost_by_department(
        self,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ) -> CostByDepartmentResponse:
        """
        GET /analytics/cost-by-department (PRD §5.15):
        Stacked spend breakdown per department (hardware vs. software license allocation).
        - Filtered by purchase_date in [from, to].
        - Assigned assets attributed to holder's department.
        - Assets without a resolvable department placed in 'Unassigned' bucket.
        Access: super_admin, it_admin, hr_admin, auditor.
        """
        check_permission(self.current_user, "analytics", "cost_by_department", self.db)
        resolved_from, resolved_to = resolve_date_range(from_date, to_date)

        # Single aggregation query in SQL (GROUP BY)
        rows = (
            self.db.query(
                Department.id.label("department_id"),
                func.coalesce(Department.name, "Unassigned").label("department_name"),
                func.coalesce(
                    func.sum(
                        case((Asset.category != "software_license", Asset.purchase_cost), else_=0)
                    ),
                    0,
                ).label("hardware_cost"),
                func.coalesce(
                    func.sum(
                        case((Asset.category == "software_license", Asset.purchase_cost), else_=0)
                    ),
                    0,
                ).label("software_cost"),
                func.coalesce(func.sum(Asset.purchase_cost), 0).label("total_cost"),
            )
            .select_from(Asset)
            .outerjoin(User, Asset.current_holder_id == User.id)
            .outerjoin(Department, User.department_id == Department.id)
            .filter(
                Asset.purchase_date >= resolved_from,
                Asset.purchase_date <= resolved_to,
            )
            .group_by(Department.id, Department.name)
            .order_by(func.coalesce(Department.name, "Unassigned").asc())
            .all()
        )

        if not rows:
            return CostByDepartmentResponse(series=[])

        series = [
            DepartmentCostItem(
                department_id=row.department_id,
                department_name=row.department_name,
                hardware_cost=Decimal(str(row.hardware_cost)),
                software_cost=Decimal(str(row.software_cost)),
                total_cost=Decimal(str(row.total_cost)),
            )
            for row in rows
        ]

        return CostByDepartmentResponse(series=series)
