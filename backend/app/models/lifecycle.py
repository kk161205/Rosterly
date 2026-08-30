import enum
import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.session import Base


class ChecklistType(str, enum.Enum):
    onboarding = "onboarding"
    offboarding = "offboarding"


class ChecklistStatus(str, enum.Enum):
    in_progress = "in_progress"
    completed = "completed"


class ChecklistItemStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    done = "done"


class DocumentType(str, enum.Enum):
    contract = "contract"
    id_proof = "id_proof"
    offer_letter = "offer_letter"
    policy_ack = "policy_ack"
    other = "other"


class Checklist(Base):
    __tablename__ = "checklists"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(Enum(ChecklistType, name="checklist_type_enum", native_enum=False), nullable=False)
    status = Column(Enum(ChecklistStatus, name="checklist_status_enum", native_enum=False), default=ChecklistStatus.in_progress, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    employee = relationship("User", foreign_keys=[employee_id])
    items = relationship("ChecklistItem", back_populates="checklist", cascade="all, delete-orphan", order_by="ChecklistItem.sort_order")


class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    checklist_id = Column(UUID(as_uuid=True), ForeignKey("checklists.id", ondelete="CASCADE"), nullable=False)
    task_name = Column(String(255), nullable=False)
    owner_role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False)
    status = Column(Enum(ChecklistItemStatus, name="checklist_item_status_enum", native_enum=False), default=ChecklistItemStatus.pending, nullable=False)
    completed_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    asset_assignment_id = Column(UUID(as_uuid=True), ForeignKey("asset_assignments.id", ondelete="SET NULL"), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    checklist = relationship("Checklist", back_populates="items")
    owner_role = relationship("Role", foreign_keys=[owner_role_id])
    completer = relationship("User", foreign_keys=[completed_by])
    asset_assignment = relationship("AssetAssignment", foreign_keys=[asset_assignment_id])


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    doc_type = Column(Enum(DocumentType, name="document_type_enum", native_enum=False), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_url = Column(String(1024), nullable=False)
    is_confidential = Column(Boolean, default=False, nullable=False)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    employee = relationship("User", foreign_keys=[employee_id])
    uploader = relationship("User", foreign_keys=[uploaded_by])
