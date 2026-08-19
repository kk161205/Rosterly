"""
Employee Directory API routes — project doc §5.3.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.lifecycle import DocumentType
from app.schemas.employee_directory import (
    EmployeeActionResponse,
    EmployeeDirectoryResponse,
    EmployeeFiltersMetaResponse,
    EmployeeListItem,
    EmployeeUpdateRequest,
)
from app.schemas.employee_profile import DocumentResponse, EmployeeProfileResponse
from app.services.employee_directory_service import EmployeeDirectoryService
from app.services.employee_profile_service import EmployeeProfileService

router = APIRouter()


@router.get("/{employee_id}", response_model=EmployeeProfileResponse)
def get_employee_profile_detail(
    employee_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EmployeeProfileResponse:
    """
    Get detailed employee profile record (PRD §5.4).
    Applies row-level ABAC scoping: Manager is restricted to own department (403 if out of dept).
    IT Admin is denied (403). Self, HR Admin, Super Admin, and Auditor are allowed.
    """
    service = EmployeeProfileService(db=db, current_user=current_user)
    data = service.get_employee_profile(employee_id=employee_id)
    return EmployeeProfileResponse.model_validate(data)


@router.get("/{employee_id}/documents", response_model=list[DocumentResponse])
def get_employee_documents(
    employee_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DocumentResponse]:
    """
    Get documents for an employee (PRD §5.4).
    Excludes is_confidential=true documents unless caller is HR/Admin/self.
    Manager and IT Admin are denied (403).
    """
    service = EmployeeProfileService(db=db, current_user=current_user)
    data = service.get_employee_documents(employee_id=employee_id)
    return [DocumentResponse.model_validate(d) for d in data]


@router.post(
    "/{employee_id}/documents",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_employee_document(
    employee_id: UUID,
    file: UploadFile = File(...),
    doc_type: DocumentType = Form(...),
    is_confidential: bool = Form(False),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DocumentResponse:
    """
    Upload a document for an employee (PRD §5.4).
    Validates file size (max 10MB) and allowed extension (.pdf, .png, .jpg, .jpeg, .docx).
    Allowed roles: Self, HR Admin, Super Admin. Manager/IT Admin/Auditor denied (403).
    """
    service = EmployeeProfileService(db=db, current_user=current_user)
    content = await file.read()
    data = service.upload_employee_document(
        employee_id=employee_id,
        file_name=file.filename or "uploaded_doc",
        file_bytes=content,
        doc_type=doc_type,
        is_confidential=is_confidential,
    )
    return DocumentResponse.model_validate(data)


@router.delete(
    "/{employee_id}/documents/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_employee_document(
    employee_id: UUID,
    doc_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """
    Delete a document from an employee's vault (PRD §5.4).
    HR Admin and Super Admin only. Employees cannot delete own documents (403).
    """
    service = EmployeeProfileService(db=db, current_user=current_user)
    service.delete_employee_document(employee_id=employee_id, doc_id=doc_id)





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


from app.schemas.employee_profile import EmployeeProfileResponse, EmployeeProfileUpdateRequest


@router.patch("/{employee_id}", response_model=EmployeeProfileResponse)
def update_employee(
    employee_id: UUID,
    payload: EmployeeProfileUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EmployeeProfileResponse:
    """
    Update employee profile details (PRD §5.4).
    Applies field-level permission checks:
    - Self may only update 'phone'. Attempting to update restricted fields returns 400 Bad Request.
    - HR Admin / Super Admin may update all fields including role_id, status, department_id, manager_id.
    - Manager, IT Admin, Auditor are denied (403).
    """
    service = EmployeeProfileService(db=db, current_user=current_user)
    data = service.patch_employee_profile(employee_id=employee_id, payload=payload)
    return EmployeeProfileResponse.model_validate(data)


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
