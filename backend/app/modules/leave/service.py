"""
Leave service.

Approval: ONE step resolved via the shared helper in
app/core/approver_resolution.py — the requester's manager, or, when they have
none, the shared hr_admin queue. hr_admin and super_admin can always act.
Nobody decides their own leave. (Documented deviation from the original
"approval chains" note: leave has a single approver.)

Days are working days — Mon–Fri, not company holidays (app/modules/leave/policy.py).
Balances come from the company's leave types and are created on first use.
"""
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.clock import local_today
from app.core.approver_resolution import can_act_on_step, resolve_manager_or_queue, step_recipient_ids
from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.core.security import CurrentUser, check_permission
from app.models.auth import Role, User
from app.models.leave_attendance import AttendanceRecord, AttendanceStatus, LeaveRequest, LeaveStatus, LeaveType
from app.models.system import AuditLog, Notification, NotificationChannel
from app.modules.leave.policy import (
    balances_for,
    company_holidays,
    ensure_balance,
    sync_carry,
    pending_days,
    type_ref,
    working_days,
)
from app.modules.leave.schemas import (
    LeaveDecision,
    LeaveRejection,
    LeaveRequestCreate,
    LeaveRequestResponse,
    MyLeaveResponse,
    PendingLeaveResponse,
    TeamLeaveResponse,
)

MAX_TEAM_RANGE_DAYS = 92


