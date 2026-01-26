# Implementation Plan: Backend Core Track

---

## Executive Summary

The Backend Core track establishes the foundational server infrastructure for the Presales AI Assistant. This track delivers a FastAPI-based backend with WebSocket support for real-time bidirectional communication and Deepgram integration for streaming speech-to-text transcription. These components form the critical data pipeline that receives audio from the Chrome extension, converts it to text with speaker identification, and prepares it for downstream AI processing.

**Key Outcomes:**
- Production-ready FastAPI server with async WebSocket support for real-time audio streaming
- Reliable connection management supporting multiple concurrent presales sessions
- Real-time transcription with speaker diarization to distinguish customer questions from consultant responses

---

## Product Manager Review

### Feature Overview

This track delivers the server-side infrastructure that powers real-time communication between the Chrome extension and AI services. The backend receives streaming audio, manages user sessions, and integrates with Deepgram for high-accuracy speech-to-text conversion with speaker identification.

### Features

#### Feature 1: FastAPI Backend Foundation

**What it is:** A Python-based async web server using FastAPI that provides the API layer for the entire Presales AI Assistant system.

**Why it matters:** FastAPI's native async support and WebSocket handling make it ideal for real-time audio processing. The structured scaffold ensures maintainability and easy extension for future features.

**User perspective:** While invisible to end users, this foundation ensures the system is responsive, reliable, and can handle multiple presales consultants using the tool simultaneously without degradation.

---

#### Feature 2: Real-Time WebSocket Communication

**What it is:** A bidirectional WebSocket endpoint that receives audio chunks from Chrome extensions and sends transcripts and AI suggestions back in real-time.

**Why it matters:** WebSocket connections enable true real-time streaming without HTTP polling overhead. This is essential for achieving the sub-3-second latency target from question to AI suggestion.

**User perspective:** The presales consultant experiences seamless, low-latency communication. When they start a session, the connection is established instantly and remains stable throughout the meeting.

---

#### Feature 3: Deepgram Streaming Transcription

**What it is:** Integration with Deepgram's Nova-3 model for real-time speech-to-text with speaker diarization, capable of distinguishing between meeting participants.

**Why it matters:** Accurate transcription with speaker identification is critical for understanding who asked the question. The system needs to identify customer questions (not consultant statements) to generate relevant suggestions.

**User perspective:** The system accurately captures what the customer says, even with technical terminology, accents, and cross-talk. Speaker labels help the AI understand the conversation flow.

---

## Master Checklist

### Instructions for Claude Code

> **CRITICAL: You must follow these rules exactly.**
>
> 1. **Save after every cell write.** You cannot batch writes to this table. Each time you update a cell (start time, end time, estimate, etc.), you must save the file immediately before proceeding to other cells or other work.
>
> 2. **Check the checkbox** when you begin a task. This serves as a visual indicator of which task is currently in progress.
>
> 3. **Workflow for each task:**
>    - Check the checkbox `[x]` → Save
>    - Write start time → Save
>    - Complete the implementation work
>    - Write end time → Save
>    - Calculate and write total time → Save
>    - Write human time estimate → Save
>    - Calculate and write multiplier → Save
>    - Move to next task
>
> 4. **Time format:** Use `HH:MM` (24-hour format) for start/end times. Use minutes for total time and estimates.
>
> 5. **Multiplier calculation:** `Multiplier = Human Estimate ÷ Total Time`. Express as `Nx` (e.g., `10x` means 10 times faster than human estimate).
>
> 6. **If blocked:** Note the blocker in the task description section below and move to the next unblocked task.

### Progress Dashboard

| Done | # | Task Name | Start | End | Total (min) | Human Est. (min) | Multiplier |
|:----:|:-:|-----------|:-----:|:---:|:-----------:|:----------------:|:----------:|
| [ ] | 1 | Backend FastAPI scaffold | | | | 60 | |
| [ ] | 2 | WebSocket server endpoint | | | | 90 | |
| [ ] | 3 | Deepgram transcription integration | | | | 120 | |

**Summary:**
- Total tasks: 3
- Completed: 0
- Total time spent: 0 minutes
- Total human estimate: 270 minutes (4.5 hours)
- Overall multiplier: TBD

---

## Task Descriptions

This section provides context for each task. Read the relevant description before starting implementation.

---

### Task 1: Backend FastAPI scaffold

