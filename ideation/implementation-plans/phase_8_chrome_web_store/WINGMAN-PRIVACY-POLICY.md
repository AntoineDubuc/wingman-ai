# Wingman AI — Privacy Policy

**Effective Date: February 2, 2026**

This privacy policy describes how the Wingman Chrome Extension handles your data. Wingman is designed with privacy as a core principle — all processing happens locally in your browser.

---

## Audio Capture & Transcription

- Wingman captures meeting audio using Chrome's tabCapture API and your microphone via the Web Audio API
- Audio is processed locally in an AudioWorklet (resampled to 16kHz PCM16) before being sent anywhere
- Audio data is sent directly from your browser to Deepgram's servers for real-time transcription via a secure WebSocket connection
- Audio is NOT stored locally or on any server — it is streamed in real time and discarded after transcription
- AI Entourage never receives, stores, or has access to your audio data

## Google Drive Access

- Wingman requests the `drive.file` OAuth scope, which only allows access to files that Wingman itself creates
- Wingman also requests `userinfo.email` to display your Google account email in the extension
- Wingman CANNOT read, modify, or delete any files you created outside of Wingman
- Google Drive integration is optional — you can use Wingman without connecting Google Drive
- Files saved to Drive include call transcripts and AI-generated summaries in your chosen format (Google Doc, Markdown, plain text, or JSON)

## API Keys (BYOK)

- Your Deepgram and Gemini API keys are stored locally in `chrome.storage.local` within your browser profile
- Keys are sent directly from your browser to the respective API providers (Deepgram, Google) — they are never transmitted to AI Entourage
- AI Entourage does not have any server infrastructure that receives or processes your API keys
- You are responsible for securing your own API keys and managing your API provider accounts

## Local Data Storage

- Extension settings (API keys, preferences, system prompt) are stored in `chrome.storage.local`
- Knowledge Base documents and their embedding vectors are stored in IndexedDB within your browser profile
- Transcripts during an active session are held in memory and discarded when the session ends (unless saved to Drive)
- No data is stored on any external server operated by AI Entourage

## What We Do NOT Collect

- We do not collect, store, or transmit any audio recordings
- We do not collect, store, or transmit any transcripts or meeting content
- We do not collect analytics, usage telemetry, or behavioral data
- We do not use cookies or tracking technologies
- We do not have a backend server — there is nowhere for your data to be sent to
- We do not sell, share, or monetize any user data in any form

## Third-Party Services

Wingman communicates directly with the following third-party services using API keys that you provide:

- **Deepgram** (api.deepgram.com) — for real-time speech-to-text transcription. Subject to [Deepgram's privacy policy](https://deepgram.com/privacy).
- **Google Gemini** (generativelanguage.googleapis.com) — for AI suggestions, embeddings, and call summaries. Subject to [Google's privacy policy](https://policies.google.com/privacy).
- **Google Drive** (googleapis.com) — for optional file storage. Subject to Google's privacy policy.
- **Google Identity** (via Chrome Identity API) — for OAuth authentication when connecting Google Drive.

## Changes to This Policy

We may update this privacy policy as the extension evolves. Changes will be noted with a new effective date at the top of this page. Continued use of the extension after changes constitutes acceptance.

## Contact

For privacy-related questions about the Wingman extension:

**AI Entourage**
Email: privacy@ai-entourage.ca
