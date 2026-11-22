"""user preferences: accent colour and AI Guide switches

- user_preferences(user_id PK → users.id ON DELETE CASCADE, accent, assistant_enabled,
  guide_style, voice_enabled, updated_at). No row = defaults (navy, Guide on,
  "show me the way", voice off).
The company-wide switch `ai.assistant_enabled` is a code default in
app/core/company_settings.py, so it needs no row here.

Revision ID: b2d4f6a8c0e1
Revises: a1c3e5b7d9f0
Create Date: 2026-11-21 19:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "b2d4f6a8c0e1"
down_revision = "a1c3e5b7d9f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_preferences",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("accent", sa.String(20), nullable=False, server_default="navy"),
        sa.Column("assistant_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("guide_style", sa.String(10), nullable=False, server_default="show"),
        sa.Column("voice_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("guide_style IN ('show', 'take')", name="ck_user_preferences_guide_style"),
    )


def downgrade() -> None:
    op.drop_table("user_preferences")
