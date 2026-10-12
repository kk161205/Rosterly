"""update request_approvals role queue, seed default chains and permissions

Revision ID: a2c4e6f8b0d1
Revises: f5a7b9c1d3e6
Create Date: 2026-10-12 12:00:00.000000

"""
import uuid
from decimal import Decimal

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import column, select, table

# revision identifiers, used by Alembic.
revision = 'a2c4e6f8b0d1'
down_revision = 'f5a7b9c1d3e6'
branch_labels = None
depends_on = None

_REQUIRED_ROLES = {"super_admin", "it_admin", "hr_admin", "manager", "employee", "auditor"}

SEED_PERMISSIONS = [
    ("request", "create", "Submit a new request in the portal (§5.11)"),
    ("request", "read", "View own requests or assigned/audit requests (§5.11)"),
    ("request", "update", "Cancel an active pending request (§5.11)"),
    ("request", "approve", "Access approvals queue and approve/reject requests (§5.12)"),
]

SEED_GRANTS = {
    ("request", "create"): ["employee", "manager", "hr_admin", "it_admin", "super_admin", "auditor"],
    ("request", "read"): ["employee", "manager", "hr_admin", "it_admin", "super_admin", "auditor"],
    ("request", "update"): ["employee", "manager", "hr_admin", "it_admin", "super_admin", "auditor"],
    ("request", "approve"): ["manager", "hr_admin", "it_admin", "super_admin"],
}

DEFAULT_CHAINS = [
    {
        "name": "Standard Asset Request",
        "request_type": "asset_request",
        "min_amount": None,
        "steps": ["manager", "it_admin"],
    },
    {
        "name": "High-Value Asset Procurement",
        "request_type": "asset_request",
        "min_amount": Decimal("1000.00"),
        "steps": ["manager", "it_admin", "super_admin"],
    },
    {
        "name": "Standard Access Request",
        "request_type": "access_request",
        "min_amount": None,
        "steps": ["manager", "it_admin"],
    },
    {
        "name": "Standard IT Ticket",
        "request_type": "it_ticket",
        "min_amount": None,
        "steps": ["it_admin"],
    },
    {
        "name": "General Request",
        "request_type": "other",
        "min_amount": None,
        "steps": ["manager", "hr_admin"],
    },
]


