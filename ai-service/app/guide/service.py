"""
The Guide's brain.

1. Who is asking, and may they use the Guide? — the backend says, with their token.
2. Decide (fast model): show the way, look something up, explain, ask back, or can't help.
   This stage sees only the question and the page map.
3. If a lookup: read one whitelisted endpoint with their token, then write the
   answer (larger model) from that data — a stage that can only produce text.
4. Every reply is validated before it leaves.
"""
import json
import logging
from typing import Any

from app.core.backend_client import BackendClient, BackendDenied
from app.core.config import settings
from app.core.groq import GroqClient
from app.core.rate_limit import RateLimiter
from app.guide.prompts import ANSWER, decide_prompt
from app.guide.schemas import GuideRequest, GuideResponse
from app.guide.tools import TOOLS, clean_args
from app.guide.validate import none_reply, validate_answer, validate_ask, validate_show

log = logging.getLogger("rosterly.ai")


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
    parts.append(f"Question: {req.message}")
    return "\n".join(parts)


async def guide(req: GuideRequest, backend: BackendClient, groq: GroqClient, limiter: RateLimiter) -> GuideResponse:
    me = await who_is_asking(backend)
    if not limiter.allow(str(me.get("id"))):
        raise RateLimited()

    decision = await groq.chat_json(settings.decide_models, decide_prompt(req.pages, req.message, req.current_page), _question_text(req), max_tokens=900)
    kind = decision.get("kind")
    if kind in ("go", "point", "open", "fill", "say"):
        # A bare step instead of a plan: wrap it.
        decision = {"kind": "show", "title": decision.get("caption") or decision.get("title"), "steps": [{**decision, "action": kind}]}
        kind = "show"
    log.info("guide decision kind=%s", kind)

    if kind == "show":
        reply = validate_show(decision, req.pages, req.current_page)
    elif kind == "ask":
        reply = validate_ask(decision, req.pages)
    elif kind == "answer":
        reply = validate_answer(decision, req.pages, decision.get("page"))
    elif kind == "lookup":
        reply = await _lookup(req, decision, backend, groq)
    elif kind == "none":
        message = str(decision.get("message") or "").strip()[:200]
        reply = none_reply(message) if message else none_reply()
    else:
        reply = none_reply()
    reply.model = groq.last_model
    return reply


async def _lookup(req: GuideRequest, decision: dict[str, Any], backend: BackendClient, groq: GroqClient) -> GuideResponse:
    tool = TOOLS.get(str(decision.get("tool")))
    if tool is None:
        return none_reply("I can’t look that up yet. Try asking where to find it instead.")
    page_ids = {p.id for p in req.pages}
    offer = decision.get("page") if decision.get("page") in page_ids else (tool.page if tool.page in page_ids else None)
    try:
        data = tool.project(await backend.get(tool.path, clean_args(tool, decision.get("args"))))
    except BackendDenied:
        # The backend's own answer, reported honestly: no access means no data.
        return GuideResponse(kind="answer", text="You don’t have access to that information, so I can’t look it up for you.", sources=[tool.path])
    user = f"Question: {req.message}\n\nDATA (from {tool.path}):\n{json.dumps(data, default=str)[:6000]}"
    written = await groq.chat_json(settings.answer_models, ANSWER, user, max_tokens=900)
    reply = validate_answer(written, req.pages, offer)
    reply.sources = [tool.path]
    return reply
