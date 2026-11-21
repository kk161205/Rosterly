from fastapi import APIRouter, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.errors import (
    AppError,
    app_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.core.logging import RequestContextMiddleware, configure_logging
from app.modules.admin import roles_router, users_router
from app.modules.analytics import router as analytics_router
from app.modules.approval_chains import router as approval_chains_router
from app.modules.assets import maintenance_router
from app.modules.assets import router as assets_router
from app.modules.audit import router as audit_router
from app.modules.auth import router as auth_router
from app.modules.dashboard import router as dashboard_router
from app.modules.employees import departments_router
from app.modules.employees import router as employees_router
from app.modules.inbox import router as inbox_router
from app.modules.leave import attendance_router, policy_router, router as leave_router
from app.modules.licenses import router as licenses_router
from app.modules.lifecycle import offboarding_router, onboarding_router
from app.modules.notifications import router as notifications_router
from app.modules.requests import router as requests_router
from app.modules.settings import router as settings_router
from app.modules.preferences import router as preferences_router

configure_logging()

# API docs are for development only — not published in production.
_docs = {} if not settings.is_production else {"docs_url": None, "redoc_url": None, "openapi_url": None}
app = FastAPI(title="Rosterly API", version="1.0.0", **_docs)

allowed_origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID", "Content-Disposition"],
)
app.add_middleware(RequestContextMiddleware)

app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
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
    ("/users", users_router, "users"),
    ("/analytics", analytics_router, "analytics"),
    ("/notifications", notifications_router, "notifications"),
    ("/audit-logs", audit_router, "audit"),
    ("/approval-chains", approval_chains_router, "approval-chains"),
    ("/software-licenses", licenses_router, "software-licenses"),
    ("/leave-requests", leave_router, "leave"),
    ("/attendance", attendance_router, "attendance"),
    ("/leave-types", policy_router.types_router, "leave"),
    ("/holidays", policy_router.holidays_router, "leave"),
    ("/leave-balances", policy_router.balances_router, "leave"),
    ("/company-settings", settings_router, "settings"),
    ("/me", preferences_router, "preferences"),
]

for path, module, tag in ROUTES:
    router = module if isinstance(module, APIRouter) else module.router
    app.include_router(router, prefix=settings.API_V1_PREFIX + path, tags=[tag])


@app.get("/health")
async def health_check():
    """Unauthenticated — for uptime and deployment health checks only."""
    return {"status": "ok"}
