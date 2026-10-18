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
from app.modules.admin import permissions_router, roles_router, users_router
from app.modules.analytics import router as analytics_router
from app.modules.assets import maintenance_router
from app.modules.assets import router as assets_router
from app.modules.auth import router as auth_router
from app.modules.dashboard import router as dashboard_router
from app.modules.employees import departments_router
from app.modules.employees import router as employees_router
from app.modules.inbox import router as inbox_router
from app.modules.lifecycle import offboarding_router, onboarding_router
from app.modules.requests import router as requests_router

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

# (path under /api/v1, router module, OpenAPI tag) — grouped by feature module
ROUTES = [
    ("/auth", auth_router, "auth"),
    ("/dashboard", dashboard_router, "dashboard"),
    ("/inbox", inbox_router, "inbox"),
    ("/employees", employees_router, "employees"),
    ("/departments", departments_router, "employees"),
    ("/onboarding", onboarding_router, "lifecycle"),
    ("/offboarding", offboarding_router, "lifecycle"),
    ("/assets", assets_router, "assets"),
    ("/maintenance-tickets", maintenance_router, "maintenance-tickets"),
    ("/requests", requests_router, "requests"),
    ("/roles", roles_router, "roles"),
    ("/permissions", permissions_router, "roles"),
    ("/users", users_router, "users"),
    ("/analytics", analytics_router, "analytics"),
]

for path, module, tag in ROUTES:
    app.include_router(module.router, prefix=settings.API_V1_PREFIX + path, tags=[tag])


@app.get("/health")
async def health_check():
    """Unauthenticated — for uptime and deployment health checks only."""
    return {"status": "ok", "environment": settings.ENVIRONMENT}
