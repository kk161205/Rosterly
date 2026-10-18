"""
Analytics Service — PRD §5.15 (revised 18 Oct 2026).

Reports that answer a question someone acts on (see schemas.py): savings,
cost by department, budget, follow-ups and turnaround. All figures are
computed from live rows on request; nothing is stored.
"""
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from statistics import median
from typing import Optional

from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from app.core.errors import AppError
from app.core.security import CurrentUser, check_permission
from app.models.assets import Asset, AssetAssignment, AssetStatus, MaintenanceTicket, SoftwareLicense
from app.models.auth import Department, User
from app.models.lifecycle import Checklist, ChecklistItemStatus, ChecklistStatus, ChecklistType
from app.models.requests import ApprovalStatus, Request, RequestApproval, RequestStatus
from app.modules.analytics.schemas import (
    BudgetAssetItem,
    BudgetResponse,
    CostByDepartmentResponse,
    DepartmentCostItem,
    FollowUpsResponse,
    IdleAssetItem,
    LeaverWithDevices,
    PriorityTurnaround,
    RepeatAsset,
    ReplacementQuarter,
    SavingsResponse,
    StepTurnaround,
    StuckRequest,
    TurnaroundResponse,
    UnreturnedAsset,
    UnusedLicenceItem,
    UpcomingJoiner,
)

MAX_DATE_RANGE_DAYS = 365 * 5  # 5-year maximum window
IDLE_THRESHOLD_DAYS = 90  # in stock this long = idle equipment
WARRANTY_WINDOW_DAYS = 90
UPCOMING_JOINER_DAYS = 14
STUCK_THRESHOLD_DAYS = 3  # a request waiting this long at one step is "stuck"
REPEAT_WINDOW_DAYS = 90
REPEAT_MIN_TICKETS = 2
OUT_OF_SERVICE = (AssetStatus.retired, AssetStatus.lost)
QUARTER_NAMES = ("Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec")
PRIORITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


def resolve_date_range(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
) -> tuple[date, date]:
    """
    Resolves and validates analytics date range:
    - If both omitted: default to last 30 days ending today.
    - If from_date omitted: to_date - 30 days.
    - If to_date omitted: date.today() (if from_date <= today) or from_date + 30 days.
    - Validates from_date <= to_date.
    - Validates range does not exceed 5 years (1825 days).
    """
    today = date.today()

    if from_date is None and to_date is None:
        to_date = today
        from_date = today - timedelta(days=30)
    elif from_date is None and to_date is not None:
        from_date = to_date - timedelta(days=30)
    elif from_date is not None and to_date is None:
        to_date = today if from_date <= today else from_date + timedelta(days=30)

    if from_date > to_date:
        raise AppError(
            status_code=400,
            code="validation_error",
            message="'from' date must be earlier than or equal to 'to' date.",
            field_errors={"from": "Must be earlier than or equal to 'to'"},
        )

    if (to_date - from_date).days > MAX_DATE_RANGE_DAYS:
        raise AppError(
            status_code=400,
            code="validation_error",
            message="Date range cannot exceed 5 years.",
            field_errors={"date_range": "Exceeds 5 years maximum"},
        )

    return from_date, to_date


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _hours(start: datetime, end: datetime) -> float:
    return max(0.0, (_aware(end) - _aware(start)).total_seconds() / 3600)


def add_months(d: date, months: int) -> date:
    """d + n calendar months, clamping the day (31 Jan + 1 → 28/29 Feb)."""
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    for day in (d.day, 30, 29, 28):
        try:
            return date(year, month, day)
        except ValueError:
            continue
    raise ValueError(d)


