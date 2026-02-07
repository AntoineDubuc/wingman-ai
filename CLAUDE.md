# CLAUDE.md

## Communication Style — Product Manager Audience

## MANDATORY — VIOLATING ANY OF THESE IS A FAILURE

1. **DO NOT** enter plan mode. `EnterPlanMode` is **FORBIDDEN**.
2. **DO NOT** export, print, log, or read credentials from code. Read ONLY from `.env`. Write ONLY to `.env`. **DO NOT DELETE `.env`. EVER.**
3. **BE BRIEF.** Start every response with a short summary. No fluff. No preamble.
4. **INVESTIGATE BEFORE CODING.** When a problem is raised, **DO NOT WRITE CODE.** Investigate. Return with:
   - **Root cause** — what broke
   - **Why** — the underlying reason
   - **Proposed fix(es)** — one or more options
5. **DO NOT** touch, edit, create, or delete any file without **explicit user consent**.
6. **DO NOT** commit, push, create PRs, or perform any GitHub action without **explicit user consent**.
7. **PROVE IT WORKS.** Nothing is "done" without evidence — test output, screenshots, or demonstrated behavior from the user's perspective.
8. **ANSWER FIRST.** If the user asks a question, answer it **before** doing anything else.

The user is a **product manager**, not an engineer. Be **concise and to the point** — no walls of text.

1. **Brief non-technical summary** — one or two sentences, plain language, no jargon.
2. **Bullet points** — short, scannable. No paragraphs inside bullets.
3. **Issue → Cause → Fix** — when explaining problems: what broke, why, what you'll do about it.

Rules:

- **Never be verbose.** Cut ruthlessly. If it can be said in fewer words, do it.
- No code in explanations unless explicitly asked.
- No unnecessary preamble ("Let me explain...", "Here's what I found..."). Just say it.
- Focus on outcomes and impact, not implementation details.

---

## Project Overview

Wingman AI — a real-time AI assistant for professionals during Google Meet calls. Captures meeting audio via Chrome's TabCapture API, transcribes via Deepgram, detects emotions via Hume AI, and provides contextual response suggestions using multiple LLM providers (Gemini, OpenRouter, Groq).

Key capabilities:
- **Multi-persona system** with per-persona Knowledge Bases for semantic search over documents
- **Conclave mode** — up to 5 personas collaborating simultaneously with a designated leader
- **Real-time emotion detection** — engaged, frustrated, thinking, neutral states from audio prosody
- **Post-call summaries** with action items, auto-saved to Google Drive
- **Cost tracking** — real-time cost display per session across all providers

**BYOK (Bring Your Own Keys)**: No backend server. Users provide their own API keys (Deepgram, Gemini, OpenRouter, Groq, Hume) directly in the extension settings. All API calls run in the browser.

## GitHub CLI

This repo uses the **AntoineDubuc** GitHub profile. Before any `gh` operations (PRs, issues, etc.):

```bash
gh auth switch --user AntoineDubuc
```

## Common Commands

All commands run from `wingman-ai/extension/`:

```bash
npm install
npm run dev          # Development build with watch
npm run build        # TypeScript check + Vite build (tsc && vite build)
npm run build:prod   # Production build with mode flag
npm run typecheck    # TypeScript --noEmit check only
npm test             # Run Vitest unit tests
npm run test:watch   # Vitest in watch mode
npm run test:coverage # Vitest with V8 coverage
npm run lint         # ESLint (src/**/*.{ts,tsx})
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier (src/**/*.{ts,tsx,css,html})
npm run clean        # Remove dist/
```

### Unit Testing

Vitest with `@webext-core/fake-browser` for Chrome API mocking. Tests live in `wingman-ai/extension/tests/`. Setup file (`tests/setup.ts`) provides in-memory `chrome.storage.local` and mock stubs for `chrome.permissions`, `chrome.runtime`, etc. Use `/run-tests` skill to run tests with investigation on failure. Validation tests in `src/validation/` run inside the extension context via message `{ type: 'RUN_VALIDATION' }`.

Load extension: `chrome://extensions/` → Developer mode → Load unpacked → `wingman-ai/extension/dist`

## Architecture

### Data Flow

