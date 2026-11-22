"""
Groq chat client (OpenAI-compatible). Always asks for a JSON object and parses
it; any failure — network, rate limit, bad JSON — becomes AIUnavailable, which
the API turns into 503 so the frontend falls back to the page map.
"""
import json
import logging
from typing import Any, Optional

import httpx

from app.core.config import settings

log = logging.getLogger("rosterly.ai")


class AIUnavailable(Exception):
    pass


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
        for model in [models] if isinstance(models, str) else models:
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
            # Busy, too large for this model, or JSON mode failed: the next model may manage.
            if res.status_code in (413, 429, 500, 502, 503) or (res.status_code == 400 and "json_validate_failed" in res.text):
                last = f"{model} returned {res.status_code}"
                log.warning("Groq %s on %s; trying the next model", res.status_code, model)
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
