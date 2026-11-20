"""seed RBAC permission for the audit log viewer

Seeds the (resource, action) permission and role_permissions grants backing:
- GET /audit-logs:
    (audit_log, read) -> super_admin, auditor

Notifications are self-scoped for every authenticated user and need no
permission row.

Idempotent: existing permission/grant rows are reused. Fails loudly if a
required role is missing. Downgrade removes only what this revision seeds.

Revision ID: b4d6f8a0c2e4
Revises: a8c0e2f4b6d8
Create Date: 2026-11-14 10:00:00.000000

"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import column, table

# revision identifiers, used by Alembic.
revision = "b4d6f8a0c2e4"
down_revision = "a8c0e2f4b6d8"
branch_labels = None
depends_on = None

SEED_PERMISSIONS = [
    ("audit_log", "read", "View the system-wide audit log"),
]

SEED_GRANTS = {
    ("audit_log", "read"): ["super_admin", "auditor"],
}

_REQUIRED_ROLES = {"super_admin", "auditor"}

_roles_t = table(
    "roles",
    column("id", postgresql.UUID(as_uuid=True)),
    column("name", sa.String),
)
_permissions_t = table(
    "permissions",
    column("id", postgresql.UUID(as_uuid=True)),
    column("resource", sa.String),
    column("action", sa.String),
    column("description", sa.Text),
)
_role_permissions_t = table(
    "role_permissions",
    column("role_id", postgresql.UUID(as_uuid=True)),
    column("permission_id", postgresql.UUID(as_uuid=True)),
)


def upgrade() -> None:
    bind = op.get_bind()

    role_ids: dict[str, uuid.UUID] = {
        name: role_id for role_id, name in bind.execute(sa.select(_roles_t.c.id, _roles_t.c.name)).fetchall()
    }
    missing = _REQUIRED_ROLES - role_ids.keys()
    if missing:
        raise RuntimeError(
            f"Migration b4d6f8a0c2e4: cannot proceed — the following role(s) "
            f"were not found in the roles table: {sorted(missing)}."
        )

    permission_ids: dict[tuple[str, str], uuid.UUID] = {}
    for resource, action, description in SEED_PERMISSIONS:
        existing = bind.execute(
            sa.select(_permissions_t.c.id).where(
                _permissions_t.c.resource == resource, _permissions_t.c.action == action
            )
        ).first()
        if existing:
            permission_ids[(resource, action)] = existing[0]
        else:
            new_id = uuid.uuid4()
            bind.execute(
                _permissions_t.insert().values(
                    id=new_id, resource=resource, action=action, description=description
                )
            )
            permission_ids[(resource, action)] = new_id

    for key, role_names in SEED_GRANTS.items():
        permission_id = permission_ids[key]
        for role_name in role_names:
            role_id = role_ids[role_name]
            existing = bind.execute(
                sa.select(_role_permissions_t.c.role_id).where(
                    _role_permissions_t.c.role_id == role_id,
                    _role_permissions_t.c.permission_id == permission_id,
                )
            ).first()
            if not existing:
                bind.execute(
                    _role_permissions_t.insert().values(role_id=role_id, permission_id=permission_id)
                )


def downgrade() -> None:
    bind = op.get_bind()
    for resource, action, _ in SEED_PERMISSIONS:
        row = bind.execute(
            sa.select(_permissions_t.c.id).where(
                _permissions_t.c.resource == resource, _permissions_t.c.action == action
            )
        ).first()
        if row:
            bind.execute(_role_permissions_t.delete().where(_role_permissions_t.c.permission_id == row[0]))
            bind.execute(_permissions_t.delete().where(_permissions_t.c.id == row[0]))
