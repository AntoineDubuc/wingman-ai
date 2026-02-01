# Implementation Plan: Stereo Multichannel Audio Capture

---

## Executive Summary

Wingman AI currently captures only the user's microphone audio, meaning transcripts miss what other meeting participants say. This feature adds full two-way audio capture by combining microphone audio (user) and tab audio (other participants) into a single stereo stream sent to Deepgram's multichannel API. The result is a complete transcript of both sides of the conversation with deterministic speaker attribution — no AI guessing, no doubled API costs, one Deepgram connection.

**Key Outcomes:**
- Transcripts capture both sides of the conversation (user + other participants)
- Speaker attribution is deterministic via channel index (channel 0 = You, channel 1 = Participant) — replaces unreliable question-pattern heuristics
- Single Deepgram WebSocket connection — no API key duplication or dual subscriptions
- `is_self` field correctly populated, improving call summary "you" vs "them" attribution
- Content script becomes UI-only — all audio processing moves to the offscreen document

---

## Product Manager Review

### Feature Overview

This implementation moves audio capture from the content script to Chrome's offscreen document, combining microphone and tab audio into stereo PCM that Deepgram transcribes per-channel. The user sees no UI changes — they still click Start/Stop — but transcripts now include everything said by all participants.

### Features

#### Feature 1: Full Two-Way Audio Capture

**What it is:** Capture both the user's microphone and the meeting's tab audio simultaneously, producing a complete transcript of the entire conversation.

**Why it matters:** A transcript that only contains what one person said is incomplete and far less useful for post-call review, summary generation, and CRM notes. Sales reps need to recall what the customer said, not just themselves.

**User perspective:** Transparent. The user starts a session the same way. Chrome may prompt for microphone permission (from the offscreen document instead of the content script). Transcripts now show both sides labeled "You" and "Participant" instead of "Speaker 0" and "Speaker 1" with sometimes-wrong role guesses.

---

#### Feature 2: Deterministic Speaker Labels via Channel Index

**What it is:** Replace the current AI-based speaker role heuristics (question-pattern counting) with channel-based identification. Channel 0 (mic) = user = "You", Channel 1 (tab) = other participants = "Participant".

**Why it matters:** The current heuristic requires 3+ questions before it assigns roles and frequently gets it wrong (e.g., if the customer gives a presentation). Channel-based identification is instant and 100% accurate from the first word.

**User perspective:** Speaker labels appear immediately and correctly from the very first transcript. "You" always refers to the user. No more waiting for the system to "figure out" who's who.

---

#### Feature 3: Correct `is_self` Attribution

**What it is:** The `is_self` field in transcript data (currently hardcoded to `false`) is now correctly set based on channel index. Channel 0 transcripts get `is_self: true`.

**Why it matters:** Call summaries use `is_self` to determine "you" vs "them" for action item attribution. Currently all speakers are treated as "them". With correct `is_self`, summaries accurately attribute "You: Send the proposal" vs "Them: Loop in CTO".

**User perspective:** Call summaries and Drive transcripts correctly label who committed to what.

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
| [ ] | 1 | Rewrite offscreen AudioWorklet for stereo interleaving | | | | 60 | |
| [ ] | 2 | Add dual-capture function to offscreen document | | | | 45 | |
| [ ] | 3 | Orchestrate offscreen + tab capture in service worker | | | | 45 | |
| [ ] | 4 | Update Deepgram client for multichannel | | | | 30 | |
| [ ] | 5 | Strip audio code from content script | | | | 20 | |
| [ ] | 6 | Update manifest.json for offscreen worklet | | | | 5 | |
| [ ] | 7 | Build and validate end-to-end | | | | 15 | |

**Summary:**
- Total tasks: 7
- Completed: 0
- Total time spent: 0 minutes
- Total human estimate: 220 minutes
- Overall multiplier: --

---

## Task Descriptions

This section provides context for each task. Read the relevant description before starting implementation.

---

### Task 1: Rewrite offscreen AudioWorklet for stereo interleaving

**Intent:** Rewrite `src/offscreen/audio-processor.js` to accept 2-channel input, resample each channel independently, and output interleaved stereo Int16 PCM suitable for Deepgram's `multichannel=true&channels=2` mode.

