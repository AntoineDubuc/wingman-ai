# Hume AI — Quick Reference Card

> One-page cheat sheet for developers.

---

## Endpoints

| Purpose | URL |
|---------|-----|
| **WebSocket** | `wss://api.hume.ai/v0/stream/models` |
| **REST** | `https://api.hume.ai/v0/` |
| **OAuth Token** | `POST https://api.hume.ai/oauth2-cc/token` |
| **API Keys Portal** | https://app.hume.ai/keys |

---

## Authentication

### Server-Side (API Key)
```typescript
// WebSocket
new WebSocket('wss://api.hume.ai/v0/stream/models?apiKey=YOUR_KEY');

// REST
headers: { 'X-Hume-Api-Key': 'YOUR_KEY' }
```

### Client-Side (Access Token)
```typescript
// Step 1: Get token (server-side)
const creds = btoa(`${API_KEY}:${SECRET_KEY}`);
fetch('https://api.hume.ai/oauth2-cc/token', {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${creds}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: 'grant_type=client_credentials'
});

// Step 2: Use token (client-side)
new WebSocket(`wss://api.hume.ai/v0/stream/models?access_token=${token}`);
```

**Token expires in 30 minutes.**

---

## Message Formats

### Send Audio
```json
{
  "models": { "prosody": {}, "burst": {} },
  "data": "<base64-encoded-audio>"
}
```

### Receive Emotions
```json
{
  "prosody": {
    "predictions": [{
      "time": { "begin": 0.0, "end": 2.5 },
      "emotions": [
        { "name": "Frustration", "score": 0.82 },
        { "name": "Anger", "score": 0.45 }
      ]
    }]
  }
}
```

---

## Audio Requirements

| Property | Value |
|----------|-------|
| Format | WebM (recommended) or Linear PCM |
| Encoding | Base64 |
| Max duration | 5,000ms per message |
| Recommended chunk | 100ms |
| Sample rate (PCM) | 44100 Hz |
| Channels | Mono (1) |
| Bit depth | 16-bit |

---

## Limits

| Limit | Value |
|-------|-------|
| Inactivity timeout | 60 seconds |
| Max session | 30 minutes |
| HTTP rate | 50 req/sec |
| Image size | 3000 × 3000 px |
| Text length | 10,000 chars |
| Audio/video | 5,000ms per message |

---

## Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| E0100 | Invalid JSON | Fix request format |
| E0201 | Base64 decode failed | Check encoding |
| E0202 | No audio | Verify audio data |
| E0203 | Audio > 5s | Split into chunks |
| E0300 | Out of credits | Add billing |
| E0714 | Inactivity timeout | Reconnect |
| W0105 | No speech | Normal (silence) |

---

## SDK Install

```bash
npm install hume
```

```typescript
import { HumeClient } from 'hume';
const client = new HumeClient({ apiKey: 'YOUR_KEY' });
```

---

## The 48 Emotions

**Positive**: Admiration, Adoration, Aesthetic Appreciation, Amusement, Awe, Calmness, Contentment, Excitement, Interest, Joy, Love, Pride, Relief, Romance, Satisfaction, Triumph

**Negative**: Anger, Anxiety, Awkwardness, Boredom, Confusion, Disappointment, Disgust, Distress, Doubt, Embarrassment, Envy, Fear, Guilt, Horror, Pain, Sadness, Shame

**Complex**: Concentration, Contemplation, Craving, Desire, Determination, Empathic Pain, Entrancement, Nostalgia, Realization, Surprise (positive), Surprise (negative), Sympathy, Tiredness

---

## Pricing Quick Look

| Usage | Prosody Cost |
|-------|-------------|
| 15 min call | $0.96 |
| 30 min call | $1.92 |
| 60 min call | $3.84 |
| 100 calls × 30 min | $192/month |

**Rate**: $0.0639/minute

---

## Useful Links

- Docs: https://dev.hume.ai/
- WebSocket: https://dev.hume.ai/docs/expression-measurement/websocket
- Errors: https://dev.hume.ai/docs/resources/errors
- SDK: https://github.com/HumeAI/hume-typescript-sdk
- Chrome Extension: https://github.com/HumeAI/hume-chrome-extension
