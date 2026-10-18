"""
Inbox service — project doc §5.2a (Home — Inbox).

Read-only aggregation of what is waiting on the caller. Actions are taken
through the existing endpoints (§5.5, §5.6, §5.10, §5.12), so their RBAC,
business rules and audit logging stay the single source of truth.
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.security import CurrentUser, has_permission
from app.models.assets import Asset, AssetAssignment, AssetStatus, MaintenanceStatus, MaintenanceTicket
from app.models.auth import User, UserStatus
from app.models.lifecycle import Checklist, ChecklistItem, ChecklistItemStatus, ChecklistStatus, ChecklistType
from app.models.requests import ApprovalChainTemplate, ApprovalStatus, Request, RequestApproval
from app.modules.inbox.schemas import (
    ApprovalCheck,
    ApprovalDetail,
    AssetRef,
    ChainStep,
    DoneItem,
    InboxCounts,
    InboxItem,
    InboxResponse,
    PersonRef,
    TaskDetail,
    TicketDetail,
)
from app.modules.requests.service import RequestService

MAX_ITEMS_PER_GROUP = 50
DONE_WINDOW = timedelta(hours=24)


def format_inr(value: Decimal) -> str:
    """₹ with Indian digit grouping (2,49,900), no decimals."""
    digits = str(int(Decimal(value).quantize(Decimal("1"))))
    negative = digits.startswith("-")
    digits = digits.lstrip("-")
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        digits = ",".join(groups + [tail])
    return f"{'-' if negative else ''}₹{digits}"


# Enum values whose plain humanised form reads wrong ("It ticket")
_LABELS = {"it_ticket": "IT ticket", "it_admin": "IT admin", "hr_admin": "HR admin"}


def _humanize(value: str) -> str:
    if value in _LABELS:
        return _LABELS[value]
    text = value.replace("_", " ")
    return text[:1].upper() + text[1:]


def _first_name(user: Optional[User]) -> str:
    return (user.full_name.split()[0] if user and user.full_name else "The requester")


class InboxService:
    def __init__(self, db: Session, current_user: CurrentUser):
        self.db = db
        self.current_user = current_user
        self.user_id = UUID(str(current_user.user_id))
        self.role_ids = current_user.role_ids  # primary + additional (§5.14)

    # ------------------------------------------------------------ public

    def get_inbox(self) -> InboxResponse:
        decisions = self._decisions()
        tasks = self._tasks()
        tickets = self._tickets()
        return InboxResponse(
            items=decisions + tasks + tickets,
            done_today=self._done_today(),
            counts=InboxCounts(decisions=len(decisions), tasks=len(tasks), tickets=len(tickets)),
        )

    # ------------------------------------------------------------ decisions

    def _decisions(self) -> list[InboxItem]:
        if not has_permission(self.current_user, "request", "approve", self.db):
            return []
        requests = (
            RequestService(db=self.db, current_user=self.current_user)
            .pending_approval_query()
            .options(
                joinedload(Request.approvals).joinedload(RequestApproval.approver),
                joinedload(Request.approvals).joinedload(RequestApproval.approver_role),
            )
            .order_by(Request.created_at.asc())
            .limit(MAX_ITEMS_PER_GROUP)
            .all()
        )
        thresholds = self._high_value_thresholds()
        items = []
        for req in requests:
            approvals = sorted(req.approvals, key=lambda a: a.step_order)
            chain = [
                ChainStep(
                    step_order=a.step_order,
                    role_name=a.approver_role.name if a.approver_role else None,
                    approver_name=a.approver.full_name if a.approver else None,
                    status=a.status.value,
                    is_current=a.step_order == req.current_step,
                )
                for a in approvals
            ]
            checks = self._approval_checks(req, thresholds.get(req.request_type.value), chain)
            requester = req.requester
            cost = f" · {format_inr(req.estimated_cost)}" if req.estimated_cost is not None else ""
            items.append(
                InboxItem(
                    id=f"approval:{req.id}",
                    kind="approval",
                    title=req.title,
                    meta=f"{_humanize(req.request_type.value)}{cost}",
                    created_at=req.created_at,
                    approval=ApprovalDetail(
                        request_id=req.id,
                        request_type=req.request_type.value,
                        description=req.description,
                        priority=req.priority.value,
                        estimated_cost=req.estimated_cost,
                        requester=PersonRef(
                            id=requester.id,
                            full_name=requester.full_name,
                            department=requester.department.name if requester.department else None,
                        ),
                        related_asset=self._asset_ref(req.related_asset),
                        current_step=req.current_step,
                        total_steps=len(approvals),
                        chain=chain,
                        checks=checks,
                        attention_count=sum(1 for c in checks if c.status == "attention"),
                    ),
                )
            )
        return items

    def _high_value_thresholds(self) -> dict[str, Decimal]:
        """Lowest active cost tier per request type (approval_chain_templates.min_amount)."""
        result: dict[str, Decimal] = {}
        for template in (
            self.db.query(ApprovalChainTemplate)
            .filter(ApprovalChainTemplate.is_active.is_(True), ApprovalChainTemplate.min_amount.isnot(None))
            .all()
        ):
            key = template.request_type.value
            if key not in result or template.min_amount < result[key]:
                result[key] = template.min_amount
        return result

    def _approval_checks(
        self, req: Request, threshold: Optional[Decimal], chain: list[ChainStep]
    ) -> list[ApprovalCheck]:
        checks: list[ApprovalCheck] = []
        requester = req.requester
        name = _first_name(requester)

        # 1. Cost against the high-value tier
        if req.estimated_cost is not None and threshold is not None:
            cost, limit = format_inr(req.estimated_cost), format_inr(threshold)
            if req.estimated_cost >= threshold:
                final_role = chain[-1].role_name if chain and chain[-1].role_name else "a senior approver"
                checks.append(ApprovalCheck(
                    status="attention",
                    text=f"{cost} is at or above the {limit} high-value threshold, so "
                         f"{_humanize(final_role)} approves the final step.",
                ))
            else:
                checks.append(ApprovalCheck(
                    status="pass",
                    text=f"{cost} is below the {limit} high-value threshold, so the standard chain applies.",
                ))
        elif req.estimated_cost is None and req.request_type.value == "asset_request":
            checks.append(ApprovalCheck(status="info", text="No cost estimate was given with this request."))

        # 2. What the requester already holds
        held = (
            self.db.query(Asset.name)
            .join(AssetAssignment, AssetAssignment.asset_id == Asset.id)
            .filter(AssetAssignment.employee_id == req.requester_id, AssetAssignment.returned_at.is_(None))
            .order_by(AssetAssignment.assigned_at.desc())
            .all()
        )
        if held:
            names = [h.name for h in held]
            shown = " and ".join(names[:2]) if len(names) <= 2 else f"{names[0]}, {names[1]} and {len(names) - 2} more"
            noun = "asset" if len(names) == 1 else "assets"
            checks.append(ApprovalCheck(status="info", text=f"{name} currently holds {len(names)} {noun}: {shown}."))
        else:
            checks.append(ApprovalCheck(status="info", text=f"{name} has no assets assigned right now."))

        # 3. The specific asset asked for, when one is given
        asset = req.related_asset
        if asset is not None:
            if asset.status == AssetStatus.in_stock:
                checks.append(ApprovalCheck(status="pass", text=f"The requested asset {asset.asset_tag} is in stock."))
            else:
                holder = ""
                if asset.status == AssetStatus.assigned and asset.current_holder_id:
                    holder_user = self.db.query(User).filter(User.id == asset.current_holder_id).first()
                    holder = f" to {holder_user.full_name}" if holder_user else ""
                checks.append(ApprovalCheck(
                    status="attention",
                    text=f"The requested asset {asset.asset_tag} is {_humanize(asset.status.value).lower()}{holder}.",
                ))

        # 4. Requester leaving
        if requester and requester.status == UserStatus.offboarding:
            when = f" (last day {requester.date_of_exit:%d %b %Y})" if requester.date_of_exit else ""
            checks.append(ApprovalCheck(status="attention", text=f"{name} is offboarding{when}."))

        return checks

    # ------------------------------------------------------------ tasks

    def _tasks(self) -> list[InboxItem]:
        if not self.role_ids:
            return []
        rows = (
            self.db.query(ChecklistItem)
            .join(Checklist, Checklist.id == ChecklistItem.checklist_id)
            .options(
                joinedload(ChecklistItem.checklist).joinedload(Checklist.employee).joinedload(User.department),
                joinedload(ChecklistItem.asset_assignment).joinedload(AssetAssignment.asset),
            )
            .filter(
                ChecklistItem.owner_role_id.in_(list(self.role_ids)),
                ChecklistItem.status != ChecklistItemStatus.done,
                Checklist.status == ChecklistStatus.in_progress,
            )
            .order_by(Checklist.created_at.asc(), ChecklistItem.sort_order.asc())
            .all()
        )

        def key_date_of(item: ChecklistItem) -> Optional[date]:
            employee = item.checklist.employee
            return employee.date_of_joining if item.checklist.type == ChecklistType.onboarding else employee.date_of_exit

        # Most pressing first: the earliest join/exit date (overdue ones lead); undated last
        rows.sort(key=lambda i: (key_date_of(i) is None, key_date_of(i) or date.max))
        today = date.today()
        items = []
        for item in rows[:MAX_ITEMS_PER_GROUP]:
            checklist = item.checklist
            employee = checklist.employee
            is_onboarding = checklist.type == ChecklistType.onboarding
            key_date = key_date_of(item)
            when = ""
            if key_date:
                past = key_date < today
                verb = ("joined" if past else "joins") if is_onboarding else ("left" if past else "leaves")
                when = f" · {verb} {key_date:%d %b %Y}" if key_date.year != today.year else f" · {verb} {key_date:%d %b}"
            asset = item.asset_assignment.asset if item.asset_assignment else None
            items.append(
                InboxItem(
                    id=f"task:{item.id}",
                    kind="task",
                    title=item.task_name,
                    meta=f"{'Onboarding' if is_onboarding else 'Offboarding'} · {employee.full_name}{when}",
                    created_at=item.created_at,
                    task=TaskDetail(
                        checklist_id=checklist.id,
                        item_id=item.id,
                        checklist_type=checklist.type.value,
                        task_name=item.task_name,
                        status=item.status.value,
                        employee=PersonRef(
                            id=employee.id,
                            full_name=employee.full_name,
                            department=employee.department.name if employee.department else None,
                        ),
                        key_date=key_date,
                        asset=self._asset_ref(asset),
                    ),
                )
            )
        return items

    # ------------------------------------------------------------ tickets

    def _tickets(self) -> list[InboxItem]:
        if not has_permission(self.current_user, "maintenance_ticket", "update", self.db):
            return []
        rows = (
            self.db.query(MaintenanceTicket)
            .options(joinedload(MaintenanceTicket.asset), joinedload(MaintenanceTicket.reporter))
            .filter(
                MaintenanceTicket.status.in_([MaintenanceStatus.open, MaintenanceStatus.in_progress]),
                or_(
                    MaintenanceTicket.assigned_to == self.user_id,
                    MaintenanceTicket.assigned_to.is_(None),
                ),
            )
            .order_by(MaintenanceTicket.created_at.asc())
            .limit(MAX_ITEMS_PER_GROUP)
            .all()
        )
        items = []
        for ticket in rows:
            issue = ticket.issue_description.strip()
            title = issue if len(issue) <= 70 else issue[:67].rstrip() + "…"
            items.append(
                InboxItem(
                    id=f"ticket:{ticket.id}",
                    kind="ticket",
                    title=title,
                    meta=f"{ticket.asset.asset_tag} · {_humanize(ticket.priority.value)} priority",
                    created_at=ticket.created_at,
                    ticket=TicketDetail(
                        ticket_id=ticket.id,
                        issue_description=ticket.issue_description,
                        priority=ticket.priority.value,
                        status=ticket.status.value,
                        asset=self._asset_ref(ticket.asset),
                        reported_by=ticket.reporter.full_name if ticket.reporter else None,
                        assigned_to_me=ticket.assigned_to == self.user_id,
                    ),
                )
            )
        return items

    # ------------------------------------------------------------ done today

    def _done_today(self) -> list[DoneItem]:
        since = datetime.now(timezone.utc) - DONE_WINDOW
        me = self.user_id
        done: list[DoneItem] = []

        for approval in (
            self.db.query(RequestApproval)
            .options(joinedload(RequestApproval.request))
            .filter(
                RequestApproval.approver_id == me,
                RequestApproval.decision_at >= since,
                RequestApproval.status.in_([ApprovalStatus.approved, ApprovalStatus.rejected]),
            )
            .all()
        ):
            done.append(DoneItem(
                id=f"approval:{approval.request_id}:{approval.step_order}",
                kind="approval",
                title=approval.request.title,
                outcome="Approved" if approval.status == ApprovalStatus.approved else "Rejected",
                done_at=approval.decision_at,
            ))

        for item in (
            self.db.query(ChecklistItem)
            .filter(ChecklistItem.completed_by == me, ChecklistItem.completed_at >= since)
            .all()
        ):
            done.append(DoneItem(id=f"task:{item.id}", kind="task", title=item.task_name, outcome="Done",
                                 done_at=item.completed_at))

        for ticket in (
            self.db.query(MaintenanceTicket)
            .filter(MaintenanceTicket.assigned_to == me, MaintenanceTicket.resolved_at >= since)
            .all()
        ):
            issue = ticket.issue_description.strip()
            done.append(DoneItem(id=f"ticket:{ticket.id}", kind="ticket",
                                 title=issue if len(issue) <= 70 else issue[:67].rstrip() + "…",
                                 outcome="Resolved", done_at=ticket.resolved_at))

        return sorted(done, key=lambda d: d.done_at, reverse=True)

    # ------------------------------------------------------------ helpers

    @staticmethod
    def _asset_ref(asset: Optional[Asset]) -> Optional[AssetRef]:
        if asset is None:
            return None
        return AssetRef(id=asset.id, asset_tag=asset.asset_tag, name=asset.name, status=asset.status.value)
