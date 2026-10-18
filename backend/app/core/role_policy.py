"""
Privileged-role policy (project doc §5.14, applied to every role-changing path).

Only a super_admin may grant a privileged role, or change the role/status of a
user who holds one. hr_admin can manage everyone else. This single rule is
shared by User Management (§5.14: POST /users, PATCH /users/{id}/status) and
the Employee Profile edit (§5.4: PATCH /employees/{id} role_id/status), so the
two paths can never drift apart and HR can't use one to bypass the other.
"""
from collections.abc import Iterable

from sqlalchemy import ColumnElement, Select, or_, select

from app.core.errors import ForbiddenError, ValidationAppError
from app.core.security import CurrentUser
from app.models.auth import Role, RoleConflict, User, UserRole

PRIVILEGED_ROLES = frozenset({"super_admin", "it_admin"})


def is_super_admin(current_user: CurrentUser) -> bool:
    """Holds super_admin as primary or additional role (§5.14 multi-role)."""
    return current_user.has_role("super_admin")


def assert_can_assign_role(current_user: CurrentUser, target_role_name: str) -> None:
    """Rejects granting super_admin/it_admin unless the caller is super_admin.
    Applies to primary and additional roles alike."""
    if not is_super_admin(current_user) and (target_role_name or "").lower() in PRIVILEGED_ROLES:
        raise ForbiddenError(f"You do not have permission to assign the '{target_role_name}' role.")


def assert_can_manage_user(current_user: CurrentUser, target_role_names: str | Iterable[str]) -> None:
    """Rejects changing the roles or status of a user who holds super_admin or
    it_admin (as any of their roles) unless the caller is super_admin."""
    names = [target_role_names] if isinstance(target_role_names, str) else list(target_role_names)
    held = {(n or "").lower() for n in names}
    privileged = sorted(held & PRIVILEGED_ROLES)
    if not is_super_admin(current_user) and privileged:
        raise ForbiddenError(f"You do not have permission to modify {privileged[0]} users.")


def user_role_names(user) -> list[str]:
    """Every role a User row holds — primary plus additional."""
    names = [user.role.name] if getattr(user, "role", None) else []
    return names + [r.name for r in (getattr(user, "additional_roles", None) or [])]



def user_holds_role_ids(role_ids: Iterable | Select) -> ColumnElement[bool]:
    """SQL filter: the User holds any of `role_ids` (a list or a SELECT of ids)
    as primary or additional role."""
    ids = role_ids if isinstance(role_ids, Select) else list(role_ids)
    return or_(User.role_id.in_(ids), User.id.in_(select(UserRole.user_id).where(UserRole.role_id.in_(ids))))


def user_holds_role_names(names: Iterable[str]) -> ColumnElement[bool]:
    """SQL filter: the User holds any role named in `names` as primary or additional role."""
    return user_holds_role_ids(select(Role.id).where(Role.name.in_(list(names))))


# Roles that may only ever be a PRIMARY role (§5.14 multi-role): super_admin
# already holds everything, so combining it only hides who has full access;
# employee is the baseline everyone has.
PRIMARY_ONLY_ROLES = frozenset({"super_admin", "employee"})


def conflicting_pairs(db, roles: list) -> list[tuple]:
    """Pairs of Role rows in `roles` that role_conflicts says one person may not hold together."""
    ids = [r.id for r in roles]
    if len(ids) < 2:
        return []
    rows = (
        db.query(RoleConflict)
        .filter(RoleConflict.role_id.in_(ids), RoleConflict.conflicts_with_role_id.in_(ids))
        .all()
    )
    by_id = {r.id: r for r in roles}
    return [(by_id[c.role_id], by_id[c.conflicts_with_role_id]) for c in rows]


def validate_role_set(db, current_user: CurrentUser, primary, additional: list) -> list:
    """The one rule for any set of roles a user is given (§5.14), shared by
    User Management and the Employee Profile edit. Returns the additional
    roles to store: de-duplicated, without the primary role.

    - only super_admin may grant super_admin / it_admin, primary or additional;
    - super_admin and employee can only be a primary role;
    - a super_admin primary takes no additional roles;
    - no two roles may be a configured conflict (e.g. auditor + it_admin).
    """
    extra = []
    seen = {primary.id}
    for role in additional:
        if role.id not in seen:
            seen.add(role.id)
            extra.append(role)

    for role in [primary, *extra]:
        assert_can_assign_role(current_user, role.name)

    primary_only = [r.name for r in extra if r.name.lower() in PRIMARY_ONLY_ROLES]
    if primary_only:
        raise ValidationAppError(
            f"'{primary_only[0]}' can only be a primary role.",
            field_errors={"additional_role_ids": f"'{primary_only[0]}' can only be a primary role."},
        )
    if primary.name.lower() == "super_admin" and extra:
        raise ValidationAppError(
            "A super admin already has every permission, so it takes no additional roles.",
            field_errors={"additional_role_ids": "A super admin takes no additional roles."},
        )

    clashes = conflicting_pairs(db, [primary, *extra])
    if clashes:
        a, b = clashes[0]
        message = f"'{a.name}' and '{b.name}' can't be held by the same person."
        raise ValidationAppError(message, field_errors={"additional_role_ids": message})
    return extra


def set_additional_roles(db, user, roles: list, assigned_by) -> None:
    """Replace a user's additional roles with `roles` (already validated)."""
    wanted = {r.id for r in roles}
    current = {ur.role_id: ur for ur in db.query(UserRole).filter(UserRole.user_id == user.id).all()}
    for role_id, row in current.items():
        if role_id not in wanted:
            db.delete(row)
    for role_id in wanted - current.keys():
        db.add(UserRole(user_id=user.id, role_id=role_id, assigned_by=assigned_by))
