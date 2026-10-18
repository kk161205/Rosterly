from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from collections.abc import Callable
from unittest.mock import MagicMock
import uuid

from fastapi.testclient import TestClient

from app.core.security import CurrentUser, get_current_user
from app.db.session import get_db
from app.main import app
from app.models.assets import Asset
from app.models.auth import Department, Role, RolePermission, User, UserStatus
from app.models.requests import (
    ApprovalChainStep,
    ApprovalChainTemplate,
    ApprovalStatus,
    Request,
    RequestApproval,
    RequestPriority,
    RequestStatus,
    RequestType,
)
from app.modules.dashboard.service import DashboardService

client = TestClient(app)

# Fixed test Role IDs
ROLE_SUPER_ADMIN_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
ROLE_IT_ADMIN_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")
ROLE_HR_ADMIN_ID = uuid.UUID("33333333-3333-3333-3333-333333333333")
ROLE_MANAGER_ID = uuid.UUID("44444444-4444-4444-4444-444444444444")
ROLE_EMPLOYEE_ID = uuid.UUID("55555555-5555-5555-5555-555555555555")
ROLE_AUDITOR_ID = uuid.UUID("66666666-6666-6666-6666-666666666666")

ROLES_MAP = {
    "super_admin": Role(id=ROLE_SUPER_ADMIN_ID, name="super_admin", is_system_role=True),
    "it_admin": Role(id=ROLE_IT_ADMIN_ID, name="it_admin", is_system_role=True),
    "hr_admin": Role(id=ROLE_HR_ADMIN_ID, name="hr_admin", is_system_role=True),
    "manager": Role(id=ROLE_MANAGER_ID, name="manager", is_system_role=True),
    "employee": Role(id=ROLE_EMPLOYEE_ID, name="employee", is_system_role=True),
    "auditor": Role(id=ROLE_AUDITOR_ID, name="auditor", is_system_role=True),
}

STANDARD_SEED_GRANTS = [
    # employee
    (ROLE_EMPLOYEE_ID, "request", "create"),
    (ROLE_EMPLOYEE_ID, "request", "read"),
    (ROLE_EMPLOYEE_ID, "request", "update"),
    # manager
    (ROLE_MANAGER_ID, "request", "create"),
    (ROLE_MANAGER_ID, "request", "read"),
    (ROLE_MANAGER_ID, "request", "update"),
    (ROLE_MANAGER_ID, "request", "approve"),
    # it_admin
    (ROLE_IT_ADMIN_ID, "request", "create"),
    (ROLE_IT_ADMIN_ID, "request", "read"),
    (ROLE_IT_ADMIN_ID, "request", "update"),
    (ROLE_IT_ADMIN_ID, "request", "approve"),
    # hr_admin
    (ROLE_HR_ADMIN_ID, "request", "create"),
    (ROLE_HR_ADMIN_ID, "request", "read"),
    (ROLE_HR_ADMIN_ID, "request", "update"),
    (ROLE_HR_ADMIN_ID, "request", "approve"),
    # super_admin
    (ROLE_SUPER_ADMIN_ID, "request", "create"),
    (ROLE_SUPER_ADMIN_ID, "request", "read"),
    (ROLE_SUPER_ADMIN_ID, "request", "update"),
    (ROLE_SUPER_ADMIN_ID, "request", "approve"),
    # auditor
    (ROLE_AUDITOR_ID, "request", "create"),
    (ROLE_AUDITOR_ID, "request", "read"),
    (ROLE_AUDITOR_ID, "request", "update"),
]


