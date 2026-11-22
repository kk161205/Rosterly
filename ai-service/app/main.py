"""
Rosterly AI service: the Guide, voice input and onboarding
recommendations. Middleware only — no database; every read goes through the
core backend with the person's own token.
"""
import logging

from fastapi import FastAPI, Header, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.backend_client import BackendClient, BackendDenied, BackendUnavailable
from app.core.config import settings
from app.core.groq import AIUnavailable, GroqClient
from app.core.rate_limit import limiter
from app.guide.schemas import GuideRequest
from app.guide.service import GuideDisabled, NotSignedIn, RateLimited, guide, who_is_asking
from app.onboarding.recommend import recommend
from app.guide.speech import clean_transcript

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Rosterly AI Service", version="1.0.0", docs_url=None if settings.ENVIRONMENT == "production" else "/docs")

MAX_JSON_BYTES = 64_000  # a real /ai/guide request is ~10 KB


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    """Refuse oversized bodies before they're read or parsed."""
    limit = settings.VOICE_MAX_BYTES if request.url.path == "/ai/transcribe" else MAX_JSON_BYTES
    length = request.headers.get("content-length")
    if length is not None:
        try:
            too_big = int(length) > limit
        except ValueError:
            too_big = True
        if too_big:
            return error(413, "too_large", "That request is too large.")
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


def error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@app.exception_handler(RequestValidationError)
async def invalid_request(_request: Request, exc: RequestValidationError) -> JSONResponse:
    return error(400, "validation_error", "The request wasn’t in the expected shape.")


def _token(authorization: str | None) -> str | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization.removeprefix("Bearer ").strip() or None


# Tests replace these to avoid real network calls.
def make_backend(token: str) -> BackendClient:
    return BackendClient(token)


def make_groq() -> GroqClient:
    return GroqClient()


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/ai/guide")
async def ai_guide(body: GuideRequest, authorization: str | None = Header(default=None)):
    """POST /ai/guide: show the way, answer from the person's data, ask back, or say it can't help."""
    token = _token(authorization)
    if not token:
        return error(401, "not_authenticated", "Sign in to use the Guide.")
    backend, groq = make_backend(token), make_groq()
    try:
        reply = await guide(body, backend, groq, limiter)
        return reply.dump()
    except NotSignedIn:
        return error(401, "not_authenticated", "Your session has ended. Sign in again.")
    except GuideDisabled:
        return error(403, "ai_disabled", "The Guide is turned off.")
    except RateLimited:
        return error(429, "rate_limited", "That’s a lot of questions — try again in a minute.")
    except (AIUnavailable, BackendUnavailable) as exc:
        logging.getLogger("rosterly.ai").warning("guide unavailable: %s", exc)
        return error(503, "ai_unavailable", "The Guide can’t think right now.")
    finally:
        await backend.aclose()
        await groq.aclose()


@app.get("/ai/onboarding-recommendations")
async def onboarding_recommendations(
    designation: str = Query(..., min_length=2, max_length=100),
    department_id: str | None = Query(None, max_length=40),
    authorization: str | None = Header(default=None),
):
    """GET /ai/onboarding-recommendations: the usual equipment and licences for a new joiner
    like this one, from what similar recent joiners got. Persists nothing; HR saves through the normal path."""
    token = _token(authorization)
    if not token:
        return error(401, "not_authenticated", "Sign in first.")
    backend = make_backend(token)
    try:
        me = await who_is_asking(backend, personal_switch=False)
        if not limiter.allow(f"rec:{me.get('id')}"):
            return error(429, "rate_limited", "Too many requests — try again in a minute.")
        history = await backend.get("/onboarding/joiner-history")
        return recommend(history, department_id, designation)
    except NotSignedIn:
        return error(401, "not_authenticated", "Your session has ended. Sign in again.")
    except GuideDisabled:
        return error(403, "ai_disabled", "The AI assistant is turned off for your company.")
    except BackendDenied:
        return error(403, "forbidden", "Only people who add new joiners can see this.")
    except BackendUnavailable as exc:
        logging.getLogger("rosterly.ai").warning("recommendations unavailable: %s", exc)
        return error(503, "ai_unavailable", "Recommendations aren’t available right now.")
    finally:
        await backend.aclose()


@app.post("/ai/transcribe")
async def transcribe(request: Request, authorization: str | None = Header(default=None)):
    """POST /ai/transcribe (voice input): raw audio in the body (audio/webm, ogg, mp4…), up to ~15 s.
    Returns {text} for the Search-or-ask box; the person checks it and sends it themselves.
    Needs the Guide on (company + person) and the person's voice switch on."""
    token = _token(authorization)
    if not token:
        return error(401, "not_authenticated", "Sign in first.")
    content_type = request.headers.get("content-type", "")
    if not content_type.startswith("audio/"):
        return error(400, "validation_error", "Send audio.")
    audio = bytearray()
    async for chunk in request.stream():  # a hard cap even without a Content-Length header
        audio.extend(chunk)
        if len(audio) > settings.VOICE_MAX_BYTES:
            return error(400, "validation_error", "That recording is too long — keep it under 15 seconds.")
    audio = bytes(audio)
    if not audio:
        return error(400, "validation_error", "That recording is empty or too long — keep it under 15 seconds.")
    backend, groq = make_backend(token), make_groq()
    try:
        me = await who_is_asking(backend)
        try:
            prefs = await backend.get("/me/preferences")
        except BackendDenied:
            return error(401, "not_authenticated", "Your session has ended. Sign in again.")
        if not prefs.get("voice_enabled", False):
            return error(403, "voice_disabled", "Turn on voice input in Your assistant first.")
        if not limiter.allow(f"voice:{me.get('id')}"):
            return error(429, "rate_limited", "Too many recordings — try again in a minute.")
        return {"text": clean_transcript(await groq.transcribe(audio, content_type))}
    except NotSignedIn:
        return error(401, "not_authenticated", "Your session has ended. Sign in again.")
    except GuideDisabled:
        return error(403, "ai_disabled", "The Guide is turned off.")
    except (AIUnavailable, BackendUnavailable) as exc:
        logging.getLogger("rosterly.ai").warning("voice unavailable: %s", exc)
        return error(503, "ai_unavailable", "Voice input isn’t available right now.")
    finally:
        await backend.aclose()
        await groq.aclose()
