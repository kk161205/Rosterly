"""add emergency contact fields to users

§5.4's Overview Tab spec explicitly calls for "emergency contact" as a field
on the Employee Profile page, but the §1.1 users schema never carried it —
the frontend rendered it as permanently-empty dead UI. Adds the two columns
this page's spec actually needs (name + phone), closing that doc/schema gap
per rules.md §8.1 rather than leaving the UI silently unable to ever populate.

Revision ID: d3e5f7a9b1c3
Revises: b87c4d3e2f1a
Create Date: 2026-09-08 00:00:00.000001

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd3e5f7a9b1c3'
down_revision = 'b87c4d3e2f1a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('emergency_contact_name', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column('emergency_contact_phone', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'emergency_contact_phone')
    op.drop_column('users', 'emergency_contact_name')
