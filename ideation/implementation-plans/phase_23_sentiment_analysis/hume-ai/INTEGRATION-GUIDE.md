# Hume AI — Wingman AI Integration Guide

> Step-by-step implementation guide for adding real-time emotion detection to Wingman AI.

---

## Prerequisites

Before implementing Hume AI integration:

1. **Hume Account**: Sign up at https://app.hume.ai
2. **API Keys**: Get API key + Secret key from https://app.hume.ai/keys
3. **Plan Selection**: Free tier for testing, Starter ($3/mo) for development

---

## Implementation Phases

### Phase 1: Post-Call Sentiment (Deepgram)

**Effort**: 1-2 days
**Cost**: $0 additional

Add `sentiment=true` to existing Deepgram batch processing for call summaries.

```typescript
// In call-summary.ts — when generating summary
const transcript = await deepgram.transcribe(audioUrl, {
  sentiment: true  // Enable post-call sentiment
});

// Response includes:
// transcript.sentiment.segments[].sentiment = 'positive' | 'negative' | 'neutral'
// transcript.sentiment.segments[].sentiment_score = -1 to +1
```

**Note**: This does NOT work for real-time streaming. Deepgram sentiment is batch-only.

---

### Phase 2: Real-Time Emotion (Hume AI)

**Effort**: 1-2 weeks
**Cost**: ~$0.06/min per call

#### Step 1: Add Hume API Keys to Storage

```typescript
// src/options/sections/api-keys.ts

// Add to existing API key section
interface ApiKeys {
  deepgramApiKey: string;
  geminiApiKey: string;
  humeApiKey?: string;      // NEW
  humeSecretKey?: string;   // NEW
}
```

**UI**: Add input fields in API Keys section of options page.

#### Step 2: Create Hume Client Service

```typescript
// src/services/hume-client.ts

const HUME_WS_URL = 'wss://api.hume.ai/v0/stream/models';
const HUME_TOKEN_URL = 'https://api.hume.ai/oauth2-cc/token';

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

class HumeClient {
  private socket: WebSocket | null = null;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private onEmotionCallback: ((emotions: HumeEmotion[]) => void) | null = null;

  async connect(apiKey: string, secretKey: string): Promise<void> {
    // Get access token (refresh if expired)
    await this.ensureValidToken(apiKey, secretKey);

    // Open WebSocket
    const url = `${HUME_WS_URL}?access_token=${this.accessToken}`;
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      console.log('[Hume] WebSocket connected');
    };

    this.socket.onmessage = (event) => {
      this.handleMessage(JSON.parse(event.data));
    };

    this.socket.onerror = (error) => {
      console.error('[Hume] WebSocket error:', error);
    };

    this.socket.onclose = (event) => {
      console.log('[Hume] WebSocket closed:', event.code, event.reason);
    };
  }

  private async ensureValidToken(apiKey: string, secretKey: string): Promise<void> {
    // Token valid for 25 minutes (5 min buffer before 30 min expiry)
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return;
    }

    const credentials = btoa(`${apiKey}:${secretKey}`);
    const response = await fetch(HUME_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
      throw new Error(`Hume token error: ${response.status}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (25 * 60 * 1000); // 25 minutes
  }

  sendAudio(base64Audio: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = {
      models: {
        prosody: {},  // Speech tone analysis
        burst: {}     // Sighs, laughs, etc.
      },
      data: base64Audio
    };

    this.socket.send(JSON.stringify(message));
  }

  private handleMessage(data: HumeResponse): void {
    if (data.error) {
      console.error('[Hume] Error:', data.error.code, data.error.message);
      return;
    }

    // Extract top emotions from prosody predictions
    if (data.prosody?.predictions?.length) {
      const prediction = data.prosody.predictions[0];
      const topEmotions = this.getTopEmotions(prediction.emotions, 3);

      if (this.onEmotionCallback) {
        this.onEmotionCallback(topEmotions);
      }
    }
  }

  private getTopEmotions(emotions: HumeEmotion[], count: number): HumeEmotion[] {
    return emotions
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .filter(e => e.score > 0.3); // Only include meaningful scores
  }

  onEmotion(callback: (emotions: HumeEmotion[]) => void): void {
    this.onEmotionCallback = callback;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close(1000, 'Session ended');
      this.socket = null;
    }
  }
}

export const humeClient = new HumeClient();
```

#### Step 3: Integrate with Audio Pipeline

```typescript
// src/background/service-worker.ts

import { humeClient } from '../services/hume-client';

