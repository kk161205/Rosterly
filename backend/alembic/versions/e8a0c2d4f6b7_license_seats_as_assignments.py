"""licence seats are assignments to people, ready for provider sync

- license_assignments(id, license_id, user_id, source, external_id,
  assigned_by, assigned_at, removed_at, removed_by): one person holding one
  seat. Only one active seat per person per licence (partial unique index).
- software_licenses: source ('manual' or a provider such as 'microsoft_365'),
  external_sku_id (unique), last_synced_at.
- checklist_items.license_assignment_id: offboarding items that reclaim a seat.
- assets.license_id is removed — a seat isn't a physical asset. Existing
  links are carried over first: each asset linked to a licence, assigned to
  someone, becomes that person's seat (one per person per licence).

Downgrade restores assets.license_id (empty) and drops the new table/columns.

Revision ID: e8a0c2d4f6b7
Revises: d7f9b1c3e5a6
Create Date: 2026-11-21 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "e8a0c2d4f6b7"
down_revision = "d7f9b1c3e5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("software_licenses", sa.Column("source", sa.String(50), nullable=False, server_default="manual"))
    op.add_column("software_licenses", sa.Column("external_sku_id", sa.String(255), nullable=True))
    op.add_column("software_licenses", sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint("uq_software_licenses_external_sku_id", "software_licenses", ["external_sku_id"])

    op.create_table(
        "license_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("license_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("software_licenses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source", sa.String(50), nullable=False, server_default="manual"),
        sa.Column("external_id", sa.String(255), nullable=True),
        sa.Column("assigned_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("removed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_license_assignments_license_id", "license_assignments", ["license_id"])
    op.create_index("ix_license_assignments_user_id", "license_assignments", ["user_id"])
    op.create_index(
        "uq_license_assignments_active",
        "license_assignments",
        ["license_id", "user_id"],
        unique=True,
        postgresql_where=sa.text("removed_at IS NULL"),
    )

    # Carry existing asset-based seats over (one per person per licence).
    op.execute(
        """
        INSERT INTO license_assignments (id, license_id, user_id, source, assigned_at)
        SELECT gen_random_uuid(), license_id, current_holder_id, 'manual', now()
        FROM (
            SELECT DISTINCT license_id, current_holder_id
            FROM assets
            WHERE license_id IS NOT NULL AND current_holder_id IS NOT NULL AND status = 'assigned'
        ) AS seats
        """
    )

    op.add_column(
        "checklist_items",
        sa.Column(
            "license_assignment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("license_assignments.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    with op.batch_alter_table("assets") as batch:
        batch.drop_column("license_id")


def downgrade() -> None:
    op.add_column(
        "assets",
        sa.Column("license_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("software_licenses.id", ondelete="SET NULL"), nullable=True),
    )
    op.drop_column("checklist_items", "license_assignment_id")
    op.drop_index("uq_license_assignments_active", table_name="license_assignments")
    op.drop_index("ix_license_assignments_user_id", table_name="license_assignments")
    op.drop_index("ix_license_assignments_license_id", table_name="license_assignments")
    op.drop_table("license_assignments")
    op.drop_constraint("uq_software_licenses_external_sku_id", "software_licenses", type_="unique")
    op.drop_column("software_licenses", "last_synced_at")
    op.drop_column("software_licenses", "external_sku_id")
    op.drop_column("software_licenses", "source")
