"""
Inbox schemas — project doc §5.2a (Home — Inbox).
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel

InboxKind = Literal["approval", "task", "ticket"]
CheckStatus = Literal["pass", "attention", "info"]


class PersonRef(BaseModel):
    id: UUID
    full_name: str
    department: Optional[str] = None


class AssetRef(BaseModel):
    id: UUID
    asset_tag: str
    name: str
    status: Optional[str] = None


class ApprovalCheck(BaseModel):
    status: CheckStatus
    text: str


class ChainStep(BaseModel):
    step_order: int
    role_name: Optional[str] = None
    approver_name: Optional[str] = None
    status: str
    is_current: bool = False


class ApprovalDetail(BaseModel):
    request_id: UUID
    request_type: str
    description: str
    priority: str
    estimated_cost: Optional[Decimal] = None
    requester: PersonRef
    related_asset: Optional[AssetRef] = None
    current_step: int
    total_steps: int
    chain: list[ChainStep]
    checks: list[ApprovalCheck]
    attention_count: int


class TaskDetail(BaseModel):
    checklist_id: UUID
    item_id: UUID
    checklist_type: Literal["onboarding", "offboarding"]
    task_name: str
    status: str
    employee: PersonRef
    key_date: Optional[date] = None
    asset: Optional[AssetRef] = None


class TicketDetail(BaseModel):
    ticket_id: UUID
    issue_description: str
    priority: str
    status: str
    asset: AssetRef
    reported_by: Optional[str] = None
    assigned_to_me: bool


class InboxItem(BaseModel):
    id: str
    kind: InboxKind
    title: str
    meta: str
    created_at: datetime
    approval: Optional[ApprovalDetail] = None
    task: Optional[TaskDetail] = None
    ticket: Optional[TicketDetail] = None


class DoneItem(BaseModel):
    id: str
    kind: InboxKind
    title: str
    outcome: str
    done_at: datetime


class InboxCounts(BaseModel):
    decisions: int
    tasks: int
    tickets: int


class InboxResponse(BaseModel):
    items: list[InboxItem]
    done_today: list[DoneItem]
    counts: InboxCounts
