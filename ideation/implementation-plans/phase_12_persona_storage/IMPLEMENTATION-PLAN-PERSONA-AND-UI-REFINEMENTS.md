# Implementation Plan: Persona & UI Refinements

---

## Executive Summary

A comprehensive refinement pass that makes personas the single hub for prompt + knowledge management, fixes cross-browser issues, and streamlines the options page layout. The Knowledge Base tab is removed — KB lives inside each persona editor with exclusive document ownership. Google Drive moves from the Advanced tab into Setup where it belongs. The Advanced tab is replaced with a lightweight Support page. The popup persona dropdown gets improved UI with better placement. Google Drive OAuth is fixed for Vivaldi and other Chromium browsers.

**Key Outcomes:**
- KB management embedded in each persona editor — upload, list, delete, test, all in one place
- KB documents exclusively owned by one persona (no shared references)
- Google Drive settings moved to the Setup tab alongside API keys
- Advanced tab becomes a simple "Support" tab with Buy Me a Coffee link
- Popup persona dropdown redesigned and moved above the status section
- Google Drive OAuth works in Vivaldi via `launchWebAuthFlow` fallback

---

## Product Manager Review

### Feature Overview

This plan covers two categories of work: (A) completing the persona-as-single-hub vision by embedding KB directly into persona editors, and (B) four UI/UX fixes identified through real user testing — Drive OAuth in Vivaldi, popup persona placement, Drive settings location, and Advanced tab cleanup.

### Features

#### Feature 1: KB Embedded in Persona Editor

**What it is:** The standalone "Knowledge Base" tab is removed. Each persona's editor includes a full KB section: drag-and-drop upload, document list with delete, upload progress, and test query — all scoped to that persona's documents.

**Why it matters:** Eliminates the split-brain UX where KB docs live in one tab but persona associations live in another. Users no longer need to mentally map between two separate views.

**User perspective:** User clicks a persona card → editor opens → they see the prompt textarea AND a "Knowledge Base" section below it. They drag a PDF onto it, it processes right there, and the doc appears in the list. Everything about the persona lives in one place.

---

#### Feature 2: Exclusive Document Ownership

**What it is:** Each KB document belongs to exactly one persona. No sharing via checkboxes. If you need the same file for two personas, upload it twice.

**Why it matters:** Simplifies the mental model. "This persona has these docs" is unambiguous. When a persona is deleted, its KB docs are deleted too.

**User perspective:** Upload a doc inside Persona A's editor — it's Persona A's doc. Delete Persona A, all its docs go with it (with a confirmation warning).

---

#### Feature 3: Google Drive in Setup Tab

**What it is:** The Google Drive Integration card moves from the Advanced tab to the Setup tab, below the API Keys card.

**Why it matters:** Drive is a core setup step — users configure API keys and Drive connection during onboarding. Hiding it in "Advanced" made users miss it entirely.

**User perspective:** Open Options → Setup tab shows API keys at the top, Google Drive below. One-stop initial configuration.

---

#### Feature 4: Advanced Tab → Support Tab

**What it is:** The Advanced tab is renamed to "Support" and contains only a Buy Me a Coffee link/card. The system prompt read-only section is removed (it was already redundant with the Personas tab).

**Why it matters:** Declutters the options page. The system prompt is editable in the Personas tab — the read-only copy in Advanced served no purpose. The Support tab gives the Buy Me a Coffee link a dedicated home.

**User perspective:** The tab bar reads: Setup, Call Settings, Personas, Support. Clean and focused.

---

#### Feature 5: Popup Persona Dropdown Redesign

**What it is:** The persona dropdown in the popup moves above the status indicators (API Keys / Session) and gets better visual design — styled as a prominent card rather than a small select element.

**Why it matters:** Persona selection is the first thing a user does before starting a session. It should be the most prominent element, not buried below status rows.

**User perspective:** Open popup → immediately see which persona is selected at the top → one click to switch → then see status → then click Start Session.

---

#### Feature 6: Google Drive OAuth for Vivaldi

**What it is:** Add `chrome.identity.launchWebAuthFlow()` as a fallback when `chrome.identity.getAuthToken()` fails. This enables Drive OAuth in Vivaldi and other Chromium-based browsers where the Chrome Identity API is unsupported or restricted.

**Why it matters:** Vivaldi users currently see a silent failure when clicking "Connect Google Account." This blocks the entire Drive auto-save feature for non-Chrome Chromium browsers.

