# Open Source Interview Copilot Tools: Comprehensive Research Report

**Research Date:** January 26, 2026
**Prepared for:** Tammy - AI Solutions Consultant, Cloud Geometry

---

## Executive Summary

This report provides an in-depth analysis of three open-source interview copilot projects available on GitHub. These tools aim to assist candidates during technical interviews by providing real-time transcription and AI-generated response suggestions. Each tool takes a different approach to solving this problem, with varying tech stacks, features, and API dependencies.

---

## Table of Contents

1. [hariiprasad/interviewcopilot](#1-hariiprasadinterviewcopilot)
2. [interview-copilot/Interview-Copilot](#2-interview-copilotinterview-copilot)
3. [innovatorved/realtime-interview-copilot](#3-innovatorvedrealtime-interview-copilot)
4. [API Pricing Reference](#api-pricing-reference)
5. [Comparison Table](#comparison-table)
6. [Recommendations](#recommendations)
7. [Sources](#sources)

---

## 1. hariiprasad/interviewcopilot

**Repository:** [https://github.com/hariiprasad/interviewcopilot](https://github.com/hariiprasad/interviewcopilot)
**Demo:** [aicopilot.chat](https://aicopilot.chat) (requires JavaScript)

### GitHub Statistics

| Metric | Value |
|--------|-------|
| Stars | 25 |
| Forks | 10 |
| Last Commit | June 11, 2025 |
| License | MIT |
| Open Issues | 0 |
| Closed Issues | 0 |
| Primary Language | JavaScript (94.7%) |
| Other Languages | CSS (4.6%), Dockerfile (0.7%) |

### Description

This project describes itself as similar to "Final Round AI" (a commercial product) but open-source. It provides real-time transcription with AI-driven answer suggestions and interview simulation capabilities. The project is actively maintained with recent updates as of mid-2025.

### Full Tech Stack

**Frontend Framework:**
- Next.js 15.1.6
- React 19.0.0
- React DOM 19.0.0

**State Management:**
- Redux Toolkit 2.5.1
- React Redux 9.2.0

**UI Components:**
- Material-UI (MUI) 6.4.1
- MUI Icons 6.4.1
- Emotion (CSS-in-JS) 11.14.0

**AI/ML Services:**
- OpenAI SDK 4.80.1
- Google Generative AI SDK 0.23.0 (Gemini 2.5 Pro/Flash)
- Microsoft Cognitive Services Speech SDK 1.42.0

**Content Rendering:**
- React Markdown 9.0.3
- Highlight.js 11.11.1
- React Syntax Highlighter 15.6.1
- HTML2Canvas 1.4.1

**Utilities:**
- Lodash Throttle 4.1.1
- React Scroll to Bottom 4.2.0

### Features

| Feature | Supported | Notes |
|---------|-----------|-------|
| Real-time Transcription | Yes | Azure Cognitive Services |
| AI Response Suggestions | Yes | OpenAI GPT + Google Gemini |
| Picture-in-Picture (PiP) | Yes | Floating window for AI responses |
| Code Syntax Highlighting | Yes | Full syntax highlighting for technical interviews |
| Question History | Yes | Combine multiple questions for context |
| Silence Detection | Yes | Auto-submits speech after quiet periods |
| Custom System Prompts | Yes | Configurable AI behavior |
| Multiple AI Models | Yes | Switch between GPT and Gemini |
| Dark Mode | Unknown | Not explicitly mentioned |

### Installation Requirements

**System Requirements:**
- Node.js v18+
- npm v9+

**API Keys Required:**
1. OpenAI API Key (from [platform.openai.com](https://platform.openai.com))
2. Google AI Studio API Key (for Gemini models)
3. Microsoft Azure Speech Services Key

**Installation Steps:**
```bash
git clone https://github.com/hariiprasad/interviewcopilot.git
cd interviewcopilot
npm install
# Configure API keys in settings
npm run dev
# Access at localhost:3000
```

**Installation Complexity:** Moderate - Requires setting up 3 different API services

### Supported Platforms

- **Meeting Platforms:** Platform-agnostic (browser-based overlay)
- **Devices:** Web browsers on desktop/laptop
- **Operating Systems:** Cross-platform (Windows, macOS, Linux)

### Privacy Model

| Aspect | Details |
|--------|---------|
| Architecture | Client-side with API calls |
| Audio Processing | Sent to Azure Speech Services |
| AI Processing | Sent to OpenAI/Google APIs |
| Local Storage | Settings and API keys stored locally |
| Data Retention | Depends on API provider policies |

**Privacy Concerns:**
- Audio is sent to Microsoft Azure for transcription
- Transcribed text sent to OpenAI or Google for AI processing
- No explicit data deletion policy mentioned

### API Dependencies and Costs

| API Service | Purpose | Estimated Cost |
|-------------|---------|----------------|
| Azure Speech Services | Real-time transcription | $0.0167/min (real-time) or $0.006/min (batch) |
| OpenAI GPT-4o | AI responses | $2.50-5.00/1M input tokens, $10-15/1M output tokens |
| Google Gemini 2.5 | AI responses | $1.25/1M input, $10/1M output (Pro) |

**Monthly Cost Estimate (moderate use):**
- 10 hours of interview practice
- ~600 minutes transcription: ~$10 (Azure)
- ~50K tokens AI processing: ~$0.50-2.00
- **Total: ~$10-15/month**

### Limitations and Known Issues

- No open or closed issues in the repository (limited community feedback)
- Demo site requires JavaScript (no progressive enhancement)
- Dependent on three external API services
- No offline functionality
- Single contributor (limited bus factor)

### Community Activity

- **Contributors:** 1 (hariiprasad)
- **Recent Activity:** Active (last commit June 2025)
- **Documentation:** Comprehensive README
- **Release Strategy:** No formal releases, direct main branch updates

---

## 2. interview-copilot/Interview-Copilot

**Repository:** [https://github.com/interview-copilot/Interview-Copilot](https://github.com/interview-copilot/Interview-Copilot)
**Demo:** [interview-copilot.github.io](https://interview-copilot.github.io)

### GitHub Statistics

| Metric | Value |
|--------|-------|
| Stars | 129 |
| Forks | 34 |
| Last Commit | November 30, 2024 |
| License | Not specified |
| Open Issues | 2 |
| Closed Issues | 0 |
| Primary Language | Vue (84.8%) |
| Other Languages | JavaScript (11.3%), HTML (3.9%) |

### Description

Interview Copilot is positioned as a cross-platform alternative to similar tools like Cheetah and Ecoute, emphasizing its ability to work on any device without installation. It uses a serverless architecture with API tokens stored locally in the browser.

### Full Tech Stack

**Frontend Framework:**
- Vue.js 2.6.14
- Vue Router 3.5.1
- Vuex 3.6.2

**UI Components:**
- Element UI 2.15.14

**AI/ML Services:**
- OpenAI SDK 4.20.1
- Microsoft Cognitive Services Speech SDK 1.33.1

**Content Rendering:**
- Marked 10.0.0
- Markdown-it 13.0.2

**Utilities:**
- Axios 1.6.2
- MongoDB 6.3.0 (though unclear if actively used)
- Crypto-js 4.2.0
- Moment.js 2.29.4
- Universal Cookie 6.1.1

**Build Tools:**
- Vue CLI 5.0.0
- Babel

### Features

| Feature | Supported | Notes |
|---------|-----------|-------|
| Real-time Transcription | Yes | Azure Speech Services |
| AI Response Suggestions | Yes | OpenAI GPT only |
| Picture-in-Picture (PiP) | No | Not mentioned |
| Code Syntax Highlighting | Partial | Markdown rendering |
| Question History | Unknown | Not documented |
| Silence Detection | Unknown | Not documented |
| Custom System Prompts | Unknown | Not documented |
| Multiple AI Models | No | OpenAI only |
| Cross-Device Support | Yes | Major selling point |

### Installation Requirements

**System Requirements:**
- Node.js (version not specified)
- npm

**API Keys Required:**
1. OpenAI API Key
2. Microsoft Azure Speech Services Key (free tier available)

**Installation Steps:**
```bash
git clone https://github.com/interview-copilot/Interview-Copilot.git
cd Interview-Copilot
npm install
npm run serve  # Development
npm run build  # Production
```

**Installation Complexity:** Low - Only 2 API services, simpler stack

### Supported Platforms

| Platform | Support |
|----------|---------|
| Windows | Yes |
| macOS | Yes |
| Linux | Yes |
| Tablets | Yes |
| Smartphones | Yes |
| Web Browsers | Yes (primary interface) |

**This is the most device-flexible option** - explicitly designed to work on tablets and smartphones unlike the other two projects.

### Privacy Model

| Aspect | Details |
|--------|---------|
| Architecture | Serverless, client-side |
| Audio Processing | Sent to Azure Speech Services |
| AI Processing | Sent to OpenAI APIs |
| Local Storage | API tokens stored in browser |
| Data Retention | No server-side storage |

**Privacy Advantage:** Serverless architecture means no intermediary server handles your data - direct API calls only.

### API Dependencies and Costs

| API Service | Purpose | Estimated Cost |
|-------------|---------|----------------|
| Azure Speech Services | Real-time transcription | $0.0167/min (free tier: 5 hours) |
| OpenAI GPT | AI responses | $2.50-5.00/1M input tokens |

**Monthly Cost Estimate (moderate use):**
- 10 hours of interview practice
- ~600 minutes transcription: ~$10 (Azure)
- ~50K tokens AI processing: ~$0.50-1.00
- **Total: ~$10-12/month**

**Note:** Azure offers a free tier with 5 hours of audio, making initial testing essentially free.

### Limitations and Known Issues

**Open Issues:**
1. **"Suggestion to Integrate Resume Upload and API Providers"** (#4) - Feature request for resume upload functionality and additional API provider support
2. **"Need update"** (#3) - General maintenance request from August 2024

**Technical Limitations:**
- Uses older Vue 2 (Vue 3 is current)
- Only 7 commits on main branch (minimal iteration)
- No Gemini support (OpenAI only)
- No PiP mode
- Inactive for over a year (last commit Nov 2024)

### Community Activity

- **Contributors:** Unknown (limited commits suggest 1-2)
- **Recent Activity:** Inactive (last commit November 2024)
- **Documentation:** Basic README
- **Total Commits:** 7 (very limited development history)
- **Release Strategy:** No formal releases

---

## 3. innovatorved/realtime-interview-copilot

**Repository:** [https://github.com/innovatorved/realtime-interview-copilot](https://github.com/innovatorved/realtime-interview-copilot)
**Author:** Ved Gupta

### GitHub Statistics

| Metric | Value |
|--------|-------|
| Stars | 84 |
| Forks | 14 |
| Last Commit | December 20, 2025 |
| License | Custom ("File Include Do Whatever License") |
| Open Issues | 0 |
| Closed Issues | 0 |
| Primary Language | TypeScript (95.1%) |
| Other Languages | JavaScript (3.7%), CSS (1.2%) |
| Total Commits | 61 |
| Releases | 2 |

### Description

This is a Progressive Web Application (PWA) that provides real-time AI assistance during interviews. It's the most modern of the three projects, using the latest React/Next.js stack with TypeScript. It offers two operational modes (Copilot and Summarizer) and can be installed as a native-like app on any device.

### Full Tech Stack

**Frontend Framework:**
- Next.js 16.0.10
- React 19.2.3
- TypeScript 5.9.3

**AI/ML Services:**
- Deepgram SDK 4.11.2 (audio transcription)
- AI SDK 5.0.113 (Google Generative AI)

**UI Components:**
- Radix UI primitives (icons, labels, slots, switches)
- Tailwind CSS 4.1.18
- Shadcn/UI components
- Lucide React icons

**PWA Features:**
- Service Workers
- Web App Manifest
- Offline capability

**Utilities:**
- Zod 4.1.13 (schema validation)
- Class Variance Authority 0.7.1
- clsx 2.1.1

**Deployment:**
- OpenNext for Cloudflare 1.14.6
- Wrangler 4.54.0 (Cloudflare Workers CLI)

**Development Tools:**
- Biome 2.3.8 (linter/formatter)
- ESLint 9.39.2
- PostCSS, Autoprefixer

### Features

| Feature | Supported | Notes |
|---------|-----------|-------|
| Real-time Transcription | Yes | Deepgram API |
| AI Response Suggestions | Yes | Google Generative AI |
| Picture-in-Picture (PiP) | No | Floating assistant instead |
| Code Syntax Highlighting | Unknown | Not explicitly documented |
| Question History | Yes | Response history saving |
| Silence Detection | Unknown | Not documented |
| Custom System Prompts | Unknown | Not documented |
| Multiple AI Models | Partial | Google AI only |
| Copilot Mode | Yes | Detailed responses |
| Summarizer Mode | Yes | Condensed answers |
| Floating AI Assistant | Yes | Contextual questions |
| Keyboard Shortcuts | Yes | K, S, C, Enter, Escape |
| PWA Installation | Yes | Offline-capable |
| Desktop App | Yes | Available on separate branch |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| K | Focus Ask AI input |
| S | Switch to Summarizer mode |
| C | Switch to Copilot mode |
| Enter | Submit/process (outside input fields) |
| Escape | Clear current response |

### Installation Requirements

**System Requirements:**
- Node.js 20+
- pnpm (recommended), npm, or yarn

**API Keys Required:**
1. Deepgram API Key (for transcription)
2. Google Generative AI API Key

**Installation Steps:**
```bash
git clone https://github.com/innovatorved/realtime-interview-copilot.git
cd realtime-interview-copilot
pnpm install
# Create .env.local with API keys:
# DEEPGRAM_API_KEY=your_key
# GOOGLE_GENERATIVE_AI_API_KEY=your_key
pnpm dev
# Access at localhost:3000
```

**Installation Complexity:** Moderate - Requires 2 API services, uses pnpm

### Supported Platforms

| Platform | Support |
|----------|---------|
| Web Browsers | Yes (PWA) |
| Desktop | Yes (via branch, installable PWA) |
| Mobile | Yes (PWA installation) |
| Offline | Partial (PWA with limited offline features) |

### Privacy Model

| Aspect | Details |
|--------|---------|
| Architecture | Client-side with API calls |
| Audio Processing | Sent to Deepgram |
| AI Processing | Sent to Google APIs |
| Local Storage | Response history stored locally |
| Deployment Option | Cloudflare Workers (edge) |

**Privacy Advantage:** Cloudflare Edge deployment option means faster responses and potentially better regional data handling.

### API Dependencies and Costs

| API Service | Purpose | Estimated Cost |
|-------------|---------|----------------|
| Deepgram Nova-3 | Real-time transcription | $0.0077/min (~$0.46/hr) |
| Google Generative AI | AI responses | $0.075-1.25/1M input tokens (model dependent) |

**Monthly Cost Estimate (moderate use):**
- 10 hours of interview practice
- ~600 minutes transcription: ~$4.62 (Deepgram)
- ~50K tokens AI processing: ~$0.10-0.50
- **Total: ~$5-6/month**

**Note:** Deepgram offers $200 in free credits for new accounts, making this the most cost-effective option.

### Limitations and Known Issues

- No open issues (limited community feedback)
- Custom license may not be suitable for enterprise use
- Google AI only (no OpenAI option)
- Requires newer Node.js version (20+)
- pnpm preference may be unfamiliar to some developers

### Community Activity

- **Contributors:** 1-2 (Ved Gupta primary)
- **Recent Activity:** Very active (last commit December 2025)
- **Documentation:** Good README, CONTRIBUTING.md
- **Total Commits:** 61 (most developed of the three)
- **Release Strategy:** 2 formal releases published
- **Desktop Branch:** Separate desktop application available

---

## API Pricing Reference

### Speech-to-Text Services

| Service | Real-time Rate | Batch Rate | Free Tier |
|---------|---------------|------------|-----------|
| Azure Speech Services | $0.0167/min | $0.006/min | 5 hours |
| Deepgram Nova-3 | $0.0077/min | Similar | $200 credit |
| Google Cloud STT | ~$0.016/min | ~$0.006/min | $300 credit |

### AI/LLM Services (per 1M tokens)

| Service | Input | Output | Notes |
|---------|-------|--------|-------|
| OpenAI GPT-4o | $2.50-5.00 | $10-15 | Most widely supported |
| OpenAI GPT-4.1 | $2.00 | $8.00 | 1M context window |
| Google Gemini 2.5 Pro | $1.25 | $10.00 | Good balance |
| Google Gemini 1.5 Flash | $0.075 | $0.30 | Budget option |
| Google Gemini 3 Pro | $2.00 | $12.00 | Latest model |

---

## Comparison Table

| Feature | hariiprasad/interviewcopilot | interview-copilot/Interview-Copilot | innovatorved/realtime-interview-copilot |
|---------|------------------------------|-------------------------------------|----------------------------------------|
| **GitHub Stats** ||||
| Stars | 25 | 129 | 84 |
| Forks | 10 | 34 | 14 |
| Last Commit | June 2025 | November 2024 | December 2025 |
| Total Commits | ~10-15 | 7 | 61 |
| License | MIT | Unspecified | Custom (Permissive) |
| **Tech Stack** ||||
| Framework | Next.js 15 + React 19 | Vue 2 | Next.js 16 + React 19 |
| Language | JavaScript | JavaScript/Vue | TypeScript |
| Build Tool | npm | npm/Vue CLI | pnpm |
| **Speech-to-Text** ||||
| Provider | Azure Speech Services | Azure Speech Services | Deepgram |
| Estimated Cost | $0.0167/min | $0.0167/min | $0.0077/min |
| **AI Models** ||||
| OpenAI | Yes | Yes | No |
| Google Gemini | Yes | No | Yes |
| Model Switching | Yes | No | No |
| **Features** ||||
| Real-time Transcription | Yes | Yes | Yes |
| PiP Mode | Yes | No | No |
| Floating Assistant | No | No | Yes |
| Code Highlighting | Yes | Partial | Unknown |
| Question History | Yes | Unknown | Yes |
| Keyboard Shortcuts | Unknown | Unknown | Yes |
| PWA Support | No | No | Yes |
| Offline Mode | No | No | Partial |
| Desktop App | No | No | Yes (branch) |
| **Platform Support** ||||
| Desktop Browsers | Yes | Yes | Yes |
| Mobile Browsers | Limited | Yes | Yes |
| Tablets | Limited | Yes | Yes |
| Installable | No | No | Yes (PWA) |
| **Privacy** ||||
| Architecture | Client + APIs | Serverless + APIs | Client + APIs |
| Data Storage | Local | Local (browser) | Local |
| **Estimated Monthly Cost** | $10-15 | $10-12 | $5-6 |
| **Installation** ||||
| Node.js Version | 18+ | Not specified | 20+ |
| API Keys Needed | 3 | 2 | 2 |
| Complexity | Moderate | Low | Moderate |
| **Community** ||||
| Active Development | Yes | No | Yes |
| Issues/PRs | None | 2 open | None |
| Documentation | Good | Basic | Good |

---

## Recommendations

### Best for: Feature Richness
**hariiprasad/interviewcopilot**
- Most AI model options (OpenAI + Gemini)
- PiP mode for interview overlay
- Code syntax highlighting
- Best for technical interviews

### Best for: Simplicity and Cross-Device
**interview-copilot/Interview-Copilot**
- Simplest setup (2 APIs only)
- Works on smartphones and tablets
- Serverless architecture (no backend concerns)
- Caveat: Inactive development, older tech stack

### Best for: Modern Stack and Cost
**innovatorved/realtime-interview-copilot**
- Most actively developed
- Lowest estimated running cost ($5-6/mo)
- PWA with offline support
- Keyboard shortcuts for power users
- TypeScript for better code quality
- Desktop app available

### Enterprise Considerations

None of these projects are enterprise-ready as-is:
1. Limited security auditing
2. No SLA or support
3. Varying license clarity
4. Single-developer maintenance

For enterprise use, consider:
- Commercial alternatives (Final Round AI, Interviews.chat)
- Self-hosting with security review
- Contributing to active projects for needed features

---

## Sources

### GitHub Repositories
- [hariiprasad/interviewcopilot](https://github.com/hariiprasad/interviewcopilot)
- [interview-copilot/Interview-Copilot](https://github.com/interview-copilot/Interview-Copilot)
- [innovatorved/realtime-interview-copilot](https://github.com/innovatorved/realtime-interview-copilot)

### Pricing Information
- [Deepgram Pricing](https://deepgram.com/pricing)
- [Azure Speech Services Pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/)
- [Google Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [OpenAI API Pricing](https://openai.com/api/pricing/)

### Related Resources
- [10 Best AI Interview Copilot Tools for 2026 - DEV Community](https://dev.to/finalroundai/the-10-best-interview-copilot-tools-for-2026-4a8j)
- [Best AI Interview Assistants 2026 - ScreenApp](https://screenapp.io/blog/best-ai-interview-assistants-2025)
- [Deepgram Pricing Breakdown 2026](https://brasstranscripts.com/blog/deepgram-pricing-per-minute-2025-real-time-vs-batch)
- [Azure Speech to Text Pricing 2026](https://brasstranscripts.com/blog/azure-speech-services-pricing-2025-microsoft-ecosystem-costs)
- [Gemini API Pricing Guide](https://www.aifreeapi.com/en/posts/gemini-api-pricing-and-quotas)
- [OpenAI Pricing 2026](https://www.finout.io/blog/openai-pricing-in-2026)

---

*Report generated January 26, 2026*
