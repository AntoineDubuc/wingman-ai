# Implementation Plan: Cross-Browser Google Drive OAuth

---

## Executive Summary

Wingman AI's Google Drive integration currently relies on `chrome.identity.getAuthToken()`, a Chrome-specific API that is tightly coupled to Google's browser sign-in infrastructure. This means Drive features (auto-save transcripts, summaries) silently fail on Chromium-based browsers like Vivaldi, Brave, Edge, and Opera — browsers that otherwise run the extension perfectly. This phase replaces the auth layer with a try/fallback strategy: attempt `getAuthToken` first (preserving the seamless Chrome experience), and fall back to `chrome.identity.launchWebAuthFlow` (a standard OAuth popup) when it fails. The result is a single codebase that works across all Chromium browsers with zero user-facing configuration.

**Key Outcomes:**
- Google Drive connect/disconnect works in Vivaldi, Brave, Edge, and Opera — not just Chrome
- Chrome users experience zero UX regression (still uses `getAuthToken` when available)
- Token lifecycle (caching, refresh, revocation) is handled correctly for both auth paths
- One minor manifest change (`host_permissions`) and a new Google Cloud Console OAuth client — no user-facing settings required

---

## Product Manager Review

### Feature Overview

This phase modifies the internal OAuth plumbing of the Drive service. From the user's perspective, nothing changes in Chrome. Users on other Chromium browsers gain a previously broken feature: the ability to connect their Google account and auto-save transcripts/summaries to Drive.

### Features

#### Feature 1: Automatic Auth Method Selection

**What it is:** The extension automatically picks the best OAuth method for the current browser — no user action required.

**Why it matters:** Users on Vivaldi, Brave, and Edge currently see a silent failure or cryptic error when clicking "Connect Google Account." This eliminates that broken experience without adding browser-specific UI or settings.

**User perspective:** The user clicks "Connect Google Account" on the options page. In Chrome, it works exactly as before (instant, no popup). In Vivaldi/Brave/Edge, a Google sign-in popup appears, the user signs in, and the connection completes. The user never needs to know which method was used.

---

#### Feature 2: Manual Token Lifecycle Management

**What it is:** Tokens obtained via `launchWebAuthFlow` are cached, validated, and revoked through manual storage management (since `chrome.identity.removeCachedAuthToken` only applies to `getAuthToken` tokens).

**Why it matters:** Without proper token management, users on non-Chrome browsers would need to re-authenticate on every session, or stale tokens would cause silent Drive save failures mid-call.

**User perspective:** Invisible. The user connects once and stays connected across browser restarts. Disconnect fully revokes access. In Chrome, expired tokens are refreshed transparently. On non-Chrome browsers, tokens last ~1 hour; if a session runs longer, the user is prompted to reconnect with a clear message.

---

#### Feature 3: Graceful Error Messaging for Auth Failures

**What it is:** Clear, actionable error messages when OAuth fails — distinguishing between "user cancelled," "popup blocked," and "network error" rather than a generic "Connection failed."

**Why it matters:** Non-Chrome browsers have more OAuth failure modes (popup blockers, third-party cookie restrictions). Users need to understand what went wrong and how to fix it.

**User perspective:** If the OAuth popup is blocked, the user sees "Pop-up was blocked. Please allow pop-ups for this extension and try again." instead of "Failed to get authorization."

---

## Master Checklist

### Instructions for Claude Code

> **CRITICAL: You must follow these rules exactly.**
>
> 1. **Save after every cell write.** You cannot batch writes to this table. Each time you update a cell (start time, end time, estimate, etc.), you must save the file immediately before proceeding to other cells or other work.
>
> 2. **Check the checkbox** when you begin a task. This serves as a visual indicator of which task is currently in progress.
>
> 3. **Workflow for each task:**
>    - Check the checkbox `[x]` → Save
>    - Write start time → Save
>    - Complete the implementation work
>    - Write end time → Save
>    - Calculate and write total time → Save
>    - Write human time estimate → Save
>    - Calculate and write multiplier → Save
>    - Move to next task
>
> 4. **Time format:** Use `HH:MM` (24-hour format) for start/end times. Use minutes for total time and estimates.
>
> 5. **Multiplier calculation:** `Multiplier = Human Estimate ÷ Total Time`. Express as `Nx` (e.g., `10x` means 10 times faster than human estimate).
>
> 6. **If blocked:** Note the blocker in the task description section below and move to the next unblocked task.

