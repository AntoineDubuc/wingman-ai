# Implementation Plan: Phase 19 — Hydra (Multi-Persona Conclave)

---

## Executive Summary

Today, Wingman AI users must pick ONE persona before a call. But real conversations don't stay in one lane — a fundraising call pivots to legal terms, then technical architecture, then hiring. One persona can't cover all of that well. Phase 19 ("Hydra") lets users activate up to 4 personas simultaneously. Each persona brings its own system prompt and knowledge base. During a call, every active persona evaluates each transcript in parallel — the right persona responds at the right moment. Suggestions are attributed with the persona's name and color so users always know which expertise contributed.

Some users will use broad personas (Fundraising + Legal + Technical). Others will use narrow, per-contact personas — a dossier on each person they talk to. The system treats all active personas equally with no priority ordering.

**Key Outcomes:**
- Users select multiple active personas in the popup or options page (max 4)
- Parallel LLM calls per transcript — each persona gets its own system prompt + KB context
- Suggestion bubbles show which persona generated them (name + color)
- Exact-match deduplication merges identical suggestions with combined persona badges
- Post-call summary guided by a "conclave leader" persona (configurable in Phase 19b)
- Overlay header shows colored dots for each active persona
- Full backward compatibility — single persona works exactly like today

**Phasing:**
- **Phase 19a** (Tasks 1–14): Core multi-persona pipeline, popup multi-select, overlay attribution, dedup, summary metadata
- **Phase 19b** (Tasks 15–18): New "Conclave" tab in Options with leader picker and preset management

**Reference docs:**
- [IDEATION-HYDRA.md](./IDEATION-HYDRA.md) — Architecture analysis, decisions, blast radius
- [UI-MOCKUPS.md](./UI-MOCKUPS.md) — ASCII wireframes and user flows

---

## Product Manager Review

### Feature Overview

Hydra turns Wingman from a single-expert assistant into a multi-expert panel. Instead of choosing one persona before a call, users activate a conclave of 2–4 personas. Each persona evaluates every transcript independently and speaks up when its expertise is relevant. The LLM already handles silence well (`---` response), so in practice most transcripts trigger 0–1 suggestions — not a flood.

### Use Cases

1. **Broad expertise mix**: Fundraising + Legal + Technical for a board meeting
2. **Per-contact dossiers**: "John from Acme" + "Sarah from BigCo" personas holding relationship-specific KB docs
3. **Role + industry**: "Cloud Solutions Sales" + "Healthcare Compliance" for a specialized sales call

### Features

#### Feature 1: Multi-Persona Selection (Popup + Options)

**What it is:** Users activate 1–4 personas via chips in the popup or checkboxes in the Setup tab. Personas are locked during an active session.

**Why it matters:** Replaces the single-select dropdown with a flexible multi-select. Users choose their expert panel before each call.

**Acceptance criteria:**
- Popup shows active personas as removable chips with colored dots
- "+ Add persona" dropdown shows available (inactive) personas
- Max 4 enforced — dropdown hidden when cap reached
- Chips disabled (non-removable) during active session
- Options page Setup tab has "Active Personas" checkbox section
- Both UI surfaces sync via `chrome.storage.local`
- Backward compatible — single persona looks and works like today

#### Feature 2: Parallel Suggestion Pipeline

**What it is:** On each transcript, the service worker fires parallel LLM calls — one per active persona. Each call uses that persona's system prompt and KB context. Responses are filtered (silent = discarded), deduped (exact match = merge badges), and sent to the overlay.

**Why it matters:** This is the core engine. Each persona operates at full capability with its own prompt and KB, not a diluted mega-prompt.

**Acceptance criteria:**
- N parallel LLM calls per transcript (N = active persona count)
- Each call uses persona-specific system prompt and KB document filter
- Per-persona cooldowns (independent 15-second timers)
- 100ms stagger between parallel calls to reduce burst rate limiting
- Silent responses (`---`) filtered out before sending to overlay
- Exact string match dedup: identical suggestions merged with combined persona badges
- Failed calls (network error, rate limit) don't block other personas

#### Feature 3: Persona Attribution on Suggestions

**What it is:** Each suggestion bubble in the overlay shows which persona generated it — persona name in the header, left border color matching the persona's color.

**Why it matters:** Users need to know which expertise contributed each suggestion. Without attribution, multi-persona is confusing.

**Acceptance criteria:**
- Suggestion bubble header shows persona name (replaces generic "Wingman")
- Left border color matches persona's assigned color
- Overlay header shows colored dots for each active persona (hover = tooltip with names)
- Deduped suggestions show multiple persona badges
- Post-call summary includes "Personas Used" section with suggestion counts per persona
- Transcript collector and Drive export include persona attribution

#### Feature 4: Conclave Tab + Presets (Phase 19b)

**What it is:** A new "Conclave" tab in the Options page with two sections: (1) conclave leader picker — which persona guides the post-call summary, and (2) preset management — save persona combinations for quick activation.

**Why it matters:** The leader picker gives users control over summary perspective. Presets let power users switch persona combos with one click.

**Acceptance criteria:**
- New "Conclave" tab appears between Personas and LangBuilder tabs
- Leader dropdown populated with active personas only
- Explanatory note describes what the leader setting does
- Preset CRUD: create, edit, delete, activate
- Preset activation sets `activePersonaIds` in storage
- Popup shows preset quick-switch buttons (Phase 19b)

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

### Progress Dashboard — Phase 19a (Foundation)

| Done | # | Task Name | Start | End | Total (min) | Human Est. (min) | Multiplier |
|:----:|:-:|-----------|:-----:|:---:|:-----------:|:----------------:|:----------:|
| [x] | 1 | Storage model + persona helpers | 13:15 | 13:22 | 7 | 60 | 9x |
| [x] | 2 | Popup multi-select UI | 13:22 | 13:38 | 16 | 180 | 11x |
| [x] | 3 | Options page: Active Personas section | 13:38 | 14:05 | 27 | 120 | 4x |
| [x] | 4 | GeminiClient per-persona method | 14:05 | 14:15 | 10 | 90 | 9x |
| [x] | 5 | Per-persona cooldown tracking | 14:15 | 14:20 | 5 | 60 | 12x |
| [x] | 6 | Service worker: load multiple personas | 14:20 | 14:28 | 8 | 45 | 6x |
| [x] | 7 | Service worker: parallel suggestion pipeline | 14:28 | 14:38 | 10 | 120 | 12x |
| [x] | 8 | Exact string dedup + badge merge | 14:38 | 14:45 | 7 | 60 | 9x |
| [x] | 9 | Overlay header: multi-persona dots | 14:45 | 14:55 | 10 | 90 | 9x |
| [x] | 10 | Suggestion bubbles: persona attribution | 14:55 | 15:05 | 10 | 120 | 12x |
| [x] | 11 | Content script: multi-persona messages | 15:05 | 15:10 | 5 | 45 | 9x |
| [x] | 12 | Post-call summary: persona metadata | 15:10 | 13:23 | 6 | 90 | 15x |
| [x] | 13 | Transcript collector + Drive export attribution | 13:23 | 13:24 | 4 | 60 | 15x |
| [x] | 14 | Unit tests + build verification | 13:24 | 13:25 | 5 | 120 | 24x |

### Progress Dashboard — Phase 19b (Conclave Tab + Presets)

| Done | # | Task Name | Start | End | Total (min) | Human Est. (min) | Multiplier |
|:----:|:-:|-----------|:-----:|:---:|:-----------:|:----------------:|:----------:|
| [x] | 15 | Options page: new Conclave tab | 14:34 | 14:35 | 3 | 120 | 40x |
| [x] | 16 | Conclave leader picker | 14:35 | 14:36 | 2 | 60 | 30x |
| [x] | 17 | Preset data model + CRUD | 14:30 | 14:34 | 4 | 90 | 23x |
| [x] | 18 | Preset UI + popup quick-switch | 14:36 | 14:38 | 5 | 120 | 24x |

**Summary:**
- Total tasks: 18
- Phase 19a: 14 tasks · Human estimate: 1,260 min (~21 hours)
- Phase 19b: 4 tasks · Human estimate: 390 min (~6.5 hours)
- Grand total human estimate: 1,650 min (~27.5 hours)

---

## Task Descriptions

This section provides context for each task. Read the relevant description before starting implementation.

---

### Task 1: Storage Model + Persona Helpers

**Intent:** Extend the storage schema and persona helper functions to support multiple active personas and a conclave leader.

**Context:** Today, `activePersonaId` (string) in `chrome.storage.local` holds the single active persona. We add `activePersonaIds` (string array) alongside it. The old key stays for backward compatibility — any code that reads `activePersonaId` still works, getting the first element. The `conclaveLeaderId` key designates which persona guides the post-call summary (defaults to first active persona until the Conclave tab is built in Phase 19b).

**Key components:**
- `src/shared/persona.ts` — Add new functions, keep existing ones working

**Changes:**

New functions:
```typescript
getActivePersonaIds(): Promise<string[]>
// Reads activePersonaIds from storage. Falls back to [activePersonaId] if missing.

setActivePersonaIds(ids: string[]): Promise<void>
// Saves activePersonaIds AND sets activePersonaId = ids[0] for backward compat.
// Enforces max 4.

getActivePersonas(): Promise<Persona[]>
// Returns full Persona objects for all active IDs. Filters out stale IDs.

getConclaveLeaderId(): Promise<string | null>
// Reads conclaveLeaderId from storage. Falls back to first active persona.

setConclaveLeaderId(id: string): Promise<void>
// Saves conclaveLeaderId to storage.
```

Existing functions — **no changes needed**:
- `getActivePersona()` — still returns first active persona (backward compat)
- `setActivePersonaId()` — still works for single-persona usage
- `getPersonas()`, `savePersonas()`, `createPersona()` — unchanged
- `migrateToPersonas()` — unchanged (seeds built-ins, handles legacy)

**Storage keys:**
- `activePersonaIds: string[]` — NEW
- `conclaveLeaderId: string` — NEW
- `activePersonaId: string` — KEEP (backward compat, always = first in array)

**Notes:**
- No migration needed — `getActivePersonaIds()` falls back to `[activePersonaId]` if the new key doesn't exist
- `setActivePersonaIds([])` should be prevented — always require at least one active persona
- If `conclaveLeaderId` points to a persona that's no longer active, fall back to first active

---

### Task 2: Popup Multi-Select UI

**Intent:** Replace the single-select dropdown in the popup with a multi-persona chip interface.

**Context:** The current popup (`popup.ts`) has a `<select>` dropdown (`#persona-select`) with a color dot (`#persona-dot`). This becomes a chip list with removable chips and an "+ Add persona" dropdown.

**See mockups:** [UI-MOCKUPS.md, Section 2](./UI-MOCKUPS.md#2-popup--session-controls)

**Key components:**
- `src/popup/popup.ts` — Rewrite persona section
- `src/popup/popup.html` — Update persona section HTML

**Expected behavior:**
- Active personas shown as chips: `● Persona Name [✕]`
- Colored dot matches persona color
- `[✕]` removes persona from active list (min 1 must stay)
- `[+ Add persona ▼]` dropdown shows inactive personas
- Selecting from dropdown adds chip + saves to storage
- When 4 active, dropdown is hidden and replaced with "Max 4 personas reached"
- During active session: `[✕]` buttons disabled, tooltip "Stop session to change personas"
- `[+ Add persona]` also disabled during session
- Count label below: "2 active" / "3 active" etc. Just "1 active" for single.
- Polling every 2s (existing pattern) refreshes chip state from storage

**Notes:**
- Use `getActivePersonaIds()` and `setActivePersonaIds()` from Task 1
- The `switchPersona()` method is replaced by `addPersona()` and `removePersona()`
- Session lock state comes from `GET_STATUS` message (existing pattern — `isSessionActive`)
- Remove the old `<select>` and `persona-dot` elements entirely
- **First-time tooltip:** On first popup load after Hydra ships (check `hydraTooltipShown` storage flag), show a tooltip pointing to "+ Add persona": "New: activate multiple personas for expert-panel mode." Dismiss on click or after 5 seconds.

---

### Task 3: Options Page — Active Personas Section

**Intent:** Add an "Active Personas for Calls" section to the Setup tab in the options page, with checkboxes for each persona.

**Context:** The Setup tab currently has API keys and Drive integration. Below those, we add a persona activation section with checkboxes, KB doc counts, and a short description.

**See mockups:** [UI-MOCKUPS.md, Section 1](./UI-MOCKUPS.md#1-options-page--setup-tab-provider--personas-section)

**Key components:**
- `src/options/options.html` — Add section HTML in Setup tab
- `src/options/sections/api-keys.ts` — OR create new `src/options/sections/active-personas.ts`

**Expected behavior:**
- Each persona row: checkbox + colored dot + name + KB doc count + truncated description
- Checking/unchecking updates `activePersonaIds` in storage
- Max 4 enforced — additional checkboxes disabled when 4 are checked
- Footer text: "N of M active · Max 4 active personas."
- Note about conclave leader: "Set a 'Conclave Leader' in the Conclave tab to guide summaries."
- Responds to persona additions/deletions in the Personas tab (re-render on storage change)

**Notes:**
- Create a new section class `ActivePersonasSection` following the existing pattern (constructor takes container element + shared context)
- Register in `options.ts` init alongside other sections
- Use `chrome.storage.onChanged` listener to refresh when personas are modified in the Personas tab
- Don't duplicate the persona editor — this section is just activation toggles

---

### Task 4: GeminiClient Per-Persona Method

**Intent:** Add a `processTranscriptForPersona()` method that accepts persona-specific system prompt and KB filter, replacing the single-persona assumption.

**Context:** Today, `geminiClient` stores a single `systemPrompt` and `kbDocumentFilter` set during session start. The new method takes these per-call so parallel persona calls don't share state. The existing `processTranscript()` method stays for backward compatibility (used when only 1 persona is active).

**Key components:**
- `src/services/gemini-client.ts` — Add new method

**New method signature:**
```typescript
async processTranscriptForPersona(
  text: string,
  speaker: string,
  isFinal: boolean,
  persona: {
    id: string;
    name: string;
    color: string;
    systemPrompt: string;
    kbDocumentIds: string[];
  }
): Promise<{
  suggestion: string;
  type: string;
  personaId: string;
  personaName: string;
  personaColor: string;
} | null>
```

**Expected behavior:**
- Builds the system prompt using the persona's `systemPrompt`
- Calls `getKBContext(query, persona.kbDocumentIds)` for persona-scoped KB search
- Injects KB context into the system prompt (same pattern as existing code)
- Makes the LLM API call using the session's provider/model config (shared across personas)
- Returns `null` if the LLM responds with `---` (silence)
- Tracks token usage via `costTracker.addLLMUsage()` (same as existing)
- Does NOT check `isGenerating` — the parallel pipeline handles concurrency

**Notes:**
- The existing `processTranscript()` can be refactored to call `processTranscriptForPersona()` internally, passing the session's stored persona. Or keep both — the service worker chooses which to call based on active persona count.
- This method must NOT mutate `this.systemPrompt` or `this.kbDocumentFilter` — it uses the persona parameter only
- Conversation history (`this.conversationHistory`) is shared across all personas (they all see the same conversation)
- The `buildRequest()` method (provider routing) is reused — only the system prompt differs per persona
- **Error handling:** Return `null` on any error (network, 429, parse failure). Log the error with persona ID for debugging. Never throw — let other personas continue.
- **History mutation safety:** History is read-only during parallel calls. The service worker appends the user's transcript once before firing parallel calls. Persona suggestions are appended after all calls complete, not during.

---

### Task 5: Per-Persona Cooldown Tracking

**Intent:** Replace the single `lastSuggestionTime` / `isGenerating` guards with per-persona tracking so personas have independent cooldowns.

**Context:** Today, `geminiClient` has:
- `isGenerating: boolean` — blocks concurrent calls
- `lastSuggestionTime: number` — 15-second cooldown

With Hydra, Persona A generating a suggestion shouldn't block Persona B. Each persona gets its own cooldown timer. The `isGenerating` guard becomes per-persona.

**Key components:**
- `src/services/gemini-client.ts` — Modify cooldown logic

**Changes:**
```typescript
// Before
private isGenerating = false;
private lastSuggestionTime = 0;

// After
private generatingPersonas = new Set<string>();  // persona IDs currently generating
private lastSuggestionTimes = new Map<string, number>();  // persona ID → timestamp
```

**Expected behavior:**
- `processTranscriptForPersona()` checks `generatingPersonas.has(personaId)` before starting
- After completion, removes from `generatingPersonas`
- Cooldown check: `Date.now() - (lastSuggestionTimes.get(personaId) ?? 0) > cooldownMs`
- On successful suggestion, updates `lastSuggestionTimes.set(personaId, Date.now())`
- `resetCooldowns()` called on session end to clear both maps

**Notes:**
- Keep the existing single-persona `isGenerating` + `lastSuggestionTime` working for the `processTranscript()` path (backward compat when 1 persona active)
- The cooldown duration (15 seconds) stays the same — it's per-persona, not shorter
- All personas are treated equally — no priority cooldown for any persona

---

### Task 6: Service Worker — Load Multiple Personas on Session Start

**Intent:** Modify `handleStartSession()` to load all active personas (not just one) and store them for the session duration.

**Context:** Today, `handleStartSession()` calls `getActivePersona()` → sets system prompt → sets KB filter. With Hydra, it loads all active personas and stores them as a session-scoped array.

**Key components:**
- `src/background/service-worker.ts` — Modify `handleStartSession()`

**Changes:**
```typescript
// Before (roughly lines 258-275)
const persona = await getActivePersona();
geminiClient.setSystemPrompt(persona.systemPrompt);
geminiClient.setKBDocumentFilter(persona.kbDocumentIds);

// After
const personas = await getActivePersonas();
// Store as module-level session variable:
let sessionPersonas: Array<{
  id: string; name: string; color: string;
  systemPrompt: string; kbDocumentIds: string[];
}> = [];
// ...
sessionPersonas = personas.map(p => ({
  id: p.id, name: p.name, color: p.color,
  systemPrompt: p.systemPrompt, kbDocumentIds: p.kbDocumentIds
}));
```

**Expected behavior:**
- On session start, load all active personas via `getActivePersonas()`
- Store in a module-level `sessionPersonas` array (frozen for session duration)
- If only 1 persona, the existing single-persona path still works (backward compat)
- Log persona names: `console.log('Hydra: loaded N personas:', names)`
- On session stop, clear `sessionPersonas = []`

**Notes:**
- The single-persona `setSystemPrompt()` / `setKBDocumentFilter()` calls should still happen for the single-persona case (keeps the existing `processTranscript()` path working)
- For multi-persona, these calls are skipped — `processTranscriptForPersona()` handles it per-call
- Persona data is snapshotted at session start — if user edits a persona in Options during a call, changes take effect next session (same as today)

---

### Task 7: Service Worker — Parallel Suggestion Pipeline

**Intent:** When multiple personas are active, fire parallel LLM calls per transcript and handle the results (filter silent, dedup, send to overlay).

**Context:** This is the core Hydra engine. Today, the service worker calls `geminiClient.processTranscript()` once per transcript. With Hydra, it calls `processTranscriptForPersona()` N times in parallel.

**Key components:**
- `src/background/service-worker.ts` — Modify the suggestion generation flow

**Expected behavior:**
```
Transcript arrives (speech_final)
  │
  ├─ If 1 active persona → existing single-call path (unchanged)
  │
  └─ If N active personas:
       │
       ├─ Stagger: fire calls with 100ms delay between each
       │   (reduces burst rate limiting on Groq/Gemini free tier)
       │
       ├─ Promise.allSettled(calls)
       │
       ├─ Filter: remove nulls (silent ---) and rejected promises
       │
       ├─ Dedup: exact string match → merge persona badges (Task 8)
       │
       ├─ For each valid suggestion:
       │   ├─ Send cost_update message
       │   └─ Send suggestion message with persona attribution
       │
       └─ If zero suggestions → do nothing (all personas chose silence)
```

**Stagger implementation:**
```typescript
const results = await Promise.allSettled(
  sessionPersonas.map((persona, i) =>
    new Promise<Result>((resolve) =>
      setTimeout(async () => {
        const result = await geminiClient.processTranscriptForPersona(text, speaker, isFinal, persona);
        resolve(result);
      }, i * 100)  // 0ms, 100ms, 200ms, 300ms
    )
  )
);
```

**Notes:**
- `Promise.allSettled` (not `Promise.all`) — one persona failing shouldn't kill the others
- The 100ms stagger is a simple `setTimeout` — not exact science, just spreads the burst
- Rate limit errors (429) are caught per-persona — log and continue
- The single-persona path is preserved as-is for simplicity and zero-risk backward compat
- Send `cost_update` after all calls complete (one update, not N)
- **Rate limit toast:** If any persona hits a 429, send a brief non-blocking toast to the overlay: "Rate limited — some suggestions skipped." Don't spam — dedupe within 30 seconds.

---

### Task 8: Exact String Dedup + Badge Merge

**Intent:** If two or more personas produce identical suggestion text, merge them into one suggestion with combined persona badges.

**Context:** Per the user's decision: exact string match only. No fuzzy matching, no LLM-based similarity. Different wording = show both.

**Key components:**
- `src/background/service-worker.ts` — Add dedup logic in the parallel pipeline (Task 7)

**Expected behavior:**
- After filtering silent responses, group results by exact `suggestion` text
- If multiple personas produced the same text:
  - Keep one suggestion
  - Attach all contributing persona names/colors as an array
- Send the merged suggestion with `personas: [{id, name, color}, ...]` instead of single `personaId/personaName/personaColor`

**Suggestion message format change:**
```typescript
// Before (single persona)
{ type: 'suggestion', data: { text, type, personaId, personaName, personaColor } }

// After (multi-persona, may have merged badges)
{ type: 'suggestion', data: {
  text: string,
  type: string,
  personas: Array<{ id: string, name: string, color: string }>
}}
```

**Notes:**
- `personas` array has 1 element in the common case, 2+ only on exact dedup match
- The overlay renders all persona badges in the bubble header
- Trim whitespace before comparing (avoid false negatives from trailing spaces)
- Case-sensitive comparison (different casing = different suggestions)
- **O(n) grouping:** Use `Map<string, Result[]>` keyed by trimmed suggestion text. Single pass through results, then iterate map values. No pair comparisons.

---

### Task 9: Overlay Header — Multi-Persona Dots

**Intent:** Replace the single persona label in the overlay header with colored dots representing each active persona.

**Context:** Today the header shows `Wingman · Startup Founder (Fundraising)`. With Hydra, it shows `Wingman ●● ●●` where each dot is colored per persona. Hover shows a tooltip with persona names.

**See mockups:** [UI-MOCKUPS.md, Section 3 header](./UI-MOCKUPS.md#3-overlay--during-a-live-call)

**Key components:**
- `src/content/overlay.ts` — Modify header rendering

**Changes:**
- Replace the `<span class="persona-label">` with a `<span class="persona-dots">` container
- Each dot: `<span class="persona-dot" style="background:${color}" title="${name}"></span>`
- Dots are 8px circles with 3px gap
- Hover tooltip: absolute-positioned div listing all persona names with colored bullets
- Single persona: show one dot + the persona name (looks similar to today)

**Expected behavior:**
- Dots rendered on session start from persona data passed in the existing session message
- **Extend existing message:** Add `personas: [{name, color}]` field to the existing `session_start` or status response message. Don't add a new message type.
- Tooltip appears on hover over the dots container
- Tooltip disappears on mouse leave
- On session stop, dots cleared

**Notes:**
- CSS: `display:inline-flex; gap:3px; align-items:center;`
- Dot: `width:8px; height:8px; border-radius:50%; display:inline-block;`
- For single persona, additionally show the name text (backward compat visual)
- For 2+ personas, dots only (names in tooltip) to save header space
- The cost ticker (Phase 18) stays in its current position — dots go where the persona label was

---

### Task 10: Suggestion Bubbles — Persona Attribution

**Intent:** Add persona name and color to each suggestion bubble in the overlay.

**Context:** Today, suggestions show "Wingman" with a type badge (ANSWER/OBJECTION/INFO). With Hydra, the header shows the persona name(s) and the left border color matches the persona.

**See mockups:** [UI-MOCKUPS.md, Section 3 suggestions](./UI-MOCKUPS.md#3-overlay--during-a-live-call)

**Key components:**
- `src/content/overlay.ts` — Modify `addSuggestion()` method

**Changes to suggestion rendering:**
- Header: `● Persona Name          TYPE` (persona name replaces "Wingman")
- Left border: `border-left: 3px solid ${personaColor}`
- For deduped suggestions (multiple personas): `● ● Persona A, Persona B     TYPE`
- The colored dot(s) before the name use the persona's color

**Expected behavior:**
- `addSuggestion()` receives persona attribution data from the message
- Renders persona name and color in the bubble header
- For multi-persona merged suggestions, shows all persona dots and names
- Type badge (ANSWER/OBJECTION/INFO) stays on the right side
- KB source attribution ("Based on: file.md") still shows when present
- Timestamp still shows at bottom right

**Notes:**
- The `suggestion` message now includes `personas: [{id, name, color}]` (from Task 8)
- Single-persona case: `personas` array has 1 element — renders identically to before but with persona name
- The left border color was previously based on suggestion type. Now it's based on persona color. If you want to keep type colors, use the persona color for the left border and the type color for the badge only.
- Keep the existing suggestion structure — just add persona attribution to the header area
- **Error boundary:** Wrap persona badge rendering in try/catch. On error (malformed data), fall back to generic "Wingman" label and log the error. Don't crash the overlay.

---

### Task 11: Content Script — Multi-Persona Messages

**Intent:** Update the content script message handler to pass persona attribution data through to the overlay.

**Context:** The content script (`content-script.ts`) handles `suggestion` messages and calls `overlay.addSuggestion()`. The message payload now includes `personas` array.

**Key components:**
- `src/content/content-script.ts` — Modify `suggestion` case in message handler

**Changes:**
- Pass `message.data.personas` through to `overlay.addSuggestion()`
- Handle new `session_started` message (or extended existing message) to pass persona list to overlay for header dots
- No new message types needed if we extend existing payloads

**Expected behavior:**
- `suggestion` message: overlay receives persona attribution data
- Session start: overlay receives list of active personas for header dots
- Backward compatible: if `personas` field is missing, fall back to single "Wingman" label

**Notes:**
- This is plumbing — the logic lives in the overlay (Tasks 9, 10) and service worker (Tasks 7, 8)
- Keep the existing `transcript` and `cost_update` handlers unchanged
- The content script doesn't make decisions about persona selection — it just passes data through

---

### Task 12: Post-Call Summary — Persona Metadata

**Intent:** Include persona attribution in the post-call summary and use the conclave leader's system prompt to guide summary generation.

**Context:** Today, `generateCallSummary()` uses the session's single system prompt. With Hydra, the conclave leader's prompt guides the summary. The summary also includes a "Personas Used" section showing which personas contributed and how many suggestions each generated.

**Key components:**
- `src/services/call-summary.ts` — Modify `buildSummaryPrompt()` and `formatSummaryAsMarkdown()`
- `src/background/service-worker.ts` — Pass persona metadata to summary generation

**Expected behavior:**
- Summary generation uses the conclave leader's system prompt (or first active persona if no leader set)
- Summary output includes:
  ```
  PERSONAS USED
  ● Startup Founder — 4 suggestions
  ● Cloud Solutions — 2 suggestions
  ```
- This section appears between the main summary content and the session cost section
- Suggestion counts tracked per persona during the session

**Notes:**
- The conclave leader is read from `getConclaveLeaderId()` at session-stop time
- If the leader ID is stale (persona deleted during session), fall back to first in `sessionPersonas`
- Suggestion count per persona: track in a `Map<string, number>` in the service worker during the session
- For single persona, the "Personas Used" section still appears (1 persona, N suggestions) — consistent UI
- The `CallSummary` interface gains an optional `personasUsed?: Array<{name: string, color: string, count: number}>`
- **Leader attribution:** Add a line at the top of the summary: "Summary guided by [Leader Persona Name]" so users know which expertise shaped it (especially important in Phase 19a before the Conclave tab exists).

---

### Task 13: Transcript Collector + Drive Export Attribution

**Intent:** Add persona attribution to collected suggestions in the transcript collector, and include persona info in Drive exports.

**Key components:**
- `src/services/transcript-collector.ts` — Extend `CollectedTranscript` interface
- `src/services/call-summary.ts` — Include persona info in markdown formatting
- `src/services/drive-service.ts` — Persona attribution flows through to all export formats

**Changes to `CollectedTranscript`:**
```typescript
interface CollectedTranscript {
  // ... existing fields
  persona_id?: string;
  persona_name?: string;
  persona_color?: string;
}
```

**Expected behavior:**
- `addSuggestion()` receives persona attribution from the service worker
- Stored on the `CollectedTranscript` entry
- `formatSummaryAsMarkdown()` includes persona names in the suggestion entries
- Google Docs export: persona name appears in suggestion attribution
- JSON export: persona fields included in each suggestion object
- Markdown/text export: persona name prefixed to suggestion entries

**Notes:**
- Fields are optional — existing data without persona info still works
- For deduped suggestions (multi-persona), use the first persona's ID/name and note both in a comment field
- The Drive service doesn't need structural changes — it reads from the formatted markdown/HTML that `call-summary.ts` produces

---

### Task 14: Unit Tests + Build Verification

**Intent:** Add tests for new persona helper functions, dedup logic, and cooldown tracking. Verify full build compiles cleanly.

**Key components:**
- `tests/persona-helpers.test.ts` — NEW: test getActivePersonaIds, setActivePersonaIds, getConclaveLeaderId, backward compat fallback
- `tests/hydra-pipeline.test.ts` — NEW: test dedup logic (exact match grouping, badge merge)
- `tests/model-tuning.test.ts`, `tests/llm-config.test.ts` etc. — existing tests must still pass

**Test cases for persona helpers:**
- `getActivePersonaIds()` returns `[activePersonaId]` when new key doesn't exist (migration)
- `setActivePersonaIds(['a','b'])` writes both `activePersonaIds` and `activePersonaId` keys
- `setActivePersonaIds([])` throws or prevents empty array
- `getConclaveLeaderId()` falls back to first active when key missing
- Max 4 enforcement in `setActivePersonaIds()`

**Test cases for dedup:**
- Two identical strings → merged with 2 persona badges
- Two different strings → both kept separate
- Whitespace trimming: `"hello "` matches `"hello"`
- Case sensitivity: `"Hello"` does NOT match `"hello"`
- Single persona → no dedup logic triggered (passthrough)

**Build verification:**
- `npm run build` passes with zero errors
- `npm test` passes all existing + new tests
- `npm run typecheck` clean

**QA.md updates — add these items:**
- [ ] Multi-persona selection in popup (add/remove chips, max 4 enforced)
- [ ] Multi-persona selection in options (checkboxes sync with popup)
- [ ] Parallel suggestions arrive with correct persona attribution
- [ ] Exact dedup merges badges when two personas say the same thing
- [ ] Session lock prevents persona changes mid-call (chips disabled)
- [ ] Overlay header shows colored dots for active personas
- [ ] Summary shows "Personas Used" section with counts
- [ ] Summary shows "Summary guided by [Persona]" attribution
- [ ] Single-persona mode works identically to pre-Hydra
- [ ] Rate limit toast appears on 429 (not spammy)

**Manual QA steps for parallel pipeline:**
1. Start session with 2+ personas, verify all appear as dots in header
2. Speak a question that one persona should answer — verify single attributed suggestion
3. Speak a topic that both personas cover — verify 2 separate suggestion bubbles (or merged if identical text)
4. End session — verify summary shows all personas with suggestion counts
5. Repeat with single persona — verify behavior unchanged from pre-Hydra

**Notes:**
- Use `@webext-core/fake-browser` for storage tests (existing pattern)
- Dedup tests are pure logic — no Chrome API mocking needed
- Don't test the parallel pipeline end-to-end in unit tests (too many moving parts) — manual QA covers it

---

### Task 15: Options Page — New Conclave Tab (Phase 19b)

**Intent:** Add a new "Conclave" tab to the Options page between Personas and LangBuilder.

**See mockups:** [UI-MOCKUPS.md, Section 5](./UI-MOCKUPS.md#5-conclave-tab--leader--presets-phase-19b)

**Key components:**
- `src/options/options.html` — Add tab button + tab content section
- `src/options/sections/conclave.ts` — NEW section class
- `src/options/options.ts` — Register new section

**Expected behavior:**
- Tab labeled "Conclave" appears in the tab bar
- Two sections: Conclave Leader (Task 16) and Presets (Tasks 17–18)
- Follows existing tab/section patterns (show/hide on tab click)
- Renders on tab activation, refreshes from storage

**Notes:**
- Follow the same pattern as `api-keys.ts`, `personas.ts` etc. — a class with `init()`, `render()`, event bindings
- The tab content area gets `id="conclave-section"`
- **Subheading for clarity:** The tab content starts with explanatory text: "Configure how multiple personas work together during calls." This helps users who don't know what "Conclave" means.

---

### Task 16: Conclave Leader Picker (Phase 19b)

**Intent:** Add a dropdown in the Conclave tab that lets users pick which persona guides the post-call summary.

**Key components:**
- `src/options/sections/conclave.ts` — Leader picker UI

**Expected behavior:**
- Dropdown populated with active personas only (read from `activePersonaIds`)
- Colored dot next to each option
- Saving sets `conclaveLeaderId` in storage
- Explanatory note below: "The conclave leader's expertise guides the post-call summary. Choose which persona should shape the summary's perspective and recommendations."
- If the selected leader is deactivated (removed from active list), auto-fallback to first active persona
- Listens to `chrome.storage.onChanged` to refresh when active personas change

**Notes:**
- The dropdown should show persona names with their colors
- Default selection: first active persona (if `conclaveLeaderId` not set)
- This is a simple dropdown + save, not a complex component

---

### Task 17: Preset Data Model + CRUD (Phase 19b)

**Intent:** Define the data model for conclave presets and implement create/read/update/delete operations.

**Key components:**
- `src/shared/persona.ts` — Add preset interfaces and storage helpers (or create `src/shared/conclave.ts`)

**Data model:**
```typescript
interface ConclavePreset {
  id: string;          // crypto.randomUUID()
  name: string;        // e.g., "Board Meeting"
  personaIds: string[]; // 2–4 persona IDs
  createdAt: number;
  updatedAt: number;
}
```

**Storage key:** `conclavePresets: ConclavePreset[]`

**CRUD functions:**
```typescript
getConclavePresets(): Promise<ConclavePreset[]>
saveConclavePreset(preset: ConclavePreset): Promise<void>
deleteConclavePreset(id: string): Promise<void>
activatePreset(id: string): Promise<void>
// activatePreset reads the preset's personaIds → calls setActivePersonaIds()
```

**Notes:**
- Presets reference persona IDs — if a persona is deleted, the preset becomes stale
- On `activatePreset()`, validate that all referenced personas still exist. If any are missing, show a warning modal: "This preset references deleted personas: [names]. Remove them from the preset?" with [Remove & Activate] and [Cancel] buttons.
- **Unique preset names:** Validate on save that no other preset has the same name (case-insensitive). Show error toast if duplicate: "A preset named '[name]' already exists."
- Max 4 personas per preset (same as the general cap)

---

### Task 18: Preset UI + Popup Quick-Switch (Phase 19b)

**Intent:** Build the preset management UI in the Conclave tab and preset quick-switch buttons in the popup.

**See mockups:** [UI-MOCKUPS.md, Sections 5 and Flow E](./UI-MOCKUPS.md#5-conclave-tab--leader--presets-phase-19b)

**Key components:**
- `src/options/sections/conclave.ts` — Preset list + editor modal
- `src/popup/popup.ts` — Preset buttons above persona chips

**Options page — Preset list:**
- Each preset card shows: name, persona dots/names, [Activate] [Edit] [Delete] buttons
- [+ New Preset] button opens editor modal
- Editor modal: name input + persona checkboxes (max 4) + Save/Cancel

**Popup — Quick-switch:**
- Preset buttons shown above the persona chips: `[Board Meeting] [Sales Call]`
- Clicking a preset button calls `activatePreset()` → refreshes chip list
- Buttons disabled during active session (same lock as chips)
- If no presets exist, this section is hidden

**Notes:**
- Use the existing `ModalManager` from `src/options/sections/shared/` for the preset editor modal
- Preset buttons in the popup should be compact — short names, horizontal scroll if needed
- The popup reads presets from storage on load and on 2s polling cycle

---

## Appendix

### Success Metrics

1. **Multi-persona activation**: Users can select 2–4 personas and start a session with all of them active
2. **Parallel suggestions**: Each active persona generates suggestions independently; no single-persona bottleneck
3. **Attribution clarity**: Users can identify which persona generated each suggestion at a glance
4. **Zero regression**: Single-persona usage works identically to pre-Hydra behavior
5. **Performance**: Parallel pipeline adds <200ms wall-clock latency compared to single-persona (stagger overhead only)

### Rollback Plan

Hydra is additive and backward compatible:
- **Quick disable**: Set `activePersonaIds` to a single-element array → system reverts to single-persona behavior everywhere
- **UI rollback**: Revert popup/overlay changes (Tasks 2, 9, 10) → back to single dropdown. Service worker changes (Tasks 6, 7) still work with 1 persona
- **Full rollback**: Revert all tasks. `activePersonaId` (singular) still works as it always did. No storage migration to undo.

### Technical Decisions

1. **Parallel calls, not smart routing**: Each persona gets its own LLM call. The LLM's built-in silence (`---`) is the routing mechanism — no extra router call needed. Higher cost but higher quality and no extra latency.

2. **One GeminiClient instance, persona passed per-call**: Avoids creating N client instances. Provider config, rate limits, and conversation history are session-level concerns shared across personas. Only system prompt and KB filter differ per persona.

3. **Exact string dedup only**: No fuzzy matching or LLM-based similarity detection. If two personas say the same thing verbatim, merge badges. Different wording = show both. Simple, zero-cost, no false positives.

4. **All personas equal**: No primary/priority persona. No shorter cooldowns. No ordering bias. The conclave leader only affects summary generation, not real-time suggestions.

5. **100ms call stagger**: Simple `setTimeout` spread to avoid hitting burst rate limits on Groq/Gemini free tier. Not exact science — just enough to avoid simultaneous requests.

6. **Cap at 4 (UI only, no cost warnings)**: Users decide their own spending. The cap is a practical UI constraint, not a cost protection measure. Some users will have very narrow per-contact personas and want 3–4 active.

7. **Session-locked personas**: Active personas cannot be changed during a session. Same pattern as today's single persona. Prevents mid-call state inconsistencies.

8. **Conclave leader for summaries**: User explicitly picks which persona's expertise guides the post-call summary. Defaults to first active persona. Configured in the Conclave tab (Phase 19b).

### Dependencies

- **Task 1** (storage) blocks Tasks 2, 3, 6
- **Task 4** (GeminiClient method) blocks Task 7
- **Task 5** (cooldowns) blocks Task 7
- **Task 7** (parallel pipeline) blocks Task 8
- **Task 8** (dedup) blocks Tasks 10, 11
- **Tasks 9, 10** (overlay) can be done in parallel
- **Task 14** (tests) should be done last in Phase 19a
- **Phase 19b** (Tasks 15–18) depends on Phase 19a being complete

### Out of Scope

- **Per-persona LLM providers**: Different providers per persona (e.g., Groq for speed, OpenRouter for quality). Revisit in a future phase.
- **Fuzzy deduplication**: Semantic similarity detection between suggestions. Exact match only for now.
- **Smart routing (two-stage)**: A router LLM call to pick the best persona per transcript. Option B from the ideation — rejected in favor of parallel calls.
- **Persona priority/weighting**: Giving certain personas shorter cooldowns or higher display priority.
- **Cost warnings for multi-persona**: No warnings or caps based on cost. Users manage their own spending.
- **Cross-session persona analytics**: Tracking which personas are most useful over time.
- **Real-time persona add/remove during session**: Personas are locked at session start.

---

## Review Notes

### User Perspective Review

**What's good:**
- Multi-persona feels like upgrading from one advisor to a panel of experts
- Per-contact dossier personas are a powerful use case for relationship-heavy roles (sales, BD, recruiting)
- Attribution colors make it instantly clear which expertise contributed
- No cost warnings — users are trusted to manage their own spending

**Gaps identified and addressed:**
1. **What if I only use one persona?** → Backward compat preserved. Single persona looks and works exactly like today. The "+ Add persona" dropdown is unobtrusive.
2. **Will I get flooded with suggestions?** → LLMs already handle silence well. Most transcripts trigger 0–1 suggestions across all personas. Exact dedup catches the rare identical response.
3. **How do I know which persona to activate?** → Each persona's KB doc count and description snippet shown in the activation UI. Quick visual to understand what each persona covers.
4. **Can I save my favorite combos?** → Yes, via presets in the Conclave tab (Phase 19b). Quick-switch buttons in popup.
5. **How will I discover multi-persona?** → First-time tooltip on popup load points to "+ Add persona" button. (Added to Task 2)
6. **What if I hit rate limits?** → Non-blocking toast appears: "Rate limited — some suggestions skipped." (Added to Task 7)
7. **Who guides my summary in Phase 19a?** → Summary shows "Summary guided by [Persona Name]" so it's clear. (Added to Task 12)

### Senior Engineering Manager Review

**What's good:**
- Backward-compatible storage model — no migration function needed
- Parallel `Promise.allSettled` is the right pattern — one failure doesn't cascade
- Per-persona cooldowns prevent one chatty persona from starving others
- 100ms stagger is a pragmatic rate limit mitigation without complex queuing
- Clean separation between pipeline changes (service worker) and UI changes (overlay/popup)

**Gaps identified and addressed:**
1. **Conversation history sharing**: All personas see the same `conversationHistory` in GeminiClient. This is correct — they're all observing the same call. But if history includes previous suggestions, persona A might see persona B's suggestion in context. → This is actually desirable — personas build on each other's contributions. History mutation safety clarified in Task 4.
2. **Race condition in dedup**: Two personas finishing at different times — does dedup work? → Yes, `Promise.allSettled` waits for ALL to complete before dedup runs. No streaming/incremental dedup needed.
3. **Memory footprint**: 4 personas × full system prompts + KB contexts in parallel. → Service workers have generous memory limits (>100MB). 4 prompts of 5KB each + KB chunks is negligible.
4. **Test coverage gap**: No integration test for the parallel pipeline end-to-end. → Manual QA steps now specified in Task 14. Unit tests cover the building blocks.
5. **Stagger code bug**: Original code resolved Promise immediately instead of awaiting. → Fixed in Task 7 code snippet.
6. **Error handling underspecified**: Task 4 now explicitly says return `null` on any error, never throw.
7. **Dedup complexity**: Clarified O(n) Map-based grouping in Task 8.
8. **Overlay crash risk**: Task 10 now has error boundary around persona badge rendering.
9. **Message contract vague**: Task 9 now says extend existing message, don't add new type.

### Product Manager Review (Second Pass)

**What's good:**
- Feature overview clearly explains the "why" with concrete use cases
- Phasing is clean: 19a delivers value, 19b adds power-user features
- Acceptance criteria are testable and specific
- Out of scope prevents creep into router/priority/analytics territory

**Gaps identified and addressed:**
1. **No onboarding hint for new feature.** → First-time tooltip added to Task 2.
2. **Preset quick-switch could replace the chips entirely.** → Both coexist — chips for ad-hoc, presets for saved combos.
3. **Summary "Personas Used" section is informational but not actionable.** → True, but useful for post-call review. No action needed.
4. **"Conclave" tab name is jargon.** → Subheading added in Task 15: "Configure how multiple personas work together during calls."
5. **Deleted persona in preset.** → Warning modal with [Remove & Activate] option added to Task 17.
6. **Duplicate preset names.** → Unique name validation added to Task 17.
7. **QA checklist missing.** → Full QA.md updates and manual QA steps added to Task 14.
