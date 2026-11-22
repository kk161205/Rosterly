"""
The only data the Guide can read: a fixed list of the core
backend's existing read endpoints, called with the person's own token. Each
tool names its allowed arguments and keeps only the fields an answer needs,
at most 10 rows — less data to the model, nothing extra exposed.
"""
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Awaitable, Callable, Optional

from app.core.backend_client import BackendDenied

ASSET_STATUSES = {"in_stock", "assigned", "under_maintenance", "retired", "lost"}
REQUEST_STATUSES = {"pending", "approved", "rejected", "in_progress", "completed", "cancelled"}
TICKET_STATUSES = {"open", "in_progress", "resolved", "closed"}
ROWS = 10


def _text(value: Any, limit: int = 60) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    return s[:limit] if s else None


def _category(value: Any) -> Optional[str]:
    """Asset categories are stored lower-case and singular ("monitor"); "Monitors" means the same."""
    s = _text(value, 40)
    if not s:
        return None
    s = s.lower().replace(" ", "_")
    return s[:-1] if len(s) > 3 and s.endswith("s") and not s.endswith("ss") else s


# What people (and models) say → the API's value.
_SYNONYMS = {
    "available": "in_stock", "spare": "in_stock", "stock": "in_stock", "unassigned": "in_stock",
    "deployed": "assigned", "in_use": "assigned", "given_out": "assigned",
    "in_repair": "under_maintenance", "repair": "under_maintenance", "maintenance": "under_maintenance", "broken": "under_maintenance",
    "waiting": "pending", "awaiting_approval": "pending", "done": "completed", "finished": "completed",
    "fixed": "resolved", "new": "open",
}


def _choice(allowed: set[str]) -> Callable[[Any], Optional[str]]:
    def check(v: Any) -> Optional[str]:
        if v is None:
            return None
        key = str(v).strip().lower().replace("-", "_").replace(" ", "_")
        key = _SYNONYMS.get(key, key)
        return key if key in allowed else None

    return check


@dataclass(frozen=True)
class Tool:
    name: str
    path: str
    description: str
    page: str  # the page where the person can see this for themselves
    args: dict[str, Callable[[Any], Optional[str]]] = field(default_factory=dict)
    fixed: dict[str, Any] = field(default_factory=dict)
    project: Callable[[Any], Any] = lambda data: data
    # Records to open from the answer, built here from the raw data (never by a model).
    links: Optional[Callable[[Any], list[dict[str, str]]]] = None
    # Writes the answer itself, so no second model call is needed (saves Groq's per-minute allowance).
    render: Optional[Callable[[Any], dict[str, Any]]] = None
    # For tools that need more than one read: (backend, args, request) -> raw data.
    fetch: Optional[Callable[[Any, dict[str, Any], Any], Awaitable[Any]]] = None
    needs_record: bool = False  # only offered when an asset or person is open on screen