### Progress Dashboard

| Done | # | Task Name | Start | End | Total (min) | Human Est. (min) | Multiplier |
|:----:|:-:|-----------|:-----:|:---:|:-----------:|:----------------:|:----------:|
| [ ] | 1 | Create "Web application" OAuth client in Google Console | | | | | |
| [ ] | 2 | Extract auth constants and types | | | | | |
| [ ] | 3 | Implement `launchWebAuthFlow` OAuth method | | | | | |
| [ ] | 4 | Implement try/fallback `getAuthToken` wrapper | | | | | |
| [ ] | 5 | Implement manual token cache (storage-based) | | | | | |
| [ ] | 6 | Rewrite `connect()` to use unified auth | | | | | |
| [ ] | 7 | Rewrite `disconnect()` for both token types | | | | | |
| [ ] | 8 | Rewrite `saveTranscript()` token retrieval with auto-refresh | | | | | |
| [ ] | 9 | Add descriptive error messages for auth failure modes | | | | | |
| [ ] | 10 | Add `accounts.google.com` to host_permissions | | | | | |
| [ ] | 11 | Build and verify TypeScript compiles clean | | | | | |
| [ ] | 12 | Manual test: Chrome `getAuthToken` path (connect, save, disconnect) | | | | | |
| [ ] | 13 | Manual test: Vivaldi `launchWebAuthFlow` path (connect, save, disconnect) | | | | | |
| [ ] | 14 | Manual test: token expiry and auto-refresh on non-Chrome | | | | | |

**Summary:**
- Total tasks: 14
- Completed: 0
- Total time spent: 0 minutes
- Total human estimate: 0 minutes
- Overall multiplier: --

---

## Task Descriptions

This section provides context for each task. Read the relevant description before starting implementation.

---

### Task 1: Create "Web application" OAuth client in Google Cloud Console

**Intent:** Create a second OAuth client ID (type "Web application") in Google Cloud Console for the `launchWebAuthFlow` path, and document the setup.

**Context:** `launchWebAuthFlow` redirects to `https://<extension-id>.chromiumapp.org/` after the user signs in. The existing `oauth2.client_id` in `manifest.json` is registered as a "Chrome Extension" type — this type does not support custom redirect URIs and only works with `getAuthToken`. A separate "Web application" client ID is required for `launchWebAuthFlow`. This is a prerequisite for all other tasks. The extension ID is derived from the `key` field in `manifest.json`.

**Expected behavior:** In Google Cloud Console → APIs & Services → Credentials:
1. Keep the existing Chrome Extension client ID (`617701449574-...`) untouched — it stays in `manifest.json` for `getAuthToken`
2. Create a new OAuth 2.0 Client ID with type **"Web application"**
3. Add `https://<extension-id>.chromiumapp.org/` as an **Authorized redirect URI** (with trailing slash — must match `chrome.identity.getRedirectURL()` exactly)
4. Note the new client ID — this gets hardcoded in `drive-service.ts` as `OAUTH_WEB_CLIENT_ID` (Task 2)
5. Document steps in a comment block at the top of `drive-service.ts`

The extension ID can be computed by running `chrome.runtime.id` in the extension console. The `key` in `manifest.json` ensures this ID is stable across installs.

**Key components:**
- Google Cloud Console → APIs & Services → Credentials
- `manifest.json` (reference only — the `key` field determines the stable extension ID)

**Notes:** The redirect URI in Google Console **must include the trailing `/`** to match what `chrome.identity.getRedirectURL()` returns. Omitting it causes a `redirect_uri_mismatch` error. Propagation of new redirect URIs in Google Console can take 5 minutes to a few hours. Both client IDs must belong to the same Google Cloud project so they share the same consent screen and API enablements.

---

### Task 2: Extract auth constants and types

**Intent:** Pull OAuth-related constants and type definitions to the top of `drive-service.ts` so both auth methods can share them cleanly.

**Context:** Currently the OAuth scopes live only in `manifest.json` (for `getAuthToken`) and there's no shared constant for the client ID, redirect URI, or auth URLs. `getAuthToken` uses the manifest's `oauth2.client_id` automatically. `launchWebAuthFlow` requires a separate "Web application" client ID (created in Task 1) passed programmatically. Both methods need the same scopes. This task establishes the foundation before either auth method is modified. Depends on Task 1 for the web client ID value.

