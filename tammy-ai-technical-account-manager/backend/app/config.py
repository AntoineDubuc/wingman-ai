"""
Application Configuration

Manages environment variables and application settings using Pydantic Settings.
"""

from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    backend_ws_url: str = "ws://localhost:8000/ws/session"

    # CORS
    cors_origins: List[str] = ["chrome-extension://*", "http://localhost:*"]

    # Deepgram
    deepgram_api_key: str = ""
    deepgram_model: str = "nova-3"
    audio_sample_rate: int = 16000
    audio_channels: int = 1
    enable_diarization: bool = True

    # Google Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    max_response_tokens: int = 500
    temperature: float = 0.3

    # RAG / Knowledge Base
    rag_collection_name: str = "presales_knowledge"
    embedding_model: str = "gemini-embedding-001"
    chroma_persist_directory: str = "./data/chroma"

    # Pinecone (production)
    pinecone_api_key: str = ""
    pinecone_environment: str = ""
    pinecone_index_name: str = ""

    # Logging
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Global settings instance
settings = get_settings()
