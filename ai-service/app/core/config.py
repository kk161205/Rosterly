"""
AI service configuration.

DELIBERATELY has no DATABASE_URL or any database setting —:
the AI service never touches the database; it reads through the core
backend's own endpoints with the requesting user's token. Do not add one.
"""
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENVIRONMENT: str = "development"
    CORE_BACKEND_BASE_URL: str = "http://localhost:8000/api/v1"
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Groq (OpenAI-compatible API). The key lives only here.
    GROQ_API_KEY: str = ""
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    # Small and fast for choosing what to do; larger for writing answers from data.
    GROQ_MODEL_FAST: str = "openai/gpt-oss-20b"
    GROQ_MODEL_SMART: str = "openai/gpt-oss-120b"
    # Tried in turn when the first is busy — each model has its own per-minute token allowance.
    GROQ_MODEL_SPARE: str = "qwen/qwen3.8-27b"
    GROQ_TIMEOUT_SECONDS: float = 25.0
    # Speech to text (voice input) — its own Groq allowance, separate from the chat models.
    GROQ_MODEL_SPEECH: str = "whisper-large-v3-turbo"
    VOICE_MAX_BYTES: int = 1_500_000  # ~15 s of compressed audio

    # Per person, in this process (one instance on Render).
    AI_RATE_PER_MINUTE: int = 12
    AI_RATE_PER_DAY: int = 300

    @model_validator(mode="after")
    def _refuse_unsafe_production_config(self) -> "Settings":
        if self.ENVIRONMENT != "production":
            return self
        problems = []
        if not self.GROQ_API_KEY:
            problems.append("GROQ_API_KEY is empty")
        if not self.CORE_BACKEND_BASE_URL or "localhost" in self.CORE_BACKEND_BASE_URL or "127.0.0.1" in self.CORE_BACKEND_BASE_URL:
            problems.append("CORE_BACKEND_BASE_URL must be the deployed API address")
        origins = self.cors_origins
        if not origins or any("localhost" in o or "127.0.0.1" in o for o in origins):
            problems.append("CORS_ORIGINS must list the deployed frontend address")
        if any(o.endswith("/") for o in origins):
            problems.append("CORS_ORIGINS entries must not end with '/' (the browser's Origin never does)")
        if problems:
            raise ValueError("Refusing to start in production: " + "; ".join(problems))
        return self

    @property
    def decide_models(self) -> list[str]:
        return [m for m in (self.GROQ_MODEL_FAST, self.GROQ_MODEL_SPARE, self.GROQ_MODEL_SMART) if m]

    @property
    def answer_models(self) -> list[str]:
        return [m for m in (self.GROQ_MODEL_SMART, self.GROQ_MODEL_SPARE, self.GROQ_MODEL_FAST) if m]

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