**Expected behavior:** At the top of `drive-service.ts`, add constants:
```typescript
// Web Application client ID for launchWebAuthFlow (created in Google Console, Task 1)
// The manifest oauth2.client_id is a separate Chrome Extension type used only by getAuthToken
const OAUTH_WEB_CLIENT_ID = '<new-web-client-id-from-task-1>.apps.googleusercontent.com';
const OAUTH_SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email'];
const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
```
Add a type to track which auth method was used:
```typescript
type AuthMethod = 'getAuthToken' | 'webAuthFlow';
```

**Key components:**
- `src/services/drive-service.ts` — top-level constants section

**Notes:** Two different client IDs exist deliberately: the manifest `oauth2.client_id` (Chrome Extension type, consumed by `getAuthToken` automatically) and `OAUTH_WEB_CLIENT_ID` (Web Application type, consumed by `launchWebAuthFlow` programmatically). Both live in the same Google Cloud project and share the consent screen. The scopes must match between them.

---

### Task 3: Implement `launchWebAuthFlow` OAuth method

**Intent:** Create a private method that performs the full OAuth flow using `chrome.identity.launchWebAuthFlow` and returns an access token.

**Context:** This is the core cross-browser auth method. It constructs a Google OAuth2 authorization URL, opens it in a browser popup via `launchWebAuthFlow`, and parses the access token from the redirect URL fragment. Depends on Task 2 for constants.

**Expected behavior:** A new private method:
```typescript
private async getTokenViaWebAuthFlow(interactive: boolean): Promise<string | null>
```
- Constructs the auth URL: `https://accounts.google.com/o/oauth2/v2/auth?client_id=...&response_type=token&redirect_uri=https://<id>.chromiumapp.org/&scope=...`
- Uses `chrome.identity.getRedirectURL()` to get the correct redirect URI
- Calls `chrome.identity.launchWebAuthFlow({ url, interactive })`
- Parses `access_token` from the redirect URL's hash fragment (`#access_token=...&token_type=Bearer&expires_in=3600`)
- Returns the token string or null on failure
- Logs the auth method used

**Key components:**
- `src/services/drive-service.ts` — new private method `getTokenViaWebAuthFlow()`

**Notes:**
- `launchWebAuthFlow` with `interactive: false` will fail if there's no existing session — this is expected and the caller should handle it.
- The `response_type=token` gives us an implicit grant (access token directly, no authorization code exchange needed). This avoids needing a client secret.
- The `access_token` is in the URL **hash fragment**, not query params. `new URL(redirectUrl).hash` includes the `#` prefix — parse with `new URLSearchParams(url.hash.substring(1))` to get `access_token`, `expires_in`, etc.
- `chrome.identity.getRedirectURL()` returns a URL **with a trailing slash** (`https://<id>.chromiumapp.org/`). The `redirect_uri` parameter in the auth URL and the redirect URI registered in Google Console must both match this exactly (with trailing slash).
- Uses `OAUTH_WEB_CLIENT_ID` (not the manifest `oauth2.client_id`) — see Task 2.
- Also extract `expires_in` for token cache TTL (Task 5).

---

### Task 4: Implement try/fallback `getAuthToken` wrapper

**Intent:** Replace the existing `getAuthToken()` method with a unified wrapper that tries `chrome.identity.getAuthToken` first and falls back to `launchWebAuthFlow`.

**Context:** This is the key method that makes the extension cross-browser. Chrome will succeed on the first try. Vivaldi/Brave/Edge will fail `getAuthToken` and transparently fall back. Depends on Task 3. All callers of the old `getAuthToken()` will use this without changes.

**Expected behavior:** The private method `getAuthToken(interactive)` is rewritten:
1. Check the manual token cache first (Task 5) — if a valid cached token exists, return it immediately
2. Try `chrome.identity.getAuthToken({ interactive })` wrapped in try/catch
3. If it succeeds, return the token
4. If it fails (throws or returns null/undefined), call `getTokenViaWebAuthFlow(interactive)`
5. If web auth flow succeeds, cache the token (Task 5), return it
6. If both fail, return null

The method should also persist which auth method succeeded to `chrome.storage.local` (key `driveAuthMethod`) so that other execution contexts (service worker vs options page) can read it. Do **not** rely on an in-memory instance field for this — see Notes.

