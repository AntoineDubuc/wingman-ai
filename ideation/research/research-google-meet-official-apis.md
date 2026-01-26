# Google Meet Official SDKs & APIs Research

**Date:** January 26, 2026
**Purpose:** Comprehensive analysis of Google's official Meet developer tools for building real-time AI meeting assistants

---

## Executive Summary

Google provides **three official developer tools** for Meet integration:

| Tool | Status | Real-Time Audio? | Best For |
|------|--------|------------------|----------|
| **Meet Add-ons SDK** | GA (Generally Available) | ❌ No | Embedding collaborative apps in Meet UI |
| **Meet REST API** | GA | ❌ No (post-meeting only) | Managing meetings, fetching recordings/transcripts after meeting ends |
| **Meet Media API** | ⚠️ Developer Preview | ✅ Yes | Real-time audio/video stream access |

### Key Finding for Your Use Case

**The Meet Media API is the only official Google solution for real-time audio access**, but it has significant limitations:
- Currently in Developer Preview (not GA)
- **All meeting participants must be enrolled in the Developer Preview Program**
- Requires WebRTC implementation expertise
- No SDK provided - you must implement WebRTC stack yourself

---

## 1. Meet Add-ons SDK for Web

**Status:** Generally Available (GA) since September 2024
**Documentation:** [developers.google.com/workspace/meet/add-ons/guides/overview](https://developers.google.com/workspace/meet/add-ons/guides/overview)
**NPM Package:** [@googleworkspace/meet-addons](https://www.npmjs.com/package/@googleworkspace/meet-addons)

### What It Does

Embeds your web application directly into Google Meet's UI where users can collaborate without leaving the meeting.

### Display Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **Side Panel** | Vertical panel on right side | Note-taking, polls, data updates |
| **Main Stage** | Central focal area | Whiteboarding, collaborative activities |

### Available APIs

| API | Purpose |
|-----|---------|
| **Co-Doing API** | Real-time collaborative activities (all users interact with same state) |
| **Co-Watching API** | Synchronized viewing experiences (video, presentations) |
| **Frame Messaging** | Communication between side panel and main stage |
| **Activity Management** | Start/stop collaborative sessions |

### Example Add-ons Already Built

- **Whiteboarding:** FigJam, Lucidspark, Miro
- **Note-taking:** Confluence, Read Notetaker
- **Polling:** Polly

### Limitations

| Limitation | Impact |
|------------|--------|
| **No audio access** | Cannot capture meeting audio for transcription |
| **No video access** | Cannot process video streams |
| **No transcript access** | Cannot read live captions |
| **Collaboration only** | Designed for embedded apps, not AI assistants |

### Code Example

```javascript
import { meet } from '@googleworkspace/meet-addons';

// Create add-on session
const session = await meet.addon.createAddonSession({
  cloudProjectNumber: 'YOUR_PROJECT_NUMBER'
});

// Start collaborative activity
await session.startActivity({
  startingState: { color: 'blue' }
});

// Get activity state
const state = await session.getActivityStartingState();
```

### Verdict for AI Assistant Use Case

**❌ Not suitable** - The Add-ons SDK cannot access audio streams or transcription data. It's designed for embedding collaborative tools, not AI assistants.

---

## 2. Meet REST API

**Status:** Generally Available (GA)
**Documentation:** [developers.google.com/workspace/meet/api/guides/overview](https://developers.google.com/workspace/meet/api/guides/overview)
**Last Updated:** December 11, 2025

### What It Does

Programmatically create meetings, manage spaces, and retrieve meeting artifacts **after the meeting ends**.

### Available Resources

| Resource | Endpoints | Description |
|----------|-----------|-------------|
| `spaces` | Create, Get, Update | Meeting spaces (virtual rooms) |
| `conferenceRecords` | Get, List | Instances of calls |
| `participants` | Get, List | Who attended |
| `participantSessions` | Get, List | When they joined/left |
| `recordings` | Get, List | Meeting recordings |
| `transcripts` | Get, List | Meeting transcripts |
| `transcripts.entries` | Get, List | Individual transcript lines |

### Transcript Access Example

```bash
# Get transcript entries for a meeting
GET https://meet.googleapis.com/v2/conferenceRecords/{conferenceRecord}/transcripts/{transcript}/entries

# Response includes:
# - participant name
# - spoken text
# - start/end time
# - language code
```

### Critical Limitations

| Limitation | Details |
|------------|---------|
| **Post-meeting only** | No access to live audio/video |
| **No programmatic transcription start** | Someone must manually click "Turn on captions" in UI |
| **Transcript delay** | Can take **45+ minutes** after meeting ends |
| **Recording delay** | Similar delay for recordings |
| **No real-time events** | Cannot subscribe to live meeting events |

### Pricing

The REST API itself is free, but requires **Google Workspace** for most features:

| Feature | Free Gmail | Workspace Starter ($7/mo) | Workspace Business+ ($22/mo) |
|---------|------------|---------------------------|------------------------------|
| Create meetings | ✅ | ✅ | ✅ |
| Get participants | ✅ | ✅ | ✅ |
| Recordings | ❌ | ❌ | ✅ |
| Transcripts | ❌ | ❌ | ✅ |

### Verdict for AI Assistant Use Case

**❌ Not suitable for real-time** - The REST API only provides post-meeting data. You cannot use it to build a live AI assistant that responds during the meeting.

---

## 3. Meet Media API (Developer Preview)

**Status:** ⚠️ Developer Preview (Not GA)
**Documentation:** [developers.google.com/workspace/meet/media-api/guides/overview](https://developers.google.com/workspace/meet/media-api/guides/overview)
**Announcement:** [Google Cloud Community](https://www.googlecloudcommunity.com/gc/News-Announcements/Developer-Preview-Google-Meet-Media-API-is-now-available-in/td-p/877270)

### What It Does

Provides **real-time access to raw audio and video streams** during a Google Meet conference via WebRTC.

### Capabilities

| Capability | Description |
|------------|-------------|
| **Consume audio streams** | Raw audio from participants |
| **Consume video streams** | Raw video from participants |
| **Consume screenshare** | Screen sharing content |
| **Participant metadata** | Presence detection |

### Use Cases Enabled

- Feed audio to your own **transcription service** (Deepgram, Whisper, etc.)
- Send audio to **Gemini or other LLMs** for real-time AI chat
- Generate captions in multiple languages
- Create sign language interpretation feeds
- Build custom denoising/audio processing
- Feed video to AI models for analysis

### Technical Architecture

```
┌─────────────────┐     WebRTC      ┌─────────────────┐
│  Google Meet    │◄───────────────►│  Your Client    │
│  SFU Servers    │                 │  (C++/TS/Web)   │
└─────────────────┘                 └────────┬────────┘
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │  Your Backend   │
                                    │  (Transcription │
                                    │   + LLM)        │
                                    └─────────────────┘
```

### Requirements

#### Developer Preview Enrollment

| Requirement | Details |
|-------------|---------|
| Google Cloud project | Must be enrolled in Developer Preview |
| OAuth principal | Must be enrolled |
| **All meeting participants** | **Must ALL be enrolled in Developer Preview** |

⚠️ **This is the major blocker** - You cannot use this API with regular users who aren't in the preview program.

#### Technical Requirements

| Requirement | Specification |
|-------------|---------------|
| WebRTC library | libwebrtc (within 12 months of latest Chromium STABLE) |
| Video codecs | AV1, VP9, VP8 (using libvpx, dav1d) |
| Audio codecs | Opus |
| Bandwidth | Minimum 4 Mbps |
| Mobile apps | Android Meet v309+, iOS Meet v308+ |

#### OAuth Scopes

| Scope | Access |
|-------|--------|
| `meetings.conference.media.readonly` | Audio + Video |
| `meetings.conference.media.audio.readonly` | Audio only |
| `meetings.conference.media.video.readonly` | Video only |
| `meetings.space.read` | Meeting metadata |

### Limitations

| Limitation | Impact |
|------------|--------|
| **All participants must be in preview** | Cannot use with regular users |
| **No SDK provided** | Must implement WebRTC stack yourself |
| **Receive only** | Cannot send audio/video back to meeting |
| **No encrypted meetings** | Fails if client-side encryption enabled |
| **No watermarked meetings** | Fails if watermarking enabled |
| **No minors** | Age-restricted accounts blocked |
| **Host consent required** | Host must be present and approve |
| **Max 3 streams** | Only receives audio/video from 3 most relevant participants |

### Reference Clients

Google provides reference implementations:

| Language | Purpose |
|----------|---------|
| **C++** | Production-ready, uses libwebrtc directly |
| **TypeScript** | Web-based implementation |

### Getting Started

1. **Enable API** in Google Cloud Console
2. **Enroll in Developer Preview** (all participants must do this)
3. **Configure OAuth** with appropriate scopes
4. **Implement WebRTC client** using reference code
5. **Handle consent flow** (host must approve)

### Verdict for AI Assistant Use Case

**⚠️ Partially suitable but impractical** - This is the only official way to get real-time audio, but the requirement that **all participants must be in the Developer Preview** makes it unusable for real-world scenarios where you're meeting with external parties.

---

## Comparison: Official APIs vs. Third-Party Solutions

| Aspect | Meet Media API | Vexa (Bot) | Meetily (Local) | Chrome Extension |
|--------|----------------|------------|-----------------|------------------|
| **Real-time audio** | ✅ | ✅ | ✅ | ✅ |
| **Works with any user** | ❌ (preview only) | ✅ | ✅ | ✅ |
| **Official/Supported** | ✅ | ❌ | ❌ | ❌ |
| **Setup complexity** | Very High | Medium | Low | Low |
| **Privacy** | Google servers | Self-hosted | 100% local | Local + cloud |
| **Production ready** | ❌ | ✅ | ✅ | ✅ |

---

## Practical Recommendations

### If You Need Real-Time AI During Meetings Today

**Don't use official Google APIs** - They're either post-meeting only (REST API) or require all participants to be developers (Media API).

**Instead, use:**
1. **[Meetily](https://github.com/Zackriya-Solutions/meeting-minutes)** - Captures system audio locally, works with any meeting platform
2. **[Vexa](https://github.com/Vexa-ai/vexa)** - Bot joins meeting and captures audio via WebRTC
3. **Chrome extension with TabCapture** - Captures browser tab audio

### If You're Building for Google Workspace Enterprise

Consider waiting for the **Media API to go GA**, then:
- All your organization's users can be enrolled
- Internal meetings would work
- External participants still problematic

### If You Want Official Google Integration Without Audio

Use the **Add-ons SDK** to:
- Embed a note-taking/summary interface in Meet
- Display AI-generated content in the side panel
- Sync collaborative content across participants

Then use a **separate audio capture method** (Meetily, extension) to feed audio to your AI.

---

## Future Outlook

### What to Watch

| Development | Timeline | Impact |
|-------------|----------|--------|
| Media API GA release | Unknown (2025-2026?) | Would enable real-time audio for enrolled orgs |
| Gemini in Meet expansion | Ongoing | Google may restrict third-party AI access |
| Add-ons SDK audio access | Unlikely | Would be a game-changer if added |

### Google's Direction

Google is investing heavily in **Gemini for Meet** (built-in AI), which suggests they may:
- Keep real-time audio access restricted
- Push users toward their own AI solution
- Eventually restrict bot/extension-based approaches

---

## Quick Reference: API Comparison Table

| Feature | Add-ons SDK | REST API | Media API |
|---------|-------------|----------|-----------|
| **Status** | GA | GA | Developer Preview |
| **Real-time audio** | ❌ | ❌ | ✅ |
| **Real-time video** | ❌ | ❌ | ✅ |
| **Post-meeting transcripts** | ❌ | ✅ | ❌ |
| **Post-meeting recordings** | ❌ | ✅ | ❌ |
| **Embed UI in Meet** | ✅ | ❌ | ❌ |
| **Works with any user** | ✅ | ✅ | ❌ |
| **Requires Workspace** | ❌ | Partial | ✅ |
| **WebRTC knowledge needed** | ❌ | ❌ | ✅ |

---

## Sources

### Official Documentation
- [Google Meet SDK and API Overview](https://developers.google.com/workspace/meet/overview)
- [Meet REST API Overview](https://developers.google.com/workspace/meet/api/guides/overview)
- [Meet Media API Overview](https://developers.google.com/workspace/meet/media-api/guides/overview)
- [Meet Add-ons SDK Overview](https://developers.google.com/workspace/meet/add-ons/guides/overview)
- [Get Started with Media API](https://developers.google.com/workspace/meet/media-api/guides/get-started)
- [Transcript Entries API Reference](https://developers.google.com/workspace/meet/api/reference/rest/v2/conferenceRecords.transcripts.entries/get)

### Third-Party Analysis
- [What is the Google Meet Media API? - Recall.ai](https://www.recall.ai/blog/what-is-the-google-meet-media-api)
- [How to Get Google Meet Transcripts Programmatically - Recall.ai](https://www.recall.ai/blog/how-to-get-transcripts-from-google-meet-developer-edition)
- [5 Ways to Get Google Meet Transcriptions - Nylas](https://www.nylas.com/blog/how-to-add-google-meet-transcription-to-your-app/)
- [How to Integrate with Google Meet - ScreenApp](https://www.screenapp.io/blog/how-to-integrate-with-google-meet-2025)

### Pricing
- [Google Workspace Pricing](https://workspace.google.com/pricing)
- [Google Meet Pricing Guide - MeetGeek](https://meetgeek.ai/blog/google-meet-pricing)

---

*Report compiled January 26, 2026*
