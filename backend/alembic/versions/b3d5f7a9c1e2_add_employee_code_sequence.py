"""add employee_code_seq for race-safe RST-XXXX codes (§1.1, §5.14)

Replaces the CREATE SEQUENCE that User Management used to run at request
time (rules.md §3.6: schema changes go through migrations only).

Revision ID: b3d5f7a9c1e2
Revises: a2c4e6f8b0d1
Create Date: 2026-10-17 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b3d5f7a9c1e2'
down_revision = 'a2c4e6f8b0d1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF NOT EXISTS: an environment may already have the sequence from the old
    # request-time creation; it is kept as-is so issued codes never repeat.
    op.execute(sa.text("CREATE SEQUENCE IF NOT EXISTS employee_code_seq START WITH 1 INCREMENT BY 1"))


def downgrade() -> None:
    op.execute(sa.text("DROP SEQUENCE IF EXISTS employee_code_seq"))
