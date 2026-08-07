from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

app = FastAPI(title="Rosterly AI Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _extract_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")
    return authorization.removeprefix("Bearer ").strip()


@app.get("/health")
async def health_check():
    return {"status": "ok", "environment": settings.ENVIRONMENT}


@app.post("/ai/query")
async def query(authorization: str = Header(default=None)):
    """
    Project doc §8.4.2. Forwards the caller's token to the core backend
    for every underlying data call — see app/core/backend_client.py.
    TODO(agent): implement against app.agents.query_agent once the
    fixture-based test suite (project doc §8.6) exists.
    """
    token = _extract_token(authorization)
    raise NotImplementedError("Wire up app.agents.query_agent — see project doc §8.2.2")


@app.post("/ai/onboarding-suggestion")
async def onboarding_suggestion(authorization: str = Header(default=None)):
    """
    Project doc §8.4.2. Suggestion only — nothing is persisted by this
    call. The frontend calls POST /onboarding on the core backend
    separately once the HR Admin confirms the suggestion.
    """
    token = _extract_token(authorization)
    raise NotImplementedError("Wire up app.agents.orchestration_agent — see project doc §8.2.1")