def create_rbac_mock_db(
    allowed_grants: list[tuple[uuid.UUID, str, str]] | None = None,
) -> tuple[MagicMock, Callable[[Any], MagicMock]]:
    mock_db = MagicMock()
    grants = set(allowed_grants if allowed_grants is not None else STANDARD_SEED_GRANTS)
    query_mocks: dict[Any, MagicMock] = {}

    def get_query_mock(entity=None):
        if entity not in query_mocks:
            q_mock = MagicMock()
            q_mock.options.return_value = q_mock
            q_mock.join.return_value = q_mock
            q_mock.filter.return_value = q_mock
            q_mock.order_by.return_value = q_mock
            q_mock.offset.return_value = q_mock
            q_mock.limit.return_value = q_mock
            q_mock.with_for_update.return_value = q_mock
            q_mock.first.return_value = None
            q_mock.all.return_value = []
            q_mock.count.return_value = 0
            q_mock.scalar.return_value = 0
            query_mocks[entity] = q_mock
        return query_mocks[entity]

    def query_dispatcher(*entities):
        entity = entities[0] if entities else None
        if entity is RolePermission:
            rp_query = MagicMock()
            rp_query.join.return_value = rp_query

            def rp_filter(*criteria):
                filter_mock = MagicMock()
                passed_vals = [
                    getattr(c.right, "value", None)
                    for c in criteria
                    if hasattr(c, "right")
                ]
                if len(passed_vals) >= 3 and any(
                    (rid, passed_vals[1], passed_vals[2]) in grants
                    for rid in (passed_vals[0] if isinstance(passed_vals[0], (list, tuple, set, frozenset)) else [passed_vals[0]])
                ):
                    filter_mock.first.return_value = RolePermission(
                        role_id=next(iter(passed_vals[0])) if isinstance(passed_vals[0], (list, tuple, set, frozenset)) else passed_vals[0],
                        permission_id=uuid.uuid4(),
                    )
                else:
                    filter_mock.first.return_value = None
                return filter_mock

            rp_query.filter.side_effect = rp_filter
            return rp_query

        if entity is Role:
            role_base = get_query_mock(Role)
            role_q = MagicMock()
            role_q.options.return_value = role_q
            role_q.first.side_effect = lambda: (
                role_base.first.return_value if role_base.first.return_value is not None else ROLES_MAP["manager"]
            )
            def role_filter(*criteria):
                fm = MagicMock()
                crit_str = " ".join(str(c) for c in criteria)
                matched = None
                for rname, robj in ROLES_MAP.items():
                    if f"'{rname}'" in crit_str or ":name_1" in crit_str and rname == "manager":
                        matched = robj
                        break
                default_res = matched or role_base.first.return_value or ROLES_MAP["manager"]
                fm.first.return_value = default_res
                return fm
            role_q.filter.side_effect = role_filter
            return role_q

        if entity is RequestApproval:
            ra_base = get_query_mock(RequestApproval)
            ra_q = MagicMock()
            def join_proxy(*a, **kw):
                ra_base.join(*a, **kw)
                return ra_q
            ra_q.options.return_value = ra_q
            ra_q.join.side_effect = join_proxy
            ra_q.order_by.return_value = ra_q
            ra_q.offset.return_value = ra_q
            ra_q.limit.return_value = ra_q
            ra_q.with_for_update.return_value = ra_q
            ra_q.count.side_effect = lambda: ra_base.count.return_value
            ra_q.scalar.side_effect = lambda: ra_base.scalar.return_value
            ra_q.all.side_effect = lambda: ra_base.all.return_value
            ra_q.first.side_effect = lambda: ra_base.first.return_value

            def ra_filter(*criteria):
                fm = MagicMock()
                fm.options.return_value = fm
                fm.join.return_value = fm
                fm.order_by.return_value = fm
                fm.offset.return_value = fm
                fm.limit.return_value = fm
                fm.with_for_update.return_value = fm
                fm.count.side_effect = lambda: ra_base.count.return_value
                fm.scalar.side_effect = lambda: ra_base.scalar.return_value

                crit_strs = [str(c) for c in criteria]
                has_greater = any(">" in s for s in crit_strs)
                has_step_order = any("step_order" in s for s in crit_strs)
                req_obj = query_mocks.get(Request, MagicMock()).first.return_value
                req_approvals = getattr(req_obj, "approvals", None) if req_obj else None

                if has_greater:
                    # Subsequent steps query (in reject_request)
                    if ra_base.all.return_value:
                        fm.all.side_effect = lambda: ra_base.all.return_value
                    elif req_approvals is not None:
                        curr_step = getattr(req_obj, "current_step", 1)
                        subseq = [s for s in req_approvals if getattr(s, "step_order", 0) > curr_step]
                        fm.all.return_value = subseq
                    else:
                        fm.all.side_effect = lambda: ra_base.all.return_value
                elif has_step_order:
                    # Current step query
                    if ra_base.first.return_value is not None:
                        fm.first.side_effect = lambda: ra_base.first.return_value
                    elif req_approvals is not None:
                        curr_step = getattr(req_obj, "current_step", 1)
                        match = next((s for s in req_approvals if getattr(s, "step_order", 0) == curr_step), None)
                        fm.first.return_value = match
                    else:
                        fm.first.side_effect = lambda: ra_base.first.return_value
                else:
                    # All steps query (request_id == req.id)
                    if req_approvals is not None:
                        fm.all.return_value = req_approvals
                    else:
                        fm.all.side_effect = lambda: ra_base.all.return_value
                return fm

            ra_q.filter.side_effect = ra_filter
            return ra_q

        return get_query_mock(entity)

    mock_db.query.side_effect = query_dispatcher
    return mock_db, get_query_mock


def create_mock_user(
    user_id: uuid.UUID | None = None,
    full_name: str = "Test User",
    email: str = "user@example.com",
    role_name: str = "employee",
    manager_id: uuid.UUID | None = None,
    dept_id: uuid.UUID | None = None,
) -> User:
    uid = user_id or uuid.uuid4()
    did = dept_id or uuid.uuid4()
    role_obj = ROLES_MAP.get(role_name, ROLES_MAP["employee"])

    dept = Department(id=did, name="Engineering", created_at=datetime.now(timezone.utc))
    user = User(
        id=uid,
        email=email,
        full_name=full_name,
        role_id=role_obj.id,
        role=role_obj,
        department_id=did,
        manager_id=manager_id,
        status=UserStatus.active,
        created_at=datetime.now(timezone.utc),
    )
    user.department = dept
    return user


