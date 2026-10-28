from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import Settings
from .errors import error_body

logger = logging.getLogger("guruji.request")


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._calls = 0

    def check(self, key: str, limit: int, window: float = 60.0) -> tuple[bool, int]:
        if limit <= 0:
            return True, 0
        now = time.monotonic()
        queue = self._hits[key]
        while queue and queue[0] <= now - window:
            queue.popleft()
        if len(queue) >= limit:
            return False, max(1, int(window - (now - queue[0])))
        queue.append(now)
        self._calls += 1
        if self._calls % 1000 == 0:
            self._purge(now, window)
        return True, 0

    def _purge(self, now: float, window: float) -> None:
        stale = [key for key, queue in self._hits.items() if not queue or queue[-1] <= now - window]
        for key in stale:
            self._hits.pop(key, None)

    def reset(self) -> None:
        self._hits.clear()


class PlatformMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, settings: Settings):
        super().__init__(app)
        self.settings = settings
        self.limiter = RateLimiter()

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id", "")[:64] or uuid.uuid4().hex
        request.state.request_id = request_id
        path = request.url.path
        origin = request.headers.get("origin")

        if (
            origin
            and request.method not in {"GET", "HEAD", "OPTIONS"}
            and origin.rstrip("/") not in self.settings.origins
        ):
            return self._respond(
                request,
                JSONResponse(
                    status_code=403,
                    content=error_body("origin_not_allowed", "Request origin is not allowed.", request),
                ),
                request_id,
            )

        limited = self._rate_limit(request)
        if limited is not None:
            return limited

        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception("request_failed request_id=%s method=%s path=%s", request_id, request.method, path)
            raise
        duration_ms = (time.perf_counter() - started) * 1000

        response.headers["X-Request-ID"] = request_id
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()"
        )
        if self.settings.is_production and (
            request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
        ):
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        if self._is_private_path(path):
            response.headers.setdefault("Cache-Control", "no-store")
        if request.method != "GET" and response.status_code < 400:
            logger.info(
                "request method=%s path=%s status=%s duration_ms=%.1f request_id=%s",
                request.method,
                path,
                response.status_code,
                duration_ms,
                request_id,
            )
        return response

    def _rate_limit(self, request: Request) -> JSONResponse | None:
        path = request.url.path
        if request.method == "OPTIONS" or not path.startswith(self.settings.api_prefix):
            return None
        if path.endswith("/auth/login") or path.endswith("/auth/register"):
            limit = self.settings.rate_limit_auth_per_minute
            bucket = "auth"
        elif path.endswith("/tutor/chat"):
            limit = self.settings.rate_limit_tutor_per_minute
            bucket = "tutor"
        else:
            limit = self.settings.rate_limit_default_per_minute
            bucket = "api"
        ip = self._client_ip(request)
        allowed, retry_after = self.limiter.check(f"{bucket}:{ip}", limit)
        if allowed:
            return None
        response = JSONResponse(
            status_code=429,
            content=error_body(
                "rate_limited",
                "Too many requests. Please wait a moment and try again.",
                request,
            ),
            headers={"Retry-After": str(retry_after)},
        )
        return self._respond(request, response, request.state.request_id)

    def _client_ip(self, request: Request) -> str:
        if self.settings.trust_proxy_headers:
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _is_private_path(self, path: str) -> bool:
        markers = (
            "/auth/",
            "/teacher/",
            "/admin/",
            "/worksheets",
            "/progress",
            "/assessments",
            "/tutor/sessions",
        )
        return path.startswith(self.settings.api_prefix) and any(marker in path for marker in markers)

    def _respond(self, request: Request, response: JSONResponse, request_id: str) -> JSONResponse:
        response.headers.setdefault("X-Request-ID", request_id)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return response
