"""
Shared fakes for the AI service tests: no live Groq or backend calls.
Groq and the core backend are replaced at the HTTP layer (httpx.MockTransport),
so the real clients, prompts and validators run.
"""
import json
import pathlib
from typing import Any, Callable

import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.core.backend_client import BackendClient
from app.core.groq import GroqClient
from app.core.rate_limit import RateLimiter
from app.guide.schemas import Page

FIXTURES = pathlib.Path(__file__).parent / "fixtures"
TOKEN = "user-token-123"


def load_pages(name: str) -> list[dict[str, Any]]:
    return json.loads((FIXTURES / f"pages_{name}.json").read_text(encoding="utf-8"))


@pytest.fixture
def super_pages() -> list[dict[str, Any]]:
    return load_pages("super_admin")


@pytest.fixture
def employee_pages() -> list[dict[str, Any]]:
    return load_pages("employee")


@pytest.fixture
def page_models(super_pages) -> list[Page]:
    return [Page(**p) for p in super_pages]


class FakeBackend:
    """Answers backend paths from a dict; records every call with its Authorization header."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, str], str]] = []
        self.responses: dict[str, tuple[int, Any]] = {
            "/api/v1/auth/me": (200, {"id": "u-1", "full_name": "Asha", "role": "super_admin"}),
            "/api/v1/me/preferences": (200, {"assistant_enabled": True, "company_assistant_enabled": True}),
        }

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.calls.append((request.url.path, dict(request.url.params), request.headers.get("authorization", "")))
        status, body = self.responses.get(request.url.path, (404, {"error": {"message": "not found"}}))
        return httpx.Response(status, json=body)


class FakeGroq:
    """Returns queued model replies (dicts → JSON content, ints → HTTP status); records every request body."""

    def __init__(self) -> None:
        self.replies: list[Any] = []
        self.requests: list[dict[str, Any]] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/audio/transcriptions"):
            self.requests.append({"speech": True, "bytes": len(request.content)})
            reply = self.replies.pop(0) if self.replies else {"text": ""}
            return httpx.Response(reply, json={}) if isinstance(reply, int) else httpx.Response(200, json=reply)
        body = json.loads(request.content)
        self.requests.append(body)
        reply = self.replies.pop(0) if self.replies else {"kind": "none", "message": "no reply queued"}
        if isinstance(reply, int):
            return httpx.Response(reply, json={"error": {"message": "busy"}})
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(reply)}}], "usage": {"prompt_tokens": 100, "completion_tokens": 20}})


@pytest.fixture
def fakes(monkeypatch) -> tuple[FakeBackend, FakeGroq]:
    backend, groq = FakeBackend(), FakeGroq()
    import app.core.groq as groq_module
    import app.guide.service as service_module
    groq_module._budget.clear()  # one test's "busy" model must not carry into the next
    service_module._cache.clear()
    monkeypatch.setattr(main, "make_backend", lambda token: BackendClient(token, transport=httpx.MockTransport(backend.handler)))
    monkeypatch.setattr(main, "make_groq", lambda: GroqClient(transport=httpx.MockTransport(groq.handler), api_key="test-key"))
    monkeypatch.setattr(main, "limiter", RateLimiter(per_minute=100, per_day=1000))
    return backend, groq


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


@pytest.fixture
def ask(client, super_pages) -> Callable[..., httpx.Response]:
    def _ask(message: str, pages: list[dict[str, Any]] | None = None, token: str | None = TOKEN, **extra: Any) -> httpx.Response:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return client.post("/ai/guide", json={"message": message, "pages": pages or super_pages, **extra}, headers=headers)

    return _ask