def build_default_templates():
    # Standard Asset Template
    tpl_std_asset = ApprovalChainTemplate(
        id=uuid.uuid4(),
        request_type=RequestType.asset_request,
        name="Standard Asset Request",
        min_amount=None,
        is_active=True,
    )
    step1_std = ApprovalChainStep(
        id=uuid.uuid4(),
        template_id=tpl_std_asset.id,
        step_order=1,
        approver_role_id=ROLE_MANAGER_ID,
        approver_role=ROLES_MAP["manager"],
    )
    step2_std = ApprovalChainStep(
        id=uuid.uuid4(),
        template_id=tpl_std_asset.id,
        step_order=2,
        approver_role_id=ROLE_IT_ADMIN_ID,
        approver_role=ROLES_MAP["it_admin"],
    )
    tpl_std_asset.steps = [step1_std, step2_std]

    # High-Value Asset Template
    tpl_high_asset = ApprovalChainTemplate(
        id=uuid.uuid4(),
        request_type=RequestType.asset_request,
        name="High-Value Asset Procurement",
        min_amount=Decimal("1000.00"),
        is_active=True,
    )
    step1_high = ApprovalChainStep(
        id=uuid.uuid4(),
        template_id=tpl_high_asset.id,
        step_order=1,
        approver_role_id=ROLE_MANAGER_ID,
        approver_role=ROLES_MAP["manager"],
    )
    step2_high = ApprovalChainStep(
        id=uuid.uuid4(),
        template_id=tpl_high_asset.id,
        step_order=2,
        approver_role_id=ROLE_IT_ADMIN_ID,
        approver_role=ROLES_MAP["it_admin"],
    )
    step3_high = ApprovalChainStep(
        id=uuid.uuid4(),
        template_id=tpl_high_asset.id,
        step_order=3,
        approver_role_id=ROLE_SUPER_ADMIN_ID,
        approver_role=ROLES_MAP["super_admin"],
    )
    tpl_high_asset.steps = [step1_high, step2_high, step3_high]

    return tpl_std_asset, tpl_high_asset


