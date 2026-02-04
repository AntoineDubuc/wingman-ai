# Session Stop and Call Summary Flow

Complete trace from user clicking "Stop" through call summary generation to Drive save and overlay display.

> **Visual Diagrams:**
> - [SEQUENCES.md - Session Stop and Summary Flow](../diagrams/SEQUENCES.md#session-stop-and-summary-flow)
> - [SEQUENCES.md - Drive OAuth Flow](../diagrams/SEQUENCES.md#drive-oauth-flow-cross-browser)

## Flow Diagram

```
USER (Popup)
  │
  ├─ Click "Stop Session" button
  │
  └─[STOP_SESSION]────→ SERVICE WORKER
                       │
                       ├─ Stop audio capture (offscreen)
                       ├─ Show loading state (content script)
                       ├─ End transcript collection
                       ├─ Read settings (summary + Drive)
                       │
                       ├─ Generate Call Summary
                       │   ├─ Filter speech-only transcripts
                       │   ├─ Apply truncation (first 50 + last 400)
                       │   ├─ Build summary prompt
                       │   └─ Gemini API call
                       │       └─ Returns: summary, actionItems, keyMoments
                       │
                       ├─ Save to Google Drive (if enabled)
                       │   ├─ OAuth (getAuthToken or launchWebAuthFlow)
                       │   ├─ Format transcript (googledoc/md/text/json)
                       │   ├─ Create folder (if needed)
                       │   └─ Upload file
                       │
                       ├─ Send summary to overlay
                       ├─ Disconnect Deepgram
                       ├─ Close offscreen document
                       └─ Reset state

```

## Detailed Steps

### 1. User Clicks Stop in Popup

**File**: `popup.ts:150-173`

```typescript
private async toggleSession(): Promise<void> {
  this.elements.sessionBtn.disabled = true;
  this.hideError();

  try {
    if (this.isSessionActive) {
      await chrome.runtime.sendMessage({ type: 'STOP_SESSION' });
    }
  }
  // ...
}
```

**Message**: `STOP_SESSION` (uppercase)

### 2. Service Worker Receives STOP_SESSION

**File**: `service-worker.ts:60-64`

```typescript
case 'STOP_SESSION':
  handleStopSession().then(sendResponse);
  return true;  // Keep channel open for async response
```

⚠️ **Critical**: `return true` keeps service worker alive until all async work completes.

### 3. Stop Audio Capture

**File**: `service-worker.ts:442-447`

```typescript
const tabId = activeTabId;  // Capture before clearing

chrome.runtime.sendMessage({ type: 'STOP_AUDIO_CAPTURE' }).catch(() => {});
```

**Offscreen document receives**: `STOP_AUDIO_CAPTURE` (uppercase)

**Stops**:
- Microphone stream
- Tab capture stream
- AudioWorklet processors
- Dual stream mixing

### 4. Show Loading State

**File**: `service-worker.ts:449-451`

```typescript
if (tabId) {
  chrome.tabs.sendMessage(tabId, { type: 'summary_loading' }).catch(() => {});
}
```

**Message**: `summary_loading` (lowercase) — overlay shows spinner

### 5. End Transcript Collection

**File**: `service-worker.ts:453`

```typescript
const sessionData = transcriptCollector.endSession();
```

**Returns SessionData**:
```typescript
{
  startTime: Date,
  endTime: Date,
  transcripts: TranscriptEntry[],  // Speech + suggestions unified
  suggestionsCount: number
}
```

**File**: `transcript-collector.ts`

```typescript
endSession(): SessionData | null {
  if (!this.session) return null;

  this.session.endTime = new Date();
  const sessionData = { ...this.session };
  this.session = null;  // Clear for next session

  return sessionData;
}
```

### 6. Read Settings

**File**: `service-worker.ts:461-469`

```typescript
const storage = await chrome.storage.local.get([
  'summaryEnabled',
  'summaryKeyMomentsEnabled',
  'geminiApiKey',
  'driveAutosaveEnabled',
  'driveConnected',
  'driveFolderName',
  'transcriptFormat',
]);
```

### 7. Generate Call Summary

**File**: `service-worker.ts:476-507`

**Four possible outcomes**:
1. **"disabled"** — `summaryEnabled === false` or no Gemini key
2. **"skipped"** — fewer than 2 speech transcripts
3. **"success"** — summary generated successfully
4. **"error"** — summary generation failed

**Speech-only filtering** (line 456-458):
```typescript
const speechTranscripts = sessionData
  ? sessionData.transcripts.filter((t) => !t.is_suggestion)
  : [];
```

Only speech transcripts used for summary (suggestions excluded).

**Summary metadata** (line 471-474):
```typescript
const summaryMeta = {
  duration: durationSeconds,
  speakersCount: new Set(speechTranscripts.map((t) => t.speaker_id)).size,
  transcriptsCount: speechTranscripts.length,
};
```

**Gemini call** (line 495-499):
```typescript
const result = await geminiClient.generateCallSummary(
  speechTranscripts,           // Speech only
  summaryMeta,                 // Duration, speakers, count
  { includeKeyMoments: storage.summaryKeyMomentsEnabled !== false }
);
```

---

**File**: `gemini-client.ts:538-618`

**Truncation strategy** (call-summary.ts:54-71):

```typescript
const TRUNCATION_THRESHOLD = 500;
const KEEP_FIRST = 50;
const KEEP_LAST = 400;

if (transcripts.length > TRUNCATION_THRESHOLD) {
  const first = transcripts.slice(0, KEEP_FIRST);
  const last = transcripts.slice(-KEEP_LAST);
  // Concatenate with note: "[Note: Middle portion... omitted.]"
}
```

**Keeps**:
- First 50 entries (conversation framing)
- Last 400 entries (recent context)
- Total: 450 entries max

**Summary prompt structure** (call-summary.ts:49-120):
```typescript
export function buildSummaryPrompt(
  transcripts: TranscriptEntry[],
  metadata: SummaryMetadata,
  options: { includeKeyMoments?: boolean } = {}
): string {
  // Builds prompt with:
  // - Metadata (duration, speakers, count)
  // - Transcript entries with timestamps
  // - Instructions for summary format
}
```

**Returns CallSummary**:
```typescript
{
  summary: string[],        // 1-5 bullet points
  actionItems: ActionItem[],  // owner: 'you' | 'them'
  keyMoments: KeyMoment[],    // text, type: 'signal'|'objection'|'decision'|'quote'
  metadata: SummaryMetadata
}
```

### 8. Save to Google Drive

**File**: `service-worker.ts:514-564`

**Condition**: `driveAutosaveEnabled` AND `driveConnected`

**Full transcript data** (speech + suggestions):
```typescript
const transcripts: TranscriptData[] = sessionData.transcripts.map((t) => ({
  timestamp: t.timestamp,
  speaker: t.speaker,
  speaker_id: t.speaker_id,
  speaker_role: t.speaker_role,
  text: t.text,
  is_self: t.is_self,
  is_suggestion: t.is_suggestion,      // Preserved for Drive
  suggestion_type: t.suggestion_type,
}));
```

**Session metadata** (line 539-547):
```typescript
const metadata: SessionMetadata = {
  startTime: sessionData.startTime,
  endTime,
  durationSeconds,
  speakersCount,        // Speech-only count
  transcriptsCount,     // Speech-only count
  suggestionsCount,     // Suggestions-only count
  speakerFilterEnabled,
};
```

**Drive save call** (line 549-555):
```typescript
const result = await driveService.saveTranscript(
  transcripts,                           // Speech + suggestions
  metadata,
  storage.driveFolderName || 'Wingman Transcripts',
  storage.transcriptFormat || 'googledoc',  // Format option
  summary                                // Call summary (if generated)
);
```

---

**File**: `drive-service.ts`

### OAuth Flow

**Method**: `getAuthToken()` (line 218)

**Tier 1: Chrome-native** (line 220-231):
```typescript
try {
  const token = await new Promise<string | null>((resolve) => {
    chrome.identity.getAuthToken({ interactive }, (t) => {
      if (chrome.runtime.lastError) {
        resolve(null);
      } else {
        resolve(t || null);
      }
    });
  });
  if (token) return token;  // Success
} catch (err) {
  console.warn('[DriveService] getAuthToken not available:', err);
}
```

**Tier 2: launchWebAuthFlow fallback** (line 242-283):

For Vivaldi and other Chromium browsers where `getAuthToken` unavailable.

```typescript
const clientId = '617701449574-6sq8rsijsmu4aj964n3htr4urk8u8hj3.apps.googleusercontent.com';
const scopes = 'https://www.googleapis.com/auth/drive.file email';

const responseUrl = await chrome.identity.launchWebAuthFlow({
  url: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&...`,
  interactive: true,
});

