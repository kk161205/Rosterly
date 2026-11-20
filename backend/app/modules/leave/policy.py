"""
Leave policy — the company's own rules.

- Leave types are a table: seeded defaults (Earned, Casual, Sick, Unpaid) that
  HR edits and adds to. Used types are deactivated, never deleted.
- Company holidays are a table; working days are Mon–Fri minus holidays.
- Balances need no yearly job: a person's balance for a type and year is
  created the first time it's needed —
    annual days (a share for the months left if they joined that year)
    + unused days from last year, up to the type's carry-forward limit.
  Unlimited types (annual_days null) keep no balance.
- HR can adjust any balance with a reason; every change is audited.
"""
import uuid
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional
from collections.abc import Iterable
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError, ValidationAppError
from app.core.security import CurrentUser, check_permission
from app.models.auth import User
from app.models.leave_attendance import Holiday, LeaveBalance, LeaveRequest, LeaveStatus, LeaveType
from app.models.system import AuditLog
from app.modules.leave.schemas import (
    BalanceAdjustment,
    HolidayCreate,
    HolidayResponse,
    LeaveBalanceItem,
    LeaveTypeCreate,
    LeaveTypeRef,
    LeaveTypeResponse,
    LeaveTypeUpdate,
)

HALF = Decimal("0.5")


def type_ref(t: LeaveType) -> LeaveTypeRef:
    return LeaveTypeRef(id=t.id, name=t.name, is_paid=t.is_paid, unlimited=t.unlimited)


# ------------------------------------------------------------ working days

def company_holidays(db: Session, start: date, end: date) -> set[date]:
    return {d for (d,) in db.query(Holiday.date).filter(Holiday.date >= start, Holiday.date <= end)}


def working_days(start: date, end: date, holidays: Iterable[date] = ()) -> list[date]:
    """Mon–Fri dates from start to end (both inclusive), minus holidays."""
    off = set(holidays)
    days, current = [], start
    while current <= end:
        if current.weekday() < 5 and current not in off:
            days.append(current)
        current += timedelta(days=1)
    return days


# ------------------------------------------------------------ balances

def _round_half(value: Decimal) -> Decimal:
    return (value / HALF).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * HALF


def entitlement(leave_type: LeaveType, joined: Optional[date], year: int) -> Decimal:
    """This year's allowance before carry-forward."""
    annual = Decimal(leave_type.annual_days or 0)
    if joined is None or joined.year < year:
        return annual
    if joined.year > year:
        return Decimal("0")
    if not leave_type.pro_rate_on_join:
        return annual
    months_left = 12 - (joined.month - 1)
    return _round_half(annual * months_left / 12)


def ensure_balance(db: Session, employee: User, leave_type: LeaveType, year: int, lock: bool = False, _depth: int = 0) -> Optional[LeaveBalance]:
    """The person's balance row for this type and year, created on first use.
    None for unlimited types. Carry-forward comes from last year's row — created
    first if it's missing (no row means no leave was taken that year)."""
    if leave_type.unlimited:
        return None
    query = db.query(LeaveBalance).filter(
        LeaveBalance.employee_id == employee.id,
        LeaveBalance.leave_type_id == leave_type.id,
        LeaveBalance.year == year,
    )
    row = (query.with_for_update() if lock else query).first()
    if row is not None:
        return row

    carry = Decimal("0")
    cap = Decimal(leave_type.carry_forward_max or 0)
    joined_year = employee.date_of_joining.year if employee.date_of_joining else year
    if cap > 0 and year - 1 >= joined_year and _depth < 2:
        previous = ensure_balance(db, employee, leave_type, year - 1, _depth=_depth + 1)
        if previous is not None:
            carry = _carry(previous, cap)
    try:
        with db.begin_nested():
            row = LeaveBalance(
                id=uuid.uuid4(),
                employee_id=employee.id,
                leave_type_id=leave_type.id,
                year=year,
                balance_days=entitlement(leave_type, employee.date_of_joining, year) + carry,
                carried_in=carry,
            )
            db.add(row)
    except IntegrityError:  # created concurrently by another request
        row = None
    if row is None:
        row = (query.with_for_update() if lock else query).first()
    return row


def _carry(previous: LeaveBalance, cap: Decimal) -> Decimal:
    left = Decimal(previous.balance_days)
    return min(left, cap) if left > 0 else Decimal("0")


