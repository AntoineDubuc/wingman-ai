# Live Sentiment Analysis — Integration Specification

> How real-time emotion detection will work in Wingman AI, and how to display it.
>
> **See also**: [`RESOURCES-AND-EXAMPLES.md`](./RESOURCES-AND-EXAMPLES.md) for documentation links and code samples.

---

## Part 1: Technical Architecture

### Current Audio Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CURRENT ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐           │
│  │ Mic Capture  │        │ Tab Capture  │        │   Offscreen  │           │
│  │ (Content)    │        │ (Offscreen)  │        │   Document   │           │
│  └──────┬───────┘        └──────┬───────┘        └──────────────┘           │
│         │                       │                                            │
│         │    AUDIO_CHUNK        │    AUDIO_CHUNK                            │
│         │    (ArrayBuffer)      │    (ArrayBuffer)                          │
│         └───────────┬───────────┘                                           │
│                     │                                                        │
│                     ▼                                                        │
│         ┌──────────────────────┐                                            │
│         │   Service Worker     │                                            │
│         │                      │                                            │
│         │  deepgramClient      │                                            │
│         │    .sendAudio()      │                                            │
│         └──────────┬───────────┘                                            │
│                    │                                                         │
│                    ▼                                                         │
│         ┌──────────────────────┐                                            │
│         │  Deepgram WebSocket  │                                            │
│         │  (Transcription)     │                                            │
│         └──────────┬───────────┘                                            │
│                    │                                                         │
│                    │  transcript                                            │
│                    ▼                                                         │
│         ┌──────────────────────┐        ┌──────────────────────┐           │
│         │   Gemini API         │───────▶│   Content Script     │           │
│         │   (Suggestions)      │        │   (Overlay)          │           │
│         └──────────────────────┘        └──────────────────────┘           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Audio Format (Current)

| Property | Value | Location |
|----------|-------|----------|
| Encoding | Linear16 (PCM) | `DEEPGRAM_PARAMS.encoding` |
| Sample Rate | 16000 Hz | `DEEPGRAM_PARAMS.sample_rate` |
| Channels | 2 (stereo) | `DEEPGRAM_PARAMS.channels` |
| Bit Depth | 16-bit | Implied by linear16 |

---

### Proposed Architecture with Hume AI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PROPOSED ARCHITECTURE (WITH HUME)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐        ┌──────────────┐                                   │
│  │ Mic Capture  │        │ Tab Capture  │                                   │
│  │ (Content)    │        │ (Offscreen)  │                                   │
│  └──────┬───────┘        └──────┬───────┘                                   │
│         │                       │                                            │
│         └───────────┬───────────┘                                           │
│                     │                                                        │
│                     │  AUDIO_CHUNK (ArrayBuffer)                            │
│                     ▼                                                        │
│         ┌──────────────────────────────────────────┐                        │
│         │            Service Worker                 │                        │
│         │                                           │                        │
│         │   ┌─────────────────┐  ┌──────────────┐  │                        │
│         │   │ deepgramClient  │  │  humeClient  │  │                        │
│         │   │  .sendAudio()   │  │ .sendAudio() │  │                        │
│         │   └────────┬────────┘  └──────┬───────┘  │                        │
│         └────────────┼──────────────────┼──────────┘                        │
│                      │                  │                                    │
│           ┌──────────┘                  └──────────┐                        │
│           ▼                                        ▼                        │
│  ┌──────────────────┐                   ┌──────────────────┐                │
│  │ Deepgram WS      │                   │ Hume AI WS       │                │
│  │ (Transcription)  │                   │ (Emotions)       │                │
│  │                  │                   │                  │                │
│  │ Returns:         │                   │ Returns:         │                │
│  │ - text           │                   │ - 48 emotion     │                │
│  │ - speaker        │                   │   scores         │                │
│  │ - timing         │                   │ - timing         │                │
│  └────────┬─────────┘                   └────────┬─────────┘                │
│           │                                      │                          │
│           │  type: 'transcript'                  │  type: 'emotion_update'  │
│           │  data: { text, speaker }             │  data: { emotions[] }    │
│           │                                      │                          │
│           └──────────────┬───────────────────────┘                          │
│                          │                                                   │
│                          ▼                                                   │
│              ┌──────────────────────┐                                       │
│              │   Content Script     │                                       │
│              │   (Overlay)          │                                       │
│              │                      │                                       │
│              │ - Display transcript │                                       │
│              │ - Display emotion    │                                       │
│              │ - Display suggestion │                                       │
│              └──────────────────────┘                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Key Technical Decisions

