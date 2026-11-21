"""
App configuration — loaded from environment variables only.
Never hardcode secrets here; every API route lives under API_V1_PREFIX.
"""
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "dev-secret-key-change-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    API_V1_PREFIX: str = "/api/v1"
    CORS_ORIGINS: str = "http://localhost:5173"

    DATABASE_URL: str = "postgresql://rosterly:changeme@localhost:5432/rosterly"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    JWT_SECRET_KEY: str = DEV_JWT_SECRET
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

    # Encrypts authenticator-app secrets at rest (a Fernet key:
    # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())").
    # Required in production; in development an empty value derives one from JWT_SECRET_KEY.
    MFA_ENCRYPTION_KEY: str = ""
    # Shown as the account name in authenticator apps.
    MFA_ISSUER: str = "Rosterly"

    # Per-IP limits on the public auth endpoints (stored in Postgres).
    AUTH_RATE_LIMITS_ENABLED: bool = True

    # Document vault upload limit. Allowed types are fixed: PDF, PNG, JPG.
    MAX_UPLOAD_SIZE_MB: int = 10

    # Leave & Attendance. Whether people check in themselves is a company
    # setting (attendance.manual_check_in), changed from Access → Settings.
    # Timezone that defines "today" for attendance and leave balances.
    ATTENDANCE_TIMEZONE: str = "Asia/Kolkata"

    # Where the real client address comes from behind a proxy (see app/core/request_context.py).
    CLIENT_IP_HEADER: str = ""
    TRUSTED_PROXY_HOPS: int = 0

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @model_validator(mode="after")
    def _refuse_unsafe_production_config(self) -> "Settings":
        """In production the app refuses to start on development defaults."""
        if not self.is_production:
            return self
        problems = []
        if self.JWT_SECRET_KEY == DEV_JWT_SECRET or len(self.JWT_SECRET_KEY) < 32:
            problems.append("JWT_SECRET_KEY must be set to a random value of at least 32 characters")
        if "localhost" in self.DATABASE_URL or "changeme" in self.DATABASE_URL:
            problems.append("DATABASE_URL must point at the real database")
        origins = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
        if not origins or any("localhost" in o or "127.0.0.1" in o for o in origins):
            problems.append("CORS_ORIGINS must list the deployed frontend's address, not localhost")
        if any(o.endswith("/") for o in origins):
            problems.append("CORS_ORIGINS entries must not end with '/' (the browser's Origin never does)")
        if not self.MFA_ENCRYPTION_KEY:
            problems.append("MFA_ENCRYPTION_KEY must be set (a Fernet key)")
        else:
            try:
                from cryptography.fernet import Fernet

                Fernet(self.MFA_ENCRYPTION_KEY)
            except (ValueError, TypeError):
                problems.append("MFA_ENCRYPTION_KEY must be a Fernet key (Fernet.generate_key())")
        if "localhost" in self.FRONTEND_BASE_URL:
            problems.append("FRONTEND_BASE_URL must be the deployed frontend's address")
        if problems:
            raise ValueError("Unsafe production configuration: " + "; ".join(problems))
        return self


settings = Settings()
