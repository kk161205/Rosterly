"""no depreciation; simpler assets; daily job catch-up

- assets: drop current_value and depreciation_method — an asset's life is told
  by its status (retired), not book value. vendor, purchase_date,
  purchase_cost and useful_life_months become optional: only name and
  category are required to add an asset. useful_life_months (expected life)
  stays because "What to budget for" uses it.
- job_runs(name PK, last_run_on, last_result, updated_at): when each daily
  background job last ran, so the worker catches up after the free host sleeps.

Downgrade puts the columns back (current_value = purchase_cost, method 'none').

Revision ID: a1c3e5b7d9f0
Revises: f9b1d3e5a7c8
Create Date: 2026-11-21 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "a1c3e5b7d9f0"
down_revision = "f9b1d3e5a7c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("assets") as batch:
        batch.drop_column("current_value")
        batch.drop_column("depreciation_method")
        batch.alter_column("vendor", existing_type=sa.String(255), nullable=True)
        batch.alter_column("purchase_date", existing_type=sa.Date(), nullable=True)
        batch.alter_column("purchase_cost", existing_type=sa.Numeric(12, 2), nullable=True)
        batch.alter_column("useful_life_months", existing_type=sa.Integer(), nullable=True)

    op.create_table(
        "job_runs",
        sa.Column("name", sa.String(100), primary_key=True),
        sa.Column("last_run_on", sa.Date(), nullable=False),
        sa.Column("last_result", postgresql.JSONB(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("job_runs")
    op.execute("UPDATE assets SET vendor = 'Unknown' WHERE vendor IS NULL")
    op.execute("UPDATE assets SET purchase_date = COALESCE(created_at::date, CURRENT_DATE) WHERE purchase_date IS NULL")
    op.execute("UPDATE assets SET purchase_cost = 0 WHERE purchase_cost IS NULL")
    op.execute("UPDATE assets SET useful_life_months = 36 WHERE useful_life_months IS NULL")
    with op.batch_alter_table("assets") as batch:
        batch.add_column(sa.Column("current_value", sa.Numeric(12, 2), nullable=True))
        batch.add_column(sa.Column("depreciation_method", sa.String(17), nullable=True))
    op.execute("UPDATE assets SET current_value = purchase_cost, depreciation_method = 'none'")
    with op.batch_alter_table("assets") as batch:
        batch.alter_column("current_value", nullable=False)
        batch.alter_column("depreciation_method", nullable=False)
        batch.alter_column("vendor", existing_type=sa.String(255), nullable=False)
        batch.alter_column("purchase_date", existing_type=sa.Date(), nullable=False)
        batch.alter_column("purchase_cost", existing_type=sa.Numeric(12, 2), nullable=False)
        batch.alter_column("useful_life_months", existing_type=sa.Integer(), nullable=False)
