# Tammy AI: Engineering Walkthrough

A comprehensive tutorial for junior engineers joining the project.

## Table of Contents

1. [What Are We Building?](#what-are-we-building)
2. [The Big Picture](#the-big-picture)
3. [Setting Up Your Environment](#setting-up-your-environment)
4. [Part 1: The Chrome Extension](#part-1-the-chrome-extension)
5. [Part 2: The Backend Server](#part-2-the-backend-server)
6. [Part 3: The AI Pipeline](#part-3-the-ai-pipeline)
7. [Part 4: The RAG Knowledge Base](#part-4-the-rag-knowledge-base)
8. [Debugging Guide](#debugging-guide)
9. [Common Gotchas](#common-gotchas)

---

## What Are We Building?

Tammy is an AI assistant that helps sales representatives during Google Meet calls. Imagine you're a salesperson talking to a potential customer, and they ask a technical question you don't know the answer to. Tammy listens to the conversation in real-time and displays helpful suggestions on your screen.

**The user experience:**
1. Salesperson joins a Google Meet call
2. Clicks the Tammy browser extension to start a session
3. A floating panel appears showing the conversation transcript
4. When the customer asks something, Tammy suggests what to say
5. The salesperson reads the suggestion and responds naturally

**The technical challenge:**
- Capture audio from the browser tab
- Stream it to a server for transcription
- Run it through an AI to generate suggestions
- Display suggestions in real-time (< 2 seconds latency)

---

## The Big Picture

Here's how data flows through the system:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER'S CHROME BROWSER                         │
│                                                                      │
│  ┌──────────────┐    ┌─────────────────────────────────────────┐   │
│  │ Google Meet  │    │           Chrome Extension               │   │
│  │    Tab       │    │                                          │   │
│  │              │    │  ┌─────────────┐   ┌──────────────────┐ │   │
│  │  [Customer   │    │  │  Content    │   │  Service Worker  │ │   │
│  │   talking]   │◄───┼──│  Script     │   │  (Background)    │ │   │
│  │              │    │  │             │   │                  │ │   │
│  │  ┌────────┐  │    │  │ • Mic capture│   │ • WebSocket     │ │   │
│  │  │Overlay │  │    │  │ • Overlay UI │◄──│ • Message relay │ │   │
│  │  │ Panel  │  │    │  └─────────────┘   └────────┬─────────┘ │   │
│  │  └────────┘  │    │                             │            │   │
│  └──────────────┘    └─────────────────────────────┼────────────┘   │
└────────────────────────────────────────────────────┼────────────────┘
                                                     │ WebSocket
                                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND SERVER                               │
│                                                                      │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐│
│  │   FastAPI    │   │  Deepgram    │   │      Google Gemini       ││
│  │  WebSocket   │──►│  (Speech to  │──►│   (AI Suggestions)       ││
│  │   Handler    │   │   Text)      │   │                          ││
│  └──────────────┘   └──────────────┘   │  ┌────────────────────┐  ││
│                                         │  │   RAG Pipeline     │  ││
│                                         │  │  (Knowledge Base)  │  ││
│                                         │  └────────────────────┘  ││
│                                         └──────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

**Key insight:** The system has three main "hops":
1. **Browser → Backend**: Audio chunks over WebSocket
2. **Backend → Deepgram**: Audio to text (external API)
3. **Backend → Gemini**: Text to suggestions (external API)

Each hop adds latency, which is why we stream everything instead of waiting for complete data.

---

## Setting Up Your Environment

### Prerequisites

```bash
# Check your versions
node --version   # Should be 18+
python --version # Should be 3.10+
```

### Backend Setup

```bash
cd tammy-ai-technical-account-manager/backend

# Create a Python virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies (including dev tools)
pip install -e ".[dev]"

# Copy environment template and add your API keys
cp ../.env.example ../.env
# Edit .env and add DEEPGRAM_API_KEY and GEMINI_API_KEY
```

### Extension Setup

```bash
cd tammy-ai-technical-account-manager/extension

# Install dependencies
npm install

# Build in watch mode (rebuilds on file changes)
npm run dev
```

### Loading the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension/dist` folder
5. Pin the extension to your toolbar

### Running the System

Terminal 1 (Backend):
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

Terminal 2 (Extension - if making changes):
```bash
cd extension
npm run dev
```

---

## Part 1: The Chrome Extension

The extension is built with **Manifest V3**, Chrome's latest extension architecture. Let's understand each component.

### 1.1 The Manifest (`manifest.json`)

The manifest tells Chrome what permissions we need and what scripts to run:

```json
{
  "manifest_version": 3,
  "permissions": [
    "activeTab",      // Access the current tab
    "scripting",      // Inject scripts into pages
    "offscreen"       // Create hidden documents for audio processing
  ],
  "host_permissions": [
    "https://meet.google.com/*"  // Only runs on Google Meet
  ]
}
```

**Why these permissions?**
- `activeTab`: We need to know which tab is running Google Meet
- `scripting`: We inject our overlay UI into the Meet page
- `offscreen`: Chrome requires audio processing in a special "offscreen" document

### 1.2 The Service Worker (`src/background/service-worker.ts`)

Think of the service worker as the "brain" of the extension. It coordinates everything but can't directly interact with web pages.

**Key responsibilities:**
1. Manage the WebSocket connection to our backend
2. Route messages between components
3. Enforce the "one session at a time" rule

Let's look at the session start flow:

```typescript
async function handleStartSession(message: { backendUrl?: string }) {
  // SINGLETON CHECK: Only one session allowed
  if (wsClient?.isConnected && activeTabId !== null) {
    console.log('[ServiceWorker] Session already active, ignoring');
    return { success: true };
  }

  // Find the Google Meet tab
  const [tab] = await chrome.tabs.query({
    active: true,
    url: 'https://meet.google.com/*',
  });

  if (!tab?.id) {
    return { success: false, error: 'No active Google Meet tab found' };
  }

  // Connect to backend
  const backendUrl = message.backendUrl || 'ws://localhost:8000/ws/session';
  wsClient = new WebSocketClient(backendUrl);
  await wsClient.connect();

  // Initialize the UI overlay in the Meet tab
  await ensureContentScriptAndInitOverlay(tab.id);

  // Start microphone capture
  await chrome.tabs.sendMessage(tab.id, { type: 'START_MIC_CAPTURE' });

  activeTabId = tab.id;
  return { success: true };
}
```

**Why a singleton?** If multiple sessions ran simultaneously, we'd send duplicate audio and confuse the AI. The singleton pattern ensures clean state.

### 1.3 The Content Script (`src/content/content-script.ts`)

The content script runs **inside** the Google Meet page. It has access to the DOM and can use the Web Audio API.

**Key responsibilities:**
1. Capture microphone audio
2. Resample audio to 16kHz (what Deepgram expects)
3. Send audio chunks to the service worker
4. Display the overlay UI

#### Understanding Audio Capture

This is the trickiest part of the extension. Let's break it down:

```typescript
async function startMicCapture(): Promise<void> {
  // Step 1: Get microphone access
  // Note: We DON'T specify sampleRate here because Mac mics
  // don't support 16kHz - they only do 44.1kHz or 48kHz
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,  // We want raw audio
      noiseSuppression: false,
      autoGainControl: true,    // Helps with quiet microphones
      channelCount: 1,          // Mono audio
    },
    video: false,
  });

  // Step 2: Create audio processing context
  const deviceSampleRate = settings.sampleRate || 48000;
  audioContext = new AudioContext({ sampleRate: deviceSampleRate });

  // Step 3: Connect microphone to a processor
  const source = audioContext.createMediaStreamSource(mediaStream);
  scriptProcessor = audioContext.createScriptProcessor(4096, 2, 1);

  // Step 4: Process audio in chunks
  scriptProcessor.onaudioprocess = (event) => {
    // Get stereo channels and mix to mono
    const channel0 = event.inputBuffer.getChannelData(0);
    const channel1 = event.inputBuffer.getChannelData(1);

    const inputData = new Float32Array(channel0.length);
    for (let i = 0; i < channel0.length; i++) {
      inputData[i] = (channel0[i] + channel1[i]) / 2;  // Average for mono
    }

    // Resample from 48kHz to 16kHz
    const resampledData = resample(inputData, actualSampleRate, 16000);

    // Convert float (-1 to 1) to 16-bit integer (-32768 to 32767)
    const pcmData = new Int16Array(resampledData.length);
    for (let i = 0; i < resampledData.length; i++) {
      const sample = Math.max(-1, Math.min(1, resampledData[i]));
      pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    // Send to service worker
    chrome.runtime.sendMessage({
      type: 'AUDIO_CHUNK',
      data: Array.from(pcmData),
      timestamp: Date.now(),
    });
  };

  source.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);
}
```

**Why all this complexity?**

1. **Resampling**: Deepgram expects 16kHz audio, but browsers record at 44.1kHz or 48kHz. We must downsample.

2. **Stereo to Mono**: Some microphones are stereo. We average both channels.

3. **Float to Int16**: The Web Audio API uses floats (-1 to 1), but Deepgram expects 16-bit integers.

#### The Resampling Function

```typescript
function resample(
  inputData: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number
): Float32Array {
  const ratio = sourceSampleRate / targetSampleRate;  // e.g., 48000/16000 = 3
  const outputLength = Math.floor(inputData.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    // For each output sample, find the corresponding input position
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1);
    const fraction = srcIndex - srcIndexFloor;

    // Linear interpolation between two nearest samples
    output[i] = inputData[srcIndexFloor] + fraction * (inputData[srcIndexCeil] - inputData[srcIndexFloor]);
  }

  return output;
}
```

**Linear interpolation** creates smoother audio than just taking every 3rd sample.

### 1.4 The Overlay (`src/content/overlay.ts`)

The overlay is the UI panel that appears on the Google Meet page. It uses **Shadow DOM** for style isolation.

**Why Shadow DOM?**

Google Meet has its own CSS that could conflict with ours. Shadow DOM creates a boundary where Meet's styles can't affect our overlay.

```typescript
export class AIOverlay {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'presales-ai-overlay-container';

    // Create a shadow root - Meet's CSS can't penetrate this
    this.shadow = this.container.attachShadow({ mode: 'closed' });

    // Load our styles into the shadow DOM
    this.loadStyles();
    this.panel = this.createOverlayStructure();
    this.shadow.appendChild(this.panel);
  }
}
```

---

## Part 2: The Backend Server

The backend is a **FastAPI** application that handles WebSocket connections and orchestrates the AI pipeline.

### 2.1 Application Entry Point (`app/main.py`)

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Presales AI Assistant",
    version="1.0.0",
    lifespan=lifespan,  # Handles startup/shutdown
)

# Allow the Chrome extension to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["chrome-extension://*", "http://localhost:*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**CORS (Cross-Origin Resource Sharing)** is crucial here. By default, browsers block requests to different origins. We must explicitly allow our extension's origin.

### 2.2 The WebSocket Handler (`app/routers/websocket.py`)

This is the heart of the backend. Let's understand the session lifecycle:

```python
@router.websocket("/ws/session")
async def websocket_session(websocket: WebSocket) -> None:
    # Accept the connection and assign a session ID
    session_id = await manager.connect(websocket)

    # Create a handler for this session
    handler = SessionHandler(session_id, websocket)

    try:
        # Initialize services (connect to Deepgram)
        await handler.setup()

        # Send confirmation to the extension
        await manager.send_message(session_id, {
            "type": "status",
            "status": "connected",
            "session_id": session_id,
        })

        # Main message loop
        while True:
            message = await websocket.receive()

            if message["type"] == "websocket.receive":
                if "text" in message:
                    # JSON message (control commands)
                    data = json.loads(message["text"])
                    await _process_json_message(handler, data)
                elif "bytes" in message:
                    # Binary audio data
                    await handler.handle_binary_audio(message["bytes"])

    except WebSocketDisconnect:
        logger.info(f"Session {session_id}: Disconnected")
    finally:
        await handler.cleanup()
        await manager.disconnect(session_id)
```

**Key pattern:** The `try/finally` ensures cleanup always happens, even if the connection drops unexpectedly.

### 2.3 The Session Handler

Each WebSocket connection gets its own `SessionHandler`:

```python
class SessionHandler:
    def __init__(self, session_id: str, websocket: WebSocket):
        self.session_id = session_id
        self.websocket = websocket

        # Each session has its own service instances
        self.transcription = TranscriptionService()
        self.agent = AgentService()

    async def setup(self) -> bool:
        # Tell the transcription service where to send results
        self.transcription.set_transcript_callback(self._handle_transcript)

        # Connect to Deepgram
        connected = await self.transcription.connect()
        self.is_listening = connected
        return True

    async def _handle_transcript(self, transcript: Transcript) -> None:
        # Send transcript to the extension
        await manager.send_message(self.session_id, {
            "type": "transcript",
            "text": transcript.text,
            "speaker": transcript.speaker,
            "is_final": transcript.is_final,
        })

        # For final transcripts, ask the AI if it has something to say
        if transcript.is_final:
            suggestion = await self.agent.process_transcript(
                text=transcript.text,
                speaker=transcript.speaker,
            )

            if suggestion:
                await self._send_suggestion(suggestion, transcript.text)
```

**Why separate services per session?**

Each call is independent. If two salespeople are on calls simultaneously, their transcription buffers and conversation histories shouldn't mix.

---

## Part 3: The AI Pipeline

### 3.1 The Transcription Service (`app/services/transcription.py`)

This service wraps the Deepgram SDK:

```python
class TranscriptionService:
    async def connect(self) -> bool:
        from deepgram import AsyncDeepgramClient, EventType

        self._client = AsyncDeepgramClient(api_key=self.api_key)

        # Configure live transcription options
        options = {
            "model": "nova-3",           # Best accuracy model
            "language": "en",
            "punctuate": True,           # Add punctuation
            "diarize": True,             # Identify different speakers
            "encoding": "linear16",      # 16-bit PCM
            "sample_rate": 16000,
            "channels": 1,
        }

        # Open streaming connection
        self._connection = self._client.listen.live.v("1")

        # Register event handlers
        self._connection.on(EventType.TRANSCRIPT, self._on_transcript)
        self._connection.on(EventType.ERROR, self._on_error)

        await self._connection.__aenter__()  # Start the connection
        return True

    async def send_audio_chunk(self, samples: list[int]) -> None:
        """Send audio samples to Deepgram."""
        # Convert list of ints to bytes
        buffer = struct.pack(f"<{len(samples)}h", *samples)
        await self._connection.send_media(buffer)
```

**Key concept: Streaming**

We don't wait for the entire call to finish. As soon as we have audio, we send it. Deepgram processes it incrementally and sends back transcripts as they're ready.

### 3.2 The Agent Service (`app/services/agent.py`)

This is where the AI magic happens. We use a "Continuous Participant" architecture:

```python
class AgentService:
    def __init__(self):
        self._chat_history: list[dict] = []
        self._last_suggestion_time: Optional[datetime] = None
        self._suggestion_cooldown_seconds = 5

    async def process_transcript(
        self,
        text: str,
        speaker: str,
        is_final: bool = True,
    ) -> Optional[Suggestion]:
        """Process every final transcript and decide whether to suggest."""

        # Skip very short utterances
        if len(text.split()) < 2:
            return None

        # Add to conversation history
        self._chat_history.append({
            "speaker": speaker,
            "text": text,
            "timestamp": datetime.utcnow().isoformat(),
        })

        # Don't spam suggestions - wait 5 seconds between them
        if self._last_suggestion_time:
            elapsed = (datetime.utcnow() - self._last_suggestion_time).total_seconds()
            if elapsed < self._suggestion_cooldown_seconds:
                return None

        # Ask the LLM what to do
        suggestion = await self._generate_response(text, speaker)

        if suggestion:
            self._last_suggestion_time = datetime.utcnow()

        return suggestion
```

**Why "Continuous Participant"?**

Earlier versions only triggered when we detected a question (using regex patterns). This missed important opportunities:
- Customer mentions a pain point → opportunity to highlight a feature
- Customer raises an objection → need to handle it
- Customer seems confused → time to simplify

Now, the LLM sees **everything** and decides when to help.

### 3.3 The System Prompt

The system prompt is crucial. It tells the LLM how to behave:

```python
CONTINUOUS_SYSTEM_PROMPT = """You are TAMMY, an AI Technical Account Manager for CloudGeometry,
silently participating in a live sales call. You are helping a NON-TECHNICAL sales rep.

WHEN TO RESPOND:
- When the customer asks a technical question the sales rep might not know
- When the customer mentions a pain point you can address
- When there's an opportunity to suggest a good discovery question

WHEN TO STAY SILENT (respond with exactly "---"):
- Small talk, greetings
- The sales rep is handling it well
- Just acknowledgments like "okay", "sure"
- You have nothing valuable to add

RESPONSE FORMAT (when you have something to say):
📌 [One-line key point]
• Talking point 1
• Talking point 2
💬 Ask: "[suggested question]" (if relevant)

CRITICAL RULES:
1. Be EXTREMELY CONCISE - this is a live call
2. Max 3-4 bullet points
3. If nothing valuable to add, respond with exactly: ---
"""
```

**The "---" convention** is important. The LLM can explicitly choose silence, which prevents noise when nothing useful can be said.

---

## Part 4: The RAG Knowledge Base

RAG (Retrieval-Augmented Generation) enhances the AI with company-specific knowledge.

### 4.1 How RAG Works

```
[User Question] → [Embedding Model] → [Vector Search] → [Relevant Docs]
                                                              ↓
[LLM Response] ← [LLM + Context] ← [Question + Relevant Docs]
```

1. **Embedding**: Convert text to a vector (list of numbers) that captures meaning
2. **Vector Search**: Find documents with similar vectors (similar meaning)
3. **Augmented Generation**: Give the LLM the relevant docs as context

### 4.2 Document Ingestion (`app/rag/ingestion.py`)

Before RAG can work, we need to load our knowledge base:

```python
class DocumentIngestionPipeline:
    async def ingest_file(self, file_path: str) -> list[Chunk]:
        # Read the file
        content = Path(file_path).read_text()

        # Split into chunks (LLMs have token limits)
        chunks = self._split_into_chunks(content)

        # Generate embeddings for each chunk
        embeddings = await self._generate_embeddings(chunks)

        # Store in vector database
        await self._store.add_documents(chunks, embeddings)

        return chunks

    def _split_into_chunks(self, content: str) -> list[str]:
        """Split text into ~500 token chunks with overlap."""
        # Overlap ensures we don't cut off important context
        # at chunk boundaries
        pass
```

**Why chunks?**
- LLMs have context limits (e.g., 8K tokens)
- Smaller chunks = more precise retrieval
- Overlap prevents losing information at boundaries

### 4.3 The Vector Store (`app/rag/vector_store.py`)

We use **ChromaDB** for development (stores vectors locally):

```python
class ChromaVectorStore:
    def __init__(self):
        self._client = chromadb.PersistentClient(
            path=settings.chroma_persist_directory
        )
        self._collection = self._client.get_or_create_collection(
            name=settings.rag_collection_name,
            metadata={"hnsw:space": "cosine"}  # Use cosine similarity
        )

    async def search(self, query_embedding: list[float], top_k: int = 4):
        results = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
        )
        return results
```

**Cosine similarity** measures how similar two vectors are (1 = identical, 0 = unrelated).

### 4.4 Using the RAG CLI

```bash
cd backend

# Ingest all knowledge base documents
python -m app.rag.cli ingest --dir ../data/knowledge

# Test a query
python -m app.rag.cli query "What cloud platforms does CloudGeometry support?"

# Check statistics
python -m app.rag.cli stats

# Clear and re-ingest (if documents changed)
python -m app.rag.cli clear --confirm
python -m app.rag.cli ingest
```

---

## Debugging Guide

### Problem: No transcripts appearing

**Check the audio pipeline:**

1. **Content script receiving audio?**
   - Open Meet tab DevTools (F12)
   - Look for `[ContentScript] Audio #10: ch0=0.0123...`
   - If values are 0.0001 or less, mic isn't capturing

2. **Service worker receiving chunks?**
   - Go to `chrome://extensions/`
   - Click "Service Worker" under your extension
   - Look for `[ServiceWorker] AUDIO_CHUNK received`

3. **Backend receiving chunks?**
   - Check backend terminal for `Audio chunk #10 - RMS=...`
   - Low RMS (< 50) means silence

4. **Deepgram connected?**
   - Look for `Connected to Deepgram` in backend logs
   - Check `DEEPGRAM_API_KEY` in `.env`

### Problem: Transcripts work but no suggestions

**Check the AI pipeline:**

1. **Is Gemini configured?**
   - Look for `Gemini API key configured` at startup
   - Check `GEMINI_API_KEY` in `.env`

2. **Is the LLM choosing silence?**
   - Add logging in `agent.py`:
   ```python
   logger.info(f"LLM response: {response_text}")
   ```
   - If response is "---", the LLM chose not to suggest

3. **Is cooldown blocking?**
   - Default is 5 seconds between suggestions
   - Check `Suggestion cooldown active` in logs

### Problem: Extension not loading

1. Check `chrome://extensions/` for errors
2. Click "Errors" button if present
3. Common issues:
   - Build not run (`npm run build`)
   - Wrong folder selected (should be `extension/dist`)
   - Manifest syntax error

### Useful Log Searches

```bash
# In backend terminal
grep "RMS=" logs.txt              # Audio levels
grep "Transcript:" logs.txt       # What Deepgram heard
grep "LLM suggestion" logs.txt    # AI suggestions

# In browser console (Meet tab)
[ContentScript]                   # Audio capture
[Overlay]                         # UI updates
```

---

## Common Gotchas

### 1. Mac Microphone Sample Rate

**Problem:** Mac microphones don't support 16kHz recording.

**Solution:** We record at the device's native rate (44.1/48kHz) and resample in JavaScript.

```typescript
// DON'T do this:
getUserMedia({ audio: { sampleRate: 16000 } })  // Will fail on Mac

// DO this:
getUserMedia({ audio: {} })  // Use native rate, resample later
```

### 2. Chrome Extension Context Invalidation

**Problem:** When you reload the extension, existing content scripts become "orphaned" and can't communicate with the new service worker.

**Solution:** We check for validity and clean up:

```typescript
function isExtensionValid(): boolean {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}
```

### 3. AudioContext Autoplay Policy

**Problem:** Chrome suspends AudioContext until user interaction.

**Solution:** Resume after a user gesture (clicking the extension icon counts):

```typescript
if (audioContext.state === 'suspended') {
  await audioContext.resume();
}
```

### 4. WebSocket Connection Ordering

**Problem:** Messages might arrive before the handler is ready.

**Solution:** Always check state before processing:

```python
async def _handle_transcript(self, transcript: Transcript) -> None:
    if not self.is_active:
        return  # Session is closing, ignore
```

### 5. Deepgram SDK Version

**Problem:** The Deepgram SDK changed significantly between v4 and v5.

**Solution:** We use v5.3+. Key differences:
- `AsyncDeepgramClient` instead of `Deepgram`
- `EventType.TRANSCRIPT` instead of `LiveTranscriptionEvents.Transcript`
- Must `await` `send_media()` (it's now async)

### 6. Shadow DOM Event Handling

**Problem:** Events inside Shadow DOM don't bubble to the main document by default.

**Solution:** Use `{ composed: true }` for events that need to escape:

```typescript
this.dispatchEvent(new CustomEvent('overlay-closed', {
  bubbles: true,
  composed: true  // Escapes shadow boundary
}));
```

---

## Next Steps

1. **Run through the setup** - Get the system working locally
2. **Add console.log statements** - Trace the data flow yourself
3. **Break things intentionally** - See what happens when Deepgram is down, etc.
4. **Read the LOG.md** - See real debugging sessions and solutions
5. **Make a small change** - Try modifying the overlay UI or system prompt

Welcome to the team! 🎉
