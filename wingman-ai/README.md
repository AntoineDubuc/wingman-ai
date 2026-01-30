# Presales AI Assistant

Real-time AI assistant for Technical Cloud Solutions Presales Consultants during Google Meet calls. The system captures meeting audio, transcribes it using Deepgram, and provides contextually-aware response suggestions using Google Gemini with RAG-powered knowledge retrieval.

## Features

- **Real-time Audio Capture**: Chrome extension captures Google Meet audio via TabCapture API
- **Live Transcription**: Deepgram Nova-3 provides accurate speech-to-text with speaker diarization
- **AI-Powered Suggestions**: Gemini generates contextual response suggestions based on customer questions
- **Knowledge Base Integration**: RAG pipeline retrieves relevant product documentation
- **Unobtrusive UI**: Floating overlay displays suggestions without disrupting the meeting

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SALESPERSON'S BROWSER                              │
│                                                                              │
│   ┌──────────────┐         ┌──────────────────────────────────────────────┐ │
│   │ Google Meet  │         │         Chrome Extension                     │ │
│   │              │◄────────┤  TabCapture → WebSocket → Overlay UI         │ │
│   └──────────────┘         └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │ WebSocket
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND SERVICE                                 │
│                                                                              │
│   Deepgram (STT) → Gemini (LLM) → Knowledge Base (RAG)                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Node.js** 18+ (for Chrome extension)
- **Python** 3.10+ (3.11+ recommended for async performance)
- **Chrome** 116+ (for TabCapture API with offscreen documents)
- **API Keys**:
  - [Deepgram](https://console.deepgram.com/) - Speech-to-text
  - [Google AI Studio](https://aistudio.google.com/apikey) - Gemini LLM

## Quick Start

### 1. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/cloudgeometry/presales-ai-assistant.git
cd presales-ai-assistant

# Copy environment template
cp .env.example .env

# Edit .env and add your API keys
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Or with development dependencies
pip install -e ".[dev]"

# Start the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Extension Setup

```bash
cd extension

# Install dependencies
npm install

# Build for development (with watch mode)
npm run dev

# Or build for production
npm run build
```

### 4. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `extension/dist` folder
5. Pin the extension to your toolbar

### 5. Test the Setup

1. Start a Google Meet call (can be a test call with yourself)
2. Click the Presales AI Assistant extension icon
3. Enter your backend URL (default: `ws://localhost:8000/ws/session`)
4. Click "Start Session"
5. Speak a test question and watch for AI suggestions

## Project Structure

```
presales-ai-assistant/
├── extension/                 # Chrome Extension (Track A)
│   ├── src/
│   │   ├── background/       # Service worker
│   │   ├── content/          # Content script & overlay
│   │   ├── popup/            # Extension popup UI
│   │   ├── offscreen/        # Audio processing
│   │   └── shared/           # Shared utilities
│   ├── manifest.json
│   ├── package.json
│   └── tsconfig.json
│
├── backend/                   # FastAPI Backend (Track B & C)
│   ├── app/
│   │   ├── routers/          # API endpoints
│   │   ├── services/         # Business logic
│   │   └── models/           # Pydantic schemas
│   ├── requirements.txt
│   └── pyproject.toml
│
├── docs/                      # Documentation
├── .env.example              # Environment template
├── .gitignore
└── README.md
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DEEPGRAM_API_KEY` | Deepgram API key for transcription | Yes |
| `GEMINI_API_KEY` | Google Gemini API key for LLM | Yes |
| `DEEPGRAM_MODEL` | Model: `nova-3`, `nova-2-meeting`, `flux-general-en` | No (default: `nova-3`) |
| `GEMINI_MODEL` | Model: `gemini-2.5-flash`, `gemini-2.5-pro` | No (default: `gemini-2.5-flash`) |
| `ENABLE_DIARIZATION` | Enable speaker identification | No (default: `true`) |

See `.env.example` for all configuration options.

## Development

### Backend Development

```bash
cd backend

# Run with auto-reload
uvicorn app.main:app --reload

# Run tests
pytest

# Format code
black app/
isort app/

# Type checking
mypy app/

# Lint
ruff check app/
```

### Extension Development

```bash
cd extension

# Development build with watch
npm run dev

# Type checking
npm run typecheck

# Lint
npm run lint

# Format
npm run format
```

## API Documentation

When the backend is running, access the auto-generated API docs:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Troubleshooting

### Extension Issues

**"TabCapture permission denied"**
- Ensure you're on a Google Meet page
- The extension requires a user gesture (click) to start capture

**"WebSocket connection failed"**
- Verify the backend is running
- Check the WebSocket URL in extension settings
- Ensure CORS is configured for the extension origin

### Backend Issues

**"Deepgram connection failed"**
- Verify your `DEEPGRAM_API_KEY` is valid
- Check your Deepgram account has available credits

**"Gemini API error"**
- Verify your `GEMINI_API_KEY` is valid
- Ensure you're using the correct model name (`gemini-2.5-flash`)

## Tech Stack

| Component | Technology |
|-----------|------------|
| Extension | TypeScript, Chrome Extension Manifest V3, Vite |
| Backend | Python 3.10+, FastAPI, WebSocket |
| Transcription | Deepgram Nova-3 |
| LLM | Google Gemini 2.5 |
| Vector DB | ChromaDB (dev), Pinecone (prod) |
| Embedding | gemini-embedding-001 |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [Deepgram](https://deepgram.com/) for real-time speech-to-text
- [Google AI](https://ai.google.dev/) for Gemini LLM
- [ChromaDB](https://www.trychroma.com/) for vector storage