// In startSession():
async function startSession() {
  // ... existing Deepgram setup ...

  // Initialize Hume if keys are configured
  const { humeApiKey, humeSecretKey } = await chrome.storage.local.get([
    'humeApiKey',
    'humeSecretKey'
  ]);

  if (humeApiKey && humeSecretKey) {
    await humeClient.connect(humeApiKey, humeSecretKey);

    humeClient.onEmotion((emotions) => {
      // Send to content script
      sendToContentScript({
        type: 'emotion_update',
        emotions: emotions
      });
    });
  }
}

// In handleAudioChunk():
function handleAudioChunk(audioData: ArrayBuffer) {
  // Existing: send to Deepgram
  deepgramClient.sendAudio(audioData);

  // NEW: also send to Hume
  const base64 = arrayBufferToBase64(audioData);
  humeClient.sendAudio(base64);
}

// In stopSession():
function stopSession() {
  // ... existing cleanup ...
  humeClient.disconnect();
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
```

#### Step 4: Display Emotion in Overlay

```typescript
// src/content/overlay.ts

// Add emotion badge to header
function createEmotionBadge(): HTMLElement {
  const badge = document.createElement('div');
  badge.className = 'emotion-badge';
  badge.innerHTML = `
    <span class="emotion-icon">😐</span>
    <span class="emotion-label">Neutral</span>
  `;
  return badge;
}

// Handle emotion updates
function handleEmotionUpdate(emotions: Array<{name: string; score: number}>) {
  if (!emotions.length) return;

  const dominant = emotions[0];
  const badge = document.querySelector('.emotion-badge');
  if (!badge) return;

  const icon = badge.querySelector('.emotion-icon');
  const label = badge.querySelector('.emotion-label');

  if (icon && label) {
    icon.textContent = getEmotionEmoji(dominant.name);
    label.textContent = dominant.name;
  }
}

function getEmotionEmoji(emotion: string): string {
  const emojiMap: Record<string, string> = {
    // Positive
    'Joy': '😊',
    'Amusement': '😄',
    'Excitement': '🤩',
    'Interest': '🤔',
    'Admiration': '🥰',
    'Satisfaction': '😌',
    'Calmness': '😌',

    // Negative
    'Frustration': '😤',
    'Anger': '😠',
    'Disappointment': '😞',
    'Sadness': '😢',
    'Anxiety': '😰',
    'Confusion': '😕',
    'Boredom': '😑',

    // Neutral/Complex
    'Concentration': '🧐',
    'Contemplation': '🤔',
    'Surprise (positive)': '😮',
    'Surprise (negative)': '😲',
  };

  return emojiMap[emotion] || '😐';
}
```

#### Step 5: CSS for Emotion Badge

```css
/* Add to overlay styles */
.emotion-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 12px;
  font-size: 12px;
  color: #fff;
  transition: all 0.3s ease;
}

.emotion-icon {
  font-size: 16px;
}

.emotion-label {
  font-weight: 500;
  text-transform: capitalize;
}

/* Emotion-specific colors */
.emotion-badge[data-sentiment="positive"] {
  background: rgba(34, 139, 34, 0.7);
}

.emotion-badge[data-sentiment="negative"] {
  background: rgba(220, 53, 69, 0.7);
}

.emotion-badge[data-sentiment="neutral"] {
  background: rgba(128, 128, 128, 0.7);
}
```

---

### Phase 3: Emotion-Aware Suggestions

**Effort**: 2-3 weeks
**Cost**: Same as Phase 2

Pass emotion context to Gemini for smarter suggestions.

```typescript
// src/services/gemini-client.ts

interface EmotionContext {
  dominantEmotion: string;
  score: number;
  trend: 'rising' | 'falling' | 'stable';
}

async function generateSuggestion(
  transcript: string,
  systemPrompt: string,
  kbContext: string,
  emotionContext?: EmotionContext  // NEW
): Promise<string> {

  let enhancedPrompt = systemPrompt;

  if (emotionContext) {
    enhancedPrompt += `\n\n## Current Emotional Context
The caller is currently expressing ${emotionContext.dominantEmotion} (confidence: ${(emotionContext.score * 100).toFixed(0)}%).
${getEmotionGuidance(emotionContext.dominantEmotion)}`;
  }

  // ... existing Gemini call ...
}

