# Senior Engineer Review v2: Docked Overlay Mode (Phase 25)

**Reviewer:** Senior engineer. Motto: "The best code is no code."
**Focus:** Code quality, API design, state coordination, race conditions, CSS specificity, test strategy.

---

## Findings

### 1. Dockable constructor should take a config object, not positional args

- **Category:** API Design
- **Finding:** The plan says the constructor takes "panel element, callbacks for margin update and layout mode reset." That's already 3+ positional arguments of similar types (functions). As more behavior is wired (resize width sync, position restore, minimize notify), this will grow to 5-6 positional callbacks. Positional callbacks are unreadable at the call site — you can't tell which function does what without looking at the parameter names.
- **Severity:** Important
- **Suggestion:** Use a config object, matching the pattern already established by `Draggable` and `Resizable`:
  ```ts
  interface DockableOptions {
    panel: HTMLElement;
    onMarginUpdate: (side: 'left' | 'right', width: number) => void;
    onMarginRemove: () => void;
    onRestorePosition: () => void;
    onLayoutModeReset: () => void;
    onDockChange?: (mode: DockMode) => void;
  }
  ```
  This is consistent with `DraggableOptions` and `ResizableOptions` and is self-documenting at the call site.

---

### 2. Resizable deltaX inversion is wrong for left-edge handles

- **Category:** Architecture
- **Finding:** The plan says add an `edge: 'left'` option that "inverts deltaX." Looking at the actual Resizable code (line 130):
  ```ts
  const newWidth = Math.max(minW, Math.min(maxW, this.startWidth + deltaX));
  ```
  `deltaX = e.clientX - this.startX`. When the handle is on the **left** edge of a dock-right panel, the user drags **left** to make it wider. That means `e.clientX < this.startX`, so `deltaX` is negative. The plan says to "invert deltaX" — i.e., `this.startWidth - deltaX`. That part is correct. **But** there's a second problem: the existing `onMouseDown` also sets the handle cursor to `nwse-resize` (line 114). For a left-edge handle, this should be `ew-resize`. The plan's CSS mentions `cursor: ew-resize` on the handle class, but Resizable's JS overwrites the cursor inline on mousedown and mouseup (lines 114, 143). The inline JS cursor will fight the CSS cursor.
- **Severity:** Important
- **Suggestion:** The `edge` option needs to also control:
  1. The deltaX sign flip in `onMouseMove` (already planned)
  2. The cursor set in `onMouseDown` and `onMouseUp` — use `ew-resize` instead of `nwse-resize` when `widthOnly` is true
  3. Skip the height calculation entirely when `widthOnly` is true (line 131-134)

  Concrete change to `onMouseMove`:
  ```ts
  const dx = this.options.edge === 'left' ? -deltaX : deltaX;
  const newWidth = Math.max(minW, Math.min(maxW, this.startWidth + dx));
  this.options.target.style.width = `${newWidth}px`;
  if (!this.options.widthOnly) {
    const newHeight = Math.max(minH, Math.min(maxH, this.startHeight + deltaY));
    this.options.target.style.height = `${newHeight}px`;
  }
  ```
  And `onMouseDown`/`onMouseUp` cursor:
  ```ts
  this.options.handle.style.cursor = this.options.widthOnly ? 'ew-resize' : 'nwse-resize';
  ```

---

### 3. Resizable also needs to skip position adjustment for docked panels

- **Category:** Architecture
- **Finding:** When a dock-right panel is resized from the left edge, the panel needs to grow leftward. But Resizable only sets `width` — it doesn't adjust `left` or `right`. Since the docked CSS uses `right: 0` (fixed to right edge), width-only resize will naturally grow leftward. **However**, for dock-left with a right-edge handle, the CSS uses `left: 0`, so growing rightward also works naturally. This is fine — no issue here, the CSS positioning handles it. Noting this because it's a subtle correctness point that the plan doesn't explicitly call out but happens to work.
- **Severity:** Minor (informational, no action needed)
- **Suggestion:** Add a code comment in the Resizable extension explaining why position adjustment isn't needed for docked panels.

---

### 4. CSS `transition: all 200ms ease` will animate width during resize