# ==============================================================================
# 1. Cost Tier Selection & Creation Tests (5.8 & 2.3)
# ==============================================================================
def test_cost_tier_selection_picks_correct_template():
    mock_db, get_mock = create_rbac_mock_db()
    manager_user = create_mock_user(full_name="Manager Bob", role_name="manager")
    employee_user = create_mock_user(
        full_name="Emp Alice", role_name="employee", manager_id=manager_user.id
    )

    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=employee_user.id,
        role="employee",
        session_id=uuid.uuid4(),
        role_id=ROLE_EMPLOYEE_ID,
    )
    app.dependency_overrides[get_db] = lambda: mock_db

    tpl_std, tpl_high = build_default_templates()

    # Case A: Low cost ($500) -> picks tpl_std
    get_mock(ApprovalChainTemplate).first.return_value = tpl_std
    get_mock(User).first.return_value = employee_user
    get_mock(Role).first.return_value = ROLES_MAP["manager"]

    # When querying the created request by detail
    mock_req_std = Request(
        id=uuid.uuid4(),
        requester_id=employee_user.id,
        request_type=RequestType.asset_request,
        title="Laptop stand",
        description="Ergonomic stand",
        estimated_cost=Decimal("500.00"),
        priority=RequestPriority.low,
        status=RequestStatus.pending,
        current_step=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    mock_req_std.requester = employee_user
    mock_req_std.approvals = [
        RequestApproval(
            id=uuid.uuid4(),
            request_id=mock_req_std.id,
            step_order=1,
            approver_id=manager_user.id,
            approver_role_id=ROLE_MANAGER_ID,
            status=ApprovalStatus.pending,
            created_at=datetime.now(timezone.utc),
        ),
        RequestApproval(
            id=uuid.uuid4(),
            request_id=mock_req_std.id,
            step_order=2,
            approver_id=None,
            approver_role_id=ROLE_IT_ADMIN_ID,
            status=ApprovalStatus.pending,
            created_at=datetime.now(timezone.utc),
        ),
    ]
    get_mock(Request).first.return_value = mock_req_std

    resp = client.post(
        "/api/v1/requests",
        json={
            "request_type": "asset_request",
            "title": "Laptop stand",
            "description": "Ergonomic stand",
            "estimated_cost": "500.00",
            "priority": "low",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Laptop stand"
    assert len(data["approvals"]) == 2

    # Case B: High cost ($2500) -> picks tpl_high
    get_mock(ApprovalChainTemplate).first.return_value = tpl_high
    mock_req_high = Request(
        id=uuid.uuid4(),
        requester_id=employee_user.id,
        request_type=RequestType.asset_request,
        title="MacBook Pro",
        description="High end dev laptop",
        estimated_cost=Decimal("2500.00"),
        priority=RequestPriority.high,
        status=RequestStatus.pending,
        current_step=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    mock_req_high.requester = employee_user
    mock_req_high.approvals = [
        RequestApproval(
            id=uuid.uuid4(),
            request_id=mock_req_high.id,
            step_order=1,
            approver_id=manager_user.id,
            approver_role_id=ROLE_MANAGER_ID,
            status=ApprovalStatus.pending,
            created_at=datetime.now(timezone.utc),
        ),
        RequestApproval(
            id=uuid.uuid4(),
            request_id=mock_req_high.id,
            step_order=2,
            approver_id=None,
            approver_role_id=ROLE_IT_ADMIN_ID,
            status=ApprovalStatus.pending,
            created_at=datetime.now(timezone.utc),
        ),
        RequestApproval(
            id=uuid.uuid4(),
            request_id=mock_req_high.id,
            step_order=3,
            approver_id=None,
            approver_role_id=ROLE_SUPER_ADMIN_ID,
            status=ApprovalStatus.pending,
            created_at=datetime.now(timezone.utc),
        ),
    ]
    get_mock(Request).first.return_value = mock_req_high

    resp_high = client.post(
        "/api/v1/requests",
        json={
            "request_type": "asset_request",
            "title": "MacBook Pro",
            "description": "High end dev laptop",
            "estimated_cost": "2500.00",
            "priority": "high",
        },
    )
    assert resp_high.status_code == 201
    data_high = resp_high.json()
    assert len(data_high["approvals"]) == 3


# ==============================================================================
# 2. No Approval Chain Returns 409 (5.6 & 2.3)
# ==============================================================================
def test_no_approval_chain_returns_409():
    mock_db, get_mock = create_rbac_mock_db()
    user = create_mock_user()

    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=user.id, role="employee", session_id=uuid.uuid4(), role_id=ROLE_EMPLOYEE_ID
    )
    app.dependency_overrides[get_db] = lambda: mock_db

    # No template returned
    get_mock(ApprovalChainTemplate).first.return_value = None

    resp = client.post(
        "/api/v1/requests",
        json={
            "request_type": "other",
            "title": "Special request",
            "description": "No template exists",
        },
    )
    assert resp.status_code == 409
    body = resp.json()
    assert body["error"]["code"] == "no_approval_chain"


# ==============================================================================
# 3. Chain With ONLY Manager Steps + Requester Without Manager Returns 400
#    (a mixed chain skips the manager step instead — see
#    tests/test_request_manager_skip.py)
# ==============================================================================
def test_manager_only_chain_requester_without_manager_fails():
    mock_db, get_mock = create_rbac_mock_db()
    # Requester has NO manager assigned
    user_no_manager = create_mock_user(manager_id=None)

    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=user_no_manager.id,
        role="employee",
        session_id=uuid.uuid4(),
        role_id=ROLE_EMPLOYEE_ID,
    )
    app.dependency_overrides[get_db] = lambda: mock_db

    tpl_std, _ = build_default_templates()
    # Every step routes to the manager, so skipping leaves nobody to approve
    tpl_std.steps = [step for step in tpl_std.steps if step.approver_role_id == ROLE_MANAGER_ID]
    get_mock(ApprovalChainTemplate).first.return_value = tpl_std
    get_mock(User).first.return_value = user_no_manager
    get_mock(Role).first.return_value = ROLES_MAP["manager"]

    resp = client.post(
        "/api/v1/requests",
        json={
            "request_type": "asset_request",
            "title": "Need a mouse",
            "description": "Ergonomic vertical mouse",
        },
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["error"]["code"] == "validation_error"
    assert "manager" in body["error"]["message"].lower()


# ==============================================================================
# 4. Related Asset Validation (2.10)
# ==============================================================================
def test_related_asset_validation():
    mock_db, get_mock = create_rbac_mock_db()
    user = create_mock_user(manager_id=uuid.uuid4())

    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=user.id, role="employee", session_id=uuid.uuid4(), role_id=ROLE_EMPLOYEE_ID
    )
    app.dependency_overrides[get_db] = lambda: mock_db

    dummy_asset_id = str(uuid.uuid4())

    # related_asset_id on non-asset request fails 422/400 validation
    resp = client.post(
        "/api/v1/requests",
        json={
            "request_type": "access_request",
            "title": "Github Access",
            "description": "Need access to repos",
            "related_asset_id": dummy_asset_id,
        },
    )
    assert resp.status_code == 400

    # related_asset_id with non-existent asset fails 404
    tpl_std, _ = build_default_templates()
    get_mock(ApprovalChainTemplate).first.return_value = tpl_std
    get_mock(User).first.return_value = user
    get_mock(Asset).first.return_value = None  # Asset not found

    resp_404 = client.post(
        "/api/v1/requests",
        json={
            "request_type": "asset_request",
            "title": "Replacement",
            "description": "Broken battery",
            "related_asset_id": dummy_asset_id,
        },
    )
    assert resp_404.status_code == 404
    assert resp_404.json()["error"]["code"] == "not_found"


# ==============================================================================
# 5. GET /requests/mine (2.2)
# ==============================================================================
def test_get_my_requests():
    mock_db, get_mock = create_rbac_mock_db()
    user = create_mock_user()

    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=user.id, role="employee", session_id=uuid.uuid4(), role_id=ROLE_EMPLOYEE_ID
    )
    app.dependency_overrides[get_db] = lambda: mock_db

    req_mock = Request(
        id=uuid.uuid4(),
        requester_id=user.id,
        request_type=RequestType.it_ticket,
        title="VPN Issue",
        description="Cannot connect",
        priority=RequestPriority.medium,
        status=RequestStatus.pending,
        current_step=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    req_mock.requester = user

    q_mock = get_mock(Request)
    q_mock.count.return_value = 1
    q_mock.all.return_value = [req_mock]

    resp = client.get("/api/v1/requests/mine")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["title"] == "VPN Issue"


# ==============================================================================
# 6. GET /requests/{id} ABAC Row Check (5.9, 2.9, & User Feedback 3)
# ==============================================================================
def test_get_request_detail_abac_and_unassigned_manager_denial():
    mock_db, get_mock = create_rbac_mock_db()
    owner = create_mock_user(full_name="Alice Owner")
    assigned_manager = create_mock_user(full_name="Assigned Manager Bob", role_name="manager")
    unassigned_manager = create_mock_user(full_name="Stranger Manager Charlie", role_name="manager")
    other_employee = create_mock_user(full_name="Other Emp Dave", role_name="employee")
    auditor = create_mock_user(full_name="Auditor Eve", role_name="auditor")

    req_id = uuid.uuid4()
    req = Request(
        id=req_id,
        requester_id=owner.id,
        request_type=RequestType.asset_request,
        title="New Monitor",
        description="Dell 27 inch",
        priority=RequestPriority.medium,
        status=RequestStatus.pending,
        current_step=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    req.requester = owner
    req.approvals = [
        RequestApproval(
            id=uuid.uuid4(),
            request_id=req.id,
            step_order=1,
            approver_id=assigned_manager.id,  # Specific assigned manager
            approver_role_id=ROLE_MANAGER_ID,
            status=ApprovalStatus.pending,
            created_at=datetime.now(timezone.utc),
        ),
        RequestApproval(
            id=uuid.uuid4(),
            request_id=req.id,
            step_order=2,
            approver_id=None,  # Role queue step
            approver_role_id=ROLE_IT_ADMIN_ID,
            status=ApprovalStatus.pending,
            created_at=datetime.now(timezone.utc),
        ),
    ]

    get_mock(Request).first.return_value = req
    app.dependency_overrides[get_db] = lambda: mock_db

    # 1. Requester can read
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=owner.id, role="employee", session_id=uuid.uuid4(), role_id=ROLE_EMPLOYEE_ID
    )
    assert client.get(f"/api/v1/requests/{req_id}").status_code == 200

    # 2. Assigned manager can read
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=assigned_manager.id, role="manager", session_id=uuid.uuid4(), role_id=ROLE_MANAGER_ID
    )
    assert client.get(f"/api/v1/requests/{req_id}").status_code == 200

    # 3. Auditor can read
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=auditor.id, role="auditor", session_id=uuid.uuid4(), role_id=ROLE_AUDITOR_ID
    )
    assert client.get(f"/api/v1/requests/{req_id}").status_code == 200

    # 4. Unassigned manager gets 403 (User Feedback 3: approver_id is set to Bob, Charlie is not Bob)
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=unassigned_manager.id, role="manager", session_id=uuid.uuid4(), role_id=ROLE_MANAGER_ID
    )
    resp_unassigned = client.get(f"/api/v1/requests/{req_id}")
    assert resp_unassigned.status_code == 403
    assert resp_unassigned.json()["error"]["code"] == "forbidden"

    # 5. Other employee gets 403
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=other_employee.id, role="employee", session_id=uuid.uuid4(), role_id=ROLE_EMPLOYEE_ID
    )
    assert client.get(f"/api/v1/requests/{req_id}").status_code == 403