def upgrade() -> None:
    # 1. Schema adjustments to request_approvals
    op.alter_column('request_approvals', 'approver_id', nullable=True)
    op.add_column('request_approvals', sa.Column('approver_role_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_request_approvals_approver_role_id_roles',
        'request_approvals',
        'roles',
        ['approver_role_id'],
        ['id'],
        ondelete='RESTRICT',
    )

    bind = op.get_bind()

    # Tables for idempotent seeds
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
    templates_t = table(
        "approval_chain_templates",
        column("id", postgresql.UUID(as_uuid=True)),
        column("request_type", sa.String),
        column("name", sa.String),
        column("min_amount", sa.Numeric(12, 2)),
        column("is_active", sa.Boolean),
    )
    steps_t = table(
        "approval_chain_steps",
        column("id", postgresql.UUID(as_uuid=True)),
        column("template_id", postgresql.UUID(as_uuid=True)),
        column("step_order", sa.Integer),
        column("approver_role_id", postgresql.UUID(as_uuid=True)),
    )

    # 2. Check roles
    role_rows = bind.execute(select(roles_t.c.id, roles_t.c.name)).fetchall()
    role_map = {row.name: row.id for row in role_rows}
    missing_roles = _REQUIRED_ROLES - set(role_map.keys())
    if missing_roles:
        raise RuntimeError(f"Missing required seeded roles: {missing_roles}")

    # 3. Seed Permissions & Role Permissions idempotently
    perm_rows = bind.execute(select(permissions_t.c.id, permissions_t.c.resource, permissions_t.c.action)).fetchall()
    perm_map = {(row.resource, row.action): row.id for row in perm_rows}

    for resource, action, description in SEED_PERMISSIONS:
        if (resource, action) not in perm_map:
            perm_id = uuid.uuid4()
            bind.execute(
                permissions_t.insert().values(
                    id=perm_id,
                    resource=resource,
                    action=action,
                    description=description,
                )
            )
            perm_map[(resource, action)] = perm_id

    existing_grants = {
        (row[0], row[1])
        for row in bind.execute(select(role_permissions_t.c.role_id, role_permissions_t.c.permission_id)).fetchall()
    }

    for (resource, action), role_names in SEED_GRANTS.items():
        p_id = perm_map[(resource, action)]
        for r_name in role_names:
            r_id = role_map[r_name]
            if (r_id, p_id) not in existing_grants:
                bind.execute(
                    role_permissions_t.insert().values(
                        role_id=r_id,
                        permission_id=p_id,
                    )
                )
                existing_grants.add((r_id, p_id))

    # 4. Seed Default Approval Chain Templates & Steps idempotently
    existing_templates = bind.execute(select(templates_t.c.name, templates_t.c.request_type)).fetchall()
    existing_template_keys = {(row.name, row.request_type) for row in existing_templates}

    for chain in DEFAULT_CHAINS:
        key = (chain["name"], chain["request_type"])
        if key not in existing_template_keys:
            template_id = uuid.uuid4()
            bind.execute(
                templates_t.insert().values(
                    id=template_id,
                    request_type=chain["request_type"],
                    name=chain["name"],
                    min_amount=chain["min_amount"],
                    is_active=True,
                )
            )
            for order, role_name in enumerate(chain["steps"], start=1):
                bind.execute(
                    steps_t.insert().values(
                        id=uuid.uuid4(),
                        template_id=template_id,
                        step_order=order,
                        approver_role_id=role_map[role_name],
                    )
                )


def downgrade() -> None:
    bind = op.get_bind()

    # Clean up seeded chains: delete steps first, then templates
    for chain in DEFAULT_CHAINS:
        bind.execute(
            sa.text(
                "DELETE FROM approval_chain_steps WHERE template_id IN ("
                "SELECT id FROM approval_chain_templates WHERE name = :name AND request_type = :req_type)"
            ),
            {"name": chain["name"], "req_type": chain["request_type"]},
        )
        bind.execute(
            sa.text("DELETE FROM approval_chain_templates WHERE name = :name AND request_type = :req_type"),
            {"name": chain["name"], "req_type": chain["request_type"]},
        )

    # Clean up seeded permissions
    for resource, action, _ in SEED_PERMISSIONS:
        bind.execute(
            sa.text(
                "DELETE FROM role_permissions WHERE permission_id IN ("
                "SELECT id FROM permissions WHERE resource = :resource AND action = :action)"
            ),
            {"resource": resource, "action": action},
        )
        bind.execute(
            sa.text("DELETE FROM permissions WHERE resource = :resource AND action = :action"),
            {"resource": resource, "action": action},
        )

    # Downgrade safety: abort if any pending approval has NULL approver_id; otherwise delete NULL rows
    pending_null_count = bind.execute(
        sa.text("SELECT COUNT(*) FROM request_approvals WHERE approver_id IS NULL AND status = 'pending'")
    ).scalar()
    if pending_null_count and pending_null_count > 0:
        raise RuntimeError(
            f"Cannot downgrade migration: found {pending_null_count} pending request approval(s) "
            "with NULL approver_id. Resolve or reassign pending approvals before downgrading."
        )

    bind.execute(sa.text("DELETE FROM request_approvals WHERE approver_id IS NULL"))

    op.drop_constraint('fk_request_approvals_approver_role_id_roles', 'request_approvals', type_='foreignkey')
    op.drop_column('request_approvals', 'approver_role_id')
    op.alter_column('request_approvals', 'approver_id', nullable=False)

