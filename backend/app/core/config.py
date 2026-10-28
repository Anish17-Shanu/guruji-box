from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SECRET = "development-only-change-me"


def _split(value: str) -> list[str]:
    return [item.strip().rstrip("/") for item in value.replace(";", ",").split(",") if item.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "GURUJI BOX"
    app_env: str = "development"
    app_version: str = "2.0.0"
    api_prefix: str = "/api/v1"
    log_level: str = "INFO"

    database_url: str = "sqlite:///./guruji.db"
    secret_key: str = DEFAULT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "guruji-box"
    jwt_audience: str = "guruji-web"
    session_days: int = 7
    cookie_name: str = "guruji_session"
    cookie_domain: str | None = None
    secure_cookies: bool | None = None

    frontend_origin: str = "http://localhost:5173"
    extra_origins: str = ""
    allowed_hosts: str = "*"
    trust_proxy_headers: bool = False

    seed_demo: bool = True
    allow_teacher_signup: bool = True
    content_dir: str = ""
    static_dir: str = ""
    docs_enabled: bool | None = None

    gemini_api_key: str | None = None
    gemini_model: str = "gemini-flash-lite-latest"
    tutor_timeout_seconds: float = 12.0
    worksheet_timeout_seconds: float = 30.0

    rate_limit_auth_per_minute: int = 20
    rate_limit_tutor_per_minute: int = 30
    rate_limit_default_per_minute: int = 600

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @property
    def is_test(self) -> bool:
        return self.app_env.lower() == "test"

    @property
    def origins(self) -> list[str]:
        values = [self.frontend_origin, *_split(self.extra_origins)]
        if not self.is_production:
            values.extend(
                [
                    "http://localhost:5173",
                    "http://127.0.0.1:5173",
                    "http://localhost:4173",
                    "http://127.0.0.1:4173",
                    "http://localhost:8080",
                    "http://127.0.0.1:8080",
                ]
            )
        return list(dict.fromkeys(value for value in _split(",".join(values)) if value))

    def is_origin_allowed(self, origin: str) -> bool:
        normalized = origin.rstrip("/").lower()
        if any(normalized == o.lower() for o in self.origins):
            return True
        if normalized.endswith(".vercel.app"):
            return True
        return False

    @property
    def trusted_hosts(self) -> list[str]:
        hosts = _split(self.allowed_hosts)
        return hosts or ["*"]

    @property
    def cookie_secure(self) -> bool:
        if self.secure_cookies is not None:
            return self.secure_cookies
        return self.is_production

    @property
    def enable_docs(self) -> bool:
        if self.docs_enabled is not None:
            return self.docs_enabled
        return not self.is_production

    @property
    def sqlite_path(self) -> Path | None:
        prefix = "sqlite:///"
        if not self.database_url.startswith(prefix):
            return None
        raw = self.database_url[len(prefix) :]
        if raw.startswith(":memory:") or raw.startswith("file:"):
            return None
        return Path(raw)

    @field_validator("secure_cookies", "docs_enabled", mode="before")
    @classmethod
    def blank_means_default(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @model_validator(mode="after")
    def validate_production(self) -> "Settings":
        if self.is_production and (self.secret_key == DEFAULT_SECRET or len(self.secret_key) < 32):
            raise ValueError("SECRET_KEY must be a unique value of at least 32 characters in production")
        if self.app_env.lower() not in {"development", "test", "production"}:
            raise ValueError("APP_ENV must be development, test or production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
