from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from starlette.exceptions import HTTPException
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .core.config import get_settings
from .core.errors import install_error_handlers
from .core.middleware import PlatformMiddleware
from .database import SessionLocal
from .routers import admin, auth, learning, skills, teacher, tutor, worksheets

settings = get_settings()
logger = logging.getLogger("guruji.app")
_static_dir = Path(settings.static_dir) if settings.static_dir else None
_serve_spa = bool(_static_dir and (_static_dir / "index.html").is_file())


def configure_logging() -> None:
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    logger.info(
        "startup app=%s version=%s environment=%s",
        settings.app_name,
        settings.app_version,
        settings.app_env,
    )
    yield
    logger.info("shutdown")


docs_enabled = settings.enable_docs
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "AI-assisted learning for learners, teachers and community digital-skills programmes. "
        "Scores are calculated on the server; tutor answers are grounded in lesson content."
    ),
    lifespan=lifespan,
    docs_url="/docs" if docs_enabled else None,
    redoc_url="/redoc" if docs_enabled else None,
    openapi_url="/openapi.json" if docs_enabled else None,
)

install_error_handlers(app)
app.add_middleware(PlatformMiddleware, settings=settings)
if settings.trusted_hosts != ["*"]:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.trusted_hosts)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
    max_age=600,
)

for module in (auth, learning, tutor, skills, teacher, worksheets, admin):
    app.include_router(module.router, prefix=settings.api_prefix)


@app.get("/", tags=["system"], include_in_schema=not _serve_spa)
def root():
    if _serve_spa and _static_dir:
        return FileResponse(_static_dir / "index.html")
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "api": settings.api_prefix,
        "docs": "/docs" if docs_enabled else None,
    }


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok", "version": settings.app_version}


@app.get("/ready", tags=["system"])
def ready():
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ready"}
    finally:
        db.close()


class SpaStaticFiles(StaticFiles):
    """Serve the built SPA, falling back to index.html for client-side routes."""

    def __init__(self, directory: str, excluded_prefixes: tuple[str, ...] = (), **kwargs):
        super().__init__(directory=directory, html=True, **kwargs)
        self.excluded_prefixes = tuple(prefix.strip("/") for prefix in excluded_prefixes)

    async def get_response(self, path: str, scope):
        clean = path.replace("\\", "/").lstrip("/")
        if any(
            clean == prefix or clean.startswith(prefix + "/")
            for prefix in self.excluded_prefixes
        ):
            raise HTTPException(status_code=404, detail="Not Found")
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            last_segment = path.rsplit("/", 1)[-1]
            if exc.status_code != 404 or "." in last_segment:
                raise
            return await super().get_response("index.html", scope)


_static_dir = Path(settings.static_dir) if settings.static_dir else None
if _serve_spa and _static_dir:
    app.mount(
        "/",
        SpaStaticFiles(
            str(_static_dir),
            excluded_prefixes=(settings.api_prefix, "health", "ready"),
        ),
        name="spa",
    )
    logger.info("serving frontend from %s", _static_dir)
