# CLAUDE.md - Wingman AI

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

## Critical: Deepgram WebSocket Authentication

Browser WebSocket API **cannot** set custom headers like `Authorization`. Deepgram's API rejects `?token=` query parameter auth.

**Solution**: Use `Sec-WebSocket-Protocol` header (one of few headers browsers allow):
```typescript
new WebSocket(url, ['token', apiKey]);
```

Never use: `wss://api.deepgram.com/v1/listen?token=xxx` (returns 401)

Sources:
- [Deepgram Sec-WebSocket-Protocol docs](https://developers.deepgram.com/docs/using-the-sec-websocket-protocol)
