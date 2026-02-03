# Phase 13: Overlay Persona Picker

## Problem

During a live Google Meet call, if a user realizes they're on the wrong persona (wrong product KB, wrong prompt style), they currently have to:
1. Open the extension popup
2. Switch the persona in the dropdown
3. The change only takes effect on the **next** session — they'd have to stop and restart

This is disruptive during a live call. The user needs a way to hot-swap personas from the overlay itself, mid-session, without leaving the Google Meet tab.

## Proposed Solution

Add a persona picker directly into the overlay's menu bar (the drag handle / header area). The user can switch personas during a live call and the change takes effect immediately — the system prompt and KB filter update in real-time.

## User Experience

### Before a call
- User starts a session with Persona A active
- Overlay header shows "Wingman · Persona A" with the persona's color dot (existing behavior)

### Mid-call switch
- User clicks the persona label in the overlay header
- A compact dropdown appears showing all available personas (name + color dot)
- User selects Persona B
- The overlay header updates to "Wingman · Persona B"
- The service worker receives a message to hot-swap:
  - System prompt updates to Persona B's prompt
  - KB document filter updates to Persona B's `kbDocumentIds`
  - The next suggestion uses the new persona's context
- Previous suggestions/transcripts in the timeline remain unchanged (they were generated under the old persona — no revisionist history)
- A subtle toast or indicator confirms the switch: "Switched to Persona B"

### Edge cases
- If only one persona exists, the picker is hidden or disabled (no point switching)
- If the user switches rapidly, debounce to prevent thrashing the Gemini client
- The Deepgram transcription is unaffected — only the suggestion engine changes

## Technical Design

### Overlay (content script)
- The persona label (already rendered in the header) becomes clickable
- On click, render a dropdown menu inside the shadow DOM
- Dropdown lists all personas from `chrome.storage.local` (name + color dot)
- Active persona has a checkmark or highlight
- On selection:
  1. Update `activePersonaId` in `chrome.storage.local`
  2. Send a `SWITCH_PERSONA` message to the service worker
  3. Update the header label text and color
  4. Close the dropdown

### Service Worker
- New message handler: `SWITCH_PERSONA`
- On receive:
  1. Load the new active persona from storage
  2. Call `geminiClient.setSystemPrompt(persona.systemPrompt)`
  3. Call `geminiClient.setKBDocumentFilter(persona.kbDocumentIds)`
  4. Log the switch
  5. Respond with `{ success: true }`
- No need to restart Deepgram — transcription continues uninterrupted

### Popup
- The popup's persona dropdown should also reflect mid-session changes
- Remove the "Takes effect on next session" hint — switching is now live
- The popup switch should also send `SWITCH_PERSONA` to the service worker (not just update storage)

## UI Design Notes

### Dropdown positioning
- Anchored below the persona label in the overlay header
- Opens downward, left-aligned with the label
- Max height with scroll if many personas
- Closes on: selection, click outside, Escape key
- Z-index above the overlay panel content

### Dropdown item layout
```
┌─────────────────────────┐
│ ● Cloud Security Demo ✓ │  ← active (checkmark)
│ ● Analytics Discovery   │
│ ● Default               │
└─────────────────────────┘
```

### Styling
- Semi-transparent dark background (matches overlay theme)
- Hover highlight on items
- Persona color dot (8px circle) before each name
- Current persona has a checkmark or "Active" indicator
- Smooth fade-in animation
- Must work inside the closed shadow DOM (all styles inline)

## Impact on Existing Features

- **Overlay header**: Persona label changes from static text to clickable trigger
- **Service worker**: New `SWITCH_PERSONA` message type (uppercase, per convention)
- **Gemini client**: `setSystemPrompt()` and `setKBDocumentFilter()` already exist — no changes needed
- **Popup**: Minor update to also send `SWITCH_PERSONA` when switching mid-session
- **No Deepgram changes**: Transcription is persona-independent
- **No IndexedDB changes**: KB documents stay the same, only the filter changes

## Dependencies
- Phase 12 persona system must be fully implemented
- The `SWITCH_PERSONA` message type must be added to the service worker's message handler

## Out of Scope
- Auto-switching based on meeting topic/participants
- Persona-specific overlay themes or layouts
- Showing which persona generated which suggestion in the timeline (could be a future enhancement)
