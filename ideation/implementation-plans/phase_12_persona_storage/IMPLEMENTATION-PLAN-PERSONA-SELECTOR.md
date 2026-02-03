# Implementation Plan: Persona Selector & Storage

---

## Executive Summary

Personas let Wingman users bundle a system prompt + a set of KB documents into named, switchable presets. A salesperson handling multiple products or call types can switch contexts in two clicks from the popup — no manual prompt rewriting or KB re-uploading. Personas also make prompt A/B testing trivial: duplicate a persona, tweak the prompt, compare across real calls. Import/export enables sharing proven configurations across a team.

**Key Outcomes:**
- Users can create, edit, duplicate, and delete named personas from the options page
- A persona dropdown in the popup allows switching before a call without opening settings
- KB search is filtered to only the documents assigned to the active persona
- Personas can be exported as `.json` files and imported on another machine
- Existing users are migrated seamlessly — a "Default" persona is created from their current settings

---

## Product Manager Review

### Feature Overview

Phase 12 introduces the persona system — the first multi-configuration capability in Wingman. It touches four user-facing surfaces (options page, popup, overlay, KB tab) and one backend integration point (KB search filtering). The system prompt editor moves inside the persona editor to eliminate the "which prompt is active?" confusion.

### Features

#### Feature 1: Persona CRUD & Options Page Tab

**What it is:** A new "Personas" tab in the options page where users create, edit, duplicate, and delete named personas — each with a name, color tag, system prompt, and KB document assignments.

**Why it matters:** Eliminates the manual prompt-swapping workflow. Users set up once, switch forever. Duplicate makes A/B testing prompts a one-click operation.

**User perspective:** User opens Personas tab → sees a list of their personas as cards → clicks "New Persona" or edits an existing one → writes a prompt, picks a color, checks off which KB docs to include → saves. To test a prompt variant, they click "Duplicate" and tweak the copy.

---

#### Feature 2: Quick-Switch from Popup & Overlay Indicator

**What it is:** A persona dropdown in the extension popup for switching before a call, and a persona name/color indicator in the overlay header during a call.

**Why it matters:** The popup is the pre-call touchpoint — switching must be fast and not require opening the full settings page. The overlay indicator prevents the "which persona am I running?" uncertainty during a live call.

**User perspective:** User clicks popup → sees "Cloud Security Demo" in a dropdown above the Start Session button → switches to "Analytics Discovery" → starts session. During the call, the overlay header reads "Wingman · Analytics Discovery" with a colored dot.

---

#### Feature 3: Persona-Scoped KB Search

**What it is:** KB search filters results to only the documents assigned to the active persona, so suggestions pull from relevant knowledge only.

**Why it matters:** Without this, a user selling Product A would get KB results from Product B documents, producing confusing or wrong suggestions. Persona-scoped search makes the KB actually useful for multi-product reps.

**User perspective:** Transparent — the user just notices that suggestions are more relevant because Wingman is only searching the right documents.

---

#### Feature 4: Import / Export

**What it is:** Export a persona (including the extracted text of its KB documents) as a `.json` file. Import a persona file on another machine, which re-chunks and re-embeds the KB text using the local Gemini key.

**Why it matters:** A sales manager can craft a perfect persona + KB combo and distribute it to the entire team. New hires get the same AI coaching on day one.

**User perspective:** Manager clicks "Export" on a persona → gets a `.json` file → shares via Slack/email. New hire clicks "Import" on Personas tab → selects the file → sees a preview → confirms → progress bar as KB docs are processed → persona appears in their list.

---

#### Feature 5: Migration & System Prompt Consolidation

**What it is:** On update, existing settings are auto-migrated into a "Default" persona. The standalone system prompt editor becomes a read-only preview linking to the Personas tab.

**Why it matters:** Zero disruption for existing users. The consolidation prevents the "I edited the prompt in Advanced but the persona has a different one" bug that two separate editors would cause.