// Parse access_token from URL fragment
const hashParams = new URLSearchParams(responseUrl.split('#')[1] ?? '');
const token = hashParams.get('access_token');

// Cache locally for non-interactive calls
await chrome.storage.local.set({ driveOAuthToken: token });
```

**Token refresh on 401** (line 196-207):
```typescript
if (String(error).includes('401')) {
  const oldToken = await this.getAuthToken(false);
  if (oldToken) {
    await chrome.identity.removeCachedAuthToken({ token: oldToken });
  }
  // Retry with fresh token
  return this.saveTranscript(transcripts, metadata, folderName, fileFormat);
}
```

### Drive Format Options

**Method**: `formatTranscript()` (line 410)

#### a) Native Google Doc (default)

**File**: `drive-service.ts:426-454`

```typescript
if (fileFormat === 'googledoc') {
  return {
    filename: baseName,                    // No extension
    content: this.formatGoogleDoc(...),    // HTML with inline styles
    mimeType: 'text/html',
    convertToGoogleDoc: true,  // Drive API auto-converts
  };
}
```

**Output URL**: `https://docs.google.com/document/d/{id}/edit`

**HTML features** (line 457-579):
- **Inline styles only** — no `<style>` blocks (stripped by Drive API)
- Metadata table with cell backgrounds
- Call summary with bullet points, action items, key moments
- Transcript with speaker labels, timestamps
- AI suggestions highlighted with amber accent bar
- Speaker colors: blue (you), green (customer), gray (other)