class LeaveService:
    def __init__(self, db: Session, current_user: CurrentUser, ip_address: Optional[str] = None):
        self.db = db
        self.current_user = current_user
        self.user_id = UUID(str(current_user.user_id))
        self.ip_address = ip_address or "unknown"

    # ------------------------------------------------------------ helpers

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

    def _can_cancel(self, r: LeaveRequest, today: date) -> bool:
        if r.employee_id != self.user_id:
            return False
        return r.status == LeaveStatus.pending or (r.status == LeaveStatus.approved and r.start_date > today)

    def _responses(self, rows: list[LeaveRequest]) -> list[LeaveRequestResponse]:
        """Shape a batch of rows; holidays for all of them are loaded in one query."""
        if not rows:
            return []
        holidays = company_holidays(self.db, min(r.start_date for r in rows), max(r.end_date for r in rows))
        today = local_today()
        return [
            LeaveRequestResponse(
                id=r.id,
                employee_id=r.employee_id,
                employee_name=r.employee.full_name if r.employee else None,
                employee_email=r.employee.email if r.employee else None,
                leave_type=type_ref(r.leave_type),
                start_date=r.start_date,
                end_date=r.end_date,
                total_days=len(working_days(r.start_date, r.end_date, holidays)),
                status=r.status,
                approver_id=r.approver_id,
                approver_name=r.approver.full_name if r.approver else None,
                reason=r.reason,
                decision_comments=r.decision_comments,
                can_cancel=self._can_cancel(r, today),
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in rows
        ]

    def _with_people(self):
        return self.db.query(LeaveRequest).options(
            joinedload(LeaveRequest.employee), joinedload(LeaveRequest.approver), joinedload(LeaveRequest.leave_type)
        )

    def _load_with_people(self, leave_id: UUID) -> LeaveRequest:
        return self._with_people().filter(LeaveRequest.id == leave_id).one()

    def _audit(self, action: str, leave: LeaveRequest, before: dict, after: dict) -> None:
        self.db.add(
            AuditLog(
                id=uuid4(),
                actor_id=self.user_id,
                action=action,
                entity_type="leave_request",
                entity_id=leave.id,
                before_state=before,
                after_state=after,
                ip_address=self.ip_address,
            )
        )

    # ------------------------------------------------------------ POST /leave-requests

    def apply(self, data: LeaveRequestCreate) -> LeaveRequestResponse:
        start, end = data.start_date, data.end_date
        if end < start:
            raise ValidationAppError("Validation failed", field_errors={"end_date": "The end date must be on or after the start date."})
        if start.year != end.year:
            raise ValidationAppError(
                "Validation failed",
                field_errors={"end_date": "Leave can't cross into a new year; please send one request for each year."},
            )

        leave_type = (
            self.db.query(LeaveType).filter(LeaveType.id == data.leave_type_id, LeaveType.is_active.is_(True)).first()
        )
        if leave_type is None:
            raise ValidationAppError("Validation failed", field_errors={"leave_type_id": "Choose a leave type."})

        # Lock the person while checking, so two quick submissions can't both pass the overlap check.
        requester = self.db.query(User).filter(User.id == self.user_id).with_for_update().one()
        days = len(working_days(start, end, company_holidays(self.db, start, end)))
        if days == 0:
            raise ValidationAppError(
                "Validation failed",
                field_errors={"start_date": "Those dates are all weekends or holidays."},
            )

        overlap = (
            self.db.query(LeaveRequest.id)
            .filter(
                LeaveRequest.employee_id == self.user_id,
                LeaveRequest.status.in_([LeaveStatus.pending, LeaveStatus.approved]),
                LeaveRequest.start_date <= end,
                LeaveRequest.end_date >= start,
            )
            .first()
        )
        if overlap:
            raise ConflictError("These dates overlap leave you've already asked for.", code="leave_overlap")

        balance = ensure_balance(self.db, requester, leave_type, start.year)
        if balance is not None:
            available = Decimal(balance.balance_days) - pending_days(self.db, self.user_id, leave_type.id, start.year)
            if Decimal(days) > available:
                raise ConflictError(
                    f"You asked for {days} day(s) of {leave_type.name}, but only {max(available, Decimal('0'))} "
                    "are left after your other pending requests.",
                    code="insufficient_balance",
                )

        leave = LeaveRequest(
            id=uuid4(),
            employee_id=self.user_id,
            leave_type_id=leave_type.id,
            start_date=start,
            end_date=end,
            status=LeaveStatus.pending,
            reason=data.reason,
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(leave)

        # manager, else the hr_admin queue.
        approver_id, queue_role_id = resolve_manager_or_queue(requester, self._hr_queue_role_id())
        recipients = step_recipient_ids(self.db, approver_id, queue_role_id, exclude_user_id=self.user_id)
        self._notify(
            recipients,
            "approval_needed",
            "Leave request waiting for you",
            f"{requester.full_name} asked for {days} day(s) of {leave_type.name} "
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
        page_query = self._with_people().filter(LeaveRequest.employee_id == self.user_id)
        if status:
            page_query = page_query.filter(LeaveRequest.status == status)
        rows = (
            page_query.order_by(LeaveRequest.created_at.desc(), LeaveRequest.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        me = self.db.query(User).filter(User.id == self.user_id).one()
        balances = balances_for(self.db, me, local_today().year)
        self.db.commit()  # balances created on first view are kept
        return MyLeaveResponse(items=self._responses(rows), total=total, page=page, page_size=page_size, balances=balances)

    # ------------------------------------------------------------ cancel

    def cancel(self, leave_id: UUID) -> LeaveRequestResponse:
        """POST /leave-requests/{id}/cancel — the requester withdraws pending
        leave, or approved leave that hasn't started (days go back to their
        balance and the on-leave days are cleared). Audited."""
        leave = self.db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).with_for_update().first()
        if leave is None or leave.employee_id != self.user_id:
            raise NotFoundError("Leave request not found")
        today = local_today()
        if not self._can_cancel(leave, today):
            raise ConflictError("Only pending leave, or approved leave that hasn't started, can be cancelled.", code="invalid_state")

        before = {"status": leave.status.value}
        refunded = Decimal("0")
        if leave.status == LeaveStatus.approved:
            employee = self.db.query(User).filter(User.id == leave.employee_id).one()
            balance = ensure_balance(self.db, employee, leave.leave_type, leave.start_date.year, lock=True)
            if balance is not None:
                # Exactly what approval took, even if holidays changed since.
                if leave.days_deducted is not None:
                    refunded = Decimal(leave.days_deducted)
                else:
                    days = working_days(leave.start_date, leave.end_date, company_holidays(self.db, leave.start_date, leave.end_date))
                    refunded = Decimal(len(days))
                balance.balance_days = Decimal(balance.balance_days) + refunded
                sync_carry(self.db, employee.id, leave.leave_type, leave.start_date.year)
            self.db.query(AttendanceRecord).filter(
                AttendanceRecord.employee_id == leave.employee_id,
                AttendanceRecord.date >= leave.start_date,
                AttendanceRecord.date <= leave.end_date,
                AttendanceRecord.status == AttendanceStatus.on_leave,
            ).delete(synchronize_session=False)
        leave.status = LeaveStatus.cancelled
        self._audit("leave_request.cancelled", leave, before, {"status": "cancelled", "days_refunded": str(refunded)})
        self.db.commit()
        return self._responses([self._load_with_people(leave.id)])[0]

    # ------------------------------------------------------------ team calendar

    def team(self, date_from: date, date_to: date) -> TeamLeaveResponse:
        """GET /leave-requests/team — approved and pending leave overlapping the
        window, for the caller's direct reports (managers) or everyone (HR,
        super admins), so whoever approves can see who else is off."""
        check_permission(self.current_user, "leave_request", "approve", self.db)
        if date_from > date_to:
            raise ValidationAppError("Validation failed", field_errors={"from": "'from' must be on or before 'to'."})
        if (date_to - date_from).days + 1 > MAX_TEAM_RANGE_DAYS:
            raise ValidationAppError("Validation failed", field_errors={"to": f"The range can't be more than {MAX_TEAM_RANGE_DAYS} days."})
        query = (
            self._with_people()
            .join(User, User.id == LeaveRequest.employee_id)
            .filter(
                LeaveRequest.status.in_([LeaveStatus.pending, LeaveStatus.approved]),
                LeaveRequest.start_date <= date_to,
                LeaveRequest.end_date >= date_from,
            )
        )
        if not self._sees_all():
            query = query.filter(or_(User.manager_id == self.user_id, User.id == self.user_id))
        rows = query.order_by(LeaveRequest.start_date, LeaveRequest.id).limit(500).all()
        return TeamLeaveResponse(items=self._responses(rows))

    # ------------------------------------------------------------ pending queue / decisions

    def _sees_all(self) -> bool:
        """hr_admin and super_admin can always act, so they see every pending request."""
        return self.current_user.has_role("hr_admin", "super_admin")

    def _can_decide(self, employee: User) -> bool:
        if employee.id == self.user_id:
            return False
        if self._sees_all():
            return True
        approver_id, queue_role_id = resolve_manager_or_queue(employee, self._hr_queue_role_id())
        return can_act_on_step(self.current_user, approver_id, queue_role_id)

    def pending_query(self):
        """Pending leave this person may decide: their direct reports', or everyone's for HR/super admins.
        Shared by GET /leave-requests/pending-approval and the Home inbox."""
        query = (
            self.db.query(LeaveRequest)
            .join(User, User.id == LeaveRequest.employee_id)
            .filter(LeaveRequest.status == LeaveStatus.pending, LeaveRequest.employee_id != self.user_id)
        )
        if not self._sees_all():
            query = query.filter(User.manager_id == self.user_id)  # direct reports only
        return query

    def pending_approval(self, page: int, page_size: int) -> PendingLeaveResponse:
        check_permission(self.current_user, "leave_request", "approve", self.db)
        query = self.pending_query()
        total = query.count()
        rows = (
            query.options(joinedload(LeaveRequest.employee), joinedload(LeaveRequest.approver), joinedload(LeaveRequest.leave_type))
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
        if leave.status != LeaveStatus.pending:
            raise ConflictError(f"Leave request is already {leave.status.value}.", code="already_acted")
        return leave, employee

    def approve(self, leave_id: UUID, data: LeaveDecision) -> LeaveRequestResponse:
        leave, employee = self._lock_for_decision(leave_id)
        days = working_days(leave.start_date, leave.end_date, company_holidays(self.db, leave.start_date, leave.end_date))
        if not days:
            raise ConflictError("The request no longer contains any working days.", code="no_business_days")
        clash = (
            self.db.query(LeaveRequest.id)
            .filter(
                LeaveRequest.employee_id == employee.id,
                LeaveRequest.id != leave.id,
                LeaveRequest.status == LeaveStatus.approved,
                LeaveRequest.start_date <= leave.end_date,
                LeaveRequest.end_date >= leave.start_date,
            )
            .first()
        )
        if clash:
            raise ConflictError("These dates overlap leave that's already approved.", code="leave_overlap")

        before_balance = after_balance = None
        balance = ensure_balance(self.db, employee, leave.leave_type, leave.start_date.year, lock=True)
        if balance is not None:
            available = Decimal(balance.balance_days)
            if Decimal(len(days)) > available:
                raise ConflictError(
                    f"Only {available} day(s) of {leave.leave_type.name} are left; {len(days)} are requested.",
                    code="insufficient_balance",
                )
            before_balance = available
            balance.balance_days = available - len(days)
            after_balance = balance.balance_days
            leave.days_deducted = Decimal(len(days))
            sync_carry(self.db, employee.id, leave.leave_type, leave.start_date.year)

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
                self.db.add(AttendanceRecord(id=uuid4(), employee_id=employee.id, date=day, status=AttendanceStatus.on_leave))

        self._audit(
            "leave_request.approved",
            leave,
            {"status": LeaveStatus.pending.value},
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
            f"Your {leave.leave_type.name} leave ({leave.start_date.isoformat()} to {leave.end_date.isoformat()}, "
            f"{len(days)} day(s)) was approved." + (f" Note: {leave.decision_comments}" if leave.decision_comments else ""),
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
            {"status": LeaveStatus.pending.value},
            {"status": "rejected", "approver_id": str(self.user_id), "comments": comments},
        )
        self._notify(
            [employee.id],
            "request_status_change",
            "Leave request rejected",
            f"Your {leave.leave_type.name} leave ({leave.start_date.isoformat()} to {leave.end_date.isoformat()}) "
            f"was rejected. Reason: {comments}",
            leave.id,
            critical=True,
        )
        self.db.commit()
        return self._responses([self._load_with_people(leave.id)])[0]