def _quarter_start(d: date) -> date:
    return date(d.year, 3 * ((d.month - 1) // 3) + 1, 1)


class AnalyticsService:
    def __init__(self, db: Session, current_user: CurrentUser):
        self.db = db
        self.current_user = current_user

    # ---------------------------------------------------------------- savings

    def get_savings(self) -> SavingsResponse:
        """
        GET /analytics/savings — what we pay for and don't use.
        - Unused licence seats: total − assigned (assigned = linked assets with
          status 'assigned', spec §1.18), costed at cost_per_seat per year.
        - Idle equipment: hardware in stock for ≥ 90 days (since its last
          return, or since it was added if never assigned), at book value.
        Access: analytics:savings (super_admin, it_admin, auditor).
        """
        check_permission(self.current_user, "analytics", "savings", self.db)
        today = date.today()

        rows = (
            self.db.query(
                SoftwareLicense,
                func.count(case((Asset.status == AssetStatus.assigned, Asset.id), else_=None)).label("assigned"),
            )
            .outerjoin(Asset, Asset.license_id == SoftwareLicense.id)
            .group_by(SoftwareLicense.id)
            .all()
        )
        licences: list[UnusedLicenceItem] = []
        for lic, assigned in rows:
            unused = max(lic.total_seats - assigned, 0)
            if unused == 0:
                continue
            licences.append(
                UnusedLicenceItem(
                    license_id=lic.id,
                    name=lic.name,
                    vendor=lic.vendor,
                    total_seats=lic.total_seats,
                    assigned_seats=assigned,
                    unused_seats=unused,
                    cost_per_seat=lic.cost_per_seat,
                    unused_cost_per_year=Decimal(lic.cost_per_seat or 0) * unused,
                    renewal_date=lic.renewal_date,
                )
            )
        licences.sort(key=lambda x: (x.unused_cost_per_year, x.unused_seats), reverse=True)

        last_return = (
            self.db.query(AssetAssignment.asset_id, func.max(AssetAssignment.returned_at).label("returned"))
            .group_by(AssetAssignment.asset_id)
            .subquery()
        )
        stock = (
            self.db.query(Asset, last_return.c.returned)
            .outerjoin(last_return, last_return.c.asset_id == Asset.id)
            .filter(Asset.status == AssetStatus.in_stock, Asset.category != "software_license")
            .all()
        )
        idle: list[IdleAssetItem] = []
        for asset, returned in stock:
            if returned:
                since = _aware(returned).astimezone().date()  # local date, like `today`
            elif asset.created_at:
                since = _aware(asset.created_at).astimezone().date()
            else:
                since = asset.purchase_date
            days = (today - since).days
            if days >= IDLE_THRESHOLD_DAYS:
                idle.append(
                    IdleAssetItem(
                        asset_id=asset.id,
                        asset_tag=asset.asset_tag,
                        name=asset.name,
                        category=asset.category,
                        in_stock_since=since,
                        days_idle=days,
                        current_value=Decimal(asset.current_value or 0),
                    )
                )
        idle.sort(key=lambda x: x.current_value, reverse=True)

        return SavingsResponse(
            unused_licences=licences,
            unused_licence_cost_per_year=sum((x.unused_cost_per_year for x in licences), Decimal("0")),
            idle_assets=idle,
            idle_asset_value=sum((x.current_value for x in idle), Decimal("0")),
            idle_threshold_days=IDLE_THRESHOLD_DAYS,
        )

    # ---------------------------------------------------------------- cost by department

    def get_cost_by_department(
        self,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
    ) -> CostByDepartmentResponse:
        """
        GET /analytics/cost-by-department (PRD §5.15):
        Stacked spend breakdown per department (hardware vs. software license allocation).
        - Filtered by purchase_date in [from, to].
        - Assigned assets attributed to holder's department.
        - Assets without a resolvable department placed in 'Unassigned' bucket.
        Access: super_admin, it_admin, hr_admin, auditor.
        """
        check_permission(self.current_user, "analytics", "cost_by_department", self.db)
        resolved_from, resolved_to = resolve_date_range(from_date, to_date)

        # Single aggregation query in SQL (GROUP BY)
        rows = (
            self.db.query(
                Department.id.label("department_id"),
                func.coalesce(Department.name, "Unassigned").label("department_name"),
                func.coalesce(
                    func.sum(case((Asset.category != "software_license", Asset.purchase_cost), else_=0)),
                    0,
                ).label("hardware_cost"),
                func.coalesce(
                    func.sum(case((Asset.category == "software_license", Asset.purchase_cost), else_=0)),
                    0,
                ).label("software_cost"),
                func.coalesce(func.sum(Asset.purchase_cost), 0).label("total_cost"),
            )
            .select_from(Asset)
            .outerjoin(User, Asset.current_holder_id == User.id)
            .outerjoin(Department, User.department_id == Department.id)
            .filter(
                Asset.purchase_date >= resolved_from,
                Asset.purchase_date <= resolved_to,
            )
            .group_by(Department.id, Department.name)
            .order_by(func.coalesce(Department.name, "Unassigned").asc())
            .all()
        )

        if not rows:
            return CostByDepartmentResponse(series=[])

        series = [
            DepartmentCostItem(
                department_id=row.department_id,
                department_name=row.department_name,
                hardware_cost=Decimal(str(row.hardware_cost)),
                software_cost=Decimal(str(row.software_cost)),
                total_cost=Decimal(str(row.total_cost)),
            )
            for row in rows
        ]

        return CostByDepartmentResponse(series=series)

    # ---------------------------------------------------------------- budget

    def get_budget(self) -> BudgetResponse:
        """
        GET /analytics/budget — what to plan money for.
        - End of useful life = purchase_date + useful_life_months. Assets still in
          service past it, and those reaching it in the next 12 months grouped
          by calendar quarter, costed at their original purchase price.
        - Warranties ending in the next 90 days.
        Access: analytics:budget_forecast (super_admin, it_admin, auditor).
        """
        check_permission(self.current_user, "analytics", "budget_forecast", self.db)
        today = date.today()
        horizon = add_months(today, 12)

        assets = (
            self.db.query(Asset)
            .options(joinedload(Asset.current_holder))
            .filter(Asset.status.notin_(OUT_OF_SERVICE), Asset.category != "software_license")
            .all()
        )

        def item(a: Asset, when: date) -> BudgetAssetItem:
            return BudgetAssetItem(
                asset_id=a.id,
                asset_tag=a.asset_tag,
                name=a.name,
                holder_name=a.current_holder.full_name if a.current_holder else None,
                date=when,
                purchase_cost=Decimal(a.purchase_cost or 0),
            )

        past: list[BudgetAssetItem] = []
        quarters: dict[date, list[BudgetAssetItem]] = defaultdict(list)
        for a in assets:
            if not a.useful_life_months:
                continue
            end = add_months(a.purchase_date, a.useful_life_months)
            if end < today:
                past.append(item(a, end))
            elif end <= horizon:
                quarters[_quarter_start(end)].append(item(a, end))

        replacements = []
        for start in sorted(quarters):
            group = sorted(quarters[start], key=lambda x: x.date)
            replacements.append(
                ReplacementQuarter(
                    label=f"{QUARTER_NAMES[(start.month - 1) // 3]} {start.year}",
                    start=start,
                    count=len(group),
                    replacement_cost=sum((x.purchase_cost for x in group), Decimal("0")),
                    assets=group,
                )
            )

        warranties = sorted(
            (
                item(a, a.warranty_expiry)
                for a in assets
                if a.warranty_expiry and today <= a.warranty_expiry <= today + timedelta(days=WARRANTY_WINDOW_DAYS)
            ),
            key=lambda x: x.date,
        )

        return BudgetResponse(
            past_end_of_life_count=len(past),
            past_end_of_life_cost=sum((x.purchase_cost for x in past), Decimal("0")),
            replacements=replacements,
            replacement_cost_12_months=sum((q.replacement_cost for q in replacements), Decimal("0")),
            warranties_expiring=warranties,
        )

    # ---------------------------------------------------------------- follow-ups

    def get_follow_ups(self, from_date: Optional[date] = None, to_date: Optional[date] = None) -> FollowUpsResponse:
        """
        GET /analytics/follow-ups — people-side loose ends.
        - Leavers with devices not yet returned: active offboarding checklists
          and the employee's open assignments, at book value.
        - Joiner readiness: of joiners whose first day falls in [from, to] (and
          has passed), how many had every onboarding task done by the end of
          that day; plus joiners in the next 14 days who still have open tasks.
        Access: analytics:follow_ups (super_admin, hr_admin, auditor).
        """
        check_permission(self.current_user, "analytics", "follow_ups", self.db)
        resolved_from, resolved_to = resolve_date_range(from_date, to_date)
        today = date.today()

        offboardings = (
            self.db.query(Checklist)
            .options(joinedload(Checklist.employee))
            .filter(Checklist.type == ChecklistType.offboarding, Checklist.status == ChecklistStatus.in_progress)
            .all()
        )
        leavers: list[LeaverWithDevices] = []
        for c in offboardings:
            held = (
                self.db.query(Asset)
                .join(AssetAssignment, AssetAssignment.asset_id == Asset.id)
                .filter(
                    AssetAssignment.employee_id == c.employee_id,
                    AssetAssignment.returned_at.is_(None),
                    # Physical devices only — licence seats are freed, not handed back
                    Asset.category != "software_license",
                )
                .all()
            )
            if not held:
                continue
            leavers.append(
                LeaverWithDevices(
                    employee_id=c.employee_id,
                    full_name=c.employee.full_name,
                    date_of_exit=c.employee.date_of_exit,
                    checklist_id=c.id,
                    assets=[
                        UnreturnedAsset(
                            asset_id=a.id,
                            asset_tag=a.asset_tag,
                            name=a.name,
                            current_value=Decimal(a.current_value or 0),
                        )
                        for a in held
                    ],
                )
            )
        leavers.sort(key=lambda x: (x.date_of_exit is None, x.date_of_exit or date.max))

        onboardings = (
            self.db.query(Checklist)
            .options(joinedload(Checklist.employee), joinedload(Checklist.items))
            .filter(Checklist.type == ChecklistType.onboarding)
            .all()
        )
        in_period = ready = 0
        upcoming: list[UpcomingJoiner] = []
        for c in onboardings:
            joined = c.employee.date_of_joining
            if not joined:
                continue
            if resolved_from <= joined <= resolved_to and joined <= today:
                in_period += 1
                day_end = datetime.combine(joined, time.max, tzinfo=timezone.utc)
                if c.items and all(
                    i.status == ChecklistItemStatus.done and i.completed_at and _aware(i.completed_at) <= day_end
                    for i in c.items
                ):
                    ready += 1
            open_tasks = sum(1 for i in c.items if i.status != ChecklistItemStatus.done)
            if today <= joined <= today + timedelta(days=UPCOMING_JOINER_DAYS) and open_tasks:
                upcoming.append(
                    UpcomingJoiner(
                        employee_id=c.employee_id,
                        full_name=c.employee.full_name,
                        date_of_joining=joined,
                        checklist_id=c.id,
                        open_tasks=open_tasks,
                    )
                )
        upcoming.sort(key=lambda x: x.date_of_joining)

        return FollowUpsResponse(
            leavers=leavers,
            unreturned_count=sum(len(x.assets) for x in leavers),
            unreturned_value=sum((a.current_value for x in leavers for a in x.assets), Decimal("0")),
            joiners_in_period=in_period,
            joiners_ready_on_day_one=ready,
            upcoming_not_ready=upcoming,
        )

    # ---------------------------------------------------------------- turnaround

    def get_turnaround(self, from_date: Optional[date] = None, to_date: Optional[date] = None) -> TurnaroundResponse:
        """
        GET /analytics/turnaround — how long things take, and what is stuck.
        - Approval time per step = decision_at − when the step became active
          (the previous decision, or the request's creation), for decisions made
          in [from, to]; median overall and per approver role. Stuck = pending
          requests waiting ≥ 3 days at their current step.
        - Repair time = resolved_at − created_at for tickets resolved in
          [from, to]; median overall and per priority. Repeat assets = assets
          with ≥ 2 tickets raised in the last 90 days.
        Access: analytics:turnaround (super_admin, it_admin, hr_admin, auditor).
        """
        check_permission(self.current_user, "analytics", "turnaround", self.db)
        resolved_from, resolved_to = resolve_date_range(from_date, to_date)
        start = datetime.combine(resolved_from, time.min, tzinfo=timezone.utc)
        end = datetime.combine(resolved_to, time.max, tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)

        requests = (
            self.db.query(Request)
            .options(joinedload(Request.approvals).joinedload(RequestApproval.approver_role))
            .all()
        )
        all_hours: list[float] = []
        by_role: dict[Optional[str], list[float]] = defaultdict(list)
        stuck: list[StuckRequest] = []
        for r in requests:
            became_active = r.created_at
            for a in sorted(r.approvals, key=lambda x: x.step_order):
                if a.status == ApprovalStatus.skipped:
                    continue
                role = a.approver_role.name if a.approver_role else None
                if a.status in (ApprovalStatus.approved, ApprovalStatus.rejected) and a.decision_at:
                    if start <= _aware(a.decision_at) <= end:
                        h = _hours(became_active, a.decision_at)
                        all_hours.append(h)
                        by_role[role].append(h)
                    became_active = a.decision_at
                    continue
                if a.status == ApprovalStatus.pending and r.status == RequestStatus.pending and a.step_order == r.current_step:
                    waited = (now - _aware(became_active)).days
                    if waited >= STUCK_THRESHOLD_DAYS:
                        stuck.append(StuckRequest(request_id=r.id, title=r.title, waiting_on_role=role, waiting_days=waited))
                break
        stuck.sort(key=lambda x: x.waiting_days, reverse=True)

        resolved = (
            self.db.query(MaintenanceTicket)
            .filter(
                MaintenanceTicket.resolved_at.isnot(None),
                MaintenanceTicket.resolved_at >= start,
                MaintenanceTicket.resolved_at <= end,
            )
            .all()
        )
        repair_hours: list[float] = []
        by_priority: dict[str, list[float]] = defaultdict(list)
        for t in resolved:
            h = _hours(t.created_at, t.resolved_at)
            repair_hours.append(h)
            by_priority[t.priority.value if hasattr(t.priority, "value") else str(t.priority)].append(h)

        repeat_rows = (
            self.db.query(Asset, func.count(MaintenanceTicket.id).label("n"))
            .join(MaintenanceTicket, MaintenanceTicket.asset_id == Asset.id)
            .filter(MaintenanceTicket.created_at >= now - timedelta(days=REPEAT_WINDOW_DAYS))
            .group_by(Asset.id)
            .having(func.count(MaintenanceTicket.id) >= REPEAT_MIN_TICKETS)
            .all()
        )

        return TurnaroundResponse(
            approval_median_hours=round(median(all_hours), 1) if all_hours else None,
            approvals_by_step=sorted(
                (StepTurnaround(role_name=k, decisions=len(v), median_hours=round(median(v), 1)) for k, v in by_role.items()),
                key=lambda x: x.median_hours,
                reverse=True,
            ),
            stuck_requests=stuck,
            stuck_threshold_days=STUCK_THRESHOLD_DAYS,
            repair_median_hours=round(median(repair_hours), 1) if repair_hours else None,
            repairs_by_priority=sorted(
                (
                    PriorityTurnaround(priority=k, resolved=len(v), median_hours=round(median(v), 1))
                    for k, v in by_priority.items()
                ),
                key=lambda x: PRIORITY_ORDER.get(x.priority, 9),
            ),
            repeat_assets=sorted(
                (RepeatAsset(asset_id=a.id, asset_tag=a.asset_tag, name=a.name, tickets=n) for a, n in repeat_rows),
                key=lambda x: x.tickets,
                reverse=True,
            ),
        )
