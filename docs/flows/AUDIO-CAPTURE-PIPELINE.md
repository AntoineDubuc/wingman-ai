# Audio Capture Pipeline

Complete data flow from microphone/tab capture through AudioWorklet processing to Deepgram (transcription) and Hume AI (emotion detection).

> **Visual Diagrams:**
> - [ARCHITECTURE.md - Data Flow: Audio to Transcript and Emotion](../diagrams/ARCHITECTURE.md#data-flow-audio-to-transcript-and-emotion)
> - [SEQUENCES.md - Audio Chunk Flow](../diagrams/SEQUENCES.md#audio-chunk-flow)
> - [SEQUENCES.md - Emotion Detection Flow](../diagrams/SEQUENCES.md#emotion-detection-flow-hume-ai)

## Pipeline Overview

```
Hardware Capture (48kHz stereo Float32)
  ↓
AudioWorklet Buffer (4096 samples @ 48kHz = ~85ms)
  ↓
Resample to 16kHz (linear interpolation)
  ↓
Float32 → Int16 PCM conversion
  ↓
Stereo interleaving [ch0, ch1, ch0, ch1...]
  ↓
Message to Service Worker (AUDIO_CHUNK)
  ↓
┌─────────────────────────────────────────────────┐
│            Parallel Audio Processing             │
├────────────────────┬────────────────────────────┤
│   Deepgram Path    │       Hume AI Path         │
├────────────────────┼────────────────────────────┤
│ Buffer (4096)      │ Buffer + WAV wrapper       │
│        ↓           │          ↓                 │
│ WebSocket Binary   │ WebSocket Base64 WAV       │
│        ↓           │          ↓                 │
│ Nova-3 STT         │ Expression Measurement     │
│        ↓           │          ↓                 │
│ Transcripts        │ 48 emotions → 4 states     │
│        ↓           │          ↓                 │
│ Overlay bubbles    │ Emotion badge in header    │
└────────────────────┴────────────────────────────┘
```

## Audio Format Transformations

### Stage 1: Hardware Capture → AudioWorklet

**Input Format:**
- Sample rate: 48kHz (hardware native)
- Channels: 2 (mic + tab)
- Format: Float32 stereo
- Range: [-1.0, +1.0]
- Per callback: ~128 frames (~2.7ms)

**Buffering:**
- Accumulates to 4096 samples per channel @ 48kHz
- Duration: ~85ms per buffer fill
- Separate buffers: `bufferCh0`, `bufferCh1`

**File**: `offscreen/audio-processor.js`

### Stage 2: Resampling (48kHz → 16kHz)

**Algorithm**: Linear interpolation

```javascript
const resamplingRatio = 48000 / 16000; // = 3.0

for (let i = 0; i < outputLength; i++) {
  const srcIndex = i * resamplingRatio;
  const srcIndexFloor = Math.floor(srcIndex);
  const srcIndexCeil = Math.min(srcIndexFloor + 1, inputLength - 1);
  const fraction = srcIndex - srcIndexFloor;

  output[i] = input[srcIndexFloor] + fraction * (input[srcIndexCeil] - input[srcIndexFloor]);
}
```

**Output**: 4096 samples @ 48kHz → 1365 samples @ 16kHz per channel

### Stage 3: Float32 → Int16 PCM Conversion

```javascript
for (let i = 0; i < samples.length; i++) {
  const clamped = Math.max(-1, Math.min(1, samples[i]));

  if (clamped < 0) {
    int16Array[i] = clamped * 0x8000;  // -32768 to -1
  } else {
    int16Array[i] = clamped * 0x7FFF;  // 0 to 32767
  }
}
```

**Edge case**: Clamping prevents integer overflow at boundaries.

### Stage 4: Stereo Interleaving

```javascript
const interleaved = new Int16Array(ch0.length * 2);

for (let i = 0; i < ch0.length; i++) {
  interleaved[i * 2] = ch0[i];      // Left channel (mic)
  interleaved[i * 2 + 1] = ch1[i];  // Right channel (tab)
}
```

**Output**: 2730 samples (1365 * 2 channels)

**Compatible with**: Deepgram multichannel format (`channels=2`)

## Message Flow

### AudioWorklet → Offscreen

**File**: `offscreen/audio-processor.js`

```javascript
audioWorklet.port.postMessage({
  type: 'audio',
  audioData: Array.from(interleaved),  // Int16 array
  chunkCount: incrementing,
  samplesPerChannel: 1365,
  timestamp: Date.now()
});
```

### Offscreen → Service Worker

**File**: `offscreen/offscreen.ts`

```typescript
chrome.runtime.sendMessage({
  type: 'AUDIO_CHUNK',
  data: audioData,  // Int16 number[]
  timestamp: Date.now()
});
```

**Type**: Uppercase `AUDIO_CHUNK`

### Service Worker → Deepgram Client

**File**: `service-worker.ts:80-88`

```typescript
case 'AUDIO_CHUNK':
  if (isSessionActive) {
    deepgramClient.sendAudio(message.data);
  }
```

Direct function call (synchronous).

## Deepgram Client Buffering

**File**: `deepgram-client.ts`

### sendAudio() Method

```typescript
sendAudio(pcmData: number[]): void {
  if (!this.isConnected || this.socket?.readyState !== WebSocket.OPEN) {
    console.warn('[DeepgramClient] Not connected, discarding audio');
    return;  // Silently discard
  }

  this.audioBuffer.push(...pcmData);

  if (this.audioBuffer.length >= 4096) {
    this.flushBuffer();
  }
}
```

### flushBuffer() Method

```typescript
private flushBuffer(): void {
  if (this.audioBuffer.length === 0) return;

  const int16Array = new Int16Array(this.audioBuffer);
  this.socket!.send(int16Array.buffer);  // Send as ArrayBuffer

  this.audioBuffer = [];
}
```

**Buffer threshold**: 4096 samples
**Flush frequency**: ~Every 1-2 AUDIO_CHUNK messages
**Latency**: ~256ms total buffering

## Deepgram WebSocket

**File**: `deepgram-client.ts:102-181`

### Connection Details

**URL**: `wss://api.deepgram.com/v1/listen?model=nova-3&language=en&punctuate=true&multichannel=true&channels=2&interim_results=true&smart_format=true&encoding=linear16&sample_rate=16000&endpointing=700`

**Auth**: ⚠️ Must use `Sec-WebSocket-Protocol` header

```typescript
new WebSocket(url, ['token', apiKey]);
```

❌ Never: `?token=xxx` in URL (returns 401)

### Binary Frame Format

- Type: Int16 PCM (little-endian)
- Channels: 2 (stereo)
- Sample rate: 16kHz
- Bit depth: 16-bit signed
- Frame size: ~2600-2730 samples per frame
- Interleaving: `[ch0_s0, ch1_s0, ch0_s1, ch1_s1...]`
- Transfer rate: ~20-30 frames/second

## Endpointing Logic

**File**: `deepgram-client.ts:289-326`

Prevents mid-sentence bubble splitting in overlay.

### Segment Accumulation

**interim** (`is_final=false`):
- Emit immediately with accumulated prefix
- Overlay updates existing bubble

**partial final** (`is_final=true, speech_final=false`):
- Accumulate in `accumulatedSegments[channel]`
- Start 700ms flush timer (fallback)
- Emit as interim (accumulated text)

**final** (`is_final=true, speech_final=true`):
- Combine accumulated + current text
- Emit as FINAL transcript
- Clear accumulation & flush timer
- Triggers AI suggestion generation

**empty + speech_final**:
- Flush any accumulated segments as final
- Handles noisy environments gracefully

## Transcript Callback

**File**: `deepgram-client.ts:271-366`

```typescript
onTranscriptCallback({
  text: "...",                      // Full accumulated text
  speaker: "You" | "Participant",
  speaker_id: 0 | 1,                // 0=mic, 1=tab
  speaker_role: "consultant" | "customer",
  is_final: boolean,
  is_self: boolean,                 // true if speaker_id === 0
  confidence: 0.0-1.0,
  timestamp: ISO string
})
```

**Listeners:**
1. `transcriptCollector` → accumulates for summary
2. Service worker → sends to Gemini for suggestions
3. Service worker → sends `transcript` message to content script (lowercase)

## Key Numbers

| Metric | Value | Notes |
|--------|-------|-------|
| Input sample rate | 48 kHz | Hardware native |
| Target sample rate | 16 kHz | Deepgram optimal |
| AudioWorklet buffer | 4096 samples | ~85ms @ 48kHz |
| Output samples per flush | 1365 (mono) / 2730 (stereo) | @ 16kHz |
| Deepgram buffer threshold | 4096 samples | Triggers WebSocket send |
| Deepgram endpointing | 700 ms | Configurable via settings |
| Segment timeout | 700 ms | Fallback flush |
| Frame callback rate | ~128 frames (~2.7ms) | Web Audio API standard |
| Total latency | ~256-350ms | Buffering + network |

## Error Handling

### Stage 1 (Offscreen)

**getUserMedia() failure**:
- Log error, cleanup resources, throw
- Audio capture stops

**AudioWorklet load failure**:
- Falls back to ScriptProcessorNode (deprecated but supported)
- Continue operation

**Context suspension**:
- Resume offscreen AudioContext
- Log state change

### Stage 2 (Service Worker)

**Not connected to Deepgram**:
- Warn and silently discard `AUDIO_CHUNK`
- Next connection attempt works normally

**Connection timeout (10s)**:
- Close socket, log error, return false
- Triggers reconnection logic

**Parse error on incoming Results**:
- Log error, skip message, continue
- Prevents one bad frame from crashing client

### Stage 3 (Deepgram Reconnection)

**WebSocket close** (code ≠ 1000):
- Attempt reconnect if < 5 attempts
- Exponential backoff: 1s, 2s, 4s, 8s, 16s

**Max reconnect attempts**: 5
- After 5 fails, stop auto-reconnect
- User must stop/restart session

## Hume AI Emotion Detection

**File**: `hume-client.ts` (singleton: `humeClient`)

### Connection Details

**URL**: `wss://api.hume.ai/v0/stream/models`

**Auth**: API key in request body (not WebSocket header)

### Audio Format for Hume

Unlike Deepgram which accepts raw PCM, Hume requires WAV-wrapped audio:

```typescript
// Create WAV header for PCM data
function createWAVHeader(dataLength: number): ArrayBuffer {
  // 44-byte WAV header
  // - Sample rate: 16000 Hz
  // - Bits per sample: 16
  // - Channels: 1 (mono)
  // - Format: PCM
}

// Send as base64-encoded WAV
const base64WAV = btoa(String.fromCharCode(...wavBytes));
ws.send(JSON.stringify({
  type: 'audio_input',
  data: base64WAV,
  models: { prosody: {} }
}));
```

### Emotion Simplification

Hume returns 48 emotions with confidence scores. We simplify to 4 actionable states:

| Simplified State | Trigger Emotions | Visual |
|------------------|------------------|--------|
| **frustrated** | Anger, Contempt, Frustration, Annoyance | Red badge |
| **engaged** | Interest, Excitement, Concentration | Green badge |
| **thinking** | Confusion, Contemplation, Doubt | Yellow badge |
| **neutral** | Default / low confidence | Gray badge |

### Emotion Callback

```typescript
humeClient.setEmotionCallback((emotion: EmotionState) => {
  // emotion = { state, confidence, topEmotions[] }
  chrome.tabs.sendMessage(activeTabId, {
    type: 'emotion_update',  // lowercase
    data: emotion
  });
});
```

### Key Differences from Deepgram

| Aspect | Deepgram | Hume AI |
|--------|----------|---------|
| **Purpose** | Speech-to-text | Emotion detection |
| **Audio format** | Raw PCM binary | Base64 WAV |
| **Auth** | Sec-WebSocket-Protocol | Request body |
| **Output** | Transcript text | 48 emotion scores |
| **Update frequency** | Per utterance | ~1-2 seconds |

## Critical Notes

1. **Deepgram Auth**: Token must be in `Sec-WebSocket-Protocol` header, not URL query string
2. **Hume Auth**: API key in JSON message body, not WebSocket header
3. **Stereo Interleaving**: Deepgram expects strict `[ch0, ch1, ch0, ch1...]` format
4. **Hume Mono**: Hume receives mono audio (channel 0 only, or mixed)
5. **Endpointing**: Accumulates segments to prevent UI bubble splits
6. **Silent Failures**: Discards audio if Deepgram/Hume disconnected (no crash)
7. **Float32 → Int16**: Clamps to `[-1, 1]` before scaling to prevent overflow
8. **Parallel Processing**: Both clients receive the same AUDIO_CHUNK independently
