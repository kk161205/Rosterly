"""
Who sees how much — one explicit rule per area (step 3).

Rosterly has a fixed set of six roles, so every scoping rule names the
roles that see the whole company. Everything else falls back to "department"
for a manager and "self" for everyone. A role that isn't listed never gains
company-wide access by default.

Multi-role: the widest scope among the caller's roles wins.
"""
from typing import Literal

from app.core.security import CurrentUser

Scope = Literal["all", "department", "self"]

# Roles that see every employee's record in each area.
COMPANY_WIDE: dict[str, frozenset[str]] = {
    # profile (Overview tab) — IT admins manage devices, not people records.
    "profile": frozenset({"super_admin", "hr_admin", "auditor"}),
    # assigned hardware tab.
    "employee_assets": frozenset({"super_admin", "hr_admin", "it_admin", "auditor"}),
    # onboarding/offboarding progress tab.
    "lifecycle": frozenset({"super_admin", "hr_admin", "it_admin", "auditor"}),
}

# Document vault: HR and super admins manage every document;
# auditors may read everyone's non-confidential documents; everyone manages
# their own. Managers and IT admins get nothing extra.
DOCUMENT_MANAGERS = frozenset({"super_admin", "hr_admin"})
DOCUMENT_READERS_NON_CONFIDENTIAL = frozenset({"auditor"})


def scope_for(current_user: CurrentUser, area: str) -> Scope:
    """The caller's widest scope for `area`: all, department (manager) or self."""
    if current_user.has_role(*COMPANY_WIDE[area]):
        return "all"
    if current_user.has_role("manager"):
        return "department"
    return "self"


def can_manage_all_documents(current_user: CurrentUser) -> bool:
    return current_user.has_role(*DOCUMENT_MANAGERS)


def can_read_non_confidential_documents(current_user: CurrentUser) -> bool:
    return current_user.has_role(*DOCUMENT_READERS_NON_CONFIDENTIAL)
