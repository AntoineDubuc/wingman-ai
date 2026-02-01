# Implementation Plan: Call Summary & Action Items

---

## Executive Summary

After every sales call, reps spend 10-20 minutes writing up notes — or skip it entirely, leaving CRM records empty and deal context lost between meetings. Wingman already captures full transcripts and saves them to Google Drive, but nobody re-reads a 45-minute transcript. This feature automatically generates a structured call summary with extracted action items when a session ends, displayed right on the Google Meet page so the rep can review, copy, and move on to their next call. It turns Wingman from a passive recorder into an active post-call assistant.

**Key Outcomes:**
- Reps get a structured summary (topics, decisions, next steps) seconds after ending a call
- Action items are extracted automatically with owner attribution (You vs. Them)
- Summary is copy-to-clipboard ready for CRM paste, and appended to the Drive transcript
- Post-call admin time drops from 10-15 min to 1-2 min (review + paste)
- Zero new API dependencies — uses existing Gemini client and transcript collector

---

## Product Manager Review

### Feature Overview

This phase adds an intelligent post-call layer to Wingman. When a session ends, the full conversation transcript is sent to Gemini for structured analysis. The result — a topical summary, action items, and key moments — is displayed in the existing overlay on the Google Meet page, right where the rep already is. The summary can be copied to clipboard or saved alongside the transcript in Google Drive.

### Features

#### Feature 1: Auto-Generated Call Summary

**What it is:** When a session ends, Wingman sends the full transcript to Gemini and displays a structured summary organized by topic (not chronologically) in the overlay panel.

**Why it matters:** Raw transcripts are too long to review. A 3-5 bullet topical summary lets reps capture the essence of a 30-60 minute call in 30 seconds. This is what tools like Gong and Chorus charge enterprise prices for.

**User perspective:** The rep clicks Stop (or the call ends). A brief loading spinner appears. Within a few seconds, the overlay — which was showing suggestions — now shows a clean summary card. They scan it, confirm it matches what happened, and either copy it or dismiss it. No extra steps, no separate tab, no waiting.

---

#### Feature 2: Action Item Extraction

**What it is:** Gemini identifies every commitment made during the call ("I'll send the proposal by Friday", "They'll loop in their CTO") and lists them as a checklist with owner attribution.

**Why it matters:** Missed follow-ups kill deals. Reps forget commitments within hours. Automatic extraction ensures nothing slips through the cracks — especially when reps are running 5+ calls per day.

**User perspective:** Below the summary, the rep sees a clear checklist: "You: Send SOC2 report", "Them: Confirm CTO availability". They can copy this directly into their CRM or task manager. The owner labels (You/Them) make it immediately clear who owes what.

---

#### Feature 3: Key Moments Detection

**What it is:** Notable quotes and buying signals are surfaced — things like "We're evaluating two vendors", "Budget is approved for Q2", or competitive mentions. Displayed as a collapsible section below action items.

**Why it matters:** These are the signals that inform deal strategy. A rep might not remember the exact phrasing, but "they said budget is approved" changes how you follow up. Surfacing these saves reps from re-reading transcripts to find the golden nuggets.

**User perspective:** A collapsible "Key Moments" section shows 2-5 notable quotes with approximate timestamps. Collapsed by default so it doesn't overwhelm, but available when the rep wants to capture exact phrasing for deal notes or manager updates.

---

#### Feature 4: Copy & Save Actions

**What it is:** Two action buttons on the summary card: "Copy to Clipboard" (formatted markdown for CRM paste) and "Saved to Drive" status (summary is automatically appended to the transcript file if Drive is connected).

**Why it matters:** The summary is only useful if it gets into the rep's workflow. Copy-to-clipboard removes the friction of reformatting notes. Drive integration ensures there's always a permanent record even if the rep doesn't copy.

**User perspective:** One click copies a CRM-ready markdown block to their clipboard. If Drive auto-save is enabled, the transcript file already includes the summary section — no extra action needed. A small status indicator confirms "Saved to Drive" or "Copy to clipboard" feedback.

---

#### Feature 5: Summary Settings

**What it is:** A toggle in the Options page to enable/disable auto-summary generation, with the option to include or exclude the Key Moments section.

**Why it matters:** Some reps may not want to wait for summary generation, or may find key moments noisy. Giving control ensures the feature doesn't become an annoyance for power users who have their own note-taking flow.

