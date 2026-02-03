# Implementation Plan: Overlay Redesign — Unified Chat Timeline

---

## Executive Summary

The Wingman overlay currently separates transcripts and AI suggestions into two disconnected areas. Transcripts show only the latest utterance per speaker (replace-in-place), while suggestions stack in reverse chronological order in a separate container. This makes it impossible to follow the conversation flow — you can't see what was said, what you said, and what Wingman suggested in context.

This phase redesigns the overlay as a **unified chat timeline** — a single scrollable stream where transcript bubbles and AI suggestion bubbles appear interleaved in chronological order, like a group chat where Wingman is a participant. When scrolling through a meeting, you see the full conversation with Wingman's suggestions appearing right after the moments that triggered them.

**Key Outcomes:**
- Single chronological timeline with transcripts and suggestions interleaved
- Chat bubble UI: speaker-differentiated bubbles (You on right, Participant on left, Wingman centered)
- Full transcript history (all final transcripts retained, not just latest per speaker)
- Smart auto-scroll with manual override
- Modern visual design with gradients, animations, and smooth bubble entrances
- Overlay header and controls visually refreshed
- Post-call summary transitions smoothly from the timeline view

---

## Code Review Corrections (Pre-Implementation Audit)

> **This section documents findings from a deep code audit that corrects assumptions in the original plan. Each task description below has been updated to reflect these findings. Implementers should read this section first.**

### Critical: Overlay Transcript Interface Is Incomplete

The overlay's `Transcript` interface (`overlay.ts:20-24`) only declares `text`, `speaker`, and `is_final`. It does NOT include `timestamp` or `is_self`. However, the runtime objects flowing through `message.data` from the content script DO carry these fields (Deepgram's full `Transcript` object has `timestamp: string`, `is_self: boolean`, `speaker_role`, `confidence`). TypeScript's structural typing allows the superset through, but the interface must be updated to declare the fields we rely on.

**Required change in Task 1:** Update the overlay's `Transcript` interface to include `timestamp: string` and `is_self: boolean`.

### Critical: Content Script Transformation Layer

The content script (`content-script.ts:113-131`) performs significant remapping on suggestion data before passing it to the overlay:
- `suggestion_type` is remapped: `'answer'`/`'technical'` → `'answer'`, `'objection'`/`'comparison'` → `'objection'`, everything else (including `'question'`) → `'info'`
- `text` is extracted from `message.data.response || message.data.text || 'No suggestion available'`
- `timestamp` is converted from ISO string to epoch number: `new Date(message.data.timestamp).getTime()`
- `question` and `kbSource` are passed through

This transformation layer must be preserved. The overlay receives already-transformed data. The plan's `TimelineEntry` type aligns with what the overlay receives (post-transformation), not what the service worker sends.

### Session Lifecycle Constraints

Several overlay methods have side effects the plan must account for:

| Method | Behavior | Plan Impact |
|--------|----------|-------------|
| `showLoading()` (`overlay.ts:697-723`) | Sets `container.innerHTML` on `.suggestions-container`, hides transcript section | Must NOT destroy `.timeline` DOM. Loading indicator should overlay or be placed in `.summary` container |
| `showSummaryError()` (`overlay.ts:822-839`) | Replaces content, then `setTimeout(() => this.hide(), 3000)` | Auto-hide after error must be reconsidered — user loses timeline access |
| `hide()` (`overlay.ts:903-909`) | Sets `summaryShown = false`, `currentSummary = null` | Post-call toggle breaks if hide destroys summary state. Must preserve state |
| `forceShow()` (`overlay.ts:891-898`) | Un-minimizes overlay, called on new session start | Must clear old timeline entries for new session |
| `HIDE_OVERLAY` message (`service-worker.ts:523-526`) | Sent when summary disabled or <5 transcripts | User loses timeline. Reconsider: keep timeline visible even without summary |
| `overlayDismissedByUser` flag (`content-script.ts:15,42,143-158`) | Gates summary-related messages after user dismisses | Must be preserved — if user closed overlay, don't force it back |

### Font Size Scaling

`applyFontSize()` (`overlay.ts:1031-1070`) targets specific CSS selectors: `.suggestion-content`, `.suggestion-header`, `.empty-state`, `.transcript-section`. New bubble classes (`.bubble-text`, `.bubble-time`, `.bubble-header`, `.wingman-label`, `.badge`) must be added to font size scaling.

### Overlay Size Persistence

The overlay supports resize and position persistence via `chrome.storage.local` (`overlay.ts:960-1017`). Size ranges from 280×200px to 600×80vh. The timeline must work at all persisted sizes.

### Google Meet DOM Re-Attachment

`ensureOverlayAttached()` (`content-script.ts:56-62`) re-appends the overlay container if Google Meet detaches it. Timeline state (in-memory array + DOM nodes in shadow root) survives re-attachment since the shadow root is on the container element.

---

## Product Manager Review

### Feature Overview

The overlay is the product. It's what users see during every Google Meet call. The current design forces users to mentally correlate two separate areas — "what was said" at the bottom and "what Wingman suggests" in the scrollable area above. During a fast-moving sales call, this cognitive split means users miss suggestions or lose context about what triggered them.

A unified timeline turns the overlay into something intuitive: a conversation you can follow. The AI becomes a natural participant in the discussion, not a disconnected feed.

### Features

Each feature below has been reviewed through four lenses:

- **User**: Does this solve a real problem? Is it intuitive?
- **Product Manager**: Does this deliver value? Is scope right?
- **UX Designer**: Is the interaction design sound?
- **System Engineer**: Is this technically feasible? What are the risks?

---

#### Feature 1: Unified Timeline Data Model

**What it is:** A new in-memory data structure that stores both transcripts and suggestions as entries in a single chronological array. Each entry has a `kind` field (`transcript` or `suggestion`), a `timestamp`, and the relevant payload.

**Review:**

> **User:** "I don't see this directly, but it's what makes the interleaved view possible. As long as the timeline is in the right order, I'm happy."
>
> **Product Manager:** This is the foundation — without a unified data model, the timeline is impossible. Low user-visible effort, high architectural value. Must be done first. Scope is tight: one array, one sort key (timestamp), two entry types.
>
> **UX Designer:** The data model determines rendering order. Timestamps reflect when something was *received/processed*, not when words were spoken. Deepgram timestamps mark when the transcript result was received from the WebSocket (`deepgram-client.ts:240`). Gemini timestamps mark when the suggestion was generated (`gemini-client.ts:276`). Since suggestions always arrive after their triggering transcripts due to API latency, chronological ordering by timestamp naturally places suggestions after the utterances that triggered them.
>
> **System Engineer:** Straightforward. The overlay currently holds zero transcript history and up to 10 suggestions. The new model accumulates entries. Memory concern: a 1-hour meeting with ~4 final transcripts/minute = ~240 transcript entries + ~15 suggestions = ~255 entries. Each entry is a small object (~200 bytes). Total: ~50KB — negligible. Cap at 500 entries as a safety valve (oldest trimmed). The transcript `is_final` handling needs attention: interim transcripts should update the last entry for that speaker, not create new entries.
>
> **Code audit note:** The overlay's current `Transcript` interface (`overlay.ts:20-24`) lacks `timestamp` and `is_self`. The Deepgram client sends `timestamp: string` (ISO) and `is_self: boolean` on the runtime object. The content script passes `message.data` directly to `overlay.updateTranscript()` without transformation (unlike suggestions, which are remapped). Task 1 must update the overlay's `Transcript` interface to declare these fields, and convert the ISO timestamp to epoch number when creating `TimelineEntry` objects.

---

#### Feature 2: Full Transcript History

**What it is:** Instead of showing only the latest utterance per speaker (replace-in-place), the overlay now keeps all final transcripts and renders them as individual chat bubbles in the timeline.

