from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("guruji.errors")

STATUS_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    413: "payload_too_large",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
    503: "service_unavailable",
}


class ApiError(Exception):
    def __init__(self, status_code: int, message: str, code: str | None = None, details=None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code or STATUS_CODES.get(status_code, "error")
        self.details = details


def error_body(code: str, message: str, request: Request | None = None, details=None) -> dict:
    body: dict = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    request_id = getattr(request.state, "request_id", None) if request else None
    if request_id:
        body["error"]["request_id"] = request_id
    return body


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error_handler(request: Request, exc: ApiError):
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.code, exc.message, request, exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        details = []
        for error in exc.errors():
            location = ".".join(str(part) for part in error.get("loc", ()) if part != "body")
            message = error.get("msg", "Invalid value")
            message = message.removeprefix("Value error, ")
            details.append({"field": location or "body", "message": message})
        return JSONResponse(
            status_code=422,
            content=error_body(
                "validation_error",
                "Please check the submitted information and try again.",
                request,
                details,
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(request: Request, exc: StarletteHTTPException):
        detail = exc.detail
        if isinstance(detail, dict):
            code = str(detail.get("code") or STATUS_CODES.get(exc.status_code, "error"))
            message = str(detail.get("message") or "Request failed")
        else:
            code = STATUS_CODES.get(exc.status_code, "error")
            message = str(detail or "Request failed")
        headers = {"WWW-Authenticate": "Cookie"} if exc.status_code == 401 else None
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(code, message, request),
            headers=headers,
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception):
        logger.exception(
            "Unhandled error request_id=%s path=%s",
            getattr(request.state, "request_id", "-"),
            request.url.path,
            exc_info=exc,
        )
        return JSONResponse(
            status_code=500,
            content=error_body(
                "internal_error",
                "Something went wrong on our side. Please try again.",
                request,
            ),
        )
