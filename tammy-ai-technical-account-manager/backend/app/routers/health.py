"""
Health Check Endpoint

Provides health status for monitoring and load balancer checks.
"""

import logging
from datetime import datetime
from typing import Dict, Any

from fastapi import APIRouter

from app.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """
    Health check endpoint.

    Returns service status and configuration information.
    """
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0",
        "config": {
            "deepgram_model": settings.deepgram_model,
            "gemini_model": settings.gemini_model,
            "diarization_enabled": settings.enable_diarization,
            "rag_collection": settings.rag_collection_name,
            "embedding_model": settings.embedding_model,
        },
    }


@router.get("/health/ready")
async def readiness_check() -> Dict[str, str]:
    """
    Readiness check for Kubernetes/container orchestration.

    Verifies the service is ready to accept traffic.
    """
    # TODO: Add checks for Deepgram, Gemini, and vector DB connections
    return {"status": "ready"}


@router.get("/health/live")
async def liveness_check() -> Dict[str, str]:
    """
    Liveness check for Kubernetes/container orchestration.

    Verifies the service is running.
    """
    return {"status": "alive"}


@router.get("/health/rag")
async def rag_status() -> Dict[str, Any]:
    """
    RAG knowledge base status.

    Returns information about the vector store and knowledge base.
    """
    try:
        from app.rag.vector_store import get_vector_store

        store = get_vector_store()
        stats = store.get_collection_stats()

        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "collection_name": stats["collection_name"],
            "document_count": stats["document_count"],
            "persist_directory": stats["persist_directory"],
            "embedding_model": settings.embedding_model,
        }

    except Exception as e:
        logger.error(f"RAG health check failed: {e}")
        return {
            "status": "unhealthy",
            "timestamp": datetime.utcnow().isoformat(),
            "error": str(e),
        }
