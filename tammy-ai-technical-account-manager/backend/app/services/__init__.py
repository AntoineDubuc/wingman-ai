"""
Services Package

Contains the core business logic services for the Presales AI Assistant:
- ConnectionManager: WebSocket connection and session management
- TranscriptionService: Deepgram streaming transcription
- AgentService: Gemini AI response generation
"""

from app.services.connection_manager import ConnectionManager, SessionState
from app.services.transcription import TranscriptionService, Transcript, SpeakerRole, SpeakerTracker
from app.services.agent import AgentService, Suggestion, QuestionType

__all__ = [
    # Connection Manager
    "ConnectionManager",
    "SessionState",
    # Transcription
    "TranscriptionService",
    "Transcript",
    "SpeakerRole",
    "SpeakerTracker",
    # Agent
    "AgentService",
    "Suggestion",
    "QuestionType",
]
