"""widen assets.category to VARCHAR(100)

The initial migration created assets.category as a non-native Enum, which
PostgreSQL stores as VARCHAR(16) (the longest seed value, "software_license").
The model has since made category an open, admin-extensible String(100) — new
categories are typed in on asset creation — so any category longer than 16
characters failed on PostgreSQL. This brings the column in line with the model.

Downgrade narrows it back to VARCHAR(16); it fails if a longer category exists,
which is the safe outcome (no silent truncation).

Revision ID: a8c0e2f4b6d8
Revises: f7a9c1e3b5d7
Create Date: 2026-10-20 20:15:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a8c0e2f4b6d8"
down_revision = "f7a9c1e3b5d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "assets",
        "category",
        existing_type=sa.String(length=16),
        type_=sa.String(length=100),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "assets",
        "category",
        existing_type=sa.String(length=100),
        type_=sa.String(length=16),
        existing_nullable=False,
    )
