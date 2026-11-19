"""Explicit per-area scope rules (app/core/access_scope.py), including multi-role."""
import uuid

import pytest

from app.core.access_scope import (
    can_manage_all_documents,
    can_read_non_confidential_documents,
    scope_for,
)
from app.core.security import CurrentUser


def user(*roles: str) -> CurrentUser:
    primary, *extra = roles
    return CurrentUser(user_id=uuid.uuid4(), role=primary, session_id=uuid.uuid4(), role_names=extra)


@pytest.mark.parametrize(
    ("roles", "area", "expected"),
    [
        (("employee",), "profile", "self"),
        (("manager",), "profile", "department"),
        (("hr_admin",), "profile", "all"),
        (("auditor",), "profile", "all"),
        (("super_admin",), "profile", "all"),
        # IT admins manage devices, not people records.
        (("it_admin",), "profile", "self"),
        (("it_admin",), "employee_assets", "all"),
        (("it_admin",), "lifecycle", "all"),
        (("manager",), "employee_assets", "department"),
        (("employee",), "lifecycle", "self"),
        # Multi-role: the widest scope wins, a narrow role never takes access away.
        (("manager", "hr_admin"), "profile", "all"),
        (("employee", "manager"), "profile", "department"),
        (("it_admin", "manager"), "profile", "department"),
        # Unknown names (e.g. a leftover custom role) never gain company-wide access.
        (("employee", "facilities"), "profile", "self"),
        (("facilities",), "employee_assets", "self"),
    ],
)
def test_scope_for(roles, area, expected):
    assert scope_for(user(*roles), area) == expected


@pytest.mark.parametrize(
    ("roles", "manage_all", "read_non_confidential"),
    [
        (("employee",), False, False),
        (("manager",), False, False),
        (("it_admin",), False, False),
        (("auditor",), False, True),
        (("hr_admin",), True, False),
        (("super_admin",), True, False),
        (("manager", "hr_admin"), True, False),
        (("employee", "facilities"), False, False),
    ],
)
def test_document_access(roles, manage_all, read_non_confidential):
    cu = user(*roles)
    assert can_manage_all_documents(cu) is manage_all
    assert can_read_non_confidential_documents(cu) is read_non_confidential
