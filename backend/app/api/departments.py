from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.auth import Department, User, UserStatus

router = APIRouter()


class DepartmentItem(BaseModel):
    id: UUID
    name: str
    code: str | None = None
    head_count: int = 0

    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=list[DepartmentItem])
@router.get("/", response_model=list[DepartmentItem])
def get_departments(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DepartmentItem]:
    """
    Get list of all departments with active member headcount in a single aggregated query.
    """
    rows = (
        db.query(
            Department.id,
            Department.name,
            func.count(User.id).filter(User.status == UserStatus.active).label("head_count"),
        )
        .outerjoin(User, User.department_id == Department.id)
        .group_by(Department.id, Department.name)
        .order_by(Department.name.asc())
        .all()
    )
    results: list[DepartmentItem] = []
    for r in rows:
        code = "".join(w[0] for w in r.name.split() if w).upper() if r.name else "DEPT"
        results.append(
            DepartmentItem(
                id=r.id,
                name=r.name,
                code=code,
                head_count=r.head_count or 0,
            )
        )
    return results
