"""
Roles API — small addition backing the Employee Directory / Profile edit
forms' "System Access Role" picker (§5.3/§5.4), which previously hardcoded
role names with no way to resolve them to the role_id UUID PATCH
/employees/{id} actually requires. Not a page-specific route in the original
doc — mirrors GET /departments' openness (any authenticated user, no RBAC
gate) since the 6 seeded system roles (§3.1) aren't sensitive data.
"""
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.auth import Role

router = APIRouter()


class RoleItem(BaseModel):
    id: UUID
    name: str

    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=list[RoleItem])
@router.get("/", response_model=list[RoleItem])
def get_roles(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RoleItem]:
    """Get the full list of system roles (§3.1's 6 seeded roles), regardless
    of current membership — unlike /employees/filters' role list, which only
    includes roles that already have at least one user (a filter-with-no-
    matches would be meaningless there, but an edit form needs every role
    selectable even for one with zero current members)."""
    roles = db.query(Role).order_by(Role.name.asc()).all()
    return roles