**Supported HTML**:
- Headings (`<h1>`, `<h2>`)
- Bold/italic (`<strong>`, `<em>`)
- Tables with cell backgrounds
- Colored text (`color` style)
- Lists (`<ul>`, `<ol>`)
- Links (`<a href>`)
- Horizontal rules (`<hr>`)

**Not supported**:
- Flexbox, grid
- Border-radius, box-shadow
- CSS classes (use inline styles)
- Page breaks

#### b) Markdown

**File**: `drive-service.ts:581-651`

```typescript
} else {
  return {
    filename: `${baseName}.md`,
    content: this.formatMarkdown(...),
    mimeType: 'text/markdown',
    convertToGoogleDoc: false,
  };
}
```

**Output URL**: `https://drive.google.com/file/d/{id}/view`

**Format**:
- Markdown table for metadata
- Call summary via `formatSummaryAsMarkdown()`
- Transcript with blockquotes for speaker attribution
- AI suggestions in blockquotes

#### c) Plain Text

**File**: `drive-service.ts:654-725`

```typescript
} else if (fileFormat === 'text') {
  return {
    filename: `${baseName}.txt`,
    content: this.formatText(...),
    mimeType: 'text/plain',
    convertToGoogleDoc: false,
  };
}
```

**Format**:
- Plain text with ASCII separators
- Section headers (MEETING TRANSCRIPT, CALL SUMMARY, etc.)
- Bracketed timestamps, speaker roles
- AI suggestions prefixed with `[WINGMAN AI (...)]`

#### d) JSON

**File**: `drive-service.ts:727-767`

```typescript
} else if (fileFormat === 'json') {
  return {
    filename: `${baseName}.json`,
    content: this.formatJson(...),
    mimeType: 'application/json',
    convertToGoogleDoc: false,
  };
}
```

**Structure**:
```json
{
  "metadata": {
    "startTime": "...",
    "endTime": "...",
    "durationSeconds": 123,
    "speakersCount": 2,
    "transcriptsCount": 45,
    "suggestionsCount": 8
  },
  "summary": {
    "summary": ["..."],
    "actionItems": [...],
    "keyMoments": [...]
  },
  "transcripts": [
    {
      "timestamp": "...",
      "speaker": "...",
      "text": "...",
      "is_suggestion": false
    }
  ]
}
```

### 9. Summary Displayed in Overlay