**User perspective:** After update, everything works the same. The popup now shows "Default" in a dropdown. If they open Advanced tab, the prompt section says "Editing moved to Personas tab" with a link.

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
| [ ] | 1 | Persona data model & storage helpers | | | | | |
| [ ] | 2 | Migration: create Default persona from existing settings | | | | | |
| [ ] | 3 | Options page: Personas tab HTML & CSS | | | | | |
| [ ] | 4 | Options page: PersonaSection class (CRUD, color picker, KB picker) | | | | | |
| [ ] | 5 | Options page: Duplicate persona | | | | | |
| [ ] | 6 | System prompt section → read-only with link to Personas tab | | | | | |
| [ ] | 7 | KB search: add documentIds filter | | | | | |
| [ ] | 8 | Service worker: load active persona on session start | | | | | |
| [ ] | 9 | Popup: persona dropdown switcher | | | | | |
| [ ] | 10 | Overlay: persona name & color in header | | | | | |
| [ ] | 11 | KB tab: show persona color dots on documents | | | | | |
| [ ] | 12 | Export persona to JSON | | | | | |
| [ ] | 13 | Import persona from JSON with preview & progress | | | | | |
| [ ] | 14 | Edge cases & safety nets | | | | | |
| [ ] | 15 | Build verification & manual testing | | | | | |

**Summary:**
- Total tasks: 15
- Completed: 0
- Total time spent: 0 minutes
- Total human estimate: 0 minutes
- Overall multiplier: –

---

## Task Descriptions

This section provides context for each task. Read the relevant description before starting implementation.

---

### Task 1: Persona data model & storage helpers

**Intent:** Define the Persona TypeScript interface and build the storage utility functions that all other tasks depend on.

**Context:** This is the foundation. Every other task imports from this module. Personas are stored in `chrome.storage.local` (not IndexedDB) because they're small data — a prompt string + a list of document IDs. KB documents remain in IndexedDB.

**Expected behavior:**
- A `Persona` interface with `id`, `name`, `color`, `systemPrompt`, `kbDocumentIds`, `createdAt`, `updatedAt`
- A preset list of 8 persona colors (hex values) — e.g., blue, green, orange, purple, red, teal, pink, amber
- Storage helper functions: `getPersonas()`, `savePersonas(personas)`, `getActivePersonaId()`, `setActivePersonaId(id)`, `getActivePersona()` (convenience: loads personas + finds active one)
- `createPersona(name, systemPrompt, color, kbDocumentIds)` → generates UUID, timestamps, returns full Persona
- All functions are async and use `chrome.storage.local`

**Key components:**
- New file: `src/shared/persona.ts`

**Notes:** Use `crypto.randomUUID()` for IDs (available in service worker and content script contexts). The color preset list should be a named export so the options page can render swatches. Keep the module dependency-free — no imports from services or options sections.

---

### Task 2: Migration: create Default persona from existing settings

**Intent:** Ensure existing users see zero behavior change after the update. Their current system prompt and KB documents are preserved as a "Default" persona.

**Context:** Depends on Task 1. Runs once on extension load. Must handle: (a) fresh install (no `systemPrompt` in storage, no KB docs), (b) existing user with custom prompt + KB docs, (c) migration already ran (personas key exists).

**Expected behavior:**
- On options page load and on service worker startup, check if `personas` key exists in storage
- If not: read `systemPrompt` from storage (fallback to `DEFAULT_SYSTEM_PROMPT`), read all KB document IDs from IndexedDB via `kbDatabase.getDocuments()`, create a "Default" persona with color blue, save it, set as active
- If `personas` exists: do nothing
- Write a `migrateToPersonas()` function in `src/shared/persona.ts` that can be called from both the options page and service worker

**Key components:**
- `src/shared/persona.ts` (add `migrateToPersonas()`)
- `src/options/options.ts` (call migration before section init)
- `src/background/service-worker.ts` (call migration at top level)

**Notes:** The migration must import `kbDatabase` dynamically (it may not be initialized yet in the service worker context). If IndexedDB is unavailable or empty, create the Default persona with an empty `kbDocumentIds` array. Keep the legacy `systemPrompt` key in storage — don't delete it — so a rollback to the previous version still works.

