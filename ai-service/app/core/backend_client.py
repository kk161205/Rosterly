"""
Client for the core backend — / (token pass-through).

Every call carries the requesting user's own access token. This service has no
service account or admin credential, so the backend's RBAC/ABAC scoping
applies to everything the AI reads. Do not add a "service token" here.
"""
from typing import Any, Optional

import httpx

from app.core.config import settings


class BackendDenied(Exception):
    """The backend said no (401/403) — reported honestly, never worked around."""

    def __init__(self, status: int, message: str = ""):
        super().__init__(message or f"backend refused ({status})")
        self.status = status


class BackendUnavailable(Exception):
    pass


class BackendClient:
    def __init__(self, user_access_token: str, transport: Optional[httpx.AsyncBaseTransport] = None):
        if not user_access_token:
            raise ValueError("BackendClient requires the requesting user's own access token.")
        self._client = httpx.AsyncClient(
            base_url=settings.CORE_BACKEND_BASE_URL,
            headers={"Authorization": f"Bearer {user_access_token}"},
            timeout=60.0,  # a sleeping free-tier backend takes up to a minute to wake
            transport=transport,
        )

    async def get(self, path: str, params: Optional[dict[str, Any]] = None) -> Any:
        try:
            res = await self._client.get(path, params={k: v for k, v in (params or {}).items() if v is not None})
        except httpx.HTTPError as exc:
            raise BackendUnavailable(str(exc)) from exc
        if res.status_code in (401, 403):
            try:
                message = res.json().get("error", {}).get("message", "")
            except ValueError:
                message = ""
            raise BackendDenied(res.status_code, message)
        if res.status_code >= 400:
            raise BackendUnavailable(f"{path} → {res.status_code}")
        try:
            return res.json()
        except ValueError as exc:
            raise BackendUnavailable(f"{path} returned non-JSON") from exc

    async def aclose(self) -> None:
        await self._client.aclose()