**User perspective:** Click "Connect Google Account" in Vivaldi → Google OAuth consent screen appears in a popup → authorize → connected.

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
| [ ] | 1 | Remove KB tab and panel from options HTML | | | | | |
| [ ] | 2 | Remove KnowledgeBaseSection from options.ts | | | | | |
| [ ] | 3 | Add KB section HTML to persona editor (upload, list, test) | | | | | |
| [ ] | 4 | Implement KB upload logic in PersonaSection | | | | | |
| [ ] | 5 | Implement KB document list & delete in PersonaSection | | | | | |
| [ ] | 6 | Implement KB test query in PersonaSection | | | | | |
| [ ] | 7 | Update persona delete to cascade-delete KB docs | | | | | |
| [ ] | 8 | Remove KB checkbox picker, update save logic | | | | | |
| [ ] | 9 | Review migration for exclusive ownership | | | | | |
| [ ] | 10 | Update export/import for exclusive ownership | | | | | |
| [ ] | 11 | Delete knowledge-base.ts | | | | | |
| [ ] | 12 | Move Google Drive card from Advanced to Setup tab | | | | | |
| [ ] | 13 | Replace Advanced tab with Support tab (Buy Me a Coffee) | | | | | |
| [ ] | 14 | Remove SystemPromptSection (no longer needed) | | | | | |
| [ ] | 15 | Redesign popup persona dropdown above status section | | | | | |
| [ ] | 16 | Fix Google Drive OAuth for Vivaldi (launchWebAuthFlow fallback) | | | | | |
| [ ] | 17 | CSS cleanup — KB styles, orphaned styles, popup styles | | | | | |
| [ ] | 18 | Build verification & manual testing | | | | | |

**Summary:**
- Total tasks: 18
- Completed: 0
- Total time spent: 0 minutes
- Total human estimate: 0 minutes
- Overall multiplier: –

---

## Task Descriptions

This section provides context for each task. Read the relevant description before starting implementation.

---

### Task 1: Remove KB tab and panel from options HTML

**Intent:** Delete the Knowledge Base tab button and its entire panel from `options.html`.

**Context:** First step — clear out the standalone KB tab. The KB functionality will be rebuilt inside the persona editor in subsequent tasks. Tab bar changes from: Setup, Call Settings, Personas, Knowledge Base, Advanced → Setup, Call Settings, Personas, Advanced (Advanced is renamed later in Task 13).

**Expected behavior:**
- Remove the `<button id="tab-kb" ...>` tab button from the `nav.tab-bar`
- Remove the entire `<div id="panel-kb" ...>` panel and all its contents
- The TabManager continues to work with the remaining tabs

**Key components:**
- `src/options/options.html`

**Notes:** Don't worry about broken JS references yet — Task 2 removes the KnowledgeBaseSection class.

---

### Task 2: Remove KnowledgeBaseSection from options.ts

**Intent:** Stop initializing the now-deleted KnowledgeBaseSection and remove its import.

**Context:** Depends on Task 1.

**Expected behavior:**
- Remove `import { KnowledgeBaseSection }` from `options.ts`
- Remove `new KnowledgeBaseSection().init(ctx)` from the `init()` method
- Options page loads cleanly

**Key components:**
- `src/options/options.ts`

**Notes:** Don't delete `knowledge-base.ts` yet — Task 11 handles that after all KB logic has been moved.

---

### Task 3: Add KB section HTML to persona editor (upload, list, test)

**Intent:** Add the full KB management UI inside the persona editor: upload drop zone, document list, and test query section.

**Context:** Depends on Task 1. Replaces the old `#persona-kb-list` checkbox picker with a complete KB section. The old KB tab HTML serves as reference for the structure.

**Expected behavior:**
- After the system prompt textarea, add a "Knowledge Base" heading with clear visual separation
- Upload zone: dashed-border drop area with "Drop files here or click to browse" text (`.kb-drop-zone` pattern), hidden file input accepting `.pdf,.md,.txt`, `multiple` attribute
- Progress bar (hidden by default): `persona-kb-progress`, `persona-kb-progress-fill`, `persona-kb-progress-text`
- Document list container: `persona-kb-doc-list` (populated by JS)
- Empty state: `persona-kb-empty` — "No documents uploaded yet."
- Stats line: `persona-kb-stats`
- Test section (hidden by default): `persona-kb-test-section` with input, button, and results container
- All IDs prefixed with `persona-kb-` to avoid conflicts
- Place AFTER the prompt textarea and BEFORE the action buttons (Save/Delete/etc)

**Key components:**
- `src/options/options.html` (add KB section inside `#persona-editor`)

---

