"""
WebSocket Endpoint

Real-time bidirectional communication with the Chrome extension.
Handles the complete audio-to-suggestion pipeline:
1. Receives audio chunks from extension
2. Streams to Deepgram for transcription
3. Detects questions and generates AI suggestions
4. Sends transcripts and suggestions back to extension

Protocol:
- Client -> Server: audio_chunk, ping, control messages
- Server -> Client: transcript, suggestion, status, error messages
"""

import asyncio
import base64
import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.connection_manager import ConnectionManager
from app.services.transcription import TranscriptionService, Transcript, SpeakerRole
from app.services.agent import AgentService

router = APIRouter()
logger = logging.getLogger(__name__)

# Global connection manager instance (shared across all connections)
manager = ConnectionManager()


class SessionHandler:
    """
    Handles a single WebSocket session.

    Manages the lifecycle of transcription and agent services for one client connection.
    """

    def __init__(self, session_id: str, websocket: WebSocket) -> None:
        self.session_id = session_id
        self.websocket = websocket

        # Services
        self.transcription = TranscriptionService()
        self.agent = AgentService()

        # State
        self.is_active = True
        self.is_listening = False
        self._pending_transcripts: list[Transcript] = []

        # Speaker filter state
        self.speaker_filter_enabled = False
        self.self_speaker_id: Optional[int] = None  # First speaker is assumed to be "self"

    async def setup(self) -> bool:
        """
        Initialize the session services.

        Returns:
            True if setup was successful, False otherwise.
        """
        # Set up transcript callback
        self.transcription.set_transcript_callback(self._handle_transcript)

        # Try to connect to Deepgram
        connected = await self.transcription.connect()
        if connected:
            logger.info(f"Session {self.session_id}: Connected to Deepgram")
            self.is_listening = True
        else:
            logger.warning(
                f"Session {self.session_id}: Deepgram not available - "
                "transcription will be disabled"
            )

        return True

    async def _handle_transcript(self, transcript: Transcript) -> None:
        """
        Handle incoming transcript from Deepgram.

        Sends transcript to client. For final transcripts, the AI agent
        processes the full conversation and decides whether to provide a suggestion.

        When speaker_filter_enabled is True, AI suggestions are only generated
        for speakers other than the first detected speaker (assumed to be "self").
        """
        if not self.is_active:
            return

        try:
            # Track first speaker as "self" when speaker filter is enabled
            if self.speaker_filter_enabled and self.self_speaker_id is None:
                if transcript.speaker_id is not None:
                    self.self_speaker_id = transcript.speaker_id
                    logger.info(
                        f"Session {self.session_id}: First speaker detected as 'self' "
                        f"(speaker_id={self.self_speaker_id})"
                    )

            # Determine if this transcript should trigger AI response
            should_process_for_ai = True
            if self.speaker_filter_enabled and self.self_speaker_id is not None:
                if transcript.speaker_id == self.self_speaker_id:
                    should_process_for_ai = False
                    logger.debug(
                        f"Session {self.session_id}: Skipping AI for self "
                        f"(speaker_id={transcript.speaker_id})"
                    )

            # Send transcript to client (always - so user sees all speech)
            await manager.send_message(
                self.session_id,
                {
                    "type": "transcript",
                    "text": transcript.text,
                    "speaker": transcript.speaker,
                    "speaker_id": transcript.speaker_id,
                    "speaker_role": transcript.speaker_role.value,
                    "is_final": transcript.is_final,
                    "confidence": transcript.confidence,
                    "start_time": transcript.start_time,
                    "end_time": transcript.end_time,
                    "timestamp": transcript.timestamp.isoformat(),
                    "is_self": (
                        self.speaker_filter_enabled
                        and transcript.speaker_id == self.self_speaker_id
                    ),
                },
            )

            # For final transcripts, let the AI agent process and decide
            # whether to provide a suggestion (continuous participant mode)
            # Skip if speaker filter is enabled and this is the "self" speaker
            if transcript.is_final and should_process_for_ai:
                suggestion = await self.agent.process_transcript(
                    text=transcript.text,
                    speaker=transcript.speaker,
                    is_final=True,
                )

                if suggestion:
                    await self._send_suggestion(suggestion, transcript.text)

        except Exception as e:
            logger.error(f"Session {self.session_id}: Error handling transcript: {e}")

    async def _send_suggestion(self, suggestion, trigger_text: str) -> None:
        """Send an AI suggestion to the client."""
        try:
            await manager.send_message(
                self.session_id,
                {
                    "type": "suggestion",
                    "question": trigger_text,
                    "response": suggestion.text,
                    "confidence": suggestion.confidence,
                    "question_type": suggestion.suggestion_type,
                    "source": suggestion.source,
                    "timestamp": suggestion.timestamp.isoformat(),
                },
            )
            logger.info(
                f"Session {self.session_id}: Sent suggestion "
                f"(type: {suggestion.suggestion_type}, confidence: {suggestion.confidence:.2f})"
            )

        except Exception as e:
            logger.error(f"Session {self.session_id}: Error sending suggestion: {e}")

    async def handle_audio_chunk(self, message: dict) -> None:
        """
        Process an audio chunk message from the client.

        Supports multiple audio formats:
        - data: List of integers (16-bit PCM samples)
        - audio_base64: Base64-encoded audio bytes
        - audio_bytes: Raw bytes (when received as binary message)
        """
        try:
            # Track the audio chunk
            manager.record_audio_chunk(self.session_id)

            if not self.is_listening:
                return

            # Handle different audio formats
            if "data" in message:
                # List of integers (16-bit PCM)
                audio_data = message["data"]

                # Calculate audio level for debugging (every ~10 chunks)
                if hasattr(self, '_audio_debug_count'):
                    self._audio_debug_count += 1
                else:
                    self._audio_debug_count = 1

                if self._audio_debug_count % 10 == 0:
                    if audio_data:
                        max_abs = max(abs(s) for s in audio_data)
                        rms = (sum(s*s for s in audio_data) / len(audio_data)) ** 0.5
                        logger.info(f"Session {self.session_id}: Audio chunk #{self._audio_debug_count} - RMS={rms:.0f}, Max={max_abs}, Samples={len(audio_data)}")

                await self.transcription.send_audio_chunk(audio_data)

            elif "audio_base64" in message:
                # Base64-encoded audio
                audio_base64 = message["audio_base64"]
                await self.transcription.send_audio_base64(audio_base64)

            elif "audio_bytes" in message:
                # Raw bytes
                audio_bytes = message["audio_bytes"]
                if isinstance(audio_bytes, str):
                    audio_bytes = audio_bytes.encode()
                await self.transcription.send_audio(audio_bytes)

        except Exception as e:
            logger.error(f"Session {self.session_id}: Error processing audio: {e}")

    async def handle_binary_audio(self, audio_bytes: bytes) -> None:
        """Process binary audio data received directly."""
        try:
            manager.record_audio_chunk(self.session_id)

            if self.is_listening:
                await self.transcription.send_audio(audio_bytes)

        except Exception as e:
            logger.error(f"Session {self.session_id}: Error processing binary audio: {e}")

    async def handle_control_message(self, message: dict) -> None:
        """
        Handle control messages from the client.

        Control types:
        - start: Start listening/transcription (optionally with params.systemPrompt)
        - stop: Stop listening/transcription
        - clear_context: Clear conversation context
        - get_status: Get session status
        """
        control_type = message.get("control", message.get("action"))
        params = message.get("params", {})

        if control_type == "start":
            # Check for custom system prompt in params
            if params and "systemPrompt" in params:
                custom_prompt = params["systemPrompt"]
                if custom_prompt and isinstance(custom_prompt, str):
                    self.agent.set_system_prompt(custom_prompt)
                    logger.info(
                        f"Session {self.session_id}: Custom system prompt received "
                        f"({len(custom_prompt)} chars)"
                    )

            # Check for speaker filter setting
            if params and "speakerFilterEnabled" in params:
                self.speaker_filter_enabled = bool(params["speakerFilterEnabled"])
                self.self_speaker_id = None  # Reset - will be set on first transcript
                logger.info(
                    f"Session {self.session_id}: Speaker filter "
                    f"{'enabled' if self.speaker_filter_enabled else 'disabled'}"
                )

            if not self.is_listening:
                connected = await self.transcription.connect()
                self.is_listening = connected
                await manager.send_message(
                    self.session_id,
                    {
                        "type": "status",
                        "status": "listening" if connected else "transcription_unavailable",
                        "message": "Started listening" if connected else "Transcription service unavailable",
                    },
                )

        elif control_type == "stop":
            self.is_listening = False
            await self.transcription.flush_buffer()
            await manager.send_message(
                self.session_id,
                {
                    "type": "status",
                    "status": "stopped",
                    "message": "Stopped listening",
                },
            )

        elif control_type == "clear_context":
            self.agent.clear_session()
            await manager.send_message(
                self.session_id,
                {
                    "type": "status",
                    "status": "context_cleared",
                    "message": "Conversation session cleared",
                },
            )

        elif control_type == "get_status":
            session = manager.get_session(self.session_id)
            await manager.send_message(
                self.session_id,
                {
                    "type": "status",
                    "status": "active",
                    "session": session.to_dict() if session else {},
                    "is_listening": self.is_listening,
                    "transcription_connected": self.transcription.is_connected(),
                },
            )

        elif control_type == "ping":
            await manager.send_message(self.session_id, {"type": "pong"})

    async def cleanup(self) -> None:
        """Clean up session resources."""
        self.is_active = False
        self.is_listening = False

        try:
            await self.transcription.close()
        except Exception as e:
            logger.error(f"Session {self.session_id}: Error closing transcription: {e}")

        self.agent.clear_session()
        logger.info(f"Session {self.session_id}: Cleaned up")


