from datetime import date
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.auth import UserStatus


class EmployeeListItem(BaseModel):
    id: UUID
    employee_code: str
    full_name: str
    email: str
    designation: str
    department_id: Optional[UUID] = None
    department_name: Optional[str] = None
    manager_id: Optional[UUID] = None
    manager_name: Optional[str] = None
    status: UserStatus
    phone: Optional[str] = None
    date_of_joining: date

    model_config = ConfigDict(from_attributes=True)


class EmployeeDirectoryResponse(BaseModel):
    items: list[EmployeeListItem]
    total: int
    page: int
    page_size: int
    pages: int

    model_config = ConfigDict(from_attributes=True)
