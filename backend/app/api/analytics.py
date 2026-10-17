"""
Analytics API — PRD §5.15 (Analytics Dashboard).
Read-only reporting endpoints:
- GET /analytics/asset-utilization
- GET /analytics/cost-by-department
"""
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.schemas.analytics import (
    AssetUtilizationResponse,
    CostByDepartmentResponse,
)
from app.services.analytics_service import AnalyticsService

router = APIRouter()


def get_analytics_service(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalyticsService:
    return AnalyticsService(db=db, current_user=current_user)


@router.get("/asset-utilization", response_model=AssetUtilizationResponse)
def get_asset_utilization(
    department_id: Optional[UUID] = Query(None, description="Optional department UUID filter"),
    from_date: Optional[date] = Query(None, alias="from", description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, alias="to", description="End date (YYYY-MM-DD)"),
    service: AnalyticsService = Depends(get_analytics_service),
) -> AssetUtilizationResponse:
    """GET /analytics/asset-utilization (PRD §5.15): Utilization by department. super_admin, it_admin, auditor."""
    return service.get_asset_utilization(
        department_id=department_id,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/cost-by-department", response_model=CostByDepartmentResponse)
def get_cost_by_department(
    from_date: Optional[date] = Query(None, alias="from", description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, alias="to", description="End date (YYYY-MM-DD)"),
    service: AnalyticsService = Depends(get_analytics_service),
) -> CostByDepartmentResponse:
    """GET /analytics/cost-by-department (PRD §5.15): Spend by department. super_admin, it_admin, hr_admin, auditor."""
    return service.get_cost_by_department(
        from_date=from_date,
        to_date=to_date,
    )