**Key components:**
- `src/services/drive-service.ts` — rewrite `getAuthToken()`

**Notes:**
- **Callback → Promise migration:** The current code uses the callback form of `chrome.identity.getAuthToken` (checking `chrome.runtime.lastError`). Migrate to the Promise form: `const result = await chrome.identity.getAuthToken({ interactive }); return result.token ?? null;`. The Promise form returns `GetAuthTokenResult` with an optional `.token` property, not a bare string.
- **Singleton context split:** `driveService` is imported in both the options page (`drive.ts`) and the service worker (`service-worker.ts`). These are **different processes with different instances**. An `authMethod` field set during `connect()` in the options page is invisible to `saveTranscript()` in the service worker. Always read `driveAuthMethod` from `chrome.storage.local`, never from an instance variable.
- **`launchWebAuthFlow(interactive: false)` is low-probability:** For non-interactive calls (used by `saveTranscript` in the service worker), this only succeeds if the user has an active Google session AND has already granted consent. The **manual token cache is the real safety net** for non-interactive token retrieval on non-Chrome browsers. If the cache is expired and Chrome's API also fails, the save fails gracefully — there is no silent fallback.
- Never show a popup for `interactive: false`.

---

### Task 5: Implement manual token cache (storage-based)

**Intent:** Cache access tokens from `launchWebAuthFlow` in `chrome.storage.local` with expiry tracking, since Chrome's built-in token cache (`removeCachedAuthToken`) only works for `getAuthToken` tokens.

**Context:** `getAuthToken` tokens are managed by Chrome internally. `launchWebAuthFlow` tokens have no built-in cache — if we don't cache them, every Drive operation triggers a popup. Depends on Tasks 3-4. Required by Tasks 6-8.

**Expected behavior:** Three new private methods:
```typescript
private async getCachedToken(): Promise<string | null>
private async cacheToken(token: string, expiresInSeconds: number): Promise<void>
private async clearCachedToken(): Promise<void>
```
- `cacheToken` stores `{ driveAccessToken: string, driveTokenExpiry: number }` in `chrome.storage.local`. `driveTokenExpiry` is `Date.now() + (expiresInSeconds * 1000) - 60000` (subtract 1 minute as safety margin).
- `getCachedToken` reads the stored token, checks if `Date.now() < driveTokenExpiry`, returns token if valid, null if expired/missing.
- `clearCachedToken` removes both keys from storage.
- The `getAuthToken` wrapper (Task 4) checks this cache before attempting any auth call.

**Key components:**
- `src/services/drive-service.ts` — three new private methods + two new storage keys

**Notes:** Only tokens from `launchWebAuthFlow` are cached here. `getAuthToken` tokens are cached by Chrome itself. The 1-minute safety margin prevents using a token that's about to expire during a multi-step Drive operation (folder lookup + file upload). Google's default `expires_in` for implicit grants is 3600 seconds (1 hour).

---

### Task 6: Rewrite `connect()` to use unified auth

**Intent:** Update the `connect()` method to work with the new try/fallback auth, caching the token and auth method on success.

**Context:** Currently `connect()` calls `this.getAuthToken(true)` and gets user info. The method signature and return type (`DriveAuthResult`) don't change — only the internals. Depends on Tasks 4-5. The options page `DriveSection` calls `driveService.connect()` and doesn't need modification.

**Expected behavior:**
1. Call `this.getAuthToken(true)` (now the unified wrapper from Task 4)
2. On success, fetch user info with the token
3. Store `driveConnected`, `driveAccountEmail`, and `driveAuthMethod` (the method that worked) in `chrome.storage.local`
4. Return `{ success: true, email }` as before
5. On failure, return `{ success: false, error }` with a descriptive message (Task 9)

**Key components:**
- `src/services/drive-service.ts` — `connect()` method
- `chrome.storage.local` — new key `driveAuthMethod`

**Notes:** Storing `driveAuthMethod` lets `disconnect()` (Task 7) know which cleanup path to use on subsequent sessions, even after a browser restart when the in-memory `authMethod` field is lost.

---

### Task 7: Rewrite `disconnect()` for both token types

**Intent:** Update `disconnect()` to handle cleanup for both auth methods — `removeCachedAuthToken` for Chrome's built-in tokens, and manual cache clearing + revocation for web auth flow tokens.

