"""
Notifications Center service.

Strictly self-scoped: every query filters on the caller's user_id, so another
user's notification is indistinguishable from a missing one (404, never 403).
"""
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.core.security import CurrentUser
from app.models.system import Notification
from app.modules.notifications.schemas import (
    APPROVAL_TYPES,
    HARDWARE_TYPES,
    MarkAllReadResponse,
    NotificationCategory,
    NotificationListResponse,
    NotificationResponse,
)


class NotificationService:
    def __init__(self, db: Session, current_user: CurrentUser):
        self.db = db
        self.user_id = UUID(str(current_user.user_id))

    def _mine(self):
        return self.db.query(Notification).filter(Notification.user_id == self.user_id)

    def list_notifications(
        self, unread_only: bool, category: NotificationCategory | None, page: int, page_size: int
    ) -> NotificationListResponse:
        query = self._mine()
        if unread_only:
            query = query.filter(Notification.is_read.is_(False))
        if category == NotificationCategory.approvals:
            query = query.filter(Notification.type.in_(APPROVAL_TYPES))
        elif category == NotificationCategory.hardware:
            query = query.filter(Notification.type.in_(HARDWARE_TYPES))
        elif category == NotificationCategory.system:
            query = query.filter(Notification.type.not_in(APPROVAL_TYPES | HARDWARE_TYPES))

        total = query.count()
        rows = (
            query.order_by(Notification.created_at.desc(), Notification.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        # Always the caller's overall unread count — independent of every filter and the page.
        unread_count = (
            self.db.query(func.count(Notification.id))
            .filter(Notification.user_id == self.user_id, Notification.is_read.is_(False))
            .scalar()
        )
        return NotificationListResponse(
            items=[NotificationResponse.model_validate(r) for r in rows],
            total=total,
            unread_count=unread_count or 0,
        )

    def mark_read(self, notification_id: UUID) -> NotificationResponse:
        """Idempotent: marking an already-read notification returns it unchanged."""
        notification = self._mine().filter(Notification.id == notification_id).first()
        if notification is None:
            raise NotFoundError("Notification not found")
        if not notification.is_read:
            notification.is_read = True
            self.db.commit()
            self.db.refresh(notification)
        return NotificationResponse.model_validate(notification)

    def mark_all_read(self) -> MarkAllReadResponse:
        updated = (
            self._mine()
            .filter(Notification.is_read.is_(False))
            .update({Notification.is_read: True}, synchronize_session=False)
        )
        self.db.commit()
        return MarkAllReadResponse(updated_count=updated)
