"""company leave policy: leave types and holidays as tables

- leave_types: the company's own list, seeded with sensible Indian defaults —
  Earned 15 days (up to 45 carry over), Casual 8, Sick 12 (both lapse),
  Unpaid (no limit). HR edits them and adds more. If existing data used the
  old fixed "other" type, an inactive "Other" (unpaid, no limit) keeps it
  readable.
- holidays: company holidays, not counted as working days. (Per-employee
  `holiday` attendance rows are no longer used for counting.)
- leave_requests.leave_type and leave_balances.leave_type (fixed text values)
  become leave_type_id → leave_types.id. Existing rows are mapped by name.
- leave_balances gets UNIQUE (employee_id, leave_type_id, year); duplicates
  (should be none) stop the migration so an operator can merge them.
- Permission (leave_policy, manage) → hr_admin, super_admin.

Downgrade restores the text columns from the type names (types added later
fall back to 'other') and drops the new tables and permission.

Revision ID: d7f9b1c3e5a6
Revises: c6e8a0b2d4f5
Create Date: 2026-11-20 02:00:00.000000

"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "d7f9b1c3e5a6"
down_revision = "c6e8a0b2d4f5"
branch_labels = None
depends_on = None

# (key used by old rows, display name, annual days, carry forward max, paid, active, order)
DEFAULT_TYPES = [
    ("earned", "Earned leave", "15", "45", True, True, 1),
    ("casual", "Casual leave", "8", "0", True, True, 2),
    ("sick", "Sick leave", "12", "0", True, True, 3),
    ("unpaid", "Unpaid leave", None, "0", False, True, 4),
]
OTHER = ("other", "Other", None, "0", False, False, 5)


def upgrade() -> None:
    bind = op.get_bind()

    op.create_table(
        "leave_types",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(60), nullable=False, unique=True),
        sa.Column("annual_days", sa.Numeric(5, 2), nullable=True),
        sa.Column("carry_forward_max", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("pro_rate_on_join", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "holidays",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    used_other = bind.execute(
        sa.text(
            "SELECT 1 FROM leave_requests WHERE leave_type = 'other' "
            "UNION SELECT 1 FROM leave_balances WHERE leave_type = 'other' LIMIT 1"
        )
    ).first()
    type_ids: dict[str, str] = {}
    for key, name, annual, carry, paid, active, order in DEFAULT_TYPES + ([OTHER] if used_other else []):
        tid = str(uuid.uuid4())
        type_ids[key] = tid
        bind.execute(
            sa.text(
                "INSERT INTO leave_types (id, name, annual_days, carry_forward_max, is_paid, pro_rate_on_join, is_active, sort_order) "
                "VALUES (:id, :name, :annual, :carry, :paid, true, :active, :ord)"
            ),
            {"id": tid, "name": name, "annual": annual, "carry": carry, "paid": paid, "active": active, "ord": order},
        )

    for table in ("leave_requests", "leave_balances"):
        op.add_column(table, sa.Column("leave_type_id", postgresql.UUID(as_uuid=True), nullable=True))
        for key, tid in type_ids.items():
            bind.execute(sa.text(f"UPDATE {table} SET leave_type_id = :tid WHERE leave_type = :key"), {"tid": tid, "key": key})
        leftover = bind.execute(sa.text(f"SELECT COUNT(*) FROM {table} WHERE leave_type_id IS NULL")).scalar()
        if leftover:
            raise RuntimeError(f"Migration d7f9b1c3e5a6: {leftover} {table} row(s) have an unknown leave type.")
        op.alter_column(table, "leave_type_id", nullable=False)
        op.create_foreign_key(f"fk_{table}_leave_type_id", table, "leave_types", ["leave_type_id"], ["id"], ondelete="RESTRICT")
        op.drop_column(table, "leave_type")

    duplicates = bind.execute(
        sa.text(
            "SELECT employee_id, leave_type_id, year FROM leave_balances "
            "GROUP BY employee_id, leave_type_id, year HAVING COUNT(*) > 1"
        )
    ).fetchall()
    if duplicates:
        raise RuntimeError(f"Migration d7f9b1c3e5a6: duplicate leave balances to merge first: {duplicates[:5]}")
    op.create_unique_constraint("uq_leave_balances_employee_type_year", "leave_balances", ["employee_id", "leave_type_id", "year"])

    pid = str(uuid.uuid4())
    bind.execute(
        sa.text("INSERT INTO permissions (id, resource, action, description) VALUES (:id, 'leave_policy', 'manage', :d)"),
        {"id": pid, "d": "Manage leave types, company holidays and leave balances"},
    )
    for (rid,) in bind.execute(sa.text("SELECT id FROM roles WHERE name IN ('hr_admin', 'super_admin')")).fetchall():
        bind.execute(sa.text("INSERT INTO role_permissions (role_id, permission_id) VALUES (:r, :p)"), {"r": str(rid), "p": pid})


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE permission_id IN "
            "(SELECT id FROM permissions WHERE resource = 'leave_policy' AND action = 'manage')"
        )
    )
    bind.execute(sa.text("DELETE FROM permissions WHERE resource = 'leave_policy' AND action = 'manage'"))
    op.drop_constraint("uq_leave_balances_employee_type_year", "leave_balances", type_="unique")

    name_to_key = {name: key for key, name, *_ in DEFAULT_TYPES + [OTHER]}
    for table in ("leave_requests", "leave_balances"):
        op.add_column(table, sa.Column("leave_type", sa.String(6), nullable=True))
        for tid, name in bind.execute(sa.text("SELECT id, name FROM leave_types")).fetchall():
            bind.execute(
                sa.text(f"UPDATE {table} SET leave_type = :key WHERE leave_type_id = :tid"),
                {"key": name_to_key.get(name, "other"), "tid": str(tid)},
            )
        op.alter_column(table, "leave_type", nullable=False)
        op.drop_constraint(f"fk_{table}_leave_type_id", table, type_="foreignkey")
        op.drop_column(table, "leave_type_id")

    op.drop_table("holidays")
    op.drop_table("leave_types")
