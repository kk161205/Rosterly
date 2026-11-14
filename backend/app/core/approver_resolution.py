"""
Approver resolution — project doc §7 rule 10, shared by Requests (§5.11/§5.12)
and Leave (§5.20) so both resolve approvers with one implementation.

An approval step is either assigned to a specific person (a manager step:
`approver_id` = the requester's own manager) or to a role queue (`approver_id`
is null; any active holder of the role may act, first to act wins).
"""
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.core.role_policy import user_holds_role_ids
from app.core.security import CurrentUser
from app.models.auth import User, UserStatus


def step_recipient_ids(
    db: Session,
    approver_id: Optional[uuid.UUID],
    approver_role_id: Optional[uuid.UUID],
    exclude_user_id: uuid.UUID,
) -> list[uuid.UUID]:
    """Who should be told a step is waiting: its assigned person, or every active
    member of its role queue. `exclude_user_id` (the requester) is never included —
    nobody is notified about, or acts on, their own request."""
    if approver_id:
        return [approver_id] if approver_id != exclude_user_id else []
    if approver_role_id:
        return [
            u.id
            for u in db.query(User)
            .filter(
                user_holds_role_ids([approver_role_id]),
                User.status == UserStatus.active,
                User.id != exclude_user_id,
            )
            .all()
        ]
    return []


def resolve_manager_or_queue(
    requester: User, queue_role_id: Optional[uuid.UUID]
) -> tuple[Optional[uuid.UUID], Optional[uuid.UUID]]:
    """§7 rule 10 for a single-step approval: (approver_id, approver_role_id).
    The requester's manager when they have one, otherwise the shared role queue."""
    if requester.manager_id:
        return requester.manager_id, None
    return None, queue_role_id


def can_act_on_step(
    current_user: CurrentUser, approver_id: Optional[uuid.UUID], approver_role_id: Optional[uuid.UUID]
) -> bool:
    """Whether the caller is the assigned person, or (for a queue step) holds the queue role."""
    if approver_id is not None:
        return approver_id == current_user.user_id
    return current_user.holds_role_id(approver_role_id)
