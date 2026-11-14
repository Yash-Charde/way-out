"""Settings, read from env vars (see .env.example). ENV picks the database: wayout_<env>."""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

VERSION = "0.0.1"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    env: Literal["dev", "staging", "prod", "test"] = "dev"
    git_sha: str = "local"

    mongodb_uri: str = "mongodb://localhost:27017"
    tiger_database_url: str = ""

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    anthropic_api_key: str = ""
    claude_fallback_model: str = "claude-sonnet-5-5"
    claude_judge_model: str = "claude-opus-5-5"
    # Best Use of AWS (D1-10): Claude through Amazon Bedrock. AWS keys come from the standard AWS_* env vars.
    claude_provider: Literal["anthropic", "bedrock"] = "anthropic"
    aws_region: str = "us-west-2"
    bedrock_fallback_model: str = ""  # Bedrock model ID for the Sonnet fallback (from the Bedrock console)
    bedrock_judge_model: str = ""  # Bedrock model ID for the Opus judge

    cartesia_api_key: str = ""
    cartesia_agent_id: str = ""
    cartesia_from_number_id: str = ""
    firms_map_key: str = ""
    tinyfish_api_key: str = ""

    public_api_url: str = "http://localhost:8000"
    internal_token: str = "dev-token-change-me"
    cors_origins: str = "*"  # comma-separated

    # Background workers (offer expiry, change streams). Off in tests.
    run_workers: bool = True
    offer_ttl_seconds: int = 120

    @property
    def db_name(self) -> str:
        return f"wayout_{self.env}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
