"""high-value threshold to 50,000; remove legacy permissions and duplicate chain

1. High-Value Asset Procurement (§1.17, §5.18): min_amount 1000.00 -> 50000.00.
   At 1,000 nearly every asset request took the 3-step chain.
2. Remove permission rows that no route checks. The canonical set below is
   exactly what migrations 975ba61cee70..a2c4e6f8b0d1 seed and what the code
   checks (31 pairs). Rows outside it came from an early hand seed on the
   shared dev DB (e.g. `asset:*` beside the real `assets:*`, `maintenance:*`,
   `leave:*`) and would clutter the §5.13 permission matrix. Future pages add
   their own permissions in their own migrations.
3. Remove a duplicate active access_request chain from that same hand seed —
   §1.17 expects exactly one active template per (request_type, min_amount tier).

On a fresh database steps 2 and 3 find nothing to remove.

Revision ID: c4e6a8b0d2f3
Revises: b3d5f7a9c1e2
Create Date: 2026-10-17 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c4e6a8b0d2f3'
down_revision = 'b3d5f7a9c1e2'
branch_labels = None
depends_on = None

HIGH_VALUE_NAME = "High-Value Asset Procurement"
OLD_THRESHOLD = "1000.00"
NEW_THRESHOLD = "50000.00"

CANONICAL_PERMISSIONS = [
    ("analytics", "asset_utilization"),
    ("analytics", "cost_by_department"),
    ("analytics", "headcount_asset_ratio"),
    ("analytics", "license_usage"),
    ("assets", "bulk_update"),
    ("assets", "create"),
    ("assets", "delete"),
    ("assets", "lookup"),
    ("assets", "read"),
    ("assets", "update"),
    ("employee", "approve"),
    ("employee", "create"),
    ("employee", "delete"),
    ("employee", "read"),
    ("employee", "update"),
    ("maintenance_ticket", "create"),
    ("maintenance_ticket", "read"),
    ("maintenance_ticket", "update"),
    ("request", "approve"),
    ("request", "create"),
    ("request", "read"),
    ("request", "update"),
    ("role", "create"),
    ("role", "delete"),
    ("role", "read"),
    ("role", "update"),
    ("user", "assign_role"),
    ("user", "create"),
    ("user", "force_logout"),
    ("user", "read"),
    ("user", "update"),
]

DUPLICATE_CHAIN = ("access_request", "Production Access Request")
KEPT_CHAIN = ("access_request", "Standard Access Request")


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Threshold
    bind.execute(
        sa.text(
            "UPDATE approval_chain_templates SET min_amount = :new "
            "WHERE name = :name AND request_type = 'asset_request' AND min_amount = :old"
        ),
        {"new": NEW_THRESHOLD, "old": OLD_THRESHOLD, "name": HIGH_VALUE_NAME},
    )

    # 2. Legacy permissions (grants first, then the permission rows)
    canonical = {f"{r}:{a}" for r, a in CANONICAL_PERMISSIONS}
    rows = bind.execute(sa.text("SELECT id, resource, action FROM permissions")).fetchall()
    legacy_ids = [str(row.id) for row in rows if f"{row.resource}:{row.action}" not in canonical]
    for perm_id in legacy_ids:
        bind.execute(sa.text("DELETE FROM role_permissions WHERE permission_id = :id"), {"id": perm_id})
        bind.execute(sa.text("DELETE FROM permissions WHERE id = :id"), {"id": perm_id})

    # 3. Duplicate chain — only when the canonical chain for the same tier exists
    kept = bind.execute(
        sa.text(
            "SELECT COUNT(*) FROM approval_chain_templates "
            "WHERE request_type = :t AND name = :n AND min_amount IS NULL AND is_active"
        ),
        {"t": KEPT_CHAIN[0], "n": KEPT_CHAIN[1]},
    ).scalar()
    if kept:
        params = {"t": DUPLICATE_CHAIN[0], "n": DUPLICATE_CHAIN[1]}
        bind.execute(
            sa.text(
                "DELETE FROM approval_chain_steps WHERE template_id IN ("
                "SELECT id FROM approval_chain_templates WHERE request_type = :t AND name = :n "
                "AND min_amount IS NULL)"
            ),
            params,
        )
        bind.execute(
            sa.text(
                "DELETE FROM approval_chain_templates WHERE request_type = :t AND name = :n "
                "AND min_amount IS NULL"
            ),
            params,
        )


def downgrade() -> None:
    # Only the threshold is reversible; deleted legacy rows were never part of
    # any migration and are not recreated.
    op.get_bind().execute(
        sa.text(
            "UPDATE approval_chain_templates SET min_amount = :old "
            "WHERE name = :name AND request_type = 'asset_request' AND min_amount = :new"
        ),
        {"new": NEW_THRESHOLD, "old": OLD_THRESHOLD, "name": HIGH_VALUE_NAME},
    )
