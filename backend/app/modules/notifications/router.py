"""
Notifications Center API — project doc §5.16.

Self-scoped for every authenticated user; no (resource, action) permission applies.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.modules.notifications.schemas import (
    MarkAllReadResponse,
    NotificationCategory,
    NotificationListResponse,
    NotificationResponse,
)
from app.modules.notifications.service import NotificationService

router = APIRouter()


@router.get("", response_model=NotificationListResponse)
@router.get("/", response_model=NotificationListResponse, include_in_schema=False)
def list_notifications(
    unread_only: bool = Query(False, description="Only unread notifications"),
    category: NotificationCategory | None = Query(
        None, description="PRD Addition: filter-tab category (approvals, hardware, system)"
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotificationListResponse:
    """GET /notifications (§5.16): the caller's notifications, newest first."""
    return NotificationService(db=db, current_user=current_user).list_notifications(
        unread_only=unread_only, category=category, page=page, page_size=page_size
    )


@router.post("/mark-all-read", response_model=MarkAllReadResponse)
def mark_all_read(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MarkAllReadResponse:
    """POST /notifications/mark-all-read (§5.16): marks only the caller's unread rows."""
    return NotificationService(db=db, current_user=current_user).mark_all_read()


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotificationResponse:
    """PATCH /notifications/{id}/read (§5.16): 404 for anyone else's notification; idempotent."""
    return NotificationService(db=db, current_user=current_user).mark_read(notification_id)
