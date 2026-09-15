from datetime import date, datetime, timedelta, timezone
import math
import uuid
from uuid import UUID

from sqlalchemy import func, text
from sqlalchemy.orm import Session, joinedload

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationAppError
from app.core.security import CurrentUser, check_permission
from app.models.assets import (
    Asset,
    AssetAssignment,
    AssetStatus,
    MaintenanceStatus,
    MaintenanceTicket,
)
from app.models.auth import User
from app.models.system import AuditLog
from app.schemas.assets import (
    AssetAssignRequest,
    AssetAssignmentResponse,
    AssetBulkUpdateRequest,
    AssetCreateRequest,
    AssetDetailResponse,
    AssetListResponse,
    AssetMetaResponse,
    AssetResponse,
    AssetReturnRequest,
    AssetSummaryResponse,
    AssetUpdateRequest,
    CurrentHolderNested,
    MaintenanceTicketCreateRequest,
    MaintenanceTicketResponse,
)
from app.services.assets import calculate_current_value


class AssetService:
    def __init__(self, db: Session, current_user: CurrentUser):
        self.db = db
        self.current_user = current_user

    def _format_asset_response(self, asset: Asset, today: date | None = None) -> AssetResponse:
        if today is None:
            today = date.today()
        thirty_days = today + timedelta(days=30)

        is_expiring = False
        if asset.warranty_expiry and today <= asset.warranty_expiry <= thirty_days:
            is_expiring = True
        if asset.amc_expiry and today <= asset.amc_expiry <= thirty_days:
            is_expiring = True

        holder_nested = None
        if asset.current_holder:
            holder_nested = CurrentHolderNested(
                id=asset.current_holder.id,
                full_name=asset.current_holder.full_name,
                email=asset.current_holder.email,
                department_id=asset.current_holder.department_id,
                department_name=asset.current_holder.department.name if asset.current_holder.department else None,
            )

        return AssetResponse(
            id=asset.id,
            asset_tag=asset.asset_tag,
            name=asset.name,
            category=asset.category,
            serial_number=asset.serial_number,
            vendor=asset.vendor,
            purchase_date=asset.purchase_date,
            purchase_cost=asset.purchase_cost,
            current_value=calculate_current_value(asset, as_of=today),
            depreciation_method=asset.depreciation_method,
            useful_life_months=asset.useful_life_months,
            warranty_expiry=asset.warranty_expiry,
            amc_expiry=asset.amc_expiry,
            status=asset.status,
            current_holder_id=asset.current_holder_id,
            current_holder=holder_nested,
            license_id=asset.license_id,
            is_expiring_soon=is_expiring,
            created_at=asset.created_at,
            updated_at=asset.updated_at,
        )

    def _check_asset_read_access(self, asset: Asset, allow_manager: bool = True) -> None:
        """
        Two-layer access control check for Asset read operations (§2.3, PRD §5.8).
        - Layer 1: Roles it_admin, super_admin, auditor pass unconditionally if check_permission passes.
        - Layer 2 (Row-level ABAC for manager/employee):
          - employee: allowed ONLY if asset.current_holder_id == current_user.id.
          - manager: allowed if asset.current_holder_id == current_user.id OR
                     (allow_manager is True AND asset.current_holder.manager_id == current_user.id).
                     For GET /assets/{id}/maintenance, allow_manager=False per PRD §5.8.
          - Any other role (e.g. hr_admin): falls back to check_permission which raises ForbiddenError.
        """
        role = (self.current_user.role or "").lower()
        if role in ("it_admin", "super_admin", "auditor"):
            check_permission(self.current_user, "assets", "read", self.db)
            return

        if role == "employee":
            if asset.current_holder_id != self.current_user.user_id:
                raise ForbiddenError("You do not have permission to view this asset")
            return

        if role == "manager":
            is_holder = asset.current_holder_id == self.current_user.user_id
            is_holders_manager = (
                allow_manager
                and asset.current_holder is not None
                and asset.current_holder.manager_id == self.current_user.user_id
            )
            if not (is_holder or is_holders_manager):
                raise ForbiddenError("You do not have permission to view this asset")
            return

        check_permission(self.current_user, "assets", "read", self.db)

    def get_asset_detail(self, asset_id: UUID) -> AssetDetailResponse:
        """
        GET /assets/{id} (PRD §5.8): Full asset record + current assignment.
        """
        asset = (
            self.db.query(Asset)
            .options(joinedload(Asset.current_holder).joinedload(User.department))
            .filter(Asset.id == asset_id)
            .first()
        )
        if not asset:
            raise NotFoundError(f"Asset with ID {asset_id} not found")

        self._check_asset_read_access(asset, allow_manager=True)

        current_assignment_resp = None
        if asset.status != AssetStatus.in_stock and asset.current_holder_id is not None:
            current_assignment = (
                self.db.query(AssetAssignment)
                .options(joinedload(AssetAssignment.employee), joinedload(AssetAssignment.assigner))
                .filter(AssetAssignment.asset_id == asset.id, AssetAssignment.returned_at.is_(None))
                .first()
            )
            if current_assignment:
                current_assignment_resp = AssetAssignmentResponse(
                    id=current_assignment.id,
                    asset_id=current_assignment.asset_id,
                    employee_id=current_assignment.employee_id,
                    assigned_by=current_assignment.assigned_by,
                    assigned_at=current_assignment.assigned_at,
                    returned_at=current_assignment.returned_at,
                    condition_at_assignment=current_assignment.condition_at_assignment,
                    condition_at_return=current_assignment.condition_at_return,
                    notes=current_assignment.notes,
                    employee_name=current_assignment.employee.full_name if current_assignment.employee else None,
                    assigned_by_name=current_assignment.assigner.full_name if current_assignment.assigner else None,
                )

        asset_resp = self._format_asset_response(asset)
        return AssetDetailResponse(asset=asset_resp, current_assignment=current_assignment_resp)

    def get_asset_assignments(self, asset_id: UUID) -> list[AssetAssignmentResponse]:
        """
        GET /assets/{id}/assignments (PRD §5.8): Full assignment history for an asset.
        """
        asset = (
            self.db.query(Asset)
            .options(joinedload(Asset.current_holder))
            .filter(Asset.id == asset_id)
            .first()
        )
        if not asset:
            raise NotFoundError(f"Asset with ID {asset_id} not found")

        self._check_asset_read_access(asset, allow_manager=True)

        assignments = (
            self.db.query(AssetAssignment)
            .options(joinedload(AssetAssignment.employee), joinedload(AssetAssignment.assigner))
            .filter(AssetAssignment.asset_id == asset.id)
            .order_by(AssetAssignment.assigned_at.desc())
            .all()
        )

        return [
            AssetAssignmentResponse(
                id=a.id,
                asset_id=a.asset_id,
                employee_id=a.employee_id,
                assigned_by=a.assigned_by,
                assigned_at=a.assigned_at,
                returned_at=a.returned_at,
                condition_at_assignment=a.condition_at_assignment,
                condition_at_return=a.condition_at_return,
                notes=a.notes,
                employee_name=a.employee.full_name if a.employee else None,
                assigned_by_name=a.assigner.full_name if a.assigner else None,
            )
            for a in assignments
        ]

    def assign_asset(self, asset_id: UUID, payload: AssetAssignRequest) -> AssetAssignmentResponse:
        """
        POST /assets/{id}/assign (PRD §5.8): Assign an in-stock asset to an employee.
        - Roles: it_admin, super_admin (RBAC action="update").
        - Concurrency: Row-locks asset via with_for_update() and re-checks status == in_stock.
        - Rejects with 409 Conflict if asset status != in_stock.
        - Rejects with 404 Not Found if target employee_id does not exist.
        """
        check_permission(self.current_user, "assets", "update", self.db)

        # 1. Acquire row lock for concurrency safety
        asset = (
            self.db.query(Asset)
            .filter(Asset.id == asset_id)
            .with_for_update()
            .first()
        )
        if not asset:
            raise NotFoundError(f"Asset with ID {asset_id} not found")

        # 2. Re-check status under lock
        if asset.status != AssetStatus.in_stock:
            raise ConflictError(
                f"Asset {asset.asset_tag} cannot be assigned because its status is '{asset.status.value}' (must be 'in_stock')."
            )

        # 3. Validate target employee existence
        employee = self.db.query(User).filter(User.id == payload.employee_id).first()
        if not employee:
            raise NotFoundError(f"Employee with ID {payload.employee_id} not found")

        now = datetime.now(timezone.utc)
        asset.status = AssetStatus.assigned
        asset.current_holder_id = employee.id

        assignment = AssetAssignment(
            id=uuid.uuid4(),
            asset_id=asset.id,
            employee_id=employee.id,
            assigned_by=self.current_user.user_id,
            assigned_at=now,
            returned_at=None,
            condition_at_assignment=payload.condition_notes,
            condition_at_return=None,
            notes=payload.notes,
            created_at=now,
        )
        self.db.add(assignment)

        self.db.add(
            AuditLog(
                actor_id=self.current_user.user_id,
                action="asset.assigned",
                entity_type="asset",
                entity_id=asset.id,
                before_state={"status": AssetStatus.in_stock.value, "current_holder_id": None},
                after_state={
                    "status": AssetStatus.assigned.value,
                    "current_holder_id": str(employee.id),
                    "assignment_id": str(assignment.id),
                },
            )
        )

        self.db.commit()
        self.db.refresh(assignment)

        assigner_name = self.current_user.full_name
        if not assigner_name:
            assigner = self.db.query(User).filter(User.id == self.current_user.user_id).first()
            assigner_name = assigner.full_name if assigner else None

        return AssetAssignmentResponse(
            id=assignment.id,
            asset_id=assignment.asset_id,
            employee_id=assignment.employee_id,
            assigned_by=assignment.assigned_by,
            assigned_at=assignment.assigned_at,
            returned_at=assignment.returned_at,
            condition_at_assignment=assignment.condition_at_assignment,
            condition_at_return=assignment.condition_at_return,
            notes=assignment.notes,
            employee_name=employee.full_name,
            assigned_by_name=assigner_name,
        )

    def return_asset(self, asset_id: UUID, payload: AssetReturnRequest) -> AssetAssignmentResponse:
        """
        POST /assets/{id}/return (PRD §5.8): Return an assigned asset to stock.
        - Roles: it_admin, super_admin (RBAC action="update").
        - Concurrency: Row-locks asset via with_for_update() and re-checks status == assigned.
        - Rejects with 409 Conflict if asset is not currently assigned.
        """
        check_permission(self.current_user, "assets", "update", self.db)

        # 1. Acquire row lock for concurrency safety
        asset = (
            self.db.query(Asset)
            .filter(Asset.id == asset_id)
            .with_for_update()
            .first()
        )
        if not asset:
            raise NotFoundError(f"Asset with ID {asset_id} not found")

        # 2. Re-check status under lock
        if asset.status != AssetStatus.assigned or asset.current_holder_id is None:
            raise ConflictError(
                f"Asset {asset.asset_tag} cannot be returned because it is not currently assigned (status: '{asset.status.value}')."
            )

        # 3. Query active assignment
        assignment = (
            self.db.query(AssetAssignment)
            .filter(AssetAssignment.asset_id == asset.id, AssetAssignment.returned_at.is_(None))
            .with_for_update()
            .first()
        )
        if not assignment:
            raise ConflictError(f"No active assignment record found for asset {asset.asset_tag}.")

        now = datetime.now(timezone.utc)
        previous_holder_id = asset.current_holder_id

        assignment.returned_at = now
        assignment.condition_at_return = payload.condition_notes
        if payload.notes:
            assignment.notes = payload.notes

        asset.status = AssetStatus.in_stock
        asset.current_holder_id = None

        self.db.add(
            AuditLog(
                actor_id=self.current_user.user_id,
                action="asset.returned",
                entity_type="asset",
                entity_id=asset.id,
                before_state={
                    "status": AssetStatus.assigned.value,
                    "current_holder_id": str(previous_holder_id),
                },
                after_state={
                    "status": AssetStatus.in_stock.value,
                    "current_holder_id": None,
                    "returned_at": now.isoformat(),
                },
            )
        )

        self.db.commit()
        self.db.refresh(assignment)

        employee = self.db.query(User).filter(User.id == assignment.employee_id).first()
        assigner = self.db.query(User).filter(User.id == assignment.assigned_by).first()

        return AssetAssignmentResponse(
            id=assignment.id,
            asset_id=assignment.asset_id,
            employee_id=assignment.employee_id,
            assigned_by=assignment.assigned_by,
            assigned_at=assignment.assigned_at,
            returned_at=assignment.returned_at,
            condition_at_assignment=assignment.condition_at_assignment,
            condition_at_return=assignment.condition_at_return,
            notes=assignment.notes,
            employee_name=employee.full_name if employee else None,
            assigned_by_name=assigner.full_name if assigner else None,
        )

    def get_asset_maintenance(self, asset_id: UUID) -> list[MaintenanceTicketResponse]:
        """
        GET /assets/{id}/maintenance (PRD §5.8): Service tickets raised for an asset.
        - Roles: it_admin, super_admin, auditor, current holder ONLY.
        - Manager is explicitly excluded per PRD §5.8 (allow_manager=False).
        """
        asset = (
            self.db.query(Asset)
            .options(joinedload(Asset.current_holder))
            .filter(Asset.id == asset_id)
            .first()
        )
        if not asset:
            raise NotFoundError(f"Asset with ID {asset_id} not found")

        self._check_asset_read_access(asset, allow_manager=False)

        tickets = (
            self.db.query(MaintenanceTicket)
            .options(joinedload(MaintenanceTicket.reporter), joinedload(MaintenanceTicket.assignee))
            .filter(MaintenanceTicket.asset_id == asset.id)
            .order_by(MaintenanceTicket.created_at.desc())
            .all()
        )

        return [
            MaintenanceTicketResponse(
                id=t.id,
                asset_id=t.asset_id,
                reported_by=t.reported_by,
                assigned_to=t.assigned_to,
                issue_description=t.issue_description,
                priority=t.priority.value if hasattr(t.priority, "value") else str(t.priority),
                status=t.status.value if hasattr(t.status, "value") else str(t.status),
                resolved_at=t.resolved_at,
                created_at=t.created_at,
                updated_at=t.updated_at,
                reporter_name=t.reporter.full_name if t.reporter else None,
                assignee_name=t.assignee.full_name if t.assignee else None,
            )
            for t in tickets
        ]

    def create_maintenance_ticket(self, payload: MaintenanceTicketCreateRequest) -> MaintenanceTicketResponse:
        """
        POST /maintenance-tickets (PRD §5.10 — minimal slice backing §5.8's "Raise
        Ticket" action; the rest of §5.10 (list/kanban/PATCH) is a separate,
        not-yet-built page).
        - Roles: it_admin, super_admin (check_permission — any asset).
        - Any other authenticated role: allowed ONLY if the asset is currently
          assigned to them (ABAC ownership check, per PRD §5.10's "Employee-raised
          tickets validated server-side: asset_id must be in that employee's
          active assignments").
        """
        asset = self.db.query(Asset).filter(Asset.id == payload.asset_id).first()
        if not asset:
            raise NotFoundError(f"Asset with ID {payload.asset_id} not found")

        role = (self.current_user.role or "").lower()
        if role in ("it_admin", "super_admin"):
            check_permission(self.current_user, "maintenance_ticket", "create", self.db)
        elif asset.current_holder_id != self.current_user.user_id:
            raise ForbiddenError(
                "You can only raise a maintenance ticket for an asset currently assigned to you"
            )

        now = datetime.now(timezone.utc)
        ticket = MaintenanceTicket(
            id=uuid.uuid4(),
            asset_id=asset.id,
            reported_by=self.current_user.user_id,
            assigned_to=None,
            issue_description=payload.issue_description,
            priority=payload.priority,
            status=MaintenanceStatus.open,
            created_at=now,
            updated_at=now,
        )
        self.db.add(ticket)
        self.db.commit()
        self.db.refresh(ticket)

        reporter = self.db.query(User).filter(User.id == ticket.reported_by).first()

        return MaintenanceTicketResponse(
            id=ticket.id,
            asset_id=ticket.asset_id,
            reported_by=ticket.reported_by,
            assigned_to=ticket.assigned_to,
            issue_description=ticket.issue_description,
            priority=ticket.priority.value,
            status=ticket.status.value,
            resolved_at=ticket.resolved_at,
            created_at=ticket.created_at,
            updated_at=ticket.updated_at,
            reporter_name=reporter.full_name if reporter else None,
            assignee_name=None,
        )




    def _apply_role_scope(self, query, department_id: UUID | None = None):
        """
        Shared ABAC scoping (project doc §3.2 step 3, §5.7) reused by list_assets,
        get_asset_meta, and get_asset_summary so the three endpoints can never drift
        out of sync on who sees what: manager is scoped to assets whose current
        holder is in the manager's own department; it_admin/super_admin/auditor see
        the full catalog (optionally filtered by an explicit department_id).
        Returns (query, is_empty) — callers should short-circuit to an empty
        result when is_empty is True (manager with no department, or a requested
        department_id outside the manager's own).
        """
        role = (self.current_user.role or "").lower()

        if role == "manager":
            if not self.current_user.department_id:
                return query, True
            query = query.join(User, Asset.current_holder_id == User.id).filter(
                User.department_id == self.current_user.department_id
            )
            if department_id and department_id != self.current_user.department_id:
                return query, True
        elif department_id:
            query = query.join(User, Asset.current_holder_id == User.id).filter(
                User.department_id == department_id
            )

        return query, False

    def list_assets(
        self,
        search: str | None = None,
        category: str | None = None,
        status: AssetStatus | None = None,
        department_id: UUID | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> AssetListResponse:
        # RBAC (project doc §3.2 step 2): GET /assets (§5.7) is granted to
        # it_admin, super_admin, auditor, manager — mapped to
        # (resource="assets", action="read"). ABAC department scoping for manager
        # is applied below (§3.2 step 3) via the shared _apply_role_scope helper.
        check_permission(self.current_user, "assets", "read", self.db)

        query = self.db.query(Asset).options(
            joinedload(Asset.current_holder).joinedload(User.department)
        )

        query, is_empty = self._apply_role_scope(query, department_id=department_id)
        if is_empty:
            return AssetListResponse(items=[], total=0, page=page, page_size=page_size, total_pages=0)

        # Filtering
        if category:
            query = query.filter(Asset.category == category)

        if status:
            query = query.filter(Asset.status == status)

        if search and search.strip():
            pattern = f"%{search.strip()}%"
            query = query.filter(
                (Asset.name.ilike(pattern))
                | (Asset.asset_tag.ilike(pattern))
                | (Asset.serial_number.ilike(pattern))
            )

        total = query.count()
        total_pages = math.ceil(total / page_size) if total > 0 else 0

        offset = (page - 1) * page_size
        items_db = query.order_by(Asset.created_at.desc()).offset(offset).limit(page_size).all()

        today = date.today()
        items = [self._format_asset_response(a, today=today) for a in items_db]

        return AssetListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    def get_asset_meta(self) -> AssetMetaResponse:
        """
        GET /assets/meta (§5.7 addition): real filter-option data instead of a
        hardcoded frontend list (rules.md §1.1). Categories are the DISTINCT
        values currently present on the (now open, admin-extensible) category
        column, scoped the same way as list_assets. Statuses stay the fixed,
        closed AssetStatus enum — status drives real workflow logic (assignment,
        retirement, depreciation) and must remain a controlled set.
        """
        check_permission(self.current_user, "assets", "read", self.db)

        query = self.db.query(Asset.category).distinct()
        query, is_empty = self._apply_role_scope(query)
        if is_empty:
            categories: list[str] = []
        else:
            categories = sorted({row[0] for row in query.all() if row[0]})

        return AssetMetaResponse(categories=categories, statuses=[s.value for s in AssetStatus])

    def get_asset_summary(self) -> AssetSummaryResponse:
        """
        GET /assets/summary (§5.7 addition): real grouped aggregate counts for
        the Summary Ribbon, computed server-side across the whole (role-scoped)
        catalog — not derived client-side from a single paginated page.
        """
        check_permission(self.current_user, "assets", "read", self.db)

        query = self.db.query(Asset.status, func.count(Asset.id)).group_by(Asset.status)
        query, is_empty = self._apply_role_scope(query)
        if is_empty:
            return AssetSummaryResponse(total=0, deployed=0, in_stock=0, under_maintenance=0)

        counts = {status: count for status, count in query.all()}
        total = sum(counts.values())
        return AssetSummaryResponse(
            total=total,
            deployed=counts.get(AssetStatus.assigned, 0),
            in_stock=counts.get(AssetStatus.in_stock, 0),
            under_maintenance=counts.get(AssetStatus.under_maintenance, 0),
        )

    def _generate_next_asset_tag(self) -> str:
        dialect_name = self.db.bind.dialect.name if self.db and self.db.bind else "sqlite"
        current_year = datetime.now(timezone.utc).year

        if dialect_name == "postgresql":
            self.db.execute(text("CREATE SEQUENCE IF NOT EXISTS asset_tag_seq START WITH 1 INCREMENT BY 1"))
            seq_num = self.db.execute(text("SELECT nextval('asset_tag_seq')")).scalar()
        else:
            self.db.execute(text("CREATE TABLE IF NOT EXISTS asset_tag_sequence (id INTEGER PRIMARY KEY AUTOINCREMENT)"))
            self.db.execute(text("INSERT INTO asset_tag_sequence DEFAULT VALUES"))
            seq_num = self.db.execute(text("SELECT last_insert_rowid()")).scalar()

        return f"AST-{current_year}-{int(seq_num):05d}"

    def create_asset(self, payload: AssetCreateRequest) -> AssetResponse:
        """
        POST /assets: Auto-generate sequential asset_tag server-side (AST-YYYY-XXXXX).
        Validates depreciation_method and useful_life_months against strict enum and range bounds.
        """
        # RBAC (project doc §3.2 step 2): POST /assets (§5.7) is restricted to
        # it_admin and super_admin — mapped to (resource="assets", action="create").
        check_permission(self.current_user, "assets", "create", self.db)

        # Auto-generate asset_tag
        asset_tag = self._generate_next_asset_tag()

        # Initial current_value equals purchase_cost upon creation
        now = datetime.now(timezone.utc)
        asset = Asset(
            id=uuid.uuid4(),
            asset_tag=asset_tag,
            name=payload.name,
            category=payload.category,
            serial_number=payload.serial_number,
            vendor=payload.vendor,
            purchase_date=payload.purchase_date,
            purchase_cost=payload.purchase_cost,
            current_value=payload.purchase_cost,
            depreciation_method=payload.depreciation_method,
            useful_life_months=payload.useful_life_months,
            warranty_expiry=payload.warranty_expiry,
            amc_expiry=payload.amc_expiry,
            status=AssetStatus.in_stock,
            created_at=now,
            updated_at=now,
        )

        self.db.add(asset)
        self.db.flush()

        # Write audit log in same transaction
        self.db.add(
            AuditLog(
                actor_id=self.current_user.user_id,
                action="asset.created",
                entity_type="asset",
                entity_id=asset.id,
                after_state={
                    "asset_tag": asset.asset_tag,
                    "name": asset.name,
                    "category": asset.category,
                    "vendor": asset.vendor,
                    "purchase_cost": str(asset.purchase_cost),
                    "status": asset.status.value,
                },
            )
        )

        self.db.commit()
        self.db.refresh(asset)
        return self._format_asset_response(asset)

    def _validate_status_transition(self, asset: Asset, new_status: AssetStatus) -> None:
        """
        Server-enforced status transitions (project doc §7 rule 1). `retired` is
        terminal — the doc's explicit example ("cannot go from retired back to
        assigned") is extended to "no transition out of retired at all", since
        no re-activation flow is documented anywhere for this page.
        """
        if asset.status == new_status:
            return
        if asset.status == AssetStatus.retired:
            raise ConflictError(
                f"Asset {asset.asset_tag} is retired and cannot be transitioned to any other status."
            )

    def _close_active_assignment_if_needed(self, asset: Asset, new_status: AssetStatus) -> bool:
        """
        §7 rule 2: current_holder_id must never drift from asset_assignments.
        Moving an asset away from 'assigned' via PATCH/bulk-update must close the
        open assignment in the same transaction — the auto-close approach agreed
        with the developer, rather than blocking the transition outright, so bulk
        "mark retired" keeps working exactly as §5.7 describes.
        Returns True if an assignment was actually closed (for audit logging).
        """
        if asset.status != AssetStatus.assigned or new_status == AssetStatus.assigned:
            return False

        assignment = (
            self.db.query(AssetAssignment)
            .filter(AssetAssignment.asset_id == asset.id, AssetAssignment.returned_at.is_(None))
            .first()
        )
        if assignment:
            assignment.returned_at = datetime.now(timezone.utc)
        asset.current_holder_id = None
        return True

    def update_asset(self, asset_id: UUID, payload: AssetUpdateRequest) -> AssetResponse:
        """
        PATCH /assets/{id}: Update asset fields. Allows it_admin and super_admin to set status="retired".
        Setting status="assigned" is rejected — assignment is exclusively owned by
        POST /assets/{id}/assign (§5.8), which also captures condition notes.
        """
        # RBAC (project doc §3.2 step 2): PATCH /assets/{id} (§5.7) is restricted to
        # it_admin and super_admin — mapped to (resource="assets", action="update").
        check_permission(self.current_user, "assets", "update", self.db)

        asset = self.db.query(Asset).options(
            joinedload(Asset.current_holder).joinedload(User.department)
        ).filter(Asset.id == asset_id).first()

        if not asset:
            raise NotFoundError(f"Asset with ID {asset_id} not found")

        before_state = {
            "name": asset.name,
            "category": asset.category,
            "status": asset.status.value if asset.status else None,
            "purchase_cost": str(asset.purchase_cost),
            "vendor": asset.vendor,
        }

        update_data = payload.model_dump(exclude_unset=True)
        new_status = update_data.pop("status", None)

        for key, value in update_data.items():
            if value is not None:
                setattr(asset, key, value)

        # If purchase_cost updated, sync current_value if not otherwise recalculated
        if "purchase_cost" in update_data and update_data["purchase_cost"] is not None:
            asset.current_value = update_data["purchase_cost"]

        assignment_closed = False
        if new_status is not None:
            if new_status == AssetStatus.assigned:
                raise ValidationAppError(
                    message="Cannot set status to 'assigned' via PATCH — use POST /assets/{id}/assign to assign an asset to an employee.",
                    field_errors={"status": "must use the dedicated assign endpoint"},
                )
            self._validate_status_transition(asset, new_status)
            assignment_closed = self._close_active_assignment_if_needed(asset, new_status)
            asset.status = new_status

        after_state = {
            "name": asset.name,
            "category": asset.category,
            "status": asset.status.value if asset.status else None,
            "purchase_cost": str(asset.purchase_cost),
            "vendor": asset.vendor,
        }
        if assignment_closed:
            after_state["assignment_closed"] = True

        self.db.add(
            AuditLog(
                actor_id=self.current_user.user_id,
                action="asset.updated",
                entity_type="asset",
                entity_id=asset.id,
                before_state=before_state,
                after_state=after_state,
            )
        )

        self.db.commit()
        self.db.refresh(asset)
        return self._format_asset_response(asset)

    def bulk_update_assets(self, payload: AssetBulkUpdateRequest) -> int:
        # RBAC (project doc §3.2 step 2): PATCH /assets/bulk (§5.7) is restricted to
        # it_admin and super_admin — mapped to (resource="assets", action="bulk_update").
        check_permission(self.current_user, "assets", "bulk_update", self.db)

        asset_ids = payload.asset_ids
        if not asset_ids:
            return 0

        if payload.status == AssetStatus.assigned:
            raise ValidationAppError(
                message="Cannot bulk-set status to 'assigned' — use POST /assets/{id}/assign for individual assignment.",
                field_errors={"status": "must use the dedicated assign endpoint"},
            )

        # Query all requested assets
        assets = self.db.query(Asset).filter(Asset.id.in_(asset_ids)).all()

        # Atomic whole-batch fails check
        found_ids = {a.id for a in assets}
        missing_ids = set(asset_ids) - found_ids
        if missing_ids:
            raise NotFoundError(f"Assets not found: {[str(m) for m in missing_ids]}")

        # Validate every transition before mutating anything, so a mid-batch
        # failure never leaves a partially-applied bulk update.
        for asset in assets:
            self._validate_status_transition(asset, payload.status)

        for asset in assets:
            before_status = asset.status.value
            assignment_closed = self._close_active_assignment_if_needed(asset, payload.status)
            asset.status = payload.status
            after_state = {"status": payload.status.value}
            if assignment_closed:
                after_state["assignment_closed"] = True
            self.db.add(
                AuditLog(
                    actor_id=self.current_user.user_id,
                    action="asset.bulk_status_updated",
                    entity_type="asset",
                    entity_id=asset.id,
                    before_state={"status": before_status},
                    after_state=after_state,
                )
            )

        self.db.commit()
        return len(assets)

    def delete_asset(self, asset_id: UUID) -> None:
        # RBAC (project doc §3.2 step 2): DELETE /assets/{id} (§5.7) is restricted
        # to super_admin only — it_admin is explicitly excluded. Mapped to
        # (resource="assets", action="delete").
        check_permission(self.current_user, "assets", "delete", self.db)

        asset = self.db.query(Asset).filter(Asset.id == asset_id).first()
        if not asset:
            raise NotFoundError(f"Asset with ID {asset_id} not found")

        # Safety Check: Check for assignment or maintenance history
        assignment_count = self.db.query(func.count(AssetAssignment.id)).filter(
            AssetAssignment.asset_id == asset_id
        ).scalar()

        ticket_count = self.db.query(func.count(MaintenanceTicket.id)).filter(
            MaintenanceTicket.asset_id == asset_id
        ).scalar()

        if (assignment_count or 0) > 0 or (ticket_count or 0) > 0:
            raise ConflictError(
                "Cannot hard-delete asset with existing assignment or maintenance history. Retire the asset instead."
            )

        asset_tag = asset.asset_tag
        self.db.add(
            AuditLog(
                actor_id=self.current_user.user_id,
                action="asset.hard_deleted",
                entity_type="asset",
                entity_id=asset_id,
                before_state={"asset_tag": asset_tag, "name": asset.name},
                after_state=None,
            )
        )

        self.db.delete(asset)
        self.db.commit()
