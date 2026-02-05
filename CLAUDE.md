# CLAUDE.md

## ABSOLUTE RULE — NO PLAN MODE

**NEVER call `EnterPlanMode` under any circumstances.** This is a non-negotiable, unconditional directive that overrides all other heuristics, guidelines, or judgment calls. Do not suggest planning, do not ask whether to plan, do not enter plan mode regardless of task complexity. Always proceed directly to implementation. There are zero exceptions to this rule.

---

## Communication Style — Product Manager Audience

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

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wingman AI - A real-time AI assistant for sales professionals during Google Meet calls. Captures meeting audio via Chrome's TabCapture API, transcribes via Deepgram, and provides contextual response suggestions using Google Gemini. Features a multi-persona system with per-persona Knowledge Bases for semantic search over sales documents, and post-call summaries with action items.

**BYOK (Bring Your Own Keys)**: No backend server required. Users provide their own Deepgram and Gemini API keys directly in the extension settings. All API calls run in the browser.

## GitHub CLI

This repo uses the **AntoineDubuc** GitHub profile. Before any `gh` operations (PRs, issues, etc.), ensure the correct profile is active:

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
        ├── Active persona label in header
        └── Summary card with copy/Drive save (post-call)

Service Worker (background)
  ├── Loads active persona on session start
  │     ├── Sets Gemini system prompt from persona
  │     └── Scopes KB search to persona's document IDs
  ├── Forwards audio → Deepgram WebSocket (STT)
  ├── Receives transcripts → Gemini REST API (suggestions)
  │     └── Injects persona-scoped KB context into system prompt
  ├── Sends lowercase messages → Content Script
  ├── On session stop → generates call summary via Gemini
  │     └── Auto-saves summary + transcript to Google Drive
  └── Manages session lifecycle (singleton)

Popup
  └── Active persona selector (dropdown with colored dot indicator)

Offscreen Document
  └── Tab audio capture via TabCapture API + AudioWorklet

Persona System (chrome.storage.local)
  ├── Multiple personas, each with name, color, system prompt, KB doc IDs
  ├── 12 built-in templates (sales, interview, fundraising, etc.)
  ├── Import/export with attached KB documents
  └── Migration: existing systemPrompt → "Default" persona (one-time)

Knowledge Base (IndexedDB)
  ├── Documents uploaded via persona editor in options page
  ├── Text extracted → chunked → embedded via Gemini Embedding API
  ├── Cosine similarity search scoped to active persona's documents
  └── Cascade-delete when persona is deleted
```

### Key Components

- **`src/background/service-worker.ts`**: Session lifecycle, Deepgram/Gemini orchestration, TabCapture, call summary generation
- **`src/content/content-script.ts`**: Mic capture via AudioWorklet, message bridge, overlay injection
- **`src/content/overlay.ts`**: Shadow DOM (closed) floating panel — transcripts, suggestion cards, and summary display
- **`src/content/audio-processor.worklet.js`**: AudioWorklet processor — stereo-to-mono, linear interpolation resampling, Float32→Int16
- **`src/offscreen/offscreen.ts`**: Offscreen document for tab audio capture
- **`src/services/deepgram-client.ts`**: WebSocket client for Deepgram Nova-3 STT
- **`src/services/gemini-client.ts`**: REST client for Gemini 2.5 Flash — suggestions, embeddings, and call summaries
- **`src/services/drive-service.ts`**: Google Drive API with cross-browser OAuth support. Tries `chrome.identity.getAuthToken()` first, falls back to `launchWebAuthFlow` for Vivaldi/other Chromium browsers. Supports four formats: native Google Doc (default), Markdown, plain text, and JSON
- **`src/services/transcript-collector.ts`**: Collects transcripts during session, triggers Drive auto-save
- **`src/services/call-summary.ts`**: Prompt builder and markdown formatter for post-call summaries
- **`src/services/kb/kb-database.ts`**: IndexedDB wrapper for documents and 768-dim embedding vectors
- **`src/services/kb/kb-search.ts`**: Semantic search using cosine similarity over Gemini embeddings, supports document ID filtering for persona scoping
- **`src/services/kb/extractors.ts`**: Text extraction from PDF (`pdfjs-dist`), Markdown (`marked`), and plain text
- **`src/shared/persona.ts`**: Persona data model, active persona helpers, migration from legacy `systemPrompt` storage
- **`src/shared/default-personas.ts`**: 12 built-in persona templates with detailed system prompts
- **`src/popup/popup.ts`**: Session controls and active persona selector dropdown
- **`src/options/options.ts`**: Thin controller composing section modules (see below)
- **`src/options/sections/`**: Modular options sections — `api-keys`, `drive`, `personas` (includes KB management), `transcription`, `call-summary`, `theme`, `speaker-filter`, plus `shared` utilities (`ToastManager`, `ModalManager`)
- **`src/tutorials/`**: Interactive HTML tutorials for KB and call summary features
- **`src/validation/`**: In-extension validation tests for KB pipeline (embeddings, extraction, IndexedDB, cosine search, e2e)

## Critical Conventions

### Message types must be lowercase

Content script expects **lowercase** message types. The service worker must send `transcript` and `suggestion` — never `TRANSCRIPT` or `SUGGESTION`. Service worker *receives* uppercase types (`START_SESSION`, `STOP_SESSION`, `AUDIO_CHUNK`, etc.).

### Deepgram WebSocket authentication

Browser WebSocket API cannot set custom `Authorization` headers. Deepgram rejects `?token=` query params. The only working approach uses `Sec-WebSocket-Protocol`:

```typescript
new WebSocket(url, ['token', apiKey]);
```

Never use: `wss://api.deepgram.com/v1/listen?token=xxx` (returns 401).

