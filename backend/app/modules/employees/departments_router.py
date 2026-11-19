"""Departments API — list (everyone); create/update/delete (hr_admin, super_admin)."""
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.core.request_context import client_ip
from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.modules.employees.departments_schemas import DepartmentCreate, DepartmentItem, DepartmentUpdate
from app.modules.employees.departments_service import DepartmentService

router = APIRouter()


def get_service(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DepartmentService:
    return DepartmentService(db=db, current_user=current_user, ip_address=client_ip(request))


@router.get("", response_model=list[DepartmentItem])
@router.get("/", response_model=list[DepartmentItem], include_in_schema=False)
def get_departments(service: DepartmentService = Depends(get_service)) -> list[DepartmentItem]:
    """GET /departments: every department with its active headcount and head."""
    return service.list()


@router.post("", response_model=DepartmentItem, status_code=status.HTTP_201_CREATED)
def create_department(data: DepartmentCreate, service: DepartmentService = Depends(get_service)) -> DepartmentItem:
    """POST /departments: add a department."""
    return service.create(data)


@router.patch("/{department_id}", response_model=DepartmentItem)
def update_department(
    department_id: UUID, data: DepartmentUpdate, service: DepartmentService = Depends(get_service)
) -> DepartmentItem:
    """PATCH /departments/{id}: rename and/or set the department head."""
    return service.update(department_id, data)


@router.delete("/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_department(department_id: UUID, service: DepartmentService = Depends(get_service)) -> Response:
    """DELETE /departments/{id}: only when nobody is in it (409 otherwise)."""
    service.delete(department_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