**Context:** The current `disconnect()` calls `removeCachedAuthToken` which only works for `getAuthToken` tokens. For `launchWebAuthFlow` tokens, we need to revoke via the Google revocation endpoint and clear our manual cache. Depends on Tasks 5-6.

**Expected behavior:**
1. Read `driveAuthMethod` from `chrome.storage.local` to determine which path was used
2. If `getAuthToken` path: get current token via Chrome API (non-interactive), revoke it, call `chrome.identity.removeCachedAuthToken({ token })` (existing behavior)
3. If `webAuthFlow` path: read token from manual cache, revoke via `https://accounts.google.com/o/oauth2/revoke?token=...`, call `clearCachedToken()`
4. In all cases (including unknown/missing `driveAuthMethod`): clear `driveConnected`, `driveAccountEmail`, `driveAuthMethod`, `driveAccessToken`, `driveTokenExpiry` from storage
5. Also call `clearCachedToken()` unconditionally as a safety measure

**Key components:**
- `src/services/drive-service.ts` — `disconnect()` method

**Notes:** Token revocation via the Google endpoint may fail (network issues, already-expired token). This is non-critical — always clear local state regardless. Wrap revocation in try/catch and don't let it block the disconnect flow. Do not rely on any in-memory instance field for `authMethod` — always read from `chrome.storage.local` (see Task 4 notes on singleton context split).

---

### Task 8: Rewrite `saveTranscript()` token retrieval with auto-refresh

**Intent:** Update the token retrieval in `saveTranscript()` so that expired tokens from `launchWebAuthFlow` are refreshed silently, and the 401-retry logic works for both auth methods.

**Context:** Currently `saveTranscript()` calls `getAuthToken(false)` which silently gets a cached Chrome token. For web auth flow tokens, the manual cache might be expired. The existing 401-retry logic calls `removeCachedAuthToken` which won't work for web flow tokens. Depends on Tasks 4-5-7.

**Expected behavior:**
1. First call to `getAuthToken(false)` checks manual cache → tries Chrome API silently → tries `launchWebAuthFlow` silently (low-probability fallback)
2. If all return null (token expired, no silent refresh possible), return `{ success: false, error: 'Authentication expired. Please reconnect Google Drive in Options.' }`
3. On 401 error in the catch block: read `driveAuthMethod` from storage, clear the appropriate cache (`removeCachedAuthToken` for Chrome, `clearCachedToken()` for web flow), retry `getAuthToken(false)` once
4. If retry also fails, return `{ success: false, error: 'Authentication expired. Please reconnect Google Drive in Options.' }`

**Key components:**
- `src/services/drive-service.ts` — `saveTranscript()` method, specifically the 401 retry block (lines 188-205)

**Notes:**
- This method runs in the **service worker** context (called from `service-worker.ts`), which is a different process from the options page where `connect()` runs. The `driveAuthMethod` must be read from `chrome.storage.local`, not from an instance field.
- Implicit grant tokens (from `launchWebAuthFlow`) **cannot be silently refreshed** — there's no refresh token. On non-Chrome browsers, the manual token cache (Task 5) is the only viable source for non-interactive token retrieval. When the cache expires (~1 hour), the save fails with a clear error message directing the user to reconnect.
- This is acceptable because: (a) most calls happen within a meeting which is under 1 hour, (b) `getAuthToken` users (Chrome) get automatic refresh, (c) the error message is actionable. A future enhancement could use authorization code flow with PKCE for refresh tokens, but that's out of scope for this phase.

---

### Task 9: Add descriptive error messages for auth failure modes

**Intent:** Replace generic "Failed to get authorization" errors with specific messages for each failure mode — popup blocked, user cancelled, network error, etc.

**Context:** `launchWebAuthFlow` has more failure modes than `getAuthToken`. The error strings from Chrome's API contain identifiable substrings that we can match. Depends on Tasks 3-4. Improves the user experience from Tasks 6-8.

**Expected behavior:** A new private helper:
```typescript
private getAuthErrorMessage(error: unknown): string
```
Maps error patterns to user-friendly messages:
- `"The user did not approve"` or `"user_denied"` → `"Authorization was cancelled. Please try again and approve access."`
- `"Authorization page could not be loaded"` → `"Could not reach Google. Check your internet connection and try again."`
- `"popup"` or `"blocked"` → `"Pop-up was blocked. Please allow pop-ups for this extension and try again."`
- `"invalid_client"` → `"OAuth configuration error. Please report this issue."`
- Default → `"Failed to connect to Google Drive. Please try again."`
Use this in `connect()` and in the fallback path of `getAuthToken()`.