### Service clients are singletons

`deepgramClient`, `geminiClient`, `transcriptCollector`, `driveService`, and `kbDatabase` are all exported as singleton instances from their respective modules.

### Persona system and KB scoping

Each persona has a `systemPrompt` and `kbDocumentIds` array. On session start, the service worker loads the active persona, sets the Gemini system prompt, and scopes KB search to that persona's documents. The `migrateToPersonas()` function handles one-time migration from the legacy `systemPrompt` storage key and seeds built-in templates. It is idempotent.

### Gemini suggestion cooldown

The Gemini client enforces a 15-second cooldown between suggestions to manage API quota. The LLM decides whether to provide a suggestion or respond with `---` to stay silent.

### AudioWorklet files are plain JavaScript

`audio-processor.worklet.js` and `audio-processor.js` are plain JS (not TypeScript). They run in a separate AudioWorklet thread and cannot import modules. They are listed as web-accessible resources in `manifest.json`.

### Shadow DOM isolation

The overlay (`overlay.ts`) uses a **closed** Shadow DOM to isolate styles from Google Meet. All CSS is injected inline into the shadow root.

### Options page is section-based

`options.ts` is a thin controller that composes independent section classes from `src/options/sections/`. Each section manages its own DOM bindings and storage. Shared UI (toasts, modals) is passed via a context object. Sections initialize in parallel via `Promise.all()`. Supports Cmd/Ctrl+S to save persona editor and beforeunload warning for unsaved changes.

### KB context is injected gracefully

When generating suggestions, the Gemini client dynamically imports KB search and prepends matching context to the system prompt (with source filename attribution). Search is scoped to the active persona's `kbDocumentIds`. KB failures are caught silently — suggestions still work without KB.

### Deepgram endpointing and segment grouping

Default endpointing is 700ms (configurable via transcription settings slider). The client accumulates segments between `is_final=true, speech_final=false` and flushes them as one final transcript when `speech_final=true`. This prevents the overlay from creating multiple bubbles mid-sentence.

### Cross-browser Drive OAuth

The Drive service tries `chrome.identity.getAuthToken()` first (Chrome-native). If unavailable (Vivaldi, other Chromium browsers), it falls back to `launchWebAuthFlow` with cached tokens in `driveOAuthToken` storage key.

### Google Docs rich formatting via HTML conversion

The Drive service creates native Google Docs by uploading HTML with `mimeType: 'application/vnd.google-apps.document'` in the file metadata and `Content-Type: text/html` for the body. The Drive API converts HTML → native Google Doc automatically. No additional OAuth scopes needed beyond `drive.file`. All styling must use **inline styles** (not `<style>` blocks) — the conversion strips CSS classes and external styles. Supported: headings, bold/italic, tables with cell backgrounds, colored text, lists, links, horizontal rules. Not supported: flexbox, grid, border-radius, page breaks. Google Docs use `https://docs.google.com/document/d/{id}/edit` URLs (not `drive.google.com/file/d/`).

### Call summary truncation strategy

For long conversations, `buildSummaryPrompt()` keeps the first 50 + last 400 transcript entries. This fits within Gemini's context window while preserving conversation framing and recent detail.

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
