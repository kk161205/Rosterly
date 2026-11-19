"""departments are editable; people are added through onboarding

Permissions:
- add (department, create|update|delete) -> hr_admin, super_admin.
- remove (user, create): POST /users is gone; new people are added with
  POST /onboarding/new-joiner, which checks (employee, create).

Downgrade reverses both.

Revision ID: a4c6e8f0b2d3
Revises: f2b4d6e8a0c1
Create Date: 2026-11-19 20:00:00.000000

"""
import uuid

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a4c6e8f0b2d3"
down_revision = "f2b4d6e8a0c1"
branch_labels = None
depends_on = None

DEPARTMENT_PERMISSIONS = [
    ("department", "create", "Add a department"),
    ("department", "update", "Rename a department or set its head"),
    ("department", "delete", "Delete an empty department"),
]
EDITORS = ["hr_admin", "super_admin"]
USER_CREATE = ("user", "create", "Create / invite new user account")


def _role_ids(bind) -> dict[str, str]:
    return {name: str(rid) for rid, name in bind.execute(sa.text("SELECT id, name FROM roles")).fetchall()}


def _grant(bind, resource: str, action: str, description: str, roles: list[str]) -> None:
    ids = _role_ids(bind)
    row = bind.execute(
        sa.text("SELECT id FROM permissions WHERE resource = :r AND action = :a"), {"r": resource, "a": action}
    ).first()
    pid = str(row[0]) if row else str(uuid.uuid4())
    if not row:
        bind.execute(
            sa.text("INSERT INTO permissions (id, resource, action, description) VALUES (:id, :r, :a, :d)"),
            {"id": pid, "r": resource, "a": action, "d": description},
        )
    for name in roles:
        if name not in ids:
            continue
        exists = bind.execute(
            sa.text("SELECT 1 FROM role_permissions WHERE role_id = :rid AND permission_id = :pid"),
            {"rid": ids[name], "pid": pid},
        ).first()
        if not exists:
            bind.execute(
                sa.text("INSERT INTO role_permissions (role_id, permission_id) VALUES (:rid, :pid)"),
                {"rid": ids[name], "pid": pid},
            )


def _remove(bind, resource: str, action: str) -> None:
    params = {"r": resource, "a": action}
    bind.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE permission_id IN "
            "(SELECT id FROM permissions WHERE resource = :r AND action = :a)"
        ),
        params,
    )
    bind.execute(sa.text("DELETE FROM permissions WHERE resource = :r AND action = :a"), params)


def upgrade() -> None:
    bind = op.get_bind()
    for resource, action, description in DEPARTMENT_PERMISSIONS:
        _grant(bind, resource, action, description, EDITORS)
    _remove(bind, USER_CREATE[0], USER_CREATE[1])


def downgrade() -> None:
    bind = op.get_bind()
    for resource, action, _ in DEPARTMENT_PERMISSIONS:
        _remove(bind, resource, action)
    _grant(bind, *USER_CREATE, EDITORS)
