"""
Leave service — project doc §5.20.

Documented deviation: the PRD lists approval_chain_templates (read), but
leave_requests has a single approver_id and RequestType has no leave type, so
leave uses ONE approval step resolved per §7 rule 10 via the shared helper in
app/core/approver_resolution.py: the requester's manager, or - when they have
none - the shared hr_admin queue. hr_admin and super_admin can always act.
Nobody decides their own leave.

Days are business days (Mon-Fri), inclusive of both ends, excluding dates on
which the employee already has an attendance_records row with status `holiday`.
"""
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session, joinedload

from app.core.approver_resolution import can_act_on_step, resolve_manager_or_queue, step_recipient_ids
from app.core.config import settings
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.core.security import CurrentUser, check_permission
from app.models.auth import Role, User
from app.models.leave_attendance import (
    AttendanceRecord,
    AttendanceStatus,
    LeaveBalance,
    LeaveRequest,
    LeaveStatus,
    LeaveType,
)
from app.models.system import AuditLog, Notification, NotificationChannel
from app.modules.leave.schemas import (
    LeaveBalanceItem,
    LeaveDecision,
    LeaveRejection,
    LeaveRequestCreate,
    LeaveRequestResponse,
    MyLeaveResponse,
    PendingLeaveResponse,
)

BALANCE_CARD_TYPES = [LeaveType.sick, LeaveType.casual, LeaveType.earned, LeaveType.unpaid]
OPEN_STATUSES = [LeaveStatus.pending, LeaveStatus.approved]


def local_today() -> date:
    """Today in the configured attendance timezone (ATTENDANCE_TIMEZONE)."""
    return datetime.now(ZoneInfo(settings.ATTENDANCE_TIMEZONE)).date()


def business_days(start: date, end: date, holidays: frozenset[date] | set[date] = frozenset()) -> list[date]:
    """Mon-Fri dates from start to end, both inclusive, minus `holidays`."""
    days = []
    current = start
    while current <= end:
        if current.weekday() < 5 and current not in holidays:
            days.append(current)
        current += timedelta(days=1)
    return days


