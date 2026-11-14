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

from app.core.approver_resolution import resolve_manager_or_queue, step_recipient_ids
from app.core.config import settings
from app.core.errors import ConflictError, ValidationAppError
from app.core.security import CurrentUser
from app.models.auth import Role, User
from app.models.leave_attendance import (
    AttendanceRecord,
    AttendanceStatus,
    LeaveBalance,
    LeaveRequest,
    LeaveStatus,
    LeaveType,
)
from app.models.system import Notification, NotificationChannel
from app.modules.leave.schemas import (
    LeaveBalanceItem,
    LeaveRequestCreate,
    LeaveRequestResponse,
    MyLeaveResponse,
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

