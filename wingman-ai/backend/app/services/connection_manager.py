"""
WebSocket Connection Manager

Manages active WebSocket connections, session state, and lifecycle events.
Provides robust connection tracking with session metadata and heartbeat support.
"""

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Any, Optional, Callable, Awaitable

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


@dataclass
class SessionState:
    """Tracks state for a WebSocket session."""

    session_id: str
    websocket: WebSocket
    connected_at: datetime = field(default_factory=datetime.utcnow)
    last_activity: datetime = field(default_factory=datetime.utcnow)
    message_count: int = 0
    audio_chunks_received: int = 0
    transcripts_sent: int = 0
    suggestions_sent: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def update_activity(self) -> None:
        """Update the last activity timestamp."""
        self.last_activity = datetime.utcnow()

    def to_dict(self) -> Dict[str, Any]:
        """Convert session state to dictionary for status reporting."""
        return {
            "session_id": self.session_id,
            "connected_at": self.connected_at.isoformat(),
            "last_activity": self.last_activity.isoformat(),
            "message_count": self.message_count,
            "audio_chunks_received": self.audio_chunks_received,
            "transcripts_sent": self.transcripts_sent,
            "suggestions_sent": self.suggestions_sent,
            "metadata": self.metadata,
        }


class ConnectionManager:
    """
    Manages WebSocket connections for multiple concurrent sessions.

    Features:
    - Unique session ID generation and tracking
    - Session metadata and statistics
    - Heartbeat monitoring for connection health
    - Graceful disconnection handling
    - Event callbacks for connection lifecycle
    """

    def __init__(self) -> None:
        self._sessions: Dict[str, SessionState] = {}
        self._lock = asyncio.Lock()

        # Lifecycle callbacks
        self._on_connect_callbacks: list[Callable[[str], Awaitable[None]]] = []
        self._on_disconnect_callbacks: list[Callable[[str], Awaitable[None]]] = []

    async def connect(
        self,
        websocket: WebSocket,
        session_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Accept a new WebSocket connection and create a session.

        Args:
            websocket: The FastAPI WebSocket connection.
            session_id: Optional custom session ID. If not provided, generates a UUID.
            metadata: Optional metadata to associate with the session.

        Returns:
            Session ID for the connection.
        """
        await websocket.accept()

        if session_id is None:
            session_id = str(uuid.uuid4())

        async with self._lock:
            session = SessionState(
                session_id=session_id,
                websocket=websocket,
                metadata=metadata or {},
            )
            self._sessions[session_id] = session

        logger.info(f"Session {session_id} connected. Total sessions: {len(self._sessions)}")

        # Notify callbacks
        for callback in self._on_connect_callbacks:
            try:
                await callback(session_id)
            except Exception as e:
                logger.error(f"Error in on_connect callback: {e}")

        return session_id

    async def disconnect(self, session_id: str) -> None:
        """
        Remove a connection and clean up session state.

        Args:
            session_id: The session ID to disconnect.
        """
        async with self._lock:
            session = self._sessions.pop(session_id, None)

        if session:
            logger.info(
                f"Session {session_id} disconnected after "
                f"{session.message_count} messages, "
                f"{session.audio_chunks_received} audio chunks, "
                f"{session.transcripts_sent} transcripts, "
                f"{session.suggestions_sent} suggestions"
            )

            # Notify callbacks
            for callback in self._on_disconnect_callbacks:
                try:
                    await callback(session_id)
                except Exception as e:
                    logger.error(f"Error in on_disconnect callback: {e}")

        logger.info(f"Active sessions remaining: {len(self._sessions)}")

    async def send_message(self, session_id: str, message: Dict[str, Any]) -> bool:
        """
        Send a JSON message to a specific session.

        Args:
            session_id: The target session ID.
            message: The message dictionary to send.

        Returns:
            True if message was sent successfully, False otherwise.
        """
        session = self._sessions.get(session_id)
        if not session:
            logger.warning(f"Attempted to send message to unknown session: {session_id}")
            return False

        try:
            await session.websocket.send_json(message)
            session.message_count += 1
            session.update_activity()

            # Track message types
            msg_type = message.get("type", "unknown")
            if msg_type == "transcript":
                session.transcripts_sent += 1
            elif msg_type == "suggestion":
                session.suggestions_sent += 1

            return True
        except WebSocketDisconnect:
            logger.info(f"Session {session_id} disconnected during send")
            return False
        except Exception as e:
            logger.error(f"Error sending message to session {session_id}: {e}")
            return False

    async def send_bytes(self, session_id: str, data: bytes) -> bool:
        """
        Send binary data to a specific session.

        Args:
            session_id: The target session ID.
            data: The binary data to send.

        Returns:
            True if data was sent successfully, False otherwise.
        """
        session = self._sessions.get(session_id)
        if not session:
            return False

        try:
            await session.websocket.send_bytes(data)
            session.update_activity()
            return True
        except Exception as e:
            logger.error(f"Error sending bytes to session {session_id}: {e}")
            return False

    async def broadcast(self, message: Dict[str, Any]) -> int:
        """
        Broadcast a message to all connected sessions.

        Args:
            message: The message dictionary to broadcast.

        Returns:
            Number of sessions that received the message.
        """
        success_count = 0
        for session_id in list(self._sessions.keys()):
            if await self.send_message(session_id, message):
                success_count += 1
        return success_count

    def get_session(self, session_id: str) -> Optional[SessionState]:
        """Get the session state for a given session ID."""
        return self._sessions.get(session_id)

    def get_session_count(self) -> int:
        """Get the number of active sessions."""
        return len(self._sessions)

    def get_all_sessions(self) -> Dict[str, SessionState]:
        """Get all active sessions."""
        return dict(self._sessions)

    def record_audio_chunk(self, session_id: str) -> None:
        """Record that an audio chunk was received for a session."""
        session = self._sessions.get(session_id)
        if session:
            session.audio_chunks_received += 1
            session.update_activity()

    def update_metadata(self, session_id: str, metadata: Dict[str, Any]) -> bool:
        """
        Update metadata for a session.

        Args:
            session_id: The target session ID.
            metadata: Metadata to merge with existing metadata.

        Returns:
            True if session exists and was updated, False otherwise.
        """
        session = self._sessions.get(session_id)
        if session:
            session.metadata.update(metadata)
            return True
        return False

    def on_connect(self, callback: Callable[[str], Awaitable[None]]) -> None:
        """Register a callback to be called when a new connection is established."""
        self._on_connect_callbacks.append(callback)

    def on_disconnect(self, callback: Callable[[str], Awaitable[None]]) -> None:
        """Register a callback to be called when a connection is closed."""
        self._on_disconnect_callbacks.append(callback)

    async def close_all(self) -> None:
        """Close all active connections gracefully."""
        logger.info(f"Closing all {len(self._sessions)} sessions")
        for session_id in list(self._sessions.keys()):
            try:
                session = self._sessions.get(session_id)
                if session:
                    await session.websocket.close(code=1001, reason="Server shutdown")
            except Exception as e:
                logger.error(f"Error closing session {session_id}: {e}")
            await self.disconnect(session_id)

    def get_status(self) -> Dict[str, Any]:
        """Get overall connection manager status."""
        return {
            "active_sessions": len(self._sessions),
            "sessions": [s.to_dict() for s in self._sessions.values()],
        }