### Task 4: Implement KB upload logic in PersonaSection

**Intent:** Wire up the drop zone and file input to handle file uploads, process via `ingestDocument()`, and auto-associate with the current persona.

**Context:** Depends on Task 3. When a user drops a file in the persona editor, it gets ingested and its document ID is immediately added to `this.editingPersona.kbDocumentIds`.

**Expected behavior:**
- Bind click, dragover, dragleave, drop events on the drop zone
- Bind change event on the file input
- On file drop/select:
  1. Show progress bar, disable drop zone
  2. Call `ingestDocument(file, onProgress)` from `kb-database.ts`
  3. On success: add `result.documentId` to `this.editingPersona.kbDocumentIds`, save persona to storage
  4. On failure: show error toast
  5. Hide progress bar, re-enable drop zone, re-render doc list
- Reject if `isIngesting()` returns true
- Process multiple files sequentially

**Key components:**
- `src/options/sections/personas.ts`
- `src/services/kb/kb-database.ts` (imported for `ingestDocument`, `isIngesting`)

**Notes:** Also add `initDB()` logic from the old KnowledgeBaseSection — on editor open, call `kbDatabase.init()` and clean up any incomplete documents.

---

### Task 5: Implement KB document list & delete in PersonaSection

**Intent:** Render the persona's KB documents and handle deletion from both persona and IndexedDB.

**Context:** Depends on Task 4. Shows ONLY the persona's own documents.

**Expected behavior:**
- `renderPersonaDocList()` method:
  1. `kbDatabase.init()` → `kbDatabase.getDocuments()`
  2. Filter to docs in `this.editingPersona.kbDocumentIds` with `status === 'complete'`
  3. Render each doc: icon, filename, chunk count, size, time ago, delete button
  4. Show/hide empty state and test section
  5. Update stats
- Delete: confirm modal → `kbDatabase.deleteDocument(docId)` → remove from `kbDocumentIds` → save persona → re-render → toast
- Called on editor open and after each upload

**Key components:**
- `src/options/sections/personas.ts`
- `src/services/kb/kb-database.ts`

**Notes:** Add `timeAgo()` and `formatFileSize()` helpers to PersonaSection (copied from knowledge-base.ts).

---

### Task 6: Implement KB test query in PersonaSection

**Intent:** Wire up the test query to search the persona's KB documents.

**Context:** Depends on Task 5. Scoped to persona's documents via `searchKB(query, undefined, undefined, this.editingPersona.kbDocumentIds)`.

**Expected behavior:**
- Bind click on test button and Enter on test input
- Disable button, show "Searching..." → call `searchKB()` with persona's doc IDs → render results → re-enable
- No results: "No matching sections found"
- Error: toast, re-enable in `finally`

**Key components:**
- `src/options/sections/personas.ts`
- `src/services/kb/kb-search.ts` (imported for `searchKB`)

---

### Task 7: Update persona delete to cascade-delete KB docs

**Intent:** When a persona is deleted, also delete all its KB documents from IndexedDB.

**Context:** With exclusive ownership, orphaned docs waste storage.

**Expected behavior:**
- Confirmation: "Delete {name}? This will also delete {N} Knowledge Base document(s). This cannot be undone."
- On confirm: iterate `kbDocumentIds`, call `kbDatabase.deleteDocument(docId)` for each (catch errors per-doc), then remove persona, save, handle active fallback

**Key components:**
- `src/options/sections/personas.ts`

---

### Task 8: Remove KB checkbox picker, update save logic

**Intent:** Remove the old checkbox-based KB picker and its methods.

**Context:** Replaced by the inline upload/doc list.

**Expected behavior:**
- Remove `<div id="persona-kb-list" class="persona-kb-list">` from `options.html`
- Remove `renderKBPicker()`, `getSelectedKBDocIds()`, `this.kbListEl` from `personas.ts`
- `save()` no longer calls `getSelectedKBDocIds()` — uses `this.editingPersona.kbDocumentIds` directly

**Key components:**
- `src/options/options.html`
- `src/options/sections/personas.ts`

---

### Task 9: Review migration for exclusive ownership

**Intent:** Confirm the migration still works correctly with exclusive ownership.

**Context:** The existing migration creates a "Default" persona with all pre-existing KB docs. This is correct — those docs were uploaded before personas existed, so Default legitimately owns them. No code changes needed; this task is a review.

**Expected behavior:**
- Migration still assigns existing KB docs to Default (backwards compat)
- New documents are only uploaded through persona editors (the KB tab no longer exists)

**Key components:**
- `src/shared/persona.ts` (review only)

