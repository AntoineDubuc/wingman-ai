# Open Source Meeting Transcription Platforms Research

**Research Date:** January 26, 2026
**Prepared for:** Tammy - AI Solutions Consultant

---

## Executive Summary

This document provides an in-depth analysis of three open-source meeting transcription and assistant platforms:

1. **Vexa** - A self-hosted API that deploys bots into Google Meet and Microsoft Teams for real-time transcription
2. **Meetily** - A privacy-first local meeting assistant with 100% on-device processing
3. **AWS Live Meeting Assistant (LMA)** - An AWS-based solution using Amazon Transcribe and Bedrock

Each platform addresses different use cases, from developer-focused API access to privacy-conscious local processing to enterprise-scale cloud deployments.

---

## 1. Vexa-ai/vexa

**Repository:** [https://github.com/Vexa-ai/vexa](https://github.com/Vexa-ai/vexa)
**Website:** [https://vexa.ai](https://vexa.ai)

### Overview

Vexa is an open-source, multi-user API that automates meeting transcription by deploying bots into video conferencing platforms. It positions itself as a privacy-first, open-source alternative to commercial solutions like Recall.ai.

### GitHub Metrics

| Metric | Value |
|--------|-------|
| Stars | 1,620 |
| Forks | 170 |
| Open Issues | 43 |
| License | Apache License 2.0 |
| Created | February 7, 2025 |
| Last Push | January 17, 2026 |
| Primary Language | Python |
| Commits | 357+ |

### Technology Stack

**Backend:**
- Python (primary language)
- FastAPI for REST API endpoints
- WebSocket support for real-time streaming
- PostgreSQL for state persistence

**Core Components:**
- `api-gateway` - Request routing and authentication
- `bot-manager` - Meeting bot lifecycle management
- `vexa-bot` - Meeting bot implementation (joins meetings)
- `WhisperLive` - Real-time transcription wrapper using OpenAI Whisper
- `transcription-service` - Backend transcription engine
- `transcription-collector` - Segment processing and storage

**Transcription Engine:**
- OpenAI Whisper (100+ languages supported)
- 99 languages for real-time translation

### Installation Requirements & Complexity

**Deployment Options:**

1. **Hosted Service (Easiest)**
   - Sign up at vexa.ai
   - Get API key in 3 clicks
   - No infrastructure management required
   - Ready in under 5 minutes

2. **Vexa Lite (Medium Complexity)**
   - Single Docker container deployment
   - Uses external transcription service (GPU-free)
   - Maintains data sovereignty
   - Requirements: Docker, network access to meeting platforms

3. **Docker Compose (Full Self-Hosted)**
   - Complete development environment
   - Includes all services: API, bots, transcription, database
   - Requirements: Docker, Docker Compose, PostgreSQL
   - GPU recommended for local transcription (CUDA-compatible)

4. **Enterprise (Kubernetes/Nomad/OpenShift)**
   - Custom deployment with orchestration support
   - Contact required for enterprise setup

**Hardware Requirements:**
- Minimum: Standard server with Docker capability
- Recommended: GPU-equipped servers (NVIDIA with CUDA) for local transcription
- GPU-free option available with external transcription service

### Features

| Feature | Status |
|---------|--------|
| Real-time transcription | Yes |
| Multilingual support (100+ languages) | Yes |
| Real-time translation (99 languages) | Yes |
| Speaker identification | Yes (Google Meet) |
| WebSocket streaming (sub-second latency) | Yes |
| REST API access | Yes |
| Multi-user team management | Yes |
| API token authentication | Yes |
| Meeting metadata persistence | Yes |
| AI summarization | Via integration |
| Recording storage | Yes |

### Supported Platforms

| Platform | Status |
|----------|--------|
| Google Meet | Active |
| Microsoft Teams | Active |
| Zoom | Coming Soon (planned July 2025) |

### Privacy Model

Vexa offers three privacy tiers:

1. **Full Self-Hosting**
   - Complete infrastructure ownership
   - All data stays within your network
   - Choose your region
   - GDPR and data sovereignty compliant
   - Suitable for fintech, healthcare, regulated industries

2. **Hybrid Deployment**
   - Self-hosted Vexa infrastructure
   - External transcription service
   - Minimal DevOps requirements
   - Good balance of privacy and ease

3. **Managed Cloud Service**
   - Hosted at vexa.ai
   - Privacy guarantees provided
   - Fastest setup

### API Dependencies & Costs

**Self-Hosted Costs:**
- Infrastructure costs (servers, GPU if applicable)
- External transcription service (if using Vexa Lite)
- No per-minute API fees

**Hosted Service:**
- Self-service API access
- Usage-based pricing (contact for details)
- Free tier available for testing

**External Dependencies:**
- OpenAI Whisper models (included/self-hosted)
- Optional: External transcription service endpoints

### Scalability & Enterprise Readiness

**Strengths:**
- Kubernetes, Nomad, OpenShift support for enterprise deployment
- Multi-user team management built-in
- API-first design enables easy integration
- Can handle multiple concurrent meetings

**Considerations:**
- Newer project (created Feb 2025)
- Zoom support not yet available
- Enterprise deployments may require custom configuration

### Limitations & Known Issues

Based on GitHub issues analysis:

1. **Platform Issues:**
   - Google Meet compatibility issues with new waiting-room interface (#57)
   - Teams bot crashes in Lite mode (#91)
   - Bot ejection from Google Meet reported (#83)

2. **Technical Challenges:**
   - Docker GPU startup failures on WSL2 with RTX 4050 (#76)
   - Apple Silicon (M1 Mac) compatibility problems (#68)
   - Empty transcription segments reported (#56)

3. **Documentation Gaps:**
   - Missing language code references (#81)
   - API documentation improvements needed (#80, #62)

4. **Feature Gaps:**
   - Zoom integration pending
   - Bidirectional audio not yet available (#48)

### Community Activity

- **Discord Community:** Active (discord.gg/Ga9duGkVz9)
- **Open Issues:** 43 (active triage)
- **Pull Requests:** 8 open
- **Contributors:** Growing community
- **Bounty Program:** Task-based bounties for contributions
- **Recent Activity:** Active development through January 2026

### Use Cases

Best suited for:
- SaaS companies building meeting intelligence features
- Developers needing meeting transcription APIs
- Enterprises requiring self-hosted solutions
- Remote teams needing multilingual support
- Compliance-focused organizations (GDPR, data sovereignty)

---

## 2. Zackriya-Solutions/meeting-minutes (Meetily)

**Repository:** [https://github.com/Zackriya-Solutions/meeting-minutes](https://github.com/Zackriya-Solutions/meeting-minutes)
**Website:** [https://meetily.ai](https://meetily.ai)

### Overview

Meetily is a privacy-first AI meeting assistant that performs transcription and summarization entirely on local machines. Built with Rust for performance, it offers 100% local processing with no cloud dependencies.

### GitHub Metrics

| Metric | Value |
|--------|-------|
| Stars | 9,429 |
| Forks | 817 |
| Open Issues | 119 |
| License | MIT |
| Created | December 26, 2024 |
| Last Push | January 23, 2026 |
| Latest Release | v0.2.0 (Dec 31, 2025) |
| Primary Language | Rust (43.7%) |
| Active Contributors | 7 |

### Technology Stack

**Frontend:**
- Next.js / TypeScript (29.5%)
- Tauri (desktop application framework)
- React-based UI

**Backend:**
- Rust (43.7%) - Core application
- FastAPI (Python) - Backend services
- SQLite - Local storage
- VectorDB - Semantic search

**Audio Processing:**
- C++ (11.1%) - Audio processing
- Whisper.cpp - Local transcription engine
- Parakeet models (4x faster than Whisper)

**AI/ML:**
- Ollama (local LLM support)
- Optional: Claude, Groq, OpenRouter APIs
- Custom OpenAI-compatible endpoints

**Scripting:**
- PowerShell (4.8%)
- Shell (4.6%)
- Python (3.5%)

### Installation Requirements & Complexity

**Windows (Easiest):**
- Download direct installer (.exe)
- One-click installation
- No additional dependencies

**macOS (Easy):**
- Download DMG file
- Drag to Applications
- Apple Silicon optimized (Metal acceleration)

**Linux (Complex):**
- Requires building from source
- Dependencies: Rust, Node.js, system libraries
- Manual compilation required

**Hardware Requirements:**
- **macOS:** Apple Silicon (M1/M2/M3) recommended for Metal acceleration
- **Windows:** x64 processor, GPU optional (CUDA/Vulkan support)
- **Linux:** x64, build toolchain required
- Minimum RAM: 8GB (16GB recommended for larger models)

### Features

| Feature | Community Edition | PRO Edition |
|---------|-------------------|-------------|
| Local transcription | Yes | Yes (enhanced accuracy) |
| Real-time transcription | Yes | Yes |
| AI summarization | Yes | Yes |
| Speaker diarization | Basic | Advanced |
| Whisper/Parakeet models | Yes | Premium models |
| Ollama integration | Yes | Yes |
| Claude/Groq/OpenRouter | Yes | Yes |
| Custom OpenAI endpoints | Yes | Yes |
| PDF/DOCX export | No | Yes |
| Custom templates | No | Yes |
| Calendar integration | No | Yes |
| GDPR compliance tools | Limited | Full |
| System + mic audio mixing | Yes | Yes |

### Supported Platforms

**Operating Systems:**
| Platform | Status |
|----------|--------|
| macOS (Apple Silicon) | Fully Supported |
| macOS (Intel) | Supported |
| Windows (x64) | Fully Supported |
| Linux | Build from source |
| Android | Planned (#250) |

**Meeting Applications:**
- Works with ANY meeting platform (Google Meet, Zoom, Teams, WebEx, etc.)
- No platform-specific integration needed
- Captures system audio + microphone
- Bot-free (silent recording)

### Privacy Model

**100% Local Processing:**
- All transcription happens on-device
- Audio never leaves your machine
- No cloud dependencies for core features
- Complete data sovereignty

**Optional Cloud Features:**
- AI summarization can use cloud LLMs (Claude, Groq, OpenRouter)
- User chooses whether to enable
- Can use fully local LLMs via Ollama

**Compliance:**
- HIPAA-friendly (no data transmission)
- GDPR compliant by design
- Suitable for regulated industries
- Air-gapped environment compatible

### API Dependencies & Costs

**Core Application:**
- Free and open source (MIT license)
- No subscription fees
- No usage limits
- No hidden costs

**Optional AI Providers (if used):**
- Ollama: Free (local)
- Claude API: Usage-based pricing
- Groq API: Usage-based pricing
- OpenRouter: Usage-based pricing

**Meetily PRO:**
- Small teams (20-100 users): $1,999/year
- Enterprise: Custom pricing
- Enhanced models and features

### Scalability & Enterprise Readiness

**Individual/Small Team Use:**
- Excellent for personal productivity
- No infrastructure management
- Works offline

**Enterprise Considerations:**
- No centralized management console
- Each user runs their own instance
- PRO version available for teams
- Custom deployment possible for organizations

**Limitations for Enterprise:**
- No multi-user server deployment
- No centralized transcript storage
- No admin dashboard for team management

### Limitations & Known Issues

Based on GitHub issues analysis:

1. **Platform Limitations:**
   - Linux requires building from source
   - System audio capture not available on Linux (#273)
   - AMD GPU compilation issues (#305)

2. **Audio Issues:**
   - Audio recordings sometimes not saved (#307)
   - Microphone configuration problems (#271)
   - Default microphone cannot be changed in some cases

3. **Build/Deployment:**
   - Docker pull from GHCR failing with authentication errors (#300)
   - Build timeout during static export (#247)

4. **Integration Issues:**
   - Custom OpenAI endpoint connectivity broken (#310)
   - Template system validation concerns (#308)

5. **Feature Gaps:**
   - No mobile apps
   - No built-in meeting platform integrations
   - No centralized team features in community edition

### Community Activity

- **Product Hunt Launch:** November 5, 2025
- **Open Issues:** 119 (active development)
- **Contributors:** 7 active
- **DEV Community:** Multiple blog posts and tutorials
- **Documentation:** Good, with video guides
- **Recent Updates:** Regular releases, active maintenance

### Use Cases

Best suited for:
- Privacy-conscious professionals
- Healthcare providers (HIPAA compliance)
- Legal professionals (privileged communications)
- Financial services (confidential discussions)
- European companies (GDPR compliance)
- Air-gapped/secure environments
- Individual knowledge workers

---

## 3. AWS Live Meeting Assistant (LMA)

**Repository:** [https://github.com/aws-samples/amazon-transcribe-live-meeting-assistant](https://github.com/aws-samples/amazon-transcribe-live-meeting-assistant)
**AWS Solution Page:** [Live Meeting Assistant on AWS](https://aws.amazon.com/solutions/guidance/live-meeting-assistant-on-aws/)

### Overview

The AWS Live Meeting Assistant (LMA) is an open-source sample solution that captures browser-based meeting audio and metadata, providing real-time transcription, translation, and AI-powered meeting assistance using Amazon Transcribe and Bedrock.

### GitHub Metrics

| Metric | Value |
|--------|-------|
| Stars | 135 |
| Forks | 46 |
| Open Issues | 28 |
| License | MIT |
| Created | April 11, 2024 |
| Last Push | January 15, 2026 |
| Primary Language | JavaScript |
| Branch | develop (active) |

### Technology Stack

**Frontend:**
- React-based web UI
- Chrome browser extension (Chromium-based browsers)
- Amazon CloudFront for content delivery

**Backend & Infrastructure:**
- AWS Fargate + Application Load Balancer (WebSocket server)
- AWS Lambda (event processing)
- Amazon AppSync (GraphQL API)
- Amazon API Gateway
- AWS CloudFormation (Infrastructure as Code)

**Data & Storage:**
- Amazon DynamoDB (data persistence)
- Amazon S3 (artifacts, recordings, transcripts)
- Amazon Kinesis Data Streams (transcription relay)
- Amazon OpenSearch Service (QnABot integration)
- Amazon EventBridge (event processing)

**AI/ML Services:**
- Amazon Transcribe (speech-to-text)
- Amazon Bedrock (LLM for summaries, insights)
- Amazon Q Business (optional contextual queries)
- Amazon Translate (75+ language support)
- Amazon Kendra (knowledge source integration)

**Authentication:**
- Amazon Cognito (user management)

### Installation Requirements & Complexity

**Prerequisites:**
- AWS account with appropriate IAM permissions
- AWS CLI configured
- Bedrock model access enabled:
  - Titan Text Embeddings V2
  - Claude 3.x (Sonnet or Haiku)
- Email address for admin account
- Chrome/Chromium browser for extension

**Deployment Process:**
1. CloudFormation stack deployment
2. 35-40 minute deployment time
3. Automated resource provisioning
4. Admin receives temporary password via email

**Optional Pre-existing Resources:**
- Bedrock knowledge base
- Amazon Q Business application
- Bedrock agent

**Supported Regions:**
- US East (N. Virginia)
- US West (Oregon)
- AP Southeast (Sydney)

### Features

| Feature | Status |
|---------|--------|
| Live transcription | Yes |
| Speaker attribution | Yes (with extension) |
| Live translation (75+ languages) | Yes |
| On-demand summaries | Yes |
| Action item extraction | Yes |
| Post-meeting analytics | Yes |
| Meeting recording (stereo) | Yes (optional) |
| Meeting inventory/history | Yes |
| Cross-meeting AI queries | Yes |
| Knowledge base integration | Yes |
| PII redaction | Yes (optional) |
| Custom vocabulary support | Yes |
| Wake phrase activation | Yes |

### Supported Platforms

**Meeting Applications (Browser-based):**
| Platform | Extension Support | Stream Audio |
|----------|-------------------|--------------|
| Zoom | Yes | Yes |
| Microsoft Teams | Yes | Yes |
| WebEx | Yes | Yes |
| Google Meet | Yes | Yes |
| Amazon Chime | Yes | Yes |
| Any browser audio | No | Yes |

**Important Limitation:** Standalone desktop meeting apps do not work with LMA. Meetings must be launched in the browser.

**Browser Support:**
- Chrome extension for full features
- Any modern browser for "Stream Audio" feature

### Privacy Model

**Data Storage:**
- All data stored in your AWS account
- You control data retention (default: 90 days)
- Meeting recordings in S3 (optional, user-controlled)
- Transcripts and summaries in S3 with lifecycle management

**Access Control:**
- Administrator can view all meetings
- Non-admin users see only their own meetings
- Self-registration within authorized email domains
- Cognito-based authentication

**Compliance:**
- Data stays within your AWS account
- Region selection for data residency
- Encryption at rest and in transit
- You are responsible for recording consent compliance

### API Dependencies & Costs

**AWS Service Costs (Pay-as-you-go):**

| Service | Pricing |
|---------|---------|
| Amazon Transcribe | $0.024/min (Tier 1: 0-250K min) |
| | $0.015/min (Tier 2: 250K-1M min) |
| | $0.0102/min (Tier 3: 1M-5M min) |
| | $0.0078/min (Tier 4: 5M+ min) |
| Amazon Bedrock | Model-dependent (Claude 3 Sonnet ~$3/$15 per 1M tokens) |
| Amazon Translate | $15 per million characters |
| AWS Fargate | Based on vCPU and memory hours |
| Amazon S3 | ~$0.023/GB/month |
| Amazon DynamoDB | On-demand: $1.25 per million writes |
| Amazon OpenSearch | Instance-based pricing |

**Free Tier (New AWS Accounts):**
- Amazon Transcribe: 60 minutes/month for 12 months
- Various other service free tiers apply

**Cost Optimization Notes:**
- OpenSearch may incur charges even with zero use (#165)
- Review CloudFormation parameters to disable unused features
- Consider reserved capacity for predictable usage

### Scalability & Enterprise Readiness

**Strengths:**
- Built on enterprise-grade AWS infrastructure
- Multi-AZ data replication for high availability
- Auto-scaling with Fargate
- Well-Architected Framework compliance
- Centralized user management

**Concurrent Meeting Limits:**
- Default: 25 concurrent transcription streams
- Can request quota increase from AWS

**Enterprise Features:**
- Knowledge base integration for company documents
- Amazon Q Business integration
- Custom Bedrock agents
- Role-based access control

### Limitations & Known Issues

Based on GitHub issues analysis:

1. **Platform Compatibility:**
   - Desktop meeting apps not supported (browser only)
   - Virtual Participant not working with Zoom (#166)
   - Screen sharing breaks virtual participant in Zoom (#116)
   - MS Teams platform shows "n/a" (#182)

2. **Technical Issues:**
   - WebSocket timeout using Stream Audio method (#160)
   - LMA stops recording inconsistently for some users (#175)
   - Auto-scroll forces page to bottom during live transcripts (#200)

3. **Speaker Identification:**
   - Not working with Chrome extension for Teams/Zoom (#153)
   - Speaker diarization lacking for mic-only meetings (#198)

4. **Cost Concerns:**
   - OpenSearch continuously billing even with zero use (#165)
   - Cost-related misconfigurations found (#186)

5. **Feature Gaps:**
   - No meeting scheduling/calendar integration (#191)
   - Multi-language recognition limited (#177)
   - Cannot resume interrupted transcriptions (#135)

6. **Production Readiness:**
   - AWS classifies as "sample solution"
   - Users responsible for production hardening

### Community Activity

- **Issues:** 28 open (moderate activity)
- **Contributors:** AWS samples team + community
- **Documentation:** Comprehensive README and AWS blogs
- **Support:** AWS Machine Learning blog posts
- **Updates:** Regular updates through January 2026

### Use Cases

Best suited for:
- AWS-centric organizations
- Enterprises with existing AWS infrastructure
- Teams needing knowledge base integration
- Organizations requiring multi-meeting analytics
- Companies with compliance requirements (data residency)
- Teams needing multi-language support

---

## Comparison Table

| Feature | Vexa | Meetily | AWS LMA |
|---------|------|---------|---------|
| **GitHub Stars** | 1,620 | 9,429 | 135 |
| **License** | Apache 2.0 | MIT | MIT |
| **Last Updated** | Jan 2026 | Jan 2026 | Jan 2026 |
| **Primary Language** | Python | Rust | JavaScript |
| | | | |
| **Architecture** | Bot-based API | Local desktop app | Browser + AWS cloud |
| **Processing Location** | Self-hosted or cloud | 100% local | AWS cloud |
| **Deployment Type** | Docker/K8s/Hosted | Desktop installer | CloudFormation |
| **Setup Time** | 5 min (hosted) to 1 hr | 5 minutes | 35-40 minutes |
| **GPU Required** | Optional | Recommended | No (AWS handles) |
| | | | |
| **Google Meet** | Yes | Yes (any platform) | Yes (browser) |
| **Microsoft Teams** | Yes | Yes (any platform) | Yes (browser) |
| **Zoom** | Coming Soon | Yes (any platform) | Yes (browser) |
| **Desktop Apps** | N/A (bot joins) | Yes | No (browser only) |
| | | | |
| **Real-time Transcription** | Yes | Yes | Yes |
| **Speaker Identification** | Yes (Meet) | Basic/PRO | Yes (with extension) |
| **Translation** | 99 languages | Via LLMs | 75+ languages |
| **AI Summarization** | Via integration | Yes (local/cloud) | Yes (Bedrock) |
| **Meeting Recording** | Yes | Yes | Yes (optional) |
| **Cross-meeting Search** | No | Local | Yes (Knowledge Base) |
| **Custom Vocabulary** | No | No | Yes |
| **PII Redaction** | No | No | Yes |
| | | | |
| **Privacy Model** | Self-hosted option | 100% local | Your AWS account |
| **Data Sovereignty** | Full control | Full control | AWS region-based |
| **HIPAA Suitable** | With self-host | Yes | With BAA |
| **GDPR Compliant** | With self-host | By design | With configuration |
| | | | |
| **Self-Hosting** | Yes | Yes (inherent) | Yes (AWS account) |
| **SaaS Option** | Yes (vexa.ai) | No | No |
| **API Access** | Yes (primary) | No | GraphQL |
| | | | |
| **Base Cost** | Free (self-host) | Free | AWS service costs |
| **Per-Minute Cost** | Varies | None | ~$0.024+/min |
| **Enterprise Pricing** | Contact | $1,999/yr (PRO) | AWS usage-based |
| | | | |
| **Ideal For** | Developers, SaaS builders | Privacy-focused individuals | AWS enterprises |
| **Team Size** | Any | Individual/small teams | Medium to large |
| **Technical Skill Required** | Medium-High | Low | Medium-High |

---

## Recommendations by Use Case

### For Developers Building Meeting Features
**Recommendation: Vexa**
- REST API and WebSocket access
- Self-service API keys
- Good documentation
- Open-source for customization

### For Privacy-Conscious Individuals
**Recommendation: Meetily**
- 100% local processing
- No cloud dependencies
- Free and open source
- Easy installation

### For AWS-Centric Enterprises
**Recommendation: AWS LMA**
- Native AWS integration
- Scalable infrastructure
- Knowledge base capabilities
- Enterprise security features

### For Regulated Industries (Healthcare, Finance, Legal)
**Recommendation: Meetily or Self-hosted Vexa**
- Meetily: Simplest compliance (no data leaves device)
- Vexa: API access with data sovereignty

### For Multi-language Teams
**Recommendation: AWS LMA or Vexa**
- AWS LMA: 75+ languages with Amazon Translate
- Vexa: 99 languages with real-time translation

### For Budget-Conscious Teams
**Recommendation: Meetily**
- Completely free
- No ongoing costs
- No infrastructure to maintain

---

## Sources

### Vexa
- [GitHub Repository](https://github.com/Vexa-ai/vexa)
- [Vexa Official Website](https://vexa.ai/)
- [Vexa Blog - Self-Hosted Setup](https://vexa.ai/blog/how-to-set-up-self-hosted-meeting-transcription-5-minutes)
- [AI Sharing Circle - Vexa Review](https://aisharenet.com/en/vexa/)
- [Applied AI Tools - Vexa Review](https://appliedai.tools/product/vexa-best-for-real-time-privacy-first-ai-meeting-assistant-for-enterprises/)

### Meetily
- [GitHub Repository](https://github.com/Zackriya-Solutions/meeting-minutes)
- [Meetily Official Website](https://meetily.ai/)
- [DEV Community - Meetily Introduction](https://dev.to/zackriya/meetily-a-privacy-first-ai-for-taking-meeting-notes-and-meeting-minutes-26ed)
- [DEV Community - Privacy-First Comparison](https://dev.to/zackriya/we-built-a-self-hosted-ai-meeting-note-taker-because-every-cloud-solution-failed-our-privacy-1eml)
- [Meetily vs Otter.ai Comparison](https://dev.to/zackriya/meetily-vs-otterai-privacy-first-alternative-for-2025-bh5)

### AWS Live Meeting Assistant
- [GitHub Repository](https://github.com/aws-samples/amazon-transcribe-live-meeting-assistant)
- [AWS Solution Page](https://aws.amazon.com/solutions/guidance/live-meeting-assistant-on-aws/)
- [AWS Blog - LMA with Bedrock](https://aws.amazon.com/blogs/machine-learning/live-meeting-assistant-with-amazon-transcribe-amazon-bedrock-and-knowledge-bases-for-amazon-bedrock/)
- [Amazon Transcribe Pricing](https://aws.amazon.com/transcribe/pricing/)
- [AWS Blog - Healthcare Use Case](https://aws.amazon.com/blogs/machine-learning/elevate-healthcare-interaction-and-documentation-with-amazon-bedrock-and-amazon-transcribe-using-live-meeting-assistant/)

### Comparison Resources
- [Recall.ai Alternatives](https://skribby.io/blog/3-best-alternatives-to-recall-ai-in-2025)
- [Open Source Meeting Bot Comparison](https://screenapp.io/blog/recall-ai-alternative-open-source-meeting-bot)
- [Best Free AI Meeting Note Taker Comparison](https://www.zackriya.com/best-free-ai-meeting-note-taker/)

---

*Document generated on January 26, 2026*
