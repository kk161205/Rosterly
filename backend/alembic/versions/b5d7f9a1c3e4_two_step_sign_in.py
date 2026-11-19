"""two-step sign-in with an authenticator app

Replaces the fixed development MFA code with real TOTP:
- users: mfa_secret_encrypted, mfa_pending_secret_encrypted (Fernet-encrypted
  secrets), mfa_enabled_at, mfa_last_used_step (replay protection).
- mfa_challenges: pending second sign-in steps (hashed id, 10 minutes,
  5 attempts) — they used to live in one process's memory.
- mfa_recovery_codes: one-time backup codes, hashed.

Any account that had mfa_enabled = true without a secret (dev data, where the
fixed code 123456 was accepted) has it switched off, so nobody is locked out;
they can set it up again from their profile.

Revision ID: b5d7f9a1c3e4
Revises: a4c6e8f0b2d3
Create Date: 2026-11-19 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "b5d7f9a1c3e4"
down_revision = "a4c6e8f0b2d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("mfa_secret_encrypted", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("mfa_pending_secret_encrypted", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("mfa_enabled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("mfa_last_used_step", sa.BigInteger(), nullable=True))
    op.execute("UPDATE users SET mfa_enabled = false WHERE mfa_enabled = true")

    op.create_table(
        "mfa_challenges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("challenge_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_mfa_challenges_user_id", "mfa_challenges", ["user_id"])

    op.create_table(
        "mfa_recovery_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_mfa_recovery_codes_user_id", "mfa_recovery_codes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_mfa_recovery_codes_user_id", table_name="mfa_recovery_codes")
    op.drop_table("mfa_recovery_codes")
    op.drop_index("ix_mfa_challenges_user_id", table_name="mfa_challenges")
    op.drop_table("mfa_challenges")
    op.execute("UPDATE users SET mfa_enabled = false")
    op.drop_column("users", "mfa_last_used_step")
    op.drop_column("users", "mfa_enabled_at")
    op.drop_column("users", "mfa_pending_secret_encrypted")
    op.drop_column("users", "mfa_secret_encrypted")
