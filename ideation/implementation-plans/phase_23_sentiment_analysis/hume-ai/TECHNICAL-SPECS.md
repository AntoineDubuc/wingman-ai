# Hume AI — Technical Specifications

> Engineering reference for integrating Hume Expression Measurement API into Wingman AI.

---

## API Overview

| Specification | Value |
|---------------|-------|
| **API Type** | WebSocket (streaming) + REST (batch) |
| **Base URL** | `wss://api.hume.ai/v0/stream/models` |
| **REST Base** | `https://api.hume.ai/` |
| **Protocol** | WebSocket Secure (WSS) |
| **Data Format** | JSON |
| **Media Encoding** | Base64 |
| **SDKs** | TypeScript, Python, React, Swift, .NET |

---

## Authentication

### Option 1: API Key (Server-Side Only)

```typescript
// WebSocket — API key as query parameter
const ws = new WebSocket('wss://api.hume.ai/v0/stream/models?apiKey=YOUR_API_KEY');

// REST — API key in header
fetch('https://api.hume.ai/v0/batch/jobs', {
  headers: {
    'X-Hume-Api-Key': 'YOUR_API_KEY'
  }
});
```

**Warning**: Never expose API keys in client-side code.

### Option 2: Access Token (Client-Side Safe)

For browser extensions, use OAuth flow to get short-lived tokens:

```typescript
// Step 1: Server-side — Get access token
const credentials = btoa(`${API_KEY}:${SECRET_KEY}`);
const response = await fetch('https://api.hume.ai/oauth2-cc/token', {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: 'grant_type=client_credentials'
});
const { access_token } = await response.json();

// Step 2: Client-side — Use access token
const ws = new WebSocket(`wss://api.hume.ai/v0/stream/models?access_token=${access_token}`);
```

| Token Property | Value |
|----------------|-------|
| **Expiration** | 30 minutes |
| **Refresh** | Obtain new token before expiry |
| **Supported APIs** | EVI, TTS, Expression Measurement |

---

## WebSocket Connection

### Endpoint

```
wss://api.hume.ai/v0/stream/models
```

### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `apiKey` | Yes* | Your Hume API key |
| `access_token` | Yes* | OAuth access token (alternative to apiKey) |

*One of `apiKey` or `access_token` required.

### Connection Lifecycle

```
┌──────────────────────────────────────────────────────────────┐
│ 1. Open WebSocket connection                                 │
│ 2. Send configuration message (models to use)                │
│ 3. Stream audio chunks as base64 (loop)                      │
│ 4. Receive emotion predictions (async)                       │
│ 5. Close connection when done                                │
└──────────────────────────────────────────────────────────────┘
```

### Timeouts

| Timeout | Duration | Action |
|---------|----------|--------|
| **Inactivity** | 60 seconds | Connection closed |
| **Max session** | 30 minutes | Must reconnect |
| **HTTP rate limit** | 50 req/sec | Throttled |

---

## Message Formats

### Send: Configuration + Audio

```json
{
  "models": {
    "prosody": {},
    "burst": {}
  },
  "data": "<base64-encoded-audio>"
}
```

### Model Options

| Model | Key | Description |
|-------|-----|-------------|
| Speech Prosody | `prosody` | Tone, rhythm, timbre analysis |
| Vocal Burst | `burst` | Sighs, laughs, hesitations |
| Face | `face` | Facial expressions (requires video) |
| Language | `language` | Text sentiment (requires text/transcript) |

### Send: Text Input

```json
{
  "models": {
    "language": {}
  },
  "raw_text": true,
  "data": "I'm really frustrated with this situation."
}
```

### Receive: Emotion Predictions

```json
{
  "prosody": {
    "predictions": [
      {
        "time": {
          "begin": 0.0,
          "end": 2.5
        },
        "emotions": [
          {"name": "Frustration", "score": 0.82},
          {"name": "Anger", "score": 0.45},
          {"name": "Disappointment", "score": 0.38},
          {"name": "Interest", "score": 0.12},
          {"name": "Joy", "score": 0.02}
          // ... all 48 emotions
        ]
      }
    ]
  },
  "burst": {
    "predictions": [
      {
        "time": {"begin": 1.2, "end": 1.5},
        "emotions": [
          {"name": "Sigh", "score": 0.91}
        ]
      }
    ]
  }
}
```

### Score Interpretation

| Score Range | Interpretation |
|-------------|----------------|
| 0.0 - 0.2 | Not perceived |
| 0.2 - 0.4 | Weakly perceived |
| 0.4 - 0.6 | Moderately perceived |
| 0.6 - 0.8 | Strongly perceived |
| 0.8 - 1.0 | Very strongly perceived |

**Note**: Scores can exceed 1.0 in some cases. They represent likelihood a human perceiver would assign that emotion label.

---

## Audio Requirements

### Supported Formats

| Format | Container | Codec | Notes |
|--------|-----------|-------|-------|
| **WebM** | audio/webm | Opus/Vorbis | Recommended for browser |
| **Linear PCM** | Raw | PCM | Requires format declaration |

### Linear PCM Specifications

If using raw PCM, send `session_settings` first:

```json
{
  "type": "session_settings",
  "audio": {
    "format": "linear16",
    "sample_rate": 44100,
    "channels": 1
  }
}
```

| Property | Value |
|----------|-------|
| **Encoding** | `linear16` (16-bit signed, little-endian) |
| **Sample Rate** | 44100 Hz (recommended) |
| **Channels** | 1 (mono) |
| **Bit Depth** | 16-bit |

### Chunk Constraints

| Constraint | Limit |
|------------|-------|
| **Max duration per message** | 5,000ms (5 seconds) |
| **Recommended chunk size** | 100ms |
| **Encoding** | Base64 |

### Audio Best Practices

```typescript
// Capture audio with recommended settings
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
});

