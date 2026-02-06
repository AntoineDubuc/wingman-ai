# Hume AI — Resources, Links & Example Code

> Curated links to documentation, SDKs, example projects, and code samples for implementation.

---

## Official Documentation

### Core Documentation

| Resource | URL | Description |
|----------|-----|-------------|
| **Developer Portal** | https://dev.hume.ai/ | Main documentation hub |
| **API Introduction** | https://dev.hume.ai/intro | Getting started guide |
| **Expression Measurement Overview** | https://dev.hume.ai/docs/expression-measurement/overview | Main API we'll use |
| **WebSocket Streaming Guide** | https://dev.hume.ai/docs/expression-measurement/websocket | Real-time streaming docs |
| **Batch Processing** | https://dev.hume.ai/docs/expression-measurement/rest | REST API for post-call analysis |
| **FAQ** | https://dev.hume.ai/docs/expression-measurement/faq | Common questions answered |

### Authentication

| Resource | URL | Description |
|----------|-----|-------------|
| **API Keys Guide** | https://dev.hume.ai/docs/introduction/api-key | How to get and use API keys |
| **Hume Portal (Get Keys)** | https://app.hume.ai/keys | Where to get API key + Secret key |
| **OAuth Token Endpoint** | `POST https://api.hume.ai/oauth2-cc/token` | Get access token for client-side |

### Error Handling

| Resource | URL | Description |
|----------|-----|-------------|
| **Error Codes Reference** | https://dev.hume.ai/docs/resources/errors | All error codes and resolutions |
| **Changelog** | https://dev.hume.ai/changelog | API changes and updates |

### Other APIs (Reference Only)

| Resource | URL | Description |
|----------|-----|-------------|
| **EVI (Voice Interface)** | https://dev.hume.ai/docs/speech-to-speech-evi/overview | Full voice agent (not needed) |
| **Audio Requirements** | https://dev.hume.ai/docs/speech-to-speech-evi/guides/audio | Audio format specs |
| **Pricing** | https://www.hume.ai/pricing | Plan details |
| **Billing Docs** | https://dev.hume.ai/docs/resources/billing | Usage and billing info |

---

## GitHub Repositories

### SDKs

| Repository | URL | Language | Stars |
|------------|-----|----------|-------|
| **TypeScript SDK** | https://github.com/HumeAI/hume-typescript-sdk | TypeScript | 73 |
| **Python SDK** | https://github.com/HumeAI/hume-python-sdk | Python | 157 |
| **React SDK** | https://github.com/HumeAI/hume-react-sdk | React/TypeScript | 43 |
| **Swift SDK** | https://github.com/HumeAI/hume-swift-sdk | Swift | 13 |
| **.NET SDK** | https://github.com/HumeAI/hume-dotnet-sdk | C# | 3 |

### Example Projects

| Repository | URL | Description |
|------------|-----|-------------|
| **API Examples (Main)** | https://github.com/HumeAI/hume-api-examples | 31 example projects |
| **Chrome Extension** | https://github.com/HumeAI/hume-chrome-extension | Real-time video emotion detection |
| **EVI Next.js Starter** | https://github.com/HumeAI/hume-evi-next-js-starter | Voice interface quickstart |
| **CLI Tool** | https://github.com/HumeAI/hume-cli | Command-line interface |

### Expression Measurement Examples (Most Relevant)

| Example | URL | Description |
|---------|-----|-------------|
| **Next.js Streaming** | https://github.com/HumeAI/hume-api-examples/tree/main/expression-measurement/streaming/next-js-streaming-example | Real-time streaming in Next.js |
| **TypeScript Raw Text** | https://github.com/HumeAI/hume-api-examples/tree/main/expression-measurement/batch/typescript-raw-text-processor | Text emotion analysis |
| **Python Top Emotions** | https://github.com/HumeAI/hume-api-examples/tree/main/expression-measurement/batch/python-top-emotions | Facial expression detection |
| **Visualization Example** | https://github.com/HumeAI/hume-api-examples/tree/main/expression-measurement/batch/visualization-example | Face analysis visualization |

### Live Demo

| Resource | URL | Description |
|----------|-----|-------------|
| **Streaming Sandbox** | https://hume-sandbox.netlify.app | Live demo of streaming API |

