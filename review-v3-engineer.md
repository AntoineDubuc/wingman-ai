# Senior Engineer Review v3: Docked Overlay Mode (Phase 25)

**Reviewer:** Senior engineer. Final review.
**Focus:** Verify v2 fixes are correct. Find anything missed.

---

## Verification of v2 Critical Fixes

### C1. Single storage read (race condition fix) — Correctly specified

Task 3 clearly states: combine `overlayPosition`, `overlayMinimized`, `overlayFontSize`, `overlayDockMode`, and `overlayDockedWidth` into one `chrome.storage.local.get()` call, then branch on dock vs. floating. The existing `restorePosition()` (overlay.ts line 1551) already reads the first three together, so expanding that call is straightforward. No issue here.

### C2. Inline style clearing — Correctly specified

Task 3 lists all six inline style properties to clear when docking: `left`, `top`, `right`, `width`, `height`, `maxWidth`. This covers:
- `restorePosition()` sets `left`, `top`, `right`, `width`, `height`
- `Draggable.onMouseMove()` sets `left`, `top`, `right`
- `setLayoutMode('side-by-side')` sets `maxWidth`, `width`
- `Resizable.onMouseMove()` sets `width`, `height`

Guards in `restorePosition()` and `savePosition()` to skip when docked are also specified. Complete.

### C3. CSS transition (specific properties, not `all`) — Correctly specified

Task 2 explicitly lists: `transition: left 200ms ease, right 200ms ease, top 200ms ease, height 200ms ease, border-radius 200ms ease, box-shadow 200ms ease, background 200ms ease`. Width is excluded. The existing `transition: box-shadow 0.2s ease, background 0.2s ease` (overlay.css line 54) will be replaced by the `[data-dock]` selector's transition. Floating mode keeps the original short transition. Correct.

---

## Findings

### F1. `loadTheme` does NOT save its storage listener reference — plan says to follow its pattern, but the pattern has a leak

**Severity:** Low (existing bug, not introduced by this plan)

**Details:** Task 3 says the Dockable's storage listener should follow "the same pattern as `loadTheme()`." But `loadTheme()` (overlay.ts line 143) calls `chrome.storage.onChanged.addListener()` with an anonymous function and never saves the reference. It is never removed in `destroy()`. The plan correctly says Dockable should "save listener reference and remove it in `destroy()`" — which is actually **better** than the `loadTheme` pattern. Not a blocker, but the plan description should not reference `loadTheme` as the model pattern for listener cleanup since `loadTheme` doesn't do cleanup. The implementer should follow the plan's own specification (save ref, remove in destroy), not the existing code.

**Action:** Minor wording fix. Implementer just needs to know: save the listener, remove it in `destroy()`. Don't copy `loadTheme`'s approach verbatim.

### F2. `DockableOptions.onMarginUpdate` and `onMarginRemove` are redundant with standalone `margin-injector.ts`

**Severity:** Low (dead code in the interface)

**Details:** Task 3 defines `DockableOptions` with callbacks `onMarginUpdate` and `onMarginRemove`. But Task 5 introduces `margin-injector.ts` as a standalone module that Dockable imports directly. If Dockable imports `injectDockMargin` and `removeDockMargin` from `margin-injector.ts`, these two callbacks in `DockableOptions` are never called by the overlay — Dockable handles margins itself.

The `DockableOptions` interface should drop `onMarginUpdate` and `onMarginRemove` and instead have Dockable import margin functions directly. The callbacks `onRestorePosition`, `onLayoutModeReset`, and `onDockChange` remain valid because they interact with overlay state that Dockable shouldn't own.

**Action:** Remove `onMarginUpdate` and `onMarginRemove` from `DockableOptions`. Dockable imports from `margin-injector.ts` directly. This is consistent with what Task 5 describes but contradicts the interface in Task 3.

### F3. No circular dependency — confirmed clean

**Concern from review prompt:** "Does Dockable owning the dock Resizable create a circular dependency?"

