"""
FastAPI Application Entry Point

Configures and runs the Presales AI Assistant backend service.
Provides real-time WebSocket communication, Deepgram transcription,
and Gemini AI suggestions for presales consultants.
"""

import logging
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import health, websocket


def configure_logging() -> None:
    """Configure application logging."""
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)

    # Configure root logger
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
        ],
    )

    # Set specific loggers
    logging.getLogger("uvicorn").setLevel(log_level)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("websockets").setLevel(logging.WARNING)

    # Reduce noise from httpx/httpcore
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


# Configure logging on module load
configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan events.

    Startup:
    - Log configuration
    - Validate environment

    Shutdown:
    - Close active connections
    - Clean up resources
    """
    # Startup
    logger.info(f"Starting Presales AI Assistant v{app.version}")
    logger.info(f"Debug mode: {settings.debug}")
    logger.info(f"Deepgram model: {settings.deepgram_model}")
    logger.info(f"Gemini model: {settings.gemini_model}")

    # Validate configuration
    if not settings.deepgram_api_key:
        logger.warning("DEEPGRAM_API_KEY not set - transcription will be disabled")
    else:
        logger.info("Deepgram API key configured")

    if not settings.gemini_api_key:
        logger.warning("GEMINI_API_KEY not set - AI suggestions will use mock responses")
    else:
        logger.info("Gemini API key configured")

    yield

    # Shutdown
    logger.info("Shutting down Presales AI Assistant")

    # Close all WebSocket connections
    from app.routers.websocket import manager

    await manager.close_all()
    logger.info("All connections closed")


app = FastAPI(
    title="Presales AI Assistant",
    description="""
Real-time AI assistance for Technical Cloud Solutions Presales Consultants.

## Features

- **Real-time Transcription**: Stream audio and receive transcripts via WebSocket
- **Speaker Diarization**: Identify who is speaking (customer vs consultant)
- **AI Suggestions**: Get real-time response suggestions for customer questions
- **Question Classification**: Automatic categorization of questions (technical, pricing, etc.)

## WebSocket Protocol

Connect to `/ws/session` to start a session.

### Messages from Client

- `audio_chunk`: Send audio data for transcription
- `control`: Control commands (start, stop, clear_context, get_status)
- `ping`: Connection health check

### Messages to Client

- `transcript`: Real-time transcription results
- `suggestion`: AI-generated response suggestions
- `status`: Session status updates
- `error`: Error notifications
- `pong`: Response to ping
""",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS
# Allow Chrome extension origins and localhost for development
cors_origins = settings.cors_origins
if settings.debug:
    # In debug mode, be more permissive
    cors_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(websocket.router, tags=["WebSocket"])


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint with basic service information."""
    return {
        "name": "Presales AI Assistant",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "websocket": "/ws/session",
    }


@app.get("/config")
async def get_config() -> dict:
    """
    Get current configuration (non-sensitive values only).

    Useful for debugging and verification.
    """
    return {
        "deepgram_model": settings.deepgram_model,
        "gemini_model": settings.gemini_model,
        "audio_sample_rate": settings.audio_sample_rate,
        "audio_channels": settings.audio_channels,
        "enable_diarization": settings.enable_diarization,
        "max_response_tokens": settings.max_response_tokens,
        "temperature": settings.temperature,
        "deepgram_configured": bool(settings.deepgram_api_key),
        "gemini_configured": bool(settings.gemini_api_key),
    }


# For running directly with Python
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )
