# Implementation Plan: Presales AI Assistant for Google Meet

---

## Executive Summary

A real-time AI assistant that listens to customer questions during Google Meet sales calls and provides suggested technical answers to Technical Cloud Solutions Presales Consultants. The system captures meeting audio via a Chrome extension, transcribes it using Deepgram, and generates contextually-aware responses using Gemini with access to a product knowledge base. The assistant is invisible to customers—only the presales consultant sees the AI-generated suggestions in a floating overlay.

**Key Outcomes:**
- Presales consultants receive instant, accurate technical answers during live customer calls
- Reduced "I'll get back to you on that" moments—answers are available in real-time
- Consistent messaging across all customer interactions using centralized knowledge base
- Faster ramp-up time for new presales team members

---

## Product Manager Review

### Feature Overview

This implementation delivers a complete real-time AI assistant system comprising a Chrome extension for audio capture and display, a backend service for transcription and AI processing, and a knowledge base for product-specific context.

### Features

#### Feature 1: Real-Time Audio Capture & Transcription

**What it is:** Chrome extension that captures Google Meet audio using the TabCapture API and streams it to a backend for real-time transcription with speaker identification.

**Why it matters:** Enables the AI to understand exactly what the customer is asking, with speaker diarization distinguishing customer questions from consultant responses.

**User perspective:** The presales consultant simply clicks "Start" in the extension while on a Google Meet call. The system silently captures all audio and begins generating suggestions when customers ask questions. No setup required for each call.

---

#### Feature 2: AI-Powered Response Suggestions

**What it is:** When a customer asks a question, the system searches the product knowledge base, retrieves relevant context, and generates a suggested response using Gemini 1.5 Flash.

**Why it matters:** Provides instant access to accurate technical information without the consultant needing to search documentation or remember every product detail.

**User perspective:** A floating overlay displays AI suggestions within 2-3 seconds of the customer finishing their question. Suggestions are formatted as talking points the consultant can naturally incorporate into their response.

---

#### Feature 3: Product Knowledge Base

**What it is:** A vector database containing product documentation, pricing information, competitive comparisons, FAQ, and objection handling guides that the AI uses for context.

**Why it matters:** Ensures AI responses are specific to your products and accurate, rather than generic or potentially incorrect information.

**User perspective:** Product and sales teams can upload and update knowledge base content through a simple admin interface. Changes are immediately reflected in AI suggestions.

---

#### Feature 4: Response Overlay UI

**What it is:** A draggable, resizable floating panel that displays AI suggestions on top of the Google Meet window without being visible in the meeting itself.

**Why it matters:** Keeps suggestions visible and accessible without disrupting the natural flow of the sales conversation.

**User perspective:** The overlay appears in a corner of the screen, showing the detected question and suggested response. Consultants can minimize, reposition, or dismiss suggestions as needed.

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
| [ ] | 1 | Project setup & configuration | | | | 60 | |
| [ ] | 2 | Chrome extension manifest & structure | | | | 120 | |
| [ ] | 3 | TabCapture audio capture implementation | | | | 180 | |
| [ ] | 4 | WebSocket client in extension | | | | 90 | |
| [ ] | 5 | Overlay UI component | | | | 150 | |
| [ ] | 6 | Backend FastAPI scaffold | | | | 60 | |
| [ ] | 7 | WebSocket server endpoint | | | | 90 | |
| [ ] | 8 | Deepgram transcription integration | | | | 120 | |
| [ ] | 9 | Gemini LLM integration | | | | 90 | |
| [ ] | 10 | Knowledge base setup (vector DB) | | | | 180 | |
| [ ] | 11 | RAG retrieval pipeline | | | | 150 | |
| [ ] | 12 | System prompt engineering | | | | 60 | |
| [ ] | 13 | Response formatting & filtering | | | | 60 | |
| [ ] | 14 | Extension popup (settings UI) | | | | 90 | |
| [ ] | 15 | End-to-end integration testing | | | | 120 | |

**Summary:**
- Total tasks: 15
- Completed: 0
- Total time spent: 0 minutes
- Total human estimate: 1,620 minutes (27 hours)
- Overall multiplier: TBD

---

## Task Descriptions

This section provides context for each task. Read the relevant description before starting implementation.

---

### Task 1: Project setup & configuration

**Intent:** Initialize the project repository with proper structure, dependencies, and development tooling.

**Context:** This is the foundation task. All other tasks depend on having a properly configured development environment.

**Expected behavior:** A developer can clone the repo, run `npm install` (extension) and `pip install -r requirements.txt` (backend), and have all tools ready to work.

**Key components:**
- `package.json` for extension (TypeScript, build tools)
- `requirements.txt` for backend (FastAPI, Deepgram SDK, Google AI SDK)
- `.env.example` with required API keys
- `README.md` with setup instructions

**Notes:** Ensure both Manifest V3 requirements and Python 3.11+ compatibility.

---

### Task 2: Chrome extension manifest & structure

**Intent:** Create the Chrome extension skeleton with Manifest V3 configuration and file structure.

**Context:** Chrome extensions require specific manifest configuration. Manifest V3 is required for new extensions and has different patterns than V2 (service workers instead of background pages).

**Expected behavior:** Extension can be loaded in Chrome developer mode without errors and shows in the extensions toolbar.

**Key components:**
- `manifest.json` with permissions (tabCapture, activeTab, storage)
- `background/service-worker.js` (empty scaffold)
- `content/content.js` (empty scaffold)
- `ui/overlay.html`, `overlay.css`, `overlay.js`
- `popup/popup.html`, `popup.js`

**Notes:** TabCapture requires `tabCapture` permission. Host permissions needed for meet.google.com and backend URL.

---

### Task 3: TabCapture audio capture implementation

**Intent:** Implement the audio capture functionality using Chrome's TabCapture API.

**Context:** TabCapture provides access to the audio stream of the current tab. This is more reliable than DOM scraping for captions and provides higher quality audio.

**Expected behavior:** When activated on a Google Meet tab, the extension captures the meeting audio as a MediaStream that can be processed and sent to the backend.

**Key components:**
- `lib/audio-capture.js` - TabCapture API wrapper
- Audio processing (convert to format suitable for Deepgram)
- Start/stop capture controls
- Error handling for permission denial

**Notes:** TabCapture requires user gesture to activate. Consider using offscreen document for Manifest V3 audio processing.

---

### Task 4: WebSocket client in extension

**Intent:** Implement WebSocket connection from extension to backend for streaming audio and receiving AI responses.

**Context:** WebSocket enables bidirectional real-time communication. Audio chunks stream to backend, AI responses stream back to extension.

**Expected behavior:** Extension maintains persistent WebSocket connection during active calls. Automatically reconnects on disconnect. Handles connection state properly.

**Key components:**
- `lib/websocket-client.js` - WebSocket connection manager
- Audio chunk streaming logic
- Response message handler
- Connection state management (connecting, connected, disconnected)
- Auto-reconnection with exponential backoff

**Notes:** Connection should only be active when user starts a session. Handle network interruptions gracefully.

---

### Task 5: Overlay UI component

**Intent:** Build the floating UI that displays AI suggestions to the presales consultant.

**Context:** The overlay must be visible to the user but not captured in the meeting (screen share). It should be unobtrusive but accessible.

**Expected behavior:** A floating panel appears in the corner of the screen showing the detected question and AI suggestion. User can drag to reposition, minimize, or dismiss. New suggestions animate in smoothly.

**Key components:**
- `ui/overlay.html` - Panel structure
- `ui/overlay.css` - Styling (draggable, semi-transparent, professional)
- `ui/overlay.js` - Logic (receive messages, display, user interactions)
- Content script to inject overlay into page

**Notes:** Use shadow DOM to isolate styles. Ensure overlay doesn't interfere with Meet UI interactions.

---

### Task 6: Backend FastAPI scaffold

**Intent:** Set up the Python backend with FastAPI framework and basic project structure.

**Context:** Backend handles audio processing, transcription, AI inference, and knowledge base queries. FastAPI provides async support needed for real-time processing.

**Expected behavior:** Backend starts without errors, health endpoint returns 200, basic logging configured.

**Key components:**
- `main.py` - FastAPI app entry point
- `config.py` - Environment configuration
- `routers/` - API route modules
- `services/` - Business logic modules
- `models/schemas.py` - Pydantic models

**Notes:** Use async throughout. Configure CORS for extension origin.

---

### Task 7: WebSocket server endpoint

**Intent:** Implement the WebSocket endpoint that receives audio from the extension and sends AI responses back.

**Context:** This is the real-time communication hub. Must handle multiple concurrent connections (multiple salespeople) efficiently.

**Expected behavior:** Accepts WebSocket connections from authenticated extensions. Receives audio chunks, processes them, returns transcripts and AI suggestions.

**Key components:**
- `routers/websocket.py` - WebSocket endpoint
- Connection management (track active sessions)
- Message protocol (audio chunks in, text/suggestions out)
- Session cleanup on disconnect

**Notes:** Consider using connection pools. Implement proper error handling for malformed messages.

---

### Task 8: Deepgram transcription integration

**Intent:** Integrate Deepgram's streaming API for real-time speech-to-text with speaker diarization.

**Context:** Deepgram Nova-3 provides best-in-class accuracy (8% WER) with real-time streaming and speaker identification. This is critical for distinguishing customer questions from consultant responses.

**Expected behavior:** Audio chunks are streamed to Deepgram, transcripts return in real-time with speaker labels. System identifies when speaker changes and accumulates utterances.

**Key components:**
- `services/transcription.py` - Deepgram client wrapper
- Streaming audio to Deepgram WebSocket
- Handling interim and final transcripts
- Speaker diarization processing
- Pause/utterance detection

**Notes:** Use Deepgram's Python SDK. Enable diarization and punctuation. Handle API errors gracefully.

---

### Task 9: Gemini LLM integration

**Intent:** Integrate Google's Gemini 1.5 Flash for generating response suggestions based on transcripts and knowledge base context.

**Context:** Gemini Flash offers fast inference (important for real-time use) at low cost. The LLM generates contextually appropriate suggestions based on the question and retrieved product knowledge.

**Expected behavior:** When a customer question is detected, the system retrieves relevant context from the knowledge base, constructs a prompt, and generates a helpful response suggestion.

**Key components:**
- `services/agent.py` - Gemini client and prompt management
- Prompt construction with context injection
- Response generation
- Streaming response handling (for faster first-token)

**Notes:** Use streaming responses to reduce perceived latency. Implement token limits to keep costs predictable.

---

### Task 10: Knowledge base setup (vector DB)

**Intent:** Set up a vector database to store and retrieve product knowledge for RAG (Retrieval Augmented Generation).

**Context:** The knowledge base contains product docs, pricing, FAQs, and competitive info. Vector search enables semantic retrieval of relevant content based on customer questions.

**Expected behavior:** Documents can be uploaded, chunked, embedded, and stored. Queries return relevant chunks ranked by similarity.

**Key components:**
- `services/knowledge_base.py` - Vector DB client
- Document chunking logic
- Embedding generation (using Gemini or dedicated embedding model)
- Similarity search implementation
- Pinecone or Chroma integration

**Notes:** Start with Chroma (local/free) for development, migrate to Pinecone for production. Chunk size ~500 tokens works well.

---

### Task 11: RAG retrieval pipeline

**Intent:** Build the pipeline that retrieves relevant knowledge base content when a customer asks a question.

**Context:** RAG improves AI response quality by grounding responses in actual product documentation rather than LLM's training data.

**Expected behavior:** Customer question → embed → search → retrieve top-k chunks → inject into prompt → generate response. All within <1 second.

**Key components:**
- Query embedding
- Top-k retrieval (k=3-5)
- Context formatting for prompt
- Relevance threshold filtering
- Fallback handling when no relevant content found

**Notes:** Balance retrieval quality vs latency. Consider caching frequent queries.

---

### Task 12: System prompt engineering

