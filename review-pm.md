# PM Review: Docked Overlay Mode (Phase 25) Implementation Plan

**Reviewer:** Product Manager
**Date:** 2026-02-13
**Overall Assessment:** Solid plan with good task decomposition. A few critical naming conflicts and missing edge cases need resolution before implementation begins.

---

## Findings

### 1. Storage Key Naming Collision

- **Category:** Naming
- **Finding:** The plan introduces `OVERLAY_DOCK_MODE` with storage value `overlayDockMode`, but `STORAGE_KEYS.OVERLAY_POSITION` already exists with value `overlayPosition` -- currently used to persist the floating panel's pixel coordinates (left, top, width, height). Task 9 names the settings dropdown "Panel Position," which will confuse developers and users about what `overlayPosition` means (pixel coords vs. dock mode).
- **Severity:** Critical
- **Suggestion:** Either (a) rename the existing `OVERLAY_POSITION` to `OVERLAY_COORDINATES` to remove ambiguity, or (b) use a label like "Panel Layout" or "Panel Docking" for the new setting instead of "Panel Position." The plan must explicitly address this collision.

### 2. Missing: Margin Cleanup on Extension Unload / Page Navigation

- **Category:** Missing
- **Finding:** Task 5 injects a CSS margin on `document.body` to push Google Meet content aside. If the extension is disabled, uninstalled, or the user navigates away without stopping the session, that margin stays on the page. The `destroy()` method in `overlay.ts` currently only cleans up drag/resize listeners -- there is no mention of margin removal on destroy, extension context invalidation, or the `handleExtensionInvalidated()` path in `content-script.ts`.
- **Severity:** Critical
- **Suggestion:** Add explicit acceptance criteria to Task 5: "Margin is removed when the overlay is destroyed, hidden, or the extension context is invalidated." Also update `destroy()` in Task 5 or add a separate sub-task.

### 3. Missing: `forceShow()` Must Re-Apply Dock Mode

- **Category:** Acceptance Criteria
- **Finding:** Task 3 notes this in a "Notes" section ("The `forceShow()` method should respect dock mode") but it is not listed as an acceptance criterion. `forceShow()` is called at session start and currently just sets `display: flex` and clears the timeline. If dock mode is active, it needs to re-apply the dock class and margin. Without this as an AC, a developer could ship the task without handling it.
- **Severity:** Important
- **Suggestion:** Add an acceptance criterion to Task 3: "`forceShow()` re-applies the current dock mode CSS class and margin injection when called at session start."

### 4. Task 5 Risk Should Be Documented More Explicitly

- **Category:** Risk
- **Finding:** Task 5 is correctly labeled H-risk, but the plan hedges on the implementation approach: "Use `document.body.style.marginLeft` directly... However, if Google Meet uses `margin` on body already, we may need to use a `<style>` tag with `!important`. Investigate during implementation." This ambiguity should be resolved before coding starts, not during.
- **Severity:** Important
- **Suggestion:** Add a pre-implementation investigation step to Task 5: "Before coding, inspect Google Meet's body/html element styles to determine whether direct style manipulation or a `<style>` tag with `!important` is needed. Document the finding in the evidence report."

### 5. Task 8 Is Mostly Done By Tasks 3 and 4

- **Category:** Sizing
- **Finding:** Task 3 already describes saving dock mode to storage in `setDockMode()`, and Task 4 already specifies saving width on resize end. Task 8 ("Persist dock state and width to storage") re-describes the same work with slightly different framing. The only net-new content in Task 8 is updating `restorePosition()` to skip floating restore when docked and handling corrupted storage values.
- **Severity:** Important
- **Suggestion:** Merge Task 8 into Tasks 3 and 4. Move the `restorePosition()` update into Task 3 (where dock mode loading is already handled), and move the corrupted-value guard into Task 1 (where the type is defined). This removes a near-duplicate task and saves time.

### 6. Missing: Transition Animation Between Modes

- **Category:** Missing
- **Finding:** No task mentions animation or transition when switching between floating and docked modes. Without a transition, the panel will jump instantly from one layout to the other, which feels jarring. Even a 200ms CSS transition would help.
- **Severity:** Minor
- **Suggestion:** Add an acceptance criterion to Task 3: "Switching between floating and docked modes includes a brief CSS transition (200-300ms) for position and dimensions." This can be a single `transition` property on `.overlay-panel`.

### 7. Dock Toggle Button Placement Creates a Crowded Header

- **Category:** Scope
- **Finding:** Task 6 adds a dock toggle button "between the layout toggle and minimize buttons." The header already has: status dot, title, persona dots, persona label, emotion badge, cost ticker, font controls (2 buttons), layout toggle, minimize, and close. Adding another button risks making the header too cramped, especially on narrower docked panels (280px min width).
- **Severity:** Important
- **Suggestion:** Consider (a) putting the dock toggle inside the font controls area or replacing the layout toggle when docked (since side-by-side is disabled in dock mode per Task 13), or (b) adding an explicit acceptance criterion that the header remains usable at 280px panel width.

### 8. Missing: What Happens When User Clicks Close (X) While Docked?

- **Category:** Missing
- **Finding:** The close button currently calls `hide()` and triggers `STOP_SESSION`. When docked, hiding the overlay should also remove the body margin. But should closing while docked also reset the dock mode to floating? Or should the next session start docked again (with the margin)? The plan does not specify this behavior.
- **Severity:** Important
- **Suggestion:** Add a decision to the plan: "Closing the overlay while docked removes the body margin but preserves the dock mode preference in storage. The next session will start docked again." Then add this as an acceptance criterion to Task 5 or Task 7.

### 9. Task 12 (Unit Tests) Blocked on DOM Environment

