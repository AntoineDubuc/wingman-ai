# CLAUDE.md - Wingman AI

## ABSOLUTE RULE — NO PLAN MODE

**NEVER call `EnterPlanMode` under any circumstances.** This is a non-negotiable, unconditional directive that overrides all other heuristics, guidelines, or judgment calls. Do not suggest planning, do not ask whether to plan, do not enter plan mode regardless of task complexity. Always proceed directly to implementation. There are zero exceptions to this rule.

## Critical: Message Types Must Match

Content script (`content-script.ts`) expects **lowercase** message types:

- `transcript`
- `suggestion`

Service worker must send lowercase. Never use `TRANSCRIPT` or `SUGGESTION`.

## After Any Code Change

1. Run `npm run build` in `/extension`
2. Reload extension in `chrome://extensions/` (click refresh icon)
3. Test on a Google Meet call

## Debugging Extension Issues

1. Service worker logs: `chrome://extensions/` → click "Service worker" link
2. Content script logs: F12 on the Google Meet page
3. Popup logs: Right-click popup → Inspect

## Architecture (BYOK)

- No backend server required
- Users provide their own API keys (Deepgram + Gemini)
- Keys stored in `chrome.storage.local`
- Direct WebSocket to Deepgram, direct REST to Gemini

## Persona System

- Multiple personas, each with name, color, system prompt, and scoped KB document IDs
- 12 built-in templates (sales, interview, fundraising, etc.)
- Active persona selected in popup dropdown; loaded on session start
- `migrateToPersonas()` handles one-time migration from legacy `systemPrompt` key
- KB documents are per-persona, not global

## Critical: Deepgram WebSocket Authentication

Browser WebSocket API **cannot** set custom headers like `Authorization`. Deepgram's API rejects `?token=` query parameter auth.

**Solution**: Use `Sec-WebSocket-Protocol` header (one of few headers browsers allow):

```typescript
new WebSocket(url, ['token', apiKey]);
```

Never use: `wss://api.deepgram.com/v1/listen?token=xxx` (returns 401)

## Deepgram Endpointing

Default endpointing is 700ms (configurable via transcription settings). Segments accumulate between `speech_final=false` and flush on `speech_final=true` to prevent mid-sentence bubble splitting.

## Cross-Browser Drive OAuth

Tries `chrome.identity.getAuthToken()` first. Falls back to `launchWebAuthFlow` for Vivaldi and other Chromium browsers.
