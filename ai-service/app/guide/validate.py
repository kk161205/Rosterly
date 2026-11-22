"""
Server-side check of every model reply ("responses are checked") — the
same rules as the frontend's validatePlan, so a bad reply is caught twice:
only pages and targets the person was sent; open/fill on something that
changes data becomes a point; record pages are never opened directly.
"""
from typing import Any

from app.guide.schemas import Choice, GuideResponse, Page, Step, Table

MAX_STEPS = 6


def _s(value: Any, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _list_page(page: Page, pages: list[Page]) -> Page | None:
    """The page a record page is opened from: "Asset record" → "Assets" (same leading words in how_to_reach)."""
    for p in pages:
        if p.navigable and page.how_to_reach.lower().startswith(f"open {p.title.lower()}"):
            return p
    return None


def validate_show(raw: dict[str, Any], pages: list[Page], current_page: str | None = None) -> GuideResponse:
    """Checks a "show" reply and repairs what a model commonly gets wrong: a target used
    without first going to its page gets that "go" added; a target on a record page
    becomes "go to its list" plus a "say" explaining how to pick one."""
    page_by_id = {p.id: p for p in pages}
    page_of = {t.id: p for p in pages for t in p.targets}
    targets = {t.id: t for p in pages for t in p.targets}
    steps: list[Step] = []
    here = current_page
    for item in (raw.get("steps") or [])[:MAX_STEPS]:
        if not isinstance(item, dict):
            continue
        action = item.get("action")
        caption = _s(item.get("caption"), 120) or None
        if action == "say" and caption:
            steps.append(Step(action="say", caption=caption))
        elif action == "go":
            page = page_by_id.get(str(item.get("page")))
            if page and page.navigable:
                steps.append(Step(action="go", page=page.id, caption=caption))
                here = page.id
        elif action in ("point", "open", "fill"):
            target = targets.get(str(item.get("target")))
            if not target:
                continue
            owner = page_of[target.id]
            if owner.id != here:
                if not owner.navigable:
                    listing = _list_page(owner, pages)
                    if listing and here != listing.id:
                        steps.append(Step(action="go", page=listing.id, caption=f"Open {listing.title}"))
                    steps.append(Step(action="say", caption=_s(f"{owner.how_to_reach} Then press {target.label}.", 200)))
                    break
                steps.append(Step(action="go", page=owner.id, caption=f"Open {owner.title}"))
                here = owner.id
            caption = caption or target.label
            if action == "fill" and not target.changes and target.kind == "field" and isinstance(item.get("value"), str):
                steps.append(Step(action="fill", target=target.id, value=_s(item["value"], 200), caption=caption))
            elif action == "open" and not target.changes and target.kind != "field":
                steps.append(Step(action="open", target=target.id, caption=caption))
            else:
                steps.append(Step(action="point", target=target.id, caption=caption))
    # The same target twice in a row (models like to narrate a form field by field): keep the last.
    merged: list[Step] = []
    for step in steps:
        if merged and step.target and merged[-1].target == step.target:
            merged[-1] = step
        else:
            merged.append(step)
    steps = merged
    if not steps:
        return none_reply()
    if steps[-1].action == "open": # the person takes the last step
        steps[-1] = Step(action="point", target=steps[-1].target, caption=steps[-1].caption)
    return GuideResponse(kind="show", title=_s(raw.get("title"), 80) or "Here’s how", steps=steps[:MAX_STEPS + 2])


def validate_ask(raw: dict[str, Any], pages: list[Page]) -> GuideResponse:
    page_by_id = {p.id: p for p in pages}
    choices = []
    for c in (raw.get("choices") or [])[:3]:
        page = page_by_id.get(str(c.get("page"))) if isinstance(c, dict) else None
        if page:
            choices.append(Choice(label=page.title, page=page.id))
    if len(choices) < 2:
        return validate_show({"steps": [{"action": "go", "page": choices[0].page}], "title": choices[0].label}, pages) if choices else none_reply()
    return GuideResponse(kind="ask", question=_s(raw.get("question"), 120) or "Which one did you mean?", choices=choices)


def validate_answer(raw: dict[str, Any], pages: list[Page], page: Any = None) -> GuideResponse:
    text = _s(raw.get("text"), 600)  # matches Turn.answer, so an answer can always go back as history
    if not text:
        return none_reply()
    table = None
    t = raw.get("table")
    if isinstance(t, dict) and isinstance(t.get("columns"), list) and isinstance(t.get("rows"), list):
        columns = [_s(c, 40) for c in t["columns"][:4]]
        rows = [[_s(cell, 80) for cell in row[: len(columns)]] for row in t["rows"][:8] if isinstance(row, list)]
        if columns and rows:
            table = Table(columns=columns, rows=rows)
    ids = {p.id for p in pages if p.navigable}
    return GuideResponse(kind="answer", text=text, table=table, page=str(page) if page in ids else None)


def none_reply(message: str = "I couldn’t find a way to help with that here. Try asking about a page, like leave or requests.") -> GuideResponse:
    return GuideResponse(kind="none", message=message)
