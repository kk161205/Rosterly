"""seed RBAC permissions for maintenance tickets (§5.10 minimal slice)

Seeds the (resource, action) permission and role_permissions grant backing
POST /maintenance-tickets (PRD §5.10, the minimal slice needed by §5.8's
"Raise Ticket" action):

    (maintenance_ticket, create) -> it_admin, super_admin
        POST /maintenance-tickets for ANY asset.

Any other authenticated role (employee, manager, hr_admin, auditor) can
still raise a ticket, but only for an asset currently assigned to them —
that path is an ABAC ownership check in AssetService.create_maintenance_ticket,
not a role_permissions grant, so it is intentionally not seeded here (same
pattern already used for employee/manager self-service asset reads in
migration b87c4d3e2f1a).

Extends migration d3e5f7a9b1c3.

Revision ID: e4f6a8b0c2d5
Revises: d3e5f7a9b1c3
Create Date: 2026-09-22 00:00:00.000000

"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import table, column

# revision identifiers, used by Alembic.
revision = 'e4f6a8b0c2d5'
down_revision = 'd3e5f7a9b1c3'
branch_labels = None
depends_on = None

SEED_PERMISSIONS = [
    ("maintenance_ticket", "create", "Raise a maintenance ticket for any asset (§5.10)"),
]

SEED_GRANTS = {
    ("maintenance_ticket", "create"): ["it_admin", "super_admin"],
}

_REQUIRED_ROLES = {"it_admin", "super_admin"}


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
            f"Migration e4f6a8b0c2d5: cannot proceed — the following role(s) "
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