// Use 100ms chunks for streaming
const CHUNK_INTERVAL_MS = 100;
```

**Muting**: Send silence frames rather than stopping transmission to maintain connection.

---

## Payload Size Limits

| Content Type | WebSocket Limit | REST Limit |
|--------------|-----------------|------------|
| Audio | 5,000ms | Unlimited |
| Video | 5,000ms | Unlimited |
| Image | 3000 x 3000 px | 3000 x 3000 px |
| Text | 10,000 characters | Unlimited |

---

## Rate Limits & Quotas

### Request Limits

| Limit Type | Value |
|------------|-------|
| HTTP requests | 50/second |
| WebSocket messages | No explicit limit |
| Concurrent connections | Plan-dependent |

### Plan-Based Limits

| Plan | Concurrent Connections | Monthly Included |
|------|------------------------|------------------|
| Free | 1 | $20 credits |
| Starter ($3) | 5 | 30K characters |
| Pro ($70) | 10 | 1,200 EVI minutes |
| Scale ($200) | 20 | Higher limits |
| Business ($500) | 30 | Volume pricing |
| Enterprise | Custom | Negotiated |

---

## Error Handling

### Error Code Categories

| Prefix | Category | Description |
|--------|----------|-------------|
| E01xx | Config | Invalid request format |
| E02xx | Media | Invalid media data |
| E03xx | Billing | Credit/subscription issues |
| E04xx | Resource | Missing resources |
| E05xx | Dataset | Training data issues |
| E07xx | Connection | WebSocket/LLM errors |
| W01xx | Warning | No results (not fatal) |
| I0xxx | Service | Hume internal error |

### Common Errors

| Code | Message | Resolution |
|------|---------|------------|
| E0100 | Invalid JSON | Check JSON serialization |
| E0201 | Base64 decode failed | Verify base64 encoding |
| E0202 | No audio detected | Check audio data is present |
| E0203 | Audio > 5000ms | Split into smaller chunks |
| E0300 | Out of credits | Add billing or wait for reset |
| E0714 | Inactivity timeout | Send keepalive or reconnect |
| W0105 | No speech detected | Normal if silence period |

### WebSocket Close Codes

| Code | Type | Meaning |
|------|------|---------|
| 1000 | Normal | Clean disconnect |
| 1008 | Policy | Request violates guidelines |
| 1011 | Server Error | Internal Hume error |

### Error Handling Pattern

```typescript
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.error) {
    const code = data.error.code;

    if (code.startsWith('E03')) {
      // Billing error — notify user
      console.error('Hume credits exhausted');
    } else if (code.startsWith('W')) {
      // Warning — log but continue
      console.warn('Hume warning:', data.error.message);
    } else if (code.startsWith('I')) {
      // Service error — retry with backoff
      scheduleReconnect();
    } else {
      // Config error — fix request
      console.error('Hume error:', data.error);
    }
  }
};
```

---

## SDK Installation

### TypeScript/JavaScript

```bash
npm install hume
```

```typescript
import { HumeClient } from 'hume';

