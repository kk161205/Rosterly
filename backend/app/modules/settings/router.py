"""
Company settings API: single-value settings a company
changes for itself. Everyone signed in may read them (the UI adapts to them);
each key names who may change it (app/core/company_settings.py). Audited.
"""
from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.company_settings import DEFAULTS, EDITORS, get_setting, set_setting
from app.core.errors import ForbiddenError, NotFoundError
from app.core.request_context import client_ip
from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db

router = APIRouter()


class SettingItem(BaseModel):
    key: str
    value: Any
    can_edit: bool


class SettingUpdate(BaseModel):
    value: Any


def _item(db: Session, current_user: CurrentUser, key: str) -> SettingItem:
    return SettingItem(key=key, value=get_setting(db, key), can_edit=current_user.has_role(*EDITORS[key]))


@router.get("", response_model=list[SettingItem])
def list_settings(
    current_user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[SettingItem]:
    """GET /company-settings: every setting with its value and whether the caller may change it."""
    return [_item(db, current_user, key) for key in DEFAULTS]


@router.put("/{key}", response_model=SettingItem)
def update_setting(
    key: str,
    data: SettingUpdate,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SettingItem:
    """PUT /company-settings/{key}: change one setting (audited)."""
    if key not in DEFAULTS:
        raise NotFoundError("Unknown setting.")
    if not current_user.has_role(*EDITORS[key]):
        raise ForbiddenError("You can't change this setting.")
    set_setting(db, key, data.value, current_user.user_id, client_ip(request))
    db.commit()
    return _item(db, current_user, key)