**User perspective:** In Options, under a new "Call Summary" card, the rep sees: an enable/disable toggle (default: on), and a checkbox for including key moments (default: on). Simple, two settings, no overwhelm.

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
| [x] | 1 | Define summary types, prompt builder, and markdown formatter | 18:42 | 18:48 | 6 | 30 | 5x |
| [x] | 2 | Add generateCallSummary() to GeminiClient | 18:48 | 18:53 | 5 | 25 | 5x |
| [x] | 3 | Orchestrate summary generation in service worker | 18:53 | 19:05 | 12 | 45 | 3.8x |
| [x] | 4 | Build summary overlay UI with styles | 19:05 | 19:16 | 11 | 45 | 4.1x |
| [x] | 5 | Wire summary display into content script | 19:16 | 19:20 | 4 | 20 | 5x |
| [x] | 6 | Implement copy-to-clipboard | -- | -- | 0 | 15 | -- |
| [x] | 7 | Append summary to Drive transcript | 19:20 | 19:26 | 6 | 25 | 4.2x |
| [x] | 8 | Add summary settings to Options page | 19:26 | 19:32 | 6 | 30 | 5x |
| [x] | 9 | Build and validate end-to-end | 19:32 | 19:36 | 4 | 20 | 5x |

**Summary:**
- Total tasks: 9
- Completed: 9
- Total time spent: 54 minutes
- Total human estimate: 255 minutes
- Overall multiplier: 4.7x

---

## Task Descriptions

This section provides context for each task. Read the relevant description before starting implementation.

---

### Task 1: Define summary types, prompt builder, and markdown formatter

**Intent:** Create the new `call-summary.ts` module containing everything that doesn't touch the Chrome extension runtime: data types, the Gemini prompt builder, transcript truncation logic, and the clipboard markdown formatter.

**Context:** This is the foundation task. Every subsequent task imports from this file. By putting types, prompt, truncation, and formatting in one pure module, we can test each function independently (e.g., via curl for the prompt, via Node for the formatter) without needing Chrome APIs.

**Expected behavior:**

**Types** — TypeScript interfaces defined and exported:
- `CallSummary` — top-level summary object
  - `summary: string[]` — 3-5 topic-organized bullet points
  - `actionItems: ActionItem[]` — extracted commitments
  - `keyMoments: KeyMoment[]` — notable quotes/signals
  - `metadata: SummaryMetadata` — duration, speaker count, transcript count, generation timestamp
- `ActionItem` — `{ owner: 'you' | 'them'; text: string; }`
- `KeyMoment` — `{ text: string; timestamp?: string; type: 'signal' | 'objection' | 'decision' | 'quote'; }`
- `SummaryMetadata` — `{ generatedAt: string; durationMinutes: number; speakerCount: number; transcriptCount: number; }`

**Prompt builder** — `buildSummaryPrompt(transcripts, metadata, options)` that:
- Accepts `CollectedTranscript[]` from `transcript-collector.ts`, `SummaryMetadata`, and `{ includeKeyMoments: boolean }`
- Formats transcripts as `[Speaker N]: text` lines (using speaker_id, not speaker name, since names may be inconsistent)
- Includes speaker attribution heuristic in the prompt: instructs Gemini that "Speaker 0 is the Wingman user (label as 'you'), all other speakers are 'them'." This uses the same assumption as the existing speaker filter — the first detected speaker is the user
- Includes a JSON schema in the prompt so Gemini knows the exact output shape
- Instructs Gemini to return `[]` for empty sections rather than omitting them
- If `includeKeyMoments` is false, omits the key moments instruction and tells Gemini to return `keyMoments: []`
- **Transcript truncation:** If transcript count exceeds 500 entries, keep the first 50 (opening context) and the last 400 (recent context where action items concentrate). Prepend a note: "Note: Middle portion of a longer conversation has been omitted." The 500 threshold is based on Gemini 2.5 Flash handling ~10K tokens of transcript comfortably; 500 entries at ~20 words each ≈ 10K words ≈ 13K tokens, well within the 1M context window but past the point where response quality degrades