```
Content Script (Google Meet tab)
  ├── Mic capture via AudioWorklet → resamples to 16kHz PCM16
  ├── Sends AUDIO_CHUNK messages to Service Worker
  └── Renders overlay UI (Shadow DOM)
        ├── Transcripts + suggestion cards (live)
        ├── Emotion badge in header (engaged/frustrated/thinking/neutral)
        ├── Active persona label in header (multi-persona attribution in Conclave)
        ├── Draggable + resizable floating panel
        └── Summary card with copy/Drive save (post-call)

Service Worker (background)
  ├── Loads active persona(s) on session start
  │     ├── Single persona: sets LLM system prompt + KB scope
  │     └── Conclave mode: loads up to 5 personas, designates leader
  ├── Initializes LLM provider (Gemini / OpenRouter / Groq)
  │     └── Per-provider cooldowns: 15s Gemini, 10s OpenRouter, 5s Groq
  ├── Forwards audio → Deepgram WebSocket (STT)
  ├── Forwards audio → Hume AI WebSocket (emotions) — parallel processing
  │     └── 48 emotions simplified to 4 states (engaged/frustrated/thinking/neutral)
  ├── Receives transcripts → LLM REST API (suggestions)
  │     └── Injects persona-scoped KB context into system prompt
  ├── Cost tracker accumulates Deepgram minutes + LLM tokens per session
  ├── Sends lowercase messages → Content Script
  ├── On session stop → generates call summary via LLM
  │     └── Auto-saves summary + transcript to Google Drive
  ├── LangBuilder integration → external LLM orchestration flows
  └── Manages session lifecycle (singleton)

Popup
  └── Active persona selector (dropdown with colored dot indicator)

Offscreen Document
  └── Tab audio capture via TabCapture API + AudioWorklet

Persona System (chrome.storage.local)
  ├── Multiple personas, each with name, color, system prompt, KB doc IDs
  ├── 12 built-in templates (sales, interview, fundraising, etc.)
  ├── Conclave mode: up to 5 personas active, one leader
  ├── Import/export with attached KB documents
  └── Migration: existing systemPrompt → "Default" persona (one-time)

Knowledge Base (IndexedDB)
  ├── Documents uploaded via persona editor in options page
  ├── Text extracted → chunked → embedded via Gemini Embedding API
  ├── Cosine similarity search scoped to active persona's documents
  └── Cascade-delete when persona is deleted
```

### Key Components

#### Background & Services
- **`src/background/service-worker.ts`**: Session lifecycle, Deepgram/LLM/Hume orchestration, TabCapture, call summary, LangBuilder dispatch
- **`src/services/deepgram-client.ts`**: WebSocket client for Deepgram Nova-3 STT
- **`src/services/hume-client.ts`**: WebSocket client for Hume AI Expression Measurement — emotion detection from audio prosody
- **`src/services/gemini-client.ts`**: REST client for LLM providers (Gemini, OpenRouter, Groq) — suggestions, embeddings, call summaries
- **`src/services/langbuilder-client.ts`**: REST client for external LLM orchestration flows
- **`src/services/cost-tracker.ts`**: Session-scoped cost accumulator — Deepgram minutes, LLM tokens, pricing lookup
- **`src/services/drive-service.ts`**: Google Drive API with cross-browser OAuth. Tries `chrome.identity.getAuthToken()` first, falls back to `launchWebAuthFlow`. Supports native Google Doc, Markdown, plain text, JSON
- **`src/services/transcript-collector.ts`**: Collects transcripts during session, triggers Drive auto-save
- **`src/services/call-summary.ts`**: Prompt builder and markdown formatter for post-call summaries

#### Knowledge Base
- **`src/services/kb/kb-database.ts`**: IndexedDB wrapper for documents and 768-dim embedding vectors
- **`src/services/kb/kb-search.ts`**: Semantic search using cosine similarity, supports document ID filtering for persona scoping
- **`src/services/kb/extractors.ts`**: Text extraction from PDF (`pdfjs-dist`), Markdown (`marked`), and plain text

#### Content Script & Overlay
- **`src/content/content-script.ts`**: Mic capture via AudioWorklet, message bridge, overlay injection
- **`src/content/overlay.ts`**: Shadow DOM (closed) floating panel — transcripts, suggestion cards, emotion badge, summary display
- **`src/content/overlay/draggable.ts`**: Drag-to-move for overlay panel
- **`src/content/overlay/resizable.ts`**: Resize handles for overlay panel
- **`src/content/audio-processor.worklet.js`**: AudioWorklet processor — stereo-to-mono, linear interpolation resampling, Float32→Int16