#### 1. Audio Format Compatibility

**Hume requires**: Base64-encoded audio, max 5 seconds per message
**We have**: ArrayBuffer of linear16 PCM

**Solution**: Convert ArrayBuffer to Base64 in service worker before sending to Hume.

```typescript
// In service-worker.ts
function handleAudioChunk(audioData: ArrayBuffer) {
  // Existing: send raw to Deepgram
  deepgramClient.sendAudio(audioData);

  // NEW: convert to base64 for Hume
  if (humeEnabled) {
    const base64 = arrayBufferToBase64(audioData);
    humeClient.sendAudio(base64);
  }
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

#### 2. Sample Rate Mismatch

**Deepgram**: 16000 Hz (what we send)
**Hume recommends**: 44100 Hz

**Options**:
| Option | Pros | Cons |
|--------|------|------|
| A. Send 16kHz to Hume | No changes needed | May reduce accuracy |
| B. Upsample to 44.1kHz | Better Hume accuracy | CPU overhead, complexity |
| C. Capture at 44.1kHz, downsample for Deepgram | Both get optimal format | More complex pipeline |

**Recommendation**: Start with **Option A** (send 16kHz). Hume accepts it, and we can optimize later if accuracy is insufficient.

#### 3. Two Concurrent WebSockets

The service worker will maintain two WebSocket connections:

| Connection | Purpose | Auth Method |
|------------|---------|-------------|
| Deepgram | Transcription | `Sec-WebSocket-Protocol` header |
| Hume | Emotion | Query param `?access_token=xxx` |

**Lifecycle**:
```
Session Start:
  1. deepgramClient.connect()
  2. humeClient.connect() (if keys configured)

Audio Chunk:
  1. deepgramClient.sendAudio(raw)
  2. humeClient.sendAudio(base64)

Session Stop:
  1. deepgramClient.disconnect()
  2. humeClient.disconnect()
```

#### 4. Message Types to Content Script

Add new message type for emotion updates:

```typescript
// Existing messages:
{ type: 'transcript', data: { text, speaker, is_final, is_self } }
{ type: 'suggestion', data: { text, type, personas } }

// NEW message:
{ type: 'emotion_update', data: {
  emotions: [
    { name: 'Frustration', score: 0.72 },
    { name: 'Interest', score: 0.45 },
    { name: 'Confusion', score: 0.38 }
  ],
  speaker: 'customer',  // Which audio channel
  timestamp: 1234567890
}}
```

#### 5. Token Refresh Strategy

Hume access tokens expire in 30 minutes. For a 1-hour call:

```typescript
class HumeClient {
  private tokenExpiry: number = 0;
  private refreshBuffer = 5 * 60 * 1000; // 5 min before expiry

  async ensureValidToken(): Promise<void> {
    if (Date.now() > this.tokenExpiry - this.refreshBuffer) {
      await this.refreshToken();
    }
  }