---

### Task 3: Options page: Personas tab HTML & CSS

**Intent:** Add the Personas tab to the options page navigation and create the HTML structure for the persona list and editor.

**Context:** Depends on Task 1. The options page uses a tab bar (`nav.tab-bar`) with buttons (`[role="tab"]`) and panels (`[role="tabpanel"]`). The `TabManager` class handles switching automatically based on `data-tab` and `data-panel` attributes. Adding a new tab is: add a `<button>` to the nav + add a `<div class="tab-panel">` to the main content.

**Expected behavior:**
- New "Personas" tab appears between "Call Settings" and "Knowledge Base" in the tab bar (so the order is: Setup, Call Settings, **Personas**, Knowledge Base, Advanced)
- Tab icon: a people/user icon SVG (consistent with existing tab icon style — 20x20, stroke-based)
- Panel contains:
  - Header row: "Personas" title + "New Persona" button + "Import" button
  - Persona list container (`#persona-list`) — will be populated by JS
  - Empty state: "Create your first persona to bundle a system prompt with specific Knowledge Base documents."
  - Hidden persona editor section (`#persona-editor`) with: name input, color picker (row of 8 color swatches), system prompt textarea (reuse same validation/char count pattern from current system-prompt section), KB document checklist container, action buttons (Save, Duplicate, Export, Delete, Cancel)
- CSS follows existing options page patterns — `.options-card`, `.form-section-title`, `.text-input`, button styles
- Color swatches: small circles (24px), colored background, border on selected, click to select
- KB document checklist: each row is a checkbox + filename + file type icon + size — similar to current KB doc list but with checkbox prepended

**Key components:**
- `src/options/options.html` (add tab button + panel HTML)
- `src/options/options.css` (add persona-specific styles)

**Notes:** Don't wire up any JS behavior yet — that's Task 4. Focus on getting the HTML structure and CSS right. The editor section starts hidden (`hidden` attribute) and is shown by JS when editing. Use the same inline SVG pattern as other tab icons. The system prompt textarea in the editor should have id `persona-prompt-textarea` to avoid conflicting with the existing `prompt-textarea` id.

---

### Task 4: Options page: PersonaSection class (CRUD, color picker, KB picker)

**Intent:** Wire up all interactive behavior for the Personas tab — listing personas, creating/editing/deleting them, selecting colors, and assigning KB documents.

**Context:** Depends on Tasks 1, 2, 3. Follows the section pattern established by other options sections: class with `init(ctx)`, DOM bindings, async `load()`/`save()` methods, uses `ctx.showToast()` and `ctx.showConfirmModal()`. This is the largest single task.

**Expected behavior:**
- **List rendering:** On init, load personas from storage, render as cards in `#persona-list`. Each card shows: color dot, name, "X KB docs" subtitle, "Active" badge if it's the active persona. Clicking a card opens the editor for that persona.
- **"Set Active" interaction:** Each persona card has a radio-button or "Activate" button. Clicking it sets `activePersonaId` in storage. The previously active card loses the badge, the new one gains it. Toast: "Switched to {name}".
- **New persona:** "New Persona" button creates a persona with name "New Persona", the default system prompt, first available color, no KB docs. Opens editor immediately.
- **Editor — name:** Text input, updates on blur or Enter.
- **Editor — color picker:** Row of swatches. Clicking one selects it (adds a border/checkmark). Selected color is stored in the persona.
- **Editor — system prompt:** Textarea with char count (same pattern as `SystemPromptSection` — min 100, max 10,000 chars, warning at 80%). Save validates before writing.
- **Editor — KB document picker:** On editor open, load all completed documents from IndexedDB via `kbDatabase.getDocuments()`. Render as checkboxes. Pre-check the ones in the persona's `kbDocumentIds`. When checkboxes change, update the persona's array.
- **Save:** Writes persona back to the `personas` array in storage. Toast: "Persona saved". Re-renders list.
- **Delete:** Confirm modal → removes persona from array → saves → if it was active, set the first remaining persona as active (or create a new Default if none left). Toast: "Deleted {name}". Includes checkbox option: "Also delete KB documents only used by this persona".
- **Cancel:** Closes editor, discards unsaved changes.
- **Dirty tracking:** Warn on tab switch or page leave if editor has unsaved changes (reuse the `beforeunload` pattern from current `OptionsController`).

