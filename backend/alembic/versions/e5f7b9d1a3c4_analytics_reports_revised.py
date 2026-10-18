"""analytics permissions follow the revised §5.15 reports

The Analytics page now shows reports that answer a question someone acts on
(spec §5.15, revised 18 Oct 2026). Three permissions are renamed to the report
they now guard — their role grants carry over unchanged because grants point at
permission ids — and one is added:

  analytics:asset_utilization     -> analytics:budget_forecast  (super_admin, it_admin, auditor)
  analytics:headcount_asset_ratio -> analytics:follow_ups       (super_admin, hr_admin, auditor)
  analytics:license_usage         -> analytics:savings          (super_admin, it_admin, auditor)
  analytics:turnaround (new)                                    (super_admin, it_admin, hr_admin, auditor)

analytics:cost_by_department is unchanged.

Revision ID: e5f7b9d1a3c4
Revises: c4e6a8b0d2f3
Create Date: 2026-10-18 14:00:00.000000

"""
import uuid

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e5f7b9d1a3c4"
down_revision = "c4e6a8b0d2f3"
branch_labels = None
depends_on = None

RENAMES = [
    ("asset_utilization", "budget_forecast", "View replacement forecast and expiring warranties (§5.15)"),
    ("headcount_asset_ratio", "follow_ups", "View unreturned leaver devices and joiner readiness (§5.15)"),
    ("license_usage", "savings", "View unused licence spend and idle equipment (§5.15)"),
]
OLD_DESCRIPTIONS = {
    "asset_utilization": "View asset utilization analytics (§5.15)",
    "headcount_asset_ratio": "View headcount-to-asset ratio analytics (§5.15)",
    "license_usage": "View software license usage analytics (§5.15)",
}
TURNAROUND = ("analytics", "turnaround", "View approval and repair turnaround (§5.15)")
TURNAROUND_ROLES = ["super_admin", "it_admin", "hr_admin", "auditor"]


def upgrade() -> None:
    bind = op.get_bind()
    for old, new, description in RENAMES:
        bind.execute(
            sa.text(
                "UPDATE permissions SET action = :new, description = :description "
                "WHERE resource = 'analytics' AND action = :old"
            ),
            {"old": old, "new": new, "description": description},
        )

    resource, action, description = TURNAROUND
    existing = bind.execute(
        sa.text("SELECT id FROM permissions WHERE resource = :r AND action = :a"), {"r": resource, "a": action}
    ).scalar()
    permission_id = existing or uuid.uuid4()
    if not existing:
        bind.execute(
            sa.text("INSERT INTO permissions (id, resource, action, description) VALUES (:id, :r, :a, :d)"),
            {"id": permission_id, "r": resource, "a": action, "d": description},
        )
    for role_name in TURNAROUND_ROLES:
        role_id = bind.execute(sa.text("SELECT id FROM roles WHERE name = :n"), {"n": role_name}).scalar()
        if role_id is None:
            continue
        granted = bind.execute(
            sa.text("SELECT 1 FROM role_permissions WHERE role_id = :r AND permission_id = :p"),
            {"r": role_id, "p": permission_id},
        ).scalar()
        if not granted:
            bind.execute(
                sa.text("INSERT INTO role_permissions (role_id, permission_id) VALUES (:r, :p)"),
                {"r": role_id, "p": permission_id},
            )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE permission_id IN "
            "(SELECT id FROM permissions WHERE resource = 'analytics' AND action = 'turnaround')"
        )
    )
    bind.execute(sa.text("DELETE FROM permissions WHERE resource = 'analytics' AND action = 'turnaround'"))
    for old, new, _ in RENAMES:
        bind.execute(
            sa.text(
                "UPDATE permissions SET action = :old, description = :description "
                "WHERE resource = 'analytics' AND action = :new"
            ),
            {"old": old, "new": new, "description": OLD_DESCRIPTIONS[old]},
        )
