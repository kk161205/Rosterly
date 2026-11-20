"""leave: carried-in days on balances, deducted days on requests

- leave_balances.carried_in: days carried from last year, kept so the carry can be
  corrected when last year's balance changes after this year's row exists.
- leave_requests.days_deducted: working days taken at approval, so a cancel refunds
  exactly that even if company holidays changed in between.
Existing rows: carried_in 0; approved requests get their working-day count today.

Revision ID: c3e5a7b9d1f3
Revises: b2d4f6a8c0e1
Create Date: 2026-11-22 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c3e5a7b9d1f3"
down_revision = "b2d4f6a8c0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("leave_balances", sa.Column("carried_in", sa.Numeric(5, 2), nullable=False, server_default="0"))
    op.add_column("leave_requests", sa.Column("days_deducted", sa.Numeric(5, 2), nullable=True))
    # Approved requests: weekdays in the range minus company holidays (the same rule the app uses).
    op.execute(
        """
        UPDATE leave_requests lr
        SET days_deducted = (
            SELECT count(*) FROM generate_series(lr.start_date, lr.end_date, interval '1 day') AS d(day)
            WHERE extract(isodow FROM d.day) < 6
              AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.date = d.day::date)
        )
        FROM leave_types lt
        WHERE lr.status = 'approved' AND lt.id = lr.leave_type_id AND lt.annual_days IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("leave_requests", "days_deducted")
    op.drop_column("leave_balances", "carried_in")
