"""
Request details shared by every route.

`client_ip` is the caller's address, used for per-IP rate limits, login
attempts and audit rows. In production the API sits behind Render's proxy, so
the TCP peer is the proxy and the real address is in a header. Clients can put
anything at the START of X-Forwarded-For, so it is never trusted from the left:
- CLIENT_IP_HEADER (e.g. "True-Client-IP"), when set, is a header the proxy
  itself writes and the client can't forge;
- otherwise the entry TRUSTED_PROXY_HOPS from the right of X-Forwarded-For —
  the address the nearest trusted proxy saw (1 = Render's proxy).
Locally (TRUSTED_PROXY_HOPS=0) the TCP peer is used.
"""
from fastapi import Request

from app.core.config import settings

UNKNOWN_IP = "unknown"


def client_ip(request: Request) -> str:
    if settings.CLIENT_IP_HEADER:
        value = request.headers.get(settings.CLIENT_IP_HEADER.lower(), "").strip()
        if value:
            return value[:64]
    if settings.TRUSTED_PROXY_HOPS > 0:
        forwarded = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if forwarded:
            return forwarded[max(len(forwarded) - settings.TRUSTED_PROXY_HOPS, 0)][:64]
    return request.client.host if request.client and request.client.host else UNKNOWN_IP
