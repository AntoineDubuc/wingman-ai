"""
Pydantic Schemas

Defines message schemas for WebSocket communication between
the Chrome extension and the backend server.
"""

from datetime import datetime
from typing import List, Optional, Literal, Any
from pydantic import BaseModel, Field


# =============================================================================
# Client -> Server Messages
# =============================================================================


class AudioChunkMessage(BaseModel):
    """Audio chunk message from client."""

    type: Literal["audio_chunk"] = "audio_chunk"
    data: Optional[List[int]] = Field(None, description="Audio samples as 16-bit PCM integers")
    audio_base64: Optional[str] = Field(None, description="Base64-encoded audio bytes")
    timestamp: Optional[int] = Field(None, description="Unix timestamp in milliseconds")
    sequence: Optional[int] = Field(None, description="Sequence number for ordering")


class ControlMessage(BaseModel):
    """Control message from client."""

    type: Literal["control", "command"] = "control"
    control: str = Field(..., description="Control action: start, stop, clear_context, get_status")
    params: Optional[dict] = Field(None, description="Optional parameters for the control action")


class PingMessage(BaseModel):
    """Ping message for connection health check."""

    type: Literal["ping"] = "ping"


# =============================================================================
# Server -> Client Messages
# =============================================================================


class TranscriptMessage(BaseModel):
    """Transcript message to client."""

    type: Literal["transcript"] = "transcript"
    text: str = Field(..., description="Transcribed text")
    speaker: str = Field(..., description="Speaker identifier (e.g., 'Speaker 0')")
    speaker_id: int = Field(0, description="Numeric speaker ID from diarization")
    speaker_role: str = Field("unknown", description="Identified role: customer, consultant, unknown")
    is_final: bool = Field(..., description="Whether this is a final transcript")
    confidence: Optional[float] = Field(None, description="Confidence score 0-1")
    start_time: Optional[float] = Field(None, description="Start time in seconds")
    end_time: Optional[float] = Field(None, description="End time in seconds")
    timestamp: Optional[str] = Field(None, description="ISO timestamp of when transcript was generated")


class SuggestionMessage(BaseModel):
    """AI suggestion message to client."""

    type: Literal["suggestion"] = "suggestion"
    question: str = Field(..., description="The detected question")
    response: str = Field(..., description="Suggested response text")
    confidence: float = Field(..., description="Confidence score 0-1")
    question_type: str = Field("general", description="Classification: technical, pricing, security, etc.")
    key_points: List[str] = Field(default_factory=list, description="Extracted key points")
    source: Optional[str] = Field(None, description="Source: gemini, mock, rag")
    timestamp: Optional[str] = Field(None, description="ISO timestamp of when suggestion was generated")


class StatusMessage(BaseModel):
    """Status message to client."""

    type: Literal["status"] = "status"
    status: str = Field(..., description="Current status")
    message: Optional[str] = Field(None, description="Human-readable status message")
    session_id: Optional[str] = Field(None, description="Session ID (on connect)")
    session: Optional[dict] = Field(None, description="Session details (on get_status)")
    is_listening: Optional[bool] = Field(None, description="Whether transcription is active")
    transcription_available: Optional[bool] = Field(None, description="Whether transcription service is available")
    transcription_connected: Optional[bool] = Field(None, description="Whether connected to Deepgram")


class ErrorMessage(BaseModel):
    """Error message to client."""

    type: Literal["error"] = "error"
    code: str = Field(..., description="Error code")
    message: str = Field(..., description="Error description")
    details: Optional[dict] = Field(None, description="Additional error details")


class PongMessage(BaseModel):
    """Pong response to ping."""

    type: Literal["pong"] = "pong"


# =============================================================================
# Session & Connection Models
# =============================================================================


class SessionInfo(BaseModel):
    """Information about a WebSocket session."""

    session_id: str
    connected_at: str
    last_activity: str
    message_count: int
    audio_chunks_received: int
    transcripts_sent: int
    suggestions_sent: int
    metadata: dict = Field(default_factory=dict)


class ConnectionStatus(BaseModel):
    """Overall connection manager status."""

    active_sessions: int
    sessions: List[SessionInfo] = Field(default_factory=list)


# =============================================================================
# Transcription Models
# =============================================================================


class WordInfo(BaseModel):
    """Word-level transcription information."""

    word: str
    start: float
    end: float
    confidence: float
    speaker: Optional[int] = None


class TranscriptResult(BaseModel):
    """Complete transcript result with word-level details."""

    text: str
    speaker: str
    speaker_id: int
    speaker_role: str
    is_final: bool
    confidence: float
    start_time: float
    end_time: float
    words: List[WordInfo] = Field(default_factory=list)
    timestamp: str


# =============================================================================
# Agent / Suggestion Models
# =============================================================================


class SuggestionResult(BaseModel):
    """Complete suggestion result with metadata."""

    text: str
    confidence: float
    question_type: str
    source: Optional[str] = None
    key_points: List[str] = Field(default_factory=list)
    follow_up_questions: List[str] = Field(default_factory=list)
    timestamp: str


class ConversationTurn(BaseModel):
    """A single turn in the conversation context."""

    speaker: str
    text: str
    is_question: bool = False
    timestamp: str


# =============================================================================
# Health Check Models
# =============================================================================


class HealthStatus(BaseModel):
    """Health check response."""

    status: str
    timestamp: str
    version: str
    config: dict


class ReadinessStatus(BaseModel):
    """Readiness check response."""

    status: str
    deepgram_available: Optional[bool] = None
    gemini_available: Optional[bool] = None
    vector_db_available: Optional[bool] = None
