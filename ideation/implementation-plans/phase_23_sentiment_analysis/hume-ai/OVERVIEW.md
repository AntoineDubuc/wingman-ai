# Hume AI — Product Overview

> **TL;DR**: Hume AI is the only provider offering real-time, structured emotion data via WebSocket. They detect 48 distinct emotions from voice (not just positive/negative/neutral). Built on 10+ years of peer-reviewed research. ~300ms latency. Costs ~$0.06/min.

---

## Company Snapshot

| Attribute | Value |
|-----------|-------|
| **Founded** | March 2021 |
| **Headquarters** | New York, NY |
| **Funding** | $72.8M total (Series B, March 2024) |
| **Valuation** | Not disclosed |
| **Employees** | ~56 |
| **Customers** | 100K+ developers and businesses |
| **Key Investors** | EQT Ventures, Union Square Ventures |

**Founder**: Alan Cowen, PhD (Psychology, UC Berkeley). Former lead of Google AI's Affective Computing team. Published 40+ peer-reviewed papers with 3K+ citations.

**Notable Customers**: Toyota, Volkswagen, Northwell Health, OpenAI, SambaNova Systems

---

## Products

### 1. Expression Measurement API (What We Need)

Analyzes human expression from audio, video, or text. Returns structured emotion scores in real-time via WebSocket.

**Modalities**:
| Model | Input | Emotions | Use Case |
|-------|-------|----------|----------|
| **Speech Prosody** | Audio | 48 dimensions | Tone, rhythm, timbre of voice |
| **Vocal Burst** | Audio | 48 dimensions | Sighs, laughs, "hmm"s, hesitations |
| **Facial Expression** | Video/Image | 48 dimensions | Facial muscle movements (FACS 2.0) |
| **Emotional Language** | Text | 53 dimensions | Sentiment in transcribed words |

**For Wingman AI**: We'd use **Speech Prosody** + **Vocal Burst** models to analyze the audio stream in parallel with Deepgram transcription.

### 2. Empathic Voice Interface (EVI)

Full voice agent that understands and responds with emotion. NOT what we need — this would replace our entire pipeline.

### 3. Octave (Text-to-Speech)

Emotionally expressive TTS. Not relevant for Wingman.

---

## The 48 Emotions

Unlike competitors that only provide positive/negative/neutral, Hume detects **48 granular emotion dimensions**:

| Category | Emotions |
|----------|----------|
| **Positive High-Energy** | Amusement, Excitement, Joy, Triumph |
| **Positive Low-Energy** | Admiration, Adoration, Aesthetic Appreciation, Calmness, Contentment, Relief, Romance, Satisfaction |
| **Connection** | Empathic Pain, Interest, Love, Nostalgia, Sympathy |
| **Cognitive** | Awe, Concentration, Contemplation, Confusion, Doubt, Realization, Surprise (positive), Surprise (negative) |
| **Desire** | Craving, Desire, Determination, Entrancement |
| **Negative Low-Energy** | Boredom, Disappointment, Distress, Guilt, Sadness, Shame, Tiredness |
| **Negative High-Energy** | Anger, Anxiety, Awkwardness, Disgust, Embarrassment, Envy, Fear, Horror, Pain |
| **Complex** | Contempt, Pride |

**Why this matters for sales calls**:
- Detect **frustration** before the customer says they're frustrated
- Notice **confusion** to know when to clarify
- See **interest** spike when you hit the right pain point
- Catch **boredom** to know when to change approach

---

## What It CAN Do

- **Real-time streaming** via WebSocket (~300ms latency)
- **Parallel analysis** — runs alongside existing Deepgram transcription
- **Sentence-level emotion** — more stable than word-level
- **Multi-speaker** — works with meeting audio (multiple participants)
- **48 emotion dimensions** — far more granular than pos/neg/neutral
- **Vocal burst detection** — catches non-verbal cues (sighs, hesitations)
- **Browser-compatible** — WebSocket works in Chrome extensions
- **Token auth** — secure client-side implementation without exposing API keys
- **JSON response** — easy to parse and display

---

## What It CANNOT Do