- **Category:** CSS
- **Finding:** Task 2 adds `transition: all 200ms ease` to `.overlay-panel` for smooth mode switching. But during a live resize drag, this transition will cause the width to lag 200ms behind the mouse, creating a rubbery/janky feel. The existing `resize: both` CSS property (line 55 of overlay.css) also interacts with this.
- **Severity:** Important
- **Suggestion:** Two options:
  1. Use specific transition properties instead of `all`: `transition: left 200ms ease, right 200ms ease, top 200ms ease, height 200ms ease, border-radius 200ms ease;` — explicitly exclude `width`.
  2. Or: add/remove a `.transitioning` class only during mode switches, not during resize. But option 1 is simpler and less error-prone.

  Also: the existing `transition: box-shadow 0.2s ease, background 0.2s ease` on `.overlay-panel` (line 54) will be overwritten by `transition: all 200ms`. You need to merge them, not replace.

---

### 5. `[data-dock]` selectors vs. inline styles — specificity conflict

- **Category:** CSS
- **Finding:** The plan adds CSS rules like `.overlay-panel[data-dock="right"] { right: 0; top: 0; height: 100vh; }`. But the existing code sets inline styles via JS in multiple places:
  - `restorePosition()` (line 1562-1570): sets `left`, `top`, `right`, `width`, `height` as inline styles
  - `Draggable.onMouseMove()`: sets `left`, `top`, `right` as inline styles
  - `Resizable.onMouseMove()`: sets `width`, `height` as inline styles
  - `setLayoutMode()` (line 1372-1373): sets `maxWidth`, `width` as inline styles

  **Inline styles always beat attribute selectors in specificity.** So `.overlay-panel[data-dock="right"] { right: 0; top: 0; }` will be ignored if `restorePosition()` already set `style.right = 'auto'` and `style.top = '100px'`.

  The plan says `setDockMode()` "clears inline positioning when docking" — but this needs to be extremely thorough. Every inline style that conflicts must be cleared: `left`, `top`, `right`, `width`, `height`, `maxWidth`. If any path re-sets them (like a storage listener firing `restorePosition()` after dock mode is applied), the dock CSS breaks.
- **Severity:** Critical
- **Suggestion:** In `setDockMode()` when docking, explicitly clear all conflicting inline styles:
  ```ts
  panel.style.left = '';
  panel.style.top = '';
  panel.style.right = '';
  panel.style.width = '';
  panel.style.height = '';
  panel.style.maxWidth = '';
  ```
  And add a guard in `restorePosition()` to skip if currently docked:
  ```ts
  if (this.dockable?.isDocked()) return;
  ```
  Same guard in `savePosition()` — don't save floating coords when docked or you'll corrupt the floating position for when the user undocks later.

---

### 6. `restorePosition()` runs in constructor, `loadDockMode()` timing is undefined

- **Category:** State Coordination
- **Finding:** The overlay constructor calls (in order): `loadStyles()`, `createOverlayStructure()`, `initDrag()`, `initResize()`, `initScrollDetection()`, `restorePosition()`, `loadTheme()`, `loadPersonaLabel()`, `loadLangBuilderVisibility()`.

  The plan says Dockable will be created in the constructor and `loadDockMode()` reads from storage asynchronously. But `restorePosition()` also reads from storage asynchronously. Both use `chrome.storage.local.get()` with callbacks. **There's no guaranteed ordering between these two async reads.** If `restorePosition()` resolves first, it sets inline styles (left, top, width, height). Then `loadDockMode()` resolves and needs to clear them. That works. But if `loadDockMode()` resolves first and sets dock CSS, then `restorePosition()` resolves and overwrites with floating inline styles — the dock layout breaks.
- **Severity:** Critical
- **Suggestion:** Two clean options:
  1. **Single storage read**: Combine `restorePosition()` and `loadDockMode()` into one `chrome.storage.local.get(['overlayPosition', 'overlayMinimized', 'overlayFontSize', 'overlayDockMode', 'overlayDockedWidth'], ...)` call. Then apply either dock or floating based on the result. This eliminates the race entirely.
  2. **Guard in restorePosition**: After dock is loaded, have `restorePosition()` check `dockable.isDocked()` and skip. But this only works if you can guarantee dock loads first — which you can't with two independent async calls.

  Option 1 is strongly preferred. It's also fewer storage reads (one instead of two), which is better for performance.

