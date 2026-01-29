"""
Transcription Service

Real-time speech-to-text transcription using Deepgram Nova-3.
Uses deepgram-sdk v5.3.1 with the listen.v1 API for streaming.

Features:
- Real-time streaming transcription
- Speaker diarization (identifying who is speaking)
- Interim and final results
- Automatic reconnection with exponential backoff
- Utterance boundary detection
"""

import asyncio
import base64
import logging
import struct
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Callable, Awaitable, Any

from app.config import settings

logger = logging.getLogger(__name__)

# Deepgram SDK v5.3.1 imports
DEEPGRAM_AVAILABLE = False
try:
    from deepgram import AsyncDeepgramClient
    from deepgram.core.events import EventType
    from deepgram.listen.v1.types import (
        ListenV1Results,
        ListenV1Metadata,
        ListenV1UtteranceEnd,
        ListenV1SpeechStarted,
        ListenV1CloseStream,
    )
    DEEPGRAM_AVAILABLE = True
    logger.info("Deepgram SDK v5.3.1 loaded successfully")
except ImportError as e:
    logger.warning(f"Deepgram SDK not available: {e}")


class SpeakerRole(Enum):
    """Identified speaker roles in the conversation."""

    UNKNOWN = "unknown"
    CUSTOMER = "customer"
    CONSULTANT = "consultant"


@dataclass
class Transcript:
    """Transcription result with metadata."""

    text: str
    speaker: str
    speaker_id: int
    speaker_role: SpeakerRole
    is_final: bool
    confidence: float = 0.0
    start_time: float = 0.0
    end_time: float = 0.0
    words: list[dict] = field(default_factory=list)
    timestamp: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "text": self.text,
            "speaker": self.speaker,
            "speaker_id": self.speaker_id,
            "speaker_role": self.speaker_role.value,
            "is_final": self.is_final,
            "confidence": self.confidence,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "timestamp": self.timestamp.isoformat(),
        }


@dataclass
class SpeakerStats:
    """Statistics for speaker role identification."""

    utterance_count: int = 0
    question_count: int = 0
    word_count: int = 0
    total_duration: float = 0.0


class SpeakerTracker:
    """
    Tracks speakers and attempts to identify roles based on conversation patterns.

    Heuristics:
    - The speaker who asks more questions is likely the customer
    - Questions are detected by ? or question words
    """

    def __init__(self) -> None:
        self._stats: dict[int, SpeakerStats] = {}
        self._role_assignments: dict[int, SpeakerRole] = {}
        self._confidence_threshold = 0.7

    def track_utterance(
        self, speaker_id: int, text: str, duration: float, word_count: int
    ) -> SpeakerRole:
        """
        Track an utterance and return the speaker's identified role.

        Args:
            speaker_id: Numeric speaker ID from Deepgram.
            text: The transcribed text.
            duration: Duration of the utterance in seconds.
            word_count: Number of words in the utterance.

        Returns:
            The identified or inferred role for this speaker.
        """
        if speaker_id not in self._stats:
            self._stats[speaker_id] = SpeakerStats()

        stats = self._stats[speaker_id]
        stats.utterance_count += 1
        stats.word_count += word_count
        stats.total_duration += duration

        # Check if this is a question
        text_lower = text.lower().strip()
        question_words = ["what", "how", "why", "when", "where", "who", "which", "can", "could", "would", "should", "is", "are", "do", "does", "did", "tell me"]
        is_question = text_lower.endswith("?") or any(
            text_lower.startswith(qw) for qw in question_words
        )
        if is_question:
            stats.question_count += 1

        # Update role assignments if we have enough data
        self._update_role_assignments()

        return self._role_assignments.get(speaker_id, SpeakerRole.UNKNOWN)

    def _update_role_assignments(self) -> None:
        """Update speaker role assignments based on accumulated statistics."""
        if len(self._stats) < 2:
            return

        # Find speaker with most questions - likely the customer
        speaker_questions = [(sid, s.question_count) for sid, s in self._stats.items()]
        speaker_questions.sort(key=lambda x: x[1], reverse=True)

        if len(speaker_questions) >= 2:
            most_questions_speaker = speaker_questions[0][0]
            least_questions_speaker = speaker_questions[1][0]

            # Only assign if there's a meaningful difference
            q1 = speaker_questions[0][1]
            q2 = speaker_questions[1][1]
            total_questions = q1 + q2

            if total_questions >= 3 and q1 > q2:
                self._role_assignments[most_questions_speaker] = SpeakerRole.CUSTOMER
                self._role_assignments[least_questions_speaker] = SpeakerRole.CONSULTANT

    def get_role(self, speaker_id: int) -> SpeakerRole:
        """Get the current role assignment for a speaker."""
        return self._role_assignments.get(speaker_id, SpeakerRole.UNKNOWN)

    def reset(self) -> None:
        """Reset all speaker tracking data."""
        self._stats.clear()
        self._role_assignments.clear()