**Key components:**
- New file: `src/options/sections/personas.ts`
- `src/options/options.ts` (instantiate and init `PersonaSection`, update Cmd+S handler)
- `src/shared/persona.ts` (imported for storage helpers)

**Notes:** The KB document list in the editor needs to refresh if the user uploads/deletes a doc on the KB tab and then comes back. Listen to a custom event or re-query on editor open. The Cmd+S shortcut in `OptionsController` should save the active persona if the Personas tab is active (check which tab is shown). Keep the `isDirty` logic scoped to the persona editor — don't interfere with other sections.

---

### Task 5: Options page: Duplicate persona

**Intent:** Add a "Duplicate" button that copies an existing persona for prompt A/B testing.

**Context:** Depends on Task 4. This is a small addition to the persona editor — a button that creates a new persona from the current one.

**Expected behavior:**
- "Duplicate" button in the editor action bar (next to Export, before Delete)
- On click: creates a new persona with name "{original name} (copy)", same color, same system prompt, same `kbDocumentIds`
- New persona is saved to storage immediately
- Editor switches to the new copy so the user can rename/edit it
- Toast: "Persona duplicated"
- If the name "{original name} (copy)" already exists, append a number: "(copy 2)", "(copy 3)", etc.

**Key components:**
- `src/options/sections/personas.ts` (add duplicate method)

**Notes:** Duplicate does NOT duplicate KB documents — it references the same document IDs. This is intentional: the user is testing different prompts against the same knowledge, not duplicating storage.

---

### Task 6: System prompt section → read-only with link to Personas tab

**Intent:** Replace the editable system prompt section in the Advanced tab with a read-only display that links to the Personas tab, eliminating the "two editors" confusion.

**Context:** Depends on Tasks 2 and 4. The current `SystemPromptSection` in `src/options/sections/system-prompt.ts` manages a textarea + save/reset buttons. After personas, the prompt lives inside each persona. The Advanced tab should show which prompt is active (for quick reference) but not allow editing there.

**Expected behavior:**
- The Advanced tab's system prompt section changes to:
  - Title: "System Prompt" (unchanged)
  - Subtitle: "Active persona: {name}" with the persona's color dot
  - The prompt textarea becomes `readonly` with a muted background
  - The Save/Reset buttons are replaced with a single "Edit in Personas" button that switches to the Personas tab and opens the editor for the active persona
- `SystemPromptSection.save()` becomes a no-op (or is removed). The `dirty` getter returns `false` always.
- The Cmd+S handler in `OptionsController` is updated to only trigger save in the Personas section.
- The `beforeunload` warning is now driven by `PersonaSection.dirty` instead of `SystemPromptSection.dirty`.

**Key components:**
- `src/options/sections/system-prompt.ts` (refactor to read-only mode)
- `src/options/options.html` (update the prompt section HTML in the Advanced panel)
- `src/options/options.ts` (update Cmd+S and beforeunload to reference PersonaSection)

**Notes:** Keep the `SystemPromptSection` class — don't delete it. It still needs to load and display the active persona's prompt. It just loses its write capability. The textarea retains its char count display (read-only) for reference.

---

### Task 7: KB search: add documentIds filter

**Intent:** Make `searchKB()` and `getKBContext()` accept an optional list of document IDs so that only chunks belonging to the active persona's KB documents are searched.

**Context:** Depends on Task 1. This is the backend integration that makes persona-scoped knowledge work. Currently `searchKB()` searches all chunks. With the filter, it skips chunks whose `documentId` is not in the allowed list.

