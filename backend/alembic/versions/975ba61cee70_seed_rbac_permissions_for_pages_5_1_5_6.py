"""seed RBAC permissions/role_permissions for pages 5.1-5.6

Backs the app/core/security.py check_permission() helper introduced to
replace the hardcoded `current_user.role in (...)` string checks that used
to live in app/services/{auth,dashboard,employee_directory,employee_profile,
onboarding,offboarding}_service.py (project doc §3.2 step 2, rules.md §1.2).

Seeds exactly the (resource, action) permissions and role grants needed so
that the *effective* allowed-roles set for every route touched by this
refactor is identical to what the hardcoded checks previously allowed:

    (employee, delete)  -> super_admin
        DELETE /employees/{id}                         (§5.3)
    (employee, read)    -> employee, manager, hr_admin, super_admin, auditor
        GET /employees/{id}                             (§5.4, minus it_admin)
    (employee, update)  -> hr_admin, super_admin
        PATCH /employees/{id} when editing someone else (§5.4)
    (employee, create)  -> hr_admin, super_admin
        POST /onboarding, POST /offboarding              (§5.5, §5.6 — checklists
        are treated as an `employee` lifecycle sub-resource per schema §1.14
        rather than inventing a `checklist` resource)
    (employee, approve) -> hr_admin, super_admin
        POST /offboarding/{id}/complete                  (§5.6 — final sign-off/
        termination action, kept distinct from the "update" grant above which
        covers ordinary profile field edits by the same two roles)

Several other hardcoded role checks in the same six service files were
deliberately NOT ported here because doing so would change effective
behavior (their allowed-role sets collide with one of the grants above under
the same (resource, action) pair) or because they are attribute/ABAC checks,
not static role grants — see the inline comments left at each call site in
the service files, and the task's final report, for the full reasoning.

Also seeds the 6 roles from project doc §3.1 (idempotently, matched by
`name`) since role_permissions rows need a real roles.id to reference and
no prior migration seeds them.

Revision ID: 975ba61cee70
Revises: a1b2c3d4e5f6
Create Date: 2026-09-02 00:00:00.000000

"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import table, column

# revision identifiers, used by Alembic.
revision = '975ba61cee70'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


# project doc §3.1 seed roles
SEED_ROLES = [
    ("super_admin", "Full system access, including role/permission configuration"),
    ("it_admin", "Full asset management, maintenance, provisioning"),
    ("hr_admin", "Full employee management, onboarding/offboarding, document vault"),
    ("manager", "Department-scoped (attribute filter: department_id match or manager_id chain) view + approval rights"),
    ("employee", "Self-scoped only"),
    ("auditor", "Read-only, system-wide, including audit_logs"),
]

# (resource, action, description)
SEED_PERMISSIONS = [
    ("employee", "delete", "Delete/soft-delete an employee account (§5.3)"),
    ("employee", "read", "View another employee's full profile record (§5.4)"),
    ("employee", "update", "Edit another employee's HR-controlled profile fields (§5.4)"),
    ("employee", "create", "Create an onboarding or offboarding checklist for an employee (§5.5/§5.6)"),
    ("employee", "approve", "Complete/finalize an offboarding checklist, terminating the employee (§5.6)"),
]

# (resource, action) -> [role names]
SEED_GRANTS = {
    ("employee", "delete"): ["super_admin"],
    ("employee", "read"): ["employee", "manager", "hr_admin", "super_admin", "auditor"],
    ("employee", "update"): ["hr_admin", "super_admin"],
    ("employee", "create"): ["hr_admin", "super_admin"],
    ("employee", "approve"): ["hr_admin", "super_admin"],
}


def upgrade() -> None:
    bind = op.get_bind()

    roles_t = table(
        "roles",
        column("id", postgresql.UUID(as_uuid=True)),
        column("name", sa.String),
        column("description", sa.Text),
        column("is_system_role", sa.Boolean),
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

    # 1. Roles — idempotent by name (no prior migration seeds this table).
    role_ids: dict[str, uuid.UUID] = {}
    for name, description in SEED_ROLES:
        existing = bind.execute(
            sa.select(roles_t.c.id).where(roles_t.c.name == name)
        ).first()
        if existing:
            role_ids[name] = existing[0]
        else:
            new_id = uuid.uuid4()
            bind.execute(
                roles_t.insert().values(
                    id=new_id, name=name, description=description, is_system_role=True
                )
            )
            role_ids[name] = new_id

    # 2. Permissions — idempotent by (resource, action); no unique constraint
    # exists on the pair, so check-then-insert explicitly.
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

    # 3. Role <-> Permission grants — idempotent (composite PK, check first).
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
    # for the seeded (resource, action) pairs, then the permission rows
    # themselves. Roles are intentionally left in place: they are a shared,
    # foundational table that other data (users.role_id, etc.) may already
    # reference, and this migration only seeded them defensively.
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
