# Implementation Plan: Wingman BYOK (Bring Your Own Keys)

---

## Executive Summary

Wingman is a Chrome extension that provides real-time AI assistance during Google Meet calls. Currently, it requires a backend server to process audio and generate AI suggestions. This implementation converts Wingman to a fully client-side architecture where users bring their own Deepgram and Gemini API keys, eliminating the need for any backend server.

**Key Outcomes:**
- Users can install and use Wingman without running a server
- Zero infrastructure cost for the developer (users pay their own API usage)
- Simpler deployment: just install the extension and add your API keys
- Open-source friendly: anyone can use it with their own keys

---

## Product Manager Review

### Feature Overview

This implementation removes the backend dependency and enables a "Bring Your Own Keys" (BYOK) model where users configure their own Deepgram (speech-to-text) and Gemini (AI) API keys directly in the extension settings.

### Features

#### Feature 1: Direct Deepgram Integration

**What it is:** The extension connects directly to Deepgram's WebSocket API for real-time speech-to-text, without going through a backend server.

**Why it matters:** Eliminates server hosting costs and complexity. Users control their own API usage and billing.

**User perspective:** No change in user experience - transcripts still appear in real-time. The only difference is they need to provide their own Deepgram API key in settings.

---

#### Feature 2: Direct Gemini Integration

**What it is:** The extension calls the Gemini REST API directly for AI-powered suggestions, without a backend intermediary.

**Why it matters:** Removes the backend bottleneck and gives users control over which Gemini model they use and their own rate limits.

**User perspective:** AI suggestions continue to appear during calls. Users need to provide their own Gemini API key in settings.

---

#### Feature 3: Simplified Onboarding

**What it is:** Updated popup and options pages that guide users to configure their API keys before starting a session.

**Why it matters:** Clear user flow prevents confusion and failed sessions due to missing configuration.

**User perspective:** On first use, users are directed to the settings page to enter their API keys. The popup shows configuration status and won't allow starting a session without valid keys.

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
| [x] | 1 | Create DeepgramClient service | 17:45 | 17:53 | 8 | 180 | 22.5x |
| [x] | 2 | Create GeminiClient service | 17:53 | 17:59 | 6 | 120 | 20x |
| [x] | 3 | Update manifest.json permissions | 18:00 | 18:01 | 1 | 15 | 15x |
| [x] | 4 | Refactor service-worker.ts | 18:02 | 18:08 | 6 | 240 | 40x |
| [x] | 5 | Delete websocket-client.ts | 18:09 | 18:09 | 1 | 5 | 5x |
| [x] | 6 | Update popup UI | 18:10 | 18:14 | 4 | 60 | 15x |
| [x] | 7 | Add API key validation | 18:15 | 18:19 | 4 | 45 | 11.3x |
| [ ] | 8 | End-to-end testing | | | | 90 | | *Manual user testing required*
| [x] | 9 | Update README documentation | 18:20 | 18:24 | 4 | 30 | 7.5x |

**Summary:**
- Total tasks: 9
- Completed: 8 (Task 8 requires manual user testing)
- Total time spent: 34 minutes
- Total human estimate (completed): 695 minutes (~11.5 hours)
- Overall multiplier: **20.4x**

---

## Task Descriptions

This section provides context for each task. Read the relevant description before starting implementation.

---

### Task 1: Create DeepgramClient service

**Intent:** Create a new TypeScript service that connects directly to Deepgram's WebSocket API for real-time transcription.

**Context:** This replaces the backend's `transcription.py` functionality. The extension's service worker will use this to send audio and receive transcripts. This is the foundation for the BYOK architecture.

**Expected behavior:**
- Reads API key from `chrome.storage.local`
- Connects to `wss://api.deepgram.com/v1/listen` with proper auth
- Accepts PCM audio chunks and sends to Deepgram
- Parses Deepgram responses and extracts transcript, speaker ID, confidence
- Emits transcript events via callback
- Handles reconnection on disconnect
- Identifies speaker roles (customer vs rep) using same heuristics as backend

**Key components:**
- `wingman-ai/extension/src/services/deepgram-client.ts` (NEW)
- Reference: `wingman-ai/backend/app/services/transcription.py`

**Notes:**
- Browser WebSocket doesn't support custom headers - use token in URL query param
- Deepgram params: `model=nova-3`, `diarize=true`, `interim_results=true`, `sample_rate=16000`, `encoding=linear16`
- Must handle the case where API key is not configured

---

### Task 2: Create GeminiClient service

**Intent:** Create a new TypeScript service that calls Gemini's REST API directly for AI suggestions.

**Context:** This replaces the backend's `agent.py` functionality. It implements the "continuous participant" pattern where the AI decides when to speak vs stay silent.

**Expected behavior:**
- Reads API key from `chrome.storage.local`
- Reads system prompt from storage (or uses default)
- Maintains conversation history (last 20 turns)
- Processes each final transcript through Gemini
- Implements 5-second cooldown between suggestions
- Returns `null` when AI decides to stay silent (`---` response)
- Classifies suggestion type (answer, question, objection, info)

**Key components:**
- `wingman-ai/extension/src/services/gemini-client.ts` (NEW)
- Reference: `wingman-ai/backend/app/services/agent.py`

**Notes:**
- API endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
- Use same system prompt structure as backend
- Truncate conversation history if too long (token limits)

---

### Task 3: Update manifest.json permissions

**Intent:** Add host permissions for Deepgram and Gemini API endpoints.

**Context:** Chrome extensions need explicit permission to make requests to external domains. Without these permissions, the API calls will be blocked.

