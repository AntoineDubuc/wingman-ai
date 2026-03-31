<p align="center">
  <img src="docs/images/hero-banner.png" alt="Wingman AI — Your AI Co-Pilot for Google Meet" width="100%">
</p>

<h3 align="center">Real-time AI suggestions, live transcription, and emotion detection — right inside Google Meet.</h3>

<p align="center">
  <a href="https://antoinedubuc.github.io/wingman-ai/">Landing Page</a> &bull;
  <a href="#-features">Features</a> &bull;
  <a href="#-get-started-in-5-minutes">Get Started</a> &bull;
  <a href="#-how-it-works">How It Works</a> &bull;
  <a href="docs/GETTING-STARTED.md">Docs</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Extension-orange?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/BYOK-Bring%20Your%20Own%20Keys-green?style=for-the-badge" alt="BYOK">
  <img src="https://img.shields.io/badge/No%20Backend-100%25%20Private-brightgreen?style=for-the-badge" alt="No Backend">
  <img src="https://img.shields.io/badge/$0.65-Per%20Hour-blue?style=for-the-badge" alt="Cost">
</p>

---

You're on a sales call. The prospect throws a curveball. You freeze.

**What if you had an expert whispering exactly what to say?**

Wingman AI sits invisibly in your Google Meet calls and delivers real-time suggestions, powered by your own documents, your own AI personas, and live emotion detection. No server. No subscription. No data ever leaves your browser.

---

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 🎯 Live AI Suggestions

As the conversation flows, Wingman analyzes what's being said and delivers contextual response cards in real-time. It knows when to speak up — and when to stay silent.

Upload your sales decks, pricing sheets, and battlecards. Wingman searches them semantically during calls and surfaces the exact talking point you need.

</td>
<td width="50%" valign="top">

### 🎭 Multi-Persona System

Switch between expert personas mid-call: Discovery Coach, Sales Closer, Technical Expert, Objection Handler. Each has its own prompt and knowledge base.

<img src="docs/images/persona-editor.png" alt="Persona Editor" width="100%">

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🧠 Conclave Mode

Activate up to **5 personas simultaneously**. Get suggestions from multiple expert perspectives at once — each attributed with a color-coded dot so you know who's talking.

Save team presets for different call types: Sales Team, Enterprise Deal, Discovery Only.

<img src="docs/images/conclave.png" alt="Conclave Mode" width="100%">

</td>
<td width="50%" valign="top">

### 😤 Emotion Detection

Powered by Hume AI, Wingman reads vocal prosody to detect emotional states in real-time: **engaged**, **frustrated**, **thinking**, or **neutral**.

The overlay badge updates live so you can adjust your approach before it's too late.

<img src="docs/images/overlay-emotions.png" alt="Emotion Detection" width="100%">

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 📋 Call Summaries → Google Drive

When the call ends, Wingman auto-generates a structured summary: key discussion points, action items, and follow-ups. One click saves it as a native Google Doc.

<img src="docs/images/call-summary.png" alt="Call Summary" width="100%">

</td>
<td width="50%" valign="top">

### 💰 Real-Time Cost Tracking

See exactly what each call costs across all providers — live, as the call happens. No surprise bills. No hidden fees.

**~$0.65 per hour** with Deepgram + Gemini. Compare that to $100+/month for competing products with worse privacy.

</td>
</tr>
</table>

---

## 🔒 Privacy First — BYOK Architecture

> **Bring Your Own Keys.** No backend. No middleman. No data collection. Period.

Your audio, transcripts, and API keys never touch a server we control. The extension talks directly to your AI providers from your browser. You own your data completely.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          YOUR BROWSER                               │
│                                                                     │
│   Google Meet  ◄────  Chrome Extension (Overlay + Audio Capture)    │
└─────────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
     ┌───────────┐     ┌───────────┐     ┌───────────┐
     │ Deepgram  │     │  Gemini   │     │  Hume AI  │
     │  Nova-3   │     │ 2.5 Flash │     │ Emotions  │
     │(Your Key) │     │(Your Key) │     │(Your Key) │
     └───────────┘     └───────────┘     └───────────┘
      Speech→Text      Text→Suggestions  Audio→Emotions
```

<details>
<summary><strong>🔌 Multi-Provider Support</strong> — Not locked into one AI provider</summary>

<br>

Choose the AI provider that works for you and switch anytime:

- **Google Gemini** — Gemini 2.5 Flash, 2.5 Pro (15s suggestion cooldown)
- **OpenRouter** — Claude 3.5 Sonnet, GPT-4o, Llama 3.3 70B (10s cooldown)
- **Groq** — Mixtral 8x7B, Llama 3.1 70B (5s cooldown, blazing fast)

</details>

---

## 🚀 Get Started in 5 Minutes

**Step 1 →** Get free API keys

| Service | Free Tier |
|---------|-----------|
| [Deepgram](https://console.deepgram.com/) (speech-to-text) | $200 credit (~100 hours) |
| [Google Gemini](https://aistudio.google.com/apikey) (AI suggestions) | 1,500 requests/day |
| [Hume AI](https://platform.hume.ai/) (emotions, optional) | Free tier available |

**Step 2 →** Clone, install, build

```bash
git clone https://github.com/AntoineDubuc/wingman-ai.git
cd wingman-ai/wingman-ai/extension
npm install && npm run build
```

**Step 3 →** Load in Chrome

Open `chrome://extensions/` → Enable **Developer mode** → **Load unpacked** → select `extension/dist`

**Step 4 →** Configure and go

<p align="center">
  <img src="docs/images/popup.png" alt="Wingman Popup" width="350">
</p>

Click the Wingman icon → **Options** → paste your API keys → pick a persona → join a Google Meet → **Start Session**. That's it.

---

## 🛠 Development

```bash
cd wingman-ai/extension

npm run dev            # Watch mode — rebuilds on save
npm run build          # Production build
npm test               # Unit tests (Vitest)
npm run typecheck      # TypeScript strict check
npm run lint           # ESLint
```

<details>
<summary><strong>📖 Engineering Documentation</strong></summary>

<br>

- [Getting Started](docs/GETTING-STARTED.md) — Setup and onboarding
- [File Structure](docs/FILE-STRUCTURE-MAP.md) — What each file does
- [Code Patterns](docs/CODE-PATTERNS.md) — Copy-paste patterns
- [Architecture](docs/diagrams/ARCHITECTURE.md) — System diagrams
- [Flow Diagrams](docs/flows/) — End-to-end feature traces

**Built with:** TypeScript (strict) · Chrome Manifest V3 · Vite · Deepgram Nova-3 · Google Gemini · Hume AI · IndexedDB · Google Drive API

</details>

---

<p align="center">
  <strong>Stop winging it. Start winning.</strong>
  <br><br>
  <a href="https://antoinedubuc.github.io/wingman-ai/">
    <img src="https://img.shields.io/badge/View%20Landing%20Page-E67E22?style=for-the-badge" alt="Landing Page">
  </a>
</p>

<p align="center">
  <sub>Copyright © 2025-2026 Antoine Dubuc / AI Entourage, Inc. All rights reserved.</sub>
</p>