**Verified:** No. The dependency graph is:
- `overlay.ts` imports `Draggable`, `Resizable`, `Dockable`
- `dockable.ts` imports `Resizable`, `margin-injector`
- `resizable.ts` imports nothing from this codebase
- `margin-injector.ts` imports nothing from this codebase

No cycles. Clean DAG.

### F4. Module scoping for `margin-injector.ts` — works fine with Vite bundling

**Concern from review prompt:** "Both content-script.ts and dockable.ts run in the same content script context — verify there are no module scoping issues."

**Verified:** Vite bundles `content-script.ts` as a single entry (vite.config.ts line 47). All imports from `content-script.ts` (including `overlay.ts` -> `dockable.ts` -> `margin-injector.ts`) and any direct import from `content-script.ts` -> `margin-injector.ts` resolve to the same module instance in the bundle. There is no separate execution context. The `marginApplied` boolean state in the margin-injector module will be shared correctly across all importers. No issue.

### F5. `parseDockMode` utility — useful, not just a type guard

**Concern from review prompt:** "Is parseDockMode actually useful or just a type guard wrapper?"

**Verdict:** It is useful. It validates unknown values from `chrome.storage.local.get()` which returns `unknown`. A bare `as DockMode` cast would silently accept `'dock-top'`, `null`, `123`, or any other corrupted value. `parseDockMode` provides runtime validation with a safe fallback to `'floating'`. It also enables clean unit testing of the validation logic without chrome.storage mocking. Keep it.

### F6. Missing consideration: `Draggable.onMouseMove` sets `right: 'auto'` — conflicts with dock-right CSS

**Severity:** Low (covered by existing guards, but worth noting)

**Details:** `Draggable.onMouseMove()` (draggable.ts line 110) sets `target.style.right = 'auto'`. If a drag somehow fires while docked (e.g., a race between `isDisabled` callback and a mousedown), this would break `right: 0` from the `[data-dock="right"]` CSS. The `isDisabled` callback guard in Task 3 should prevent this, but the plan doesn't specify what happens if `isDisabled` is checked and the dock mode changes mid-drag (between mousedown and mousemove). This is extremely unlikely and covered by M9 in v2 review (guard `setDockMode()` during active drag/resize). Not a blocker for V1.

### F7. CSS `right: 20px` default in overlay.css will need clearing for dock-left

**Severity:** Already covered (informational)

The CSS default `.overlay-panel { right: 20px; }` (overlay.css line 39) is a stylesheet rule, not an inline style. The `[data-dock="left"]` selector will override it with `left: 0` in the stylesheet. However, `restorePosition()` sets `right: 'auto'` inline (overlay.ts line 1564). The inline style clearing in `setDockMode()` already covers `right`, so this works. No gap.

### F8. `forceShow()` re-applies dock but `clearTimeline()` may flash content

**Severity:** Very low

**Details:** `forceShow()` (overlay.ts line 1489) currently calls `clearTimeline()` then sets `display: 'flex'`. The plan says to call `dockable.reapply()` after `display: 'flex'`. This means for one frame, the panel is visible at `display: flex` before dock CSS is re-applied. If the panel had stale floating inline styles from a previous session, there could be a single-frame flash. The single storage read fix (C2) mitigates this because dock mode is applied during initial restore, before `forceShow()` runs. And `forceShow()` only fires when a session starts, by which time the panel is already positioned. Not a real issue in practice.

---

## Verdict

**Ready to implement.**

The three critical fixes (single storage read, inline style clearing, CSS transition specificity) are correctly and thoroughly specified in the task descriptions. The standalone `margin-injector.ts` module approach is sound — same bundle, same module instance, no scoping issues. No circular dependencies. `parseDockMode` earns its existence.

Two cleanup items for the implementer:

1. **Drop `onMarginUpdate`/`onMarginRemove` from `DockableOptions`** — Dockable imports margin functions directly from `margin-injector.ts` (as Task 5 describes). The callbacks are vestigial from the pre-review design.

2. **Don't model listener cleanup after `loadTheme()`** — `loadTheme` leaks its listener. The plan's own spec (save ref, remove in destroy) is the correct pattern.

Neither is a blocker. The plan is solid.
