# Session Start Flow

Complete trace from user clicking "Start" to active session with live transcription.

> **Visual Diagram:** See [SEQUENCES.md - Session Start Flow](../diagrams/SEQUENCES.md#session-start-flow) for sequence diagram.

## Flow Diagram

```
USER (Popup)
  │
  ├─ Click "Start Session" button
  │
  └─[START_SESSION]──────→ SERVICE WORKER
                          │
                          ├─ Validate API keys (Deepgram + LLM provider)
                          ├─ Find active Google Meet tab
                          ├─ Migrate personas (one-time, idempotent)
                          ├─ Load active persona from storage
                          │   └─ Set Gemini system prompt + KB doc filter
                          │
                          ├─ geminiClient.loadProviderConfig()
                          │   └─ Reads provider type, API keys, model,
                          │      cooldown, and prompt tuning mode
                          │
                          ├─ costTracker.startSession(provider, model)
                          │   └─ Locks in per-token pricing for the session
                          │
                          ├─ deepgramClient.connect()
                          │   └─[WebSocket OPEN]──→ Deepgram Nova-3
                          │       └─ Auth via Sec-WebSocket-Protocol
                          │
                          ├─ humeClient.connect() (if Hume API key configured)
                          │   └─[WebSocket OPEN]──→ Hume AI Expression Measurement
                          │       └─ Auth via request body
                          │
                          ├─ transcriptCollector.startSession()
                          │
                          ├─ ensureContentScriptAndInitOverlay()
                          │   └─[INIT_OVERLAY]──→ CONTENT SCRIPT
                          │       └─ new AIOverlay() (Shadow DOM)
                          │
                          ├─ chrome.offscreen.createDocument()
                          ├─ chrome.tabCapture.getMediaStreamId()
                          │
                          ├─[START_DUAL_CAPTURE]──→ OFFSCREEN DOCUMENT
                          │   └─ getUserMedia() → Mic + Tab audio
                          │       └─ AudioWorklet processing
                          │           └─[AUDIO_CHUNK]──→ Deepgram
                          │
                          └─ startCostAlarm()
                              └─ chrome.alarm fires every 1 min

```

## Detailed Steps

### 1. User Clicks Start in Popup
**File**: `popup.ts:150-173`

- Handler: `toggleSession()`
- Sends: `{ type: 'START_SESSION' }`
- Disables button during processing
- Error handling shows in popup UI

### 2. Service Worker Receives START_SESSION
**File**: `service-worker.ts:60-169`

- Listener dispatches to `handleStartSession()`
- Returns `true` to keep channel open for async response

### 3. Validate API Keys
**File**: `service-worker.ts:175-210`

- Reads from `chrome.storage.local`:
  - `deepgramApiKey`
  - `geminiApiKey` (or active provider's key)
  - `humeApiKey` (optional — emotion detection)
  - `speakerFilterEnabled`
- Returns error if required keys missing (Deepgram + LLM provider)
- Hume is optional — emotion detection disabled if key not configured
- Finds active Google Meet tab
- Returns error if no tab found

### 4. Initialize Gemini Client
**File**: `service-worker.ts:239-252`

**Actions:**
1. `geminiClient.startSession()` — resets chat history, cooldown
2. `migrateToPersonas()` — one-time migration (idempotent)
   - Creates "Default" persona from legacy `systemPrompt`
   - Seeds 12 built-in templates
3. `getActivePersona()` — loads active persona
4. `geminiClient.setSystemPrompt(persona.systemPrompt)`
5. `geminiClient.setKBDocumentFilter(persona.kbDocumentIds)`

**Persona Scoping**: All KB searches during session use active persona's documents only.

### 5. Load Provider Configuration
**File**: `gemini-client.ts`

`geminiClient.loadProviderConfig()` reads from `chrome.storage.local`:
- `llmProvider` — `gemini`, `openrouter`, or `groq`
- API keys for the selected provider
- `llmModel` — model selection per provider
- `suggestionCooldownMs` — cooldown between suggestions
- `promptTuningMode` — model tuning profile (adjusts temperature, adds prompt prefixes/suffixes per model family)

Routes subsequent API calls to Gemini REST, OpenRouter, or Groq (OpenAI-compatible format).

### 6. Start Cost Tracker
**File**: `service-worker.ts`

```
costTracker.startSession(provider, model)
```

Locks in per-token pricing for the active provider and model. All token usage during the session accumulates against these rates.

### 7. Connect to Deepgram WebSocket
**File**: `deepgram-client.ts:90-181`

**Critical Convention**: Uses `Sec-WebSocket-Protocol` for auth (browser limitation)

```typescript
new WebSocket(url, ['token', apiKey]);
```

❌ Never use: `wss://api.deepgram.com/v1/listen?token=xxx` (returns 401)

**WebSocket URL Parameters:**
- `model=nova-3`
- `language=en`
- `multichannel=true` + `channels=2` (mic + tab)
- `interim_results=true`
- `endpointing=700` (configurable)
- `encoding=linear16` + `sample_rate=16000`

**Timeout**: 10 seconds for connection
**Reconnect**: Exponential backoff (max 5 attempts)

### 7b. Connect to Hume AI WebSocket (Optional)
**File**: `hume-client.ts`

If `humeApiKey` is configured, the service worker connects to Hume AI for emotion detection:

```typescript
// Connect to Hume Expression Measurement API
humeClient.connect(apiKey);
```

**WebSocket URL**: `wss://api.hume.ai/v0/stream/models`

**Auth**: API key sent in request body (not WebSocket header)

**Audio Format**: PCM wrapped in WAV format, base64 encoded

**Output**: 48 emotions with confidence scores, simplified to 4 states (engaged/frustrated/thinking/neutral)

### 8. Ensure Content Script + Init Overlay
**File**: `service-worker.ts:657-722`

**Strategy** (retries with fallback):
1. Try existing content script → send `INIT_OVERLAY`
2. If fails, inject via `chrome.scripting`
3. Retry after 300ms, 700ms, 1500ms delays
4. Fallback: dynamic import via executeScript
5. Non-fatal — logs warning if all fail

**Overlay Creation** (`content-script.ts:67-79`):
- Creates Shadow DOM (closed)
- Appends to `document.documentElement`
- Injects inline CSS for style isolation

### 9. Create Offscreen Document
**File**: `service-worker.ts:278-294`

```typescript
chrome.offscreen.createDocument({
  url: 'src/offscreen/offscreen.html',
  reasons: [chrome.offscreen.Reason.USER_MEDIA],
  justification: 'Microphone and tab audio capture for transcription'
})
```

### 10. Get Tab Capture Stream ID
**File**: `service-worker.ts:296-312`

```typescript
chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id })
```

Required for capturing Google Meet participant audio.

### 11. Start Dual Audio Capture
**File**: `service-worker.ts:314-357`

Sends `START_DUAL_CAPTURE` message to offscreen document.

**Mic Permission Handling**:
- If `NotAllowedError` → opens `mic-permission.html` popup
- Waits for `MIC_PERMISSION_RESULT` message (30s timeout)
- Retries capture after permission granted

### 12. Start Cost Alarm

**File**: `service-worker.ts`

After the session is marked active, `startCostAlarm()` creates a `chrome.alarms` alarm that fires every 1 minute. Each alarm tick triggers `sendCostUpdate()` to push the current cost snapshot to the content script overlay.

### 13. Return Success
**File**: `service-worker.ts:359-360`

- Response: `{ success: true }`
- Popup updates status after 500ms delay
- Button changes to "Stop Session" with active state

## State Changes

| Storage Key | Action | Value |
|-------------|--------|-------|
| `personas` | Read | Array of persona objects |
| `activePersonaId` | Read | Currently selected persona ID |
| `llmProvider` | Read | `gemini`, `openrouter`, or `groq` |
| `llmModel` | Read | Model selection for active provider |
| `humeApiKey` | Read | Hume AI API key (optional) |
| `suggestionCooldownMs` | Read | Cooldown between suggestions |
| `promptTuningMode` | Read | Model tuning profile |
| In-memory | Set | `isSessionActive = true` |
| In-memory | Set | `activeTabId = tab.id` |
| In-memory | Set | `isCapturing = true` |
| In-memory | Set | `costTracker` session started with pricing |
| In-memory | Set | `humeClient` connected (if API key configured) |
| chrome.alarms | Set | Cost alarm (1-minute interval) |

## Error Handling

| Error | Response | User Impact |
|-------|----------|-------------|
| Missing API key | `{ success: false, error: '...not configured' }` | Popup shows error message |
| No Meet tab | `{ success: false, error: 'No active Google Meet tab' }` | Popup shows error |
| Deepgram connection fails | `{ success: false, error: 'Failed to connect...' }` | Popup shows error |
| Offscreen creation fails | `{ success: false, error: 'Failed to create...' }` | Popup shows error |
| Mic permission denied | Opens permission popup | User must grant permission |
| Content script inject fails | Non-fatal, logs warning | Audio works, overlay may not appear |

## Message Types

| Type | Case | From | To | Purpose |
|------|------|------|-----|---------|
| `START_SESSION` | UPPER | Popup | Service Worker | Trigger session start |
| `INIT_OVERLAY` | UPPER | Service Worker | Content Script | Create overlay UI |
| `START_DUAL_CAPTURE` | UPPER | Service Worker | Offscreen | Start mic + tab capture |
| `MIC_PERMISSION_RESULT` | UPPER | Permission popup | Service Worker | Permission grant result |
| `emotion_update` | lower | Service Worker | Content Script | Emotion state from Hume AI |

## Code References

| Function | File | Lines | Purpose |
|----------|------|-------|---------|
| `toggleSession()` | popup.ts | 150-173 | User clicks Start |
| `handleStartSession()` | service-worker.ts | 175-365 | Main orchestration |
| `migrateToPersonas()` | persona.ts | 113-161 | One-time persona setup |
| `getActivePersona()` | persona.ts | 65-80 | Load active persona |
| `geminiClient.startSession()` | gemini-client.ts | 78-84 | Reset Gemini state |
| `loadProviderConfig()` | gemini-client.ts | — | Load provider, model, cooldown, tuning |
| `costTracker.startSession()` | service-worker.ts | — | Lock in per-token pricing |
| `startCostAlarm()` | service-worker.ts | — | 1-min chrome.alarm for cost updates |
| `deepgramClient.connect()` | deepgram-client.ts | 90-181 | WebSocket connection |
| `humeClient.connect()` | hume-client.ts | — | Hume AI WebSocket connection |
| `ensureContentScriptAndInitOverlay()` | service-worker.ts | 657-722 | Script injection + overlay |
| `new AIOverlay()` | overlay.ts | 95-100+ | Shadow DOM setup |
