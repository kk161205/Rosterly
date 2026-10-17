"""seed RBAC permissions for roles (§5.13) and users (§5.14)

Seeds the (resource, action) permissions and role_permissions grants backing:
- Role & Permission Management (§5.13):
    (role, read)   -> super_admin
    (role, create) -> super_admin
    (role, update) -> super_admin
    (role, delete) -> super_admin
- User Management (§5.14):
    (user, read)         -> super_admin, hr_admin
    (user, create)       -> super_admin, hr_admin
    (user, update)       -> super_admin, hr_admin
    (user, assign_role)  -> super_admin
    (user, force_logout) -> super_admin

Extends migration f5a7b9c1d3e6.

Revision ID: c1a2d3e4f5a6
Revises: f5a7b9c1d3e6
Create Date: 2026-10-17 00:00:00.000000

"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import column, table

# revision identifiers, used by Alembic.
revision = 'c1a2d3e4f5a6'
down_revision = 'f5a7b9c1d3e6'
branch_labels = None
depends_on = None

SEED_PERMISSIONS = [
    ("role", "read", "View roles list and role permissions matrix (§5.13)"),
    ("role", "create", "Create a custom role (§5.13)"),
    ("role", "update", "Update role permissions matrix (§5.13)"),
    ("role", "delete", "Delete a custom non-system role (§5.13)"),
    ("user", "read", "View user governance list and details (§5.14)"),
    ("user", "create", "Create / invite new user account (§5.14)"),
    ("user", "update", "Update user account status (§5.14)"),
    ("user", "assign_role", "Change a user's assigned role (§5.14)"),
    ("user", "force_logout", "Force global logout across all active sessions (§5.14)"),
]

SEED_GRANTS = {
    ("role", "read"): ["super_admin"],
    ("role", "create"): ["super_admin"],
    ("role", "update"): ["super_admin"],
    ("role", "delete"): ["super_admin"],
    ("user", "read"): ["super_admin", "hr_admin"],
    ("user", "create"): ["super_admin", "hr_admin"],
    ("user", "update"): ["super_admin", "hr_admin"],
    ("user", "assign_role"): ["super_admin"],
    ("user", "force_logout"): ["super_admin"],
}

_REQUIRED_ROLES = {"super_admin", "hr_admin"}


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
            f"Migration c1a2d3e4f5a6: cannot proceed — the following role(s) "
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