# ==============================================================================
# 7. POST /requests/{id}/cancel (5.5, 2.8, & User Feedback 5)
# ==============================================================================
def test_cancel_request_and_failure_after_final_status():
    mock_db, get_mock = create_rbac_mock_db()
    requester = create_mock_user(full_name="Requester Sam")
    other_user = create_mock_user(full_name="Attacker Eve")

    req_id = uuid.uuid4()
    req = Request(
        id=req_id,
        requester_id=requester.id,
        request_type=RequestType.it_ticket,
        title="Slack channel create",
        description="Need new project channel",
        priority=RequestPriority.medium,
        status=RequestStatus.pending,
        current_step=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    req.requester = requester
    req.approvals = [
        RequestApproval(
            id=uuid.uuid4(),
            request_id=req_id,
            step_order=1,
            approver_id=None,
            approver_role_id=ROLE_IT_ADMIN_ID,
            status=ApprovalStatus.pending,
            created_at=datetime.now(timezone.utc),
        )
    ]
    get_mock(Request).first.return_value = req
    get_mock(RequestApproval).all.return_value = req.approvals
    app.dependency_overrides[get_db] = lambda: mock_db

    # 1. Non-requester gets 403
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=other_user.id, role="employee", session_id=uuid.uuid4(), role_id=ROLE_EMPLOYEE_ID
    )
    assert client.post(f"/api/v1/requests/{req_id}/cancel").status_code == 403

    # 2. Requester can cancel pending
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=requester.id, role="employee", session_id=uuid.uuid4(), role_id=ROLE_EMPLOYEE_ID
    )
    resp = client.post(f"/api/v1/requests/{req_id}/cancel")
    assert resp.status_code == 200
    assert req.status == RequestStatus.cancelled
    assert req.approvals[0].status == ApprovalStatus.skipped

    # 3. Cancel fails after approved or rejected (5.5)
    req.status = RequestStatus.approved
    resp_conflict = client.post(f"/api/v1/requests/{req_id}/cancel")
    assert resp_conflict.status_code == 409
    assert resp_conflict.json()["error"]["code"] == "invalid_state"