**Key components:**
- `src/services/drive-service.ts` — new private method, called from `connect()` catch block

**Notes:** Error strings vary between Chrome versions. Use `.includes()` matching on substrings rather than exact equality. Log the raw error for debugging while showing the friendly message to the user.

---

### Task 10: Add `accounts.google.com` to host_permissions

**Intent:** Add `https://accounts.google.com/*` to `host_permissions` in `manifest.json` so the extension can make token revocation requests and the OAuth redirect works reliably.

**Context:** The revocation endpoint (`https://accounts.google.com/o/oauth2/revoke`) and OAuth authorization URL both live on `accounts.google.com`. Without this host permission, `fetch()` calls to the revocation endpoint may fail with CORS errors in some browsers. This is a one-line manifest change.

**Expected behavior:** `manifest.json` `host_permissions` array includes `"https://accounts.google.com/*"`. No functional change in Chrome (the `identity` permission already covers this implicitly), but ensures cross-browser compatibility for token revocation.

**Key components:**
- `manifest.json` — `host_permissions` array

**Notes:** This is the only manifest change needed. The `identity` permission and `oauth2` block remain unchanged — they're still used by the `getAuthToken` path in Chrome.

---

### Task 11: Build and verify TypeScript compiles clean

**Intent:** Run `npm run build` and fix any TypeScript errors introduced by the refactoring.

**Context:** Depends on all code tasks (2-10). This is the compile gate before manual testing.

**Expected behavior:** `npm run build` exits with code 0. No TypeScript errors, no new warnings. The `dist/` output includes the updated `background.js` and `manifest.json`.

**Key components:**
- `npm run build` in `wingman-ai/extension/`

**Notes:** Watch for: (1) `chrome.identity.launchWebAuthFlow`, `getRedirectURL`, and `GetAuthTokenResult` types are confirmed present in the project's `@types/chrome` (verified at `node_modules/@types/chrome/index.d.ts:4948-4957`), (2) strict null checks on the token cache methods and the `GetAuthTokenResult.token` optional property, (3) the old callback-based `getAuthToken` call must be migrated to the Promise form (which returns `GetAuthTokenResult`, not a bare `string`), (4) unused variables if any old code paths were replaced.

---

### Task 12: Manual test — Chrome `getAuthToken` path (connect, save, disconnect)

**Intent:** Verify that the refactoring introduces zero regression for Chrome users.

**Context:** Depends on Task 11. Chrome should still use `getAuthToken` as the primary path. The `launchWebAuthFlow` fallback should never trigger.

**Expected behavior:**
1. Load extension in Chrome → Options → Drive tab → click "Connect Google Account"
2. Chrome's built-in OAuth prompt appears (not a popup window)
3. After approval, UI shows "Connected as user@gmail.com"
4. Start a session on Google Meet, stop it, verify transcript auto-saves to Drive
5. Disconnect in Options → verify UI resets, token is revoked
6. Check service worker logs: should see `[DriveService] Auth via getAuthToken` (not webAuthFlow)

**Key components:**
- Chrome browser
- `chrome://extensions/` → reload extension
- Service worker console logs

**Notes:** If `getAuthToken` fails unexpectedly in Chrome and falls back to web auth flow, that's a bug — the fallback should be invisible in Chrome. Check the console logs to confirm which path was taken.

---

### Task 13: Manual test — Vivaldi `launchWebAuthFlow` path (connect, save, disconnect)

**Intent:** Verify the full Drive flow works in Vivaldi using the `launchWebAuthFlow` fallback.

**Context:** Depends on Task 11. Vivaldi doesn't support `getAuthToken`, so the fallback must trigger automatically.

