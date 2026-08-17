"""
Employee Directory API routes — project doc §5.3.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.schemas.employee_directory import EmployeeDirectoryResponse
from app.services.employee_directory_service import EmployeeDirectoryService

router = APIRouter()


@router.get("", response_model=EmployeeDirectoryResponse)
@router.get("/", response_model=EmployeeDirectoryResponse)
def get_employee_directory(
    search: str | None = Query(None, description="Search term for name, email, employee code, or designation"),
    department_id: UUID | None = Query(None, description="Filter by department ID"),
    status: str | None = Query(None, description="Filter by user status"),
    view: str = Query("list", pattern="^(list|tree)$", description="View format: list or tree"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EmployeeDirectoryResponse:
    """
    Get employee directory list or tree view (PRD §5.3).

    Applies ABAC row-level scoping for `manager` callers (forced department match).
    Sanitized fields only — excludes salary/document fields for all roles.
    """
    service = EmployeeDirectoryService(db=db, current_user=current_user)
    data = service.get_employees(
        search=search,
        department_id=department_id,
        status=status,
        view=view,
        page=page,
        page_size=page_size,
    )
    return EmployeeDirectoryResponse.model_validate(data)
