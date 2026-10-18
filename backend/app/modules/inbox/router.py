"""
Inbox API — project doc §5.2a (Home — Inbox). Read-only.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.modules.inbox.schemas import InboxResponse
from app.modules.inbox.service import InboxService

router = APIRouter()


@router.get("", response_model=InboxResponse)
@router.get("/", response_model=InboxResponse)
def get_inbox(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InboxResponse:
    """GET /inbox (§5.2a): everything waiting on the caller, plus what they finished in the last 24h."""
    return InboxService(db=db, current_user=current_user).get_inbox()