def sync_carry(db: Session, employee_id: UUID, leave_type: LeaveType, year: int, _depth: int = 0) -> None:
    """After a balance changes in `year`, correct next year's carried-in days (if that row
    already exists), so carry-forward always reflects what was actually left."""
    if leave_type.unlimited or _depth > 1:
        return
    cap = Decimal(leave_type.carry_forward_max or 0)
    rows = {
        r.year: r
        for r in db.query(LeaveBalance)
        .filter(LeaveBalance.employee_id == employee_id, LeaveBalance.leave_type_id == leave_type.id, LeaveBalance.year.in_([year, year + 1]))
        .with_for_update()
    }
    this, nxt = rows.get(year), rows.get(year + 1)
    if this is None or nxt is None:
        return
    new_carry = _carry(this, cap)
    delta = new_carry - Decimal(nxt.carried_in or 0)
    if delta:
        nxt.balance_days = Decimal(nxt.balance_days) + delta
        nxt.carried_in = new_carry
        sync_carry(db, employee_id, leave_type, year + 1, _depth + 1)


def pending_days(db: Session, employee_id: UUID, leave_type_id: UUID, year: int, exclude: Optional[UUID] = None) -> Decimal:
    """Working days in this person's pending requests of a type, in a year."""
    q = db.query(LeaveRequest).filter(
        LeaveRequest.employee_id == employee_id,
        LeaveRequest.leave_type_id == leave_type_id,
        LeaveRequest.status == LeaveStatus.pending,
        func.extract("year", LeaveRequest.start_date) == year,
    )
    if exclude:
        q = q.filter(LeaveRequest.id != exclude)
    rows = q.all()
    if not rows:
        return Decimal("0")
    holidays = company_holidays(db, min(r.start_date for r in rows), max(r.end_date for r in rows))
    return Decimal(sum(len(working_days(r.start_date, r.end_date, holidays)) for r in rows))


def balances_for(db: Session, employee: User, year: int) -> list[LeaveBalanceItem]:
    """Every active leave type with what's left this year."""
    items = []
    for t in db.query(LeaveType).filter(LeaveType.is_active.is_(True)).order_by(LeaveType.sort_order, LeaveType.name):
        row = ensure_balance(db, employee, t, year)
        items.append(
            LeaveBalanceItem(
                leave_type=type_ref(t),
                year=year,
                annual_days=t.annual_days,
                balance_days=Decimal(row.balance_days) if row else None,
                pending_days=pending_days(db, employee.id, t.id, year),
            )
        )
    return items


# ------------------------------------------------------------ admin: types, holidays, adjustments

