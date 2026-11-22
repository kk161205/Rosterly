"""
The only data the Guide can read: a fixed list of the core
backend's existing read endpoints, called with the person's own token. Each
tool names its allowed arguments and keeps only the fields an answer needs,
at most 10 rows — less data to the model, nothing extra exposed.
"""
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

ASSET_STATUSES = {"in_stock", "assigned", "under_maintenance", "retired", "lost"}
REQUEST_STATUSES = {"pending", "approved", "rejected", "in_progress", "completed", "cancelled"}
TICKET_STATUSES = {"open", "in_progress", "resolved", "closed"}
ROWS = 10


def _text(value: Any, limit: int = 60) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    return s[:limit] if s else None


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


TOOLS: dict[str, Tool] = {
    t.name: t
    for t in [
        Tool(
            "asset_counts", "/assets/summary", "How many assets in total, deployed, in stock and in repair.", "assets",
            project=lambda d: {k: d.get(k) for k in ("total", "deployed", "in_stock", "under_maintenance")},
        ),
        Tool(
            "find_assets", "/assets", "Assets by name/tag/serial (search), status or category; who holds each.", "assets",
            args={"search": _text, "status": _choice(ASSET_STATUSES), "category": _text},
            fixed={"page_size": ROWS},
            project=lambda d: {
                "total": d.get("total"),
                "items": [
                    {"tag": a.get("asset_tag"), "name": a.get("name"), "category": a.get("category"), "status": a.get("status"),
                     "holder": _holder(a), "warranty_ends": a.get("warranty_expiry")}
                    for a in d.get("items", [])[:ROWS]
                ],
            },
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


def catalog() -> str:
    lines = []
    for t in TOOLS.values():
        args = ", ".join(t.args) or "none"
        lines.append(f"- {t.name}({args}): {t.description}")
    return "\n".join(lines)