- **Category:** Risk
- **Finding:** Task 12 notes "you may need to set up a minimal JSDOM environment." The overlay creates a closed Shadow DOM, uses `chrome.runtime.getURL()` for CSS loading, and manipulates inline styles. Writing meaningful unit tests for dock mode logic will require significant DOM mocking. The risk is labeled M but is effectively H given the effort to test Shadow DOM behavior in Vitest.
- **Severity:** Important
- **Suggestion:** Either (a) elevate Task 12 to H-risk, or (b) scope it down to testing only the pure logic (mode validation, storage read/write, CSS class selection) without DOM manipulation. The DOM/visual behavior is better verified by the verification sub-agents taking screenshots.

### 10. Out of Scope: "Drag-to-Dock" Should Be Flagged as a Fast-Follow

- **Category:** Scope
- **Finding:** "Drag-to-dock" (dragging the overlay to the edge to auto-dock) is listed as out of scope. This is fine for v1, but it is the most intuitive way users will expect docking to work (it mirrors VS Code, macOS, and every browser sidebar). If the dock toggle button is the only way, users will need to discover it.
- **Severity:** Minor
- **Suggestion:** Keep it out of scope but note it as a Phase 25.1 fast-follow. Also consider adding a first-run tooltip on the dock button ("Tip: Click to dock the panel to the side of your screen") to aid discoverability.

### 11. Task Dependencies: Task 9 Can Run In Parallel With Tasks 2-8

- **Category:** Dependencies
- **Finding:** Task 9 (options page dropdown) only depends on Task 1 (constants). It does not depend on any overlay implementation (Tasks 2-8). The plan lists it sequentially at position 9, but it could be built in parallel with the overlay work.
- **Severity:** Minor
- **Suggestion:** Explicitly note that Task 9 can be parallelized with Tasks 2-8 to accelerate delivery. Same for Task 12 (unit tests) -- the test file can be started as soon as Task 1 is done.

### 12. Acceptance Criteria: Task 5 Missing "No Layout Break on Non-Meet Pages"

- **Category:** Acceptance Criteria
- **Finding:** The content script is injected into Google Meet pages. But if the URL match pattern is broad, the margin injection could fire on non-Meet Google pages. The plan does not mention guarding against this.
- **Severity:** Minor
- **Suggestion:** Add a negative test to Task 5: "Margin injection only occurs when the overlay is visible on a Google Meet page. No margin is applied on other pages matched by the content script manifest."

### 13. Naming: "Dock Left" / "Dock Right" vs. User-Friendly Labels

- **Category:** Naming
- **Finding:** The dropdown options are "Floating, Dock Left, Dock Right." The word "Dock" is technical. Non-technical users (the target audience) might not know what "dock" means in a UI context.
- **Severity:** Minor
- **Suggestion:** Consider "Floating," "Sidebar Left," "Sidebar Right" as alternatives. These are more descriptive for a PM/non-engineer audience. The internal code can still use `dock-left`/`dock-right`.

### 14. Missing: Keyboard Accessibility for Dock Toggle

- **Category:** Missing
- **Finding:** Task 6 adds a dock toggle button but does not mention keyboard focus, `aria-label`, or keyboard shortcut. The existing header buttons also lack explicit ARIA labels, so this is a pre-existing gap, but adding a new button is an opportunity to address it.
- **Severity:** Minor
- **Suggestion:** Add to Task 6 acceptance criteria: "Dock toggle button has an `aria-label` attribute and is keyboard-focusable." Consider filing a separate accessibility task for all header controls if this is out of scope here.

### 15. Task 13: LangBuilder Compatibility Is Over-Scoped

- **Category:** Sizing
- **Finding:** Task 13 (LangBuilder compatibility) is a full task with its own verification cycle, but the actual work is: hide one button when docked, revert side-by-side on dock. This is 10-15 lines of code inside `setDockMode()` and could be part of Task 3 or Task 6.
- **Severity:** Minor
- **Suggestion:** Merge Task 13 into Task 3 (where `setDockMode()` is implemented). Add the LangBuilder guard as acceptance criteria there. This saves one full implementation + verification cycle.

### 16. Missing: Human Estimates Not Filled In

- **Category:** Acceptance Criteria
- **Finding:** The Progress Dashboard has "Human Est. (min)" empty for all 14 tasks. Without estimates, the multiplier column is meaningless, and there is no baseline to judge if the implementation is on track.
- **Severity:** Important
- **Suggestion:** Fill in human estimates before implementation starts. Rough guideline: Task 1 (15 min), Tasks 2-4 (30-45 min each), Task 5 (60 min), Tasks 6-7 (30 min each), Task 8 (20 min), Task 9 (30 min), Tasks 10-11 (20-30 min each), Task 12 (45 min), Task 13 (15 min), Task 14 (20 min).

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| Important | 6 |
| Minor | 6 |

**Must fix before starting implementation:**
1. Resolve the `overlayPosition` naming collision (Finding 1)
2. Add margin cleanup on extension unload/destroy (Finding 2)

**Should fix to reduce rework:**
3. Promote `forceShow()` dock-awareness from a note to an acceptance criterion (Finding 3)
4. Pre-investigate Google Meet body styles before coding Task 5 (Finding 4)
5. Merge Task 8 into Tasks 3/4 to eliminate redundancy (Finding 5)
6. Define close-while-docked behavior explicitly (Finding 8)

**Nice to have:**
7. Consider merging Task 13 into Task 3 (Finding 15)
8. Parallelize Task 9 with Tasks 2-8 (Finding 11)
9. Use "Sidebar Left/Right" instead of "Dock Left/Right" for user-facing labels (Finding 13)