**Markdown formatter** — `formatSummaryAsMarkdown(summary: CallSummary): string` that produces:
```
## Call Summary — Jan 31, 2026
**Duration:** 34 min | **Speakers:** 3

### Summary
- bullet 1
- bullet 2

### Action Items
- [ ] **You:** action text
- [ ] **Them:** action text

### Key Moments
- "quote text" (12:34)
```

**Empty section rules:**
- If `actionItems` is empty (`[]`), **omit the `### Action Items` heading entirely**. Do not print "None" or an empty heading.
- If `keyMoments` is empty (`[]`), **omit the `### Key Moments` heading entirely**. Same rule.
- `summary` will always have at least one bullet (Gemini is instructed to produce 1-5). If it is somehow empty, show a single bullet: `- No summary available`.

**Date formatting:** Parse `metadata.generatedAt` (ISO string) using `new Date(generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })`. This produces locale-consistent output like "Jan 31, 2026" regardless of system locale. Do not use `toLocaleDateString()` without an explicit locale — Chrome extension contexts may have unexpected defaults.

No emojis in the markdown output — they render inconsistently across CRMs. Uses `- [ ]` checkbox syntax for action items (renders in GitHub, Notion, Jira).

**Key components:**
- `src/services/call-summary.ts` (new file)

**Notes:** Keep types flat and serializable (no Date objects, use ISO strings). The `owner` field uses `'you'`/`'them'` because the UI needs attribution from the rep's perspective. The speaker heuristic (Speaker 0 = user) is imperfect but matches the existing speaker filter behavior. When `speakerFilterEnabled` is true, the service worker already treats Speaker 0 as the user (`speaker_role: 'consultant'`), so the heuristic is consistent with the rest of the system.

---

### Task 2: Add generateCallSummary() to GeminiClient

**Intent:** Add a new method to the existing `GeminiClient` class that sends the full transcript to Gemini and parses the structured JSON response into a `CallSummary` object.

**Context:** Depends on Task 1 (types and prompt). The `GeminiClient` already handles suggestion generation with `processTranscript()`. This new method is different: it runs once at session end (not per-utterance), uses higher `maxOutputTokens`, and expects JSON output. It must handle JSON parse failures gracefully.

**Expected behavior:** `geminiClient.generateCallSummary(transcripts, metadata, options)` returns a `Promise<CallSummary | null>`. It:
- Gets the API key from `chrome.storage.local` via the existing `getApiKey()` private method
- Calls `buildSummaryPrompt()` to construct the prompt
- Sends a single Gemini API request with `responseMimeType: 'application/json'` in `generationConfig` for reliable JSON output
- Parses the JSON response with a `try/catch` around `JSON.parse()` — if Gemini returns malformed JSON, log the raw response and return `null`
- Validates the parsed object has the expected shape (has `summary` array, `actionItems` array, `keyMoments` array) — if not, log and return `null`
- Returns `null` on any error (logged, not thrown — callers should not need to catch)
- Uses existing `fetchWithRetry()` for rate limit handling

**Key components:**
- `src/services/gemini-client.ts` — add `generateCallSummary()` method
- Import `CallSummary`, `buildSummaryPrompt`, `SummaryMetadata` from `call-summary.ts`

**Notes:** Use `maxOutputTokens: 2000` (summaries are longer than suggestions). Use `temperature: 0.2` (factual extraction, not creative writing). The `chatHistory` from the live session is NOT needed here — we pass the full transcript directly. The `responseMimeType: 'application/json'` parameter goes inside `generationConfig`, not as a top-level field.

---

### Task 3: Orchestrate summary generation in service worker

**Intent:** Rewrite `handleStopSession()` to orchestrate summary generation, Drive save, and overlay messaging in the correct order, handling the service worker lifecycle risk.

**Context:** Depends on Task 2. This is the most architecturally sensitive task. The current `handleStopSession()` does: stop mic → hide overlay → end transcript session (Drive save) → disconnect Deepgram → clear state. The new flow must: stop mic → show loading state → capture tab ID → generate summary → save to Drive (with summary) → send summary to overlay → disconnect Deepgram → clear state.

**Critical: Service worker termination risk.** Chrome can kill a MV3 service worker after ~30s of inactivity. Summary generation takes 2-8 seconds, Drive save another 1-3 seconds. To prevent termination mid-execution, the async work in `handleStopSession()` must be structured so Chrome sees it as an active response to a message (the `STOP_SESSION` message keeps the service worker alive while the `sendResponse` callback is pending). The key is: do NOT call `sendResponse()` until all async work is complete. The `return true` in the message listener already keeps the channel open.

