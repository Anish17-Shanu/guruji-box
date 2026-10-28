from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..audit import record_audit
from ..core.config import get_settings
from ..core.errors import ApiError
from ..core.security import (
    clear_session_cookie,
    create_access_token,
    hash_password,
    set_session_cookie,
    verify_password,
)
from ..database import get_db
from ..deps import get_current_user, get_optional_user
from ..models import (
    AssessmentAnswer,
    AssessmentAttempt,
    Class,
    ClassMembership,
    LearningProgress,
    Role,
    SkillProgress,
    TutorMessage,
    TutorSession,
    User,
)
from ..schemas import (
    ChangePasswordIn,
    DeleteAccountIn,
    LoginIn,
    ProfileUpdateIn,
    RegisterIn,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def _issue(user: User, response: Response) -> None:
    token = create_access_token(
        user.id, user.role.value, settings, token_version=user.token_version
    )
    set_session_cookie(response, token, settings)


@router.post("/register", response_model=UserOut, status_code=201)
def register(
    payload: RegisterIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    if payload.role == Role.TEACHER and not settings.allow_teacher_signup:
        raise ApiError(403, "Teacher sign-up is closed. Please contact your administrator.", "signup_closed")
    email = str(payload.email).lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise ApiError(409, "An account with this email already exists.", "email_taken")
    user = User(
        display_name=payload.display_name,
        email=email,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise ApiError(409, "An account with this email already exists.", "email_taken")
    record_audit(db, "auth.register", user_id=user.id, request=request, detail={"role": user.role.value})
    db.commit()
    db.refresh(user)
    _issue(user, response)
    return user


@router.post("/login", response_model=UserOut)
def login(
    payload: LoginIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    email = str(payload.email).lower()
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(payload.password, user.password_hash):
        record_audit(db, "auth.login_failed", request=request, detail={"email": email})
        db.commit()
        raise ApiError(401, "Invalid email or password.", "invalid_credentials")
    if not user.is_active:
        raise ApiError(403, "This account is disabled. Please contact your administrator.", "account_inactive")
    user.last_login_at = datetime.now(timezone.utc)
    record_audit(db, "auth.login", user_id=user.id, request=request)
    db.commit()
    db.refresh(user)
    _issue(user, response)
    return user


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    clear_session_cookie(response, settings)
    if user:
        record_audit(db, "auth.logout", user_id=user.id, request=request)
        db.commit()
    response.status_code = 204
    return response


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_profile(
    payload: ProfileUpdateIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.display_name = payload.display_name
    record_audit(db, "auth.profile_updated", user_id=user.id, request=request)
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password", status_code=204)
def change_password(
    payload: ChangePasswordIn,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise ApiError(400, "Your current password is incorrect.", "invalid_password")
    user.password_hash = hash_password(payload.new_password)
    user.token_version += 1
    record_audit(db, "auth.password_changed", user_id=user.id, request=request)
    db.commit()
    db.refresh(user)
    _issue(user, response)
    response.status_code = 204
    return response


@router.delete("/me", status_code=204)
def delete_account(
    payload: DeleteAccountIn,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.password, user.password_hash):
        raise ApiError(400, "Your password is incorrect.", "invalid_password")
    if user.role in {Role.TEACHER, Role.ADMIN}:
        owns = db.scalar(select(func.count(Class.id)).where(Class.teacher_id == user.id)) or 0
        if owns:
            raise ApiError(
                409,
                "Delete your classes before deleting your account.",
                "owns_classes",
            )
        if user.role == Role.ADMIN:
            raise ApiError(409, "Admin accounts must be removed through the server CLI.", "admin_delete_blocked")

    attempt_ids = select(AssessmentAttempt.id).where(AssessmentAttempt.user_id == user.id)
    session_ids = select(TutorSession.id).where(TutorSession.user_id == user.id)
    db.execute(delete(AssessmentAnswer).where(AssessmentAnswer.attempt_id.in_(attempt_ids)))
    db.execute(delete(AssessmentAttempt).where(AssessmentAttempt.user_id == user.id))
    db.execute(delete(TutorMessage).where(TutorMessage.session_id.in_(session_ids)))
    db.execute(delete(TutorSession).where(TutorSession.user_id == user.id))
    db.execute(delete(LearningProgress).where(LearningProgress.user_id == user.id))
    db.execute(delete(SkillProgress).where(SkillProgress.user_id == user.id))
    db.execute(delete(ClassMembership).where(ClassMembership.learner_id == user.id))
    user.display_name = "Deleted account"
    user.email = f"deleted-{user.id}-{secrets.token_hex(4)}@local.invalid"
    user.password_hash = hash_password(secrets.token_urlsafe(24))
    user.is_active = False
    record_audit(db, "auth.account_deleted", user_id=user.id, request=request)
    db.commit()
    clear_session_cookie(response, settings)
    response.status_code = 204
    return response
