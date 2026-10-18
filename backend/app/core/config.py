from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")
    app_env: str = "development"
    database_url: str = "sqlite:///./guruji.db"
    secret_key: str = "development-only-change-me"
    frontend_origin: str = "http://localhost:5173"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    tutor_timeout_seconds: float = 12
    @property
    def secure_cookies(self): return self.app_env != "development"
@lru_cache
def get_settings(): return Settings()
