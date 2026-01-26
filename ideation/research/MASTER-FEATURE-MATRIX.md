# Master Feature Matrix: Real-Time AI Meeting Assistants

**Date:** January 26, 2026
**Purpose:** Comprehensive comparison of open-source projects for real-time AI assistance during Google Meet (and other video call platforms)

---

## Executive Summary

This document consolidates research across 15+ open-source projects spanning four categories:
1. **Interview Copilots** - Real-time transcription + AI answer generation
2. **Meeting Platforms** - Full meeting transcription/summarization solutions
3. **Audio Capture Tools** - Browser-based audio capture building blocks

### Quick Recommendation Matrix

| Your Priority | Best Choice | Runner-Up |
|---------------|-------------|-----------|
| **Privacy-first (100% local)** | [Meetily](https://github.com/Zackriya-Solutions/meeting-minutes) | [ainoya/web-transcriptor-ai](https://github.com/ainoya/chrome-extension-web-transcriptor-ai) |
| **Feature-rich interview help** | [hariiprasad/interviewcopilot](https://github.com/hariiprasad/interviewcopilot) | [innovatorved/realtime-interview-copilot](https://github.com/innovatorved/realtime-interview-copilot) |
| **Lowest cost** | [innovatorved/realtime-interview-copilot](https://github.com/innovatorved/realtime-interview-copilot) (~$5/mo) | [pixelpump Chrome extension](https://github.com/pixelpump/Ai-Interview-Assistant-Chrome-Extension) (~$1-5/mo) |
| **Building custom solution** | [Vexa API](https://github.com/Vexa-ai/vexa) | [WhisperLive](https://github.com/collabora/WhisperLive) + custom LLM |
| **Enterprise/AWS** | [AWS Live Meeting Assistant](https://github.com/aws-samples/amazon-transcribe-live-meeting-assistant) | [Vexa (self-hosted)](https://github.com/Vexa-ai/vexa) |
| **Easiest setup** | [pixelpump Chrome extension](https://github.com/pixelpump/Ai-Interview-Assistant-Chrome-Extension) | [interview-copilot/Interview-Copilot](https://github.com/interview-copilot/Interview-Copilot) |
| **Most active development** | [Meetily](https://github.com/Zackriya-Solutions/meeting-minutes) (9.4k stars) | [Vexa](https://github.com/Vexa-ai/vexa) (1.6k stars) |

---

## All Project URLs (Quick Reference)

### Interview Copilots
| Project | GitHub URL |
|---------|------------|
| hariiprasad/interviewcopilot | https://github.com/hariiprasad/interviewcopilot |
| interview-copilot/Interview-Copilot | https://github.com/interview-copilot/Interview-Copilot |
| innovatorved/realtime-interview-copilot | https://github.com/innovatorved/realtime-interview-copilot |
| seven7-AI/conversation-copilot | https://github.com/seven7-AI/AI-real-time-conversation-copilot |
| pixelpump/Interview-Assistant | https://github.com/pixelpump/Ai-Interview-Assistant-Chrome-Extension |
| nonymous911/ai-interview-copilot | https://github.com/nonymous911/ai-interview-copilot |

### Meeting Platforms
| Project | GitHub URL |
|---------|------------|
| Meetily | https://github.com/Zackriya-Solutions/meeting-minutes |
| Vexa | https://github.com/Vexa-ai/vexa |
| AWS Live Meeting Assistant | https://github.com/aws-samples/amazon-transcribe-live-meeting-assistant |

### Audio Capture & Building Blocks
| Project | GitHub URL |
|---------|------------|
| whisper.cpp | https://github.com/ggml-org/whisper.cpp |
| transformers.js | https://github.com/huggingface/transformers.js |
| WhisperLive | https://github.com/collabora/WhisperLive |
| Whishper | https://github.com/pluja/whishper |
| ainoya/web-transcriptor-ai | https://github.com/ainoya/chrome-extension-web-transcriptor-ai |

---

## Complete Project Comparison

### Category 1: Interview Copilots (Answer Generation Focus)

| Project | Stars | License | Last Update | Transcription | AI Provider | Monthly Cost | Setup Complexity |
|---------|-------|---------|-------------|---------------|-------------|--------------|------------------|
| [hariiprasad/interviewcopilot](https://github.com/hariiprasad/interviewcopilot) | 25 | MIT | Jun 2025 | Azure Speech | OpenAI + Gemini | $10-15 | Moderate |
| [interview-copilot/Interview-Copilot](https://github.com/interview-copilot/Interview-Copilot) | 129 | Unspecified | Nov 2024 | Azure Speech | OpenAI | $10-12 | Low |
| [innovatorved/realtime-interview-copilot](https://github.com/innovatorved/realtime-interview-copilot) | 84 | Custom | Dec 2025 | Deepgram | Google Gemini | $5-6 | Moderate |
| [seven7-AI/conversation-copilot](https://github.com/seven7-AI/AI-real-time-conversation-copilot) | 13 | None | May 2025 | Replicate | Mistral | $20-50+ | High |
| [pixelpump/Interview-Assistant](https://github.com/pixelpump/Ai-Interview-Assistant-Chrome-Extension) | 41 | MIT | Dec 2025 | Web Speech API | OpenAI GPT-3.5 | $1-5 | Low |
| [nonymous911/ai-interview-copilot](https://github.com/nonymous911/ai-interview-copilot) | 14 | MIT | Jan 2026 | Deepgram | OpenAI | $5-66 | Medium |

### Category 2: Meeting Transcription Platforms

| Project | Stars | License | Last Update | Processing | Platforms | Enterprise Ready |
|---------|-------|---------|-------------|------------|-----------|------------------|
| [Meetily](https://github.com/Zackriya-Solutions/meeting-minutes) | **9,429** | MIT | Jan 2026 | 100% Local | Any (system audio) | PRO version |
| [Vexa](https://github.com/Vexa-ai/vexa) | 1,620 | Apache 2.0 | Jan 2026 | Self-hosted | Meet, Teams | Yes |
| [AWS LMA](https://github.com/aws-samples/amazon-transcribe-live-meeting-assistant) | 135 | MIT | Jan 2026 | AWS Cloud | Meet, Teams, Zoom, WebEx | Yes |

### Category 3: Audio Capture Building Blocks

| Project | Stars | License | Approach | LLM Integration |
|---------|-------|---------|----------|-----------------|
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | **46,200** | MIT | Local WASM | Medium |
| [transformers.js](https://github.com/huggingface/transformers.js) | 15,300 | Apache 2.0 | Local WebGPU | High |
| [WhisperLive](https://github.com/collabora/WhisperLive) | 3,800 | MIT | Self-hosted server | Very High |
| [Whishper](https://github.com/pluja/whishper) | 2,900 | AGPL-3.0 | Docker self-hosted | Very High |
| [ainoya/web-transcriptor-ai](https://github.com/ainoya/chrome-extension-web-transcriptor-ai) | 36 | MIT | Local browser | High |

---

## Detailed Feature Matrix

### Core Features Comparison

| Feature | hariiprasad | interview-copilot | innovatorved | Meetily | Vexa | AWS LMA |
|---------|-------------|-------------------|--------------|---------|------|---------|
| Real-time transcription | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| AI answer generation | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Speaker diarization | ❌ | ❌ | ❌ | Basic | ✅ | ✅ |
| Meeting summarization | ❌ | ❌ | ✅ | ✅ | Via API | ✅ |
| Action item extraction | ❌ | ❌ | ❌ | ✅ | Via API | ✅ |
| Translation | ❌ | ❌ | ❌ | Via LLM | 99 langs | 75+ langs |
| Recording storage | ❌ | ❌ | ❌ | Local | Yes | S3 |
| Cross-meeting search | ❌ | ❌ | ❌ | Local | ❌ | ✅ |
| PII redaction | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### User Interface Features

| Feature | hariiprasad | interview-copilot | innovatorved | pixelpump | Meetily | AWS LMA |
|---------|-------------|-------------------|--------------|-----------|---------|---------|
| Picture-in-Picture | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Floating assistant | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Side panel UI | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Keyboard shortcuts | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Code syntax highlighting | ✅ | Partial | ❌ | ❌ | ❌ | ❌ |
| Dark mode | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| PWA/Installable | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |
| Mobile support | Limited | ✅ | ✅ | ❌ | ❌ | ❌ |

### Platform Support

| Platform | hariiprasad | interview-copilot | innovatorved | pixelpump | Meetily | Vexa | AWS LMA |
|----------|-------------|-------------------|--------------|-----------|---------|------|---------|
| Google Meet | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Zoom | ✅ | ✅ | ✅ | ⚠️ Issues | ✅ | Coming | ✅ |
| MS Teams | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| WebEx | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Desktop apps | ❌ | ❌ | ❌ | ❌ | ✅ | N/A | ❌ |
| Any browser audio | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |

### Privacy & Data Handling

| Aspect | hariiprasad | interview-copilot | innovatorved | Meetily | Vexa | AWS LMA |
|--------|-------------|-------------------|--------------|---------|------|---------|
| **Processing location** | Cloud APIs | Cloud APIs | Cloud APIs | **100% Local** | Self-hosted option | Your AWS |
| Audio sent to | Azure | Azure | Deepgram | Nowhere | Your server | AWS Transcribe |
| AI queries sent to | OpenAI/Google | OpenAI | Google | Optional (Ollama) | Optional | AWS Bedrock |
| Data persistence | None | Browser | Local | Local SQLite | Your DB | S3/DynamoDB |
| Offline capable | ❌ | ❌ | Partial (PWA) | **✅** | ❌ | ❌ |
| HIPAA suitable | ❌ | ❌ | ❌ | **✅** | With self-host | With BAA |
| GDPR compliant | Depends | Depends | Depends | **By design** | With self-host | With config |

### Technical Requirements

| Requirement | hariiprasad | interview-copilot | innovatorved | Meetily | Vexa | AWS LMA |
|-------------|-------------|-------------------|--------------|---------|------|---------|
| Node.js version | 18+ | Any | 20+ | N/A | 18+ | N/A |
| GPU required | ❌ | ❌ | ❌ | Recommended | Optional | ❌ |
| Docker | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| AWS account | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| API keys needed | 3 | 2 | 2 | 0 (or 1 for cloud LLM) | Varies | AWS creds |
| Setup time | 15 min | 10 min | 15 min | 5 min | 5-60 min | 40 min |

---

## Cost Analysis

### Monthly Cost Estimates (10 hours/month usage)

| Project | Transcription | AI/LLM | Infrastructure | **Total** |
|---------|---------------|--------|----------------|-----------|
| [hariiprasad/interviewcopilot](https://github.com/hariiprasad/interviewcopilot) | $10 (Azure) | $2-5 | $0 | **$12-15** |
| [interview-copilot](https://github.com/interview-copilot/Interview-Copilot) | $10 (Azure) | $1-2 | $0 | **$11-12** |
| [innovatorved](https://github.com/innovatorved/realtime-interview-copilot) | $4.62 (Deepgram) | $0.50 | $0 | **$5-6** |
| [pixelpump Chrome ext](https://github.com/pixelpump/Ai-Interview-Assistant-Chrome-Extension) | $0 (Web Speech) | $1-5 | $0 | **$1-5** |
| [seven7-AI](https://github.com/seven7-AI/AI-real-time-conversation-copilot) | Variable | $5-10 | MinIO hosting | **$20-50+** |
| **[Meetily](https://github.com/Zackriya-Solutions/meeting-minutes)** | **$0** | **$0** (Ollama) | **$0** | **$0** |
| [Vexa (self-hosted)](https://github.com/Vexa-ai/vexa) | $0 | Varies | Server costs | **$20-100+** |
| [AWS LMA](https://github.com/aws-samples/amazon-transcribe-live-meeting-assistant) | ~$15 (Transcribe) | ~$5-20 (Bedrock) | ~$20+ (infra) | **$40-60+** |

### Free Tier Opportunities

| Service | Free Tier | Notes |
|---------|-----------|-------|
| Deepgram | **$200 credit** | ~750 hours transcription |
| Azure Speech | 5 hours/month | Ongoing |
| OpenAI | $5 credit | New accounts |
| Google Gemini | Generous free tier | Rate limited |
| AWS | 60 min/month (12 mo) | New accounts |

---

## Architecture Comparison

### Client-Only Solutions (Browser Extension)
```
┌─────────────┐    ┌────────────────┐    ┌─────────────┐
│ Tab Audio   │───►│ Chrome Ext     │───►│ Cloud APIs  │
│ (TabCapture)│    │ (Transcription)│    │ (LLM)       │
└─────────────┘    └────────────────┘    └─────────────┘
```
**Examples:** hariiprasad, interview-copilot, innovatorved, pixelpump

### Desktop App (Local Processing)
```
┌─────────────┐    ┌────────────────┐    ┌─────────────┐
│ System      │───►│ Desktop App    │───►│ Local LLM   │
│ Audio       │    │ (Whisper.cpp)  │    │ (Ollama)    │
└─────────────┘    └────────────────┘    └─────────────┘
```
**Example:** Meetily

### Bot-Based API
```
┌─────────────┐    ┌────────────────┐    ┌─────────────┐
│ Meeting     │◄───│ Bot joins      │───►│ Your Server │
│ Platform    │    │ meeting        │    │ (API)       │
└─────────────┘    └────────────────┘    └─────────────┘
```
**Example:** Vexa

### Cloud Infrastructure
```
┌─────────────┐    ┌────────────────┐    ┌─────────────┐
│ Browser Ext │───►│ AWS Services   │───►│ S3/DynamoDB │
│ (Capture)   │    │ (Transcribe+   │    │ (Storage)   │
│             │    │  Bedrock)      │    │             │
└─────────────┘    └────────────────┘    └─────────────┘
```
**Example:** AWS LMA

---

## Decision Framework

### Choose Interview Copilot Projects If:
- You need **AI-generated answers** during interviews
- Real-time response suggestions are critical
- You're comfortable with cloud API costs
- Technical interview code highlighting is needed

### Choose Meeting Platforms If:
- You need **meeting summaries and action items**
- Multi-meeting search/analytics matters
- Enterprise features (user management, compliance) are required
- Speaker identification is important

### Choose Audio Capture Building Blocks If:
- You want to **build a custom solution**
- Maximum flexibility in architecture
- You have specific privacy requirements
- Integration with existing systems is needed

---

## Recommended Stacks by Use Case

### 1. "I want a quick solution for my interviews"
**Stack:** [pixelpump Chrome extension](https://github.com/pixelpump/Ai-Interview-Assistant-Chrome-Extension) OR [interview-copilot/Interview-Copilot](https://github.com/interview-copilot/Interview-Copilot)
- 10-minute setup
- $1-12/month
- Works immediately

### 2. "I need maximum privacy"
**Stack:** [Meetily](https://github.com/Zackriya-Solutions/meeting-minutes) + Ollama (local LLM)
- 100% local processing
- $0/month
- No data leaves your machine
- Requires decent hardware

### 3. "I'm building a product/SaaS"
**Stack:** [Vexa API](https://github.com/Vexa-ai/vexa) + Custom LLM integration
- Bot-based (invisible to users)
- API-first design
- Self-hosted or cloud options
- Enterprise support available

### 4. "I need enterprise compliance"
**Stack:** [AWS LMA](https://github.com/aws-samples/amazon-transcribe-live-meeting-assistant) OR [Meetily PRO](https://github.com/Zackriya-Solutions/meeting-minutes)
- AWS: Full AWS compliance (SOC2, HIPAA with BAA)
- Meetily: Data sovereignty (nothing leaves premises)

### 5. "I want the best transcription accuracy"
**Stack:** Custom solution with [Deepgram](https://deepgram.com) Nova-3 + Claude
- Deepgram: 54% lower WER than competitors
- Claude: Best reasoning for context-aware responses
- Estimated: $15-25/month for moderate use

### 6. "I want to experiment/prototype"
**Stack:** Web Speech API + OpenAI
- Zero infrastructure
- Free transcription (browser built-in)
- Quick to implement
- Limited accuracy

---

## Gaps in Current Open Source Landscape

All surveyed projects lack at least some of these:

| Gap | Impact | Potential Solutions |
|-----|--------|---------------------|
| No true PiP overlay for AI answers | Must switch windows | Custom Electron app |
| Limited code interview support | Can't show IDE-like code | Integrate Monaco editor |
| No calendar integration | Manual meeting start | Google Calendar API |
| No mobile apps | Desktop only | React Native port |
| Single-language focus | English-centric | Add i18n |
| No collaborative features | Single user | Add WebRTC/sync |

---

## Project Health Scores

| Project | Activity | Community | Documentation | Maintenance | **Overall** |
|---------|----------|-----------|---------------|-------------|-------------|
| [Meetily](https://github.com/Zackriya-Solutions/meeting-minutes) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **A** |
| [Vexa](https://github.com/Vexa-ai/vexa) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **A-** |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **A+** |
| [WhisperLive](https://github.com/collabora/WhisperLive) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **B+** |
| [innovatorved](https://github.com/innovatorved/realtime-interview-copilot) | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | **B** |
| [hariiprasad](https://github.com/hariiprasad/interviewcopilot) | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | **B-** |
| [AWS LMA](https://github.com/aws-samples/amazon-transcribe-live-meeting-assistant) | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **B+** |
| [interview-copilot](https://github.com/interview-copilot/Interview-Copilot) | ⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐ | **C** |
| [pixelpump](https://github.com/pixelpump/Ai-Interview-Assistant-Chrome-Extension) | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | **C+** |
| [seven7-AI](https://github.com/seven7-AI/AI-real-time-conversation-copilot) | ⭐ | ⭐ | ⭐ | ⭐ | **D** |

---

## Appendix: All Research Documents

1. **[research-interview-copilots-1.md](./research-interview-copilots-1.md)** - hariiprasad, interview-copilot, innovatorved
2. **[research-interview-copilots-2.md](./research-interview-copilots-2.md)** - seven7-AI, pixelpump, nonymous911
3. **[research-meeting-platforms.md](./research-meeting-platforms.md)** - Vexa, Meetily, AWS LMA
4. **[research-audio-capture-tools.md](./research-audio-capture-tools.md)** - Chrome APIs, building blocks, DIY guide

---

## Quick Start Commands

### Meetily (Recommended for Privacy)
```bash
# Download from https://meetily.ai or GitHub releases
# macOS: Open DMG, drag to Applications
# Windows: Run installer
# That's it - no API keys needed!
```

### innovatorved/realtime-interview-copilot (Best Value)
```bash
git clone https://github.com/innovatorved/realtime-interview-copilot.git
cd realtime-interview-copilot
pnpm install
# Add to .env.local:
# DEEPGRAM_API_KEY=your_key (free $200 credit)
# GOOGLE_GENERATIVE_AI_API_KEY=your_key
pnpm dev
```

### hariiprasad/interviewcopilot (Most Features)
```bash
git clone https://github.com/hariiprasad/interviewcopilot.git
cd interviewcopilot
npm install
npm run dev
# Configure API keys in the UI settings
```

### pixelpump Chrome Extension (Easiest)
```bash
# 1. Download from GitHub releases
# 2. Go to chrome://extensions
# 3. Enable Developer mode
# 4. Load unpacked
# 5. Enter OpenAI API key
# Done!
```

---

*Report compiled January 26, 2026*