---

## NPM Packages

```bash
# Main SDK (includes Expression Measurement, EVI, TTS)
npm install hume

# Voice-specific package (for EVI)
npm install @humeai/voice
```

| Package | URL | Description |
|---------|-----|-------------|
| **hume** | https://www.npmjs.com/package/hume | Main TypeScript SDK |
| **@humeai/voice** | https://www.npmjs.com/package/@humeai/voice | Voice/EVI helpers |

---

## Code Examples

### 1. Basic SDK Setup

```typescript
import { HumeClient } from "hume";

const hume = new HumeClient({
  apiKey: "YOUR_API_KEY",
});
```

### 2. Expression Measurement WebSocket (SDK)

```typescript
import { HumeClient } from "hume";

const hume = new HumeClient({ apiKey: "YOUR_API_KEY" });

// Connect to streaming socket
const socket = hume.expressionMeasurement.stream.connect({
  config: {
    prosody: {},  // Enable speech prosody analysis
    burst: {},    // Enable vocal burst detection
  },
});

// Send audio and get emotions
const result = await socket.sendAudio({
  data: base64EncodedAudio,
});

console.log(result.prosody.predictions);
// [{ time: {begin: 0, end: 2.5}, emotions: [{name: "Joy", score: 0.72}, ...] }]
```

### 3. Raw WebSocket (No SDK)

For browser extensions where SDK might not work:

```typescript
// Connect to WebSocket
const ws = new WebSocket(
  `wss://api.hume.ai/v0/stream/models?apiKey=${API_KEY}`
);

ws.onopen = () => {
  console.log('Connected to Hume');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.prosody?.predictions) {
    const emotions = data.prosody.predictions[0].emotions;
    const top3 = emotions.sort((a, b) => b.score - a.score).slice(0, 3);
    console.log('Top emotions:', top3);
  }
};

// Send audio chunk
function sendAudio(base64Audio: string) {
  ws.send(JSON.stringify({
    models: {
      prosody: {},
      burst: {}
    },
    data: base64Audio
  }));
}
```

### 4. OAuth Token Flow (For Client-Side)

```typescript
// Server-side: Get access token
async function getAccessToken(apiKey: string, secretKey: string): Promise<string> {
  const credentials = btoa(`${apiKey}:${secretKey}`);

  const response = await fetch('https://api.hume.ai/oauth2-cc/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const data = await response.json();
  return data.access_token;  // Valid for 30 minutes
}

// Client-side: Use access token
const ws = new WebSocket(
  `wss://api.hume.ai/v0/stream/models?access_token=${accessToken}`
);
```

### 5. Using SDK's fetchAccessToken Helper

```typescript
import { fetchAccessToken } from 'hume';

const accessToken = await fetchAccessToken({
  apiKey: process.env.HUME_API_KEY,
  secretKey: process.env.HUME_SECRET_KEY
});
```

### 6. Audio Encoding (ArrayBuffer to Base64)

```typescript
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Usage with audio chunk
function handleAudioChunk(audioData: ArrayBuffer) {
  const base64 = arrayBufferToBase64(audioData);
  sendToHume(base64);
}
```

### 7. Chrome Extension Pattern (From HumeAI/hume-chrome-extension)

```typescript
// Content script: Capture video frames
const video = document.querySelector('video');
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

function captureFrame() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);

  // Convert to base64
  const base64 = canvas.toDataURL('image/jpeg').split(',')[1];

  // Send to background script
  chrome.runtime.sendMessage({
    type: 'FRAME_CAPTURE',
    data: base64
  });
}

// Capture every 100ms
setInterval(captureFrame, 100);
```

### 8. Handling Emotion Response

```typescript
interface HumeEmotion {
  name: string;
  score: number;
}

interface HumePrediction {
  time: { begin: number; end: number };
  emotions: HumeEmotion[];
}

interface HumeResponse {
  prosody?: { predictions: HumePrediction[] };
  burst?: { predictions: HumePrediction[] };
  error?: { code: string; message: string };
}