**Expected behavior:**

The new `handleStopSession()` flow:
1. **Capture `activeTabId`** into a local `const tabId = activeTabId` immediately — before any async work. This prevents the race condition where `activeTabId` is nulled during state reset before the summary send.
2. **Stop mic capture** — send `STOP_MIC_CAPTURE` to content script (existing behavior)
3. **Show loading state** — send `{ type: 'summary_loading' }` to content script (replaces `HIDE_OVERLAY`)
4. **Read settings** — single `chrome.storage.local.get()` call for `summaryEnabled`, `summaryKeyMomentsEnabled`, `driveAutosaveEnabled`, `driveConnected`, `driveFolderName`, `transcriptFormat`
5. **Generate summary** — Three distinct outcomes, tracked via a `summaryOutcome` variable:
   - **`'disabled'`** — `summaryEnabled` is false, or Gemini API key is missing. Set `summary = null`, `summaryOutcome = 'disabled'`.
   - **`'skipped'`** — Summary is enabled but transcript count is < 5. Set `summary = null`, `summaryOutcome = 'skipped'`.
   - **`'success'`** — Call `geminiClient.generateCallSummary()`. If it returns a valid `CallSummary`, set `summaryOutcome = 'success'`.
   - **`'error'`** — `generateCallSummary()` returned `null` (API failure, malformed JSON, validation failure). Set `summary = null`, `summaryOutcome = 'error'`.
6. **Save to Drive** — call `driveService.saveTranscript()` with the optional summary (null if not generated). This is the existing flow from `transcriptCollector` but the summary and Drive save are now orchestrated here in the service worker, not buried in `endSession()`
7. **Send results to content script** — behavior depends on `summaryOutcome`:
   - **`'success'`** — send `{ type: 'call_summary', data: summary }` followed by `{ type: 'drive_save_result', data: driveResult }` (if Drive save was attempted)
   - **`'error'`** — send `{ type: 'summary_error', data: { message: 'Summary generation failed. Your transcript was still saved.' } }`. The overlay calls `showSummaryError()` and auto-hides after 3 seconds.
   - **`'disabled'` or `'skipped'`** — send `{ type: 'HIDE_OVERLAY' }` (existing behavior, no error shown — this is expected)
   - All sends use `tabId` (captured in step 1), wrapped in `.catch(() => {})` for navigation-away safety.
   - **`drive_save_result` message shape:** `{ type: 'drive_save_result', data: { saved: boolean; fileUrl?: string; error?: string } }` — this is the existing `DriveSaveResult` interface from `drive-service.ts`, passed through unchanged.
8. **Cleanup** — disconnect Deepgram, clear Gemini session, reset state variables.
9. **Return** — `sendResponse({ success: true })` only after all async work completes.

**Refactoring `TranscriptCollector.endSession()`:** The current `endSession()` does too much — it reads settings, formats transcripts, and calls Drive. Refactor it to only: set `endTime`, freeze and return `sessionData`, clear `this.session`. The service worker takes over orchestration of summary generation and Drive save. This keeps `endSession()` simple and moves business logic to the service worker where the message lifecycle provides the keepalive.

