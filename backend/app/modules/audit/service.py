"""
Audit Log Viewer service — project doc §5.17. Read-only: never writes to audit_logs.
"""
from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.errors import ValidationAppError
from app.core.security import CurrentUser, check_permission
from app.models.auth import User
from app.models.system import AuditLog
from app.modules.audit.schemas import AuditActor, AuditLogItem, AuditLogListResponse


class AuditLogService:
    def __init__(self, db: Session, current_user: CurrentUser):
        self.db = db
        self.current_user = current_user

    def list_logs(
        self,
        actor_id: UUID | None,
        action: str | None,
        entity_type: str | None,
        date_from: date | None,
        date_to: date | None,
        page: int,
        page_size: int,
    ) -> AuditLogListResponse:
        check_permission(self.current_user, "audit_log", "read", self.db)
        if date_from and date_to and date_from > date_to:
            raise ValidationAppError(
                "'from' must be on or before 'to'.",
                field_errors={"from": "'from' must be on or before 'to'."},
            )

        filters = []
        if actor_id:
            filters.append(AuditLog.actor_id == actor_id)
        if action:
            filters.append(AuditLog.action == action)
        if entity_type:
            filters.append(AuditLog.entity_type == entity_type)
        if date_from:
            filters.append(AuditLog.created_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
        if date_to:  # inclusive of the whole `to` day
            filters.append(
                AuditLog.created_at < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=timezone.utc)
            )

        total = self.db.query(AuditLog).filter(*filters).count()
        # Actors come from one outer join (null actor = system event) — no per-row lookup.
        rows = (
            self.db.query(AuditLog, User)
            .outerjoin(User, User.id == AuditLog.actor_id)
            .filter(*filters)
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        items = [
            AuditLogItem(
                id=log.id,
                actor=AuditActor(id=user.id, full_name=user.full_name, email=user.email) if user else None,
                action=log.action,
                entity_type=log.entity_type,
                entity_id=log.entity_id,
                before_state=log.before_state,
                after_state=log.after_state,
                ip_address=log.ip_address,
                created_at=log.created_at,
            )
            for log, user in rows
        ]
        return AuditLogListResponse(items=items, total=total)
