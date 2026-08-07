"""
Standard error envelope — project doc §7 rule 7.

Every non-2xx response across every endpoint uses this exact shape:
    {"error": {"code": str, "message": str, "field_errors": dict | None}}

Do not return a bare string or an ad-hoc error shape from any handler —
that is what lets the frontend build one shared error-handling layer
instead of one per page. See rules.md §3 rule 4.
"""
from fastapi import Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


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


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Never leak internals in the message — log the real exception server-side instead.
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


# Common reusable errors, named per the codes already referenced in the project doc
class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found"):
        super().__init__(404, "not_found", message)


class ForbiddenError(AppError):
    def __init__(self, message: str = "You do not have permission to do this"):
        super().__init__(403, "forbidden", message)


class ValidationAppError(AppError):
    def __init__(self, message: str = "Validation failed", field_errors: dict | None = None):
        super().__init__(400, "validation_error", message, field_errors)


class ConflictError(AppError):
    def __init__(self, message: str = "Conflict", code: str = "conflict"):
        super().__init__(409, code, message)
