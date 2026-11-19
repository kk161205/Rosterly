"""auth state in Postgres, company settings, indexes, lower-case emails

Production hardening:
- password_tokens: single-use set-password links (reset, invite). Replaces the
  stateless JWT links whose "used" list lived in one process's memory.
- rate_limit_events: per-email / per-IP attempt counts that hold across
  workers and restarts.
- company_settings: company-editable single-value settings (audited).
- Indexes: sessions.refresh_token_hash (looked up on every refresh) and
  notifications.user_id (every notification query filters on it).
- users.email lower-cased so sign-in is case-insensitive. Stops with an error
  if two accounts differ only by case, so an operator can resolve them.

Revision ID: f2b4d6e8a0c1
Revises: e7a9c1d3f5b8
Create Date: 2026-11-19 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "f2b4d6e8a0c1"
down_revision = "e7a9c1d3f5b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    clashes = bind.execute(
        sa.text("SELECT lower(email) FROM users GROUP BY lower(email) HAVING COUNT(*) > 1")
    ).fetchall()
    if clashes:
        raise RuntimeError(
            "Migration f2b4d6e8a0c1: accounts differ only by email case: "
            f"{[c[0] for c in clashes]}. Merge or rename them, then re-run."
        )
    bind.execute(sa.text("UPDATE users SET email = lower(email) WHERE email <> lower(email)"))

    op.create_table(
        "password_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("purpose", sa.String(6), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("purpose IN ('reset', 'invite')", name="password_token_purpose_enum"),
    )
    op.create_index("ix_password_tokens_user_id", "password_tokens", ["user_id"])

    op.create_table(
        "rate_limit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_rate_limit_events_key_created_at", "rate_limit_events", ["key", "created_at"])

    op.create_table(
        "company_settings",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", postgresql.JSONB(), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("ix_sessions_refresh_token_hash", "sessions", ["refresh_token_hash"])
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_notifications_user_id", table_name="notifications")
    op.drop_index("ix_sessions_refresh_token_hash", table_name="sessions")
    op.drop_table("company_settings")
    op.drop_index("ix_rate_limit_events_key_created_at", table_name="rate_limit_events")
    op.drop_table("rate_limit_events")
    op.drop_index("ix_password_tokens_user_id", table_name="password_tokens")
    op.drop_table("password_tokens")
    # Lower-casing emails is not reversed (the original casing isn't kept).
