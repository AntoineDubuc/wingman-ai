# Implementation Plan: Real-Time Sentiment Analysis with Hume AI (Phase 23)

---

## Executive Summary

Add real-time emotion detection to Wingman AI using Hume AI's Expression Measurement API. During live calls, a second WebSocket streams audio to Hume in parallel with Deepgram. Hume returns 48 emotion scores; we simplify these to 4 states (Engaged, Neutral, Frustrated, Thinking) and display a glanceable badge in the overlay header. Users see customer emotion shift in real-time, helping them adjust their approach mid-call.

**Key Outcomes:**
- Real-time customer emotion indicator in overlay header
- ~300ms latency from speech to emotion display
- 4 simplified states derived from 48 Hume emotions
- Optional feature — users provide their own Hume API keys (BYOK model)
- Graceful fallback — calls work normally if Hume keys not configured

**Cost Impact:** ~$0.064/minute of audio analyzed (~$1.92 for a 30-minute call)

---

## Technical Verification Notes

> These findings were verified against the actual codebase on 2026-02-06.

### Audio Pipeline Reality

| Component | Documented Assumption | Verified Reality |
|-----------|----------------------|------------------|
| **Audio data type** | ArrayBuffer | `number[]` → `Int16Array` → `.buffer` (see `deepgram-client.ts:72-79`) |
| **Sample rate** | 16kHz | Correct — AudioWorklet resamples to 16kHz |
| **Channel count** | Stereo (2 channels) | **Mono** — AudioWorklet mixes ch0+ch1 before sending (see `audio-processor.worklet.js:25-28`) |
| **Speaker separation** | ch0=user, ch1=customer | Mixing loses speaker identity — audio is combined mono |

### Hume API Requirements

