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

from app.api import auth, dashboard, departments, employees, onboarding

app.include_router(auth.router, prefix=settings.API_V1_PREFIX + "/auth", tags=["auth"])
app.include_router(dashboard.router, prefix=settings.API_V1_PREFIX + "/dashboard", tags=["dashboard"])
app.include_router(employees.router, prefix=settings.API_V1_PREFIX + "/employees", tags=["employees"])
app.include_router(departments.router, prefix=settings.API_V1_PREFIX + "/departments", tags=["departments"])
app.include_router(onboarding.router, prefix=settings.API_V1_PREFIX + "/onboarding", tags=["onboarding"])





@app.get("/health")
async def health_check():
    """Unauthenticated — used by docker-compose / deployment health checks only."""
    return {"status": "ok", "environment": settings.ENVIRONMENT}
