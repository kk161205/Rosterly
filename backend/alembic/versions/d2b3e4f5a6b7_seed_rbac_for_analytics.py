"""seed RBAC permissions for analytics dashboard (§5.15)

Seeds the (resource, action) permissions and role_permissions grants backing:
- GET /analytics/asset-utilization (§5.15):
    (analytics, asset_utilization)   -> super_admin, it_admin, auditor
- GET /analytics/cost-by-department (§5.15):
    (analytics, cost_by_department)  -> super_admin, it_admin, hr_admin, auditor
- GET /analytics/headcount-asset-ratio (§5.15):
    (analytics, headcount_asset_ratio) -> super_admin, hr_admin, auditor
- GET /analytics/license-usage (§5.15):
    (analytics, license_usage)       -> super_admin, it_admin, auditor

Extends migration c1a2d3e4f5a6.

Revision ID: d2b3e4f5a6b7
Revises: c1a2d3e4f5a6
Create Date: 2026-10-17 00:00:00.000000

"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import column, table

# revision identifiers, used by Alembic.
revision = 'd2b3e4f5a6b7'
down_revision = 'c1a2d3e4f5a6'
branch_labels = None
depends_on = None

SEED_PERMISSIONS = [
    ("analytics", "asset_utilization", "View asset utilization analytics (§5.15)"),
    ("analytics", "cost_by_department", "View cost per department analytics (§5.15)"),
    ("analytics", "headcount_asset_ratio", "View headcount-to-asset ratio analytics (§5.15)"),
    ("analytics", "license_usage", "View software license usage analytics (§5.15)"),
]

SEED_GRANTS = {
    ("analytics", "asset_utilization"): ["super_admin", "it_admin", "auditor"],
    ("analytics", "cost_by_department"): ["super_admin", "it_admin", "hr_admin", "auditor"],
    ("analytics", "headcount_asset_ratio"): ["super_admin", "hr_admin", "auditor"],
    ("analytics", "license_usage"): ["super_admin", "it_admin", "auditor"],
}

_REQUIRED_ROLES = {"super_admin", "it_admin", "hr_admin", "auditor"}


def upgrade() -> None:
    bind = op.get_bind()

    roles_t = table(
        "roles",
        column("id", postgresql.UUID(as_uuid=True)),
        column("name", sa.String),
    )
    permissions_t = table(
        "permissions",
        column("id", postgresql.UUID(as_uuid=True)),
        column("resource", sa.String),
        column("action", sa.String),
        column("description", sa.Text),
    )
    role_permissions_t = table(
        "role_permissions",
        column("role_id", postgresql.UUID(as_uuid=True)),
        column("permission_id", postgresql.UUID(as_uuid=True)),
    )

    role_rows = bind.execute(sa.select(roles_t.c.id, roles_t.c.name)).fetchall()
    role_ids: dict[str, uuid.UUID] = {name: role_id for role_id, name in role_rows}

    missing = _REQUIRED_ROLES - role_ids.keys()
    if missing:
        raise RuntimeError(
            f"Migration d2b3e4f5a6b7: cannot proceed — the following role(s) "
            f"were not found in the roles table: {sorted(missing)}."
        )

    permission_ids: dict[tuple[str, str], uuid.UUID] = {}
    for resource, action, description in SEED_PERMISSIONS:
        existing = bind.execute(
            sa.select(permissions_t.c.id).where(
                permissions_t.c.resource == resource,
                permissions_t.c.action == action,
            )
        ).first()
        if existing:
            permission_ids[(resource, action)] = existing[0]
        else:
            new_id = uuid.uuid4()
            bind.execute(
                permissions_t.insert().values(
                    id=new_id, resource=resource, action=action, description=description
                )
            )
            permission_ids[(resource, action)] = new_id

    for (resource, action), role_names in SEED_GRANTS.items():
        permission_id = permission_ids[(resource, action)]
        for role_name in role_names:
            role_id = role_ids[role_name]
            existing = bind.execute(
                sa.select(role_permissions_t.c.role_id).where(
                    role_permissions_t.c.role_id == role_id,
                    role_permissions_t.c.permission_id == permission_id,
                )
            ).first()
            if not existing:
                bind.execute(
                    role_permissions_t.insert().values(
                        role_id=role_id, permission_id=permission_id
                    )
                )


def downgrade() -> None:
    bind = op.get_bind()

    permissions_t = table(
        "permissions",
        column("id", postgresql.UUID(as_uuid=True)),
        column("resource", sa.String),
        column("action", sa.String),
    )
    role_permissions_t = table(
        "role_permissions",
        column("role_id", postgresql.UUID(as_uuid=True)),
        column("permission_id", postgresql.UUID(as_uuid=True)),
    )

    for resource, action, _ in SEED_PERMISSIONS:
        perm_row = bind.execute(
            sa.select(permissions_t.c.id).where(
                permissions_t.c.resource == resource,
                permissions_t.c.action == action,
            )
        ).first()
        if perm_row:
            permission_id = perm_row[0]
            bind.execute(
                role_permissions_t.delete().where(
                    role_permissions_t.c.permission_id == permission_id
                )
            )
            bind.execute(
                permissions_t.delete().where(permissions_t.c.id == permission_id)
            )
