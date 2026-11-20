"""
Approver resolution —, shared by Requests
and Leave so both resolve approvers with one implementation.

An approval step is either assigned to a specific person (a manager step:
`approver_id` = the requester's own manager) or to a role queue (`approver_id`
is null; any active holder of the role may act, first to act wins).
"""
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.models.auth import SIGN_IN_STATUSES
from app.core.role_policy import user_holds_role_ids
from app.core.security import CurrentUser
from app.models.auth import Role, User, UserStatus
from app.models.requests import ApprovalStatus, Request, RequestApproval, RequestStatus
from app.models.system import Notification, NotificationChannel


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
    """Who approves a single-step request (leave): (approver_id, approver_role_id).
    The requester's manager when they have one, otherwise the shared role queue."""
    manager = requester.manager if requester.manager_id else None
    if manager is not None and manager.status in SIGN_IN_STATUSES:
        return manager.id, None
    return None, queue_role_id  # no manager, or one who has left or been deactivated


def can_act_on_step(
    current_user: CurrentUser, approver_id: Optional[uuid.UUID], approver_role_id: Optional[uuid.UUID]
) -> bool:
    """Whether the caller is the assigned person, or (for a queue step) holds the queue role."""
    if approver_id is not None:
        return approver_id == current_user.user_id
    return current_user.holds_role_id(approver_role_id)


def reroute_pending_steps(db: Session, user_id: uuid.UUID) -> int:
    """When someone can no longer act (deactivated, leaving, left), request steps
    waiting on them personally — manager steps — move to the HR admin queue so
    the request isn't stuck (B11). The HR admins are told. Returns how many
    moved. The caller commits."""
    hr_role = db.query(Role).filter(Role.name == "hr_admin").first()
    if hr_role is None:
        return 0
    steps = (
        db.query(RequestApproval)
        .join(Request, Request.id == RequestApproval.request_id)
        .filter(
            RequestApproval.approver_id == user_id,
            RequestApproval.status == ApprovalStatus.pending,
            Request.status == RequestStatus.pending,
        )
        .all()
    )
    for step in steps:
        step.approver_id = None
        step.approver_role_id = hr_role.id
        step.comments = "Moved to HR: the assigned manager can no longer approve"
        if step.request.current_step == step.step_order:
            for recipient in step_recipient_ids(db, None, hr_role.id, step.request.requester_id):
                db.add(
                    Notification(
                        id=uuid.uuid4(),
                        user_id=recipient,
                        type="approval_needed",
                        title="Request moved to you",
                        message=f"'{step.request.title}' was waiting on a manager who can no longer approve it.",
                        related_entity_type="request",
                        related_entity_id=step.request_id,
                        channel=NotificationChannel.in_app,
                        is_critical=False,
                    )
                )
    return len(steps)
