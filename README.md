<p align="center">
  <img src="docs/images/hero-banner.png" alt="Wingman AI — Your AI Co-Pilot for Google Meet" width="100%">
</p>

<p align="center">
  <strong>Real-time AI suggestions, live transcription, and emotion detection — right inside Google Meet.</strong>
</p>

<p align="center">
  <a href="https://antoinedubuc.github.io/wingman-ai/">Landing Page</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#getting-started">Get Started</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="docs/GETTING-STARTED.md">Full Docs</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Extension-orange?logo=googlechrome&logoColor=white" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/Manifest-V3-blue" alt="Manifest V3">
  <img src="https://img.shields.io/badge/TypeScript-Strict-blue?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/BYOK-Bring%20Your%20Own%20Keys-green" alt="BYOK">
  <img src="https://img.shields.io/badge/No%20Backend-100%25%20Client--Side-brightgreen" alt="No Backend">
</p>

---

## The Problem

You're on a sales call. The prospect throws an objection you weren't ready for. You fumble. The deal slips.

**Wingman AI sits in your Google Meet calls and feeds you exactly what to say, when to say it** — powered by your own documents, your own personas, and real-time emotion detection.

No server. No subscription. No data leaves your browser.

---

## Features

### Live AI Suggestions
As the conversation flows, Wingman analyzes what's being said and delivers contextual response cards in real-time. It knows when to speak up and when to stay silent.

### Knowledge Base
Upload your sales decks, pricing sheets, competitor battlecards — Wingman searches them semantically during calls and surfaces the exact talking point you need.

### Multi-Persona System
Switch between personas mid-call: Discovery Coach, Sales Closer, Technical Expert, Objection Handler. Each has its own system prompt and knowledge base.

<p align="center">
  <img src="docs/images/persona-editor.png" alt="Persona Editor" width="400">
</p>

### Conclave Mode
Activate up to 5 personas simultaneously. Get suggestions from multiple expert perspectives at once — each attributed with a color-coded dot.

<p align="center">
  <img src="docs/images/conclave.png" alt="Conclave Mode" width="400">
</p>

### Emotion Detection
Hume AI analyzes vocal prosody in real-time to detect emotional states: engaged, frustrated, thinking, or neutral. The overlay badge updates live so you can adjust your approach.

<p align="center">
  <img src="docs/images/overlay-emotions.png" alt="Emotion Detection in Overlay" width="500">
</p>

### Call Summaries
When the call ends, Wingman generates a structured summary with key discussion points, action items, and follow-ups — then auto-saves it to Google Drive.

<p align="center">
  <img src="docs/images/call-summary.png" alt="Call Summary" width="400">
</p>

### Real-Time Cost Tracking
See exactly what each call costs across all providers. No surprise bills.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                          YOUR BROWSER                               │
│                                                                     │
│   Google Meet ◄──── Chrome Extension (Overlay UI + Audio Capture)   │
└─────────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
    │  Deepgram   │   │   Gemini    │   │   Hume AI   │
    │  Nova-3     │   │  2.5 Flash  │   │  Emotions   │
    │ (Your Key)  │   │ (Your Key)  │   │ (Your Key)  │
    └─────────────┘   └─────────────┘   └─────────────┘
     Speech → Text     Text → Suggestions   Audio → Emotions
```

**100% client-side.** Your audio, transcripts, and API keys never touch a server. Everything runs in the Chrome extension.

---

## Getting Started

### 1. Get API Keys

| Service | Sign Up | Free Tier |
|---------|---------|-----------|
| **Deepgram** (speech-to-text) | [console.deepgram.com](https://console.deepgram.com/) | $200 credit (~100 hrs) |
| **Google Gemini** (AI suggestions) | [aistudio.google.com](https://aistudio.google.com/apikey) | 1,500 req/day free |
| **Hume AI** (emotions, optional) | [platform.hume.ai](https://platform.hume.ai/) | Free tier available |

### 2. Install

```bash
git clone https://github.com/AntoineDubuc/wingman-ai.git
cd wingman-ai/wingman-ai/extension
npm install && npm run build
```

### 3. Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `extension/dist` folder

### 4. Configure & Go

1. Click the Wingman icon → **Options**
2. Paste your API keys
3. Create or select a persona
4. Join a Google Meet call → **Start Session**

<p align="center">
  <img src="docs/images/popup.png" alt="Wingman Popup" width="350">
</p>

---

## Cost Per Call

| Service | Rate | 1-Hour Call |
|---------|------|-------------|
| Deepgram | ~$0.01/min | ~$0.60 |
| Gemini | per request | ~$0.05 |
| **Total** | | **~$0.65/hour** |

Compare that to $100+/month for competing products — with worse privacy.

---

## Multi-Provider Support

Not locked into one AI provider. Choose what works for you:

| Provider | Models | Cooldown |
|----------|--------|----------|
| **Google Gemini** | Gemini 2.5 Flash, 2.5 Pro | 15s |
| **OpenRouter** | Claude 3.5 Sonnet, GPT-4o, Llama 3.3 70B | 10s |
| **Groq** | Mixtral 8x7B, Llama 3.1 70B | 5s |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Extension | TypeScript (strict), Chrome Manifest V3, Vite |
| Speech-to-Text | Deepgram Nova-3 (WebSocket) |
| AI Suggestions | Gemini / OpenRouter / Groq (REST) |
| Emotion Detection | Hume AI Expression Measurement (WebSocket) |
| Knowledge Base | IndexedDB + Gemini Embeddings (768-dim) |
| Cloud Storage | Google Drive API (optional) |

---

## Development

```bash
cd wingman-ai/extension
npm run dev            # Watch mode
npm run build          # Production build
npm test               # Unit tests (Vitest)
npm run typecheck      # TypeScript check
npm run lint           # ESLint
```

See [`docs/`](docs/) for detailed engineering documentation:
- [Getting Started](docs/GETTING-STARTED.md) — Setup and onboarding
- [File Structure](docs/FILE-STRUCTURE-MAP.md) — What each file does
- [Code Patterns](docs/CODE-PATTERNS.md) — Copy-paste patterns
- [Architecture](docs/diagrams/ARCHITECTURE.md) — System diagrams

---

## License

Copyright (c) 2025-2026 Antoine Dubuc / AI Entourage, Inc. All rights reserved.