const client = new HumeClient({
  apiKey: process.env.HUME_API_KEY
});
```

### Voice Package (React/Browser)

```bash
npm install @humeai/voice
```

### SDK Status

| Property | Value |
|----------|-------|
| **Status** | Beta |
| **Breaking Changes** | Possible without major version bump |
| **Recommendation** | Pin to specific version |

---

## Language Support

### Transcription Languages (20)

Danish, German, English, Spanish, French, French-Canadian, Hindi, Indonesian, Italian, Japanese, Korean, Dutch, Polish, Portuguese (BR), Portuguese (PT), Russian, Swedish, Turkish, Ukrainian, Chinese (Simplified), Chinese (Traditional)

### Emotion Analysis Languages

50+ languages supported, but **English yields the most accurate predictions**.

### Language Tags (BCP-47)

```typescript
// Specify language for better accuracy
{
  "models": {
    "prosody": {
      "language": "en"  // ISO 639-1 code
    }
  }
}
```

---

## Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| **Latency (first byte)** | ~300ms | Time to first emotion response |
| **Throughput** | Real-time | Processes as fast as audio arrives |
| **Prosody stability** | High at sentence-level | Word-level is context-dependent |
| **Connection overhead** | ~100ms | Initial WebSocket handshake |

### Latency Optimization

1. **Reuse connections** — Don't open new socket per audio chunk
2. **Stream continuously** — Send 100ms chunks without waiting for response
3. **Process async** — Handle responses in separate callback
4. **Batch display updates** — Don't re-render on every emotion update

---

## Security Considerations

### Data Handling

| Data Type | Retention | Notes |
|-----------|-----------|-------|
| Audio | Not stored | Processed in real-time |
| Predictions | Session only | Available via Chat History API |
| API Keys | Never logged | User responsibility to protect |

### Client-Side Security

```typescript
// NEVER do this in browser code:
const client = new HumeClient({ apiKey: 'sk-xxx' }); // WRONG

// DO THIS instead:
// 1. Server generates access token
// 2. Client uses short-lived token
const ws = new WebSocket(`wss://api.hume.ai/...?access_token=${token}`);
```

### Compliance

- SOC 2 Type II (in progress)
- GDPR considerations for emotion data
- May be classified as biometric data in some jurisdictions

---

## Integration with Wingman AI

### Architecture Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                     Audio Stream (Mic/Tab)                  │
│                              │                              │
│              ┌───────────────┴───────────────┐              │
│              ▼                               ▼              │
│    ┌─────────────────┐             ┌─────────────────┐      │
│    │    Deepgram     │             │    Hume AI      │      │
│    │    WebSocket    │             │    WebSocket    │      │
│    │ (Transcription) │             │ (Emotions)      │      │
│    └────────┬────────┘             └────────┬────────┘      │
│             │                               │               │
│             ▼                               ▼               │
│    ┌─────────────────┐             ┌─────────────────┐      │
│    │   Transcript    │             │  Emotion Data   │      │
│    │    + Timing     │             │   + Timing      │      │
│    └────────┬────────┘             └────────┬────────┘      │
│             │                               │               │
│             └───────────────┬───────────────┘               │
│                             ▼                               │
│                   ┌─────────────────┐                       │
│                   │     Gemini      │                       │
│                   │  (Suggestions)  │                       │
│                   │ + Emotion Context│                       │
│                   └────────┬────────┘                       │
│                            │                                │
│                            ▼                                │
│                   ┌─────────────────┐                       │
│                   │     Overlay     │                       │
│                   │  Suggestion +   │                       │
│                   │ Emotion Badge   │                       │
│                   └─────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

### Key Implementation Notes

1. **Same audio source** — Reuse AudioWorklet output for both Deepgram and Hume
2. **Parallel WebSockets** — Both run independently
3. **Correlate by timestamp** — Match emotions to transcript segments
4. **Aggregate emotions** — Show dominant emotion per utterance, not per word
5. **Token refresh** — Implement 30-minute token rotation

---

## References

- [Expression Measurement Overview](https://dev.hume.ai/docs/expression-measurement/overview)
- [WebSocket Streaming Docs](https://dev.hume.ai/docs/expression-measurement/websocket)
- [API Error Reference](https://dev.hume.ai/docs/resources/errors)
- [Audio Requirements](https://dev.hume.ai/docs/speech-to-speech-evi/guides/audio)
- [Authentication Guide](https://dev.hume.ai/docs/introduction/api-key)
- [TypeScript SDK](https://github.com/HumeAI/hume-typescript-sdk)
- [Chrome Extension Example](https://github.com/HumeAI/hume-chrome-extension)
