# Aggregated Review v2: Docked Overlay Mode (Phase 25)

Three reviewers re-examined the updated plan: End User, Product Manager, Senior Engineer. Focus was on code quality and engineering best practices. Below are all actionable findings, deduplicated and prioritized.

---

## CRITICAL (must fix before implementation)

### C1. Inline style specificity will silently break dock CSS
- **Sources:** Engineer F5, Engineer F14
- **Issue:** `[data-dock="right"]` CSS selectors set `right: 0; top: 0; height: 100vh`, but existing JS code sets these same properties as inline styles (in `restorePosition()`, `Draggable.onMouseMove()`, `Resizable.onMouseMove()`, `setLayoutMode()`). Inline styles always beat attribute selectors. Dock CSS will be silently ignored if stale inline styles remain.
- **Action:** In `setDockMode()` when docking, explicitly clear ALL conflicting inline styles: `left`, `top`, `right`, `width`, `height`, `maxWidth`. Add guards in `restorePosition()` and `savePosition()` to skip when docked. Clear `maxWidth` from `setLayoutMode('single')` before applying dock CSS.

### C2. Race condition between `restorePosition()` and `loadDockMode()`
- **Sources:** Engineer F6, PM F7
- **Issue:** Both are independent async `chrome.storage.local.get()` calls in the constructor. No guaranteed ordering. If `restorePosition()` resolves after `loadDockMode()`, it overwrites dock CSS with floating inline styles.
- **Action:** Combine into a single `chrome.storage.local.get()` call that reads `overlayPosition`, `overlayMinimized`, `overlayFontSize`, `overlayDockMode`, and `overlayDockedWidth` together. Apply either dock or floating based on the result. Eliminates the race and reduces storage reads.

### C3. CSS `transition: all 200ms ease` causes rubbery drag/resize
- **Sources:** PM F9, Engineer F4
- **Issue:** `transition: all` includes `left`, `top`, `width`, `height` — the same properties modified during drag and resize. This creates 200ms lag on every mouse move, making interactions feel janky. Also overwrites the existing `transition: box-shadow 0.2s ease, background 0.2s ease`.
- **Action:** Use specific transition properties that exclude `width`: `transition: left 200ms ease, right 200ms ease, top 200ms ease, height 200ms ease, border-radius 200ms ease, box-shadow 200ms ease, background 200ms ease`. This preserves smooth mode switching while leaving drag/resize responsive.

---

## IMPORTANT (should fix to avoid rework)

### I1. Dockable constructor should take a config object
- **Source:** Engineer F1
- **Issue:** Positional callback args (panel, marginUpdate, marginRemove, restorePosition, layoutReset) are unreadable at the call site. Will grow to 5-6 args.
- **Action:** Define a `DockableOptions` interface with named callbacks. Matches the existing `DraggableOptions` and `ResizableOptions` pattern.

### I2. Resizable cursor handling conflicts with CSS
- **Source:** Engineer F2
- **Issue:** Resizable's `onMouseDown`/`onMouseUp` set cursor to `nwse-resize` inline. For dock resize with `widthOnly: true`, this overrides the CSS `ew-resize`. Also need to skip height calculation in `onMouseMove` when `widthOnly` is true.
- **Action:** When `widthOnly` is true, set cursor to `ew-resize` instead of `nwse-resize`. Skip height adjustment in `onMouseMove`. Add deltaX inversion for `edge: 'left'`.

### I3. Draggable `isDisabled` not wired to dock state
- **Source:** PM F1
- **Issue:** No acceptance criterion ensures Draggable's `isDisabled` returns true when docked. If missed, users can drag a "docked" panel out of position.
- **Action:** Add to Task 3 acceptance criteria: "Draggable's `isDisabled` callback returns `true` when dock mode is not `'floating'`."

### I4. Task 5 has no fallback criteria if spike says no margin injection
- **Source:** PM F3
- **Issue:** All acceptance criteria assume margin injection works. If the spike recommends overlay-over-content, Task 5 has unclear requirements.
- **Action:** Add conditional: "If Task 0 recommends no margin injection, Task 5 is reduced to: remove margin callbacks from Dockable, mark as N/A."

### I5. Task 6 missing acceptance criterion for layout toggle restore
- **Source:** PM F5
- **Issue:** Dock toggle replaces layout toggle when docked. But no AC tests that undocking restores the layout toggle.
- **Action:** Add AC: "Undocking restores the layout toggle button when LangBuilder is configured." Add negative: "Layout toggle does not reappear if LangBuilder is not configured."

### I6. Consider standalone `margin-injector.ts` module
- **Source:** Engineer F9
- **Issue:** Margin functions in content-script.ts called via 3-level callback chain (content-script → overlay → dockable). `handleExtensionInvalidated()` also needs direct access.
- **Action:** Create `src/content/overlay/margin-injector.ts` with `injectDockMargin(side, width)` and `removeDockMargin()`. Both content-script.ts and dockable.ts import directly. Eliminates callback chain.

### I7. Side-by-side revert needs user-visible feedback
- **Sources:** User F3
- **Issue:** When docking auto-reverts side-by-side layout, only a console.log fires. Users won't see it.
- **Action:** Show a brief toast: "Side-by-side view not available in sidebar mode."

---

## MINOR (nice-to-have, can defer)

### M1. Task 4 width constraints not defined in Task 1 constants
- **Source:** PM F2
- **Action:** Either add `UI.OVERLAY_DOCKED_MIN_WIDTH`/`MAX_WIDTH` to Task 1, or note that it reuses existing `minWidth: 280`.

### M2. Task 3 scope is large — bump estimate
- **Source:** PM F4
- **Action:** Bump Task 3 human estimate from 45 to 60 minutes.

### M3. Specify exported class name `PanelLayoutSection`
- **Source:** PM F6
- **Action:** Note in Task 7: export `PanelLayoutSection` class.

### M4. Extract pure functions for testability
- **Sources:** PM F8, Engineer F13
- **Action:** Extract `parseDockMode(value: unknown): DockMode` and `clampDockedWidth(width: number, viewportWidth: number): number` as pure exported functions in dockable.ts.

### M5. Make `removeDockMargin()` idempotent
- **Source:** Engineer F8
- **Action:** Track `marginApplied` boolean. Multiple calls become no-ops.

### M6. Dockable should own the dock Resizable instance
- **Sources:** Engineer F12, Engineer F16
- **Action:** Dockable creates, shows/hides, and destroys the dock resize handle. Overlay's existing Resizable stays untouched.

### M7. Document known limitation: no live window resize clamping
- **Sources:** PM F10, Engineer F17
- **Action:** Add note in Task 3: "Live window resize does not trigger width re-clamping in V1."

### M8. Default dock side could be left (fewer Meet conflicts)
- **Source:** User F2
- **Action:** Consider after spike. If right side has conflicts, default to left.

### M9. Guard `setDockMode()` during active drag/resize
- **Source:** Engineer F15
- **Action:** Check `dragging`/`resizing` flags before applying mode change. Defer until mouseup.

### M10. Clarify minimized circle vertical position in docked mode
- **Source:** Engineer F11
- **Action:** Specify: top of the docked edge (natural default from `top: 0`).

### M11. Meet Chat panel conflict — commit to user-facing behavior after spike
- **Source:** User F1
- **Action:** After spike, document the behavior in tooltip/settings description.
