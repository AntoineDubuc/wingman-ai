# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tammy AI Technical Account Manager - A real-time AI assistant for presales consultants during Google Meet calls. Captures meeting audio, transcribes via Deepgram, and provides contextual response suggestions using Google Gemini with RAG-powered knowledge retrieval.

## Repository Structure

```
tammy-ai-technical-account-manager/
├── extension/          # Chrome Extension (TypeScript, Vite, Manifest V3)
├── backend/            # FastAPI Backend (Python 3.10+)
└── data/knowledge/     # RAG knowledge base markdown files
```

## Common Commands

### Backend (Python/FastAPI)

```bash
cd tammy-ai-technical-account-manager/backend

# Setup
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Run server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Testing & Quality
pytest                          # Run all tests
pytest tests/test_agent.py -v   # Run single test file
black app/ && isort app/        # Format code
mypy app/                       # Type check
ruff check app/                 # Lint

# RAG Knowledge Base CLI
python -m app.rag.cli ingest --dir ./data/knowledge
python -m app.rag.cli query "question here"
python -m app.rag.cli stats
python -m app.rag.cli clear --confirm
```

### Extension (TypeScript/Vite)

```bash
cd tammy-ai-technical-account-manager/extension

npm install
npm run dev          # Development build with watch
npm run build        # Production build
npm run typecheck    # TypeScript check
npm run lint         # ESLint
npm run format       # Prettier
```

Load the extension in Chrome: `chrome://extensions/` → Developer mode → Load unpacked → select `extension/dist`

## Architecture

### Data Flow

```
[Google Meet Tab] → [Content Script: Mic Capture] → [Service Worker: WebSocket]
                                                              ↓
[Overlay UI] ← [Content Script] ← [Service Worker] ← [Backend WebSocket]
                                                              ↓
                                      [Deepgram STT] → [Gemini LLM + RAG]
```

### Backend Components

- **`app/main.py`**: FastAPI entry point, CORS, lifespan events
- **`app/routers/websocket.py`**: WebSocket endpoint (`/ws/session`), `SessionHandler` orchestrates transcription + AI
- **`app/services/agent.py`**: "Continuous Participant" AI - Gemini processes all transcripts and decides when to suggest
- **`app/services/transcription.py`**: Deepgram SDK v5.3+ integration, async streaming
- **`app/rag/`**: ChromaDB vector store, document ingestion, retrieval pipeline
- **`app/config.py`**: Pydantic settings from `.env`

### Extension Components

- **`src/background/service-worker.ts`**: WebSocket client, session lifecycle, singleton enforcement
- **`src/content/content-script.ts`**: Mic capture (getUserMedia → resample 16kHz → PCM16), overlay management
- **`src/content/overlay.ts`**: Shadow DOM UI panel with drag/resize, displays transcripts + suggestions
- **`src/popup/popup.ts`**: Extension popup for starting sessions

### Key Design Patterns

1. **Continuous Participant Mode**: Every final transcript goes to Gemini. LLM maintains 20-turn history and decides when to respond (returns `---` to stay silent).

2. **Audio Pipeline**: Content script captures mic at native sample rate (44.1/48kHz) → linear interpolation resample to 16kHz → Int16 PCM → WebSocket → Deepgram.

3. **Session Singleton**: Background service worker enforces one active session. Tab close/navigate away auto-stops session.

## Environment Variables

Required in `tammy-ai-technical-account-manager/.env`:

```
DEEPGRAM_API_KEY=...    # console.deepgram.com
GEMINI_API_KEY=...      # aistudio.google.com/apikey
```

See `.env.example` for all options including `DEEPGRAM_MODEL`, `GEMINI_MODEL`, `ENABLE_DIARIZATION`.

## WebSocket Protocol

Client → Server:
- `{"type": "audio_chunk", "data": [int16...], "timestamp": ms}`
- `{"type": "control", "control": "start|stop|clear_context|get_status"}`

Server → Client:
- `{"type": "transcript", "text": "...", "speaker": "...", "is_final": bool}`
- `{"type": "suggestion", "response": "...", "question_type": "...", "confidence": float}`
- `{"type": "status", ...}` / `{"type": "error", ...}`

## Debugging

Check `extension/LOG.md` for known issues and fixes. Key logging points:
- Backend: Audio RMS levels every 10 chunks
- Content script: `[ContentScript]` prefixed logs with channel levels, track state
- Service worker: `[ServiceWorker]` session lifecycle events