---

### Task 10: Update export/import for exclusive ownership

**Intent:** Verify export/import works with exclusive ownership and update progress UI element refs.

**Context:** Export already includes KB text from persona's `kbDocumentIds`. Import already re-ingests and assigns. Update import progress bar to use `persona-kb-` prefixed elements.

**Key components:**
- `src/options/sections/personas.ts`

---

### Task 11: Delete knowledge-base.ts

**Intent:** Delete the now-unused file.

**Context:** All KB functionality moved to PersonaSection.

**Expected behavior:**
- Delete `src/options/sections/knowledge-base.ts`
- Verify nothing imports it
- Build passes

**Key components:**
- `src/options/sections/knowledge-base.ts` (delete)

---

### Task 12: Move Google Drive card from Advanced to Setup tab

**Intent:** Move the Google Drive Integration card from `panel-advanced` to `panel-setup`, below the API Keys card.

**Context:** Drive is a core setup step that belongs with API key configuration. The Advanced tab is being simplified (Task 13).

**Expected behavior:**
- Cut the entire Google Drive `<div class="options-card">` from `panel-advanced`
- Paste it into `panel-setup`, after the API Keys card
- No JS changes needed — `DriveSection` binds to element IDs, which remain the same
- Drive settings appear below API keys on the Setup tab

**Key components:**
- `src/options/options.html`

---

### Task 13: Replace Advanced tab with Support tab (Buy Me a Coffee)

**Intent:** Replace the Advanced tab with a lightweight "Support" tab containing only the Buy Me a Coffee link.

**Context:** Depends on Task 12 (Drive moved out) and Task 14 (SystemPromptSection removed). The Advanced tab's two cards (system prompt + Drive) are both gone. Replace it entirely.

**Expected behavior:**
- Rename the tab button: change label from "Advanced" to "Support", update `id`, `data-tab`, `aria-controls` to `tab-support`, `panel-support`
- Replace the tab icon with a heart or coffee icon SVG
- Replace `panel-advanced` with `panel-support` containing a single card:
  - Title: "Support Wingman"
  - Description: "If Wingman helps you close deals, consider buying the developer a coffee."
  - Prominent Buy Me a Coffee link/button: `https://buymeacoffee.com/antoinedubuc`
  - Optional: version info, links to tutorials, GitHub

**Key components:**
- `src/options/options.html` (replace tab + panel)

---

### Task 14: Remove SystemPromptSection (no longer needed)

**Intent:** Delete the `SystemPromptSection` class and remove it from `options.ts`.

**Context:** The system prompt read-only section lived in the Advanced tab. With Advanced becoming Support, and the prompt being editable in Personas, the SystemPromptSection serves no purpose.

**Expected behavior:**
- Remove the system prompt card HTML from `panel-advanced` (if not already gone from Task 13)
- Remove `import { SystemPromptSection }` and `this.systemPrompt.init(ctx)` from `options.ts`
- Remove dirty/save references to `this.systemPrompt`
- Delete `src/options/sections/system-prompt.ts`
- The `beforeunload` and Cmd+S handlers only reference `this.personas` now

**Key components:**
- `src/options/options.ts`
- `src/options/sections/system-prompt.ts` (delete)
- `src/options/options.html`

---

### Task 15: Redesign popup persona dropdown above status section

**Intent:** Move the persona selector above the API Keys / Session status rows and give it better visual design.

**Context:** Persona selection is the first action before starting a session — it should be the most prominent popup element.

**Expected behavior:**
- Move `<section class="persona-section">` above `<section class="status-section">` in `popup.html`
- Redesign as a more prominent card:
  - Full-width styled dropdown with the active persona's color dot next to the name
  - Slightly larger font, better padding
  - Label "Active Persona" above the dropdown
  - Remove the "Takes effect on next session" hint (Phase 13 will enable live switching)
- CSS updates for the new placement and styling
- Hide if only one persona named "Default" (same logic as before)

**Key components:**
- `src/popup/popup.html`
- `src/popup/popup.css`

---

### Task 16: Fix Google Drive OAuth for Vivaldi (launchWebAuthFlow fallback)

**Intent:** Add a `chrome.identity.launchWebAuthFlow()` fallback so Drive OAuth works in Vivaldi and other Chromium browsers.

**Context:** `chrome.identity.getAuthToken()` is Chrome-specific and fails silently in Vivaldi. The `launchWebAuthFlow()` API works across all Chromium browsers — it opens a popup window for OAuth consent.

