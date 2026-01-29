# Tammy Extension Debug Log

## 2026-01-27

### Issue 1: Deepgram SDK v5.3.1 Import Errors
**Problem:** Code was using old SDK imports (`LiveTranscriptionEvents`, `LiveOptions`) that don't exist in v5.3.1.
**Fix:** Updated to use `AsyncDeepgramClient`, `EventType`, `ListenV1Results`. Changed connection pattern from old callback-based to async context manager (`__aenter__`/`__aexit__`).

### Issue 2: `send_media()` coroutine not awaited
**Problem:** Warning "coroutine 'AsyncV1SocketClient.send_media' was never awaited" - audio wasn't being sent to Deepgram.
**Fix:** Added `await` to `self._connection.send_media(buffer_bytes)` in `transcription.py`.

### Issue 3: Message type case sensitivity
**Problem:** Extension sent `"AUDIO_CHUNK"` (uppercase) but backend expected `"audio_chunk"` (lowercase).
**Status:** Extension actually sends lowercase. This wasn't the real issue.

### Issue 4: Microphone capturing silence (RMS=2, Max=3)
**Problem:** Backend receives audio chunks but they contain near-zero values (silence), not actual microphone audio.
**Current attempt:** Added `audioContext.resume()` call in case Chrome's autoplay policy suspended the context. Added more detailed RMS logging to content script.
**Status:** PARTIALLY RESOLVED - Deepgram DID return a transcript! Audio is working. Problem was UI not updating.

### Issue 5: Transcripts not reaching overlay
**Problem:** `[WebSocket] Received: transcript` logged but overlay still shows "Waiting...". The `notifyContentScript` method queried for `active: true` tabs, which fails when DevTools is focused.
**Fix:** Removed `active: true` constraint - now queries all Meet tabs and sends to all of them. Added logging and error handling.

### Issue 6: Content script audio logs not appearing
**Problem:** Meet tab console shows `[ContentScript] Initializing overlay` but NO audio chunk logs (`[ContentScript] Audio chunk #...`). This means mic capture isn't running or failing silently.
**Research findings:**
1. AudioContext likely suspended - must be resumed from user gesture
2. Sample rate mismatch - Mac mics use 44100/48000Hz, we request 16000Hz
3. Google Meet suggests using Add-ons SDK instead of extensions
**Fix applied:**
1. Removed `sampleRate: 16000` from getUserMedia constraints (not supported by Mac mics)
2. Use device's native sample rate for AudioContext
3. Added `resample()` function to downsample from 44100/48000Hz to 16000Hz
4. Added extensive logging for debugging (track state, sample rate, etc.)
5. Kept `autoGainControl: true` to help with quiet mics
**Status:** PARTIAL SUCCESS
- Mic capture now works initially (maxFloat=0.0221)
- Transcripts ARE being received by content script
- Audio drops to near-zero quickly (0.0221 → 0.0008 → 0.0001)
- Got stereo (channelCount:2) but only reading channel 0
- Mac ignored autoGainControl/noiseSuppression requests

### Issue 7: Audio drops to silence after first chunk
**Problem:** maxFloat starts at 0.0221 then drops to 0.0008, 0.0001. Could be:
1. Another app taking mic (Meet itself?)
2. Reading wrong stereo channel
3. Some Chrome/Mac audio routing issue
**Fix applied:**
1. Changed ScriptProcessor to request 2 input channels (stereo)
2. Read both channels and mix to mono: `(ch0 + ch1) / 2`
3. Added logging to show individual channel levels (ch0, ch1, mixed)
4. Added track event listeners for 'mute', 'unmute', 'ended' events to detect if Meet takes over mic
5. Added track state to periodic logging (enabled, muted, readyState)
**Status:** Testing...

### Issue 9: Architecture change - Continuous Participant Mode
**Problem:** Point-in-time LLM calls only triggered on detected questions. This misses context and doesn't let the AI decide when to help.
**Solution:** Refactored to "Continuous Participant" architecture:
1. Every final transcript is sent to the LLM (not just questions)
2. LLM maintains full conversation history (last 20 turns)
3. LLM decides when to speak vs stay silent (responds with "---" to stay quiet)
4. 5-second cooldown between suggestions to avoid spam
5. System prompt updated to be a "silent participant" who speaks when valuable
**Files changed:**
- `backend/app/services/agent.py` - Complete rewrite for continuous mode
- `backend/app/routers/websocket.py` - Updated to use new `process_transcript()` method
**Status:** DEPLOYED - Testing

### Issue 8: AI needs CloudGeometry-specific knowledge
**Problem:** System prompt was generic "Technical Cloud Solutions Presales Consultant" - not specific to CloudGeometry's services.
**Fix applied:**
1. Updated system prompt to introduce Tammy as CloudGeometry's AI TAM
2. Added CG's core services: App Modernization, K8s, AI/Data/MLOps, CloudOps, FinOps, Security
3. Added CG's products: CGDevX, LangBuilder, ActionBridge
4. Added key clients: Sinclair, Tetra Science, Gemini Health, Ryder, Symphony
5. Updated response format for quick-glance reading (📌 + bullets + 💬)
6. Updated type-specific guidance with CG-relevant talking points
7. Added discovery questions suggestions for each question type
**Status:** DEPLOYED - Restart backend to test

---

### Issue 10: Session management - stop on close, singleton enforcement
**Problem:** User requested: "once the window (chat) closes it stops the session and that there is only one session"
**Fix applied:**
1. Added `onCloseCallback` parameter to `AIOverlay` constructor
2. Close button (×) now calls callback to notify content script
3. Content script sends `STOP_SESSION` message to background on overlay close
4. Background service worker checks for active session before starting new one
5. Stale connections are cleaned up before new session starts
**Files changed:**
- `extension/src/content/overlay.ts` - Added close callback
- `extension/src/content/content-script.ts` - Added `handleOverlayClose()` function
- `extension/src/background/service-worker.ts` - Added singleton session check

---

## Key Files
- `backend/app/services/transcription.py` - Deepgram SDK integration
- `extension/src/content/content-script.ts` - Microphone capture
- `extension/src/background/service-worker.ts` - WebSocket relay

## Current State
- Backend: Deepgram SDK v5.3.1 working, connects successfully
- Extension: Captures audio but values are silence (RMS=2)
- Next step: Check Meet tab console for `[ContentScript]` logs to see if audio is silent at capture time or getting corrupted in transit
