"""
Client for calling the core backend — project doc §8.4.1 (authentication
pass-through).

Every call this service makes to the core backend MUST include the
originating user's own access token, forwarded from the request that
hit this service. This service has no elevated service-account
credentials of its own for reading user data — it is a client of the
core API like any other, which is what keeps RBAC/ABAC (project doc §3)
automatically enforced for AI-driven queries too.

Do not add a "service token" or admin credential here to simplify
calling the backend — that would silently bypass the RBAC scoping this
whole design depends on. See rules.md §5 rule 5 (least privilege).
"""
import httpx

from app.core.config import settings


class BackendClient:
    def __init__(self, user_access_token: str):
        if not user_access_token:
            raise ValueError(
                "BackendClient requires the requesting user's own access token — "
                "never call the core backend without forwarding it."
            )
        self._client = httpx.AsyncClient(
            base_url=settings.CORE_BACKEND_BASE_URL,
            headers={"Authorization": f"Bearer {user_access_token}"},
        )

    async def get(self, path: str, params: dict | None = None) -> httpx.Response:
        return await self._client.get(path, params=params)

    async def close(self):
        await self._client.aclose()
