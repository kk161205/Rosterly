"""
AI service configuration.

DELIBERATELY has no DATABASE_URL or any DB connection field — project
doc §8.1 states this as a hard rule: "the AI service never writes
directly to the primary database... It holds no direct database
connection string — this is enforced architecturally, not just by
convention." Do not add one. If a task seems to require direct DB
access from this service, that's a sign the task is misunderstood —
stop and re-check against the documented architecture (see rules.md
§3 rule 9).
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENVIRONMENT: str = "development"
    CORE_BACKEND_BASE_URL: str = "http://localhost:8000/api/v1"

    LLM_PROVIDER: str = ""
    LLM_API_KEY: str = ""


settings = Settings()
