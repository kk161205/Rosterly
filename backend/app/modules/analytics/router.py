"""
Analytics API — PRD §5.15 (revised 18 Oct 2026). Read-only reports:
- GET /analytics/savings             (analytics:savings)
- GET /analytics/cost-by-department  (analytics:cost_by_department)
- GET /analytics/budget              (analytics:budget_forecast)
- GET /analytics/follow-ups          (analytics:follow_ups)
- GET /analytics/turnaround          (analytics:turnaround)
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.modules.analytics.schemas import (
    BudgetResponse,
    CostByDepartmentResponse,
    FollowUpsResponse,
    SavingsResponse,
    TurnaroundResponse,
)
from app.modules.analytics.service import AnalyticsService

router = APIRouter()


def get_analytics_service(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalyticsService:
    return AnalyticsService(db=db, current_user=current_user)


@router.get("/savings", response_model=SavingsResponse)
def get_savings(service: AnalyticsService = Depends(get_analytics_service)) -> SavingsResponse:
    """Unused licence seats (yearly cost) and idle in-stock equipment. super_admin, it_admin, auditor."""
    return service.get_savings()


@router.get("/cost-by-department", response_model=CostByDepartmentResponse)
def get_cost_by_department(
    from_date: Optional[date] = Query(None, alias="from", description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, alias="to", description="End date (YYYY-MM-DD)"),
    service: AnalyticsService = Depends(get_analytics_service),
) -> CostByDepartmentResponse:
    """Spend by department, hardware vs. licences. super_admin, it_admin, hr_admin, auditor."""
    return service.get_cost_by_department(from_date=from_date, to_date=to_date)


@router.get("/budget", response_model=BudgetResponse)
def get_budget(service: AnalyticsService = Depends(get_analytics_service)) -> BudgetResponse:
    """Replacements due in the next 12 months and warranties ending in 90 days. super_admin, it_admin, auditor."""
    return service.get_budget()


@router.get("/follow-ups", response_model=FollowUpsResponse)
def get_follow_ups(
    from_date: Optional[date] = Query(None, alias="from", description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, alias="to", description="End date (YYYY-MM-DD)"),
    service: AnalyticsService = Depends(get_analytics_service),
) -> FollowUpsResponse:
    """Devices leavers still hold; joiner readiness. super_admin, hr_admin, auditor."""
    return service.get_follow_ups(from_date=from_date, to_date=to_date)


@router.get("/turnaround", response_model=TurnaroundResponse)
def get_turnaround(
    from_date: Optional[date] = Query(None, alias="from", description="Start date (YYYY-MM-DD)"),
    to_date: Optional[date] = Query(None, alias="to", description="End date (YYYY-MM-DD)"),
    service: AnalyticsService = Depends(get_analytics_service),
) -> TurnaroundResponse:
    """Approval and repair turnaround, stuck requests, repeat-repair assets. super_admin, it_admin, hr_admin, auditor."""
    return service.get_turnaround(from_date=from_date, to_date=to_date)