#### Shared Modules
- **`src/shared/persona.ts`**: Persona data model, active persona helpers, Conclave helpers (`getActivePersonas`, `getConclaveLeader`), migration from legacy storage
- **`src/shared/default-personas.ts`**: 12 built-in persona templates with detailed system prompts
- **`src/shared/llm-config.ts`**: `LLMProvider` type, provider configs, model lists, API base URLs, cooldowns
- **`src/shared/pricing.ts`**: Per-model pricing data, `CostSnapshot`/`CostEstimate` types, free-tier detection
- **`src/shared/model-tuning.ts`**: Per-model-family tuning profiles, tuning modes (`off`/`once`/`auto`)
- **`src/shared/constants.ts`**: Storage keys, message types, `EmotionState` type, Hume/LangBuilder config constants
- **`src/shared/default-prompt.ts`**: Default system prompt fallback

#### Options Page
- **`src/options/options.ts`**: Thin controller composing section modules
- **`src/options/sections/api-keys.ts`**: API key management for all providers
- **`src/options/sections/personas.ts`**: Persona editor with KB management
- **`src/options/sections/conclave.ts`**: Conclave leader picker, preset management
- **`src/options/sections/active-personas.ts`**: Toggle personas on/off (max 5 for Conclave)
- **`src/options/sections/langbuilder.ts`**: LangBuilder URL/API key config, flow selection
- **`src/options/sections/transcription.ts`**: Deepgram settings (endpointing, language)
- **`src/options/sections/call-summary.ts`**: Summary toggle and format settings
- **`src/options/sections/drive.ts`**: Google Drive OAuth and save preferences
- **`src/options/sections/speaker-filter.ts`**: Speaker identification settings
- **`src/options/sections/theme.ts`**: Dark/light theme toggle
- **`src/options/sections/tabs.ts`**: Tab navigation management
- **`src/options/sections/icons.ts`**: Dynamic SVG icon system
- **`src/options/sections/shared.ts`**: `ToastManager`, `ModalManager` shared utilities

#### Other Entry Points
- **`src/popup/popup.ts`**: Session controls and active persona selector dropdown
- **`src/offscreen/offscreen.ts`**: Offscreen document for tab audio capture
- **`src/validation/`**: In-extension validation tests for KB pipeline

#### Tutorials (9 pages + index)
- **`src/tutorials/index.html`**: Tutorial home and navigation
- **`src/tutorials/getting-started.html`**: Initial setup guide
- **`src/tutorials/personas.html`**: Create and manage personas
- **`src/tutorials/kb-upload-search.html`**: Knowledge Base workflow
- **`src/tutorials/summary-settings.html`**: Configure call summaries
- **`src/tutorials/summary-overlay.html`**: Summary display and saving
- **`src/tutorials/hydra.html`**: Multi-persona mode guide
- **`src/tutorials/conclave.html`**: Conclave presets and leader selection
- **`src/tutorials/call-settings.html`**: Transcription and suggestion settings
- **`src/tutorials/engineering-docs.html`**: Deep technical documentation

## Critical Conventions

### Message types must be lowercase

Content script expects **lowercase** message types. The service worker must send `transcript` and `suggestion` — never `TRANSCRIPT` or `SUGGESTION`. Service worker *receives* uppercase types (`START_SESSION`, `STOP_SESSION`, `AUDIO_CHUNK`, etc.).

### Deepgram WebSocket authentication

Browser WebSocket API cannot set custom `Authorization` headers. Deepgram rejects `?token=` query params. The only working approach uses `Sec-WebSocket-Protocol`:

```typescript
new WebSocket(url, ['token', apiKey]);
```

Never use: `wss://api.deepgram.com/v1/listen?token=xxx` (returns 401).

### Hume AI WebSocket authentication

Hume AI uses a different auth pattern — the API key is sent in the request body, not the WebSocket header. Audio must be wrapped in WAV format and base64 encoded before sending. The 48 raw emotions are mapped to 4 simplified states via weighted scoring in `hume-client.ts`.

### Multi-provider LLM support

`gemini-client.ts` supports three providers via `setProviderConfig()`:
- **Gemini** (default) — 15s suggestion cooldown
- **OpenRouter** — 10s cooldown, models include Claude 3.5 Sonnet, GPT-4o, Llama 3.3 70B
- **Groq** — 5s cooldown, models include Mixtral 8x7B, Llama 3.1 70B

Provider selection is stored in `chrome.storage.local`. The LLM decides whether to provide a suggestion or respond with `---` to stay silent.

### Service clients are singletons

`deepgramClient`, `humeClient`, `geminiClient`, `transcriptCollector`, `driveService`, `kbDatabase`, `costTracker`, and `langbuilderClient` are all exported as singleton instances from their respective modules.

### Persona system, KB scoping, and Conclave