  // Call before each sendAudio
  async sendAudio(base64: string): Promise<void> {
    await this.ensureValidToken();
    // ... send audio
  }
}
```

---

## Part 2: Product — Displaying Emotions in the UI

### The Core Question

Hume returns **48 emotions with scores 0-1**. How do we show this to a salesperson mid-call without overwhelming them?

### Design Principles

1. **Glanceable** — One glance tells you the emotional state
2. **Non-intrusive** — Doesn't distract from the conversation
3. **Actionable** — Helps you know what to do next
4. **Contextual** — Tied to the conversation flow

---

### Option A: Header Emotion Badge (Recommended)

Add a small badge in the overlay header showing the **dominant emotion** of the customer.

```
┌──────────────────────────────────────────────────────────────────┐
│  ● Wingman  •••  Sales Expert      😤 Frustrated    ~$0.45  ─ □ ✕ │
│  ↑           ↑         ↑                  ↑            ↑          │
│ Status   Persona    Persona           EMOTION       Cost         │
│ dot      dots       label             BADGE         ticker       │
└──────────────────────────────────────────────────────────────────┘
```

**Visual States**:

| Customer Emotion | Badge | Background | Meaning |
|------------------|-------|------------|---------|
| Positive (joy, interest, excitement) | 😊 Engaged | Green tint | Keep doing what you're doing |
| Neutral (calm, concentration) | 😐 Neutral | Gray | Normal state |
| Negative (frustration, confusion, boredom) | 😤 Frustrated | Red/orange tint | Adjust your approach |
| Thinking (contemplation, doubt) | 🤔 Thinking | Blue tint | Give them space to process |

**Implementation**:

```typescript
// Simplify 48 emotions to 4 states
function categorizeEmotion(emotions: Array<{name: string, score: number}>): EmotionState {
  // Get top 3 emotions
  const top = emotions.slice(0, 3);

  const positiveEmotions = ['Joy', 'Interest', 'Excitement', 'Amusement', 'Admiration', 'Satisfaction'];
  const negativeEmotions = ['Frustration', 'Anger', 'Disappointment', 'Boredom', 'Anxiety', 'Disgust'];
  const thinkingEmotions = ['Contemplation', 'Concentration', 'Doubt', 'Confusion'];

  // Score each category
  let positiveScore = 0, negativeScore = 0, thinkingScore = 0;

  for (const e of top) {
    if (positiveEmotions.includes(e.name)) positiveScore += e.score;
    if (negativeEmotions.includes(e.name)) negativeScore += e.score;
    if (thinkingEmotions.includes(e.name)) thinkingScore += e.score;
  }

  // Return dominant category
  const max = Math.max(positiveScore, negativeScore, thinkingScore);
  if (max < 0.3) return 'neutral';
  if (positiveScore === max) return 'positive';
  if (negativeScore === max) return 'negative';
  return 'thinking';
}
```

**Pros**:
- Always visible
- Doesn't add clutter to transcript
- Single glance tells you the state

**Cons**:
- Loses granularity of 48 emotions
- Only shows current state (no history)

---

### Option B: Per-Bubble Emotion Indicator

Show a small emotion tag on each transcript bubble from the customer.

```
┌──────────────────────────────────────────────────────────────────┐
│  Customer                                           😤 frustrated │
│  "I've already tried that three times and it                     │
│   still doesn't work. This is really frustrating."               │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  You                                                              │
│  "I completely understand. Let me walk you through               │
│   a different approach that should solve this."                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  Customer                                           🤔 interested │
│  "Okay, that sounds good. What do I need to do?"                 │
└──────────────────────────────────────────────────────────────────┘
```

**Emotion → Emoji + Label Mapping**:

```typescript
const emotionDisplay: Record<string, { emoji: string; label: string; color: string }> = {
  // Positive
  'Joy': { emoji: '😊', label: 'happy', color: '#22c55e' },
  'Interest': { emoji: '🤔', label: 'interested', color: '#3b82f6' },
  'Excitement': { emoji: '🤩', label: 'excited', color: '#22c55e' },
  'Amusement': { emoji: '😄', label: 'amused', color: '#22c55e' },
  'Admiration': { emoji: '🥰', label: 'impressed', color: '#22c55e' },

  // Negative
  'Frustration': { emoji: '😤', label: 'frustrated', color: '#ef4444' },
  'Anger': { emoji: '😠', label: 'angry', color: '#ef4444' },
  'Disappointment': { emoji: '😞', label: 'disappointed', color: '#f97316' },
  'Confusion': { emoji: '😕', label: 'confused', color: '#f97316' },
  'Boredom': { emoji: '😑', label: 'bored', color: '#f97316' },
  'Anxiety': { emoji: '😰', label: 'anxious', color: '#f97316' },

  // Thinking
  'Contemplation': { emoji: '🤔', label: 'thinking', color: '#3b82f6' },
  'Concentration': { emoji: '🧐', label: 'focused', color: '#3b82f6' },
  'Doubt': { emoji: '🤨', label: 'skeptical', color: '#f97316' },
};
```

**Pros**:
- Shows emotion history over time
- Can see how emotions change during conversation
- More granular than header badge

**Cons**:
- More visual clutter
- Need to sync emotion timing with transcript timing

---

### Option C: Emotion Timeline (Side Panel)

A dedicated mini-timeline showing emotion changes alongside the conversation.

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ● Wingman  Sales Expert                                        ~$0.45  ─ □ ✕│
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌─────────────────────────────────────┬──────────────────────────────────┐│
│  │  CONVERSATION                       │  CUSTOMER EMOTION                ││
│  │                                     │                                  ││
│  │  Customer: "I've tried that..."     │  ▓▓▓▓▓▓▓▓░░  Frustrated (72%)   ││
│  │                                     │  ▓▓▓▓░░░░░░  Disappointed (45%) ││
│  │                                     │                                  ││
│  │  You: "Let me show you..."          │                                  ││
│  │                                     │                                  ││
│  │  Customer: "Okay, that sounds..."   │  ▓▓▓▓▓▓░░░░  Interested (62%)   ││
│  │                                     │  ▓▓▓░░░░░░░  Hopeful (35%)      ││
│  │                                     │                                  ││
│  └─────────────────────────────────────┴──────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────┘
```

