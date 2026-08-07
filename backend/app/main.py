from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import (
    AppError,
    app_error_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)

app = FastAPI(title="Rosterly API", version="0.1.0")

allowed_origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# Route modules are registered here as they're built, e.g.:
# from app.api import auth, employees, assets, requests
# app.include_router(auth.router, prefix=settings.API_V1_PREFIX + "/auth", tags=["auth"])
#
# See ROSTERLY_PROJECT_DOCUMENTATION.md §5 for the full endpoint list,
# and §7 rule 6 — every path is relative to /api/v1.


@app.get("/health")
async def health_check():
    """Unauthenticated — used by docker-compose / deployment health checks only."""
    return {"status": "ok", "environment": settings.ENVIRONMENT}