---

### 7. Storage listener accumulation — no cleanup on destroy

- **Category:** State Coordination
- **Finding:** The existing `loadTheme()` adds a `chrome.storage.onChanged` listener (line 143) but **never removes it** in `destroy()` (line 1659-1662). Same for `loadPersonaLabel()` (line 225) and `loadLangBuilderVisibility()` (line 1289). The plan says Dockable will also add a storage listener and clean it up in `dockable.destroy()`. Good — but the existing listeners leak.

  More importantly: if the content script calls `initOverlay()` multiple times (which it does — line 67-72 shows it calls `forceShow()` on re-init), and the overlay is ever destroyed and re-created, each new instance adds more listeners without removing old ones. Currently `destroy()` only cleans up draggable and resizable. The storage listeners from the old instance keep firing on a stale `this`.
- **Severity:** Important
- **Suggestion:** This is a pre-existing bug, not introduced by this plan. But the plan should be aware of it. For Dockable specifically: save the listener reference and remove it in `destroy()`. The plan already says this — good. Just make sure the implementation actually does it (easy to forget since the existing overlay code doesn't).

---

### 8. Double margin removal risk

- **Category:** State Coordination
- **Finding:** The plan lists 5+ code paths that remove the margin: `destroy()`, `hide()`, `handleExtensionInvalidated()`, minimize, undock. If multiple fire in sequence (e.g., user clicks close which calls `hide()` then `onCloseCallback` triggers `STOP_SESSION` which eventually calls `destroy()`), `removeDockMargin()` is called multiple times.
- **Severity:** Minor
- **Suggestion:** Make `removeDockMargin()` idempotent. If it sets a style on an element, check if the style is already absent before removing. Or track a boolean `marginApplied` flag:
  ```ts
  function removeDockMargin() {
    if (!marginApplied) return;
    // ... remove margin
    marginApplied = false;
  }
  ```
  This is defensive but cheap. Multiple calls become harmless no-ops.

---

### 9. Margin injection location — content script vs. dockable.ts

- **Category:** Architecture
- **Finding:** The plan says margin functions (`injectDockMargin`, `removeDockMargin`) live in `content-script.ts`, but Dockable calls them via callback. This means the callback crosses the module boundary. Looking at `content-script.ts`, it currently has no exported functions — it's a top-level script with no class or module pattern. The plan says Dockable "calls margin functions via callback" — so the overlay constructor would need to pass functions that reach into the content script's scope.

  But the overlay is created inside `initOverlay()` in the content script (line 76): `overlay = new AIOverlay(handleOverlayClose)`. The margin functions would be defined in content-script.ts and passed as callbacks to the overlay constructor, which passes them to Dockable. This creates a 3-level callback chain: content-script -> overlay -> dockable.

  Additionally, `handleExtensionInvalidated()` (line 31) needs to call `removeDockMargin()` directly — but it currently doesn't reference the overlay at all (it just sets `extensionValid = false`). This needs to be updated.
- **Severity:** Important
- **Suggestion:** Define `injectDockMargin` and `removeDockMargin` as standalone functions in content-script.ts (they operate on `document.body` or the Meet container, not the shadow DOM). Pass them to `AIOverlay` constructor, which passes them to Dockable. Update `handleExtensionInvalidated()` to call `removeDockMargin()` directly since it has closure access. This is clean but verbose.

  Alternative: make the margin functions a small standalone module (`margin-injector.ts`) that both content-script.ts and dockable.ts can import directly. This avoids the callback chain entirely. Since both run in the content script context (same `document`), direct imports work fine.

---

### 10. `forceShow()` + dock reapply — ordering matters

- **Category:** State Coordination
- **Finding:** The plan says `forceShow()` should call `dockable.reapply()`. Looking at the current `forceShow()` (line 1489-1496):
  ```ts
  forceShow(): void {
    if (this.isMinimized) {
      this.isMinimized = false;
      this.panel.classList.remove('minimized');
    }
    this.clearTimeline();
    this.panel.style.display = 'flex';
  }
  ```
  If `dockable.reapply()` is called after `this.panel.style.display = 'flex'`, that's fine. But `clearTimeline()` (line 456) manipulates DOM elements and styles. It shouldn't interfere with dock state. However, if `reapply()` sets inline width on the panel, and then something in the session start flow triggers `restorePosition()`, the inline width gets overwritten. The `forceShow()` -> `initOverlay()` path in content-script.ts (line 68-72) shows that `forceShow()` is called on an already-initialized overlay — it doesn't re-run the constructor. So `restorePosition()` won't re-run. That's fine.

  But `forceShow()` is also where `clearTimeline()` resets the header, and if the dock toggle button state needs refreshing (tooltip, icon), that should happen here too.
- **Severity:** Minor
- **Suggestion:** `dockable.reapply()` should be called **after** `this.panel.style.display = 'flex'` so the panel is visible when dock CSS is applied. Add it as the last line of `forceShow()`.

---

### 11. Minimized circle positioning when docked — CSS vs. inline style fight

- **Category:** CSS
- **Finding:** The plan says "minimized in docked mode uses the same 48px circle, positioned at the docked edge." The current `.minimized` CSS (line 72-80) sets `width: 48px !important; height: 48px !important`. When docked-right, the panel CSS has `right: 0; top: 0; height: 100vh`. When minimized is toggled, the `minimized` class is added, which sets height to `48px !important` — overriding the `height: 100vh` from `[data-dock="right"]`. So far so good.

  But where is the minimized circle positioned? The `right: 0` from `[data-dock="right"]` keeps it at the right edge. The `top: 0` keeps it at the top. So the circle will be at the top-right corner. Is that what the plan intends? It says "positioned at the docked edge" but doesn't specify vertical position. Top-right corner seems reasonable.

  One issue: the `transition: all 200ms` will animate the height shrink from `100vh` to `48px`, which will look like the panel collapsing vertically. This might actually look good, but it's not specified.
- **Severity:** Minor
- **Suggestion:** Clarify the vertical position of the minimized circle in docked mode (top of the edge is the natural default). The collapse animation from `100vh` to `48px` should be tested visually — it might look odd. If so, consider disabling the transition for the minimize toggle (or using `display: none` briefly).

---

### 12. Two Resizable instances — destroy cleanup

- **Category:** Architecture
- **Finding:** The plan creates a second `Resizable` instance for the dock edge handle. The overlay currently stores one `resizable` reference (line 58) and destroys it (line 1661). With two instances, both need to be tracked and destroyed.
- **Severity:** Minor
- **Suggestion:** Store the dock resizable separately (e.g., `this.dockResizable`) and destroy both in `destroy()`. Or: let Dockable own the dock Resizable instance and handle its lifecycle. This is cleaner — Dockable creates, shows/hides, and destroys the dock resize handle. Overlay's existing Resizable stays untouched.

---

### 13. Test strategy — enough testable logic?

- **Category:** Testing
- **Finding:** Task 8 lists these testable items:
  - Default dock mode is `'floating'` (trivial assertion)
  - Invalid values fall back to `'floating'` (validation function)
  - Dock mode saved to storage (mock storage, call set, check)
  - Width clamping logic (pure math)
  - `DockMode` type validation

  This is thin. The validation function and width clamping are maybe 5-10 lines of pure logic. The storage tests are integration-level (mock chrome.storage, call methods, verify). The `DockMode` type is a TypeScript compile-time check — not testable at runtime.

  I count maybe 6-8 meaningful test cases. That's enough to justify a file, barely. The real value is in the validation function (parsing storage values into valid DockMode) and the width clamp.
- **Severity:** Minor
- **Suggestion:** Extract a pure `parseDockMode(value: unknown): DockMode` function and a `clampDockedWidth(width: number, viewportWidth: number): number` function. These are trivially testable. Also test the "derive last dock side from current mode" logic (defaulting to `'dock-right'`). That gives ~8-10 test cases, which is fine.

  Don't test `chrome.storage` round-trips — those are integration tests that test Chrome's API, not your logic. The fake-browser setup supports it, but the ROI is low.

---

### 14. `setLayoutMode` inline styles not cleaned up when docking

- **Category:** State Coordination
- **Finding:** `setLayoutMode('side-by-side')` (line 1372-1373) sets `panel.style.maxWidth = '900px'` and `panel.style.width = '...'`. The plan says docking should revert side-by-side to single-panel. But if `setLayoutMode('single')` is called during the dock transition, it sets `panel.style.maxWidth = '600px'` (line 1376) and restores `singlePanelWidth`. These inline styles will override the dock CSS width. The dock CSS needs to win.
- **Severity:** Important
- **Suggestion:** The revert-to-single-panel logic should happen **before** dock CSS is applied. And after reverting, the dock `setDockMode()` should clear `maxWidth` inline style along with the other inline styles (see Finding 5). Add `panel.style.maxWidth = ''` to the cleanup list.

---

### 15. No guard on `setDockMode()` during active resize or drag

- **Category:** State Coordination
- **Finding:** If the user is mid-drag or mid-resize when the storage listener fires a dock mode change (e.g., they changed it in Settings while also interacting with the overlay), the dock transition will conflict with the active mouse interaction. Draggable and Resizable both track `isDragging`/`isResizing` state.
- **Severity:** Minor
- **Suggestion:** In `setDockMode()`, check if a drag or resize is in progress and defer the mode change:
  ```ts
  if (this.draggable?.dragging || this.resizable?.resizing) {
    // defer until mouseup
    return;
  }
  ```
  Or: let the mouseup handler check for a pending dock mode change. This is an edge case but prevents a glitchy interaction.

---

### 16. Plan says docked width is persisted on resize end, but the callback chain is unclear

- **Category:** API Design
- **Finding:** The dock Resizable instance needs an `onResizeEnd` callback that saves the width to `overlayDockedWidth` storage. But who wires this? If Dockable owns the dock Resizable (per Finding 12), Dockable should wire its `onResizeEnd` to save width. If the overlay owns it, the overlay needs to call into Dockable to persist. The plan says "width is saved to `overlayDockedWidth` storage via the Dockable class" but doesn't specify the wiring.
- **Severity:** Minor
- **Suggestion:** Let Dockable own the dock Resizable entirely. Dockable creates it, sets `onResizeEnd` to save width and call the margin update callback. Overlay doesn't need to know about the dock resize handle at all. This is the cleanest separation.

---

### 17. Margin injection must also update on window resize

- **Category:** Architecture
- **Finding:** The plan covers margin injection when docking, undocking, resizing the panel, minimizing, and destroying. But what about **window resize**? If the browser window gets narrower, the docked panel width may exceed available space. The width gets clamped on restore via `Math.min(savedWidth, window.innerWidth - 200)`, but there's no live clamping during a window resize event. The margin would also need updating if the width is auto-clamped.
- **Severity:** Minor
- **Suggestion:** The "Out of Scope" section says "No auto-switching to floating at narrow viewports" and "Just clamp width on restore." This is acceptable for V1. But add a brief `window.addEventListener('resize', ...)` handler in Dockable that re-clamps the width and updates the margin. It's ~5 lines and prevents a broken layout if the user resizes their browser while docked.

---

## Summary

**Overall assessment: Solid plan, nearly ready to implement. Two critical issues to resolve first.**

The v1 review feedback was well-incorporated — task merging, Resizable extension, dockable.ts extraction, data-dock attribute, and the spike task are all good decisions. The architecture is sound and the scope is well-controlled.

**Must fix before implementing:**

1. **Finding 5 (Critical):** Inline style specificity will silently break dock CSS. Need explicit inline style clearing in `setDockMode()` plus guards in `restorePosition()`/`savePosition()` to skip when docked.
2. **Finding 6 (Critical):** Two independent async storage reads (`restorePosition` and `loadDockMode`) create a race condition. Combine them into a single read.

**Should fix to avoid rework:**

3. **Finding 1 (Important):** Config object for Dockable constructor.
4. **Finding 2 (Important):** Resizable cursor handling conflicts with CSS.
5. **Finding 4 (Important):** `transition: all` will cause rubbery resize. Use specific properties.
6. **Finding 9 (Important):** Consider a standalone margin-injector module to avoid 3-level callback chain.
7. **Finding 14 (Important):** `setLayoutMode` inline styles need clearing during dock transitions.

**Everything else is minor/informational.** The test strategy is thin but adequate. The CSS approach is clean. The storage pattern with two keys is right. The spike task for margin injection is the correct call.

The plan is ready to implement after addressing the two critical findings.