**Pros**:
- Rich detail for post-call analysis
- Shows multiple emotions per utterance
- Clear visual pattern over time

**Cons**:
- Takes significant screen space
- May be overwhelming during live call
- Better suited for post-call review

---

### Recommended Approach: Hybrid

**Live During Call**: Option A (Header Badge)
- Simple, glanceable
- Shows current customer emotional state
- Color-coded for instant recognition

**On Each Transcript Bubble**: Subtle indicator (Option B light version)
- Small colored dot or underline
- Hover/tap to see full emotion breakdown
- Doesn't clutter the timeline

**Post-Call Summary**: Include emotion timeline
- Show emotional arc of the conversation
- Highlight moments of frustration/excitement
- Include in call summary export

---

### UI Mockup: Header Badge

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  ● Wingman  ••• Sales Expert    ┌─────────────┐    ~$0.45   ─ □ ✕  │  │
│  │                                 │ 😤 Frustrated │                   │  │
│  │                                 └─────────────┘                    │  │
│  ├────────────────────────────────────────────────────────────────────┤  │
│  │                                                                    │  │
│  │   Customer                                                         │  │
│  │   "I've already tried three different solutions and nothing       │  │
│  │    is working. This is really frustrating for us."                │  │
│  │                                                                    │  │
│  │   ┌────────────────────────────────────────────────────────────┐  │  │
│  │   │  💡 SUGGESTION                                    Sales     │  │  │
│  │   │                                                             │  │  │
│  │   │  "I hear you - that's frustrating. Let me show you a       │  │  │
│  │   │   different approach that's worked well for similar        │  │  │
│  │   │   situations..."                                            │  │  │
│  │   │                                                    [Copy]   │  │  │
│  │   └────────────────────────────────────────────────────────────┘  │  │
│  │                                                                    │  │
│  │   You                                                              │  │
│  │   "I hear you, that sounds frustrating. Let me walk you          │  │
│  │    through something that should help..."                         │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

BADGE STATES:

┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ 😊 Engaged      │   │ 😐 Neutral      │   │ 😤 Frustrated   │   │ 🤔 Thinking     │
│ (green bg)      │   │ (gray bg)       │   │ (red/orange bg) │   │ (blue bg)       │
└─────────────────┘   └─────────────────┘   └─────────────────┘   └─────────────────┘
```

---

### CSS for Emotion Badge

```css
/* Emotion badge in header */
.emotion-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  transition: all 0.3s ease;
  margin-left: auto;
  margin-right: 8px;
}

