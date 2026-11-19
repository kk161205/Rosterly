"""leave & attendance: decision_comments, attendance uniqueness, RBAC

Schema:
- leave_requests.decision_comments: nullable TEXT, the approver's note shown in
  the history table's note drawer (the table had no place for it).
- attendance_records: UNIQUE (employee_id, date) — one record per person per
  day, so two concurrent check-ins cannot both succeed. Counts duplicate rows
  and raises RuntimeError before constraint creation so an operator can resolve
  them without data loss.

Permissions (idempotent):
- (leave_request, approve) -> manager, hr_admin, super_admin
  (pending queue, approve, reject). Applying, viewing own leave and attendance,
  check-in/out need no permission row: they are scoped to the caller.

Downgrade removes only what this revision adds.

Revision ID: d6f8b0c2e4a6
Revises: c5e7a9b1d3f5
Create Date: 2026-11-14 15:00:00.000000

"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import column, table

# revision identifiers, used by Alembic.
revision = "d6f8b0c2e4a6"
down_revision = "c5e7a9b1d3f5"
branch_labels = None
depends_on = None

UQ_NAME = "uq_attendance_records_employee_date"

SEED_PERMISSIONS = [
    ("leave_request", "approve", "Approve or reject direct reports' leave requests"),
]
SEED_GRANTS = {
    ("leave_request", "approve"): ["manager", "hr_admin", "super_admin"],
}
_REQUIRED_ROLES = {"manager", "hr_admin", "super_admin"}

_roles_t = table("roles", column("id", postgresql.UUID(as_uuid=True)), column("name", sa.String))
_permissions_t = table(
    "permissions",
    column("id", postgresql.UUID(as_uuid=True)),
    column("resource", sa.String),
    column("action", sa.String),
    column("description", sa.Text),
)
_role_permissions_t = table(
    "role_permissions",
    column("role_id", postgresql.UUID(as_uuid=True)),
    column("permission_id", postgresql.UUID(as_uuid=True)),
)


def upgrade() -> None:
    bind = op.get_bind()

    role_ids: dict[str, uuid.UUID] = {
        name: rid for rid, name in bind.execute(sa.select(_roles_t.c.id, _roles_t.c.name)).fetchall()
    }
    missing = _REQUIRED_ROLES - role_ids.keys()
    if missing:
        raise RuntimeError(
            f"Migration d6f8b0c2e4a6: cannot proceed — the following role(s) "
            f"were not found in the roles table: {sorted(missing)}."
        )

    op.add_column("leave_requests", sa.Column("decision_comments", sa.Text(), nullable=True))

    duplicate_rows = bind.execute(
        sa.text(
            "SELECT employee_id, date, COUNT(*) AS cnt "
            "FROM attendance_records "
            "GROUP BY employee_id, date "
            "HAVING COUNT(*) > 1"
        )
    ).fetchall()
    if duplicate_rows:
        total_dupe_rows = sum(int(r[2]) for r in duplicate_rows)
        excess_rows = sum(int(r[2]) - 1 for r in duplicate_rows)
        distinct_pairs = len(duplicate_rows)
        raise RuntimeError(
            f"Migration d6f8b0c2e4a6: cannot proceed — found {total_dupe_rows} duplicate "
            f"(employee_id, date) rows ({excess_rows} duplicate row(s) across {distinct_pairs} "
            f"distinct (employee_id, date) combination(s)) in attendance_records. "
            f"The operator must resolve them before applying the unique constraint."
        )

    op.create_unique_constraint(UQ_NAME, "attendance_records", ["employee_id", "date"])

    permission_ids: dict[tuple[str, str], uuid.UUID] = {}
    for resource, action, description in SEED_PERMISSIONS:
        existing = bind.execute(
            sa.select(_permissions_t.c.id).where(
                _permissions_t.c.resource == resource, _permissions_t.c.action == action
            )
        ).first()
        if existing:
            permission_ids[(resource, action)] = existing[0]
        else:
            new_id = uuid.uuid4()
            bind.execute(
                _permissions_t.insert().values(id=new_id, resource=resource, action=action, description=description)
            )
            permission_ids[(resource, action)] = new_id

    for key, role_names in SEED_GRANTS.items():
        permission_id = permission_ids[key]
        for role_name in role_names:
            role_id = role_ids[role_name]
            existing = bind.execute(
                sa.select(_role_permissions_t.c.role_id).where(
                    _role_permissions_t.c.role_id == role_id,
                    _role_permissions_t.c.permission_id == permission_id,
                )
            ).first()
            if not existing:
                bind.execute(_role_permissions_t.insert().values(role_id=role_id, permission_id=permission_id))


def downgrade() -> None:
    bind = op.get_bind()
    for resource, action, _ in SEED_PERMISSIONS:
        row = bind.execute(
            sa.select(_permissions_t.c.id).where(
                _permissions_t.c.resource == resource, _permissions_t.c.action == action
            )
        ).first()
        if row:
            bind.execute(_role_permissions_t.delete().where(_role_permissions_t.c.permission_id == row[0]))
            bind.execute(_permissions_t.delete().where(_permissions_t.c.id == row[0]))

    op.drop_constraint(UQ_NAME, "attendance_records", type_="unique")
    op.drop_column("leave_requests", "decision_comments")