**Expected behavior:**
1. Load extension in Vivaldi → Options → Drive tab → click "Connect Google Account"
2. A Google sign-in popup window appears (not Chrome's built-in prompt)
3. After approval, popup closes, UI shows "Connected as user@gmail.com"
4. Start a session, stop it, verify transcript auto-saves to Drive
5. Disconnect → verify UI resets, manual token cache is cleared
6. Check logs: should see `[DriveService] getAuthToken failed, falling back to launchWebAuthFlow`

**Key components:**
- Vivaldi browser
- Extension loaded in `vivaldi://extensions/`
- Service worker console logs

**Notes:** Vivaldi may block third-party cookies which could affect the OAuth popup. If the popup fails, test with third-party cookies enabled as a diagnostic step. Also test that the popup isn't blocked by Vivaldi's built-in popup blocker.

---

### Task 14: Manual test — token expiry and auto-refresh on non-Chrome

**Intent:** Verify that expired tokens are handled gracefully — no silent failures, no crashes, clear user messaging.

**Context:** Depends on Task 13. Implicit grant tokens expire after 1 hour. Since there's no refresh token, the user must re-authenticate for sessions longer than 1 hour.

**Expected behavior:**
1. Connect in Vivaldi, note the token expiry time from storage (`driveTokenExpiry`)
2. Manually set `driveTokenExpiry` to `Date.now() - 1000` in storage (simulating expiry)
3. Trigger a transcript save (stop a session or call `saveTranscript` from console)
4. Verify: the save fails gracefully, error message says "Authentication expired. Please reconnect Google Drive in Options."
5. Reconnect → verify fresh token works, new expiry is set

**Key components:**
- Vivaldi browser
- `chrome.storage.local` (modify via extension console)
- Service worker logs for error messages

**Notes:** To simulate token expiry without waiting an hour, use the Vivaldi extension console: `chrome.storage.local.set({ driveTokenExpiry: Date.now() - 1000 })`. Then trigger any Drive operation to verify the expiry detection and error messaging.

---

## Appendix

### Technical Decisions

1. **Try/fallback over browser detection:** Rather than sniffing the browser (unreliable — Vivaldi masks itself as Chrome), we try `getAuthToken` first and catch failures. This is more robust and future-proof.

2. **Implicit grant flow (response_type=token):** `launchWebAuthFlow` uses the implicit grant instead of authorization code + PKCE. This avoids needing a client secret (which can't be kept secret in a browser extension) and avoids a token exchange round-trip. Trade-off: no refresh tokens, so tokens expire after ~1 hour.

3. **Dual token storage:** Chrome tokens are managed by Chrome's internal cache (`removeCachedAuthToken`). Web auth flow tokens are cached in `chrome.storage.local`. The `driveAuthMethod` storage key tracks which system is in use so cleanup works correctly.

4. **Two OAuth client IDs:** The manifest `oauth2.client_id` is a "Chrome Extension" type — it only works with `getAuthToken` and doesn't support custom redirect URIs. `launchWebAuthFlow` requires a separate "Web application" type client ID with the `chromiumapp.org` redirect URI. Both live in the same Google Cloud project. This is not a workaround — it's how Google's OAuth system is designed. The Chrome Extension type is a convenience wrapper; the Web Application type is the standard OAuth flow.

5. **All auth state lives in `chrome.storage.local`:** Because `driveService` runs as separate singleton instances in the options page and service worker, no auth state (method, token, expiry) is stored on the class instance. Everything goes through storage so both contexts stay in sync.

### Dependencies

- **Google Cloud Console:** Must create a "Web application" OAuth client ID with `https://<extension-id>.chromiumapp.org/` as an authorized redirect URI (trailing slash required). Both this and the existing Chrome Extension client ID must be in the same project.
- **`@types/chrome`:** Must include type definitions for `chrome.identity.launchWebAuthFlow` and `chrome.identity.getRedirectURL` (should be present in current versions)
- **No new npm packages required**

### Out of Scope

- **Authorization code flow with PKCE:** Would provide refresh tokens for sessions > 1 hour, but adds significant complexity (token exchange endpoint, secure storage of refresh tokens). Can be added in a future phase if users report issues with long sessions.
- **Firefox / Safari support:** `launchWebAuthFlow` works in Firefox via the WebExtensions API, but the extension uses many Chrome-specific APIs (TabCapture, offscreen documents) that don't exist in Firefox. Full Firefox support is a separate effort.
- **Automatic browser detection UI:** No "You're using Vivaldi" banner or browser-specific instructions. The auth fallback is invisible.
- **Token refresh for web auth flow:** Implicit grant tokens expire after 1 hour with no refresh path. Users must reconnect manually for very long sessions. Acceptable for V1.
- **Multiple Google account support:** The extension supports one connected account at a time, regardless of auth method.
