from __future__ import annotations

from fastapi import Request
from sqlalchemy.orm import Session

from .core.config import get_settings
from .models import AuditEvent

settings = get_settings()


def get_client_ip(request: Request) -> str | None:
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def record_audit(
    db: Session,
    action: str,
    *,
    user_id: int | None = None,
    request: Request | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    detail: dict | None = None,
) -> None:
    db.add(
        AuditEvent(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            detail=detail or {},
            ip=get_client_ip(request) if request else None,
        )
    )