**Intent:** Establish the foundational backend structure with FastAPI, including proper project organization, configuration management, and basic operational endpoints.

**Context:** This is the foundation for all backend functionality. The WebSocket endpoint (Task 2) and Deepgram integration (Task 3) will be built on top of this scaffold. A well-structured foundation ensures maintainability and ease of adding future features like knowledge base APIs or admin endpoints.

**Expected behavior:**
- Backend starts successfully with `uvicorn main:app`
- Health endpoint (`GET /health`) returns 200 with status information
- Environment variables are loaded via config module
- CORS is configured to allow requests from the Chrome extension origin
- Logging is configured for debugging and production use

**Key components:**
- `backend/main.py` - FastAPI app entry point with lifespan events
- `backend/config.py` - Environment configuration using Pydantic Settings
- `backend/routers/__init__.py` - Router module initialization
- `backend/routers/health.py` - Health check endpoint
- `backend/services/__init__.py` - Services module initialization
- `backend/models/schemas.py` - Pydantic models for request/response validation
- `backend/requirements.txt` - Python dependencies
- `backend/.env.example` - Example environment configuration

**Notes:**
- Use Pydantic Settings (v2) for configuration management with `.env` file support
- Configure CORS to accept `chrome-extension://` origins for development and specific extension IDs for production
- Include uvicorn as the ASGI server
- Set up structured logging with timestamps for production debugging
- Use async/await throughout for consistency with WebSocket handling

---

### Task 2: WebSocket server endpoint

**Intent:** Implement the WebSocket endpoint that handles bidirectional real-time communication with the Chrome extension, including connection lifecycle management and message protocol.

**Context:** This endpoint is the communication hub between the Chrome extension and backend services. It receives audio chunks from the extension and sends transcripts and AI suggestions back. Must handle multiple concurrent connections (multiple presales consultants) reliably.

**Expected behavior:**
- WebSocket endpoint available at `/ws/session`
- Connections are tracked with unique session IDs
- Audio binary messages are received and queued for processing
- Text messages follow a defined JSON protocol for transcripts and suggestions
- Graceful handling of disconnections with proper cleanup
- Connection state is logged for debugging

**Key components:**
- `backend/routers/websocket.py` - WebSocket endpoint and connection handler
- `backend/services/connection_manager.py` - Connection tracking and session management
- `backend/models/schemas.py` - Message protocol schemas (AudioMessage, TranscriptMessage, SuggestionMessage)
- Connection lifecycle hooks (on_connect, on_disconnect)

**Notes:**
- Use FastAPI's native WebSocket support
- Implement a ConnectionManager class to track active sessions
- Define clear message types: `audio_chunk`, `transcript`, `suggestion`, `error`, `status`
- Include heartbeat/ping-pong mechanism for connection health monitoring
- Session cleanup must be thorough to prevent memory leaks
- Consider rate limiting for audio chunks to prevent abuse
- Log connection events with session ID for debugging

**Message Protocol:**
```json
// Client → Server (audio)
{ "type": "audio_chunk", "data": "<base64_audio>", "sequence": 123 }

// Server → Client (transcript)
{ "type": "transcript", "text": "...", "speaker": "customer", "is_final": true }

// Server → Client (suggestion)
{ "type": "suggestion", "question": "...", "response": "...", "confidence": 0.95 }

// Server → Client (error)
{ "type": "error", "code": "...", "message": "..." }
```

---

### Task 3: Deepgram transcription integration

**Intent:** Integrate Deepgram's streaming API for real-time speech-to-text transcription with speaker diarization, enabling the system to understand what customers are saying and who is speaking.

**Context:** Deepgram Nova-3 provides industry-leading accuracy (~8% WER) with real-time streaming support. This integration is critical for the AI pipeline—without accurate transcription with speaker identification, the system cannot generate relevant suggestions. This task connects to the WebSocket endpoint (Task 2) to receive audio and emit transcripts.

**Expected behavior:**
- Audio chunks from WebSocket are streamed to Deepgram in real-time
- Interim transcripts are received for faster feedback
- Final transcripts include speaker diarization labels
- Pause detection identifies utterance boundaries (when someone stops speaking)
- Transcription errors are handled gracefully with retry logic
- Deepgram connection is maintained per user session

