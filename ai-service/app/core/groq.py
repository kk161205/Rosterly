"""
Groq chat client (OpenAI-compatible). Always asks for a JSON object and parses
it; any failure — network, rate limit, bad JSON — becomes AIUnavailable, which
the API turns into 503 so the frontend falls back to the page map.
"""
import json
import logging
import re
import time
from typing import Any, Optional

import httpx

from app.core.config import settings

log = logging.getLogger("rosterly.ai")


class AIUnavailable(Exception):
    pass


# What Groq last said about each model's per-minute token allowance: (tokens left, when it refills).
# Shared by every request in this process (the service runs as one instance).
_budget: dict[str, tuple[int, float]] = {}


def _seconds(value: str) -> float:
    """Groq's reset times: "7.66s", "1m2.5s", "250ms"."""
    total = 0.0
    for number, unit in re.findall(r"([\d.]+)(ms|m|s|h)", value or ""):
        total += float(number) * {"ms": 0.001, "s": 1, "m": 60, "h": 3600}[unit]
    return total


def _note_budget(model: str, headers: httpx.Headers, status: int) -> None:
    left = headers.get("x-ratelimit-remaining-tokens")
    reset = _seconds(headers.get("x-ratelimit-reset-tokens", "")) or (_seconds(headers.get("retry-after", "") + "s") if status == 429 else 0)
    if left is not None:
        try:
            _budget[model] = (int(float(left)), time.time() + (reset or 60))
        except ValueError:
            pass
    elif status == 429:
        _budget[model] = (0, time.time() + (reset or 30))


def _from_failed_tool_call(res: httpx.Response) -> dict[str, Any] | None:
    """The reply Groq rejected as a tool call: {"name": .., "arguments": {..}} — the arguments are our JSON."""
    try:
        generated = json.loads(res.json()["error"]["failed_generation"])
        args = generated.get("arguments", generated) if isinstance(generated, dict) else None
        args = json.loads(args) if isinstance(args, str) else args
    except (KeyError, TypeError, ValueError):
        return None
    return args if isinstance(args, dict) and "kind" in args else None


def _has_room(model: str, need: int) -> bool:
    left, refills = _budget.get(model, (None, 0.0))
    return left is None or time.time() >= refills or left >= need


class GroqClient:
    def __init__(self, transport: Optional[httpx.AsyncBaseTransport] = None, api_key: Optional[str] = None):
        self._key = api_key if api_key is not None else settings.GROQ_API_KEY
        self.last_model: str | None = None
        self.last_usage: tuple[Any, Any] = (None, None)
        self._client = httpx.AsyncClient(
            base_url=settings.GROQ_BASE_URL,
            headers={"Authorization": f"Bearer {self._key}"},
            timeout=settings.GROQ_TIMEOUT_SECONDS,
            transport=transport,
        )

    async def chat_json(self, models: str | list[str], system: str, user: str, max_tokens: int = 700) -> dict[str, Any]:
        """Asks each model in turn until one answers: each Groq model has its own per-minute token
        allowance, so a busy one (429) hands over to the next. Records which model answered."""
        if not self._key:
            raise AIUnavailable("GROQ_API_KEY is not set")
        last = "no model"
        chain = [models] if isinstance(models, str) else models
        need = (len(system) + len(user)) // 4 + max_tokens // 2  # a rough token estimate for this call
        for i, model in enumerate(chain):
            if i < len(chain) - 1 and not _has_room(model, need):
                # Groq said this model's allowance for the minute is nearly spent: go straight to the next
                # instead of spending a round trip on a certain 429.
                last = f"{model} allowance spent"
                log.info("Groq %s has ~%s tokens left this minute; using the next model", model, _budget[model][0])
                continue
            body: dict[str, Any] = {
                "model": model,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                "temperature": 0.1,
                "max_completion_tokens": max_tokens,
                "response_format": {"type": "json_object"},
            }
            if model.startswith("openai/gpt-oss"):
                body["reasoning_effort"] = "low"
            try:
                res = await self._client.post("/chat/completions", json=body)
            except httpx.HTTPError as exc:
                last = f"Groq unreachable: {exc.__class__.__name__}"
                continue
            _note_budget(model, res.headers, res.status_code)
            # Busy, too large for this model, or JSON mode failed: the next model may manage.
            if res.status_code in (413, 429, 500, 502, 503) or (res.status_code == 400 and "json_validate_failed" in res.text):
                last = f"{model} returned {res.status_code}"
                log.warning("Groq %s on %s; trying the next model", res.status_code, model)
                continue
            if res.status_code == 400 and "tool_use_failed" in res.text:
                # gpt-oss sometimes wraps its JSON in a tool call; the JSON itself is usually fine.
                recovered = _from_failed_tool_call(res)
                if recovered is not None:
                    self.last_model = model
                    log.info("Groq %s answered through a tool call; used its JSON", model)
                    return recovered
                last = f"{model} called a tool"
                continue
            if res.status_code != 200:
                log.warning("Groq %s: %s", res.status_code, res.text[:200])
                raise AIUnavailable(f"Groq returned {res.status_code}")
            try:
                payload = res.json()
                content = payload["choices"][0]["message"]["content"]
                parsed = json.loads(content)
            except (KeyError, IndexError, TypeError, ValueError):
                last = f"{model} reply was not JSON"
                continue
            if not isinstance(parsed, dict):
                last = f"{model} reply was not a JSON object"
                continue
            usage = payload.get("usage") or {}
            self.last_model = model
            self.last_usage = (usage.get("prompt_tokens"), usage.get("completion_tokens"))
            log.info("Groq %s tokens in=%s out=%s", model, *self.last_usage)
            return parsed
        raise AIUnavailable(last)

    async def transcribe(self, audio: bytes, content_type: str) -> str:
        """Speech to text with Whisper (voice input). English; returns the plain text."""
        if not self._key:
            raise AIUnavailable("GROQ_API_KEY is not set")
        ext = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav"}.get(content_type.split(";")[0], "webm")
        try:
            res = await self._client.post(
                "/audio/transcriptions",
                files={"file": (f"speech.{ext}", audio, content_type)},
                data={"model": settings.GROQ_MODEL_SPEECH, "language": "en", "response_format": "json", "temperature": "0"},
            )
        except httpx.HTTPError as exc:
            raise AIUnavailable(f"Groq unreachable: {exc.__class__.__name__}") from exc
        if res.status_code != 200:
            log.warning("Groq speech %s: %s", res.status_code, res.text[:200])
            raise AIUnavailable(f"Groq speech returned {res.status_code}")
        try:
            return str(res.json().get("text", "")).strip()
        except ValueError as exc:
            raise AIUnavailable("Groq speech reply was not JSON") from exc

    async def aclose(self) -> None:
        await self._client.aclose()
