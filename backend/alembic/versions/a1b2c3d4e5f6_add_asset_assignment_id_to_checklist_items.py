"""add asset_assignment_id to checklist_items

Revision ID: a1b2c3d4e5f6
Revises: 78db2fc1522a
Create Date: 2026-08-31 08:25:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '78db2fc1522a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'checklist_items',
        sa.Column('asset_assignment_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        'fk_checklist_items_asset_assignment_id',
        'checklist_items', 'asset_assignments',
        ['asset_assignment_id'], ['id'],
        ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('fk_checklist_items_asset_assignment_id', 'checklist_items', type_='foreignkey')
    op.drop_column('checklist_items', 'asset_assignment_id')
