"""who reads users and roles: auditors yes, managers and IT admins no

The Users list (emails, roles, last active) is an HR and super-admin tool;
managers use the Directory. Auditors review access, so they read users and
roles too. Databases seeded by hand before the RBAC migrations also gave
manager and it_admin user:read; this removes those grants so every database
ends up with the same grid.

Revision ID: d4f6a8b0c2e5
Revises: c3e5a7b9d1f3
Create Date: 2026-11-22 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'd4f6a8b0c2e5'
down_revision = 'c3e5a7b9d1f3'
branch_labels = None
depends_on = None

GRANT = [("auditor", "user", "read"), ("auditor", "role", "read")]
REVOKE = [("manager", "user", "read"), ("it_admin", "user", "read")]


def _grant(bind, role: str, resource: str, action: str) -> None:
    bind.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r, permissions p "
            "WHERE r.name = :role AND p.resource = :resource AND p.action = :action "
            "AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id)"
        ),
        {"role": role, "resource": resource, "action": action},
    )


def _revoke(bind, role: str, resource: str, action: str) -> None:
    bind.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE "
            "role_id = (SELECT id FROM roles WHERE name = :role) AND "
            "permission_id = (SELECT id FROM permissions WHERE resource = :resource AND action = :action)"
        ),
        {"role": role, "resource": resource, "action": action},
    )


def upgrade() -> None:
    bind = op.get_bind()
    for grant in GRANT:
        _grant(bind, *grant)
    for revoke in REVOKE:
        _revoke(bind, *revoke)


def downgrade() -> None:
    # Back to the grid the earlier migrations seed (auditors without these two).
    bind = op.get_bind()
    for grant in GRANT:
        _revoke(bind, *grant)
