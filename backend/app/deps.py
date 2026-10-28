from __future__ import annotations

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from .core.config import get_settings
from .core.errors import ApiError
from .core.security import InvalidTokenError, decode_access_token
from .database import get_db
from .models import Class, Role, User

settings = get_settings()


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    raw = request.cookies.get(settings.cookie_name)
    if not raw:
        raise ApiError(401, "Please log in to continue.", "not_authenticated")
    try:
        payload = decode_access_token(raw, settings)
    except InvalidTokenError:
        raise ApiError(401, "Your session has expired. Please log in again.", "invalid_session")
    try:
        user_id = int(payload.get("sub", ""))
    except (TypeError, ValueError):
        raise ApiError(401, "Your session is invalid. Please log in again.", "invalid_session")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise ApiError(401, "Your account is unavailable. Please contact your administrator.", "account_inactive")
    try:
        token_version = int(payload.get("ver", 0))
    except (TypeError, ValueError):
        token_version = -1
    if token_version != user.token_version:
        raise ApiError(401, "Your session is no longer valid. Please log in again.", "session_revoked")
    return user


def get_optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    try:
        return get_current_user(request, db)
    except ApiError:
        return None


def require_roles(*roles: Role):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise ApiError(403, "You do not have access to this area.", "forbidden")
        return user

    return dependency


def get_owned_class(class_id: int, user: User, db: Session) -> Class:
    classroom = db.get(Class, class_id)
    if not classroom or (classroom.teacher_id != user.id and user.role != Role.ADMIN):
        raise ApiError(404, "Class not found.", "class_not_found")
    return classroom
