from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.schemas.dashboard import DashboardResponse
from app.services.dashboard_service import DashboardService

router = APIRouter()


@router.get("/summary", response_model=DashboardResponse)
@router.get("", response_model=DashboardResponse)
async def get_dashboard_summary(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DashboardResponse:
    """
    Get role-aware dashboard summary payload (PRD §5.2).

    Composes top KPI metrics and widgets dynamically based on the caller's live role
    retrieved server-side from the database.
    """
    service = DashboardService(db=db, current_user=current_user)
    data = service.get_dashboard_data()
    return DashboardResponse.model_validate(data)
