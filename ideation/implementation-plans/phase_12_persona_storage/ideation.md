# Phase 12: Persona Selector & Storage

## Problem

A salesperson handles different products, call types, and buyer audiences throughout the week. Today Wingman has one system prompt and one shared pool of KB documents — meaning before each call they'd need to manually rewrite the prompt and swap KB files to match the context. Nobody does that. So in practice, everyone runs the same generic setup for every call, leaving value on the table.

This also makes **prompt testing** a chore: to A/B test two different instruction styles, you have to copy-paste prompts in and out of the text area and remember what you changed.

## Real User Scenarios

**Multi-product rep:** Sells both a cloud security product and a data analytics platform. Needs completely different talking points, objection handlers, and reference docs for each.

**Call-type switching:** The same rep runs discovery calls (open-ended questions, no hard selling) and live demos (technical deep-dives, feature walkthroughs). The AI should behave differently in each.

**Team onboarding:** A sales manager dials in the perfect prompt + KB combo, then needs to share that exact configuration with 5 new hires so they all get the same AI coaching on day one.

**Prompt tuning:** A power user wants to test whether a shorter, more direct prompt produces better suggestions than a detailed one. They need to flip between the two across real calls and compare.

## Idea

**Personas** — named profiles that bundle a system prompt + a set of KB documents into a switchable preset. Users pick a persona before a call, and Wingman reconfigures what it knows and how it behaves. Personas can be exported as files and shared with teammates.

## User Experience

### Day-to-Day Workflow

The most important interaction is the **switch** — it needs to be fast and obvious.

**Before a call (2-click switch):**
1. User clicks the Wingman popup icon
2. Sees a dropdown showing the active persona name (e.g., "Cloud Security Demo")
3. Clicks it, selects "Analytics Discovery" from the list
4. Clicks "Start Session" — Wingman now uses that persona's prompt and KB docs

No options page visit required for the common case. The popup is the primary switching surface.

**During a call:**
The overlay header shows the active persona name next to "Wingman" (e.g., "Wingman · Analytics Discovery") so the user always knows which context is live. Small but important — prevents the "wait, which prompt am I running?" moment.

**Between calls:**
Switching persona between sessions is instant. Mid-session switching shows a brief warning: "New persona will apply on next session" (avoids jarring context switches while the AI is actively responding).

### Creating & Editing Personas (Options Page)

A new **"Personas"** tab in the options page, placed between "Call Settings" and "Knowledge Base."

**List view:**
- Cards for each persona showing name + number of KB docs assigned + a colored dot/tag for quick visual identification
- Active persona is visually highlighted (e.g., check mark badge or "Active" label)
- "New Persona" button at the top
- "Import" button (accepts `.json` files, drag-and-drop supported)

**Edit view (expanding card or inline panel — not a separate page):**
- **Name** — short label, e.g., "Enterprise Security Demo"
- **Color tag** — small color picker (6–8 preset colors). Used in the popup dropdown and overlay header to visually distinguish personas at a glance
- **System prompt** — same textarea with 100–10,000 char validation, same as the current system prompt editor
- **KB documents** — checklist of all uploaded KB docs with checkboxes. Each row shows filename, file type icon, and size. "Upload New" link that opens the KB upload flow and auto-assigns the new doc to this persona
- **Export** button — downloads this persona as a `.json` file
- **Duplicate** button — creates a copy named "Enterprise Security Demo (copy)" with the same prompt and KB selection. Key for prompt tuning: duplicate, tweak one thing, compare across calls
- **Delete** button — with confirmation

**Key UX decision — where does the system prompt live now?**
The current standalone "System Prompt" section in the Advanced tab gets replaced. The prompt now lives inside each persona. This avoids confusion about "which prompt is actually being used?" Having two places to edit prompts would be a source of bugs and user confusion. The Advanced tab can keep a read-only display of the active persona's prompt with an "Edit in Personas" link.

### Knowledge Base Tab Interaction

The existing KB tab remains the place to **upload and manage documents**. The persona editor just references which docs belong to each persona via checkboxes. If a user uploads a doc from the KB tab directly, it's added to the shared pool (unassigned) — they can then assign it to personas.

