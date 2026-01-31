# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wingman AI - A real-time AI assistant for sales professionals during Google Meet calls. Captures meeting audio via Chrome's TabCapture API, transcribes via Deepgram, and provides contextual response suggestions using Google Gemini.

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
npm run lint         # ESLint (src/**/*.{ts,tsx})
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier (src/**/*.{ts,tsx,css,html})
npm run clean        # Remove dist/
```

No test framework is configured. Validation tests in `src/validation/` run inside the extension context via message `{ type: 'RUN_VALIDATION' }`.

Load extension: `chrome://extensions/` → Developer mode → Load unpacked → `wingman-ai/extension/dist`

## Architecture

### Data Flow

```
Content Script (Google Meet tab)
  ├── Mic capture via AudioWorklet → resamples to 16kHz PCM16
  ├── Sends AUDIO_CHUNK messages to Service Worker
  └── Renders overlay UI (Shadow DOM)

Service Worker (background)
  ├── Forwards audio → Deepgram WebSocket (STT)
  ├── Receives transcripts → Gemini REST API (suggestions)
  ├── Sends lowercase 'transcript' / 'suggestion' messages → Content Script
  └── Manages session lifecycle (singleton)

Offscreen Document
  └── Tab audio capture via TabCapture API + AudioWorklet
```

### Key Components

- **`src/background/service-worker.ts`**: Session lifecycle, Deepgram/Gemini orchestration, TabCapture management
- **`src/content/content-script.ts`**: Mic capture via AudioWorklet, message bridge, overlay injection
- **`src/content/overlay.ts`**: Shadow DOM (closed) floating panel — transcripts and suggestion cards
- **`src/content/audio-processor.worklet.js`**: AudioWorklet processor — stereo-to-mono, linear interpolation resampling, Float32→Int16
- **`src/offscreen/offscreen.ts`**: Offscreen document for tab audio capture
- **`src/services/deepgram-client.ts`**: WebSocket client for Deepgram Nova-3 STT
- **`src/services/gemini-client.ts`**: REST client for Gemini 2.5 Flash with conversation history
- **`src/services/drive-service.ts`**: Google Drive API via Chrome Identity for transcript saving
- **`src/services/transcript-collector.ts`**: Collects transcripts during session, triggers Drive auto-save
- **`src/options/options.ts`**: Settings page for API keys, preferences, system prompt

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

`deepgramClient`, `geminiClient`, `transcriptCollector`, and `driveService` are all exported as singleton instances from their respective modules.

### Gemini suggestion cooldown

The Gemini client enforces a 15-second cooldown between suggestions to manage API quota. The LLM decides whether to provide a suggestion or respond with `---` to stay silent.

### AudioWorklet files are plain JavaScript

`audio-processor.worklet.js` and `audio-processor.js` are plain JS (not TypeScript). They run in a separate AudioWorklet thread and cannot import modules. They are listed as web-accessible resources in `manifest.json`.

### Shadow DOM isolation

The overlay (`overlay.ts`) uses a **closed** Shadow DOM to isolate styles from Google Meet. All CSS is injected inline into the shadow root.

## Build & TypeScript

- **Vite** with `@crxjs/vite-plugin` reads `manifest.json` directly for Chrome Extension bundling
- **Path aliases**: `@/` → `src/`, `@shared/` → `src/shared/` (configured in both `vite.config.ts` and `tsconfig.json`)
- **Strict TypeScript**: `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`
- **Target**: ES2022, module resolution `bundler`
- No ESLint or Prettier config files — uses default settings via npm scripts

## Debugging

1. **Service worker logs**: `chrome://extensions/` → click "Service worker" link
2. **Content script logs**: F12 on the Google Meet page
3. **Popup logs**: Right-click popup → Inspect
4. **Offscreen logs**: `chrome://extensions/` → service worker console

## After Any Code Change

1. Run `npm run build` in `wingman-ai/extension`
2. Reload extension in `chrome://extensions/` (click refresh icon)
3. Refresh the Google Meet tab