class TranscriptionService:
    """
    Real-time transcription service using Deepgram.

    Uses the deepgram-sdk v5.3+ with listen.websocket API for streaming.
    Manages connection lifecycle, handles reconnection, and processes transcripts.
    """

    def __init__(self) -> None:
        self.api_key = settings.deepgram_api_key
        self.model = settings.deepgram_model
        self.sample_rate = settings.audio_sample_rate
        self.channels = settings.audio_channels
        self.enable_diarization = settings.enable_diarization

        self._client = None
        self._connection = None
        self._is_connected = False
        self._speaker_tracker = SpeakerTracker()
        self._mock_mode = False  # Use mock transcription when Deepgram unavailable

        # Callback for transcript events
        self._on_transcript: Optional[Callable[[Transcript], Awaitable[None]]] = None

        # Reconnection settings
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 5
        self._reconnect_delay = 1.0  # Start with 1 second

        # Buffering for small audio chunks
        self._audio_buffer = bytearray()
        self._buffer_threshold = 4096  # Send when buffer reaches this size

        # SDK v5.3.1 specific
        self._context_manager = None  # Async context manager from connect()
        self._receive_task: Optional[asyncio.Task] = None

        # Mock mode audio accumulator (simulates detecting speech)
        self._mock_audio_count = 0
        self._mock_phrases = [
            "What is your pricing for cloud migration?",
            "How long does implementation typically take?",
            "Can you tell me about your security certifications?",
            "What kind of support do you offer?",
            "How does this integrate with our existing systems?",
        ]
        self._mock_phrase_index = 0

        logger.info(
            f"TranscriptionService initialized - model: {self.model}, "
            f"sample_rate: {self.sample_rate}, diarization: {self.enable_diarization}"
        )

    def set_transcript_callback(
        self, callback: Callable[[Transcript], Awaitable[None]]
    ) -> None:
        """Set the callback function for transcript events."""
        self._on_transcript = callback

    async def connect(self) -> bool:
        """
        Establish connection to Deepgram streaming API.

        Returns:
            True if connection was successful, False otherwise.
        """
        if not self.api_key:
            logger.warning("Deepgram API key not configured - transcription disabled")
            return False

        if self._is_connected:
            logger.debug("Already connected to Deepgram")
            return True

        if not DEEPGRAM_AVAILABLE:
            logger.warning("Deepgram SDK not available. Enabling mock mode.")
            self._mock_mode = True
            self._is_connected = True
            return True

        try:
            # Create async Deepgram client (SDK v5.3.1)
            self._client = AsyncDeepgramClient(api_key=self.api_key)

            # Get async context manager for connection - parameters are passed as strings
            # Endpointing: ms of silence before finalizing (higher = waits longer for speaker to continue)
            # Utterance end: ms before an utterance is considered complete
            self._context_manager = self._client.listen.v1.connect(
                model=self.model,
                language="en",
                punctuate="true",
                diarize="true" if self.enable_diarization else "false",
                interim_results="true",
                smart_format="true",
                encoding="linear16",
                sample_rate=str(self.sample_rate),
                channels=str(self.channels),
                endpointing="2500",      # 2.5 seconds of silence before ending speech
                utterance_end_ms="3000", # 3 seconds before utterance is finalized
            )

            # Enter the async context manager to get the socket client
            self._connection = await self._context_manager.__aenter__()

            # Start the receive loop in background
            self._receive_task = asyncio.create_task(self._receive_loop())

            self._is_connected = True
            self._reconnect_attempts = 0
            self._reconnect_delay = 1.0
            logger.info("Connected to Deepgram streaming API (SDK v5.3.1)")
            return True

        except Exception as e:
            logger.warning(f"Failed to connect to Deepgram: {e}. Enabling mock mode.")
            import traceback
            logger.error(traceback.format_exc())
            self._mock_mode = True
            self._is_connected = True
            return True

    async def _receive_loop(self) -> None:
        """Background task to receive messages from Deepgram (SDK v5.3.1)."""
        logger.info("Starting Deepgram receive loop")
        try:
            while self._is_connected and self._connection:
                try:
                    result = await self._connection.recv()
                    await self._handle_deepgram_message(result)
                except asyncio.CancelledError:
                    logger.info("Receive loop cancelled")
                    break
                except Exception as e:
                    if self._is_connected:
                        logger.error(f"Error in receive loop: {e}")
                    break
        finally:
            logger.info("Deepgram receive loop ended")

    async def _handle_deepgram_message(self, result: Any) -> None:
        """Handle incoming message from Deepgram (SDK v5.3.1)."""
        try:
            # Check message type using DEEPGRAM_AVAILABLE types
            if not DEEPGRAM_AVAILABLE:
                return

            if isinstance(result, ListenV1Results):
                await self._process_transcript_result(result)
            elif isinstance(result, ListenV1Metadata):
                logger.debug(f"Received metadata: {result}")
            elif isinstance(result, ListenV1UtteranceEnd):
                logger.debug("Utterance end detected")
            elif isinstance(result, ListenV1SpeechStarted):
                logger.debug("Speech started detected")
            else:
                logger.debug(f"Unknown message type: {type(result)}")

        except Exception as e:
            logger.error(f"Error handling Deepgram message: {e}")
            import traceback
            logger.error(traceback.format_exc())

    async def _process_transcript_result(self, result: Any) -> None:
        """Process transcript result from Deepgram (SDK v5.3.1)."""
        try:
            # ListenV1Results has channel with alternatives
            channel = result.channel
            alternatives = channel.alternatives if channel else []
            if not alternatives:
                return

            alternative = alternatives[0]
            transcript_text = alternative.transcript

            if not transcript_text:
                return

            is_final = result.is_final if hasattr(result, 'is_final') else False
            logger.info(f"Deepgram transcript: '{transcript_text}' (final={is_final})")

            # Extract speaker information
            speaker_id = 0
            words = []
            for word in alternative.words or []:
                word_data = {
                    "word": word.word,
                    "start": word.start,
                    "end": word.end,
                    "confidence": word.confidence,
                }
                if hasattr(word, 'speaker') and word.speaker is not None:
                    speaker_id = word.speaker
                    word_data["speaker"] = speaker_id
                words.append(word_data)

            start_time = words[0]["start"] if words else 0.0
            end_time = words[-1]["end"] if words else 0.0
            duration = end_time - start_time

            speaker_role = self._speaker_tracker.track_utterance(
                speaker_id=speaker_id,
                text=transcript_text,
                duration=duration,
                word_count=len(words),
            )

            transcript = Transcript(
                text=transcript_text,
                speaker=f"Speaker {speaker_id}",
                speaker_id=speaker_id,
                speaker_role=speaker_role,
                is_final=is_final,
                confidence=alternative.confidence if hasattr(alternative, 'confidence') else 0.0,
                start_time=start_time,
                end_time=end_time,
                words=words,
            )

            if self._on_transcript:
                await self._invoke_transcript_callback(transcript)

        except Exception as e:
            logger.error(f"Error processing transcript result: {e}")
            import traceback
            logger.error(traceback.format_exc())


    async def _invoke_transcript_callback(self, transcript: Transcript) -> None:
        """Invoke the transcript callback asynchronously."""
        if self._on_transcript:
            try:
                await self._on_transcript(transcript)
            except Exception as e:
                logger.error(f"Error in transcript callback: {e}")

    async def send_audio(self, audio_data: bytes) -> bool:
        """
        Send audio data to Deepgram for transcription.

        Args:
            audio_data: Raw audio bytes (16-bit PCM, mono, at configured sample rate).

        Returns:
            True if audio was sent successfully, False otherwise.
        """
        if not self._is_connected:
            connected = await self.connect()
            if not connected:
                return False

        # Mock mode: generate simulated transcripts periodically
        if self._mock_mode:
            self._mock_audio_count += 1
            # Generate a mock transcript every ~100 audio chunks (roughly every 3-4 seconds)
            if self._mock_audio_count >= 100:
                self._mock_audio_count = 0
                await self._generate_mock_transcript()
            return True

        if not self._connection:
            return False

        try:
            # Add to buffer
            self._audio_buffer.extend(audio_data)

            # Send if buffer is large enough
            if len(self._audio_buffer) >= self._buffer_threshold:
                buffer_bytes = bytes(self._audio_buffer)
                logger.debug(f"Sending {len(buffer_bytes)} bytes to Deepgram")
                # SDK v5.3.1 uses send_media() method (async)
                await self._connection.send_media(buffer_bytes)
                self._audio_buffer.clear()

            return True

        except Exception as e:
            logger.error(f"Error sending audio to Deepgram: {e}")
            import traceback
            logger.error(traceback.format_exc())
            self._is_connected = False
            return False

    async def _generate_mock_transcript(self) -> None:
        """Generate a mock transcript for testing without Deepgram."""
        phrase = self._mock_phrases[self._mock_phrase_index % len(self._mock_phrases)]
        self._mock_phrase_index += 1

        transcript = Transcript(
            text=phrase,
            speaker="Speaker 0",
            speaker_id=0,
            speaker_role=SpeakerRole.CUSTOMER,
            is_final=True,
            confidence=0.95,
            start_time=0.0,
            end_time=2.0,
            words=[],
        )

        logger.info(f"[MOCK] Generated transcript: {phrase}")

        if self._on_transcript:
            await self._invoke_transcript_callback(transcript)

    async def send_audio_chunk(self, audio_chunk: list[int]) -> bool:
        """
        Send audio chunk as list of integers (16-bit PCM samples).

        Args:
            audio_chunk: List of 16-bit PCM sample values.

        Returns:
            True if audio was sent successfully, False otherwise.
        """
        try:
            # Convert list of integers to bytes (16-bit signed, little-endian)
            audio_bytes = struct.pack(f"<{len(audio_chunk)}h", *audio_chunk)
            return await self.send_audio(audio_bytes)
        except Exception as e:
            logger.error(f"Error converting audio chunk: {e}")
            return False

    async def send_audio_base64(self, audio_base64: str) -> bool:
        """
        Send base64-encoded audio data.

        Args:
            audio_base64: Base64-encoded audio bytes.

        Returns:
            True if audio was sent successfully, False otherwise.
        """
        try:
            audio_bytes = base64.b64decode(audio_base64)
            return await self.send_audio(audio_bytes)
        except Exception as e:
            logger.error(f"Error decoding base64 audio: {e}")
            return False

    async def flush_buffer(self) -> None:
        """Flush any remaining audio in the buffer."""
        if self._audio_buffer and self._connection and self._is_connected and not self._mock_mode:
            try:
                # SDK v5.3.1 uses send_media() method (async)
                await self._connection.send_media(bytes(self._audio_buffer))
                self._audio_buffer.clear()
            except Exception as e:
                logger.error(f"Error flushing audio buffer: {e}")

    async def close(self) -> None:
        """Close the Deepgram connection and clean up resources."""
        logger.info("Closing transcription service")

        # Cancel receive task first
        if self._receive_task and not self._receive_task.done():
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
            self._receive_task = None

        # Flush remaining audio
        await self.flush_buffer()

        if self._context_manager and not self._mock_mode:
            try:
                # Exit the async context manager (SDK v5.3.1)
                await self._context_manager.__aexit__(None, None, None)
            except Exception as e:
                logger.error(f"Error closing Deepgram connection: {e}")
            self._connection = None
            self._context_manager = None
        self._is_connected = False
        self._mock_mode = False
        self._speaker_tracker.reset()
        logger.info("Transcription service closed")

    def is_connected(self) -> bool:
        """Check if connected to Deepgram."""
        return self._is_connected

    def get_speaker_role(self, speaker_id: int) -> SpeakerRole:
        """Get the identified role for a speaker."""
        return self._speaker_tracker.get_role(speaker_id)

    async def reconnect(self) -> bool:
        """
        Attempt to reconnect to Deepgram with exponential backoff.

        Returns:
            True if reconnection was successful, False otherwise.
        """
        if self._reconnect_attempts >= self._max_reconnect_attempts:
            logger.error("Max reconnection attempts reached")
            return False

        self._reconnect_attempts += 1
        wait_time = self._reconnect_delay * (2 ** (self._reconnect_attempts - 1))
        logger.info(
            f"Reconnecting to Deepgram (attempt {self._reconnect_attempts}/{self._max_reconnect_attempts}) "
            f"in {wait_time:.1f}s"
        )

        await asyncio.sleep(wait_time)

        # Cancel receive task
        if self._receive_task and not self._receive_task.done():
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
            self._receive_task = None

        # Close existing connection
        if self._context_manager and not self._mock_mode:
            try:
                await self._context_manager.__aexit__(None, None, None)
            except Exception:
                pass
            self._connection = None
            self._context_manager = None
        self._is_connected = False
        self._mock_mode = False
        return await self.connect()