**Intent:** Craft the system prompt that guides the AI to generate appropriate presales responses.

**Context:** The system prompt defines the AI's persona (technical presales expert), response style (concise talking points), and constraints (stay accurate, don't invent features).

**Expected behavior:** AI responses are formatted as natural talking points, technically accurate, and appropriate for live sales conversations.

**Key components:**
- `prompts/presales_system_prompt.txt` - Main system prompt
- Persona definition
- Response format instructions
- Guardrails (accuracy, no hallucination)
- Context injection template

**Notes:** Iterate on prompt based on real usage feedback. Include examples of good responses.

---

### Task 13: Response formatting & filtering

**Intent:** Process AI responses to ensure they're appropriately formatted and filter out non-actionable suggestions.

**Context:** Not every transcript needs a response. The system should detect actual questions and filter out small talk, acknowledgments, or statements that don't require AI assistance.

**Expected behavior:** Only meaningful customer questions trigger AI suggestions. Responses are formatted as bullet points or short paragraphs suitable for quick reading during a call.

**Key components:**
- `services/response_manager.py`
- Question detection logic
- Response formatting (bullets, highlights)
- Noise filtering (skip "yes", "okay", etc.)
- Confidence thresholding

**Notes:** Use simple heuristics initially (question marks, interrogative words). Can add ML classification later.

---

### Task 14: Extension popup (settings UI)

**Intent:** Build the extension popup that appears when clicking the extension icon, providing settings and session controls.

**Context:** Users need to start/stop sessions, see connection status, and configure preferences.

**Expected behavior:** Popup shows connection status, start/stop button, and basic settings (backend URL, API key). Settings persist in chrome.storage.

**Key components:**
- `popup/popup.html` - UI structure
- `popup/popup.js` - Logic and state management
- Settings storage and retrieval
- Connection status indicator
- Session controls

**Notes:** Keep UI simple. Most interaction happens via overlay during calls.

---

### Task 15: End-to-end integration testing

**Intent:** Test the complete system flow from audio capture to AI response display.

**Context:** Individual components may work in isolation but fail when integrated. This task validates the full user journey.

**Expected behavior:** Start extension on Meet call → speak test question → see transcript → receive AI suggestion in overlay. Latency under 3 seconds.

**Key components:**
- Test with real Google Meet call (internal)
- Verify audio capture quality
- Check transcription accuracy
- Validate AI response relevance
- Measure end-to-end latency
- Document issues for iteration

**Notes:** Test with multiple browsers, network conditions. Create test script with sample questions.

---

## Appendix

### Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Audio capture method | TabCapture API | More reliable than caption scraping, provides raw audio for better transcription |
| Transcription service | Deepgram Nova-3 | Best accuracy (8% WER), real-time streaming, speaker diarization, competitive pricing |
| LLM | Gemini 1.5 Flash | Fast inference (<1s), low cost, good quality for short responses |
| Vector database | Chroma (dev) / Pinecone (prod) | Chroma is free for development; Pinecone scales for production |
| Backend framework | FastAPI | Native async support, WebSocket handling, good Python AI library ecosystem |
| Extension manifest | V3 | Required for new Chrome extensions, better security model |

### Dependencies

**External Services (require API keys):**
- Deepgram - Transcription ($0.0077/min)
- Google AI Studio - Gemini API (free tier available, ~$0.01/1K tokens)
- Pinecone - Vector database ($70/mo starter, or use Chroma free)

**Development:**
- Node.js 18+ (extension build)
- Python 3.11+ (backend)
- Chrome browser (testing)

### Out of Scope

The following are explicitly NOT included in this implementation phase:

- **User authentication system** - Will use simple API key for MVP
- **Admin UI for knowledge base** - Documents uploaded via API/CLI initially
- **Multi-language support** - English only for MVP
- **Mobile support** - Desktop Chrome only
- **Call recording/storage** - No transcripts stored for privacy
- **CRM integration** - Future enhancement
- **Post-call summaries** - Future enhancement
- **Analytics dashboard** - Basic logging only for MVP

---

*Plan created January 26, 2026*
