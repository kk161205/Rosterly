"""
Attendance service — project doc §5.20.

"Today" is the calendar date in ATTENDANCE_TIMEZONE (default Asia/Kolkata).
Reading: self by default; a manager may read people in their own department;
hr_admin and super_admin may read anyone. The date window is capped at 92 days.
"""
from calendar import monthrange
from datetime import date, datetime, timezone
from typing import Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError, ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.core.security import CurrentUser
from app.models.auth import User
from app.models.leave_attendance import AttendanceRecord, AttendanceStatus
from app.modules.leave.schemas import AttendanceListResponse, AttendanceRecordResponse

MAX_RANGE_DAYS = 92


class AttendanceService:
    def __init__(self, db: Session, current_user: CurrentUser):
        self.db = db
        self.current_user = current_user
        self.user_id = UUID(str(current_user.user_id))

    @staticmethod
    def _shape(record: AttendanceRecord) -> AttendanceRecordResponse:
        return AttendanceRecordResponse(
            id=record.id,
            employee_id=record.employee_id,
            date=record.date,
            status=record.status,
            check_in_time=record.check_in_time,
            check_out_time=record.check_out_time,
        )

    @staticmethod
    def _now_and_today() -> tuple[datetime, date]:
        now = datetime.now(timezone.utc)
        return now, now.astimezone(ZoneInfo(settings.ATTENDANCE_TIMEZONE)).date()

    # ------------------------------------------------------------ GET /attendance

    def _assert_can_read(self, employee_id: UUID) -> None:
        if employee_id == self.user_id or self.current_user.has_role("hr_admin", "super_admin"):
            return
        if self.current_user.has_role("manager"):
            target = self.db.query(User).filter(User.id == employee_id).first()
            dept = self.current_user.department_id
            if target is not None and dept is not None and target.department_id == dept:
                return
        raise ForbiddenError("You do not have permission to view this employee's attendance")

    def list_records(
        self,
        employee_id: Optional[UUID],
        date_from: Optional[date],
        date_to: Optional[date],
        page: int,
        page_size: int,
    ) -> AttendanceListResponse:
        target_id = employee_id or self.user_id
        self._assert_can_read(target_id)
        if target_id != self.user_id and self.db.query(User.id).filter(User.id == target_id).first() is None:
            raise NotFoundError("Employee not found")

        _, today = self._now_and_today()
        if date_from is None and date_to is None:
            date_from = today.replace(day=1)
        if date_from is None:
            date_from = date_to.replace(day=1)
        if date_to is None:
            date_to = date_from.replace(day=monthrange(date_from.year, date_from.month)[1])
        if date_from > date_to:
            raise ValidationAppError(
                "Validation failed", field_errors={"from": "'from' must be on or before 'to'."}
            )
        if (date_to - date_from).days + 1 > MAX_RANGE_DAYS:
            raise ValidationAppError(
                "Validation failed",
                field_errors={"to": f"The date range cannot exceed {MAX_RANGE_DAYS} days."},
            )

        query = self.db.query(AttendanceRecord).filter(
            AttendanceRecord.employee_id == target_id,
            AttendanceRecord.date >= date_from,
            AttendanceRecord.date <= date_to,
        )
        total = query.count()
        rows = query.order_by(AttendanceRecord.date.asc()).offset((page - 1) * page_size).limit(page_size).all()
        return AttendanceListResponse(
            records=[self._shape(r) for r in rows], total=total, page=page, page_size=page_size
        )

    # ------------------------------------------------------------ check-in / check-out

    @staticmethod
    def _assert_manual_enabled() -> None:
        if not settings.ATTENDANCE_MANUAL_CHECKIN_ENABLED:
            raise AppError(403, "manual_checkin_disabled", "Manual check-in and check-out are turned off.")

    def _today_record(self, today: date) -> Optional[AttendanceRecord]:
        return (
            self.db.query(AttendanceRecord)
            .filter(AttendanceRecord.employee_id == self.user_id, AttendanceRecord.date == today)
            .with_for_update()
            .first()
        )

    def check_in(self) -> AttendanceRecordResponse:
        self._assert_manual_enabled()
        now, today = self._now_and_today()
        record = self._today_record(today)
        if record is not None:
            if record.status in (AttendanceStatus.on_leave, AttendanceStatus.holiday):
                raise ConflictError(
                    f"Today is marked {record.status.value}; you cannot check in.", code="check_in_not_allowed"
                )
            if record.check_in_time is not None:
                raise ConflictError("You have already checked in today.", code="already_checked_in")
            record.status = AttendanceStatus.present
            record.check_in_time = now
        else:
            record = AttendanceRecord(
                employee_id=self.user_id, date=today, status=AttendanceStatus.present, check_in_time=now
            )
            self.db.add(record)
        try:
            self.db.commit()
        except IntegrityError:  # a concurrent check-in won the unique (employee_id, date) race
            self.db.rollback()
            raise ConflictError("You have already checked in today.", code="already_checked_in") from None
        self.db.refresh(record)
        return self._shape(record)

    def check_out(self) -> AttendanceRecordResponse:
        self._assert_manual_enabled()
        now, today = self._now_and_today()
        record = self._today_record(today)
        if record is None or record.check_in_time is None:
            raise ConflictError("There is no open check-in for today.", code="no_open_check_in")
        if record.check_out_time is not None:
            raise ConflictError("You have already checked out today.", code="already_checked_out")
        record.check_out_time = now
        self.db.commit()
        self.db.refresh(record)
        return self._shape(record)