| Limitation | Impact | Workaround |
|------------|--------|------------|
| **Not a transcription service** | Still need Deepgram for STT | Run both in parallel |
| **English is most accurate** | Other languages less reliable | Most sales calls are English |
| **Word-level scores unstable** | Can't show emotion per word | Use sentence-level (fine for us) |
| **Not 100% accurate** | ~36% in benchmarks vs images | Use for trends, not absolute truth |
| **Culture/gender variance** | May misread some groups | Acknowledge limitations to users |
| **5 second audio limit** | Per WebSocket message | Stream in 100ms chunks |
| **30-min access tokens** | Need refresh mechanism | Implement token refresh |
| **No offline mode** | Requires internet | Already true for Wingman |

---

## Accuracy & Scientific Validation

### Research Foundation

- **Publications**: 40+ peer-reviewed articles (Nature Human Behaviour, ACM, ICASSP)
- **Citations**: 3,000+
- **Training Data**: Millions of human interactions across 3 countries
- **Methodology**: Semantic space theory + Reinforcement Learning from Human Expression (RLHE)

### Benchmark Performance

| Metric | Value | Notes |
|--------|-------|-------|
| **Image emotion accuracy** | 36% | In 2026 benchmark (Imertiv: 40%, GPT-4: higher) |
| **Prosody stability** | High at sentence-level | Word-level is context-dependent |
| **Latency** | <300ms | Time to first byte |
| **Response time (EVI)** | ~1.2s | Full response generation |

### Key Caveat (From Hume)

> "Labels for each dimension are proxies for how people tend to label the underlying patterns of behavior and should **not be treated as direct inferences of emotional experience**."

Translation: The scores tell you how a typical human would *perceive* the emotion, not what the person is *actually feeling*.

---

## Competitive Position

| Competitor | Real-Time Streaming | Structured Output | Emotions | Latency |
|------------|--------------------|--------------------|----------|---------|
| **Hume AI** | Yes | Yes (48 dimensions) | 48 | ~300ms |
| **Deepgram** | No (batch only) | Yes (3 levels) | 3 | N/A |
| **AssemblyAI** | No (batch only) | Yes (3 levels) | 3 | N/A |
| **AWS Nova Sonic** | Yes | No (contextual) | N/A | <300ms |
| **OpenAI Realtime** | Yes | No (contextual) | N/A | <500ms |

**Hume is the only option** that provides both real-time streaming AND structured emotion data.

---

## Market Context

| Market | 2024 Value | 2030 Projection | CAGR |
|--------|------------|-----------------|------|
| Affective Computing | $42.9B | $388.3B | 30.6% |
| Voice Assistants | $4.9B | $25B (2035) | ~15% |

**Customer Success Story** (Vonova):
- 40% lower operational costs
- 20% higher resolution rates
- Using EVI for customer support

---

## Ethical Considerations

Hume founded **The Hume Initiative** to establish ethical guidelines for emotion AI:

1. Emotion data is sensitive — handle like biometric data
2. Never use for manipulation or deception
3. Users should know when emotion AI is active
4. Don't make high-stakes decisions on emotion scores alone

**Regulatory Risk**: Emotion/biometric data faces increasing regulation (GDPR, state laws). May need privacy disclosures.

---

## Links

| Resource | URL |
|----------|-----|
| **Main Site** | https://www.hume.ai/ |
| **Developer Docs** | https://dev.hume.ai/ |
| **Expression Measurement** | https://dev.hume.ai/docs/expression-measurement/overview |
| **WebSocket Streaming** | https://dev.hume.ai/docs/expression-measurement/websocket |
| **Pricing** | https://www.hume.ai/pricing |
| **API Keys Portal** | https://app.hume.ai/keys |
| **TypeScript SDK** | https://github.com/HumeAI/hume-typescript-sdk |
| **Chrome Extension Example** | https://github.com/HumeAI/hume-chrome-extension |
| **Research Papers** | https://www.hume.ai/research |
| **The Hume Initiative (Ethics)** | https://thehumeinitiative.org |

---

## Recommendation for Wingman AI

**Phase 1** (Low effort): Add Deepgram `sentiment=true` for post-call summaries. Zero additional cost.

**Phase 2** (Medium effort): Integrate Hume Expression Measurement API in parallel with Deepgram. Show simple emotion indicator in overlay. ~$0.06/min additional cost.

**Phase 3** (Higher effort): Pass emotion data to Gemini for emotion-aware suggestions. Same cost as Phase 2.