**Review:**

> **User:** "This is exactly what I wanted. Right now I can only see the last thing each person said. I want to scroll up and see the whole conversation — who said what and when."
>
> **Product Manager:** High-value, directly addresses the core user complaint. This is what makes the timeline a timeline. Without history, there's nothing to interleave. Risk: users with very long calls might have a lot of entries — but the 500-entry cap handles this. The post-call summary already exists for long-call review, so the timeline is for live reference, not archival.
>
> **UX Designer:** Key design decision: **interim vs. final transcripts**. Deepgram sends interim transcripts (partial, updating) before final ones. Showing every interim would create flickering noise. The right pattern: show the latest interim as a "typing indicator" style bubble for the active speaker, then replace it with the final bubble when it arrives. Only final transcripts get permanent entries in the timeline. The interim bubble should have a subtle visual difference (lighter opacity, no timestamp) so users understand it's in-progress.
>
> **System Engineer:** The current `updateTranscript()` method receives both interim and final transcripts. Today it replaces in place. The change: (1) For interim transcripts, update a temporary "active speaker" bubble at the bottom of the timeline. (2) For final transcripts, commit a permanent entry to the timeline array and render a new bubble. The Transcript data already has `is_final: boolean`, so no service worker changes needed. The content script forwards everything — the overlay decides how to render. Risk: Deepgram sometimes sends multiple finals in rapid succession for the same utterance (corrections). Need to deduplicate or merge consecutive finals from the same speaker within a short window (~500ms).
>
> **Code audit note:** For transcripts, the content script passes `message.data` directly (`content-script.ts:105`) — no transformation. The runtime object carries `is_self: boolean` and `timestamp: string` (ISO) beyond what the overlay's TypeScript interface declares. Speaker alignment should use `is_self` (not string comparison on `speaker`) since it's a clean boolean from the Deepgram channel index (`deepgram-client.ts:226-230`).

---

#### Feature 3: Chat Bubble UI

**What it is:** Transcripts and suggestions render as visually distinct chat bubbles in a single scrollable container. Speaker bubbles are positioned and colored to distinguish who's talking. Wingman's suggestions are visually distinct as AI contributions.

**Layout:**

```
┌─────────────────────────────────┐
│ [Participant bubble - LEFT]     │
│ "What's your pricing for the    │
│  enterprise tier?"       2:34PM │
├─────────────────────────────────┤
│     [Your bubble - RIGHT]       │
│     "Let me walk you     2:34PM │
│      through that."             │
├─────────────────────────────────┤
│  ┌─ Wingman ────────────────┐   │
│  │ From your price sheet:    │  │
│  │ Enterprise tier is $499/  │  │
│  │ month per seat with...    │  │
│  │           Based on: prices.pdf│
│  └───────────────── 2:34PM ──┘  │
├─────────────────────────────────┤
│ [Participant bubble - LEFT]     │
│ "That sounds reasonable.        │
│  What about volume discounts?"  │
└─────────────────────────────────┘
```

**Review:**

> **User:** "This is how every chat app works — I immediately understand who said what. The AI suggestion sitting right after the question it answers is exactly what I need. I can glance at it, use it or ignore it, and keep going."
>
> **Product Manager:** This is the hero feature. The visual distinction between speakers + AI is critical for scanability during a live call. Must be immediately clear at a glance — no reading labels required. Color coding + position is the right approach. Scope check: do we need copy-to-clipboard on individual bubbles? Decision: no, not in this phase. The transcript copy is handled by the summary. Keep bubbles simple.
>
> **UX Designer:** Three visual channels to distinguish message types:
> - **Position**: Participant left-aligned, You right-aligned, Wingman full-width centered
> - **Color**: Participant = neutral surface, You = subtle brand tint, Wingman = distinct accent (gradient border or background)
> - **Shape**: All rounded bubbles, but Wingman gets a left accent bar (consistent with current suggestion cards) plus a small wing/robot icon
>
> Bubble anatomy:
> - **Transcript bubble**: Speaker label (first occurrence only, or when speaker changes), message text, timestamp (right-aligned, muted)
> - **Suggestion bubble**: "Wingman" label with icon, type badge (Answer/Info/Objection), message text, KB source if applicable, timestamp
>
> The suggestion type badge should use the existing color coding: Answer = orange, Objection = red, Info = yellow. This is already familiar from the current design.
>
> Font size: current overlay uses 13px for suggestions and 12px for transcripts. Unify at 13px for readability. Timestamps at 11px.
>
> **System Engineer:** The current overlay renders suggestions and transcripts in separate containers. The refactor replaces both with a single `.timeline` container. Each entry is a `<div>` with a class indicating type and alignment: `.bubble.participant`, `.bubble.self`, `.bubble.wingman`. CSS handles positioning via `align-self: flex-start/flex-end/center` in a flex column. The suggestion type badge and KB source are child elements within the wingman bubble. No new DOM APIs needed — this is simpler than the current split layout. Performance: 255 DOM nodes for a 1-hour call is trivial for Chrome's rendering engine.
>
> **Code audit note:** All bubble text must be passed through `escapeHtml()` (`overlay.ts:874-878`) to prevent XSS. **This is a new safety measure** — the current `addSuggestion()` and `updateTranscript()` inject text directly into innerHTML without escaping. The new `renderBubble()` must not repeat this mistake.

---

#### Feature 4: Smart Auto-Scroll

**What it is:** New messages auto-scroll the timeline to the bottom so users always see the latest. If the user manually scrolls up to review earlier content, auto-scroll pauses. It resumes when the user scrolls back to the bottom.

**Review:**

> **User:** "During a live call, I want to see the latest messages without doing anything. But sometimes I need to scroll up to re-read something the participant said a minute ago. If the overlay keeps jumping back to the bottom while I'm reading, that's infuriating."
>
> **Product Manager:** This is a UX-critical feature that's easy to get wrong. Every chat app solves this problem — we should follow established patterns. The "new messages" indicator when auto-scroll is paused is a nice-to-have but not required for v1. Decision: implement the scroll lock detection, defer the "new messages" pill to a future iteration if needed.
>
> **UX Designer:** The detection threshold should be forgiving — if the user is within ~50px of the bottom, treat it as "at bottom" and keep auto-scrolling. Use `scrollHeight - scrollTop - clientHeight < 50` as the check. When new content arrives and user is scrolled up, do NOT scroll — just append the bubble. Optional: a subtle "↓ New messages" floating pill at the bottom of the timeline when the user is scrolled up and new content has arrived. This is a standard chat pattern (Slack, iMessage, etc.). For v1, skip the pill — just don't force-scroll. Users will naturally scroll down.
>
> **System Engineer:** Implement via a `scrollHandler` on the `.timeline` container that sets a `this.isUserScrolledUp` boolean. On each new bubble append, check the flag: if false, call `container.scrollTop = container.scrollHeight`. Use `requestAnimationFrame` for smooth scroll timing (after DOM paint). The current overlay has no scroll management (suggestions prepend at top, transcripts are fixed). This is new logic but straightforward. Edge case: `ResizeObserver` — if the overlay is resized while scrolled up, recalculate the threshold. Not critical for v1.

---

#### Feature 5: Interim Transcript "Typing" Indicator

**What it is:** While a speaker is actively talking (interim transcripts arriving), a "typing" bubble appears at the bottom of the timeline showing their in-progress speech. When the final transcript arrives, the typing bubble is replaced with the permanent bubble.

**Review:**