function handleHumeResponse(data: HumeResponse) {
  // Check for errors
  if (data.error) {
    console.error(`Hume error ${data.error.code}: ${data.error.message}`);
    return;
  }

  // Extract prosody emotions
  if (data.prosody?.predictions?.length) {
    const prediction = data.prosody.predictions[0];
    const topEmotions = prediction.emotions
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    console.log('Top 5 emotions:', topEmotions);
    // Example output:
    // [
    //   { name: "Interest", score: 0.72 },
    //   { name: "Concentration", score: 0.65 },
    //   { name: "Calmness", score: 0.43 },
    //   { name: "Contemplation", score: 0.38 },
    //   { name: "Doubt", score: 0.21 }
    // ]
  }

  // Check for vocal bursts (sighs, laughs)
  if (data.burst?.predictions?.length) {
    const burst = data.burst.predictions[0];
    console.log('Vocal burst detected:', burst.emotions[0]);
  }
}
```

### 9. Reconnection Logic

```typescript
class HumeWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnects = 5;
  private reconnectDelay = 1000;

  async connect(apiKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(
        `wss://api.hume.ai/v0/stream/models?apiKey=${apiKey}`
      );

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onclose = (event) => {
        if (event.code !== 1000) {
          this.handleReconnect(apiKey);
        }
      };

      this.ws.onerror = () => {
        reject(new Error('WebSocket connection failed'));
      };
    });
  }

  private async handleReconnect(apiKey: string): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnects) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    await new Promise(r => setTimeout(r, delay));

    try {
      await this.connect(apiKey);
    } catch {
      await this.handleReconnect(apiKey);
    }
  }
}
```

---

## API Quick Reference

### WebSocket Endpoint

```
wss://api.hume.ai/v0/stream/models
```

### Authentication Options

```
?apiKey=YOUR_API_KEY          # Direct API key (server-side only)
?access_token=YOUR_TOKEN      # OAuth token (client-side safe)
```

### Request Message Format

```json
{
  "models": {
    "prosody": {},
    "burst": {},
    "face": {},
    "language": {}
  },
  "data": "<base64-encoded-media>"
}
```

### Response Format

```json
{
  "prosody": {
    "predictions": [
      {
        "time": { "begin": 0.0, "end": 2.5 },
        "emotions": [
          { "name": "Joy", "score": 0.72 },
          { "name": "Interest", "score": 0.65 }
        ]
      }
    ]
  }
}
```

### Limits

| Limit | Value |
|-------|-------|
| Audio per message | 5 seconds |
| Text per message | 10,000 characters |
| Image dimensions | 3000 x 3000 px |
| Inactivity timeout | 60 seconds |
| Access token expiry | 30 minutes |
| HTTP rate limit | 50 req/sec |

---

## Community & Support

| Resource | URL |
|----------|-----|
| **Discord** | https://discord.gg/hume-ai |
| **Twitter/X** | https://twitter.com/haborneAI |
| **GitHub Issues (TS SDK)** | https://github.com/HumeAI/hume-typescript-sdk/issues |
| **GitHub Issues (Python SDK)** | https://github.com/HumeAI/hume-python-sdk/issues |
| **Research Papers** | https://www.hume.ai/research |
| **The Hume Initiative (Ethics)** | https://thehumeinitiative.org |

---

## Related Third-Party Projects

| Project | URL | Description |
|---------|-----|-------------|
| **Emotio** | https://devpost.com/software/emotio | Chrome extension using Hume for video emotion |
| **EmoVision** | https://github.com/Jordan-Townsend/emovision-chrome-extension | Real-time emotion for video calls |

---

## Implementation Checklist

Use these resources in order:

1. **Get API Keys**: https://app.hume.ai/keys
2. **Read WebSocket Docs**: https://dev.hume.ai/docs/expression-measurement/websocket
3. **Review Chrome Extension Example**: https://github.com/HumeAI/hume-chrome-extension
4. **Study Next.js Streaming Example**: https://github.com/HumeAI/hume-api-examples/tree/main/expression-measurement/streaming/next-js-streaming-example
5. **Install SDK**: `npm install hume`
6. **Review Error Codes**: https://dev.hume.ai/docs/resources/errors
7. **Test with Sandbox**: https://hume-sandbox.netlify.app