def _days(value: Any) -> Any:
    """"8.00" → 8, "7.50" → 7.5, so answers read "8 days", not "8.00 days"."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return value
    return int(number) if number.is_integer() else number


def _holder(a: dict) -> Optional[str]:
    h = a.get("current_holder") or {}
    return h.get("full_name")


LINKS = 5
OPEN_REQUESTS = {"pending", "approved", "in_progress"}
ROLE_WORDS = {"it_admin": "an IT admin", "hr_admin": "an HR admin", "super_admin": "a super admin", "manager": "a manager", "auditor": "an auditor", "employee": "an employee"}
TEAM_WORDS = {"it_admin": "IT", "hr_admin": "HR", "super_admin": "Super admin", "manager": "Manager", "employee": "Employee"}


def _link(label: str, base: str, ident: Any) -> dict[str, str]:
    return {"label": label[:80], "path": f"{base}{ident}"} if ident else {}


def _ago(stamp: Any) -> str:
    try:
        days = (date.today() - date.fromisoformat(str(stamp)[:10])).days
    except ValueError:
        return ""
    return "today" if days <= 0 else "yesterday" if days == 1 else f"{days} days ago"


# ---- "Why is this stuck?": answers written here from the data, with no second model call.

async def _request_status(backend: Any, args: dict[str, Any], _req: Any) -> dict[str, Any]:
    mine = await backend.get("/requests/mine", {"page_size": 20})
    open_ = [r for r in mine.get("items", []) if r.get("status") in OPEN_REQUESTS]
    q = (args.get("search") or "").lower()
    if q:
        open_ = [r for r in open_ if q in str(r.get("title") or "").lower()] or open_
    items = []
    for r in open_[:3]:
        approvals = []
        if r.get("status") == "pending" and r.get("id"):
            approvals = (await backend.get(f"/requests/{r['id']}")).get("approvals", [])
        items.append({**r, "approvals": approvals})
    return {"items": items, "open_total": len(open_)}


def _where(r: dict[str, Any]) -> str:
    status = r.get("status")
    if status == "approved":
        return "is fully approved and waiting for IT or HR to start work on it"
    if status == "in_progress":
        return "is approved and being worked on now"
    step = next((a for a in sorted(r.get("approvals") or [], key=lambda a: a.get("step_order") or 0) if a.get("status") == "pending"), None)
    if not step:
        return "is waiting for approval"
    who = step.get("approver_name") or ROLE_WORDS.get(str(step.get("approver_role_name")), "an approver")
    total = r.get("total_steps") or len(r.get("approvals") or [])
    return f"is waiting on {who} (step {step.get('step_order')} of {total})" if total else f"is waiting on {who}"


def _render_requests(d: dict[str, Any]) -> dict[str, Any]:
    items = d.get("items") or []
    if not items:
        return {"text": "You have no open requests right now."}
    lines = [f"“{r.get('title')}” {_where(r)}, raised {_ago(r.get('created_at'))}." for r in items]
    more = d.get("open_total", 0) - len(items)
    text = " ".join(lines) + (f" You have {more} more open." if more > 0 else "")
    rows = [[str(r.get("title"))[:60], _where(r).replace("is ", "", 1), _ago(r.get("created_at"))] for r in items]
    return {"text": text, "table": {"columns": ["Request", "Where it is", "Raised"], "rows": rows} if len(items) > 1 else None}


async def _checklists(backend: Any, args: dict[str, Any], _req: Any) -> dict[str, Any]:
    kinds = [args["type"]] if args.get("type") else ["offboarding", "onboarding"]
    found, denied = [], 0
    for kind in kinds:
        try:
            data = await backend.get(f"/{kind}", {"status": "in_progress", "page_size": 50})
        except BackendDenied:
            denied += 1
            continue
        found += [{**c, "kind": kind} for c in data.get("checklists", [])]
    if denied == len(kinds):
        raise BackendDenied(403)
    person = (args.get("person") or "").lower()
    missed = None
    if person:
        named = [c for c in found if person in str(c.get("employee_name") or "").lower()]
        if not named and found:
            missed = args.get("person")  # no such name: show the open ones rather than nothing
        found = named or found
    return {"checklists": found[:3], "person": args.get("person"), "missed": missed, "kinds": kinds}


def _team(item: dict[str, Any]) -> str:
    return TEAM_WORDS.get(str(item.get("owner_role_name")), "—")


def _render_checklists(d: dict[str, Any]) -> dict[str, Any]:
    lists = d.get("checklists") or []
    if not lists:
        what = " or ".join(d.get("kinds") or ["onboarding", "offboarding"])
        return {"text": f"I couldn’t find an open {what}" + (f" for {d['person']}." if d.get("person") else " that you can see.")}
    parts, rows = [], []
    for c in lists:
        left = [i for i in c.get("items") or [] if i.get("status") != "done"]
        name, kind = c.get("employee_name") or "Someone", c.get("kind")
        head = f"{name}’s {kind} is {c.get('completed_items', 0)} of {c.get('total_items', 0)} done."
        if not left:
            parts.append(head + (" Every task is done, so HR can complete it now." if kind == "offboarding" else " Every task is done."))
            continue
        todo = ", ".join(f"{i.get('task_name')} ({_team(i)})" for i in left[:4])
        extra = f" and {len(left) - 4} more" if len(left) > 4 else ""
        parts.append(f"{head} Still to do: {todo}{extra}." + (" It can’t be completed until these are done." if kind == "offboarding" else ""))
        if len(lists) == 1:
            rows = [[str(i.get("task_name"))[:60], _team(i), str(i.get("status")).replace("_", " ")] for i in left[:8]]
    lead = f"I couldn’t find one for “{d['missed']}”, so here are the open ones. " if d.get("missed") else ""
    return {"text": (lead + " ".join(parts))[:600], "table": {"columns": ["Still to do", "Team", "Status"], "rows": rows} if rows else None}


def _checklist_links(d: dict[str, Any]) -> list[dict[str, str]]:
    kinds = {c.get("kind") for c in d.get("checklists") or []}
    return [{"label": f"Open {k.capitalize()}", "path": f"/{k}"} for k in ("onboarding", "offboarding") if k in kinds]


# ---- "What's happening with this one?": the asset or person open on screen.

async def _this_record(backend: Any, _args: dict[str, Any], req: Any) -> dict[str, Any]:
    rec = getattr(req, "record", None)
    if rec is None:
        return {"note": "Nothing is open on screen."}
    if rec.type == "asset":
        detail = await backend.get(f"/assets/{rec.id}")
        a = detail.get("asset") or {}
        try:
            tickets = await backend.get(f"/assets/{rec.id}/maintenance")
        except BackendDenied:
            tickets = []
        return {
            "asset": {"tag": a.get("asset_tag"), "name": a.get("name"), "category": a.get("category"), "status": a.get("status"),
                      "holder": _holder(a), "bought": a.get("purchase_date"), "warranty_ends": a.get("warranty_expiry"),
                      "amc_ends": a.get("amc_expiry"), "warranty_ending_soon": a.get("is_expiring_soon")},
            "assigned_since": ((detail.get("current_assignment") or {}).get("assigned_at") or "")[:10] or None,
            "tickets": [{"issue": (t.get("issue_description") or "")[:100], "status": t.get("status"), "priority": t.get("priority"),
                         "raised": (t.get("created_at") or "")[:10]} for t in (tickets or [])[:5]],
        }
    p = await backend.get(f"/employees/{rec.id}")
    out: dict[str, Any] = {"person": {"name": p.get("full_name"), "title": p.get("designation"), "department": p.get("department_name"),
                                      "manager": p.get("manager_name"), "status": p.get("status"), "joined": p.get("date_of_joining"),
                                      "leaving": p.get("date_of_exit"), "reports": len(p.get("direct_reports") or [])}}
    for key, path in (("devices", f"/employees/{rec.id}/assets"), ("checklist", f"/employees/{rec.id}/lifecycle")):
        try:
            data = await backend.get(path)
        except BackendDenied:
            continue
        if key == "devices":
            out["devices"] = [f"{x.get('asset_tag')} {x.get('asset_name')}" for x in (data or {}).get("current", [])[:8]]
        elif data:
            out["checklist"] = {"type": data.get("type"), "status": data.get("status"), "done": data.get("completed_items"), "of": data.get("total_items")}
    return out


TOOLS: dict[str, Tool] = {
    t.name: t
    for t in [
        Tool(
            "asset_counts", "/assets/summary", "How many assets in total, deployed, in stock and in repair.", "assets",
            project=lambda d: {k: d.get(k) for k in ("total", "deployed", "in_stock", "under_maintenance")},
        ),
        Tool(
            "find_assets", "/assets", "Assets by name/tag/serial (search), status or category; who holds each.", "assets",
            args={"search": _text, "status": _choice(ASSET_STATUSES), "category": _category},
            fixed={"page_size": ROWS},
            project=lambda d: {
                "total": d.get("total"),
                "items": [
                    {"tag": a.get("asset_tag"), "name": a.get("name"), "category": a.get("category"), "status": a.get("status"),
                     "holder": _holder(a), "warranty_ends": a.get("warranty_expiry")}
                    for a in d.get("items", [])[:ROWS]
                ],
            },
            links=lambda d: [_link(f"{a.get('asset_tag')} · {a.get('name')}", "/assets/", a.get("id")) for a in d.get("items", [])[:LINKS]],
        ),
        Tool(
            "my_requests", "/requests/mine", "The person's own requests and where each one is.", "requests",
            args={"status": _choice(REQUEST_STATUSES)}, fixed={"page_size": ROWS},
            project=lambda d: {
                "total": d.get("total"),
                "items": [
                    {"title": r.get("title"), "type": r.get("request_type"), "status": r.get("status"),
                     "waiting_on": r.get("waiting_on_role"), "raised": (r.get("created_at") or "")[:10]}
                    for r in d.get("items", [])[:ROWS]
                ],
            },
        ),
        Tool(
            "approvals_waiting", "/requests/pending-approval", "Requests waiting for this person to approve.", "home",
            fixed={"page_size": ROWS},
            project=lambda d: {
                "total": d.get("total"),
                "items": [
                    {"title": r.get("title"), "from": r.get("requester_name"), "type": r.get("request_type"),
                     "cost": r.get("estimated_cost"), "raised": (r.get("created_at") or "")[:10]}
                    for r in d.get("items", [])[:ROWS]
                ],
            },
        ),
        Tool(
            "my_leave", "/leave-requests/mine", "The person's leave left this year per type, and recent leave requests.", "leave",
            fixed={"page_size": 5},
            project=lambda d: {
                "balances": [
                    {"type": (b.get("leave_type") or {}).get("name"), "left": _days(b.get("balance_days")),
                     "pending": _days(b.get("pending_days")), "per_year": _days(b.get("annual_days"))}
                    for b in d.get("balances", [])
                ],
                "recent": [
                    {"type": (r.get("leave_type") or {}).get("name"), "from": r.get("start_date"), "to": r.get("end_date"), "status": r.get("status")}
                    for r in d.get("items", [])[:5]
                ],
            },
        ),
        Tool(
            "find_people", "/employees", "People by name, email, code or job title: their title, department and manager.", "directory",
            args={"search": _text}, fixed={"page_size": ROWS},
            project=lambda d: {
                "total": d.get("total"),
                "items": [
                    {"name": p.get("full_name"), "title": p.get("designation"), "department": p.get("department_name"),
                     "manager": p.get("manager_name"), "email": p.get("email")}
                    for p in d.get("items", [])[:ROWS]
                ],
            },
            links=lambda d: [_link(str(p.get("full_name")), "/employees/", p.get("id")) for p in d.get("items", [])[:LINKS]],
        ),
        Tool(
            "licences", "/software-licenses", "Software licences: seats bought, seats used, renewal date.", "licenses",
            project=lambda d: {
                "items": [
                    {"name": licence.get("name"), "vendor": licence.get("vendor"), "seats": licence.get("total_seats"),
                     "used": licence.get("seats_used"), "renews": licence.get("renewal_date")}
                    for licence in d.get("items", [])[:20]
                ],
            },
        ),
        Tool(
            "tickets", "/maintenance-tickets", "Repair tickets the person can see, by status.", "maintenance",
            args={"status": _choice(TICKET_STATUSES)}, fixed={"page_size": ROWS},
            project=lambda d: {
                "total": d.get("total"),
                "items": [
                    {"asset": t.get("asset_name"), "issue": (t.get("issue_description") or "")[:120], "priority": t.get("priority"),
                     "status": t.get("status"), "assigned_to": t.get("assignee_name")}
                    for t in d.get("items", [])[:ROWS]
                ],
            },
        ),
        Tool(
            "request_status", "/requests/mine", "Where the person's own open requests are stuck and who each one is waiting on.", "requests",
            args={"search": _text}, fetch=_request_status, render=_render_requests,
            links=lambda d: [{"label": "Open Requests", "path": "/requests"}] if d.get("items") else [],
        ),
        Tool(
            "checklist_blockers", "/offboarding", "What is still left on someone's onboarding or offboarding, and who must do it (person = a name).", "home",
            args={"person": _text, "type": _choice({"onboarding", "offboarding"})}, fetch=_checklists, render=_render_checklists, links=_checklist_links,
        ),
        Tool(
            "this_record", "/assets or /employees", "The asset or person open on screen right now: status, holder, devices, tickets, checklist.", "home",
            fetch=_this_record, needs_record=True,
        ),
    ]
}


def clean_args(tool: Tool, raw: Any) -> dict[str, Any]:
    """Only the tool's own arguments, each through its validator; anything else is dropped."""
    raw = raw if isinstance(raw, dict) else {}
    out: dict[str, Any] = dict(tool.fixed)
    for key, check in tool.args.items():
        value = check(raw.get(key))
        if value is not None:
            out[key] = value
    return out


def catalog(with_record: bool = False) -> str:
    lines = []
    for t in TOOLS.values():
        if t.needs_record and not with_record:
            continue
        args = ", ".join(t.args) or "none"
        lines.append(f"- {t.name}({args}): {t.description}")
    return "\n".join(lines)