**Key components:**
- `backend/services/transcription.py` - Deepgram client wrapper and streaming handler
- `backend/services/speaker_tracker.py` - Speaker label management and history
- Deepgram WebSocket connection management (separate from client connection)
- Interim vs. final transcript handling
- Utterance boundary detection
- Error handling and reconnection logic

**Notes:**
- Use the official `deepgram-sdk` Python package (v5.3.0+)
- **IMPORTANT SDK CHANGES (v5.3.x):**
  - Use `client.listen.v2.connect()` for streaming (not v1)
  - `send_media()` now requires bytes, not str
  - `encoding` and `sample_rate` are now optional in v2 clients
- Enable these Deepgram features:
  - `model`: "nova-3" (highest accuracy, GA since Feb 2025)
  - `language`: "en" (English)
  - `punctuate`: true (auto-punctuation)
  - `diarize`: true (speaker identification)
  - `interim_results`: true (faster feedback)
  - `endpointing`: 1000 (detect pause after 1 second)
  - `smart_format`: true (better formatting)
- **Alternative model:** Consider `flux-general-en` for voice agent scenarios (built-in turn-taking detection)
- Implement connection pooling or per-session connections based on load testing
- Handle Deepgram API errors (rate limits, connection drops) with exponential backoff
- Map speaker labels (Speaker 0, Speaker 1) to roles (customer, consultant) over time based on conversation patterns
- Consider buffering small audio chunks to reduce Deepgram API calls
- Log transcription events for debugging and accuracy analysis

**Speaker Tracking Logic:**
- Initially, speakers are labeled numerically (Speaker 0, Speaker 1)
- Heuristic: The speaker who asks more questions is likely the customer
- Over time, build confidence in speaker role assignment
- Pass speaker role (not just number) to downstream AI components

---

## Appendix

### Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Web framework | FastAPI | Native async support, built-in WebSocket handling, automatic OpenAPI docs, excellent Python ecosystem |
| Configuration | Pydantic Settings | Type-safe configuration, automatic `.env` loading, validation built-in |
| ASGI Server | Uvicorn | Production-ready, excellent performance, native async support |
| Transcription | Deepgram Nova-3 | Best-in-class accuracy (8% WER), real-time streaming, speaker diarization, competitive pricing |
| Audio format | Linear16 PCM | Widely supported, lossless, optimal for speech recognition |
| Message protocol | JSON over WebSocket | Human-readable, easy to debug, flexible schema evolution |

### Dependencies

**Python Packages:**
- `fastapi>=0.109.0` - Web framework
- `uvicorn[standard]>=0.27.0` - ASGI server
- `pydantic>=2.5.0` - Data validation
- `pydantic-settings>=2.1.0` - Configuration management
- `python-dotenv>=1.0.0` - Environment file loading
- `deepgram-sdk>=5.3.0` - Deepgram transcription client (NOTE: v5.3.x has breaking changes - `send_media()` requires bytes not str)
- `websockets>=12.0` - WebSocket support
- `python-multipart>=0.0.6` - Form handling (if needed)

**External Services:**
- Deepgram API - Requires API key, ~$0.0077/minute for Nova-3

### Out of Scope

The following are explicitly NOT included in this track:

- **Authentication/Authorization** - Simple API key for MVP; full auth system in future track
- **Database persistence** - Transcripts are processed in real-time, not stored
- **AI/LLM integration** - Handled in separate AI Track
- **Knowledge base** - Handled in separate RAG Track
- **Load balancing** - Single instance for MVP
- **Containerization** - Docker setup in DevOps track
- **Rate limiting** - Basic protection only; advanced rate limiting in production hardening
- **Monitoring/Observability** - Basic logging only; Prometheus/Grafana in future track

### File Structure

```
backend/
├── main.py                 # FastAPI app entry point
├── config.py               # Environment configuration
├── requirements.txt        # Python dependencies
├── .env.example            # Example environment variables
├── routers/
│   ├── __init__.py
│   ├── health.py           # Health check endpoint
│   └── websocket.py        # WebSocket endpoint
├── services/
│   ├── __init__.py
│   ├── connection_manager.py   # WebSocket connection tracking
│   ├── transcription.py        # Deepgram integration
│   └── speaker_tracker.py      # Speaker role identification
└── models/
    ├── __init__.py
    └── schemas.py          # Pydantic models
```

---

*Track plan created January 26, 2026*
*Parent plan: IMPLEMENTATION-PLAN-Presales-AI-Assistant.md*
