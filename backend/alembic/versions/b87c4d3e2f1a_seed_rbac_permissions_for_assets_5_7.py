"""seed RBAC permissions for assets page 5.7

Seeds (resource, action) permissions and role_permissions grants for asset management (PRD §5.7):

    (assets, read)        -> it_admin, super_admin, auditor, manager
        GET /assets (§5.7 — browse catalog; manager is further scoped by department ABAC)
    (assets, create)      -> it_admin, super_admin
        POST /assets (§5.7 — provision new asset)
    (assets, update)      -> it_admin, super_admin
        PATCH /assets/{id} (§5.7 — edit asset details / set status='retired')
    (assets, bulk_update) -> it_admin, super_admin
        PATCH /assets/bulk (§5.7 — atomic bulk status update)
    (assets, delete)      -> super_admin
        DELETE /assets/{id} (§5.7 — hard delete; it_admin is explicitly excluded)

Extends migration 975ba61cee70 (which seeded §5.1–§5.6 permissions) to cover §5.7.
Roles are already present from 975ba61cee70 — this migration only adds permissions
and grants; it does NOT re-seed roles.

Revision ID: b87c4d3e2f1a
Revises: 975ba61cee70
Create Date: 2026-09-06 00:00:00.000000

"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import table, column

# revision identifiers, used by Alembic.
revision = 'b87c4d3e2f1a'
down_revision = '975ba61cee70'
branch_labels = None
depends_on = None

# (resource, action, description)
SEED_PERMISSIONS = [
    ("assets", "read",        "Browse and search the asset catalog (§5.7)"),
    ("assets", "create",      "Provision a new asset record (§5.7)"),
    ("assets", "update",      "Update asset details or set status=retired (§5.7)"),
    ("assets", "bulk_update", "Atomic bulk asset status update (§5.7)"),
    ("assets", "delete",      "Hard-delete an asset record — data-entry mistakes only (§5.7)"),
]

# (resource, action) -> [role names]
# NOTE: it_admin is explicitly absent from "delete" — super_admin only.
# manager has read (catalog, scoped by department ABAC inside list_assets()) but
# cannot create/update/bulk_update/delete.
SEED_GRANTS = {
    ("assets", "read"):        ["it_admin", "super_admin", "auditor", "manager"],
    ("assets", "create"):      ["it_admin", "super_admin"],
    ("assets", "update"):      ["it_admin", "super_admin"],
    ("assets", "bulk_update"): ["it_admin", "super_admin"],
    ("assets", "delete"):      ["super_admin"],
}

# All role names referenced in SEED_GRANTS — must all exist in the roles table
# (seeded by migration 975ba61cee70) before we proceed.
_REQUIRED_ROLES = {"it_admin", "super_admin", "auditor", "manager"}


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

    # 1. Fetch all existing roles and build name -> id map.
    role_rows = bind.execute(sa.select(roles_t.c.id, roles_t.c.name)).fetchall()
    role_ids: dict[str, uuid.UUID] = {name: role_id for role_id, name in role_rows}

    # Hardening: verify every role we are about to grant exists before touching
    # anything. A bare KeyError mid-loop is opaque; this surfaces the exact
    # missing role name with a clear message.
    missing = _REQUIRED_ROLES - role_ids.keys()
    if missing:
        raise RuntimeError(
            f"Migration b87c4d3e2f1a: cannot proceed — the following role(s) "
            f"were not found in the roles table: {sorted(missing)}. "
            f"Ensure migration 975ba61cee70 has been applied first."
        )

    # 2. Permissions — idempotent check-then-insert by (resource, action).
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

    # 3. Role <-> Permission grants — idempotent (composite PK check first).
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

    # Only remove exactly what this migration added — role_permissions rows
    # for the seeded (assets, *) permission pairs, then the permission rows
    # themselves. Roles are left in place (shared table, not ours to remove).
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
