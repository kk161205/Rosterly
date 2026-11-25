"""
The Guide's brain.

1. Who is asking, and may they use the Guide? — the backend says, with their token.
2. A question asked again within a few minutes gets the same reply from a short cache,
   and a few common questions go straight to their lookup: neither uses a model.
3. Decide (fast model): show the way, look something up, explain, ask back, or can't help.
   This stage sees only the question and the page map.
4. If a lookup: read whitelisted endpoints with their token. Tools that can say the
   answer themselves do; otherwise the larger model writes it from that data — a stage
   that can only produce text.
5. Every reply is validated before it leaves.
"""
import json
import logging
import time
from typing import Any

from app.core.backend_client import BackendClient, BackendDenied
from app.core.config import settings
from app.core.groq import GroqClient
from app.core.rate_limit import RateLimiter
from app.guide.prompts import ANSWER, decide_prompt
from app.guide.schemas import GuideRequest, GuideResponse, Link, Table
from app.guide.tools import TOOLS, Tool, clean_args
from app.guide.validate import none_reply, validate_answer, validate_ask, validate_show

log = logging.getLogger("rosterly.ai")

CACHE_SECONDS = {"answer": 120, "default": 900}  # data goes stale quickly; the way to a page doesn't
CACHE_MAX = 500
_cache: dict[str, tuple[float, dict[str, Any]]] = {}

class GuideDisabled(Exception):
    pass


class RateLimited(Exception):
    pass


class NotSignedIn(Exception):
    pass


async def who_is_asking(backend: BackendClient, personal_switch: bool = True) -> dict[str, Any]:
    """The backend checks the token and the off switches; this service trusts nothing else.
    The Guide needs both; onboarding recommendations follow the company switch only."""
    try:
        me = await backend.get("/auth/me")
        prefs = await backend.get("/me/preferences")
    except BackendDenied as exc:
        raise NotSignedIn() from exc
    if not prefs.get("company_assistant_enabled", False) or (personal_switch and not prefs.get("assistant_enabled", False)):
        raise GuideDisabled()
    return me


def _question_text(req: GuideRequest) -> str:
    parts = []
    # Only earlier questions, never earlier answers: answers can echo data people wrote
    # (asset names, ticket text), and the stage that plans clicks must never see data.
    for turn in req.history[-2:]:
        parts.append(f"Earlier they asked: {turn.question}")
    if req.current_page:
        parts.append(f"They are on page: {req.current_page}")
    if req.record:
        parts.append(f"Open on screen: one {req.record.type} (this_record reads it)")
    parts.append(f"Question: {req.message}")
    return "\n".join(parts)


def _cache_key(user_id: Any, req: GuideRequest) -> str:
    return json.dumps([str(user_id), req.message.strip().lower(), req.current_page, req.record.id if req.record else None,
                       [t.question for t in req.history[-2:]], sorted(p.id for p in req.pages)])


def _cached(key: str) -> GuideResponse | None:
    hit = _cache.get(key)
    if not hit or hit[0] < time.time():
        _cache.pop(key, None)
        return None
    return GuideResponse(**hit[1])


def _remember(key: str, reply: GuideResponse) -> None:
    if reply.kind == "none":
        return
    if len(_cache) >= CACHE_MAX:
        for k in sorted(_cache, key=lambda k: _cache[k][0])[: CACHE_MAX // 5]:
            _cache.pop(k, None)
    ttl = CACHE_SECONDS["answer"] if reply.kind == "answer" else CACHE_SECONDS["default"]
    _cache[key] = (time.time() + ttl, reply.model_dump(exclude_none=True))


async def guide(req: GuideRequest, backend: BackendClient, groq: GroqClient, limiter: RateLimiter) -> GuideResponse:
    me = await who_is_asking(backend)
    key = _cache_key(me.get("id"), req)
    cached = _cached(key)
    if cached is not None:
        log.info("guide reply from cache")
        return cached
    if not limiter.allow(str(me.get("id"))):
        raise RateLimited()

    # Every question goes to the model: it decides, from the page map, the tools and the facts it is given.
    decision = await groq.chat_json(
        settings.decide_models,
        decide_prompt(req.pages, req.message, req.current_page, req.record is not None, req.locked_pages),
        _question_text(req),
        max_tokens=900,
    )
    reply = await _act(req, decision, backend, groq)
    reply.model = groq.last_model
    _remember(key, reply)
    return reply


async def _act(req: GuideRequest, decision: dict[str, Any], backend: BackendClient, groq: GroqClient) -> GuideResponse:
    kind = decision.get("kind")
    if kind in ("go", "point", "open", "fill", "say"):
        # A bare step instead of a plan: wrap it.
        decision = {"kind": "show", "title": decision.get("caption") or decision.get("title"), "steps": [{**decision, "action": kind}]}
        kind = "show"
    steps = [f"{s.get('action')}:{s.get('target') or s.get('page') or ''}" for s in decision.get("steps") or [] if isinstance(s, dict)]
    log.info("guide decision kind=%s tool=%s args=%s steps=%s", kind, decision.get("tool"), json.dumps(decision.get("args"))[:200], " ".join(steps)[:300])
    if kind == "show":
        return validate_show(decision, req.pages, req.current_page)
    if kind == "ask":
        return validate_ask(decision, req.pages)
    if kind == "answer":
        return validate_answer(decision, req.pages, decision.get("page"))
    if kind == "lookup":
        return await _lookup(req, decision, backend, groq)
    if kind == "none":
        message = str(decision.get("message") or "").strip()[:200]
        return none_reply(message) if message else none_reply()
    return none_reply()


def _links(tool: Tool, raw: Any) -> list[Link]:
    if not tool.links:
        return []
    try:
        found = tool.links(raw) or []
    except (AttributeError, TypeError):
        return []
    return [Link(label=str(link["label"]), path=str(link["path"])) for link in found if link.get("label") and link.get("path")][:5]


async def _lookup(req: GuideRequest, decision: dict[str, Any], backend: BackendClient, groq: GroqClient) -> GuideResponse:
    tool = TOOLS.get(str(decision.get("tool")))
    if tool is None or (tool.needs_record and req.record is None):
        return none_reply("I can’t look that up yet. Try asking where to find it instead.")
    page_ids = {p.id for p in req.pages}
    offer = decision.get("page") if decision.get("page") in page_ids else (tool.page if tool.page in page_ids else None)
    args = clean_args(tool, decision.get("args"))
    try:
        raw = await tool.fetch(backend, args, req) if tool.fetch else await backend.get(tool.path, args)
    except BackendDenied:
        # The backend's own answer, reported honestly: no access means no data.
        return GuideResponse(kind="answer", text="You don’t have access to that information, so I can’t look it up for you.", sources=[tool.path])
    if tool.render:
        written = tool.render(raw)
        table = written.get("table")
        reply = GuideResponse(kind="answer", text=str(written.get("text"))[:600], table=Table(**table) if table else None,
                              page=offer if offer in {p.id for p in req.pages if p.navigable} else None)
    else:
        data = tool.project(raw)
        user = f"Question: {req.message}\n\nDATA (from {tool.path}):\n{json.dumps(data, default=str)[:4000]}"
        written = await groq.chat_json(settings.answer_models, ANSWER, user, max_tokens=700)
        reply = validate_answer(written, req.pages, offer)
    reply.links = _links(tool, raw)
    reply.sources = [tool.path]
    return reply
