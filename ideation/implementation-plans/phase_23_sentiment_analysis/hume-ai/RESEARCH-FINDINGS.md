# Hume AI Integration — Research Findings (2026-02-06)

> Comprehensive research from official SDK, Chrome extension example, API docs, and web examples.

---

## Critical Finding: Why Our Implementation Fails

**Root Cause:** Expression Measurement API expects self-describing audio formats (WAV, MP3, WebM), NOT raw PCM.

### What DOESN'T Work

**session_settings (from EVI docs) — WRONG API:**
```json
// DON'T DO THIS - Returns E0101 "Extra inputs are not permitted"
{
  "type": "session_settings",
  "audio": { "format": "linear16", "sample_rate": 16000, "channels": 1 }
}
```
The `session_settings` message is for EVI (Empathic Voice Interface), not Expression Measurement.

**Raw PCM — No headers:**
```json
// Returns E0200 "Failed to parse data as a valid media file"
{
  "models": { "prosody": {} },
  "data": "<base64-encoded-raw-PCM>"
}
```

### What WORKS

**Wrap PCM in WAV format (44-byte header):**
```typescript
// Create WAV buffer with RIFF/WAVE header
const wavBuffer = createWavBuffer(pcmInt16Array); // 16kHz, mono, 16-bit
const base64 = btoa(String.fromCharCode(...new Uint8Array(wavBuffer)));

// ONLY 'models' and 'data' are valid fields
// rawText, payloadId, stream_window_ms are ALL rejected
{
  "models": { "prosody": {} },
  "data": base64
}
```

---

## Issue 4: Delayed First Emotion Detection (2026-02-06)

**Symptom:** Emotions don't appear until ~10 seconds into a call, even though Hume connects immediately.

**Root Cause:** Hume's prosody model needs sufficient audio context to detect tone, rhythm, and timbre. It appears to buffer ~5 seconds of audio internally before returning predictions. This is expected behavior — prosody analysis requires hearing speech patterns over time, not just individual words.

**Attempted Mitigation:** Tried adding `stream_window_ms: 2000` to reduce internal buffering. **FAILED** — this parameter silently breaks the API (no errors returned, but no predictions either). Expression Measurement API only accepts `models` and `data`.

**Acceptance:** The ~5-10 second initial delay is inherent to prosody analysis and cannot be configured client-side. This is a Hume API limitation.

---

## WebSocket Connection

**Endpoint:**
```
wss://api.hume.ai/v0/stream/models?apiKey=<YOUR_API_KEY>
```

**Authentication:**
- Query parameter: `?apiKey=xxx` (browser WebSocket limitation)
- OR header: `X-Hume-Api-Key: xxx` (server-side only)

**Connection Timeout:**
- 60 seconds of inactivity → auto-disconnect
- Must implement reconnection logic

---

## Message Formats

### Client → Server

**Session Settings (for PCM audio):**
```json
{
  "type": "session_settings",
  "audio": {
    "format": "linear16",
    "sample_rate": 16000,
    "channels": 1
  }
}
```

**Audio Data:**
```json
{
  "models": {
    "prosody": {}
  },
  "data": "<base64-encoded-audio>",
  "rawText": false
}
```

**Text Data:**
```json
{
  "models": {
    "language": {}
  },
  "data": "Your text here",
  "rawText": true
}
```

**Optional Fields:**
- `payloadId`: UUID for request-response correlation
- `streamWindowMs`: Sliding window (default 5000ms)
- `resetStream`: Clear past context before processing

### Server → Client

**Success Response:**
```json
{
  "prosody": {
    "predictions": [
      {
        "time": { "begin": 0.0, "end": 2.5 },
        "emotions": [
          { "name": "Joy", "score": 0.82 },
          { "name": "Interest", "score": 0.45 }
        ]
      }
    ]
  }
}
```

**Error Response:**
```json
{
  "error": "Error description string",
  "code": "E0201",
  "payloadId": "optional-correlation-id"
}
```

**Note:** Error has `error` as string at top level, NOT `{ error: { code, message } }`.

---

## Audio Requirements

### Supported Formats
- WAV, MP3, AAC, OGG, FLAC, WebM (self-describing, no session_settings needed)
- PCM/Linear16 (requires session_settings)

### PCM Specifications
| Property | Value |
|----------|-------|
| Encoding | `linear16` (16-bit signed, little-endian) |
| Sample Rate | 16kHz works (no upsampling needed) |
| Channels | 1 (mono) |
| Chunk Size | ≤5 seconds per message |
| Recommended | 100ms chunks for web |

### Base64 Encoding
All audio must be base64-encoded before sending:
```typescript
const int16Array = new Int16Array(pcmSamples);
const base64 = btoa(String.fromCharCode(...new Uint8Array(int16Array.buffer)));
```

---

## Error Codes

| Code | Category | Description |
|------|----------|-------------|
| E01xx | Config | Invalid request format |
| E02xx | Media | Invalid media data |
| E0201 | Media | Base64 decode failed |
| E0202 | Media | No audio detected |
| E0203 | Media | Audio > 5000ms |
| E03xx | Billing | Credit/subscription issues |
| E0300 | Billing | Out of credits |
| W01xx | Warning | No results (not fatal) |
| I0xxx | Internal | Hume service error |

---

## SDK Implementation Pattern

From official TypeScript SDK:

```typescript
import { HumeClient } from "hume";

const hume = new HumeClient({ apiKey: "YOUR_API_KEY" });

const socket = hume.expressionMeasurement.stream.connect({
  config: {
    prosody: {},
  },
  streamWindowMs: 3000,
  onOpen: () => console.log("Connected"),
  onMessage: (event) => console.log("Received:", event),
  onError: (error) => console.error("Error:", error),
  onClose: () => console.log("Disconnected"),
});

// Send audio file
const result = await socket.sendFile({ file: audioBlob });
```

---

## Chrome Extension Example

**Important:** The Hume Chrome extension example uses **VIDEO frames**, not audio.

- Captures video frames from `<video>` elements
- Converts to PNG via canvas
- Base64 encodes and sends with `face` model
- NOT applicable for audio-based emotion detection

---

## Key Differences from Our Current Implementation

| Aspect | Our Implementation | Correct Implementation |
|--------|-------------------|----------------------|
| Session setup | None | Send `session_settings` first |
| Audio format | Raw PCM, no declaration | Declare format in session_settings |
| Error parsing | `data.error.code` | `data.error` (string) and `data.code` |
| Payload ID | Not used | Recommended for correlation |

---

## Recommended Fix

1. **Send session_settings on connect:**
```typescript
socket.onopen = () => {
  // Declare audio format first
  socket.send(JSON.stringify({
    type: "session_settings",
    audio: {
      format: "linear16",
      sample_rate: 16000,
      channels: 1
    }
  }));
};
```

2. **Fix error parsing:**
```typescript
if (data.error) {
  // error is a string, code is separate
  console.error(`[HumeClient] API error ${data.code}: ${data.error}`);
}
```

3. **Add payload correlation:**
```typescript
const message = {
  payloadId: crypto.randomUUID(),
  models: { prosody: {} },
  data: base64Audio,
};
```

---

## Sources

- [Hume TypeScript SDK](https://github.com/HumeAI/hume-typescript-sdk)
- [Hume Chrome Extension](https://github.com/HumeAI/hume-chrome-extension)
- [Expression Measurement WebSocket Docs](https://dev.hume.ai/docs/expression-measurement/websocket)
- [Hume Audio Guide](https://dev.hume.ai/docs/speech-to-speech-evi/guides/audio)
- [Hume API Examples](https://github.com/HumeAI/hume-api-examples)