# ==============================================================================
# 8. Pending Approvals Queue, Self-Exclusion & RBAC 403 (5.1, 5.2, & Feedback 1, 2)
# ==============================================================================
def test_pending_approvals_queue_and_rbac_denial():
    mock_db, get_mock = create_rbac_mock_db()
    manager = create_mock_user(role_name="manager")
    employee = create_mock_user(role_name="employee")
    auditor = create_mock_user(role_name="auditor")

    app.dependency_overrides[get_db] = lambda: mock_db

    # 1. Employee gets 403 on pending-approval (User Feedback 2)
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=employee.id, role="employee", session_id=uuid.uuid4(), role_id=ROLE_EMPLOYEE_ID
    )
    resp_emp = client.get("/api/v1/requests/pending-approval")
    assert resp_emp.status_code == 403

    # 2. Auditor gets 403 on pending-approval
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=auditor.id, role="auditor", session_id=uuid.uuid4(), role_id=ROLE_AUDITOR_ID
    )
    resp_aud = client.get("/api/v1/requests/pending-approval")
    assert resp_aud.status_code == 403

    # 3. Manager passes coarse RBAC and queries pending queue
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=manager.id, role="manager", session_id=uuid.uuid4(), role_id=ROLE_MANAGER_ID
    )
    q_mock = get_mock(Request)
    q_mock.count.return_value = 0
    q_mock.all.return_value = []
    resp_mgr = client.get("/api/v1/requests/pending-approval")
    assert resp_mgr.status_code == 200


# ==============================================================================
# 9. Step-2 Approver Cannot Act Early & Non-Eligible 403 (5.1, 5.2)
# ==============================================================================
def test_step2_approver_cannot_act_while_step1_pending():
    mock_db, get_mock = create_rbac_mock_db()
    manager = create_mock_user(role_name="manager")
    it_admin = create_mock_user(role_name="it_admin")
    requester = create_mock_user(role_name="employee", manager_id=manager.id)

    req_id = uuid.uuid4()
    req = Request(
        id=req_id,
        requester_id=requester.id,
        request_type=RequestType.asset_request,
        title="Laptop Upgrade",
        description="M3 MacBook",
        priority=RequestPriority.medium,
        status=RequestStatus.pending,
        current_step=1,  # Step 1 is active (manager)
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    step1 = RequestApproval(
        id=uuid.uuid4(),
        request_id=req_id,
        step_order=1,
        approver_id=manager.id,
        approver_role_id=ROLE_MANAGER_ID,
        status=ApprovalStatus.pending,
        created_at=datetime.now(timezone.utc),
    )
    step2 = RequestApproval(
        id=uuid.uuid4(),
        request_id=req_id,
        step_order=2,
        approver_id=None,
        approver_role_id=ROLE_IT_ADMIN_ID,
        status=ApprovalStatus.pending,
        created_at=datetime.now(timezone.utc),
    )
    req.approvals = [step1, step2]
    get_mock(Request).first.return_value = req
    get_mock(RequestApproval).first.return_value = step1
    app.dependency_overrides[get_db] = lambda: mock_db

    # IT Admin (step 2 role) attempts to approve step 1 -> 403 Forbidden
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=it_admin.id, role="it_admin", session_id=uuid.uuid4(), role_id=ROLE_IT_ADMIN_ID
    )
    resp = client.post(f"/api/v1/requests/{req_id}/approve", json={"comments": "IT approving early"})
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "forbidden"


# ==============================================================================
# 10. Self-Approval Prevented (User Feedback 1)
# ==============================================================================
def test_self_approval_prevented():
    mock_db, get_mock = create_rbac_mock_db()
    # User is an IT admin requesting an IT ticket
    it_user = create_mock_user(role_name="it_admin")

    req_id = uuid.uuid4()
    req = Request(
        id=req_id,
        requester_id=it_user.id,
        request_type=RequestType.it_ticket,
        title="Server reboot",
        description="Prod restart",
        priority=RequestPriority.medium,
        status=RequestStatus.pending,
        current_step=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    step1 = RequestApproval(
        id=uuid.uuid4(),
        request_id=req_id,
        step_order=1,
        approver_id=None,
        approver_role_id=ROLE_IT_ADMIN_ID,
        status=ApprovalStatus.pending,
        created_at=datetime.now(timezone.utc),
    )
    req.approvals = [step1]
    get_mock(Request).first.return_value = req
    get_mock(RequestApproval).first.return_value = step1
    app.dependency_overrides[get_db] = lambda: mock_db

    # Requester tries to approve own request -> 403
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=it_user.id, role="it_admin", session_id=uuid.uuid4(), role_id=ROLE_IT_ADMIN_ID
    )
    resp = client.post(f"/api/v1/requests/{req_id}/approve", json={})
    assert resp.status_code == 403
    assert "re-approve" in resp.json()["error"]["message"].lower() or "cannot approve" in resp.json()["error"]["message"].lower()