**Expected behavior:**
- `searchKB(query, topK, threshold, documentIds?)` — new optional fourth parameter
- When `documentIds` is provided and non-empty, filter chunks: only process those where `chunk.documentId` is in the set
- When `documentIds` is `undefined`, `null`, or empty array → search all chunks (backwards compatible)
- `getKBContext(utterance, documentIds?)` — same optional parameter, passed through to `searchKB()`
- Use a `Set` for O(1) lookups when filtering
- Filter applies in both code paths: the small-dataset in-memory path and the large-dataset cursor path

**Key components:**
- `src/services/kb/kb-search.ts` (modify `searchKB` and `getKBContext` signatures)

**Notes:** Do not change the `kbDatabase` layer — the filtering happens in `kb-search.ts` after loading chunks, not at the IndexedDB query level. This keeps the change minimal and avoids schema changes. The `getKBContext` function also needs to respect the filter when checking for available completed docs — count only those in the `documentIds` list.

---

### Task 8: Service worker: load active persona on session start

**Intent:** Wire the persona system into the session lifecycle so the active persona's prompt and KB filter are used when a session starts.

**Context:** Depends on Tasks 1 and 7. Currently `handleStartSession()` in the service worker reads `systemPrompt` from storage and passes it to `geminiClient.setSystemPrompt()`. It needs to instead read the active persona and use its prompt. The KB document IDs need to be stored so the Gemini client's KB retrieval uses them.

**Expected behavior:**
- In `handleStartSession()`:
  1. Call `migrateToPersonas()` (safety net — ensures personas exist even if options page was never opened)
  2. Call `getActivePersona()` from `src/shared/persona.ts`
  3. Pass `persona.systemPrompt` to `geminiClient.setSystemPrompt()`
  4. Store `persona.kbDocumentIds` in a module-level variable (e.g., `activeKBDocumentIds`)
  5. Remove the direct `storage.systemPrompt` read for prompt (persona is the source of truth now)
- In the suggestion generation flow (where `getKBContext()` is called in `gemini-client.ts`):
  - Pass `activeKBDocumentIds` to `getKBContext(utterance, documentIds)`
  - This requires either: (a) the service worker passes the IDs to gemini client via a setter, or (b) gemini client reads the active persona itself
  - Option (a) is cleaner — add `geminiClient.setKBDocumentFilter(ids: string[] | null)` and use it in `generateResponse()`
- Fallback: if no active persona found, use `DEFAULT_SYSTEM_PROMPT` and no KB filter (search all) — same as pre-persona behavior

**Key components:**
- `src/background/service-worker.ts` (modify `handleStartSession`)
- `src/services/gemini-client.ts` (add `setKBDocumentFilter`, pass to KB search)
- `src/shared/persona.ts` (imported)

**Notes:** The `chrome.storage.local.get` call in `handleStartSession` currently fetches `['deepgramApiKey', 'geminiApiKey', 'systemPrompt', 'speakerFilterEnabled']`. After this change, it should fetch `['deepgramApiKey', 'geminiApiKey', 'speakerFilterEnabled', 'personas', 'activePersonaId']` — drop `systemPrompt` from the list (it comes from the persona now). Keep reading `speakerFilterEnabled` directly — it's not part of personas yet.

---

### Task 9: Popup: persona dropdown switcher

**Intent:** Add a persona selector dropdown to the extension popup so users can switch personas before starting a session without opening the options page.

**Context:** Depends on Tasks 1 and 2. The popup currently has two status rows (API Keys, Session) and a Start/Stop button. The persona dropdown goes between the status section and the controls section.

**Expected behavior:**
- New section in `popup.html` between `.status-section` and `.controls-section`:
  - Label: "Persona"
  - A `<select>` dropdown showing all persona names, with the active one pre-selected
  - Each option shows the persona name (color dot not possible in native `<select>` — use name only)
  - A small "Edit" link/icon next to the dropdown that opens the options page directly to the Personas tab
