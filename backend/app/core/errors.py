"""
Standard error envelope.

Every non-2xx response across every endpoint uses this exact shape:
    {"error": {"code": str, "message": str, "field_errors": dict | None}}

Do not return a bare string or an ad-hoc error shape from any handler —
that is what lets the frontend build one shared error-handling layer
instead of one per page. See.
"""
import logging

from fastapi import Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("rosterly.errors")


class AppError(HTTPException):
    """Raise this (or a subclass) from route handlers instead of a bare HTTPException."""

    def __init__(self, status_code: int, code: str, message: str, field_errors: dict | None = None):
        super().__init__(status_code=status_code, detail=message)
        self.code = code
        self.message = message
        self.field_errors = field_errors


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "field_errors": exc.field_errors,
            }
        },
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    field_errors: dict[str, str] = {}
    for err in exc.errors():
        loc = ".".join(str(x) for x in err.get("loc", []) if x not in ("body", "query", "path"))
        field_errors[loc or "general"] = err.get("msg", "Invalid value")
    return JSONResponse(
        status_code=400,
        content={
            "error": {
                "code": "validation_error",
                "message": "Validation failed",
                "field_errors": field_errors or None,
            }
        },
    )


_HTTP_CODES = {404: "not_found", 405: "method_not_allowed", 401: "unauthenticated", 403: "forbidden"}


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Framework errors (unknown route, wrong method…) in the same envelope."""
    if isinstance(exc, AppError):
        return await app_error_handler(request, exc)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": _HTTP_CODES.get(exc.status_code, "http_error"),
                "message": str(exc.detail) if exc.detail else "Request failed",
                "field_errors": None,
            }
        },
        headers=getattr(exc, "headers", None),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Never leak internals in the message — the traceback goes to the server log
    # (with the request ID), not to the client.
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "internal_error",
                "message": "Something went wrong. Please try again.",
                "field_errors": None,
            }
        },
    )


# Common reusable errors, named per the codes already referenced
class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found"):
        super().__init__(404, "not_found", message)


class ForbiddenError(AppError):
    def __init__(self, message: str = "You do not have permission to do this", code: str = "forbidden"):
        super().__init__(403, code, message)


class UnauthenticatedError(AppError):
    def __init__(self, message: str = "Unauthenticated", code: str = "unauthenticated"):
        super().__init__(401, code, message)


class AccountLockedError(AppError):
    def __init__(self, message: str = "Too many failed attempts. Account locked for 15 minutes."):
        super().__init__(400, "account_locked", message)


class ValidationAppError(AppError):
    def __init__(self, message: str = "Validation failed", field_errors: dict | None = None):
        super().__init__(400, "validation_error", message, field_errors)


class ConflictError(AppError):
    def __init__(self, message: str = "Conflict", code: str = "conflict"):
        super().__init__(409, code, message)


class FileInvalidError(AppError):
    """rejected uploads return 400 with code: file_invalid."""

    def __init__(self, message: str = "Invalid file"):
        super().__init__(400, "file_invalid", message)

