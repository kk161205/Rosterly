"""fixed roles: plain-language descriptions, no custom roles

Rosterly's six roles are fixed: they can't be
created, deleted or have their permissions edited from the app.

1. Plain-language descriptions for the six roles, shown on the Roles page.
2. Any role outside the six (custom roles made on a dev database) is folded
   away safely before it is deleted:
   - people holding it as primary role get `employee` as their primary role,
     and additional-role rows are removed;
   - approval chain steps and request approval steps routed to it move to the
     `super_admin` queue; checklist items owned by it move to `hr_admin`.
   On a fresh database this finds nothing.
3. Remove the (role, create) and (role, delete) permissions — no route checks
   them any more. (role, read) and (role, update) stay: the Roles page and
   role conflicts use them.

Downgrade restores the old descriptions and the two permissions (granted to
super_admin). Deleted custom roles can't be restored.

Revision ID: e7a9c1d3f5b8
Revises: d6f8b0c2e4a6
Create Date: 2026-11-19 16:00:00.000000

"""
import uuid

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e7a9c1d3f5b8"
down_revision = "d6f8b0c2e4a6"
branch_labels = None
depends_on = None

FIXED_ROLES = {
    "super_admin": "Runs Rosterly: sees and manages everything, including who holds which role.",
    "hr_admin": "Manages people: profiles and documents, onboarding, offboarding and leave. Doesn't manage equipment.",
    "it_admin": "Manages equipment: assets, licences, maintenance and QR check-in. Can't see HR documents.",
    "manager": "Leads a team: sees their department's people and equipment, and approves their team's requests and leave.",
    "employee": "Everyone's baseline: their own profile, equipment, requests, leave and documents.",
    "auditor": "Checks compliance: can read everything, including the audit log, but can't change anything.",
}

OLD_DESCRIPTIONS = {
    "super_admin": "Full system access, including role/permission configuration",
    "it_admin": "Full asset management, maintenance, provisioning",
    "hr_admin": "Full employee management, onboarding/offboarding, document vault",
    "manager": "Department-scoped (attribute filter: department_id match or manager_id chain) view + approval rights",
    "employee": "Self-scoped only",
    "auditor": "Read-only, system-wide, including audit_logs",
}

RETIRED_PERMISSIONS = [
    ("role", "create", "Create a custom role"),
    ("role", "delete", "Delete a custom non-system role"),
]


def _role_ids(bind) -> dict[str, str]:
    return {name: str(rid) for rid, name in bind.execute(sa.text("SELECT id, name FROM roles")).fetchall()}


def upgrade() -> None:
    bind = op.get_bind()
    ids = _role_ids(bind)
    missing = set(FIXED_ROLES) - ids.keys()
    if missing:
        raise RuntimeError(f"Migration e7a9c1d3f5b8: seed role(s) missing: {sorted(missing)}")

    for name, description in FIXED_ROLES.items():
        bind.execute(
            sa.text("UPDATE roles SET description = :d, is_system_role = true WHERE name = :n"),
            {"d": description, "n": name},
        )

    for name, rid in ids.items():
        if name in FIXED_ROLES:
            continue
        params = {"rid": rid}
        bind.execute(
            sa.text("UPDATE users SET role_id = :to WHERE role_id = :rid"), {**params, "to": ids["employee"]}
        )
        bind.execute(sa.text("DELETE FROM user_roles WHERE role_id = :rid"), params)
        bind.execute(
            sa.text("UPDATE approval_chain_steps SET approver_role_id = :to WHERE approver_role_id = :rid"),
            {**params, "to": ids["super_admin"]},
        )
        bind.execute(
            sa.text("UPDATE request_approvals SET approver_role_id = :to WHERE approver_role_id = :rid"),
            {**params, "to": ids["super_admin"]},
        )
        bind.execute(
            sa.text("UPDATE checklist_items SET owner_role_id = :to WHERE owner_role_id = :rid"),
            {**params, "to": ids["hr_admin"]},
        )
        bind.execute(
            sa.text("DELETE FROM role_conflicts WHERE role_id = :rid OR conflicts_with_role_id = :rid"), params
        )
        bind.execute(sa.text("DELETE FROM role_permissions WHERE role_id = :rid"), params)
        bind.execute(sa.text("DELETE FROM roles WHERE id = :rid"), params)

    for resource, action, _ in RETIRED_PERMISSIONS:
        perm = {"r": resource, "a": action}
        bind.execute(
            sa.text(
                "DELETE FROM role_permissions WHERE permission_id IN "
                "(SELECT id FROM permissions WHERE resource = :r AND action = :a)"
            ),
            perm,
        )
        bind.execute(sa.text("DELETE FROM permissions WHERE resource = :r AND action = :a"), perm)


def downgrade() -> None:
    bind = op.get_bind()
    ids = _role_ids(bind)
    for name, description in OLD_DESCRIPTIONS.items():
        bind.execute(sa.text("UPDATE roles SET description = :d WHERE name = :n"), {"d": description, "n": name})

    for resource, action, description in RETIRED_PERMISSIONS:
        exists = bind.execute(
            sa.text("SELECT id FROM permissions WHERE resource = :r AND action = :a"), {"r": resource, "a": action}
        ).first()
        if exists:
            continue
        pid = str(uuid.uuid4())
        bind.execute(
            sa.text("INSERT INTO permissions (id, resource, action, description) VALUES (:id, :r, :a, :d)"),
            {"id": pid, "r": resource, "a": action, "d": description},
        )
        if "super_admin" in ids:
            bind.execute(
                sa.text("INSERT INTO role_permissions (role_id, permission_id) VALUES (:rid, :pid)"),
                {"rid": ids["super_admin"], "pid": pid},
            )
