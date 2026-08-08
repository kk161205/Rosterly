import enum
import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.session import Base


class RequestType(str, enum.Enum):
    asset_request = "asset_request"
    access_request = "access_request"
    it_ticket = "it_ticket"
    other = "other"


class RequestPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class RequestStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


class ApprovalStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    skipped = "skipped"


class ApprovalChainTemplate(Base):
    __tablename__ = "approval_chain_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_type = Column(Enum(RequestType, name="request_type_enum", native_enum=False), nullable=False)
    name = Column(String(255), nullable=False)
    min_amount = Column(Numeric(12, 2), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    steps = relationship("ApprovalChainStep", back_populates="template", cascade="all, delete-orphan", order_by="ApprovalChainStep.step_order")


class ApprovalChainStep(Base):
    __tablename__ = "approval_chain_steps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id = Column(UUID(as_uuid=True), ForeignKey("approval_chain_templates.id", ondelete="CASCADE"), nullable=False)
    step_order = Column(Integer, nullable=False)
    approver_role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    template = relationship("ApprovalChainTemplate", back_populates="steps")
    approver_role = relationship("Role")


class Request(Base):
    __tablename__ = "requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requester_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    request_type = Column(Enum(RequestType, name="request_type_enum", native_enum=False), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    related_asset_id = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="SET NULL"), nullable=True)
    estimated_cost = Column(Numeric(12, 2), nullable=True)
    priority = Column(Enum(RequestPriority, name="request_priority_enum", native_enum=False), default=RequestPriority.medium, nullable=False)
    status = Column(Enum(RequestStatus, name="request_status_enum", native_enum=False), default=RequestStatus.pending, nullable=False)
    current_step = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    requester = relationship("User", foreign_keys=[requester_id])
    related_asset = relationship("Asset", foreign_keys=[related_asset_id])
    approvals = relationship("RequestApproval", back_populates="request", cascade="all, delete-orphan", order_by="RequestApproval.step_order")


class RequestApproval(Base):
    __tablename__ = "request_approvals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id = Column(UUID(as_uuid=True), ForeignKey("requests.id", ondelete="CASCADE"), nullable=False)
    approver_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    step_order = Column(Integer, nullable=False)
    status = Column(Enum(ApprovalStatus, name="approval_status_enum", native_enum=False), default=ApprovalStatus.pending, nullable=False)
    decision_at = Column(DateTime(timezone=True), nullable=True)
    comments = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    request = relationship("Request", back_populates="approvals")
    approver = relationship("User", foreign_keys=[approver_id])