**Breaking return type change:** The current `endSession()` returns `Promise<{ saved: boolean; fileUrl?: string; error?: string }>` (a Drive save result). The new signature returns `SessionData | null` synchronously (no Promise — there's no async work left). `SessionData` is the existing `session` object containing `startTime`, `endTime`, `transcripts[]`, `suggestionsCount`, `speakerFilterEnabled`. Returns `null` if no active session exists. **Every call site that awaits `endSession()` or reads `.saved` from its result must be updated.** In the current codebase, the only call site is `handleStopSession()` in `service-worker.ts`, which is being rewritten in this same task — so there is no external migration, but verify with `grep -rn "endSession" src/` before implementing.

**Key components:**
- `src/background/service-worker.ts` — rewrite `handleStopSession()`, add summary orchestration
- `src/services/transcript-collector.ts` — simplify `endSession()` to return session data only, add `getSessionData()` method

**Notes:** The `TranscriptCollector` still collects transcripts during the session (that doesn't change). The change is that `endSession()` becomes a pure data accessor instead of an orchestrator. The service worker already imports `transcriptCollector`, `geminiClient`, and can import `driveService`. Keep the existing `transcriptCollector.addTranscript()` and `incrementSuggestions()` calls unchanged.

---

### Task 4: Build summary overlay UI with styles

**Intent:** Create the summary card UI and its CSS styles as a single unit within the overlay component. This includes the loading state, the summary display, and the error state.

**Context:** Depends on Task 1 (types). The `AIOverlay` class in `overlay.ts` currently displays suggestions and transcripts. After session end, the overlay content area switches to showing the summary card. All overlay styles live inline in `loadStyles()` because of the closed Shadow DOM — structure and styles must be built together.

**Expected behavior:**

**Three new public methods on `AIOverlay`:**

1. `showLoading()` — Transitions the overlay to a loading state:
   - Clears suggestions container
   - Changes header title to "Generating Summary..."
   - Changes status indicator to amber/yellow (processing)
   - Shows a subtle pulsing animation in the content area
   - If overlay was minimized, auto-expand it

2. `showSummary(summary: CallSummary)` — Renders the full summary card:
   - Replaces loading state content
   - Changes header title to "Call Summary"
   - Changes status indicator to blue/purple (session ended)
   - Renders three sections in the content area:
     - **Summary** — bullet points, always visible
     - **Action Items** — checklist with owner badges (`YOU` in orange, `THEM` in blue) + text
     - **Key Moments** — collapsible section, collapsed by default, with a clickable header showing "Key Moments (N)" with an arrow toggle. If `keyMoments` is empty, omit the section entirely.
   - Adds a footer action bar with "Copy" button and Drive status indicator
   - Stores the `CallSummary` reference on the instance for clipboard access
   - Panel remains draggable, resizable, closeable. Font controls still apply.

3. `showSummaryError(message: string)` — Brief error display:
   - Clears loading state content
   - Changes header title to "Call Summary"
   - Shows the error message in the content area with a muted/gray style and smaller font
   - Auto-hides the overlay after 3 seconds via `setTimeout`
   - **Called by:** content script `'summary_error'` message handler (Task 5), which is triggered when the service worker's `summaryOutcome` is `'error'` (Task 3)

4. `updateDriveStatus(result: { saved: boolean; fileUrl?: string })` — Updates the Drive status indicator in the summary footer:
   - If `saved` is true: show "Saved to Drive" text in the footer, styled as a muted success label
   - If `saved` is false: show nothing (do not display errors — the Drive save failure is logged in the service worker)
   - If summary footer doesn't exist (summary not showing), this method is a no-op
   - **Called by:** content script `'drive_save_result'` message handler (Task 5)

**CSS styles** added to `loadStyles()`:
- `.summary-section h3` — section headings (Summary, Action Items, Key Moments)
- `.summary-bullets` — styled `<ul>` with `--overlay-text` color
- `.action-item` — flex row with `.owner-badge` (small colored pill) + text
- `.owner-badge.you` — orange background, white text, uppercase
- `.owner-badge.them` — blue background, white text, uppercase
- `.key-moment` — card with left border colored by type (green=signal, red=objection, blue=decision, gray=quote)
- `.key-moments-toggle` — clickable header with arrow indicator that rotates on expand
- `.summary-footer` — fixed at bottom of panel, flex row, subtle top border
- `.summary-footer button` — larger than header controls, with text labels
- `.loading-pulse` — subtle pulsing animation for loading state
- All styles use existing CSS custom properties for light/dark theme support

**Key components:**
- `src/content/overlay.ts` — add `showLoading()`, `showSummary()`, `showSummaryError()`, `updateDriveStatus()` methods, extend `loadStyles()` with new CSS

**Notes:** The summary card replaces suggestions — don't show both. Keep the existing suggestion/transcript methods untouched (they're used during the active session). Track an internal `summaryShown: boolean` flag so the close button knows whether to just hide vs. also clear summary state.

---

### Task 5: Wire summary display into content script

**Intent:** Handle the new summary-related message types in the content script and manage overlay visibility during the summary flow.

**Context:** Depends on Tasks 3 (service worker sends messages) and 4 (overlay renders them). The service worker sends `summary_loading`, `call_summary`, and conditionally `HIDE_OVERLAY`. The content script routes these to the overlay. This also handles the edge case where the user dismissed the overlay during the call.

**Expected behavior:**

In the content script message listener, add four new cases:

1. `case 'summary_loading':` — Call `overlay.showLoading()`. If the overlay was previously hidden by the user (closed via X button), **do not re-show it** — check `overlayDismissedByUser` flag and skip. The user explicitly chose to close it; reopening it is hostile UX.

2. `case 'call_summary':` — If `overlayDismissedByUser` is false and overlay exists, call `overlay.showSummary(message.data)`. `message.data` is a `CallSummary` object (defined in `call-summary.ts`). If overlay was dismissed, skip silently (the summary still saved to Drive).

3. `case 'summary_error':` — If `overlayDismissedByUser` is false and overlay exists, call `overlay.showSummaryError(message.data.message)`. `message.data` has shape `{ message: string }`. If overlay was dismissed, skip silently.

4. `case 'drive_save_result':` — Update the Drive status indicator in the summary footer (if summary is showing). `message.data` has shape `{ saved: boolean; fileUrl?: string; error?: string }` (the `DriveSaveResult` interface from `drive-service.ts`). This uses a new `updateDriveStatus(result: { saved: boolean; fileUrl?: string })` method on the overlay. If `saved` is true, show "Saved to Drive" text. If false, show nothing (don't display Drive errors in the overlay — they're logged in the service worker).

**Tracking overlay dismissal:** Add a module-level `let overlayDismissedByUser = false;`. Set it to `true` in the existing `handleOverlayClose()` function. Reset it to `false` on `INIT_OVERLAY` (new session starts).

**Tab navigation safety:** If the user navigates away from the Meet page during summary generation, the `chrome.tabs.sendMessage()` from the service worker will fail with a connection error. This is already handled — every `sendMessage` call in the service worker is wrapped in `.catch(() => {})`. The content script doesn't need to do anything special.

**Key components:**
- `src/content/content-script.ts` — add `summary_loading`, `call_summary`, `summary_error`, `drive_save_result` cases; add `overlayDismissedByUser` tracking

**Notes:** Do NOT re-show the overlay if the user explicitly closed it. This is a deliberate UX decision. The user's intent to dismiss takes priority over showing the summary. The summary is not lost — it's saved to Drive if enabled. The `overlayDismissedByUser` flag resets on next session so the overlay appears normally for the next call.

---

### Task 6: Implement copy-to-clipboard

**Intent:** Wire the Copy button in the summary footer to format the summary as markdown and copy it to the clipboard.

**Context:** Depends on Task 1 (`formatSummaryAsMarkdown`) and Task 4 (the Copy button exists in the summary footer). The formatter lives in `call-summary.ts`; the click handler lives in the overlay.

**Expected behavior:** When the user clicks "Copy to Clipboard":
1. Call `formatSummaryAsMarkdown()` with the stored `CallSummary` reference
2. Call `navigator.clipboard.writeText(markdown)` — available on Google Meet (HTTPS context)
3. Show visual feedback: button text changes to "Copied!" for 2 seconds, then reverts to "Copy"
4. If clipboard write fails (e.g., focus lost, permissions), change button text to "Failed" for 2 seconds

**Key components:**
- `src/content/overlay.ts` — add click handler on the Copy button in `showSummary()`
- Import `formatSummaryAsMarkdown` from `call-summary.ts`

**Notes:** The `formatSummaryAsMarkdown` function is defined in `call-summary.ts` (a services file) but imported into the overlay (content script context). This works because Vite bundles everything — there's no runtime separation between service files and content files in the built output. The clipboard API is called in the content script context where the DOM focus exists.

---

### Task 7: Append summary to Drive transcript

**Intent:** Include the call summary in the transcript file saved to Google Drive.

**Context:** Depends on Tasks 1 (types + formatter) and 3 (service worker passes summary to Drive save). The `DriveService.formatTranscript()` method generates markdown/text/JSON files. The summary should be prepended before the raw transcript.

**Expected behavior:** Modify `DriveService` to accept an optional `CallSummary`:
- Add a `summary?: CallSummary | null` parameter to `saveTranscript()` and `formatTranscript()`
- Pass it through to `formatMarkdown()`, `formatText()`, `formatJson()`
- **Markdown format:** Prepend a `## Call Summary` section (using `formatSummaryAsMarkdown()` from `call-summary.ts`) before the existing `## Conversation` section, separated by `---`
- **Text format:** Prepend a `CALL SUMMARY` block with plain text formatting before the conversation section
- **JSON format:** Add a `summary` top-level key alongside `metadata` and `transcripts`, containing the `CallSummary` object (or `null` if not generated)
- If `summary` is `null` or `undefined`, produce exactly the same output as before — zero regressions

**Key components:**
- `src/services/drive-service.ts` — modify `saveTranscript()`, `formatTranscript()`, `formatMarkdown()`, `formatText()`, `formatJson()` signatures
- `src/background/service-worker.ts` — pass summary to `driveService.saveTranscript()` call in Task 3's orchestration

**Notes:** The Drive file title format stays unchanged (`Transcript - [date] (Xmin).md`). Don't rename to "Summary" — the file contains both the summary and the full transcript. The summary at the top is a convenience; the raw transcript below is the source of truth.

---

### Task 8: Add summary settings to Options page

**Intent:** Add a "Call Summary" settings card to the Options page with toggles for enabling/disabling summary generation and key moments. Also wire the settings reads into the service worker orchestration.

**Context:** This is independent of the core pipeline — it writes to `chrome.storage.local`, which the service worker reads in Task 3's orchestration flow. It follows the exact same pattern as the existing Speaker Filter card.

**Expected behavior:**

**HTML** — A new `options-card` between the Google Drive card and the Knowledge Base card:
- Title: "Call Summary"
- Description: "Get an AI-generated summary with action items when your calls end."
- Toggle 1: "Auto-generate call summary" (id: `summary-enabled-toggle`, default: checked)
  - Sub-description: "Uses one additional Gemini API call per session."
- Toggle 2: "Include key moments" (id: `summary-moments-toggle`, default: checked)
  - Sub-description: "Surfaces notable quotes and buying signals."
- Both toggles save to `chrome.storage.local` on change: keys `summaryEnabled`, `summaryKeyMomentsEnabled`

**Toggle dependency:** When Toggle 1 ("Auto-generate call summary") is unchecked, Toggle 2 ("Include key moments") must be **visually disabled** — set `disabled` attribute on the input, add `opacity: 0.5` to its `.toggle-row` container, and set `pointer-events: none`. The stored value of Toggle 2 is NOT changed when Toggle 1 is disabled — it retains its last state so that re-enabling Toggle 1 restores the previous key moments preference. This mirrors the pattern where a parent toggle controls a child toggle's availability without resetting its value.

**JavaScript** — In `OptionsController`:
- `loadSummarySettings()` — Read from storage, default both to `true` if keys don't exist
- `saveSummarySettings()` — Write on toggle change (same pattern as speaker filter — no separate save button)
- Event listeners on both toggles

**Settings wiring** — In the service worker's `handleStopSession()` (Task 3), the settings are already read from storage. This task just needs to verify the keys match: `summaryEnabled` and `summaryKeyMomentsEnabled`. The `includeKeyMoments` flag is passed to `generateCallSummary()` which passes it to `buildSummaryPrompt()`.

**Key components:**
- `src/options/options.html` — add new card HTML
- `src/options/options.ts` — add `loadSummarySettings()` and `saveSummarySettings()` to `OptionsController`
- No new CSS needed — reuses existing `toggle-row`, `toggle-switch`, `toggle-description` classes

**Notes:** The sub-description on Toggle 1 ("Uses one additional Gemini API call per session") is important for BYOK users who pay for their own API usage. Being transparent about cost prevents surprise when users check their Gemini dashboard. Default to enabled because the value proposition is high and the cost per call is fractions of a cent on Gemini Flash.

---

### Task 9: Build and validate end-to-end

**Intent:** Run the full build pipeline, verify TypeScript compiles cleanly, and validate individual components work.

**Context:** Depends on all previous tasks. This is the final integration check.

**Expected behavior:**
- `npm run typecheck` passes with zero errors
- `npm run build` produces a clean dist with no new warnings (beyond pre-existing pdfjs-dist chunk size warning)
- `npm run lint` passes (or only pre-existing warnings)
- Test the Gemini summary prompt via curl with a sample transcript — verify it returns valid JSON matching the `CallSummary` schema
- Test the markdown formatter with a sample `CallSummary` object via Node — verify output is correctly structured
- Verify the overlay summary card renders correctly when injected via Playwright MCP `browser_evaluate`
- Verify the Drive format functions include summary sections in all three formats (markdown, text, JSON)
- Verify the Options page new card renders with correct toggle states

**Key components:**
- All files from Tasks 1-8
- `wingman-ai/extension/dist/` — built output

**Notes:** This task catches integration issues — type mismatches between modules, missing imports, build errors. Don't test the live session flow (that requires a real Google Meet call with audio). Do verify the individual pipeline steps work in isolation: prompt → API → parse → format → render.

---

## Appendix

### Technical Decisions

**Gemini JSON mode over freeform parsing:** Using `responseMimeType: 'application/json'` in the Gemini `generationConfig` forces the model to return valid JSON. This eliminates the need for regex-based extraction of JSON from markdown code blocks, which is fragile. Requires Gemini 1.5+ (we're on `gemini-2.5-flash`).

**Summary at session end, not on-demand:** Generating the summary automatically removes a step from the rep's workflow. An on-demand button adds friction and reduces adoption. If reps want to skip, they disable it in settings.

**Overlay stays visible for summary:** The current `handleStopSession()` sends `HIDE_OVERLAY`. With summaries enabled, the overlay transitions to summary view instead of hiding. This is a behavioral change — the overlay's lifecycle extends beyond the active session. It hides when the user closes it, navigates away, or if no summary is available.

**Do not re-show a user-dismissed overlay:** If the user explicitly closed the overlay during the call (clicked X), we do not re-open it for the summary. Their intent to dismiss takes priority. The summary is still saved to Drive — it's not lost, just not shown.

**Prepend summary in Drive file:** Summaries go at the top of the Drive file because executives and managers (who review transcripts) want the summary first. The raw transcript below serves as backing evidence.

**Orchestration in service worker, not TranscriptCollector:** Summary generation, Drive save, and overlay messaging are orchestrated in `handleStopSession()` rather than buried in `TranscriptCollector.endSession()`. This keeps the collector simple (data in, data out) and leverages the service worker's message response lifecycle as a natural keepalive during async work.

**Speaker attribution heuristic:** Speaker 0 (the first detected speaker by Deepgram's diarization) is assumed to be the Wingman user. This matches the existing speaker filter behavior where the first speaker is treated as the consultant. The heuristic is imperfect (e.g., if the customer speaks first) but provides a reasonable default until proper self-identification is implemented.

**Transcript truncation at 500 entries:** For very long calls, the prompt truncates to the first 50 and last 400 transcripts. The threshold is not about Gemini's context window (1M tokens) but about response quality — extremely long prompts dilute the model's attention. Keeping the opening (context setting) and the ending (where decisions and action items concentrate) produces better summaries than including everything.

**API cost transparency:** Summary generation adds one Gemini Flash API call per session (~10-15K input tokens for a typical 30-min call). At current Gemini Flash pricing, this is fractions of a cent per call. The Options page explicitly notes this cost for BYOK transparency.

### Dependencies

| Dependency | Purpose | New? |
|-----------|---------|------|
| Gemini 2.5 Flash API | Summary generation | No (existing) |
| `chrome.storage.local` | Settings persistence | No (existing) |
| `navigator.clipboard` | Copy to clipboard | No (browser API) |
| Google Drive API | Summary appended to transcript | No (existing) |

No new external dependencies. No new npm packages. No new permissions in `manifest.json`.

### Out of Scope

- **Editing summaries in the overlay** — Read-only in v1. Reps edit after pasting into CRM.
- **CRM integrations** (Salesforce, HubSpot API push) — Requires OAuth flows and per-CRM logic. v2+.
- **Contact/account matching** from Google Calendar — Would enable pre-call briefs. Separate feature.
- **Pre-call briefs** from past summaries — Requires stored summary history. Separate feature.
- **Email follow-up draft generation** — Natural extension but separate scope.
- **Key moments cross-referencing with KB** — e.g., "They asked about SOC2 — your KB covers this." v2 enhancement.
- **Summary history/search** across calls — Requires a local database of past summaries. Separate feature.
- **Speaker self-identification** — `is_self` is currently hardcoded to `false`. Fixing this would improve action item attribution but is a separate task that requires changes to Deepgram diarization handling.