# ==============================================================================
# 11. Second Actor on Already-Acted Step Gets 409 (5.3)
# ==============================================================================
def test_second_actor_on_already_acted_step_gets_409():
    mock_db, get_mock = create_rbac_mock_db()
    it_admin_1 = create_mock_user(full_name="IT Admin 1", role_name="it_admin")
    it_admin_2 = create_mock_user(full_name="IT Admin 2", role_name="it_admin")
    requester = create_mock_user(role_name="employee")

    req_id = uuid.uuid4()
    req = Request(
        id=req_id,
        requester_id=requester.id,
        request_type=RequestType.asset_request,
        title="Keyboard",
        description="Mechanical keyboard",
        priority=RequestPriority.medium,
        status=RequestStatus.pending,
        current_step=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    # Step 1 was an IT Admin shared-role step, already acted/approved by IT Admin 1
    step1 = RequestApproval(
        id=uuid.uuid4(),
        request_id=req_id,
        step_order=1,
        approver_id=it_admin_1.id,
        approver_role_id=ROLE_IT_ADMIN_ID,
        status=ApprovalStatus.approved,
        created_at=datetime.now(timezone.utc),
    )
    req.approvals = [step1]
    get_mock(Request).first.return_value = req
    get_mock(RequestApproval).first.return_value = step1
    app.dependency_overrides[get_db] = lambda: mock_db

    # 1. Acting approver gets 409 after acting
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=it_admin_1.id, role="it_admin", session_id=uuid.uuid4(), role_id=ROLE_IT_ADMIN_ID
    )
    resp = client.post(f"/api/v1/requests/{req_id}/approve", json={})
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "already_acted"

    # 2. Second shared-role holder with same role_id on already-acted step also gets 409
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=it_admin_2.id, role="it_admin", session_id=uuid.uuid4(), role_id=ROLE_IT_ADMIN_ID
    )
    resp2 = client.post(f"/api/v1/requests/{req_id}/approve", json={})
    assert resp2.status_code == 409
    assert resp2.json()["error"]["code"] == "already_acted"

    # 3. Non-participant gets 403 before revealing request status (no 409)
    stranger = create_mock_user(role_name="auditor")
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=stranger.id, role="auditor", session_id=uuid.uuid4(), role_id=ROLE_AUDITOR_ID
    )
    resp_non_part = client.post(f"/api/v1/requests/{req_id}/approve", json={})
    assert resp_non_part.status_code == 403
    assert resp_non_part.json()["error"]["code"] == "forbidden"

    resp_non_part_rej = client.post(f"/api/v1/requests/{req_id}/reject", json={"comments": "No access"})
    assert resp_non_part_rej.status_code == 403
    assert resp_non_part_rej.json()["error"]["code"] == "forbidden"


def test_unrelated_manager_denied_403_on_acted_requests_and_assigned_manager_gets_409():
    mock_db, get_mock = create_rbac_mock_db()
    assigned_manager = create_mock_user(full_name="Assigned Manager Bob", role_name="manager")
    unrelated_manager = create_mock_user(full_name="Unrelated Manager Charlie", role_name="manager")
    requester = create_mock_user(role_name="employee", manager_id=assigned_manager.id)

    app.dependency_overrides[get_db] = lambda: mock_db

    for final_status in [RequestStatus.approved, RequestStatus.rejected, RequestStatus.cancelled]:
        req_id = uuid.uuid4()
        req = Request(
            id=req_id,
            requester_id=requester.id,
            request_type=RequestType.asset_request,
            title=f"Request in {final_status.value}",
            description="Testing manager participation",
            priority=RequestPriority.medium,
            status=final_status,
            current_step=1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        step1 = RequestApproval(
            id=uuid.uuid4(),
            request_id=req_id,
            step_order=1,
            approver_id=assigned_manager.id,
            approver_role_id=ROLE_MANAGER_ID,
            status=ApprovalStatus.approved if final_status == RequestStatus.approved else ApprovalStatus.rejected,
            created_at=datetime.now(timezone.utc),
        )
        req.approvals = [step1]
        get_mock(Request).first.return_value = req
        get_mock(RequestApproval).first.return_value = step1

        # Unrelated manager attempting to approve -> 403 Forbidden (not 409)
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            user_id=unrelated_manager.id, role="manager", session_id=uuid.uuid4(), role_id=ROLE_MANAGER_ID
        )
        resp_unrel_approve = client.post(f"/api/v1/requests/{req_id}/approve", json={})
        assert resp_unrel_approve.status_code == 403, (
            f"Expected 403 for unrelated manager approve on {final_status.value}, got {resp_unrel_approve.status_code}"
        )
        assert resp_unrel_approve.json()["error"]["code"] == "forbidden"

        # Unrelated manager attempting to reject -> 403 Forbidden (not 409)
        resp_unrel_reject = client.post(f"/api/v1/requests/{req_id}/reject", json={"comments": "Rejecting"})
        assert resp_unrel_reject.status_code == 403, (
            f"Expected 403 for unrelated manager reject on {final_status.value}, got {resp_unrel_reject.status_code}"
        )
        assert resp_unrel_reject.json()["error"]["code"] == "forbidden"

        # Assigned manager (participant who acted) attempting to approve -> 409 Conflict (already_acted)
        app.dependency_overrides[get_current_user] = lambda: CurrentUser(
            user_id=assigned_manager.id, role="manager", session_id=uuid.uuid4(), role_id=ROLE_MANAGER_ID
        )
        resp_assigned_approve = client.post(f"/api/v1/requests/{req_id}/approve", json={})
        assert resp_assigned_approve.status_code == 409, (
            f"Expected 409 for assigned manager approve on {final_status.value}, got {resp_assigned_approve.status_code}"
        )
        assert resp_assigned_approve.json()["error"]["code"] == "already_acted"

        # Assigned manager attempting to reject -> 409 Conflict (already_acted)
        resp_assigned_reject = client.post(f"/api/v1/requests/{req_id}/reject", json={"comments": "Rejecting again"})
        assert resp_assigned_reject.status_code == 409, (
            f"Expected 409 for assigned manager reject on {final_status.value}, got {resp_assigned_reject.status_code}"
        )
        assert resp_assigned_reject.json()["error"]["code"] == "already_acted"