**File**: `service-worker.ts:568-583`

#### Success Path

```typescript
if (summaryOutcome === 'success') {
  chrome.tabs.sendMessage(tabId, {
    type: 'call_summary',  // Lowercase
    data: summary
  }).catch(() => {});

  if (driveResult.saved) {
    chrome.tabs.sendMessage(tabId, {
      type: 'drive_save_result',  // Lowercase
      data: driveResult
    }).catch(() => {});
  }
}
```

#### Error Path

```typescript
else if (summaryOutcome === 'error') {
  chrome.tabs.sendMessage(tabId, {
    type: 'summary_error',
    data: { message: 'Summary generation failed. Your transcript was still saved.' }
  }).catch(() => {});
}
```

#### Disabled/Skipped Path

```typescript
else {
  chrome.tabs.sendMessage(tabId, {
    type: 'HIDE_OVERLAY'  // Uppercase (legacy)
  }).catch(() => {});
}
```

**Overlay receives and renders** (overlay.ts):
- `call_summary` → display summary with bullets, action items, key moments
- `drive_save_result` → show "Saved to Drive" confirmation with link
- `summary_error` → show error toast
- `summary_loading` → show spinner

### 10. Cleanup and State Reset

**File**: `service-worker.ts:586-601`

```typescript
// 8. Cleanup
await deepgramClient.disconnect();
geminiClient.clearSession();

// Close offscreen document
try {
  await chrome.offscreen.closeDocument();
} catch {
  // Ignore — may already be closed
}

// 9. Reset state
isSessionActive = false;
isCapturing = false;
activeTabId = null;

console.log('[ServiceWorker] Session stopped');
return { success: true };
```

## Message Types Summary

| Step | From | To | Type | Case |
|------|------|-----|------|------|
| 1 | Popup | Service Worker | `STOP_SESSION` | UPPER |
| 2 | Service Worker | Offscreen | `STOP_AUDIO_CAPTURE` | UPPER |
| 3 | Service Worker | Content Script | `summary_loading` | lower |
| 6 | Service Worker | Content Script | `call_summary` | lower |
| 6 | Service Worker | Content Script | `drive_save_result` | lower |
| Error | Service Worker | Content Script | `summary_error` | lower |
| Disabled | Service Worker | Content Script | `HIDE_OVERLAY` | UPPER |

## Transcript Truncation

**Threshold**: 500 entries
**Keep**: First 50 + Last 400 = 450 entries

**Example**:
- Entries 1–50 (beginning)
- `[Note: Middle portion (50 entries) omitted for brevity.]`
- Entries 101–500 (end)

**Applied to**: Summary generation only (speech transcripts, suggestions excluded)

## Drive Save Behavior

**Auto-save triggers when**:
1. `driveAutosaveEnabled === true`
2. `driveConnected === true`

**Saves**:
- Full transcript (speech + suggestions)
- Session metadata
- Call summary (if generated)

**Filename format**: `Wingman_YYYY-MM-DD_HH-MM-SS.{ext}`

**Storage location**: Configurable folder name (default: "Wingman Transcripts")

## Error Handling

| Error | Handler | Fallback |
|-------|---------|----------|
| No session data | Returns disabled outcome | No summary generated |
| <2 speech transcripts | Returns skipped outcome | No summary generated |
| Summary generation fails | Returns error outcome | Transcript still saved to Drive |
| Drive 401 | Refresh token, retry once | Show auth error if fails |
| Drive other errors | Return error result | Show error message in overlay |

## Code References

| Function | File | Lines | Purpose |
|----------|------|-------|---------|
| `toggleSession()` | popup.ts | 150-173 | User clicks Stop |
| `handleStopSession()` | service-worker.ts | 439-601 | Main orchestration |
| `endSession()` | transcript-collector.ts | — | Freeze session data |
| `buildSummaryPrompt()` | call-summary.ts | 49-120 | Prompt + truncation |
| `generateCallSummary()` | gemini-client.ts | 538-618 | Summary generation |
| `saveTranscript()` | drive-service.ts | 153-207 | Drive save |
| `getAuthToken()` | drive-service.ts | 218-283 | OAuth flow |
| `formatGoogleDoc()` | drive-service.ts | 457-579 | HTML formatting |