class LeaveService:
    def __init__(self, db: Session, current_user: CurrentUser, ip_address: Optional[str] = None):
        self.db = db
        self.current_user = current_user
        self.user_id = UUID(str(current_user.user_id))
        self.ip_address = ip_address or "127.0.0.1"

    # ------------------------------------------------------------ helpers

    def _holidays(self, employee_ids: set[UUID], start: date, end: date) -> dict[UUID, set[date]]:
        """Holiday-marked dates per employee within [start, end] — one query for all."""
        result: dict[UUID, set[date]] = defaultdict(set)
        if not employee_ids:
            return result
        rows = (
            self.db.query(AttendanceRecord.employee_id, AttendanceRecord.date)
            .filter(
                AttendanceRecord.employee_id.in_(employee_ids),
                AttendanceRecord.status == AttendanceStatus.holiday,
                AttendanceRecord.date >= start,
                AttendanceRecord.date <= end,
            )
            .all()
        )
        for employee_id, day in rows:
            result[employee_id].add(day)
        return result

    def _balance_days(self, employee_id: UUID, leave_type: LeaveType, year: int) -> Decimal:
        row = (
            self.db.query(LeaveBalance)
            .filter(
                LeaveBalance.employee_id == employee_id,
                LeaveBalance.leave_type == leave_type,
                LeaveBalance.year == year,
            )
            .first()
        )
        return Decimal(row.balance_days) if row else Decimal("0")

    def _hr_queue_role_id(self) -> Optional[UUID]:
        role = self.db.query(Role).filter(Role.name == "hr_admin").first()
        return role.id if role else None

    def _notify(self, user_ids, type_: str, title: str, message: str, leave_id: UUID, critical: bool) -> None:
        for user_id in user_ids:
            self.db.add(
                Notification(
                    id=uuid4(),
                    user_id=user_id,
                    type=type_,
                    title=title,
                    message=message,
                    related_entity_type="leave_request",
                    related_entity_id=leave_id,
                    channel=NotificationChannel.both if critical else NotificationChannel.in_app,
                    is_critical=critical,
                )
            )

    def _responses(self, rows: list[LeaveRequest]) -> list[LeaveRequestResponse]:
        """Shape a batch of rows; holidays for all of them are loaded in one query."""
        if not rows:
            return []
        holidays = self._holidays(
            {r.employee_id for r in rows}, min(r.start_date for r in rows), max(r.end_date for r in rows)
        )
        return [
            LeaveRequestResponse(
                id=r.id,
                employee_id=r.employee_id,
                employee_name=r.employee.full_name if r.employee else None,
                employee_email=r.employee.email if r.employee else None,
                leave_type=r.leave_type,
                start_date=r.start_date,
                end_date=r.end_date,
                total_days=len(business_days(r.start_date, r.end_date, holidays.get(r.employee_id, set()))),
                status=r.status,
                approver_id=r.approver_id,
                approver_name=r.approver.full_name if r.approver else None,
                reason=r.reason,
                decision_comments=r.decision_comments,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in rows
        ]

    def _load_with_people(self, leave_id: UUID) -> LeaveRequest:
        return (
            self.db.query(LeaveRequest)
            .options(joinedload(LeaveRequest.employee), joinedload(LeaveRequest.approver))
            .filter(LeaveRequest.id == leave_id)
            .one()
        )

    # ------------------------------------------------------------ POST /leave-requests

    def apply(self, data: LeaveRequestCreate) -> LeaveRequestResponse:
        start, end = data.start_date, data.end_date
        if end < start:
            raise ValidationAppError(
                "Validation failed", field_errors={"end_date": "end_date must be on or after start_date."}
            )
        if start.year != end.year:
            raise ValidationAppError(
                "Validation failed",
                field_errors={
                    "end_date": "Leave cannot cross a year boundary; please submit two requests, one per year."
                },
            )

        requester = self.db.query(User).filter(User.id == self.user_id).one()
        holidays = self._holidays({self.user_id}, start, end)[self.user_id]
        days = len(business_days(start, end, holidays))
        if days == 0:
            raise ValidationAppError(
                "Validation failed",
                field_errors={"start_date": "The selected dates contain no business days (Mon-Fri, non-holiday)."},
            )

        overlap = (
            self.db.query(LeaveRequest.id)
            .filter(
                LeaveRequest.employee_id == self.user_id,
                LeaveRequest.status.in_(OPEN_STATUSES),
                LeaveRequest.start_date <= end,
                LeaveRequest.end_date >= start,
            )
            .first()
        )
        if overlap:
            raise ConflictError("These dates overlap your existing pending or approved leave.", code="leave_overlap")

        if data.leave_type != LeaveType.unpaid:
            balance = self._balance_days(self.user_id, data.leave_type, start.year)
            if Decimal(days) > balance:
                raise ConflictError(
                    f"Requested {days} day(s) exceed your remaining {data.leave_type.value} balance of {balance}.",
                    code="insufficient_balance",
                )

        leave = LeaveRequest(
            id=uuid4(),
            employee_id=self.user_id,
            leave_type=data.leave_type,
            start_date=start,
            end_date=end,
            status=LeaveStatus.pending,
            reason=data.reason,
        )
        self.db.add(leave)

        # §7 rule 10: manager, else the hr_admin queue.
        approver_id, queue_role_id = resolve_manager_or_queue(requester, self._hr_queue_role_id())
        recipients = step_recipient_ids(self.db, approver_id, queue_role_id, exclude_user_id=self.user_id)
        self._notify(
            recipients,
            "approval_needed",
            "Leave Request Pending Approval",
            f"{requester.full_name} requested {days} day(s) of {data.leave_type.value} leave "
            f"({start.isoformat()} to {end.isoformat()}).",
            leave.id,
            critical=False,
        )
        self.db.commit()
        return self._responses([self._load_with_people(leave.id)])[0]

    # ------------------------------------------------------------ GET /leave-requests/mine

    def my_requests(self, status: Optional[LeaveStatus], page: int, page_size: int) -> MyLeaveResponse:
        query = self.db.query(LeaveRequest).filter(LeaveRequest.employee_id == self.user_id)
        if status:
            query = query.filter(LeaveRequest.status == status)
        total = query.count()
        rows = (
            query.options(joinedload(LeaveRequest.employee), joinedload(LeaveRequest.approver))
            .order_by(LeaveRequest.created_at.desc(), LeaveRequest.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        year = local_today().year
        held = {
            b.leave_type: Decimal(b.balance_days)
            for b in self.db.query(LeaveBalance).filter(
                LeaveBalance.employee_id == self.user_id, LeaveBalance.year == year
            )
        }
        balances = [
            LeaveBalanceItem(leave_type=t, year=year, balance_days=held.get(t, Decimal("0")))
            for t in BALANCE_CARD_TYPES
        ]
        return MyLeaveResponse(
            items=self._responses(rows), total=total, page=page, page_size=page_size, balances=balances
        )

    # ------------------------------------------------------------ pending queue / decisions

    def _sees_all(self) -> bool:
        """hr_admin and super_admin can always act, so they see every pending request."""
        return self.current_user.has_role("hr_admin", "super_admin")

    def _can_decide(self, employee: User) -> bool:
        """§7 rule 10 for a single step: the requester's manager, or the hr_admin queue when
        they have none; hr_admin / super_admin can always act. Never on your own leave."""
        if employee.id == self.user_id:
            return False
        if self._sees_all():
            return True
        approver_id, queue_role_id = resolve_manager_or_queue(employee, self._hr_queue_role_id())
        return can_act_on_step(self.current_user, approver_id, queue_role_id)

    def pending_approval(self, page: int, page_size: int) -> PendingLeaveResponse:
        check_permission(self.current_user, "leave_request", "approve", self.db)
        query = (
            self.db.query(LeaveRequest)
            .join(User, User.id == LeaveRequest.employee_id)
            .filter(LeaveRequest.status == LeaveStatus.pending, LeaveRequest.employee_id != self.user_id)
        )
        if not self._sees_all():
            query = query.filter(User.manager_id == self.user_id)  # direct reports only
        total = query.count()
        rows = (
            query.options(joinedload(LeaveRequest.employee), joinedload(LeaveRequest.approver))
            .order_by(LeaveRequest.created_at.asc(), LeaveRequest.id.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return PendingLeaveResponse(items=self._responses(rows), total=total, page=page, page_size=page_size)

    def _lock_for_decision(self, leave_id: UUID) -> tuple[LeaveRequest, User]:
        """Permission, lock, eligibility, then status - in that order, so a caller who may not
        decide this request learns nothing about its state."""
        check_permission(self.current_user, "leave_request", "approve", self.db)
        leave = self.db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).with_for_update().first()
        if leave is None:
            raise NotFoundError("Leave request not found")
        employee = self.db.query(User).filter(User.id == leave.employee_id).one()
        if employee.id == self.user_id:
            raise ForbiddenError("You cannot approve or reject your own leave request")
        if not self._can_decide(employee):
            raise ForbiddenError("You are not an authorized approver for this leave request")
        # Checked after the lock: a concurrent decision leaves the row non-pending.
        if leave.status != LeaveStatus.pending:
            raise ConflictError(f"Leave request is already {leave.status.value}.", code="already_acted")
        return leave, employee

    def _audit(self, action: str, leave: LeaveRequest, after: dict) -> None:
        self.db.add(
            AuditLog(
                id=uuid4(),
                actor_id=self.user_id,
                action=action,
                entity_type="leave_request",
                entity_id=leave.id,
                before_state={"status": LeaveStatus.pending.value},
                after_state=after,
                ip_address=self.ip_address,
            )
        )

    def approve(self, leave_id: UUID, data: LeaveDecision) -> LeaveRequestResponse:
        leave, employee = self._lock_for_decision(leave_id)

        holidays = self._holidays({employee.id}, leave.start_date, leave.end_date)[employee.id]
        days = business_days(leave.start_date, leave.end_date, holidays)
        if not days:
            raise ConflictError("The request no longer contains any business days.", code="no_business_days")

        before_balance = after_balance = None
        if leave.leave_type != LeaveType.unpaid:
            balance_row = (
                self.db.query(LeaveBalance)
                .filter(
                    LeaveBalance.employee_id == employee.id,
                    LeaveBalance.leave_type == leave.leave_type,
                    LeaveBalance.year == leave.start_date.year,
                )
                .with_for_update()
                .first()
            )
            available = Decimal(balance_row.balance_days) if balance_row else Decimal("0")
            if Decimal(len(days)) > available:
                raise ConflictError(
                    f"Remaining {leave.leave_type.value} balance is {available}; {len(days)} day(s) are requested.",
                    code="insufficient_balance",
                )
            before_balance = available
            balance_row.balance_days = available - len(days)
            after_balance = balance_row.balance_days

        leave.status = LeaveStatus.approved
        leave.approver_id = self.user_id
        leave.decision_comments = (data.comments or "").strip() or None

        existing = {
            r.date: r
            for r in self.db.query(AttendanceRecord).filter(
                AttendanceRecord.employee_id == employee.id, AttendanceRecord.date.in_(days)
            )
        }
        for day in days:
            record = existing.get(day)
            if record:
                record.status = AttendanceStatus.on_leave
            else:
                self.db.add(
                    AttendanceRecord(id=uuid4(), employee_id=employee.id, date=day, status=AttendanceStatus.on_leave)
                )

        self._audit(
            "leave_request.approved",
            leave,
            {
                "status": "approved",
                "approver_id": str(self.user_id),
                "days": len(days),
                "comments": leave.decision_comments,
                "balance_before": str(before_balance) if before_balance is not None else None,
                "balance_after": str(after_balance) if after_balance is not None else None,
            },
        )
        self._notify(
            [employee.id],
            "request_status_change",
            "Leave request approved",
            f"Your {leave.leave_type.value} leave ({leave.start_date.isoformat()} to {leave.end_date.isoformat()}, "
            f"{len(days)} day(s)) was approved."
            + (f" Note: {leave.decision_comments}" if leave.decision_comments else ""),
            leave.id,
            critical=True,
        )
        self.db.commit()
        return self._responses([self._load_with_people(leave.id)])[0]

    def reject(self, leave_id: UUID, data: LeaveRejection) -> LeaveRequestResponse:
        comments = data.comments.strip()
        if not comments:
            raise ValidationAppError("Validation failed", field_errors={"comments": "A reason is required."})
        leave, employee = self._lock_for_decision(leave_id)

        leave.status = LeaveStatus.rejected
        leave.approver_id = self.user_id
        leave.decision_comments = comments
        self._audit(
            "leave_request.rejected",
            leave,
            {"status": "rejected", "approver_id": str(self.user_id), "comments": comments},
        )
        self._notify(
            [employee.id],
            "request_status_change",
            "Leave request rejected",
            f"Your {leave.leave_type.value} leave ({leave.start_date.isoformat()} to {leave.end_date.isoformat()}) "
            f"was rejected. Reason: {comments}",
            leave.id,
            critical=True,
        )
        self.db.commit()
        return self._responses([self._load_with_people(leave.id)])[0]