Each persona has a `systemPrompt` and `kbDocumentIds` array. On session start, the service worker loads the active persona, sets the LLM system prompt, and scopes KB search to that persona's documents.

**Conclave mode**: Up to 5 personas active simultaneously. One persona is designated as the "conclave leader" (coordinator). Suggestions are attributed to the persona that generated them, shown with color dots in the overlay. Conclave presets can be saved and restored.

The `migrateToPersonas()` function handles one-time migration from the legacy `systemPrompt` storage key and seeds built-in templates. It is idempotent.

### Cost tracking

`cost-tracker.ts` accumulates per-session costs: Deepgram audio minutes, LLM input/output tokens, suggestion count. Pricing data lives in `src/shared/pricing.ts` with per-model rates. Free-tier providers are detected to suppress cost display.

### AudioWorklet files are plain JavaScript

`audio-processor.worklet.js` is plain JS (not TypeScript). It runs in a separate AudioWorklet thread and cannot import modules. Listed as a web-accessible resource in `manifest.json`.

### Shadow DOM isolation

The overlay (`overlay.ts`) uses a **closed** Shadow DOM to isolate styles from Google Meet. All CSS is injected inline into the shadow root. The panel is draggable and resizable via `draggable.ts` and `resizable.ts`.

### Options page is section-based

`options.ts` is a thin controller that composes 13 independent section classes from `src/options/sections/`. Each section manages its own DOM bindings and storage. Shared UI (toasts, modals) is passed via a context object. Sections initialize in parallel via `Promise.all()`. Supports Cmd/Ctrl+S to save persona editor and beforeunload warning for unsaved changes.

### KB context is injected gracefully

When generating suggestions, the Gemini client prepends matching KB context to the system prompt (with source filename attribution). Search is scoped to the active persona's `kbDocumentIds`. KB failures are caught silently — suggestions still work without KB.

### Deepgram endpointing and segment grouping

Default endpointing is 700ms (configurable via transcription settings slider). The client accumulates segments between `is_final=true, speech_final=false` and flushes them as one final transcript when `speech_final=true`. This prevents the overlay from creating multiple bubbles mid-sentence.

### Cross-browser Drive OAuth

The Drive service tries `chrome.identity.getAuthToken()` first (Chrome-native). If unavailable (Vivaldi, other Chromium browsers), it falls back to `launchWebAuthFlow` with cached tokens in `driveOAuthToken` storage key.

### Google Docs rich formatting via HTML conversion

The Drive service creates native Google Docs by uploading HTML with `mimeType: 'application/vnd.google-apps.document'` and `Content-Type: text/html`. The Drive API converts HTML → native Google Doc automatically. All styling must use **inline styles** (not `<style>` blocks). Supported: headings, bold/italic, tables, colored text, lists, links, horizontal rules. Not supported: flexbox, grid, border-radius.

### Call summary truncation strategy

For long conversations, `buildSummaryPrompt()` keeps the first 50 + last 400 transcript entries. This fits within the LLM's context window while preserving conversation framing and recent detail.

### LangBuilder integration

External LLM orchestration via `langbuilder-client.ts`. Configured with URL + API key in the options page. Supports listing flows, running flows with input, diagnosing, and aborting. Message types: `RUN_LANGBUILDER_FLOW`, `CANCEL_LANGBUILDER_FLOW`.

## Build & TypeScript

- **Vite** with `@crxjs/vite-plugin` reads `manifest.json` directly for Chrome Extension bundling
- **`viteStaticCopy`** copies tutorial HTML/assets to `dist/src/tutorials/`
- **Build inputs**: `background`, `content`, `popup`, `offscreen`, `validation`, `tutorials`
- **Path aliases**: `@/` → `src/`, `@shared/` → `src/shared/` (configured in both `vite.config.ts` and `tsconfig.json`)
- **Strict TypeScript**: `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`
- **Target**: ES2022, module resolution `bundler`
- No ESLint or Prettier config files — uses default settings via npm scripts
- **Runtime dependencies**: `idb` (IndexedDB), `marked` (Markdown parsing), `pdfjs-dist` (PDF extraction), `reconnecting-websocket`

## Debugging

1. **Service worker logs**: `chrome://extensions/` → click "Service worker" link
2. **Content script logs**: F12 on the Google Meet page
3. **Popup logs**: Right-click popup → Inspect
4. **Offscreen logs**: `chrome://extensions/` → service worker console

## After Any Code Change

1. Run `npm run build` in `wingman-ai/extension`
2. Reload extension in `chrome://extensions/` (click refresh icon)
3. Refresh the Google Meet tab
