"""
Personal preferences: the accent colour and the AI
Guide switches. Self only — everyone reads and changes just their own row.
Not audited: these are personal display choices, not business records.
The company switch `ai.assistant_enabled` (Access → Settings) is returned
alongside, so the frontend knows whether the Guide may appear at all.
"""
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.company_settings import get_setting
from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.models.system import GuideStyle, UserPreference

router = APIRouter()

# Palette ids — the colours themselves live in the frontend (styles/globals.css).
Accent = Literal["navy", "sage", "lavender", "dusk", "peach", "sand", "rose"]


class PreferencesResponse(BaseModel):
    accent: Accent
    assistant_enabled: bool
    guide_style: Literal["show", "take"]
    voice_enabled: bool
    company_assistant_enabled: bool
    updated_at: Optional[datetime] = None


class PreferencesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    accent: Optional[Accent] = None
    assistant_enabled: Optional[bool] = None
    guide_style: Optional[Literal["show", "take"]] = None
    voice_enabled: Optional[bool] = None


def _response(db: Session, row: Optional[UserPreference]) -> PreferencesResponse:
    company = bool(get_setting(db, "ai.assistant_enabled"))
    if row is None:
        return PreferencesResponse(
            accent="navy", assistant_enabled=True, guide_style="show", voice_enabled=False, company_assistant_enabled=company
        )
    return PreferencesResponse(
        accent=row.accent,
        assistant_enabled=row.assistant_enabled,
        guide_style=row.guide_style.value if isinstance(row.guide_style, GuideStyle) else row.guide_style,
        voice_enabled=row.voice_enabled,
        company_assistant_enabled=company,
        updated_at=row.updated_at,
    )


@router.get("/preferences", response_model=PreferencesResponse)
def get_preferences(
    current_user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)
) -> PreferencesResponse:
    """GET /me/preferences — defaults until the person saves something."""
    return _response(db, db.get(UserPreference, current_user.user_id))


@router.patch("/preferences", response_model=PreferencesResponse)
def update_preferences(
    data: PreferencesUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PreferencesResponse:
    """PATCH /me/preferences — change any of the four fields; the rest stay."""
    row = db.get(UserPreference, current_user.user_id)
    if row is None:
        row = UserPreference(user_id=current_user.user_id)
        db.add(row)
    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    if "guide_style" in changes:
        changes["guide_style"] = GuideStyle(changes["guide_style"])
    for field, value in changes.items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return _response(db, row)