| Requirement | Value | Source |
|-------------|-------|--------|
| Encoding | Base64 | [WebSocket docs](https://dev.hume.ai/docs/expression-measurement/websocket) |
| Audio format | Linear16 PCM, 16-bit little-endian | [Audio guide](https://dev.hume.ai/docs/speech-to-speech-evi/guides/audio) |
| Recommended sample rate | 44,100 Hz (may accept 16kHz) | Unconfirmed for Expression Measurement |
| Max audio per message | 5,000ms (5 seconds) | Confirmed |
| Recommended chunk size | 100ms for web | Confirmed |
| Token expiry | 30 minutes | Confirmed |

### Critical Design Decisions

1. **Sample Rate**: Test if Expression Measurement accepts 16kHz directly. If not, add upsampling (16kHz → 44.1kHz) in `hume-client.ts`.

2. **Speaker Separation**: Current AudioWorklet mixes both speakers to mono. For customer-only emotion detection, we would need to modify the worklet to preserve channel separation or send both channels. **For Phase 23, we analyze mixed audio (both speakers). Customer-only analysis would require AudioWorklet changes and is out of scope.**

3. **Deepgram Sentiment**: The plan originally included Task 11 for post-call sentiment via Deepgram. **Deepgram sentiment is batch-only (not streaming)** and would require re-processing recorded audio through a separate endpoint. This is deferred to a future phase.

---

## Product Manager Review

### Feature Overview

This phase adds real-time emotion detection as an optional premium feature. The system runs Hume AI's prosody analysis in parallel with existing Deepgram transcription. A small emotion badge in the overlay header shows the customer's current emotional state, updating every few seconds. The feature is entirely opt-in — users who don't configure Hume keys see no change to their experience.

### Features

#### Feature 1: Hume API Keys in Options Page

**What it is:** A new "Hume AI (Emotion Detection)" section in the API Keys tab with inputs for API Key and Secret Key.

**Why it matters:** Follows the existing BYOK pattern. Users control their own costs and can disable the feature by simply not entering keys.

**User perspective:** User goes to Options > API Keys, scrolls to "Hume AI (Emotion Detection)", enters their API key and Secret key from app.hume.ai/keys, clicks Test, and saves. A green checkmark confirms the keys work.

---

#### Feature 2: Real-Time Emotion Badge in Overlay

**What it is:** A small badge in the overlay header showing the customer's current emotional state with an emoji and label: "😊 Engaged", "😐 Neutral", "😤 Frustrated", or "🤔 Thinking".

**Why it matters:** Salespeople can "read the room" even when visual cues are limited. Knowing the customer is frustrated before they say so lets you adjust your approach proactively.

**User perspective:** During a call, the badge appears in the header next to the persona label. It updates every few seconds based on the customer's tone of voice. Color-coding (green/gray/red/blue) provides instant recognition at a glance.

---

#### Feature 3: Emotion-Based Suggestion Context (Phase 3b)

**What it is:** Pass detected emotion to Gemini so suggestions can acknowledge the customer's emotional state.

**Why it matters:** A suggestion like "I hear your frustration..." is more effective when the AI knows the customer actually sounds frustrated.

**User perspective:** Suggestions become more empathetic and contextually aware. When the customer sounds confused, suggestions offer clarification. When they sound excited, suggestions build on that momentum.

---

#### ~~Feature 4: Post-Call Sentiment in Summary~~ — DEFERRED

> Deepgram sentiment is batch-only (not streaming). Would require recording full call audio and re-processing via REST API. Deferred to future phase.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          WITH HUME AI INTEGRATION                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐        ┌──────────────┐                                   │
│  │ Mic Capture  │        │ Tab Capture  │                                   │
│  │ (Content)    │        │ (Offscreen)  │                                   │
│  └──────┬───────┘        └──────┬───────┘                                   │
│         │                       │                                            │
│         └───────────┬───────────┘                                           │
│                     │  AUDIO_CHUNK (number[] → Int16Array)                  │
│                     ▼                                                        │
│         ┌──────────────────────────────────────────┐                        │
│         │            Service Worker                 │                        │
│         │                                           │                        │
│         │   ┌─────────────────┐  ┌──────────────┐  │                        │
│         │   │ deepgramClient  │  │  humeClient  │  │                        │
│         │   │  .sendAudio()   │  │ .sendAudio() │  │  ← NEW                 │
│         │   └────────┬────────┘  └──────┬───────┘  │                        │
│         └────────────┼──────────────────┼──────────┘                        │
│                      │                  │                                    │
│           ┌──────────┘                  └──────────┐                        │
│           ▼                                        ▼                        │
│  ┌──────────────────┐                   ┌──────────────────┐                │
│  │ Deepgram WS      │                   │ Hume AI WS       │  ← NEW         │
│  │ (Transcription)  │                   │ (Emotions)       │                │
│  └────────┬─────────┘                   └────────┬─────────┘                │
│           │                                      │                          │
│           │  type: 'transcript'                  │  type: 'emotion_update'  │
│           └──────────────┬───────────────────────┘                          │
│                          ▼                                                   │
│              ┌──────────────────────┐                                       │
│              │   Content Script     │                                       │
│              │   (Overlay)          │                                       │
│              │                      │                                       │
│              │ ┌──────────────────┐ │                                       │
│              │ │  Emotion Badge   │ │  ← NEW                                │
│              │ │  😤 Frustrated   │ │                                       │
│              │ └──────────────────┘ │                                       │
│              └──────────────────────┘                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Master Checklist

### Instructions for Claude Code

> **CRITICAL: You must follow these rules exactly.**
>
> 1. **Save after every cell write.** Each time you update a cell (start time, end time, estimate, etc.), save the file immediately before proceeding.
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
| [ ] | 1 | Add Hume to storage schema and types | | | | 15 | |
| [ ] | 2 | Create Hume client service | | | | 90 | |
| [ ] | 3 | Add Hume API keys UI to Options page | | | | 45 | |
| [ ] | 4 | Integrate Hume client into service worker | | | | 60 | |
| [ ] | 5 | Add emotion message handler to content script | | | | 20 | |
| [ ] | 6 | Create emotion badge component in overlay | | | | 45 | |
| [ ] | 7 | Add emotion smoothing algorithm | | | | 30 | |
| [ ] | 8 | Add emotion badge CSS (light + dark mode) | | | | 25 | |
| [ ] | 9 | Implement token refresh mechanism | | | | 30 | |
| [ ] | 10 | Add error handling and graceful fallback | | | | 30 | |
| ~~[ ]~~ | ~~11~~ | ~~Post-call sentiment (Deepgram)~~ | — | — | — | ~~45~~ | **DEFERRED** |
| [ ] | 11 | Build, test, and verify TypeScript compiles | | | | 30 | |

**Summary:**
- Total tasks: 11 (Task 11 deferred — Deepgram sentiment is batch-only)
- Completed: 0
- Total time spent: 0 minutes
- Total human estimate: 420 minutes (~7 hours)
- Overall multiplier: —

---

## Task Descriptions

### Task 1: Add Hume to Storage Schema and Types

**Intent:** Define the storage keys and TypeScript types for Hume API configuration.

**Context:** Following the existing pattern for Deepgram and Gemini keys, we need storage keys for the Hume API key and Secret key. The feature should be optional — missing keys means emotion detection is disabled.

**Expected behavior:**
- Add `humeApiKey?: string` and `humeSecretKey?: string` to storage types
- Add to `PROVIDER_STORAGE_KEYS` array if applicable
- Add `emotionDetectionEnabled?: boolean` setting (default: true when keys present)

**Key components:**
- `src/shared/storage-types.ts` (or wherever API key types are defined)
- `src/shared/constants.ts` (if storage keys are listed there)

**Notes:** Keep it simple — just two keys. No model selection needed (we use prosody + burst models which are implicit).

---

### Task 2: Create Hume Client Service

**Intent:** Create a new service that manages the WebSocket connection to Hume AI's Expression Measurement API.

**Context:** Similar to `deepgram-client.ts`, this service manages a WebSocket connection, sends audio, and emits emotion events. Unlike Deepgram, Hume requires:
- OAuth token flow (API key + Secret → access token)
- Base64-encoded audio (not raw `Int16Array.buffer`)
- Different message format

**Expected behavior:**
- `HumeClient` class with singleton export
- `connect(apiKey, secretKey)` — get token, open WebSocket
- `sendAudio(pcmData: number[])` — convert to Int16Array, base64 encode, buffer, and send
- `onEmotion(callback)` — register emotion event handler
- `disconnect()` — clean close
- Automatic reconnection with exponential backoff
- Token refresh before 30-minute expiry

**Audio handling (verified against codebase):**
```typescript
// Input: number[] (same format Deepgram receives)
// Convert to Int16Array (matches existing pipeline)
const int16 = new Int16Array(pcmData);
// Convert to base64 (Hume requirement)
const base64 = arrayBufferToBase64(int16.buffer);
// Buffer ~100ms worth before sending (Hume recommendation)
```

**Key components:**
- `src/services/hume-client.ts` — **NEW FILE**

**Notes:** See `RESOURCES-AND-EXAMPLES.md` for code patterns. The WebSocket endpoint is `wss://api.hume.ai/v0/stream/models`. Use `access_token` query param for auth (not apiKey directly — that exposes the key). Test with 16kHz sample rate first; add upsampling only if Hume rejects it.

---

### Task 3: Add Hume API Keys UI to Options Page

**Intent:** Add a new section to the API Keys tab for configuring Hume credentials.

**Context:** Follow the same pattern as Deepgram/Gemini: input fields, test button, success/error feedback. Place it after the existing API key sections but mark it as "Optional" since emotion detection is a premium feature.

**Expected behavior:**
- New collapsible section: "Hume AI (Emotion Detection)" with "Optional" badge
- Two password inputs: API Key and Secret Key
- "Test Connection" button that:
  1. Attempts to get an access token from Hume
  2. Shows green checkmark on success
  3. Shows error message on failure
- Link to "Get Hume API keys →" pointing to app.hume.ai/keys
- Brief description: "Enable real-time emotion detection during calls"

**Key components:**
- `src/options/options.html` — add HTML structure
- `src/options/sections/api-keys.ts` — add Hume key handling logic
- `src/options/options.css` — any needed styles (likely minimal)

**Notes:** The test should only verify token generation works, not open a full WebSocket. Use the OAuth endpoint directly.

---

### Task 4: Integrate Hume Client into Service Worker

**Intent:** Connect the Hume client to the audio pipeline so it receives the same audio chunks as Deepgram.

**Context:** In `service-worker.ts`, the `AUDIO_CHUNK` handler currently sends `message.data` (a `number[]`) to Deepgram. We need to also send to Hume when emotion detection is enabled. The Hume client handles base64 conversion internally.

**Expected behavior:**
- On `START_SESSION`:
  1. Check if Hume keys are configured in storage
  2. If yes, call `humeClient.connect(apiKey, secretKey)`
  3. Register emotion callback that forwards to content script
- On `AUDIO_CHUNK`:
  1. Send `message.data` to Deepgram (existing — unchanged)
  2. Send same `message.data` to Hume (if connected) — Hume client converts to base64
- On `STOP_SESSION`:
  1. Call `humeClient.disconnect()`
- New message type `emotion_update` sent to content script (lowercase per CLAUDE.md)

**Implementation pattern (from service-worker.ts:212-216):**
```typescript
case 'AUDIO_CHUNK':
  if (isSessionActive) {
    deepgramClient.sendAudio(message.data);  // existing
    humeClient.sendAudio(message.data);      // new — no-op if not connected
  }
  return false;
```

**Key components:**
- `src/background/service-worker.ts`

**Notes:**
- `humeClient.sendAudio()` should be a no-op when not connected (safe to call unconditionally)
- Audio is mixed mono (both speakers) — customer-only would require AudioWorklet changes (out of scope)
- Hume client handles buffering internally; service worker just forwards every chunk

---

### Task 5: Add Emotion Message Handler to Content Script

**Intent:** Handle the new `emotion_update` message type in the content script and forward to overlay.

**Context:** The content script bridges service worker messages to the overlay. It already handles `transcript` and `suggestion` messages.

**Expected behavior:**
- Add case for `type: 'emotion_update'` in message listener
- Call `overlay.updateEmotion(data.emotions)` when received
- Gracefully handle messages when overlay doesn't exist yet

**Key components:**
- `src/content/content-script.ts`

**Notes:** Simple passthrough — the overlay does the real work of displaying emotions.

---

### Task 6: Create Emotion Badge Component in Overlay

**Intent:** Add a visual emotion indicator to the overlay header.

**Context:** The overlay header currently shows: status dot, title, persona dots, persona label, cost ticker, and control buttons. The emotion badge should fit naturally in this layout.

**Expected behavior:**
- New element in header between persona label and cost ticker
- Shows emoji + label: "😊 Engaged", "😐 Neutral", "😤 Frustrated", "🤔 Thinking"
- Color-coded background (green/gray/red/blue)
- `updateEmotion(emotions)` method that:
  1. Receives raw Hume emotions array
  2. Passes through smoother (Task 7)
  3. Categorizes to one of 4 states
  4. Updates badge display
- Hidden when emotion detection not active

**Key components:**
- `src/content/overlay.ts`

**Notes:** See `LIVE-INTEGRATION-SPEC.md` for the categorization logic mapping 48 emotions → 4 states.

---

### Task 7: Add Emotion Smoothing Algorithm

**Intent:** Smooth rapid emotion changes to prevent jittery UI updates.

**Context:** Hume sends emotion data every few hundred milliseconds. Raw updates would cause the badge to flicker constantly. A rolling window averages the last 3 seconds of readings.

**Expected behavior:**
- `EmotionSmoother` class that:
  - Accepts new emotion readings via `addReading(emotions)`
  - Returns smoothed dominant emotion via `getDominant()`
  - Uses 3-second rolling window
  - Only returns emotions with score > 0.25
- Integrate with overlay's `updateEmotion()` method

**Key components:**
- `src/content/overlay.ts` (or separate `src/content/emotion-smoother.ts`)

**Notes:** Keep it simple — just averaging. No need for fancy signal processing.

---

### Task 8: Add Emotion Badge CSS (Light + Dark Mode)

**Intent:** Style the emotion badge to match the overlay design in both themes.

**Context:** The overlay uses inline styles in Shadow DOM. Need to add badge styles that work in light and dark mode.

**Expected behavior:**
- `.emotion-badge` base styles (flex, padding, border-radius, font)
- `.emotion-badge[data-state="positive"]` — green tint
- `.emotion-badge[data-state="negative"]` — red/orange tint
- `.emotion-badge[data-state="thinking"]` — blue tint
- `.emotion-badge[data-state="neutral"]` — gray tint
- Dark mode variants with `.dark` parent
- Subtle pulse animation when state changes

**Key components:**
- `src/content/overlay.ts` (inline styles in `loadStyles()`)

**Notes:** See `LIVE-INTEGRATION-SPEC.md` for complete CSS. Colors should be semi-transparent to not overwhelm.

---

### Task 9: Implement Token Refresh Mechanism

**Intent:** Automatically refresh Hume access tokens before they expire.

**Context:** Hume access tokens expire after 30 minutes. A 1-hour call needs at least one token refresh mid-session.

**Expected behavior:**
- Track token expiry time (30 min from issuance)
- Check before each `sendAudio()` call
- If within 5 minutes of expiry, refresh proactively
- Refresh happens in background — no interruption to emotion streaming
- Handle refresh failures gracefully (log, continue with existing token until it actually fails)

**Key components:**
- `src/services/hume-client.ts`

**Notes:** The OAuth endpoint is `POST https://api.hume.ai/oauth2-cc/token` with Basic auth (apiKey:secretKey base64 encoded).

---

### Task 10: Add Error Handling and Graceful Fallback

**Intent:** Ensure Hume failures don't break the core Wingman experience.

**Context:** Hume is an optional enhancement. If it fails (bad keys, network issues, rate limits), transcription and suggestions must continue working.

**Expected behavior:**
- Invalid/missing keys → emotion badge hidden, no errors shown
- Connection failure → log warning, hide badge, continue session
- Mid-session disconnect → attempt reconnect 3 times, then give up silently
- Rate limit (E0300/E0301) → show toast "Emotion detection paused (credits exhausted)", hide badge
- All Hume errors caught and logged, never thrown to break session

**Key components:**
- `src/services/hume-client.ts`
- `src/background/service-worker.ts`

**Notes:** Use console.warn for recoverable issues, console.error only for unexpected failures.

---

### ~~Task 11: Add Post-Call Sentiment to Summary (Deepgram)~~ — DEFERRED

> **Removed from Phase 23 scope.** Deepgram sentiment analysis is only available for batch/pre-recorded audio via their REST API, not streaming. Implementing this would require:
> 1. Recording the full call audio (not currently done)
> 2. Uploading to Deepgram's batch endpoint after call ends
> 3. Additional storage and processing costs
>
> This feature is deferred to a future phase. For Phase 23, we focus on **real-time** emotion detection via Hume only.

---

### Task 11: Build, Test, and Verify TypeScript Compiles

**Intent:** Ensure everything compiles and works end-to-end.

**Context:** Final integration testing before the feature is ready.

**Expected behavior:**
- `npm run build` succeeds with no TypeScript errors
- `npm run typecheck` passes
- Manual testing checklist:
  - [ ] Options page shows Hume section with "Optional" badge
  - [ ] Test button works with valid keys (green checkmark)
  - [ ] Test button shows error with invalid keys
  - [ ] Session starts without Hume keys (badge hidden, no errors)
  - [ ] Session starts with Hume keys (badge visible after first speech)
  - [ ] Badge updates during conversation (~3 second latency)
  - [ ] Badge shows appropriate states for different tones
  - [ ] Session continues working if Hume disconnects mid-call
  - [ ] No console errors during normal operation

**Key components:**
- All modified files

**Notes:** Test with and without Hume keys configured to verify graceful fallback.

---

## File Changes Summary

| File | Changes |
|------|---------|
| `src/services/hume-client.ts` | **NEW** — WebSocket client for Hume API |
| `src/background/service-worker.ts` | Add Hume initialization, audio routing, emotion forwarding |
| `src/content/content-script.ts` | Add `emotion_update` message handler |
| `src/content/overlay.ts` | Add emotion badge component, smoother, styles |
| `src/options/options.html` | Add Hume API keys section |
| `src/options/sections/api-keys.ts` | Add Hume key handling and test logic |
| `src/shared/storage-types.ts` | Add Hume key types |

---

## Migration

No migration needed. Hume keys are optional — existing users see no change. The emotion badge only appears when Hume keys are configured.

---

## Out of Scope

- **Customer-only emotion detection** — requires AudioWorklet changes to preserve channel separation (currently sends mixed mono)
- **Post-call sentiment via Deepgram** — batch-only, requires recording full call audio
- Emotion history visualization (beyond current state)
- Per-transcript emotion annotations
- Emotion-based suggestion filtering
- Multi-language emotion detection (English primary)
- Facial expression analysis (audio only)
- Custom emotion thresholds configuration
- Exporting emotion data
- Upsampling to 44.1kHz (test 16kHz first; add only if Hume rejects it)

---

## Success Criteria

1. Users can configure Hume API keys in Options page
2. Emotion badge appears in overlay when keys are configured
3. Badge updates in real-time during conversation (~3 second latency)
4. Badge shows appropriate state for emotional tone (tested manually)
5. Session works normally without Hume keys (graceful fallback)
6. No console errors during normal operation
7. TypeScript compiles with no errors

---

## Dependencies

- Hume AI account (free tier available at hume.ai)
- API Key + Secret Key from app.hume.ai/keys
- No new npm packages required (raw WebSocket + fetch)

---

## References

- [Research Document](./RESEARCH.md)
- [Technical Specs](./hume-ai/TECHNICAL-SPECS.md)
- [Live Integration Spec](./hume-ai/LIVE-INTEGRATION-SPEC.md)
- [Resources & Examples](./hume-ai/RESOURCES-AND-EXAMPLES.md)
- [Pricing Reference](./hume-ai/PRICING-REFERENCE.md)
- [Hume WebSocket Docs](https://dev.hume.ai/docs/expression-measurement/websocket)
- [Hume TypeScript SDK](https://github.com/HumeAI/hume-typescript-sdk)
