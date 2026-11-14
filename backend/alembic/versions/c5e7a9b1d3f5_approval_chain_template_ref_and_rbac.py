"""requests.approval_chain_template_id + RBAC for approval chains and licenses (§5.18, §5.19)

Schema:
- requests.approval_chain_template_id: nullable FK -> approval_chain_templates.id
  (ON DELETE SET NULL), indexed. Set at request creation so a template can't be
  deleted while a pending request was routed through it. Existing rows stay null.

Permissions (idempotent):
- (approval_chain, read|create|update|delete)  -> super_admin
- (software_license, read)                     -> it_admin, super_admin, auditor
- (software_license, create|update)            -> it_admin, super_admin

Downgrade removes only what this revision adds.

Revision ID: c5e7a9b1d3f5
Revises: b4d6f8a0c2e4
Create Date: 2026-11-14 12:00:00.000000

"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import column, table

# revision identifiers, used by Alembic.
revision = "c5e7a9b1d3f5"
down_revision = "b4d6f8a0c2e4"
branch_labels = None
depends_on = None

FK_NAME = "fk_requests_approval_chain_template_id"
IX_NAME = "ix_requests_approval_chain_template_id"

SEED_PERMISSIONS = [
    ("approval_chain", "read", "View approval chain templates (§5.18)"),
    ("approval_chain", "create", "Create approval chain templates (§5.18)"),
    ("approval_chain", "update", "Edit approval chain templates (§5.18)"),
    ("approval_chain", "delete", "Delete approval chain templates (§5.18)"),
    ("software_license", "read", "View software licenses and seat holders (§5.19)"),
    ("software_license", "create", "Add software licenses (§5.19)"),
    ("software_license", "update", "Edit software licenses (§5.19)"),
]

SEED_GRANTS = {
    ("approval_chain", "read"): ["super_admin"],
    ("approval_chain", "create"): ["super_admin"],
    ("approval_chain", "update"): ["super_admin"],
    ("approval_chain", "delete"): ["super_admin"],
    ("software_license", "read"): ["super_admin", "it_admin", "auditor"],
    ("software_license", "create"): ["super_admin", "it_admin"],
    ("software_license", "update"): ["super_admin", "it_admin"],
}

_REQUIRED_ROLES = {"super_admin", "it_admin", "auditor"}

_roles_t = table("roles", column("id", postgresql.UUID(as_uuid=True)), column("name", sa.String))
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
        name: rid for rid, name in bind.execute(sa.select(_roles_t.c.id, _roles_t.c.name)).fetchall()
    }
    missing = _REQUIRED_ROLES - role_ids.keys()
    if missing:
        raise RuntimeError(
            f"Migration c5e7a9b1d3f5: cannot proceed — the following role(s) "
            f"were not found in the roles table: {sorted(missing)}."
        )

    op.add_column("requests", sa.Column("approval_chain_template_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        FK_NAME, "requests", "approval_chain_templates", ["approval_chain_template_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index(IX_NAME, "requests", ["approval_chain_template_id"])

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
                _permissions_t.insert().values(id=new_id, resource=resource, action=action, description=description)
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
                bind.execute(_role_permissions_t.insert().values(role_id=role_id, permission_id=permission_id))


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

    op.drop_index(IX_NAME, table_name="requests")
    op.drop_constraint(FK_NAME, "requests", type_="foreignkey")
    op.drop_column("requests", "approval_chain_template_id")