class LeavePolicyService:
    """Leave types, holidays and balance adjustments — HR and super admins
    (permission leave_policy:manage). Reading types and holidays is open to
    everyone signed in, since the leave form needs them."""

    def __init__(self, db: Session, current_user: CurrentUser, ip_address: str):
        self.db = db
        self.current_user = current_user
        self.ip_address = ip_address

    def _manage(self) -> None:
        check_permission(self.current_user, "leave_policy", "manage", self.db)

    def _audit(self, action: str, entity_type: str, entity_id: UUID, before: Optional[dict], after: Optional[dict]) -> None:
        self.db.add(
            AuditLog(
                id=uuid.uuid4(),
                actor_id=self.current_user.user_id,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                before_state=before,
                after_state=after,
                ip_address=self.ip_address,
            )
        )

    @staticmethod
    def _type_snapshot(t: LeaveType) -> dict:
        return {
            "name": t.name,
            "annual_days": str(t.annual_days) if t.annual_days is not None else None,
            "carry_forward_max": str(t.carry_forward_max),
            "is_paid": t.is_paid,
            "pro_rate_on_join": t.pro_rate_on_join,
            "is_active": t.is_active,
        }

    # -- types

    def list_types(self, include_inactive: bool) -> list[LeaveTypeResponse]:
        q = self.db.query(LeaveType)
        if not include_inactive:
            q = q.filter(LeaveType.is_active.is_(True))
        return [LeaveTypeResponse.model_validate(t) for t in q.order_by(LeaveType.sort_order, LeaveType.name)]

    def _check_name(self, name: str, exclude: Optional[UUID] = None) -> str:
        clean = name.strip()
        if not clean:
            raise ValidationAppError("Validation failed", field_errors={"name": "Enter a name."})
        clash = self.db.query(LeaveType.id).filter(func.lower(LeaveType.name) == clean.lower())
        if exclude:
            clash = clash.filter(LeaveType.id != exclude)
        if clash.first():
            raise ConflictError(f"There is already a leave type called '{clean}'.")
        return clean

    def create_type(self, data: LeaveTypeCreate) -> LeaveTypeResponse:
        self._manage()
        next_order = (self.db.query(func.max(LeaveType.sort_order)).scalar() or 0) + 1
        t = LeaveType(
            id=uuid.uuid4(),
            name=self._check_name(data.name),
            annual_days=data.annual_days,
            carry_forward_max=data.carry_forward_max if data.annual_days is not None else Decimal("0"),
            is_paid=data.is_paid,
            pro_rate_on_join=data.pro_rate_on_join,
            is_active=True,
            sort_order=next_order,
        )
        self.db.add(t)
        self._audit("leave_type.created", "leave_type", t.id, None, self._type_snapshot(t))
        self.db.commit()
        return LeaveTypeResponse.model_validate(t)

    def update_type(self, type_id: UUID, data: LeaveTypeUpdate) -> LeaveTypeResponse:
        """Changes apply to balances created from now on; existing balances
        stay as they are (HR adjusts them if needed)."""
        self._manage()
        t = self.db.query(LeaveType).filter(LeaveType.id == type_id).with_for_update().first()
        if t is None:
            raise NotFoundError("Leave type not found.")
        before = self._type_snapshot(t)
        sent = data.model_fields_set
        if "name" in sent and data.name is not None:
            t.name = self._check_name(data.name, exclude=t.id)
        if "annual_days" in sent:
            t.annual_days = data.annual_days
        for field in ("carry_forward_max", "is_paid", "pro_rate_on_join", "is_active", "sort_order"):
            if field in sent and getattr(data, field) is not None:
                setattr(t, field, getattr(data, field))
        if t.annual_days is None:
            t.carry_forward_max = Decimal("0")
        self._audit("leave_type.updated", "leave_type", t.id, before, self._type_snapshot(t))
        self.db.commit()
        return LeaveTypeResponse.model_validate(t)

    # -- holidays

    def list_holidays(self, year: int) -> list[HolidayResponse]:
        rows = (
            self.db.query(Holiday)
            .filter(Holiday.date >= date(year, 1, 1), Holiday.date <= date(year, 12, 31))
            .order_by(Holiday.date)
        )
        return [HolidayResponse.model_validate(h) for h in rows]

    def add_holiday(self, data: HolidayCreate) -> HolidayResponse:
        self._manage()
        if self.db.query(Holiday.id).filter(Holiday.date == data.date).first():
            raise ConflictError(f"{data.date.strftime('%d %b %Y')} is already a holiday.")
        h = Holiday(id=uuid.uuid4(), date=data.date, name=data.name.strip())
        self.db.add(h)
        self._audit("holiday.created", "holiday", h.id, None, {"date": h.date.isoformat(), "name": h.name})
        self.db.commit()
        return HolidayResponse.model_validate(h)

    def delete_holiday(self, holiday_id: UUID) -> None:
        self._manage()
        h = self.db.query(Holiday).filter(Holiday.id == holiday_id).first()
        if h is None:
            raise NotFoundError("Holiday not found.")
        self._audit("holiday.deleted", "holiday", h.id, {"date": h.date.isoformat(), "name": h.name}, None)
        self.db.delete(h)
        self.db.commit()

    # -- balances

    def employee_balances(self, employee_id: UUID, year: int) -> list[LeaveBalanceItem]:
        self._manage()
        employee = self.db.query(User).filter(User.id == employee_id).first()
        if employee is None:
            raise NotFoundError("Employee not found.")
        items = balances_for(self.db, employee, year)
        self.db.commit()  # balances created on first view are kept
        return items

    def adjust(self, employee_id: UUID, data: BalanceAdjustment, this_year: int) -> list[LeaveBalanceItem]:
        self._manage()
        employee = self.db.query(User).filter(User.id == employee_id).first()
        if employee is None:
            raise NotFoundError("Employee not found.")
        t = self.db.query(LeaveType).filter(LeaveType.id == data.leave_type_id).first()
        if t is None:
            raise NotFoundError("Leave type not found.")
        if t.unlimited:
            raise ConflictError(f"{t.name} has no limit, so there's no balance to adjust.")
        year = data.year or this_year
        row = ensure_balance(self.db, employee, t, year, lock=True)
        before = Decimal(row.balance_days)
        after = before + data.days
        if after < 0:
            raise ConflictError(f"That would leave {after} days of {t.name}; balances can't go below zero.")
        row.balance_days = after
        sync_carry(self.db, employee.id, t, year)
        self._audit(
            "leave_balance.adjusted",
            "leave_balance",
            row.id,
            {"employee_id": str(employee.id), "leave_type": t.name, "year": year, "balance_days": str(before)},
            {"employee_id": str(employee.id), "leave_type": t.name, "year": year, "balance_days": str(after),
             "change": str(data.days), "reason": data.reason.strip()},
        )
        self.db.commit()
        return balances_for(self.db, employee, year)
