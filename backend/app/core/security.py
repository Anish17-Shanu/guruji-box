from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import Settings

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

_WEAK_PASSWORDS = {
    "password123",
    "password1234",
    "1234567890",
    "qwerty12345",
    "letmein1234",
}


class InvalidTokenError(Exception):
    pass


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return pwd_context.verify(password, password_hash)
    except ValueError:
        return False


def validate_password_strength(password: str) -> str:
    if len(password) < 10:
        raise ValueError("Password must be at least 10 characters long")
    if len(password) > 128:
        raise ValueError("Password must be at most 128 characters long")
    if not re.search(r"[A-Za-z]", password):
        raise ValueError("Password must include at least one letter")
    if not re.search(r"\d", password):
        raise ValueError("Password must include at least one number")
    if password.lower() in _WEAK_PASSWORDS:
        raise ValueError("This password is too common")
    return password


def create_access_token(
    user_id: int, role: str, settings: Settings, token_version: int = 0
) -> str:
    issued_at = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "ver": token_version,
        "iat": issued_at,
        "exp": issued_at + timedelta(days=settings.session_days),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str, settings: Settings) -> dict:
    try:
        return jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
        )
    except JWTError as exc:
        raise InvalidTokenError from exc


def set_session_cookie(response, token: str, settings: Settings) -> None:
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.session_days * 86400,
        path="/",
        domain=settings.cookie_domain,
    )


def clear_session_cookie(response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.cookie_name,
        path="/",
        domain=settings.cookie_domain,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