**Expected behavior:**
- In `DriveService.getAuthToken()`:
  1. Try `chrome.identity.getAuthToken({ interactive })` first
  2. If it fails (returns null or errors), fall back to `chrome.identity.launchWebAuthFlow()`
  3. The `launchWebAuthFlow` needs:
     - `url`: Google OAuth URL with `client_id`, `redirect_uri`, `scope=https://www.googleapis.com/auth/drive.file email`, `response_type=token`
     - `interactive: true`
     - `redirect_uri`: `chrome.identity.getRedirectURL()` (works in all Chromium browsers)
  4. Parse the access token from the redirect URL fragment
  5. Return the token
- The `manifest.json` `oauth2` section remains for Chrome-native auth; the fallback handles everything else
- The rest of the Drive service (API calls, save, disconnect) continues to use the token transparently

**Key components:**
- `src/services/drive-service.ts` (modify `getAuthToken`)
- `manifest.json` (verify `oauth2.client_id` and scopes are present for `launchWebAuthFlow`)

**Notes:** `launchWebAuthFlow` returns the full redirect URL. Parse the token from the hash fragment: `#access_token=...&token_type=bearer&expires_in=3600`. The `chrome.identity.getRedirectURL()` provides the correct redirect URI. For `removeCachedAuthToken`, wrap in try/catch since it may not work with `launchWebAuthFlow` tokens — just clear local storage on disconnect instead.

---

### Task 17: CSS cleanup — KB styles, orphaned styles, popup styles

**Intent:** Audit all CSS for orphaned styles and ensure KB styles work in the persona editor.

**Context:** Depends on all previous tasks.

**Expected behavior:**
- Verify `.kb-*` CSS classes render correctly inside `#persona-editor`
- Remove orphaned KB panel styles, old `.persona-kb-item` checkbox styles
- Remove system prompt section styles if orphaned
- Verify popup persona dropdown styles work with new placement
- Test both light and dark themes

**Key components:**
- `src/options/options.css`
- `src/popup/popup.css`

---

### Task 18: Build verification & manual testing

**Intent:** Verify everything builds and works end-to-end.

**Context:** Depends on all previous tasks.

**Expected behavior:**
- `npm run typecheck` passes
- `npm run build` succeeds
- Manual test in Chrome AND Vivaldi:
  1. Options → Setup tab shows API keys + Google Drive
  2. Options → Personas tab → click persona → editor shows prompt + KB section
  3. Upload file in persona editor → progress → doc appears
  4. Test query → results scoped to persona's docs
  5. Create second persona → upload different file → test confirms scoping
  6. Delete persona → confirms KB deletion → docs removed from IndexedDB
  7. Export/import persona works
  8. No "Knowledge Base" tab or "Advanced" tab in tab bar
  9. "Support" tab shows Buy Me a Coffee
  10. Popup → persona dropdown at top above status rows
  11. Google Drive connect works in both Chrome and Vivaldi
  12. Start session → suggestions use active persona's prompt and KB

**Key components:**
- All files from previous tasks
- `wingman-ai/extension/` (build commands)

---

## Appendix

### Technical Decisions

1. **Exclusive document ownership:** Each KB document belongs to one persona only. Simpler mental model, eliminates association UX confusion. Tradeoff: users must re-upload for multiple personas.

2. **Cascade delete:** Deleting a persona deletes its KB documents from IndexedDB.

3. **Upload auto-associates:** Ingested document ID immediately added to persona's `kbDocumentIds` and saved.

4. **Migration preserves existing docs:** One-time migration still assigns pre-existing KB docs to Default persona.

5. **Drive in Setup:** Drive is a first-run configuration step, not an advanced feature.

6. **launchWebAuthFlow fallback:** Try `getAuthToken` first (Chrome-native, cleaner UX), fall back to `launchWebAuthFlow` (universal Chromium compat). Both produce a valid OAuth token.

7. **SystemPromptSection removed entirely:** With the prompt living exclusively in persona editors, the read-only copy was dead weight.

### Dependencies

- No new npm packages
- Existing: `kbDatabase`, `ingestDocument`, `isIngesting`, `searchKB`, `icon()`, `driveService`
- `chrome.identity.launchWebAuthFlow()` — available in all Chromium 29+ browsers
- Google OAuth client ID must be configured in `manifest.json` `oauth2` section

### Out of Scope

- Sharing a single KB document across multiple personas
- Live persona switching mid-session (Phase 13)
- Moving KB storage out of IndexedDB
- Changing the chunking/embedding pipeline
- Backend-mediated OAuth (stays fully client-side)