@router.websocket("/ws/session")
async def websocket_session(websocket: WebSocket) -> None:
    """
    WebSocket endpoint for presales assistant sessions.

    Handles the complete real-time communication pipeline:
    1. Accepts connection and creates session
    2. Initializes transcription and agent services
    3. Processes incoming audio and control messages
    4. Sends transcripts and AI suggestions to client

    Message Protocol:

    Client -> Server:
    - Audio: {"type": "audio_chunk", "data": [...], "timestamp": 123}
    - Audio (base64): {"type": "audio_chunk", "audio_base64": "..."}
    - Control: {"type": "control", "control": "start|stop|clear_context|get_status"}
    - Ping: {"type": "ping"}

    Server -> Client:
    - Transcript: {"type": "transcript", "text": "...", "speaker": "...", "is_final": true}
    - Suggestion: {"type": "suggestion", "question": "...", "response": "...", "confidence": 0.9}
    - Status: {"type": "status", "status": "...", "message": "..."}
    - Error: {"type": "error", "code": "...", "message": "..."}
    - Pong: {"type": "pong"}
    """
    # Accept connection
    session_id = await manager.connect(websocket)
    logger.info(f"New WebSocket session: {session_id}")

    # Create session handler
    handler = SessionHandler(session_id, websocket)

    try:
        # Initialize services
        await handler.setup()

        # Send connection confirmation
        await manager.send_message(
            session_id,
            {
                "type": "status",
                "status": "connected",
                "session_id": session_id,
                "message": "Connected to Presales AI Assistant",
                "transcription_available": handler.transcription.is_connected(),
            },
        )

        # Message processing loop
        while True:
            try:
                # Try to receive either text or bytes
                message = await websocket.receive()

                if message["type"] == "websocket.receive":
                    if "text" in message:
                        # JSON message
                        data = json.loads(message["text"])
                        await _process_json_message(handler, data)

                    elif "bytes" in message:
                        # Binary audio data
                        await handler.handle_binary_audio(message["bytes"])

                elif message["type"] == "websocket.disconnect":
                    logger.info(f"Session {session_id}: Client disconnected")
                    break

            except json.JSONDecodeError as e:
                logger.warning(f"Session {session_id}: Invalid JSON: {e}")
                await manager.send_message(
                    session_id,
                    {
                        "type": "error",
                        "code": "INVALID_JSON",
                        "message": "Invalid JSON message",
                    },
                )

    except WebSocketDisconnect:
        logger.info(f"Session {session_id}: WebSocket disconnected")

    except Exception as e:
        logger.error(f"Session {session_id}: Unexpected error: {e}")
        try:
            await manager.send_message(
                session_id,
                {
                    "type": "error",
                    "code": "INTERNAL_ERROR",
                    "message": f"Internal error: {str(e)}",
                },
            )
        except Exception:
            pass

    finally:
        # Cleanup
        await handler.cleanup()
        await manager.disconnect(session_id)


async def _process_json_message(handler: SessionHandler, data: dict) -> None:
    """Process a JSON message from the client."""
    msg_type = data.get("type", "unknown")

    if msg_type == "audio_chunk":
        await handler.handle_audio_chunk(data)

    elif msg_type in ["control", "command"]:
        await handler.handle_control_message(data)

    elif msg_type == "ping":
        await handler.handle_control_message({"control": "ping"})

    elif msg_type == "start":
        await handler.handle_control_message({"control": "start"})

    elif msg_type == "stop":
        await handler.handle_control_message({"control": "stop"})

    else:
        logger.debug(f"Session {handler.session_id}: Unknown message type: {msg_type}")


@router.get("/ws/status")
async def websocket_status() -> dict:
    """Get status of active WebSocket connections."""
    return manager.get_status()
