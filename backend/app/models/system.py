import enum
import uuid

from sqlalchemy import (
    Boolean,
    Date,
    Index,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    JSON,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.session import Base


class NotificationChannel(str, enum.Enum):
    in_app = "in_app"
    email = "email"
    both = "both"


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(100), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    related_entity_type = Column(String(100), nullable=True)
    related_entity_id = Column(UUID(as_uuid=True), nullable=True)
    channel = Column(Enum(NotificationChannel, name="notification_channel_enum", native_enum=False), default=NotificationChannel.in_app, nullable=False)
    is_critical = Column(Boolean, default=False, nullable=False)
    email_sent_at = Column(DateTime(timezone=True), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", foreign_keys=[user_id])


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False, index=True)
    entity_type = Column(String(100), nullable=False, index=True)
    entity_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    before_state = Column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    after_state = Column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    ip_address = Column(String(45), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


    actor = relationship("User", foreign_keys=[actor_id])


class RateLimitEvent(Base):
    """One attempt counted against a rate limit (e.g. "forgot:<email>",
    "ip:<address>:login"). Kept in Postgres so limits hold across workers and
    restarts; rows older than a day are pruned as new ones are written."""

    __tablename__ = "rate_limit_events"
    __table_args__ = (Index("ix_rate_limit_events_key_created_at", "key", "created_at"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)


class CompanySetting(Base):
    """A company-editable setting with a single value,
    e.g. whether admins must use two-step sign-in. Lists (leave types,
    holidays…) have their own tables. Every change is audited."""

    __tablename__ = "company_settings"

    key = Column(String(100), primary_key=True)
    value = Column(JSON().with_variant(JSONB, "postgresql"), nullable=False)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class JobRun(Base):
    """When each daily background job last ran. Lets the worker catch up
    after the free hosting tier has been asleep, without running a job twice
    on the same day."""

    __tablename__ = "job_runs"

    name = Column(String(100), primary_key=True)
    last_run_on = Column(Date, nullable=False)
    last_result = Column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class GuideStyle(str, enum.Enum):
    """How the AI Guide helps: tour the route, or jump straight there."""

    show = "show"
    take = "take"


class UserPreference(Base):
    """Personal settings: accent colour and the AI Guide switches.
    One row per person, created on first save; no row means the defaults."""

    __tablename__ = "user_preferences"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    accent = Column(String(20), nullable=False, default="navy", server_default="navy")
    assistant_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    guide_style = Column(
        Enum(GuideStyle, name="guide_style_enum", native_enum=False, length=10),
        nullable=False,
        default=GuideStyle.show,
        server_default=GuideStyle.show.value,
    )
    voice_enabled = Column(Boolean, nullable=False, default=False, server_default="false")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