A subtle addition: on the KB tab, each document row shows small colored dots for which personas reference it (using the persona's color tag). This answers "where is this doc being used?" at a glance.

### First-Time Experience & Migration

Existing users who update should notice **zero change** to their workflow unless they choose to explore personas:

1. On first load, Wingman creates a "Default" persona from the current system prompt + all existing KB docs
2. This persona is set as active
3. The popup shows "Default" in the persona dropdown
4. Everything works exactly as before

The "Personas" tab appears in settings, and the popup dropdown is visible, but the user doesn't need to touch either if they're happy with one configuration.

For brand-new users, Wingman starts with a single "Default" persona using the built-in default system prompt and no KB docs — same as today.

### Import & Export

**Export (sharing a persona with a teammate):**
1. User opens Personas tab, clicks "Export" on a persona
2. A `.json` file downloads (e.g., `wingman-persona-cloud-security-demo.json`)
3. The file contains the persona name, color, system prompt, and the **extracted text** of all assigned KB documents (not the raw PDFs — just the plain text)
4. File is portable and small — typically under 1MB even with several docs

**Import (receiving a persona):**
1. User clicks "Import" on the Personas tab (or drags a `.json` file onto the page)
2. Wingman shows a preview: persona name, prompt preview, list of KB docs that will be created
3. User confirms — progress bar shows as KB docs are re-chunked and re-embedded using their own Gemini key
4. New persona appears in the list, ready to activate

**Why extracted text, not raw files?** Raw PDFs/Markdown would make export files huge and require re-extraction. Extracted text keeps exports small and ensures the import experience is consistent. Embeddings are regenerated on import because they depend on the user's own Gemini API key.

**Import validation:**
- If no Gemini API key is configured → block import, show toast explaining why
- If persona name conflicts → append " (imported)" to avoid confusion
- If the file is malformed → clear error message, don't partially import

### Duplicate Workflow for Prompt Testing

This is the core workflow for testing different instruction sets:

1. Open Personas tab
2. Click "Duplicate" on an existing persona → creates "Cloud Security Demo (copy)"
3. Rename to "Cloud Security Demo — Concise"
4. Edit the system prompt (make it shorter/more direct)
5. Run a few calls with persona A, then switch to persona B for a few calls
6. Compare suggestion quality across the two

No import/export needed, no copy-pasting prompts. Duplicate handles the grunt work.

## Core Data Model

```typescript
interface Persona {
  id: string;               // UUID
  name: string;             // e.g., "Cloud Security Demo"
  color: string;            // Hex color for visual tag (e.g., "#4A90D9")
  systemPrompt: string;     // Full system prompt text
  kbDocumentIds: string[];  // References to KB documents assigned to this persona
  createdAt: number;
  updatedAt: number;
}
```

A persona **references** KB documents (by ID), it does not copy them. KB documents remain in the shared IndexedDB store. Multiple personas can reference the same document.

## Storage Design

### chrome.storage.local (recommended)

```
New storage keys:
  personas        → Persona[]  (JSON array)
  activePersonaId → string     (UUID of active persona)
```

Personas are small data (prompt ≤ 10KB + a list of doc IDs + name/color). chrome.storage.local is the right fit — consistent with how all other settings are stored, and the 5MB limit can hold hundreds of personas.

KB documents stay in IndexedDB — no change.

### Migration

On first load after update:
1. Check if `personas` key exists → if yes, skip
2. Read current `systemPrompt` from storage (or use `DEFAULT_SYSTEM_PROMPT`)
3. Read all KB document IDs from IndexedDB
4. Create a "Default" persona with those values
5. Set `activePersonaId` to its ID
6. Keep the legacy `systemPrompt` key as a fallback for one release cycle

## Integration Points

### Service Worker (`service-worker.ts`)

On `START_SESSION`:
1. Read `activePersonaId` from storage
2. Load the matching persona from `personas` array
3. Pass `persona.systemPrompt` to `geminiClient.setSystemPrompt()`
4. Store `persona.kbDocumentIds` so KB search filters to those docs

### KB Search (`kb-search.ts`)

Add an optional `documentIds?: string[]` filter to `searchKB()` and `getKBContext()`. When provided, only search chunks belonging to those documents. When omitted, search all (backwards compatible).

### Gemini Client (`gemini-client.ts`)

No changes needed. Already receives prompt via `setSystemPrompt()`.

### Popup (`popup.html` / `popup.ts`)

New persona dropdown added to the status section, between the API Keys status and Session status rows. Shows persona name + color dot. Dropdown lists all personas. Selecting one updates `activePersonaId` in storage immediately.

### Overlay (`overlay.ts`)

The header changes from `Wingman` to `Wingman · {persona name}` with the persona's color dot next to it. Reads from storage on init, listens for `storage.onChanged` to update live.

### Options Page — System Prompt Section

The standalone system prompt editor in the Advanced tab becomes a read-only preview of the active persona's prompt with an "Edit in Personas tab" link. This avoids user confusion about which prompt is in effect.

## Export File Format

```json
{
  "wingmanPersona": true,
  "version": 1,
  "persona": {
    "name": "Cloud Security Demo",
    "color": "#4A90D9",
    "systemPrompt": "You are a cloud security expert...",
    "kbDocuments": [
      {
        "filename": "security-whitepaper.pdf",
        "fileType": "pdf",
        "textContent": "extracted plain text of the document..."
      }
    ]
  }
}
```

## Edge Cases

- **Deleting a KB document used by personas**: Remove its ID from all personas that reference it. Show a warning listing which personas are affected before confirming.
- **Deleting a persona**: Only deletes the persona config — KB documents are not deleted (they may be shared). Offer a checkbox: "Also delete KB documents only used by this persona."
- **Active persona deleted**: Fall back to "Default." If Default is gone, recreate it from `DEFAULT_SYSTEM_PROMPT`.
- **Import without Gemini key**: Block import with a clear toast — embeddings can't be generated without it.
- **All personas deleted**: Auto-create a new "Default" persona so the extension always has one.
- **Switching persona mid-session**: Toast warning that the change applies on next session start. Don't hot-swap mid-conversation.

## Scope Boundaries

**In scope:**
- Persona CRUD with name, color tag, system prompt, and KB document assignment
- Persona dropdown in popup for quick switching
- Persona name + color in overlay header
- Duplicate persona for prompt testing workflow
- JSON import/export with embedded KB text and import preview
- Migration of existing settings to a "Default" persona
- KB documents tab shows which personas reference each doc
- Read-only prompt preview in Advanced tab linking to Personas tab

**Out of scope (future phases):**
- Persona-specific call summary or speaker filter settings
- Cloud sync of personas across devices
- Sharing personas via URL/link
- Per-persona call history or suggestion quality analytics
- Auto-switching persona based on meeting title, calendar event, or participant list
- Bulk export/import of all personas at once