**Context:** The current offscreen worklet is a simple mono processor with no resampling. The content script's worklet (`audio-processor.worklet.js`) has proven resampling logic (linear interpolation, 48kHz→16kHz) that should be ported here. This task is the foundation — Tasks 2-4 depend on it producing correctly formatted stereo audio.

**Expected behavior:**

The rewritten `AudioProcessor` worklet class:

1. **Constructor** — accepts `processorOptions.sampleRate` (device's native rate, e.g., 48000). Computes `ratio = sourceSampleRate / 16000`. Initializes two separate Float32 buffers (`bufferCh0`, `bufferCh1`) and indices.

2. **`process(inputs)`** — receives 2-channel input from the ChannelMergerNode:
   - `inputs[0][0]` = channel 0 (mic) Float32 samples
   - `inputs[0][1]` = channel 1 (tab) Float32 samples
   - If either channel is missing, fill with silence (zeros)
   - Append each channel's samples to its respective buffer

3. **Buffer flush** — when both buffers reach `bufferSize` (4096 samples at source rate):
   - Resample each channel independently from source rate to 16kHz using linear interpolation (port the `resample()` function from `audio-processor.worklet.js`)
   - Interleave the two resampled channels: `[ch0_s0, ch1_s0, ch0_s1, ch1_s1, ...]`
   - Convert interleaved Float32 to Int16 PCM
   - Post the interleaved Int16Array to the main thread via `port.postMessage({ type: 'audio', audioData: Array.from(interleavedPcm) })`

4. **Buffer alignment** — both channels always flush together. If one channel has more samples than the other (shouldn't happen since they share the same AudioContext), wait for both to be full.

**Key components:**
- `src/offscreen/audio-processor.js` — full rewrite

**Notes:** The output is interleaved stereo where each "frame" is 4 bytes (2 bytes ch0 + 2 bytes ch1). Deepgram requires buffer sizes to be multiples of `channels * bytesPerSample = 4`. With 4096 source samples → ~1365 resampled samples per channel → 2730 interleaved samples → 5460 bytes (divisible by 4). The resampling logic is identical to the content worklet — linear interpolation is sufficient for speech audio.

---

### Task 2: Add dual-capture function to offscreen document

**Intent:** Add a new `startDualCapture(streamId)` function to `src/offscreen/offscreen.ts` that simultaneously captures microphone and tab audio, merges them into stereo via a ChannelMergerNode, and routes through the stereo AudioWorklet from Task 1.

**Context:** The offscreen document already has `startMicrophoneCapture()` and `startTabCapture()` functions. The new function combines both into one audio graph. Depends on Task 1 (the worklet must handle stereo).

**Expected behavior:**

`startDualCapture(streamId: string)`:

1. **Get mic stream** — `navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 } })`. Don't constrain sample rate — use device native.

2. **Get tab stream** — `navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } })`.

3. **Create AudioContext** — at mic's native sample rate: `new AudioContext({ sampleRate: micTrack.getSettings().sampleRate || 48000 })`.

4. **Build audio graph:**
   ```
   micSource = audioContext.createMediaStreamSource(micStream)
   tabSource = audioContext.createMediaStreamSource(tabStream)
   merger = audioContext.createChannelMerger(2)

   micSource.connect(merger, 0, 0)   // mic → merger input 0
   tabSource.connect(merger, 0, 1)   // tab → merger input 1

   worklet = new AudioWorkletNode(audioContext, 'audio-processor', {
     channelCount: 2,
     channelCountMode: 'explicit',
     processorOptions: { sampleRate: audioContext.sampleRate }
   })

   merger.connect(worklet)
   ```

5. **Handle worklet messages** — same as existing: forward `audioData` to service worker via `AUDIO_CHUNK` message.

6. **Store both streams** for cleanup — update `cleanup()` to stop tracks from both streams.

**Message handler** — add `case 'START_DUAL_CAPTURE':` that calls `startDualCapture(message.streamId)`.

**Key components:**
- `src/offscreen/offscreen.ts` — add `startDualCapture()`, add message handler, update cleanup

**Notes:** Keep `startMicrophoneCapture()` and `startTabCapture()` intact as fallbacks. Store both `micStream` and `tabStream` in module-level variables (rename `mediaStream` or add a second variable). The `cleanup()` function must stop tracks on both streams. Pass `processorOptions: { sampleRate }` to the worklet so it knows the resampling ratio.

---

### Task 3: Orchestrate offscreen + tab capture in service worker

**Intent:** Rewrite the session start/stop flow in `service-worker.ts` to create the offscreen document, obtain a tab capture stream ID, and send `START_DUAL_CAPTURE` to the offscreen document — replacing the current approach of sending `START_MIC_CAPTURE` to the content script.

**Context:** Depends on Task 2. The service worker currently sends `START_MIC_CAPTURE` to the content script (lines 217-228). This must change to: create offscreen document → get `tabCapture.getMediaStreamId()` → send `START_DUAL_CAPTURE` to offscreen. The content script stops handling audio entirely (Task 5).

**Expected behavior:**

**In `handleStartSession()`, replace lines 214-228 with:**

1. **Create offscreen document** (if not already exists):
   ```typescript
   const existingContexts = await chrome.runtime.getContexts({
     contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
   });
   if (existingContexts.length === 0) {
     await chrome.offscreen.createDocument({
       url: chrome.runtime.getURL('src/offscreen/offscreen.html'),
       reasons: [chrome.offscreen.Reason.USER_MEDIA],
       justification: 'Microphone and tab audio capture for transcription',
     });
   }
   ```

2. **Get tab capture stream ID** (wrapped in Promise since Chrome types use callback):
   ```typescript
   const streamId = await new Promise<string>((resolve, reject) => {
     chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
       if (chrome.runtime.lastError) {
         reject(new Error(chrome.runtime.lastError.message));
       } else {
         resolve(id);
       }
     });
   });
   ```

3. **Send START_DUAL_CAPTURE** to offscreen:
   ```typescript
   const captureResponse = await chrome.runtime.sendMessage({
     type: 'START_DUAL_CAPTURE',
     streamId,
   });
   if (captureResponse?.success) {
     isCapturing = true;
   }
   ```

4. **Keep overlay init** — `ensureContentScriptAndInitOverlay(tab.id)` stays unchanged but is now UI-only.

**In `handleStopSession()`, replace `STOP_MIC_CAPTURE` (line 313) with:**
- Send `STOP_AUDIO_CAPTURE` to offscreen document: `chrome.runtime.sendMessage({ type: 'STOP_AUDIO_CAPTURE' })`
- Close offscreen document after capture stops: `await chrome.offscreen.closeDocument()`

**Key components:**
- `src/background/service-worker.ts` — rewrite audio capture section in `handleStartSession()` and `handleStopSession()`

**Notes:** `chrome.tabCapture.getMediaStreamId()` uses a callback API, not promises — must wrap in `new Promise`. The offscreen document already has `STOP_AUDIO_CAPTURE` handler. After stopping, close the offscreen document to free resources. Error handling: if offscreen creation fails or tabCapture fails, return `{ success: false, error: ... }` — don't leave session in a half-started state.

---

### Task 4: Update Deepgram client for multichannel

**Intent:** Configure the Deepgram WebSocket connection for stereo multichannel mode and replace the speaker heuristic system with deterministic channel-index-based speaker identification.

**Context:** Depends on Task 1 (stereo audio format) and Task 3 (audio now arrives as interleaved stereo). The Deepgram API returns `channel_index: [channelNumber, totalChannels]` in each `Results` message when `multichannel=true`.

**Expected behavior:**

**Update `DEEPGRAM_PARAMS`:**
- Change `channels: '1'` → `channels: '2'`
- Add `multichannel: 'true'`
- Remove `diarize: 'true'` (channel index replaces diarization)

**Update `processTranscriptResult(data)`:**
- Read `channel_index` from response: `const channelIndex = data.channel_index as number[] | undefined;`
- Determine channel: `const channelNum = channelIndex?.[0] ?? 0;`
- Set speaker info based on channel:
  - Channel 0 (mic/user): `speaker = "You"`, `speaker_id = 0`, `speaker_role = "consultant"`, `is_self = true`
  - Channel 1 (tab/others): `speaker = "Participant"`, `speaker_id = 1`, `speaker_role = "customer"`, `is_self = false`
- Include `is_self` in the `Transcript` interface (add the field)
- Remove word-level speaker extraction (no longer using `firstWord.speaker`)

**Delete heuristic code:**
- Remove `speakerStats` map and `SpeakerStats` interface
- Remove `roleAssignments` map
- Remove `trackSpeaker()` method
- Remove `updateRoleAssignments()` method
- Remove `getSpeakerRole()` method
- Remove speaker stats reset from `disconnect()`

**Update `Transcript` interface:**
- Add `is_self: boolean` field

**`sendAudio()` — no changes needed.** It already accepts `number[]` and sends as `Int16Array.buffer`. The data is now interleaved stereo, which Deepgram handles since we set `channels=2`.

**Key components:**
- `src/services/deepgram-client.ts` — update params, rewrite `processTranscriptResult()`, delete heuristic code, update `Transcript` interface

**Notes:** The `bufferThreshold` of 4096 refers to Int16 samples. For stereo, 4096 interleaved samples = 2048 frames = 128ms at 16kHz. This is fine. Deepgram's per-channel endpointing and `utterance_end_ms` work independently in multichannel mode, so existing timing settings (`endpointing: 2500`, `utterance_end_ms: 3000`) remain valid. The `UtteranceEnd` message in multichannel uses `channel: [index, total]` (not `channel_index`) — handle this in the UtteranceEnd log if desired.

---

### Task 5: Strip audio code from content script

**Intent:** Remove all microphone capture code from `content-script.ts`, making it a pure UI bridge (overlay management + message routing).

**Context:** Depends on Task 3 (audio now handled by offscreen document). The content script currently imports AudioWorklet, manages microphone streams, and sends AUDIO_CHUNK messages. All of this moves to the offscreen document. The content script retains overlay UI, transcript/suggestion display, and summary display.

**Expected behavior:**

**Remove these variables:**
- `audioContext`
- `mediaStream`
- `audioWorkletNode`
- `isCapturingMic`

**Remove these functions:**
- `startMicCapture()`
- `stopMicCapture()`

**Remove these message handlers:**
- `case 'START_MIC_CAPTURE':` — delete entirely
- `case 'STOP_MIC_CAPTURE':` — delete entirely

**Update these:**
- `handleOverlayClose()` — remove `stopMicCapture()` call. Keep `chrome.runtime.sendMessage({ type: 'STOP_SESSION' })`.
- `case 'HIDE_OVERLAY':` — remove `stopMicCapture()` call. Keep `overlay?.hide()`.
- `handleExtensionInvalidated()` — remove `stopMicCapture()` call.

**Keep everything else:**
- Overlay initialization and management
- `transcript`, `suggestion`, `summary_loading`, `call_summary`, `summary_error`, `drive_save_result` handlers
- `INIT_OVERLAY`, `SHOW_OVERLAY`, `HIDE_OVERLAY` handlers
- `overlayDismissedByUser` tracking
- Extension validity checking

**Key components:**
- `src/content/content-script.ts` — remove audio code, update handlers

**Notes:** The `audio-processor.worklet.js` file in `src/content/` is no longer loaded but can stay in the codebase (removing it is optional cleanup). The content script's `web_accessible_resources` entry for the worklet can be removed from manifest.json but is harmless if left.

---

### Task 6: Update manifest.json for offscreen worklet

**Intent:** Add the offscreen document's `audio-processor.js` to `web_accessible_resources` so it can be loaded by the AudioWorklet.

**Context:** AudioWorklet modules must be loaded via URL, and Chrome requires them to be listed as web-accessible resources. The offscreen audio-processor.js needs this to be loadable via `chrome.runtime.getURL()`.

**Expected behavior:**

Add a second entry to `web_accessible_resources`:
```json
{
  "resources": ["src/offscreen/audio-processor.js"],
  "matches": ["<all_urls>"]
}
```

The `<all_urls>` match is needed because offscreen documents don't have a fixed origin matching a specific host pattern.

Optionally remove the old content worklet entry (but leaving it is harmless):
```json
{
  "resources": ["src/content/audio-processor.worklet.js"],
  "matches": ["https://meet.google.com/*"]
}
```

**Key components:**
- `manifest.json` — update `web_accessible_resources`

**Notes:** Minimal change. If the offscreen worklet URL fails to load, `audioContext.audioWorklet.addModule()` will throw, and the `startDualCapture()` function will propagate the error back to the service worker.

---

### Task 7: Build and validate end-to-end

**Intent:** Run the full build pipeline, verify TypeScript compiles cleanly, and confirm all pieces integrate correctly.

**Context:** Depends on all previous tasks. This catches type mismatches, missing imports, and build errors.

**Expected behavior:**
- `npm run typecheck` passes with zero errors
- `npm run build` produces clean dist
- `npm run lint` passes (or only pre-existing warnings)
- Verify the offscreen audio-processor.js is included in dist output
- Verify the service worker correctly imports updated deepgram-client types
- Verify content-script.ts has no remaining references to audio APIs
- Verify transcript-collector and call-summary correctly use the new `is_self` field from the `Transcript` interface

**Key components:**
- All files from Tasks 1-6
- `wingman-ai/extension/dist/` — built output

**Notes:** Full live testing requires a Google Meet call. Verify: (1) Chrome prompts for mic permission when starting session, (2) both sides of conversation appear in transcript, (3) labels show "You" and "Participant", (4) call summary correctly attributes "you" vs "them", (5) Drive transcript includes both sides. Service worker console should show Deepgram responses with `channel_index: [0, 2]` and `[1, 2]`.

---

## Appendix

### Technical Decisions

**Deepgram multichannel over two connections:** A single stereo stream with `multichannel=true&channels=2` is the correct architecture. Two separate WebSocket connections would require managing two Deepgram sessions, two sets of reconnection logic, and the user would see doubled API usage in their Deepgram dashboard. Multichannel is Deepgram's purpose-built solution for multi-party audio.

**Audio capture in offscreen document, not content script:** MV3 service workers can't access Web Audio API. Content scripts can access getUserMedia but not TabCapture. The offscreen document is the only context that can combine both mic and tab audio via the ChannelMergerNode. Moving all audio to offscreen also simplifies the content script to a pure UI layer.

**ChannelMergerNode for stereo mixing:** Web Audio API's `ChannelMergerNode(2)` takes two mono inputs and produces a stereo output, which is exactly what we need. The merger preserves channel separation — it does NOT mix/downmix. This ensures Deepgram receives distinct audio on each channel.

**Per-channel resampling in the worklet:** The AudioContext runs at the device's native rate (typically 48kHz on Mac). Deepgram expects 16kHz. Resampling each channel independently (before interleaving) ensures correct sample alignment. Using the same linear interpolation algorithm already proven in the content worklet.

**Removing diarization:** With multichannel, each channel has exactly one speaker source. Diarization (`diarize=true`) is designed for mixed audio with multiple speakers. On a single-speaker channel, diarization would label everyone as `speaker: 0` — providing no value. Removing it simplifies parsing and slightly reduces Deepgram processing overhead.

**Cost impact:** Multichannel doubles the per-minute Deepgram cost ($0.0077 → $0.0154/min on pay-as-you-go). This is unavoidable — Deepgram bills per channel-minute. A 30-minute call costs ~$0.46 instead of ~$0.23. For a sales tool that replaces $15K+/year Gong subscriptions, this is negligible.

### Dependencies

| Dependency | Purpose | New? |
|-----------|---------|------|
| Deepgram Nova-3 (`multichannel=true`) | Per-channel STT | No (existing API, new params) |
| Chrome TabCapture API | Get meeting audio stream | No (permission exists, now used) |
| Chrome Offscreen Document | Web Audio API access from MV3 | No (exists, now fully utilized) |
| Web Audio ChannelMergerNode | Combine mic + tab into stereo | No (browser API) |
| AudioWorklet API | Low-latency audio processing | No (existing pattern) |

No new npm packages. No new Chrome permissions (tabCapture and offscreen already declared).

### Out of Scope

- **Per-participant speaker separation** — Tab audio merges all remote participants into one channel. Distinguishing between multiple remote speakers would require n-channel audio or post-processing diarization on channel 1. Separate feature.
- **Echo cancellation tuning** — Mic echoCancellation is disabled to capture raw audio. If tab audio bleeds into mic channel, it would appear as duplicated text. Monitor in testing but don't pre-optimize.
- **Configurable multichannel toggle** — Always use multichannel when starting a session. No user setting for mono-only mode. If needed later, add a fallback path.
- **Deepgram Flux (v2/listen)** — Multichannel is not available on Flux. Stick with Nova-3 on v1/listen.
- **Content script mic fallback** — If offscreen document fails, we don't fall back to content script mic capture. The session fails with an error. Clean architecture over defensive complexity.
