"""
App configuration — loaded from environment variables only.
Never hardcode secrets here. See rules.md §4 and project doc §7 rule 6 (API versioning).
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENVIRONMENT: str = "development"
    API_V1_PREFIX: str = "/api/v1"
    CORS_ORIGINS: str = "http://localhost:5173"

    DATABASE_URL: str = "postgresql://rosterly:changeme@localhost:5432/rosterly"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    JWT_SECRET_KEY: str = "dev-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_ADDRESS: str = "noreply@rosterly.example"
    # Master switch for outgoing email (invites, password resets, critical
    # notifications). Off until real SMTP credentials are supplied — with it
    # off, emails are built but never sent.
    EMAIL_DELIVERY_ENABLED: bool = False
    # Base URL of the frontend, used to build set-password / reset links in emails.
    FRONTEND_BASE_URL: str = "http://localhost:5173"
    INVITE_TOKEN_EXPIRE_HOURS: int = 72

    # Document vault upload limit (§7 rule 8). Allowed types are fixed by the spec: PDF, PNG, JPG.
    MAX_UPLOAD_SIZE_MB: int = 10


settings = Settings()
