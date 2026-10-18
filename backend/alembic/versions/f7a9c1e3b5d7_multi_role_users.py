"""multi-role users: additional roles and role conflicts

Spec §5.14 (revised 18 Oct 2026): a user keeps one primary role
(users.role_id, unchanged) and may hold additional roles. Effective access is
the union of every role held. Two tables:

  user_roles      — additional roles per user (primary role is NOT repeated here)
  role_conflicts  — pairs of roles one person may not hold together; seeded with
                    auditor vs super_admin / it_admin / hr_admin, so the person
                    auditing changes can't also be making them.

No existing data changes: every user starts with their current role as primary
and no additional roles.

Revision ID: f7a9c1e3b5d7
Revises: e5f7b9d1a3c4
Create Date: 2026-10-18 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "f7a9c1e3b5d7"
down_revision = "e5f7b9d1a3c4"
branch_labels = None
depends_on = None

SEED_CONFLICTS = [("auditor", "super_admin"), ("auditor", "it_admin"), ("auditor", "hr_admin")]


def upgrade() -> None:
    op.create_table(
        "user_roles",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("assigned_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_user_roles_role_id", "user_roles", ["role_id"])

    op.create_table(
        "role_conflicts",
        sa.Column("role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column(
            "conflicts_with_role_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("roles.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("role_id <> conflicts_with_role_id", name="ck_role_conflicts_distinct"),
    )

    bind = op.get_bind()
    for a, b in SEED_CONFLICTS:
        bind.execute(
            sa.text(
                "INSERT INTO role_conflicts (role_id, conflicts_with_role_id) "
                "SELECT ra.id, rb.id FROM roles ra, roles rb WHERE ra.name = :a AND rb.name = :b"
            ),
            {"a": a, "b": b},
        )


def downgrade() -> None:
    op.drop_table("role_conflicts")
    op.drop_index("ix_user_roles_role_id", table_name="user_roles")
    op.drop_table("user_roles")
