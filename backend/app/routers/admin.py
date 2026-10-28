from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..audit import record_audit
from ..core.errors import ApiError
from ..core.security import hash_password
from ..database import get_db
from ..deps import require_roles
from ..models import (
    AssessmentAttempt,
    AuditEvent,
    Class,
    Lesson,
    Role,
    User,
    Worksheet,
)
from ..schemas import (
    AdminStatsOut,
    AdminUserOut,
    AdminUserPatchIn,
    AuditOut,
    PaginatedUsersOut,
)

router = APIRouter(prefix="/admin", tags=["admin"])
admin_only = require_roles(Role.ADMIN)


@router.get("/stats", response_model=AdminStatsOut)
def stats(user: User = Depends(admin_only), db: Session = Depends(get_db)):
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)

    def count(model, *conditions):
        return db.scalar(select(func.count()).select_from(model).where(*conditions)) or 0

    return {
        "users": count(User),
        "learners": count(User, User.role == Role.LEARNER),
        "teachers": count(User, User.role == Role.TEACHER),
        "admins": count(User, User.role == Role.ADMIN),
        "active_users_7d": count(User, User.last_login_at >= week_ago),
        "classes": count(Class),
        "lessons": count(Lesson),
        "attempts": count(AssessmentAttempt),
        "worksheets": count(Worksheet),
    }


@router.get("/users", response_model=PaginatedUsersOut)
def list_users(
    q: str | None = None,
    role: Role | None = None,
    active: bool | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    query = select(User)
    if q:
        term = f"%{q.strip()}%"
        query = query.where(or_(User.display_name.ilike(term), User.email.ilike(term)))
    if role:
        query = query.where(User.role == role)
    if active is not None:
        query = query.where(User.is_active.is_(active))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    users = list(
        db.scalars(query.order_by(User.created_at.desc()).limit(limit).offset(offset))
    )
    return {"total": total, "users": users}


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    payload: AdminUserPatchIn,
    request: Request,
    user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if not target:
        raise ApiError(404, "User not found.", "user_not_found")
    if target.id == user.id and (
        (payload.role is not None and payload.role != target.role)
        or payload.is_active is False
    ):
        raise ApiError(400, "You cannot demote or deactivate your own account.", "self_update_blocked")
    removing_admin = target.role == Role.ADMIN and (
        (payload.role is not None and payload.role != Role.ADMIN) or payload.is_active is False
    )
    if removing_admin:
        admin_count = db.scalar(
            select(func.count()).select_from(User).where(User.role == Role.ADMIN, User.is_active.is_(True))
        ) or 0
        if admin_count <= 1:
            raise ApiError(409, "At least one active administrator must remain.", "last_admin")
    if payload.password is not None:
        target.password_hash = hash_password(payload.password)
        target.token_version += 1
    if payload.role is not None and payload.role != target.role:
        target.role = payload.role
        target.token_version += 1
    if payload.is_active is not None and payload.is_active != target.is_active:
        target.is_active = payload.is_active
        target.token_version += 1
    record_audit(
        db,
        "admin.password_reset" if payload.password is not None else "admin.user_updated",
        user_id=user.id,
        request=request,
        entity_type="user",
        entity_id=target.id,
        detail={
            "role": target.role.value,
            "is_active": target.is_active,
            "password_reset": payload.password is not None,
        },
    )
    db.commit()
    db.refresh(target)
    return target


@router.get("/audit", response_model=list[AuditOut])
def audit_log(
    limit: int = Query(default=100, ge=1, le=500),
    action: str | None = None,
    user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    query = select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(limit)
    if action:
        query = query.where(AuditEvent.action.ilike(f"%{action}%"))
    return list(db.scalars(query))