- On `<select>` change: update `activePersonaId` in storage immediately. No toast needed in the popup (it's a quick action).
- If session is active when switching: show a warning text below the dropdown: "Takes effect on next session" (styled as a subtle hint, not an error)
- On popup open: load personas from storage, populate the `<select>`, select the active one
- The 2-second status polling already in `PopupController` should refresh the persona dropdown if personas change externally (e.g., user creates one in options while popup is open)
- If no personas exist (shouldn't happen post-migration, but safety): hide the dropdown

**Key components:**
- `src/popup/popup.html` (add persona selector HTML)
- `src/popup/popup.ts` (add persona loading and switching logic to `PopupController`)
- `src/popup/popup.css` (style the dropdown section)

**Notes:** Keep the popup lightweight — don't import the full persona module. Read `personas` and `activePersonaId` directly from `chrome.storage.local.get()`. The "Edit" link should use `chrome.runtime.openOptionsPage()` and ideally deep-link to the Personas tab by setting `activeOptionsTab: 'personas'` in storage before opening (the TabManager restores from this key).

---

### Task 10: Overlay: persona name & color in header

**Intent:** Show the active persona's name and color in the overlay header so the user knows which context Wingman is using during a live call.

**Context:** Depends on Task 1. The overlay header currently reads `<span class="title">Wingman</span>` inside `.overlay-header > .drag-handle`. The persona indicator goes next to this title.

**Expected behavior:**
- On overlay creation (`createOverlayStructure()`), add a persona label element after the title: `<span class="persona-label">· {name}</span>` styled with the persona's color
- On init, read `activePersonaId` and `personas` from storage, find the active persona, populate the label
- Listen to `chrome.storage.onChanged` (already done for theme) — if `activePersonaId` changes, update the label text and color
- If the persona name is long (> 20 chars), truncate with ellipsis
- Style: smaller font size than "Wingman", the persona's color applied as text color, separated by a middle dot

**Key components:**
- `src/content/overlay.ts` (modify `createOverlayStructure`, add persona label, add storage listener)

**Notes:** The overlay runs in the content script context, which has access to `chrome.storage.local`. Don't import from `src/shared/persona.ts` to avoid pulling in unnecessary dependencies — just read the raw storage keys directly. Keep the persona label hidden if there's only one persona named "Default" (no value in showing it). The label should use inline styles (shadow DOM — no external CSS).

---

### Task 11: KB tab: show persona color dots on documents

**Intent:** On the Knowledge Base tab, show small colored dots next to each document indicating which personas reference it.

**Context:** Depends on Tasks 1 and 4. The KB document list is rendered in `KnowledgeBaseSection.renderDocList()`. Each doc row currently shows filename, chunk count, size, and upload time. Persona dots go in the metadata line.

**Expected behavior:**
- When rendering the doc list, load personas from storage
- For each document, find which personas include its ID in their `kbDocumentIds`
- Render small colored circles (8px) next to the document metadata, using each persona's color
- Hovering a dot shows a tooltip with the persona name
- If a document is not referenced by any persona, no dots are shown
- If a document is referenced by more than 4 personas, show the first 4 dots + a "+N" label

**Key components:**
- `src/options/sections/knowledge-base.ts` (modify `renderDocList`)
- `src/options/options.css` (add dot styles if needed)

**Notes:** Load personas once at the start of `renderDocList` (one `chrome.storage.local.get` call), not per document. This is a visual-only addition — clicking dots doesn't do anything. Keep the dots small and unobtrusive.

---

### Task 12: Export persona to JSON

**Intent:** Allow users to export a persona (including KB document text) as a portable `.json` file for sharing.

**Context:** Depends on Tasks 4 and 1. Export is triggered from the persona editor's "Export" button. The file includes the persona metadata + the full extracted text of each referenced KB document (reconstructed from chunks). Embeddings are NOT included — they're regenerated on import.

**Expected behavior:**
- On "Export" click:
  1. Read the persona's `kbDocumentIds`
  2. For each doc ID, load the document record from IndexedDB (`kbDatabase.getDocuments()`) and all its chunks (`kbDatabase.getChunksByDocumentId()`)
  3. Reconstruct full text by sorting chunks by `chunkIndex` and joining their `text` fields
  4. Build the export object:
     ```json
     {
       "wingmanPersona": true,
       "version": 1,
       "exportedAt": 1234567890,
       "persona": {
         "name": "...",
         "color": "#...",
         "systemPrompt": "...",
         "kbDocuments": [
           { "filename": "...", "fileType": "pdf", "textContent": "..." }
         ]
       }
     }
     ```
  5. Download via `URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)]))` + a temporary `<a>` click
  6. Filename: `wingman-persona-{slugified-name}.json`
- Show a brief loading state on the Export button while reading KB chunks
- Toast: "Persona exported"

**Key components:**
- `src/options/sections/personas.ts` (add export method)
- `src/services/kb/kb-database.ts` (use existing `getChunksByDocumentId`)

**Notes:** The `kbDatabase` must be initialized before export. Call `kbDatabase.init()` if needed. Chunk text may have overlap (from the chunking strategy's 15% overlap) — this is fine for export; on import, the text will be re-chunked fresh. Keep the export function in the personas section, not in a shared module — it's only used from the options page.

---

### Task 13: Import persona from JSON with preview & progress

**Intent:** Allow users to import a persona `.json` file, preview its contents, and ingest its KB documents with a progress indicator.

**Context:** Depends on Tasks 4, 12, and 1. Import is the reverse of export: parse the file, show the user what's inside, then create the persona and re-ingest KB documents (chunk + embed).

**Expected behavior:**
- Import is triggered from the "Import" button on the Personas tab (or drag-and-drop onto the persona list area)
- On file selection:
  1. Read and parse the JSON file
  2. Validate: check `wingmanPersona === true` and `version === 1`. If invalid, toast error: "Not a valid Wingman persona file"
  3. Show a preview modal (using `ctx.showConfirmModal` or a custom modal):
     - Persona name and color
     - System prompt preview (first 200 chars + "...")
     - List of KB documents with filenames and text size
     - "Import" and "Cancel" buttons
  4. On confirm:
     - Check Gemini API key exists — if not, toast error: "Gemini API key required to process Knowledge Base documents"
     - Create KB documents from the exported text: for each `kbDocuments` entry, create a `File`-like object and run it through the existing `ingestDocument()` pipeline (which handles chunking + embedding)
     - Show progress: reuse the KB progress bar pattern from `KnowledgeBaseSection`
     - Create the persona with the new KB document IDs
     - If persona name conflicts, append " (imported)"
     - Save to storage, re-render list
     - Toast: "Persona imported successfully"
- If the file has no KB documents (prompt-only persona), skip the ingestion step — just create the persona immediately

**Key components:**
- `src/options/sections/personas.ts` (add import method, preview UI)
- `src/services/kb/kb-database.ts` (use existing `ingestDocument`)

**Notes:** The import flow reuses the existing KB ingestion pipeline — don't reinvent chunking/embedding. The tricky part is creating a `File` object from the exported text content. Use `new File([textContent], filename, { type: 'text/plain' })` — the ingestion pipeline's text extractor handles plain text. Set `fileType` to `'txt'` regardless of original type since we're working with extracted text. Handle partial failures gracefully: if one KB doc fails to ingest, still create the persona with the docs that succeeded, and show a warning toast.

---

### Task 14: Edge cases & safety nets

**Intent:** Handle all the edge cases documented in the ideation: deleting referenced docs, deleting the active persona, empty persona list, mid-session switching.

**Context:** Depends on Tasks 4, 7, 8, 9, 11. These are defensive behaviors that prevent the extension from breaking in unusual states.

**Expected behavior:**
- **Deleting a KB document used by personas:** In `KnowledgeBaseSection.deleteDocument()`, after deleting from IndexedDB, load personas from storage, remove the deleted doc ID from all personas' `kbDocumentIds` arrays, save back. If any personas were affected, show which ones in the confirmation dialog before deletion.
- **Deleting the active persona:** After deletion in `PersonaSection`, if the deleted persona was active, set the first remaining persona as active. If no personas remain, create a new "Default" persona and set it active.
- **All personas deleted:** (Covered above.) The `deletePersona` method should never leave the `personas` array empty.
- **Persona with invalid/stale KB document IDs:** In `getActivePersona()` or at session start, filter out any `kbDocumentIds` that no longer exist in IndexedDB. Don't fail — just use what's available.
- **Mid-session persona switch from popup:** If `isSessionActive`, show hint text "Takes effect on next session" below the dropdown (Task 9 covers the UI — this task ensures the service worker doesn't hot-swap mid-session).

**Key components:**
- `src/options/sections/knowledge-base.ts` (persona cleanup on doc delete)
- `src/options/sections/personas.ts` (deletion safety nets)
- `src/shared/persona.ts` (stale ID cleanup in `getActivePersona`)

**Notes:** These are small but important changes scattered across multiple files. Test each scenario manually: delete a doc, delete active persona, delete all personas, create stale references.

---

### Task 15: Build verification & manual testing

**Intent:** Verify the full feature builds cleanly and works end-to-end.

**Context:** Depends on all previous tasks. This is the final check before the feature is considered complete.

**Expected behavior:**
- `npm run typecheck` passes with no errors
- `npm run build` succeeds
- `npm run lint` passes (or only has pre-existing warnings)
- Manual test in Chrome:
  1. Load extension → verify "Default" persona was auto-created (migration)
  2. Open options → Personas tab → create a new persona with custom prompt and 1-2 KB docs
  3. Switch active persona from both options page and popup dropdown
  4. Start a session → verify the overlay shows the persona name
  5. Verify suggestions use the correct persona's prompt (check service worker logs for system prompt)
  6. Export a persona → inspect the JSON file
  7. Delete the exported persona → import it back → verify it appears with KB docs re-processed
  8. Delete a KB doc → verify it's removed from persona references
  9. Verify the Advanced tab shows read-only prompt with "Edit in Personas" link
  10. Verify KB tab shows persona color dots on documents

**Key components:**
- All files from previous tasks
- `wingman-ai/extension/` (build commands)

**Notes:** If typecheck or lint fails, fix issues before marking complete. Document any known limitations discovered during testing in this task's notes section.

---

## Appendix

### Technical Decisions

1. **chrome.storage.local over IndexedDB for personas:** Personas are small (prompt ≤ 10KB + metadata). chrome.storage.local is consistent with all other settings, simpler to work with, and the 5MB limit can hold hundreds of personas. IndexedDB would be overkill.

2. **KB document references (not copies):** Personas reference KB document IDs, not duplicate the documents. This saves storage and means a shared product datasheet doesn't exist in 5 copies. The tradeoff is that deleting a doc affects multiple personas — handled in Task 14.

3. **Export contains extracted text (not raw files or embeddings):** Raw PDFs would bloat exports. Embeddings are model-specific and can't be shared across different API keys. Extracted text is small, portable, and re-embeds cleanly on import.

4. **System prompt lives exclusively in personas (not duplicated in Advanced tab):** Two editors for the same value would inevitably desync. The Advanced tab becomes a read-only reference with a link to the canonical editor.

5. **KB search filtering in kb-search.ts (not at IndexedDB level):** Adding a filter parameter to `searchKB()` is a 5-line change. Modifying the IndexedDB schema or adding compound indexes would be a much larger change with migration complexity, for no performance benefit at typical KB sizes.

### Dependencies

- No new npm packages required
- Uses existing `kbDatabase` (IndexedDB), `geminiClient` (embeddings), `ingestDocument` (chunking pipeline)
- `crypto.randomUUID()` — available in Chrome 92+ (extension minimum is 116)

### Out of Scope

- Persona-specific call summary settings or speaker filter settings
- Cloud sync of personas across devices
- Sharing personas via URL/link
- Per-persona call history or suggestion quality analytics
- Auto-switching persona based on meeting title, calendar event, or participant list
- Bulk export/import of all personas at once