function getEmotionGuidance(emotion: string): string {
  const guidance: Record<string, string> = {
    'Frustration': 'Acknowledge their frustration. Use empathetic language. Offer concrete solutions.',
    'Confusion': 'Clarify the previous point. Use simpler language. Ask if they have questions.',
    'Interest': 'They are engaged! Expand on this topic. Share more details.',
    'Boredom': 'They may be losing interest. Try a different angle or ask an engaging question.',
    'Anxiety': 'Be reassuring. Address concerns directly. Provide concrete next steps.',
    'Excitement': 'Match their energy! This is a good moment to advance the conversation.',
  };

  return guidance[emotion] || 'Continue with normal approach.';
}
```

---

## Configuration UI

### Options Page Addition

```html
<!-- Add to api-keys section in options.html -->
<div class="api-key-group">
  <h4>Hume AI (Emotion Detection)</h4>
  <p class="description">Optional. Enables real-time emotion detection during calls.</p>

  <label for="hume-api-key">API Key</label>
  <input type="password" id="hume-api-key" placeholder="Enter Hume API key">

  <label for="hume-secret-key">Secret Key</label>
  <input type="password" id="hume-secret-key" placeholder="Enter Hume Secret key">

  <a href="https://app.hume.ai/keys" target="_blank" class="get-key-link">
    Get Hume API keys →
  </a>
</div>
```

---

## Error Handling

### Connection Failures

```typescript
class HumeClient {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  private async handleDisconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Hume] Max reconnection attempts reached');
      this.notifyUser('Emotion detection unavailable');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff

    console.log(`[Hume] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.connect(this.apiKey, this.secretKey);
      this.reconnectAttempts = 0;
    } catch (error) {
      await this.handleDisconnect();
    }
  }
}
```

### Credit Exhaustion

```typescript
private handleMessage(data: HumeResponse): void {
  if (data.error) {
    if (data.error.code === 'E0300' || data.error.code === 'E0301') {
      // Credits exhausted
      this.notifyUser('Hume credits exhausted. Emotion detection disabled.');
      this.disconnect();
      return;
    }
    // ... other error handling
  }
}
```

---

## Testing

### Unit Test for Hume Client

```typescript
// tests/hume-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('HumeClient', () => {
  beforeEach(() => {
    global.WebSocket = vi.fn().mockImplementation(() => ({
      send: vi.fn(),
      close: vi.fn(),
      readyState: WebSocket.OPEN
    }));
  });

  it('sends audio as base64', async () => {
    const client = new HumeClient();
    await client.connect('test-key', 'test-secret');

    const audioData = new ArrayBuffer(100);
    client.sendAudio(btoa(String.fromCharCode(...new Uint8Array(audioData))));

    expect(global.WebSocket.mock.results[0].value.send).toHaveBeenCalled();
  });

  it('extracts top emotions from response', () => {
    const emotions = [
      { name: 'Joy', score: 0.8 },
      { name: 'Interest', score: 0.6 },
      { name: 'Boredom', score: 0.1 }
    ];

    const top = client.getTopEmotions(emotions, 2);
    expect(top).toHaveLength(2);
    expect(top[0].name).toBe('Joy');
  });
});
```

### Manual Testing Checklist

1. **API Key Validation**
   - [ ] Valid keys → connection succeeds
   - [ ] Invalid keys → user-friendly error
   - [ ] Missing keys → Hume disabled gracefully

2. **Real-Time Emotion**
   - [ ] Emotion badge updates during speech
   - [ ] Badge shows relevant emoji
   - [ ] No updates during silence

3. **Error Recovery**
   - [ ] Disconnect → automatic reconnect
   - [ ] Token expiry → auto-refresh
   - [ ] Credits exhausted → graceful fallback

4. **Performance**
   - [ ] No noticeable latency impact on transcription
   - [ ] CPU usage acceptable with dual WebSockets

---

## Cost Estimation

### Per-Call Costs

| Call Duration | Deepgram | Hume | Total Additional |
|---------------|----------|------|------------------|
| 15 min | $0.15 | $0.96 | +$0.96 |
| 30 min | $0.30 | $1.92 | +$1.92 |
| 60 min | $0.60 | $3.84 | +$3.84 |

### Monthly Estimates (100 calls × 30 min avg)

| Component | Cost |
|-----------|------|
| Deepgram (existing) | ~$30 |
| Hume AI (new) | ~$192 |
| **Total** | ~$222/month |

---

## Feature Flags

Consider making Hume optional via feature flag:

```typescript
// Check if emotion detection is enabled
const { emotionDetectionEnabled } = await chrome.storage.local.get('emotionDetectionEnabled');

if (emotionDetectionEnabled && humeApiKey && humeSecretKey) {
  await humeClient.connect(humeApiKey, humeSecretKey);
}
```

This allows users to:
- Enable/disable emotion detection
- Control costs
- Test without Hume keys

---

## References

- [Hume TypeScript SDK](https://github.com/HumeAI/hume-typescript-sdk)
- [Hume Chrome Extension Example](https://github.com/HumeAI/hume-chrome-extension)
- [Expression Measurement WebSocket Docs](https://dev.hume.ai/docs/expression-measurement/websocket)
- [Authentication Guide](https://dev.hume.ai/docs/introduction/api-key)