> **User:** "This gives me a sense that Wingman is actively listening. I can see the words forming in real time, which is reassuring — like watching live captions."
>
> **Product Manager:** Nice-to-have but valuable for perceived responsiveness. The current overlay already shows interim transcripts (replace-in-place), so users expect to see real-time text. Removing it would feel like a regression. Keep it, but make it visually lighter so it doesn't compete with final transcripts and suggestions. Scope: minimal — it's one bubble that gets updated/replaced.
>
> **UX Designer:** The interim bubble should:
> - Appear at the very bottom of the timeline (after all committed entries)
> - Use a slightly lighter/more transparent style than final bubbles
> - Show the speaker label but no timestamp (it's not committed yet)
> - Animate text changes smoothly (no jarring full-replacement)
> - When the final transcript arrives: crossfade from interim to final bubble (opacity transition)
>
> Only one interim bubble per speaker should exist at a time. If both speakers have active interims (rare but possible in crosstalk), show both — Participant's interim on the left, Your interim on the right.
>
> **System Engineer:** Maintain up to 2 interim bubble references (`interimSelf` and `interimOther`). On interim transcript: if interim bubble exists for that speaker, update its text content. If not, create one and append to timeline. On final transcript: remove the interim bubble for that speaker, create a permanent bubble, append to timeline, add to the data model array. The tricky part: Deepgram's interim transcripts can arrive very rapidly (every 100-300ms). Debounce DOM updates to every 200ms to avoid layout thrashing. Use `requestAnimationFrame` for coalesced updates.

---

#### Feature 6: Overlay Visual Refresh

**What it is:** Modernize the overlay's header, controls, and overall panel with gradients, better shadows, rounded corners, and polished micro-interactions — consistent with the Phase 9 options page redesign direction.

**Review:**

> **User:** "The current overlay looks functional but bland. It doesn't feel like a premium tool. A cleaner, more modern look would make me proud to have it on screen during client calls."
>
> **Product Manager:** Visual polish directly impacts user confidence and willingness to keep the overlay visible during meetings. If it looks cheap, users minimize it. The overlay is always visible to the user (and potentially to screen-share viewers), so it represents the product's quality. Scope: header gradient, panel shadow/border, button styling, minimize/close icon refresh. Do NOT over-design — the overlay must be functional first, attractive second. Keep it compact.
>
> **UX Designer:** Design constraints unique to the overlay:
> - **Size**: 350×450px default (min 280×200, max 600×80vh). Resize + position persisted to `chrome.storage.local`. Every pixel matters.
> - **Context**: Sits on top of Google Meet's dark UI. Must have enough contrast to be readable but not so bright it's distracting.
> - **Performance**: Runs alongside live video. Stick to GPU-accelerated properties (transform, opacity).
>
> Header redesign:
> - Subtle gradient (dark amber → brand orange) — thinner than options page header (~36px, requires reducing current 12px vertical padding)
> - Wingman text or small logo icon, status indicator dot
> - Controls (font size, minimize, close) with subtle icon buttons, replacing current Unicode characters (`\u2212`, `+`, `_`, `\u00D7`) with inline SVG strings
> - Drag handle area visually indicated by subtle grip texture or cursor change
>
> Panel body:
> - Slight inner shadow at top of timeline for depth
> - Panel already has 12px border-radius (`overlay.ts:142`) — keep as-is
> - Subtle border instead of heavy shadow
> - Background: match the chat app feel (light mode: off-white, dark mode: dark gray)
>
> **System Engineer:** All styling is inline CSS in the Shadow DOM. The current approach injects a `<style>` block into the shadow root — this continues to work. The gradient header uses standard CSS `linear-gradient` (current: `overlay.ts:181`). Performance: zero impact — these are static styles, not animations. The closed Shadow DOM (`overlay.ts:52`) isolates all styles from Google Meet's page.

---

#### Feature 7: Bubble Entrance Animations

**What it is:** New bubbles enter the timeline with a subtle fade-and-slide animation instead of appearing instantly.

**Review:**

> **User:** "Smooth animations make the overlay feel alive and responsive, like a real chat app. Instant appearance feels jarring, especially during fast conversation."
>
> **Product Manager:** Low-effort, high-polish feature. Animations should be fast enough to not delay information delivery (200ms max). Must respect `prefers-reduced-motion`. This is a "feel" improvement — users won't consciously notice it, but they'll feel the quality.
>
> **UX Designer:** Animation spec:
> - Transcript bubbles: fade in (opacity 0→1) + slide up 8px (translateY 8→0), 200ms ease-out
> - Suggestion bubbles: same as transcript but slightly slower (250ms) with a subtle scale (0.97→1.0) for emphasis
> - Timing: staggered if multiple arrive simultaneously (rare, but 50ms offset between concurrent entries)
> - `prefers-reduced-motion`: instant appearance, no animation
>
> Do NOT animate bubble removal (timeline only grows, old entries are trimmed from the top when exceeding 500 entries — removal at top is invisible to the user who's looking at the bottom).
>
> **System Engineer:** CSS `@keyframes` inside the Shadow DOM `<style>` block. Each new bubble gets the animation class applied on creation. The animation runs once (`animation-fill-mode: forwards`). GPU-accelerated: only `transform` and `opacity`. Performance impact: minimal — one animation per new bubble, max ~4 per minute for transcripts, ~4 per minute for suggestions. Well within the "Tier 1 minimal impact" category from the CSS capabilities research. No JavaScript animation library needed.

---

#### Feature 8: Suggestion Context Association

**What it is:** Each Wingman suggestion bubble subtly indicates which part of the conversation triggered it, making the AI's reasoning transparent.

**Review:**

> **User:** "Sometimes the AI gives me a suggestion and I'm not sure what it's responding to. If I can see it's answering the last question the participant asked, that's way more useful."
>
> **Product Manager:** This is valuable but tricky to scope. Full "this suggestion was triggered by utterance X" linking requires service worker changes to pass the triggering transcript with the suggestion. A simpler v1: the suggestion naturally appears right after the transcript that triggered it (because of the timeline's chronological ordering). The visual proximity IS the context association. Decision: for v1, rely on chronological proximity. Defer explicit linking (e.g., a reply-arrow pointing to the triggering transcript) to a future phase. Add a comment in the code noting this future enhancement.
>
> **UX Designer:** Agreed with PM — chronological proximity in the timeline already provides context. The suggestion appearing directly below the utterance that triggered it is intuitive without any explicit visual linking. If users want more, a subtle "replying to..." line could be added later. For v1, the visual grouping is sufficient. One enhancement: when a suggestion has a KB source, the "Based on: filename.pdf" attribution should be prominent — it tells the user WHERE the AI got its information, which is often more useful than knowing which utterance triggered it.
>
> **System Engineer:** No service worker changes needed for v1. The current flow already works: transcript arrives → Gemini called → suggestion arrives with a later timestamp → rendered after the triggering transcript in the timeline. The only risk is the 15-second cooldown (`gemini-client.ts:63`): if multiple transcripts arrive before the suggestion, the suggestion will appear after ALL of them, not immediately after its trigger. This is acceptable — the suggestion is still contextually relevant to the recent conversation, and the cooldown is a known tradeoff for API quota management. The suggestion's `question` field (`content-script.ts:123`) contains the triggering utterance text — this could optionally be shown in the Wingman bubble header as context. For future explicit linking: the service worker would need to include the triggering transcript's timestamp in the suggestion message payload. Add a `// TODO: Phase 11 — Add triggerTimestamp to suggestion payload for explicit context linking` comment.

---

#### Feature 9: Post-Call Summary Transition

**What it is:** When the call ends and the summary is generated, the overlay transitions from the live timeline to the summary view. The timeline content is preserved (not destroyed) so users can switch back if needed.

**Review:**

> **User:** "After a call, I want to see the summary immediately. But sometimes I need to go back and check something specific from the transcript — 'what exactly did they say about the budget?' If the timeline is gone, I lose that."
>
> **Product Manager:** The current behavior replaces the suggestions container with the summary and hides the transcript section. This is destructive — the conversation is gone. The new design should allow toggling between "Summary" and "Timeline" views post-call. This adds significant value for call review. Scope: two-tab post-call view (Summary | Timeline), not a full redesign of the summary itself.
>
> **UX Designer:** Post-call overlay behavior:
> - Header shows "Call Ended" status with meeting duration
> - Two small toggle buttons below header: "Summary" (active by default) | "Timeline"
> - Summary view: renders the same summary content (bullets, action items, key moments) — no change to summary formatting
> - Timeline view: shows the full conversation timeline, now frozen (no more entries arriving)
> - The toggle buttons use a simple pill-style switcher with an animated indicator
> - Copy button in footer copies whichever view is active
> - Drive save status shows in footer regardless of active view
>
> **System Engineer:** Instead of `container.innerHTML = summaryHtml` (current destructive approach at `overlay.ts:787`), the refactored overlay maintains two containers: `.timeline` and `.summary`. Post-call: create the summary container, hide the timeline, show the summary. Toggle buttons swap `display: none` between them. The timeline DOM is preserved in memory — no re-rendering needed. Memory: the timeline DOM nodes stay alive until the overlay is destroyed (page navigation or extension unload). This is fine — a few hundred DOM nodes for a completed call is negligible. The summary rendering logic (`showSummary()`) moves from overwriting the suggestions container to populating its own `.summary` container.
>
> **Code audit notes:**
> - `showLoading()` (`overlay.ts:697-723`) currently sets `container.innerHTML` on `.suggestions-container`. Must be refactored to show loading indicator in the `.summary` container without destroying `.timeline`.
> - `showSummaryError()` (`overlay.ts:822-839`) auto-hides the overlay after 3 seconds via `setTimeout`. This should be changed to show the error in the `.summary` container while keeping the timeline accessible via toggle.
> - `hide()` (`overlay.ts:903-909`) sets `summaryShown = false` and `currentSummary = null`. The post-call toggle requires these fields to persist across hide/show cycles. Refactor `hide()` to NOT clear summary state.
> - `handleCopy()` (`overlay.ts:855-869`) only copies summary markdown via `formatSummaryAsMarkdown()`. Must add a new code path that serializes the timeline as text when the timeline view is active.
> - `updateDriveStatus()` (`overlay.ts:844-850`) queries `.drive-status` inside `.summary-footer`. This DOM coupling must be updated if the footer is shared between views.
> - `HIDE_OVERLAY` message (`service-worker.ts:523-526`): sent when summary is disabled or conversation has <5 transcripts. With the timeline, the overlay should remain visible for timeline review even when no summary is generated. This requires a content-script change to handle `HIDE_OVERLAY` differently.
> - `overlayDismissedByUser` flag (`content-script.ts:15,42,143-158`): if the user manually closed the overlay during the call, post-call messages (`summary_loading`, `call_summary`, `summary_error`) are correctly ignored. This behavior must be preserved.

---

## Master Checklist

### Instructions for Claude Code

> **CRITICAL: You must follow these rules exactly.**
>
> 1. **Save after every cell write.** You cannot batch writes to this table. Each time you update a cell, save the file immediately.
> 2. **Check the checkbox** when you begin a task.
> 3. **Workflow for each task:** Check `[x]` → Save → Write start time → Save → Complete work → Write end time → Save → Calculate total → Save → Write human estimate → Save → Calculate multiplier → Save → Next task.
> 4. **Time format:** `HH:MM` (24-hour). Minutes for totals and estimates.
> 5. **Multiplier:** `Human Estimate ÷ Total Time`, expressed as `Nx`.
> 6. **If blocked:** Note the blocker and move to the next unblocked task.

### Progress Dashboard

| Done | # | Task Name | Start | End | Total (min) | Human Est. (min) | Multiplier |
|:----:|:-:|-----------|:-----:|:---:|:-----------:|:----------------:|:----------:|
| [ ] | 1 | Update Transcript interface + define TimelineEntry type + timeline array | | | | 25 | |
| [ ] | 2 | Refactor overlay HTML: replace split layout with .timeline + .summary containers | | | | 35 | |
| [ ] | 3 | Implement transcript history: accumulate final transcripts in timeline array | | | | 30 | |
| [ ] | 4 | Implement interim transcript "typing" indicator bubbles | | | | 30 | |
| [ ] | 5 | Render chat bubbles: Participant (left), You (right), Wingman (center) | | | | 45 | |
| [ ] | 6 | Interleave suggestions into the timeline by timestamp | | | | 20 | |
| [ ] | 7 | Implement smart auto-scroll with manual scroll detection | | | | 25 | |
| [ ] | 8 | Add bubble entrance animations (fade + slide, GPU-accelerated) | | | | 20 | |
| [ ] | 9 | Redesign overlay header: gradient, SVG icons, compact controls | | | | 30 | |
| [ ] | 10 | Redesign overlay panel: refined shadow, glass border | | | | 20 | |
| [ ] | 11 | Style chat bubbles: colors, spacing, speaker labels, timestamps | | | | 30 | |
| [ ] | 12 | Style Wingman suggestion bubbles: type badge, KB source, accent | | | | 25 | |
| [ ] | 13 | Implement post-call Summary/Timeline toggle + fix lifecycle methods | | | | 45 | |
| [ ] | 14 | Update dark mode styles for all new timeline elements | | | | 20 | |
| [ ] | 15 | Add timeline entry cap (500) with oldest-first trimming | | | | 10 | |
| [ ] | 16 | Update applyFontSize() + verify accessibility (ARIA, keyboard, contrast) | | | | 20 | |
| [ ] | 17 | Build, load in Chrome, and end-to-end test on a live Google Meet call | | | | 30 | |

**Summary:**
- Total tasks: 17
- Completed: 0
- Total time spent: 0 minutes
- Total human estimate: 480 minutes (~8 hours)
- Overall multiplier: –

---

## Task Descriptions

This section provides context for each task. Read the relevant description before starting implementation.

---

### Task 1: Update Transcript Interface + Define TimelineEntry Type + Timeline Array

**Intent:** Update the overlay's `Transcript` interface to declare fields we rely on at runtime, then create the data model that backs the unified timeline.

**Step 1 — Update Transcript interface:**

The current overlay `Transcript` interface (`overlay.ts:20-24`) is incomplete:
```typescript
// CURRENT (incomplete)
export interface Transcript {
  text: string;
  speaker: string;
  is_final: boolean;
}
```

Update to declare the fields that are already present on the runtime object (passed from Deepgram via content script):
```typescript
// UPDATED
export interface Transcript {
  text: string;
  speaker: string;        // 'You' | 'Participant'
  is_final: boolean;
  is_self: boolean;        // true = You (channel 0), false = Participant (channel 1)
  timestamp: string;       // ISO 8601 from Deepgram (e.g., '2025-01-15T14:30:00.000Z')
}
```

These fields are already present at runtime (`deepgram-client.ts:226-240` sends them, `content-script.ts:105` passes them through). We're just declaring what's already there.

**Step 2 — Define TimelineEntry type:**
```typescript
interface TimelineEntry {
  kind: 'transcript' | 'suggestion';
  timestamp: number;                    // ms since epoch (converted from ISO)
  // Transcript fields
  speaker?: string;                     // 'You' | 'Participant'
  isSelf?: boolean;                     // from Transcript.is_self — drives left/right alignment
  text?: string;
  // Suggestion fields
  suggestionType?: 'answer' | 'objection' | 'info';  // post content-script mapping
  suggestionText?: string;
  question?: string;                    // triggering utterance text (from content-script.ts:123)
  confidence?: number;
  kbSource?: string;
}
```

**Notes on type decisions:**
- `timestamp: number` (epoch ms) — normalized from ISO strings. For transcripts: `new Date(transcript.timestamp).getTime()`. For suggestions: already epoch ms (content script converts at `content-script.ts:125`).
- `isSelf: boolean` — maps directly from `Transcript.is_self`. Cleaner than string comparison for CSS alignment.
- `suggestionType` uses the three-type system after content script mapping. The Gemini client also produces `'question'` type, but the content script maps it to `'info'` (`content-script.ts:116-119`).
- `question?: string` — the content script passes `message.data.question` (`content-script.ts:123`), but the Gemini client does NOT set a `question` field on its `Suggestion` object (`gemini-client.ts:270-278`). This field will always be `undefined` with the current Gemini client. Kept in the type for future use (see "Explicit context linking" in Future Enhancements).

**State:**
- `private timeline: TimelineEntry[] = []`
- `private readonly MAX_TIMELINE_ENTRIES = 500`

**Location:** Add to `overlay.ts` alongside existing interfaces.

**Key components:**
- `src/content/overlay.ts` (MODIFY — update `Transcript` interface, add `TimelineEntry` type + array)

---

### Task 2: Refactor Overlay HTML — Single Timeline + Summary Containers

**Intent:** Replace the current split layout (`.suggestions-container` + `.transcript-section`) with a `.timeline` scrollable container and a lazily-created `.summary` container.

**Current structure (`overlay.ts:539-548`):**
```
.overlay-content > .suggestions-container  (scrollable, suggestions)
.transcript-section                         (fixed bottom, transcripts)
```

**New structure:**
```
.overlay-content > .timeline               (scrollable, everything during call)
                 > .summary                (created lazily in Task 13, for post-call)
```

**What changes:**
- Remove `.suggestions-container` div creation
- Remove `.transcript-section` div creation
- Create single `.timeline` div as the child of `.overlay-content`
- The `.summary` container will be created lazily in Task 13 when `showSummary()` is called
- Update all `querySelector` calls that reference the old containers:
  - `addSuggestion()` references `.suggestions-container` (`overlay.ts:641`)
  - `updateTranscript()` references `.transcript-section` (`overlay.ts:674`)
  - `showLoading()` references `.suggestions-container` and `.transcript-section` (`overlay.ts:697-711`)
  - `showSummary()` references `.suggestions-container` and `.transcript-section` (`overlay.ts:728-787`)
  - `showSummaryError()` references `.suggestions-container` (`overlay.ts:822`)
- Add `clearTimeline()` method for session reset (called from `forceShow()` when a new session starts):
  - Empty the `timeline` array
  - Clear all bubble DOM nodes from `.timeline` container
  - Reset `summaryShown = false` and `currentSummary = null`
  - Hide `.summary` container if it exists
  - Show `.timeline` container with empty state
  - Reset interim bubble references to `null`
- The empty state ("Listening for conversation...") renders inside `.timeline`

**Key components:**
- `src/content/overlay.ts` (MODIFY — `createOverlayStructure()` method, all methods referencing old containers)

**Notes:**
- *Engineer*: This is the most impactful structural change. All subsequent tasks depend on this. Must update `addSuggestion()`, `updateTranscript()`, `showLoading()`, `showSummary()`, and `showSummaryError()` methods. There is no `clearTranscripts()` method to update (it doesn't exist).
- *PM*: No user-visible change yet — this is plumbing. But must be done before anything else renders correctly.
- *Code audit*: `forceShow()` (`overlay.ts:891-898`) is called when the overlay already exists and a new session starts. It must call `clearTimeline()` to remove old entries from a previous session. The `ensureOverlayAttached()` (`content-script.ts:56-62`) re-appends the container if Meet detaches it — timeline state in shadow DOM survives this.

---

### Task 3: Implement Transcript History

**Intent:** Change `updateTranscript()` to accumulate all final transcripts in the timeline array instead of replacing the latest per speaker.

**Current behavior (`overlay.ts:673-692`):** Two DOM elements (`[data-speaker="self"]`, `[data-speaker="other"]`), text replaced on each update.

**New behavior:**
- `is_final === true`: Create a `TimelineEntry` with `kind: 'transcript'`, convert `timestamp` from ISO to epoch via `new Date(transcript.timestamp).getTime()`, set `isSelf` from `transcript.is_self`, push to `this.timeline`, call `renderBubble()` to append a new bubble to `.timeline`
- `is_final === false`: Update the interim indicator (Task 4)
- Consecutive finals from the same speaker within 500ms: **replace** (not append) the previous entry's text with the new text. Deepgram's config uses `endpointing: 2500` and `utterance_end_ms: 3000` (`deepgram-client.ts:22-23`), meaning rapid successive finals from the same speaker are corrections (refined transcription of the same utterance), not continuations. Appending would produce duplicated/garbled text.

**Key components:**
- `src/content/overlay.ts` (MODIFY — `updateTranscript()` method)

**Notes:**
- *Engineer*: Need a `lastFinalTimestamp` per speaker to detect rapid consecutive finals for replacement. Use `Map<string, number>` keyed by `'self' | 'other'` (derived from `is_self`). When a new final arrives within 500ms of the previous final for the same speaker, update the existing `TimelineEntry`'s `text` and update the existing bubble's DOM text content rather than creating a new entry.
- *UX*: Consecutive utterances from the same speaker (beyond the 500ms correction window) should appear as grouped bubbles (no repeated speaker label). Mimics how chat apps group messages.
- *Code audit*: The content script passes `message.data` directly for transcripts (`content-script.ts:105`), unlike suggestions which are remapped. The runtime object has more fields than the TypeScript interface declares — Task 1 fixes this by updating the interface.

---

### Task 4: Implement Interim Transcript "Typing" Indicator

**Intent:** Show a temporary bubble at the bottom of the timeline while a speaker is actively talking (interim transcripts arriving).

**Behavior:**
- Maintain references: `interimBubbleSelf: HTMLElement | null`, `interimBubbleOther: HTMLElement | null`
- On interim transcript: create or update the interim bubble for that speaker (use `is_self` to determine which reference)
- Interim bubble: same position as that speaker's bubbles (left/right) but with `.interim` class (lighter opacity)
- On final transcript: remove the interim bubble for that speaker (the permanent bubble replaces it)
- Coalesce DOM text updates via `requestAnimationFrame` to avoid layout thrash from rapid interims. Deepgram sends interims every 100-300ms; updating on every message causes excessive layout recalculations. Using `rAF` coalescing (store the latest text, apply on next paint frame) limits updates to ~60fps, feels smoother than a fixed 200ms debounce, and naturally aligns with the display refresh rate.

**Key components:**
- `src/content/overlay.ts` (MODIFY — `updateTranscript()` method, add interim bubble management)

**Notes:**
- *UX*: Interim bubbles should NOT have timestamps. They should pulse subtly (opacity animation) to indicate "in progress."
- *Engineer*: The interim bubble is appended AFTER all committed timeline entries. When a new committed entry is added, re-append the interim bubbles to keep them at the bottom. Use `container.appendChild()` which moves existing nodes. For `rAF` coalescing: store pending interim text in `pendingInterimText: Map<string, string>` keyed by `'self' | 'other'`, request a single animation frame, and apply all pending updates in the callback.

---

### Task 5: Render Chat Bubbles

**Intent:** Create the `renderBubble()` method that produces the DOM element for a timeline entry with speaker-appropriate alignment and styling.

**Bubble alignment (uses `isSelf` boolean, not string comparison):**
- `isSelf === false` (or `kind === 'transcript'` with no `isSelf`) → left-aligned (`.bubble.participant`)
- `isSelf === true` → right-aligned (`.bubble.self`)
- `kind === 'suggestion'` → full-width centered (`.bubble.wingman`)

**Bubble HTML (transcript):**
```html
<div class="bubble self" style="animation: bubbleIn 200ms ease-out forwards;">
  <div class="bubble-content">
    <span class="bubble-text">Let me walk you through that.</span>
  </div>
  <span class="bubble-time">2:34 PM</span>
</div>
```

**Bubble HTML (suggestion):**
```html
<div class="bubble wingman" style="animation: bubbleIn 250ms ease-out forwards;">
  <div class="bubble-header">
    <svg class="wingman-icon">...</svg>
    <span class="wingman-label">Wingman</span>
    <span class="badge answer">ANSWER</span>
  </div>
  <div class="bubble-content">
    <span class="bubble-text">From your price sheet: Enterprise tier is...</span>
  </div>
  <div class="bubble-source">Based on: prices.pdf</div>
  <span class="bubble-time">2:34 PM</span>
</div>
```

**Speaker label grouping:** Only show the speaker label when the speaker changes from the previous entry. Consecutive same-speaker bubbles omit the label (tighter grouping, less visual noise).

**HTML escaping:** All user-generated text (transcript content, suggestion text) must pass through `this.escapeHtml()` (`overlay.ts:874-878`) before insertion into innerHTML.

**Key components:**
- `src/content/overlay.ts` (MODIFY — add `renderBubble()` method)

**Notes:**
- *UX*: Speaker label grouping reduces clutter significantly. Timestamp shown on every bubble but at small size (11px, muted color). For Wingman bubbles, the type badge color-codes the suggestion type: orange (answer), red (objection), yellow (info).
- *Engineer*: `renderBubble()` takes a `TimelineEntry` and an optional `showSpeakerLabel: boolean`. The caller determines grouping by comparing the current entry's speaker with the previous entry's speaker.

---

### Task 6: Interleave Suggestions into Timeline

**Intent:** Change `addSuggestion()` to insert suggestion entries into the timeline array by timestamp and render them as Wingman bubbles in the correct chronological position.

**Current behavior (`overlay.ts:640-665`):** Suggestions are prepended (LIFO) to `.suggestions-container`, capped at 10.

**New behavior:**
- Create a `TimelineEntry` with `kind: 'suggestion'`
- The suggestion data arrives already transformed by the content script (`content-script.ts:113-131`): `type` is remapped, `text` is extracted from `response || text`, `timestamp` is already epoch ms
- Push to `this.timeline` (it arrives with a timestamp that's naturally later than its triggering transcript)
- Call `renderBubble()` and append to `.timeline` container
- No more LIFO. No more separate container. No more max-10 limit (the global 500-entry cap handles this).

**Key components:**
- `src/content/overlay.ts` (MODIFY — `addSuggestion()` method)

**Notes:**
- *Engineer*: Since suggestions always have timestamps later than their triggers, simply appending to the timeline and rendering at the bottom is correct chronological order. No sorting needed — entries arrive in natural order. The only risk is out-of-order network responses, which is extremely rare and acceptable. The content script transformation layer (`content-script.ts:113-131`) is preserved unchanged — it continues to remap suggestion fields before passing to the overlay.
- *PM*: Removing the 10-suggestion cap means more suggestions persist in the timeline. This is the desired behavior — users can scroll up to see earlier suggestions.

---

### Task 7: Implement Smart Auto-Scroll

**Intent:** Auto-scroll the timeline to the bottom on new entries, unless the user has manually scrolled up.

**Implementation:**
```typescript
private isNearBottom = true;
private readonly SCROLL_THRESHOLD = 50; // px

private initScrollDetection(): void {
  this.timelineEl.addEventListener('scroll', () => {
    const { scrollTop, scrollHeight, clientHeight } = this.timelineEl;
    this.isNearBottom = scrollHeight - scrollTop - clientHeight < this.SCROLL_THRESHOLD;
  });
}

private scrollToBottom(): void {
  if (this.isNearBottom) {
    requestAnimationFrame(() => {
      this.timelineEl.scrollTop = this.timelineEl.scrollHeight;
    });
  }
}
```

Call `scrollToBottom()` after every `renderBubble()` call.

**Key components:**
- `src/content/overlay.ts` (MODIFY — add scroll management methods)

**Notes:**
- *UX*: 50px threshold is forgiving — accounts for slight finger/trackpad drift. Use `{ behavior: 'smooth' }` on `scrollTo` for polished feel, but only when the scroll distance is small (< 200px). For large jumps (first load), use instant scroll.
- *Engineer*: `requestAnimationFrame` ensures we scroll after the browser has laid out the new bubble. Without it, `scrollHeight` may not reflect the new content yet.

---

### Task 8: Add Bubble Entrance Animations

**Intent:** New bubbles fade and slide in for a polished feel.

**CSS keyframes (in Shadow DOM `<style>`):**
```css
@keyframes bubbleIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes wingmanIn {
  from { opacity: 0; transform: translateY(8px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  @keyframes bubbleIn { from, to { opacity: 1; transform: none; } }
  @keyframes wingmanIn { from, to { opacity: 1; transform: none; } }
}
```

Applied via `style="animation: bubbleIn 200ms ease-out forwards"` on each new bubble element.

**Key components:**
- `src/content/overlay.ts` (MODIFY — CSS string + `renderBubble()`)

**Notes:**
- *Engineer*: `transform` and `opacity` only — both GPU-composited, zero layout/paint impact. Safe for overlay on Google Meet video calls.

---

### Task 9: Redesign Overlay Header

**Intent:** Modernize the header with a gradient, SVG icons, and compact layout.

**Design:**
- Background: `linear-gradient(135deg, #b34700 0%, #e67e22 100%)` (current is `#d35400 → #e67e22` at `overlay.ts:181`)
- Height: ~36px content (compact — requires reducing current `padding: 12px 16px` at `overlay.ts:180`)
- Left: status dot (pulsing green when active) + "Wingman" text in white
- Right: font size controls (A- A+), minimize (—), close (×) as subtle SVG icon buttons
- Drag cursor: entire header area is draggable (existing behavior, preserved)
- Dark mode: slightly adjusted gradient tones

**Key components:**
- `src/content/overlay.ts` (MODIFY — header creation in `createOverlayStructure()`, CSS string)

**Notes:**
- *UX*: SVG icons must be 16px with sufficient contrast on the gradient. Use white with 80% opacity, full white on hover.
- *Engineer*: Replace Unicode characters (`\u2212` minus, `+` plus, `_` underscore, `\u00D7` multiplication sign) with inline SVG strings. Same event listeners, new visuals.

---

### Task 10: Redesign Overlay Panel

**Intent:** Refine the panel container with modern styling.

**Design:**
- Border-radius: keep at 12px (already 12px at `overlay.ts:142`)
- Shadow: `0 8px 32px rgba(0, 0, 0, 0.12)` (softer, larger spread)
- Border: 1px solid rgba(255,255,255,0.15) for subtle glass edge
- Background: solid (no glassmorphism — overlay is over video, backdrop-filter would be expensive)
- Dark mode: adjusted shadow opacity and border color
- Resize handle: subtle gradient dots pattern instead of plain corner triangle

**Key components:**
- `src/content/overlay.ts` (MODIFY — panel styles in CSS string)

**Notes:**
- *Engineer*: Deliberately NOT using `backdrop-filter` on the main panel. The overlay sits over live Google Meet video — blurring the video every frame would be expensive. Solid background with refined shadow is the right call for performance.
- *UX*: The panel should feel like it "floats" above Meet but not dominate. The shadow provides depth without heaviness.

---

### Task 11: Style Chat Bubbles — Colors, Spacing, Speaker Labels, Timestamps

**Intent:** CSS for the three bubble types with proper visual hierarchy.

**Participant (left-aligned):**
```css
.bubble.participant {
  align-self: flex-start;
  max-width: 85%;
  background: var(--overlay-bg-secondary);
  border-radius: 12px 12px 12px 4px;
  padding: 8px 12px;
  margin-bottom: 4px;
}
```

**You (right-aligned):**
```css
.bubble.self {
  align-self: flex-end;
  max-width: 85%;
  background: rgba(230, 126, 34, 0.1);  /* subtle brand tint */
  border-radius: 12px 12px 4px 12px;
  padding: 8px 12px;
  margin-bottom: 4px;
}
```

**Speaker label:** Shown only on speaker change. 11px, bold, muted color. `margin-top: 12px` when speaker changes (visual grouping gap).

**Timestamps:** 11px, right-aligned, muted. Inside bubble at bottom-right.

**Key components:**
- `src/content/overlay.ts` (MODIFY — CSS string)

**Notes:**
- *UX*: `max-width: 85%` prevents bubbles from spanning the full width, maintaining the chat app feel. The asymmetric border-radius (small corner on the speaker's side) is a standard chat bubble convention.
- *Engineer*: All colors use CSS custom properties for theme support.

---

### Task 12: Style Wingman Suggestion Bubbles

**Intent:** CSS for Wingman's AI suggestion bubbles — distinct from transcript bubbles.

**Design:**
```css
.bubble.wingman {
  align-self: stretch;           /* full width */
  background: var(--overlay-bg-secondary);
  border-left: 3px solid;
  border-radius: 8px;
  padding: 10px 12px;
  margin: 8px 0;                 /* more vertical space around AI bubbles */
}
.bubble.wingman.answer   { border-left-color: #e67e22; }
.bubble.wingman.objection { border-left-color: #ea4335; }
.bubble.wingman.info      { border-left-color: #fbbc05; }
```

**Wingman label:** Small SVG icon + "Wingman" text + type badge pill (colored, 10px font).

**KB source:** "Based on: filename.pdf" line at bottom of bubble, muted text.

**Key components:**
- `src/content/overlay.ts` (MODIFY — CSS string)

**Notes:**
- *UX*: The left accent bar carries over from the current design — users already associate it with Wingman suggestions. The type badge pill adds quick scanability.
- *PM*: Consistent with current visual language but elevated. Users who've used the old design will recognize suggestion cards instantly.

---

### Task 13: Implement Post-Call Summary/Timeline Toggle + Fix Lifecycle Methods

**Intent:** After call ends, show a toggle to switch between Summary and Timeline views. Fix overlay lifecycle methods that have destructive side effects.

**Implementation — Toggle:**
- Create a `.post-call-toggle` container with two buttons: "Summary" and "Timeline"
- "Summary" is active by default post-call
- Create `.summary` container (populated by refactored `showSummary()` logic)
- `.timeline` container preserved but hidden
- Toggle buttons swap visibility between `.summary` and `.timeline`
- Copy button copies content of the active view (summary via existing `formatSummaryAsMarkdown()`, timeline via new `formatTimelineAsText()`)
- Drive status visible in both views

**Implementation — Lifecycle fixes:**

1. **`showLoading()`** — Currently destroys `.suggestions-container` innerHTML (`overlay.ts:697-723`). Refactor to: hide `.timeline`, show `.summary` container with loading indicator ("Generating Summary..."). Do NOT touch `.timeline` DOM.

2. **`showSummary()`** — Currently overwrites `.suggestions-container` innerHTML (`overlay.ts:727-787`). Refactor to: populate `.summary` container, show post-call toggle, keep `.timeline` hidden but intact. Set `currentSummary` as before.

3. **`showSummaryError()`** — Currently overwrites content and auto-hides overlay after 3s (`overlay.ts:822-839`). Refactor to: show error in `.summary` container, add "View Timeline" button so user can still access the conversation. Remove the auto-hide `setTimeout` — let the user decide when to close.

4. **`hide()`** — Currently clears `summaryShown` and `currentSummary` (`overlay.ts:903-909`). Refactor to: keep `summaryShown` and `currentSummary` intact so the post-call toggle works if the user re-opens the overlay.

5. **`handleCopy()`** — Currently only copies summary markdown (`overlay.ts:855-869`). Add: when timeline view is active, call `formatTimelineAsText()` and copy to clipboard. The `formatTimelineAsText()` method serializes the `this.timeline` array into a readable transcript format:
   ```
   [2:34 PM] Participant: What's your pricing for enterprise?
   [2:34 PM] You: Let me walk you through that.
   [2:34 PM] Wingman [ANSWER]: From your price sheet: Enterprise tier is $499/month...
              Based on: prices.pdf
   ```
   Each entry is one line: `[timestamp] Speaker: text`. Wingman entries include the type badge in brackets. KB source is indented on the next line. This format is human-readable when pasted into notes or chat.

6. **`HIDE_OVERLAY` handling** — Currently hides the overlay entirely when summary is disabled or <5 transcripts (`service-worker.ts:523-526`, handled in `content-script.ts:134-136` as `overlay?.hide()`). Change: in the content script, when receiving `hide_overlay`, check if the timeline has entries. If yes, keep the overlay visible with just the timeline (no summary toggle). If the timeline is empty, hide as before. **This requires a new public method on `AIOverlay`:** `hasTimelineEntries(): boolean` — returns `this.timeline.length > 0`. The content script handler becomes: `if (overlay?.hasTimelineEntries()) { /* keep visible, no action */ } else { overlay?.hide(); }`. **This is the one content-script change in the plan.**

7. **`updateDriveStatus()`** — Currently queries `.drive-status` inside `.summary-footer` (`overlay.ts:844-850`). The footer must remain a direct child of `.overlay-panel` (inserted before `.resize-handle`, same position as today — see `overlay.ts:809-810`). It must NOT be nested inside `.summary` or `.timeline`. This way it's visible in both post-call views without duplication. The toggle buttons swap `.summary`/`.timeline` visibility inside `.overlay-content`, while the footer sits outside `.overlay-content` at the panel level.

8. **`show()` interaction with post-call state** — The `SHOW_OVERLAY` message (content-script.ts:138-139) calls `overlay.show()` which just sets `display: flex`. Post-call, if a user hides and then the overlay is re-shown, it must display whichever view was last active (summary or timeline). Since `hide()` no longer clears `summaryShown` or `currentSummary` (fix #4 above), `show()` works correctly without modification — the DOM state is preserved.

**Key components:**
- `src/content/overlay.ts` (MODIFY — `showSummary()`, `showLoading()`, `showSummaryError()`, `hide()`, `handleCopy()`, add toggle logic, add `formatTimelineAsText()`)
- `src/content/content-script.ts` (MODIFY — `hide_overlay` handler, minor change)

**Notes:**
- *User*: "Being able to go back to the transcript after seeing the summary is exactly what I need when I think 'wait, what did they say about the budget?'"
- *Engineer*: The toggle is two DOM elements with `display: none/block` swap. No re-rendering. The summary `innerHTML` is written once, the timeline DOM is preserved from the live session. The lifecycle fixes are critical — without them, the post-call toggle breaks in multiple edge cases (auto-hide, hide-on-close, no-summary scenarios).

---

### Task 14: Update Dark Mode Styles

**Intent:** Ensure all new elements (bubbles, header gradient, badges, interim indicators) have proper dark mode styling.

**Key updates:**
- Bubble backgrounds: darker tones
- Self bubble tint: `rgba(243, 156, 18, 0.15)` (lighter orange tint in dark)
- Header gradient: deeper amber tones
- Timestamps: lighter muted color for readability
- Wingman accent bar colors: same hues, slightly more vibrant for dark backgrounds
- Type badge pills: adjusted contrast

**Key components:**
- `src/content/overlay.ts` (MODIFY — `:host(.dark)` CSS variables + dark-specific overrides)

**Notes:**
- *Engineer*: Dark mode is toggled via `this.container.classList.add('dark')` on the host element (`overlay.ts:73-90`). The shadow root's `:host(.dark)` selector matches the host element's class. All new CSS custom properties need dark-mode overrides in the `:host(.dark) { }` block.

---

### Task 15: Add Timeline Entry Cap

**Intent:** Prevent memory growth in very long meetings by capping timeline entries at 500.

**Implementation:**
```typescript
private trimTimeline(): void {
  while (this.timeline.length > this.MAX_TIMELINE_ENTRIES) {
    this.timeline.shift(); // Remove oldest
    const firstBubble = this.timelineEl.firstElementChild;
    if (firstBubble && !firstBubble.classList.contains('interim')) {
      firstBubble.remove(); // Remove from DOM (skip interim bubbles)
    }
  }
}
```

Call after every new entry is added.

**Key components:**
- `src/content/overlay.ts` (MODIFY — add `trimTimeline()`, call from `renderBubble()`)

**Notes:**
- *Engineer*: Removing from the top of the DOM is invisible to the user who's looking at the bottom. No visual disruption. 500 entries ≈ 2+ hours of meeting — more than sufficient for live reference.

---

### Task 16: Update applyFontSize() + Verify Accessibility

**Intent:** Update font size scaling for new elements and ensure the redesigned overlay meets accessibility standards.

**Font size scaling:**
The current `applyFontSize()` (`overlay.ts:1031-1069`) targets: `.suggestion-content`, `.suggestion-header`, `.empty-state`, `.transcript-section`. These selectors no longer exist. Update to target new classes:
- `.bubble-text` (main content)
- `.bubble-time` (timestamps)
- `.bubble-header` / `.wingman-label` (suggestion headers)
- `.badge` (type badges)
- `.bubble-source` (KB attribution)
- `.empty-state` (keep for empty timeline)

**Font size at bubble creation time:** The current `addSuggestion()` (`overlay.ts:651-656`) sets inline `style="font-size: ${this.fontSize}px"` on each element at creation time. `renderBubble()` must do the same — apply `this.fontSize` as inline styles when constructing each bubble's innerHTML. This ensures bubbles always render at the correct size, even before any `applyFontSize()` call. The `applyFontSize()` method then serves as a bulk updater when the user clicks A+/A- buttons, retroactively resizing all existing bubbles in the timeline.

**Accessibility checks:**
- `prefers-reduced-motion`: all animations disabled
- ARIA: timeline container has `role="log"`, `aria-live="polite"`, `aria-relevant="additions"`
- Bubbles: `role="article"` with `aria-label` describing speaker and content
- Keyboard: tab navigation through controls, escape to minimize
- Color contrast: all text on bubble backgrounds meets WCAG AA (4.5:1 ratio)
- High contrast mode: thicker borders, solid backgrounds, no transparency

**Key components:**
- `src/content/overlay.ts` (MODIFY — `applyFontSize()`, ARIA attributes, media query CSS)

---

### Task 17: Build and End-to-End Test

**Intent:** Full build, load in Chrome, and verify on a live Google Meet call.

**Verification checklist:**
- [ ] `npm run build` passes with zero errors
- [ ] `npm run typecheck` passes
- [ ] Extension loads in Chrome without errors
- [ ] Overlay appears on Google Meet with new design
- [ ] Header gradient and SVG icons render correctly
- [ ] Transcript bubbles appear for both speakers (left/right alignment)
- [ ] Interim "typing" bubbles show while speaking
- [ ] Final transcripts replace interims correctly
- [ ] Consecutive same-speaker bubbles group without repeated labels
- [ ] AI suggestion bubbles appear inline in timeline with type badge
- [ ] KB source attribution shows when applicable
- [ ] Auto-scroll works (new messages visible)
- [ ] Manual scroll up pauses auto-scroll
- [ ] Scrolling back to bottom resumes auto-scroll
- [ ] Bubble entrance animations are smooth (no jank over video)
- [ ] Dark mode renders all elements correctly
- [ ] Post-call: summary shows with Timeline toggle
- [ ] Post-call: can switch between Summary and Timeline views
- [ ] Post-call: "View Timeline" option on summary error (no auto-hide)
- [ ] Copy button works in both post-call views
- [ ] Drive auto-save still functions
- [ ] Drive status shows in both post-call views
- [ ] Minimize/close/resize still work
- [ ] Drag still works
- [ ] Font size adjustment scales all new bubble elements
- [ ] No console errors during full session lifecycle
- [ ] New session after previous: timeline clears on `forceShow()`
- [ ] Overlay survives Google Meet DOM re-attachment
- [ ] User-dismissed overlay stays dismissed post-call (`overlayDismissedByUser`)
- [ ] `HIDE_OVERLAY` with non-empty timeline keeps overlay visible
- [ ] Overlay works at min size (280×200) and max size (600×80vh)

---

## Appendix

### Technical Decisions

1. **Minimal service worker changes:** The current message flow (transcript + suggestion messages with timestamps) already provides everything needed for a chronological timeline. The overlay is the primary component that changes. The only non-overlay change is a minor content-script update for `HIDE_OVERLAY` handling (Task 13).

2. **Content script transformation layer preserved:** The content script (`content-script.ts:113-131`) remaps suggestion data (type mapping, text extraction, timestamp conversion). This layer is not modified — the overlay consumes already-transformed data.

3. **Solid background, no glassmorphism on panel:** Unlike the options page (which can use `backdrop-filter` freely), the overlay sits on live video. `backdrop-filter: blur()` over video is GPU-expensive and would cause frame drops. Solid background with refined shadow is the right tradeoff.

4. **500-entry cap:** Based on ~4 transcripts/minute + ~4 suggestions/minute, 500 entries covers ~60 minutes. Longer meetings trim from the top (invisible to the user). The post-call summary provides the archival view for long meetings.

5. **Chronological append (not LIFO):** The current design prepends suggestions (newest first). The timeline reverses this to chronological order (oldest at top, newest at bottom), matching every chat application. This is more natural for following a conversation.

6. **No external dependencies:** All changes are in `overlay.ts` (CSS string + TypeScript) with one minor change in `content-script.ts`. No new npm packages, no icon fonts, no animation libraries. The extension bundle size impact is negligible.

7. **Interim bubble coalescing via `requestAnimationFrame`:** Deepgram sends interims every 100-300ms. Updating the DOM on every interim causes layout thrash. Using `rAF` coalescing (store latest text, apply on next paint frame) limits DOM writes to ~60fps — smoother than a fixed debounce timer, naturally frame-rate-aligned, and prevents visual "stepping."

8. **Overlay Transcript interface update:** The overlay's `Transcript` interface is updated to declare `timestamp: string` and `is_self: boolean` — fields that are already present at runtime from the Deepgram client. This is a type declaration fix, not a behavioral change.

9. **Session lifecycle hardening:** Multiple overlay methods (`hide()`, `showLoading()`, `showSummaryError()`) had destructive side effects that would break the post-call toggle. Task 13 fixes all of these as a cohesive unit.

### Dependencies

No new external dependencies. All changes are in `overlay.ts` (CSS + TypeScript) with one minor change in `content-script.ts`. No new npm packages, icon fonts, or animation libraries.

### Out of Scope

- **Explicit context linking:** "Replying to..." line connecting suggestion to triggering utterance (requires service worker change to pass trigger timestamp)
- **"New messages" pill:** Floating indicator when user is scrolled up and new messages arrive
- **Message search:** Ctrl+F within the timeline to find specific phrases
- **Speaker name detection:** Extract participant names from Google Meet's DOM instead of generic "Participant"
- **Multi-participant support:** Differentiate multiple remote speakers with colors/names (requires Deepgram diarization or Meet DOM parsing)
- **Bubble actions:** Copy individual bubble text, pin important messages, react to suggestions
- **Question type badge:** The Gemini client produces a `'question'` suggestion type that's currently mapped to `'info'` by the content script. A dedicated question badge could be added by updating the content script mapping.
