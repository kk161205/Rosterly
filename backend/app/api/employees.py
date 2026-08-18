"""
Employee Directory API routes — project doc §5.3.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.schemas.employee_directory import (
    EmployeeActionResponse,
    EmployeeDirectoryResponse,
    EmployeeFiltersMetaResponse,
    EmployeeListItem,
    EmployeeUpdateRequest,
)
from app.services.employee_directory_service import EmployeeDirectoryService

router = APIRouter()


@router.get("/filters", response_model=EmployeeFiltersMetaResponse)
def get_employee_filters(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EmployeeFiltersMetaResponse:
    """
    Get distinct status and role filter options populated from current DB records.
    """
    service = EmployeeDirectoryService(db=db, current_user=current_user)
    data = service.get_filter_options()
    return EmployeeFiltersMetaResponse.model_validate(data)


@router.get("", response_model=EmployeeDirectoryResponse)
@router.get("/", response_model=EmployeeDirectoryResponse)
def get_employee_directory(
    search: str | None = Query(None, description="Search term for name, email, employee code, or designation"),
    department_id: UUID | None = Query(None, description="Filter by department ID"),
    status: str | None = Query(None, description="Filter by user status"),
    role: str | None = Query(None, description="Filter by user role name"),
    view: str = Query("list", pattern="^(list|tree)$", description="View format: list or tree"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=1000, description="Items per page"),
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
        role=role,
        view=view,
        page=page,
        page_size=page_size,
    )
    return EmployeeDirectoryResponse.model_validate(data)


@router.patch("/{employee_id}", response_model=EmployeeListItem)
def update_employee(
    employee_id: UUID,
    payload: EmployeeUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EmployeeListItem:
    """
    Update employee profile details (Super Admin, HR Admin, or Manager within department).
    """
    service = EmployeeDirectoryService(db=db, current_user=current_user)
    data = service.update_employee(employee_id=employee_id, data=payload)
    return EmployeeListItem.model_validate(data)


@router.post("/{employee_id}/offboard", response_model=EmployeeListItem)
def offboard_employee(
    employee_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EmployeeListItem:
    """
    Initiate offboarding transition for an employee (Super Admin or HR Admin only).
    """
    service = EmployeeDirectoryService(db=db, current_user=current_user)
    data = service.offboard_employee(employee_id=employee_id)
    return EmployeeListItem.model_validate(data)


@router.delete("/{employee_id}", response_model=EmployeeActionResponse)
def delete_employee(
    employee_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EmployeeActionResponse:
    """
    Delete employee record permanently from database (Super Admin only).
    """
    service = EmployeeDirectoryService(db=db, current_user=current_user)
    data = service.delete_employee(employee_id=employee_id)
    return EmployeeActionResponse.model_validate(data)