.emotion-badge .emoji {
  font-size: 14px;
}

.emotion-badge .label {
  text-transform: capitalize;
}

/* Positive - green */
.emotion-badge[data-state="positive"] {
  background: rgba(34, 197, 94, 0.2);
  color: #16a34a;
}

/* Negative - red/orange */
.emotion-badge[data-state="negative"] {
  background: rgba(239, 68, 68, 0.2);
  color: #dc2626;
}

/* Thinking - blue */
.emotion-badge[data-state="thinking"] {
  background: rgba(59, 130, 246, 0.2);
  color: #2563eb;
}

/* Neutral - gray */
.emotion-badge[data-state="neutral"] {
  background: rgba(156, 163, 175, 0.2);
  color: #6b7280;
}

/* Dark mode adjustments */
.dark .emotion-badge[data-state="positive"] {
  background: rgba(34, 197, 94, 0.25);
  color: #4ade80;
}

.dark .emotion-badge[data-state="negative"] {
  background: rgba(239, 68, 68, 0.25);
  color: #f87171;
}

.dark .emotion-badge[data-state="thinking"] {
  background: rgba(59, 130, 246, 0.25);
  color: #60a5fa;
}

.dark .emotion-badge[data-state="neutral"] {
  background: rgba(156, 163, 175, 0.25);
  color: #9ca3af;
}

/* Pulse animation when emotion changes */
@keyframes emotionPulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}

.emotion-badge.changed {
  animation: emotionPulse 0.3s ease;
}
```

---

### Smoothing Emotion Updates

Raw Hume data updates every few hundred milliseconds. To avoid jittery UI:

```typescript
class EmotionSmoother {
  private history: Array<{ emotions: HumeEmotion[]; timestamp: number }> = [];
  private windowMs = 3000; // 3-second rolling window

  addReading(emotions: HumeEmotion[]): void {
    const now = Date.now();
    this.history.push({ emotions, timestamp: now });

    // Remove old readings
    this.history = this.history.filter(h => now - h.timestamp < this.windowMs);
  }

  getDominantEmotion(): { name: string; score: number } | null {
    if (this.history.length === 0) return null;

    // Average scores across window
    const scores = new Map<string, number[]>();

    for (const reading of this.history) {
      for (const e of reading.emotions) {
        if (!scores.has(e.name)) scores.set(e.name, []);
        scores.get(e.name)!.push(e.score);
      }
    }

    // Find emotion with highest average
    let maxName = '';
    let maxAvg = 0;

    for (const [name, scoreList] of scores) {
      const avg = scoreList.reduce((a, b) => a + b, 0) / scoreList.length;
      if (avg > maxAvg) {
        maxName = name;
        maxAvg = avg;
      }
    }

    return maxAvg > 0.25 ? { name: maxName, score: maxAvg } : null;
  }
}
```

---

### Edge Cases

| Scenario | Handling |
|----------|----------|
| **No emotion detected** | Show neutral badge or hide badge |
| **Multiple speakers** | Show customer emotion only (channel 0 from tab capture) |
| **Silence period** | Keep last emotion, fade after 10s of silence |
| **Hume connection fails** | Hide badge, continue without emotion |
| **Low confidence score** | Only show emotions with score > 0.25 |
| **Rapid changes** | Smooth with 3-second rolling window |

---

### Summary

**Technical Flow**:
1. Same audio chunk sent to both Deepgram and Hume (converted to base64 for Hume)
2. Two parallel WebSocket connections
3. New `emotion_update` message type to content script
4. Token refresh every 25 minutes

**UI Display**:
1. Header badge showing current customer emotion state
2. 4 simplified states: Positive, Negative, Thinking, Neutral
3. Emoji + label + color-coded background
4. 3-second smoothing to prevent jitter
5. Subtle pulse animation on state change

**Next Steps**:
1. Add Hume API keys to storage schema
2. Create `hume-client.ts` service
3. Modify `service-worker.ts` to send audio to both services
4. Add `emotion_update` message handler in `overlay.ts`
5. Add emotion badge to overlay header
6. Add CSS for badge states
