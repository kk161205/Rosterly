from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.assets import AssetCategory
from app.models.auth import UserStatus
from app.models.lifecycle import DocumentType


class EmployeeProfileResponse(BaseModel):
    id: UUID
    employee_code: str
    full_name: str
    email: str
    role_id: UUID
    role_name: str
    department_id: Optional[UUID] = None
    department_name: Optional[str] = None
    manager_id: Optional[UUID] = None
    manager_name: Optional[str] = None
    designation: str
    phone: Optional[str] = None
    status: UserStatus
    date_of_joining: date
    date_of_exit: Optional[date] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EmployeeProfileUpdateRequest(BaseModel):
    phone: Optional[str] = None
    address: Optional[str] = None
    full_name: Optional[str] = None
    designation: Optional[str] = None
    department_id: Optional[UUID] = None
    role_id: Optional[UUID] = None
    status: Optional[UserStatus] = None
    manager_id: Optional[UUID] = None

    model_config = ConfigDict(extra="forbid")


class DocumentResponse(BaseModel):
    id: UUID
    employee_id: UUID
    doc_type: DocumentType
    file_name: str
    file_url: str
    is_confidential: bool
    uploaded_by: UUID
    uploaded_by_name: Optional[str] = None
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AssetAssignmentItem(BaseModel):
    id: UUID
    asset_id: UUID
    asset_tag: str
    asset_name: str
    category: AssetCategory
    serial_number: Optional[str] = None
    assigned_by: UUID
    assigned_by_name: Optional[str] = None
    assigned_at: datetime
    returned_at: Optional[datetime] = None
    condition_at_assignment: str
    condition_at_return: Optional[str] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class EmployeeAssetsResponse(BaseModel):
    current: list[AssetAssignmentItem] = []
    history: list[AssetAssignmentItem] = []

    model_config = ConfigDict(from_attributes=True)
