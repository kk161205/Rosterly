"""request fulfilment: approved → in progress → done

- requests: fulfilment_note, fulfilled_by (→ users, SET NULL), fulfilled_at.
  The in_progress and completed statuses existed but nothing ever set them;
  now IT (asset, access, IT requests) or HR (other requests) move approved
  requests on, and the requester is told each time.
- Permission (request, fulfil) → it_admin, hr_admin, super_admin.

Revision ID: f9b1d3e5a7c8
Revises: e8a0c2d4f6b7
Create Date: 2026-11-21 13:00:00.000000

"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "f9b1d3e5a7c8"
down_revision = "e8a0c2d4f6b7"
branch_labels = None
depends_on = None

FULFILLER_ROLES = ("it_admin", "hr_admin", "super_admin")


def upgrade() -> None:
    op.add_column("requests", sa.Column("fulfilment_note", sa.Text(), nullable=True))
    op.add_column(
        "requests",
        sa.Column("fulfilled_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column("requests", sa.Column("fulfilled_at", sa.DateTime(timezone=True), nullable=True))

    bind = op.get_bind()
    pid = str(uuid.uuid4())
    bind.execute(
        sa.text("INSERT INTO permissions (id, resource, action, description) VALUES (:id, 'request', 'fulfil', :d)"),
        {"id": pid, "d": "Move approved requests to in progress and done"},
    )
    for (rid,) in bind.execute(sa.text("SELECT id FROM roles WHERE name IN :names").bindparams(sa.bindparam("names", expanding=True)), {"names": list(FULFILLER_ROLES)}).fetchall():
        bind.execute(sa.text("INSERT INTO role_permissions (role_id, permission_id) VALUES (:r, :p)"), {"r": str(rid), "p": pid})


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE permission_id IN "
            "(SELECT id FROM permissions WHERE resource = 'request' AND action = 'fulfil')"
        )
    )
    bind.execute(sa.text("DELETE FROM permissions WHERE resource = 'request' AND action = 'fulfil'"))
    op.drop_column("requests", "fulfilled_at")
    op.drop_column("requests", "fulfilled_by")
    op.drop_column("requests", "fulfilment_note")