def test_eligibility_checks_require_non_null_roles():
    mock_db, get_mock = create_rbac_mock_db()
    requester = create_mock_user(role_name="employee")
    req_id = uuid.uuid4()
    req = Request(
        id=req_id,
        requester_id=requester.id,
        request_type=RequestType.asset_request,
        title="Monitor",
        description="Dell 27",
        priority=RequestPriority.medium,
        status=RequestStatus.pending,
        current_step=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    step1 = RequestApproval(
        id=uuid.uuid4(),
        request_id=req_id,
        step_order=1,
        approver_id=None,
        approver_role_id=ROLE_IT_ADMIN_ID,
        status=ApprovalStatus.pending,
        created_at=datetime.now(timezone.utc),
    )
    req.approvals = [step1]
    get_mock(Request).first.return_value = req
    get_mock(RequestApproval).first.return_value = step1
    app.dependency_overrides[get_db] = lambda: mock_db

    # Caller with role_id=None gets 403
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=uuid.uuid4(), role="it_admin", session_id=uuid.uuid4(), role_id=None
    )
    resp = client.post(f"/api/v1/requests/{req_id}/approve", json={})
    assert resp.status_code == 403

    # Step with approver_role_id=None gets 403
    step1.approver_role_id = None
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=uuid.uuid4(), role="it_admin", session_id=uuid.uuid4(), role_id=ROLE_IT_ADMIN_ID
    )
    resp = client.post(f"/api/v1/requests/{req_id}/approve", json={})
    assert resp.status_code == 403


# ==============================================================================
# 12. Reject Without Comments Fails & Rejection Flow (5.4, 2.7)
# ==============================================================================
def test_reject_validation_and_flow():
    mock_db, get_mock = create_rbac_mock_db()
    manager = create_mock_user(role_name="manager")
    requester = create_mock_user(role_name="employee")

    req_id = uuid.uuid4()
    req = Request(
        id=req_id,
        requester_id=requester.id,
        request_type=RequestType.asset_request,
        title="Standing Desk",
        description="Electric desk",
        priority=RequestPriority.medium,
        status=RequestStatus.pending,
        current_step=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    step1 = RequestApproval(
        id=uuid.uuid4(),
        request_id=req_id,
        step_order=1,
        approver_id=manager.id,
        approver_role_id=ROLE_MANAGER_ID,
        status=ApprovalStatus.pending,
        created_at=datetime.now(timezone.utc),
    )
    step2 = RequestApproval(
        id=uuid.uuid4(),
        request_id=req_id,
        step_order=2,
        approver_id=None,
        approver_role_id=ROLE_IT_ADMIN_ID,
        status=ApprovalStatus.pending,
        created_at=datetime.now(timezone.utc),
    )
    req.approvals = [step1, step2]
    get_mock(Request).first.return_value = req
    get_mock(RequestApproval).first.return_value = step1
    get_mock(RequestApproval).all.return_value = [step2]  # subsequent steps
    app.dependency_overrides[get_db] = lambda: mock_db

    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        user_id=manager.id, role="manager", session_id=uuid.uuid4(), role_id=ROLE_MANAGER_ID
    )

    # 1. Empty comments fails (5.4)
    resp_empty = client.post(f"/api/v1/requests/{req_id}/reject", json={"comments": "   "})
    assert resp_empty.status_code == 400
    assert resp_empty.json()["error"]["code"] == "validation_error"

    # 2. Valid rejection sets status=rejected and marks step 2 as skipped
    resp_valid = client.post(
        f"/api/v1/requests/{req_id}/reject", json={"comments": "Budget freeze in effect"}
    )
    assert resp_valid.status_code == 200
    assert req.status == RequestStatus.rejected
    assert step1.status == ApprovalStatus.rejected
    assert step2.status == ApprovalStatus.skipped


# ==============================================================================
# 13. Dashboard Service Alignment Test (User Feedback 7)
# ==============================================================================
def test_dashboard_service_pending_approvals_alignment():
    mock_db, get_mock = create_rbac_mock_db()
    manager = create_mock_user(role_name="manager")
    current_u = CurrentUser(
        user_id=manager.id,
        role="manager",
        session_id=uuid.uuid4(),
        role_id=ROLE_MANAGER_ID,
        department_id=manager.department_id,
    )

    dashboard_svc = DashboardService(db=mock_db, current_user=current_u)

    # Mock the join query on RequestApproval
    q_mock = get_mock(RequestApproval)
    q_mock.all.return_value = []
    q_mock.scalar.return_value = 0

    metrics, widgets = dashboard_svc._get_manager_dashboard()
    assert "pending_approvals" in widgets
    assert "pending_approvals_count" in metrics
    # Verify filter was called with joining Request
    assert q_mock.join.called