**Expected behavior:**
- Extension can connect WebSocket to `wss://api.deepgram.com/*`
- Extension can make fetch requests to `https://generativelanguage.googleapis.com/*`

**Key components:**
- `wingman-ai/extension/manifest.json`

**Notes:**
- Add to `host_permissions` array, not `permissions`
- Keep existing permissions (meet.google.com, googleapis.com for Drive)

---

### Task 4: Refactor service-worker.ts

**Intent:** Replace the backend WebSocket client with direct API clients (DeepgramClient and GeminiClient).

**Context:** This is the main orchestration point. Currently it routes messages to/from a backend server. After refactoring, it will orchestrate direct API calls.

**Expected behavior:**
- On START_SESSION:
  - Validate API keys exist in storage
  - Initialize DeepgramClient and GeminiClient
  - Connect to Deepgram
  - Set up transcript callback that processes through Gemini
  - Return error if keys missing or connection fails
- On AUDIO_CHUNK: Forward directly to DeepgramClient
- On STOP_SESSION: Disconnect Deepgram, clear Gemini session
- Transcripts and suggestions sent to content script same as before

**Key components:**
- `wingman-ai/extension/src/background/service-worker.ts`
- Remove import of `websocket-client.ts`
- Add imports of new clients

**Notes:**
- Keep transcript collector integration
- Keep speaker filter logic
- Session state (isSessionActive, activeTabId) stays the same
- Service worker termination: audio streaming keeps it alive

---

### Task 5: Delete websocket-client.ts

**Intent:** Remove the backend WebSocket client that is no longer needed.

**Context:** After Task 4, this file is completely unused. Keeping it would cause confusion.

**Expected behavior:** File is deleted, no import errors in codebase.

**Key components:**
- `wingman-ai/extension/src/background/websocket-client.ts` (DELETE)

**Notes:** Verify no other files import this before deleting.

---

### Task 6: Update popup UI

**Intent:** Remove backend URL configuration and add API key status indicators.

**Context:** Users no longer need to configure a backend URL. Instead, they need to see if their API keys are configured before starting a session.

**Expected behavior:**
- Remove "Backend URL" input field
- Show API key configuration status (configured/not configured)
- Disable "Start Session" button if keys not configured
- Add link to Options page for configuring keys
- Show clear error messages when session start fails due to missing keys

**Key components:**
- `wingman-ai/extension/src/popup/popup.html`
- `wingman-ai/extension/src/popup/popup.ts`
- `wingman-ai/extension/src/popup/popup.css` (if needed)

**Notes:** Keep the existing session start/stop logic, just change what triggers it.

---

### Task 7: Add API key validation

**Intent:** Validate API keys before allowing session start, with helpful error messages.

**Context:** Users need clear feedback when their API keys are missing, invalid, or have issues.

**Expected behavior:**
- On session start, check both keys exist
- If Deepgram connection fails, show "Invalid Deepgram API key" or connection error
- If Gemini call fails, show appropriate error
- Options page: add "Test" button to validate keys (optional, nice-to-have)

**Key components:**
- `wingman-ai/extension/src/background/service-worker.ts`
- `wingman-ai/extension/src/services/deepgram-client.ts`
- `wingman-ai/extension/src/services/gemini-client.ts`

**Notes:** Deepgram validates on WebSocket connect; Gemini validates on first API call.

---

### Task 8: End-to-end testing

**Intent:** Manually test the complete flow to ensure everything works.

**Context:** Integration testing to catch any issues before release.

**Expected behavior:**
- Fresh install: Prompted to configure API keys
- With keys configured: Session starts successfully
- Audio capture works: Transcripts appear in overlay
- AI suggestions work: Suggestions appear for appropriate utterances
- Session stop works: Clean disconnect
- Tab close works: Auto-cleanup

**Key components:**
- All modified files
- Test on actual Google Meet call

**Notes:**
- Test with valid keys
- Test with invalid keys (should show errors)
- Test with missing keys (should block session start)

---

### Task 9: Update README documentation

**Intent:** Update the README to reflect the new BYOK architecture.

**Context:** Users need to know how to set up the extension with their own API keys.

**Expected behavior:**
- Remove backend setup instructions
- Add "Getting Started" section with:
  1. Install extension
  2. Get Deepgram API key (link to console)
  3. Get Gemini API key (link to AI Studio)
  4. Configure keys in extension settings
  5. Start a Google Meet call
- Update architecture diagram
- Add cost estimates for API usage

**Key components:**
- `wingman-ai/README.md`

**Notes:** Keep it simple and user-friendly. Link to API key signup pages.

---

## Appendix

### Technical Decisions

1. **Deepgram WebSocket auth via URL token**: Browser WebSocket API doesn't support custom headers, so we pass the API key as a query parameter (`?token=API_KEY`). Deepgram supports this.

2. **Gemini REST API (not SDK)**: Using direct fetch calls instead of the `@google/generative-ai` npm package to minimize bundle size and dependencies.

3. **Keep system prompt customization**: Users can still customize the AI's behavior through the existing Options page.

4. **No offline support**: This is an online-only feature requiring active API connections.

### Dependencies

- **Deepgram API**: `wss://api.deepgram.com/v1/listen` - Real-time speech-to-text
- **Gemini API**: `https://generativelanguage.googleapis.com/v1beta/` - AI text generation
- **Chrome Extensions API**: `chrome.storage`, `chrome.tabs`, `chrome.runtime`

### Out of Scope

- Backend server maintenance (being removed)
- API key encryption (stored in local storage, same as other extensions)
- Usage tracking/analytics
- Multi-language support (English only for now)
- Alternative STT providers (Deepgram only)
- Alternative LLM providers (Gemini only)
