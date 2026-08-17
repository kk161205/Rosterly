from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class EmployeeListItem(BaseModel):
    id: UUID
    employee_code: str
    full_name: str
    email: str
    designation: str
    department_id: UUID | None = None
    department_name: str | None = None
    manager_id: UUID | None = None
    manager_name: str | None = None
    status: str
    phone: str | None = None
    date_of_joining: date | None = None

    model_config = ConfigDict(from_attributes=True)


class EmployeeDirectoryResponse(BaseModel):
    items: list[EmployeeListItem]
    total: int
    page: int
    page_size: int
    pages: int

    model_config = ConfigDict(from_attributes=True)
