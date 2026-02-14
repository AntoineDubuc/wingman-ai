# Senior Engineer Review: Docked Overlay Mode (Phase 25)

**Reviewer perspective**: Senior engineer. Motto: "The best code is no code."

**Overall assessment**: The plan is solid on product intent but over-engineered in execution. 14 implementation tasks + 14 verification tasks = 28 total for what is fundamentally a CSS layout mode toggle + a margin injection. Recommend reducing to 8-9 implementation tasks and cutting ~30% of the scope.

---

## Findings

### 1. Separate dock resize handle is unnecessary duplication

- **Category**: Duplication
- **Finding**: Task 4 proposes building a brand-new dock resize handle with its own mouse event listeners (`mousedown`, `mousemove`, `mouseup`) inline in `overlay.ts`, duplicating exactly what the `Resizable` class already does. The Resizable class already supports `isDisabled`, dynamic `maxWidth`/`maxHeight`, and custom `onResizeEnd`. The only thing it lacks is a `widthOnly` mode and the ability to swap which edge the handle sits on.
- **Severity**: Important
- **Suggestion**: Add a `widthOnly?: boolean` option and an `edge?: 'right' | 'left'` option to the existing `Resizable` class. When `widthOnly` is true, skip height adjustment in `onMouseMove`. When `edge` is `'left'`, invert the deltaX calculation. This is ~15 lines added to `Resizable` vs. ~60+ lines of duplicate mouse handling in `overlay.ts`. Then create a second `Resizable` instance for the dock edge handle and swap visibility based on dock mode.

---

### 2. CSS classes vs. data attribute

- **Category**: Simplification
- **Finding**: The plan uses `.dock-left` and `.dock-right` CSS classes. This is fine, but a `data-dock` attribute (`data-dock="left"`, `data-dock="right"`, no attribute = floating) would be cleaner. Attribute selectors (`.overlay-panel[data-dock="left"]`) are equally specific, and you get one operation instead of two (add class + remove other class). The attribute also serves as a readable state indicator in DevTools.
- **Severity**: Minor
- **Suggestion**: Use `this.panel.dataset.dock = 'left' | 'right' | ''` instead of `classList.add/remove`. One setter, no risk of stale classes. CSS selectors become `.overlay-panel[data-dock="left"]` and `.overlay-panel[data-dock="right"]`.

---

### 3. Body margin injection is fragile on Google Meet

- **Category**: Technical Risk
- **Finding**: The plan proposes injecting `margin-left`/`margin-right` on `document.body`. Google Meet renders its layout inside a deeply nested flex container. Setting `margin` on `body` may not shift the video grid at all if the inner layout uses `position: fixed` or `100vw`-based widths. The plan itself acknowledges this risk ("If Meet sets its own body margin...") but doesn't investigate it. The notes also waver between `document.body.style.marginLeft`, a `<style>` tag with `!important`, and `document.documentElement`.
- **Severity**: Critical
- **Suggestion**: This needs a spike/investigation before committing to an approach. Open Google Meet in DevTools, inspect the actual layout hierarchy, and test whether `body` margin works. If it doesn't (likely), the more robust approach is a `<style>` tag that targets Meet's known layout container (e.g., `div[data-allocation-index]` or the main `c-wiz` flex root). Alternatively, accept that Meet content won't shift and instead make the overlay opaque enough to be usable as-is -- many sidebar extensions (e.g., Notion, Grammarly) simply float over the page without pushing content. This would eliminate Task 5 entirely and cut the highest-risk work.

---

### 4. Tasks 7, 8, and 10 should be folded into earlier tasks

- **Category**: Over-Engineering
- **Finding**: Task 7 (minimize in docked mode) is just a few CSS rules and a margin update -- it's part of implementing dock mode, not a standalone task. Task 8 (persist state) is a single `chrome.storage.local.set/get` call that should be part of Task 3 (where `setDockMode` is implemented). Task 10 (live-sync from options) is a 5-line `chrome.storage.onChanged` listener that follows an exact existing pattern (`loadTheme`). Making these separate tasks with separate verification cycles is bureaucratic overhead.
- **Severity**: Important
- **Suggestion**: Fold Task 7 into Task 2 (CSS) + Task 3 (logic). Fold Task 8 into Task 3. Fold Task 10 into Task 3. The pattern for all of these is already established in the codebase (`loadTheme`, `savePosition`).

---

### 5. Minimized-while-docked 48px strip adds disproportionate complexity

- **Category**: Over-Engineering
- **Finding**: The plan introduces a 48px-wide strip for the docked minimized state, which requires: new CSS rules, margin reduction to 48px on minimize, margin restoration on un-minimize, a new "restore arrow" icon, and a status indicator visible in the strip. This is a significant amount of work for a niche interaction (minimize a docked panel). The current minimized state is a 48px circle, which could work fine for docked mode too -- just keep it at the docked edge.
- **Severity**: Important
- **Suggestion**: For V1, use the same 48px circle minimized state for both floating and docked modes. Position it at the docked edge using the same dock CSS. When minimized in docked mode, remove the page margin entirely (not reduce to 48px). This eliminates the strip UI, the strip CSS, the margin-reduction logic, and the restore arrow icon. If users request the strip behavior later, add it in a follow-up.

---

### 6. Overlay.ts is already too large -- dock logic should be extracted

- **Category**: Architecture
- **Finding**: `overlay.ts` is 1663 lines. The plan adds: `dockMode` property, `loadDockMode()`, `setDockMode()`, dock resize handle creation, dock resize mouse handlers, margin injection callbacks, storage listeners for dock changes, window resize handler, and LangBuilder compatibility checks. This is easily 150-200 more lines in an already overloaded file. The class has ~30 private members and handles timeline, summary, LangBuilder, drag, resize, font, theme, personas, emotions, cost, and now dock mode.
- **Severity**: Important
- **Suggestion**: Extract dock mode into `src/content/overlay/dockable.ts` as a small class (similar to how `Draggable` and `Resizable` are extracted). It would own: dock mode state, CSS class application, margin injection, dock resize handle, and storage persistence. The overlay passes it the panel element and a callback for margin updates. This keeps `overlay.ts` from growing further and makes dock mode independently testable.

---

### 7. Three new storage keys is excessive state

- **Category**: Simplification
- **Finding**: The plan adds `overlayDockMode`, `overlayDockedWidth`, and `lastDockSide` as state. Combined with existing `overlayPosition` (which stores `left`, `top`, `width`, `height`) and `overlayMinimized`, that's a lot of positional state to coordinate. There's also a risk of stale state conflicts (e.g., `overlayPosition.width` vs `overlayDockedWidth`).
- **Severity**: Minor
- **Suggestion**: Two keys are sufficient: `overlayDockMode` (storing `'floating' | 'dock-left' | 'dock-right'`) and `overlayDockedWidth` (number). Drop `lastDockSide` -- derive it from `overlayDockMode` (if mode is `'floating'`, the last side is whatever it was last set to; just default to `'dock-right'` on first use). The existing `overlayPosition` already stores floating position, so no additional state is needed for undocking.

---

### 8. Unit tests for overlay DOM logic are low-value

- **Category**: Testing
- **Finding**: Task 12 proposes unit tests for dock mode in Vitest. The overlay creates real DOM elements, uses a closed Shadow DOM, reads from `chrome.storage.local`, and manipulates `classList` on elements it creates internally. Testing this in Vitest requires JSDOM (which doesn't fully support Shadow DOM), fake-browser mocking for storage, and manual DOM assertions. The tests would be brittle and test implementation details rather than behavior.
- **Severity**: Important
- **Suggestion**: Skip unit tests for the overlay DOM behavior. Instead, write unit tests only for the pure logic: (1) dock mode validation (invalid values fall back to `'floating'`), (2) margin calculation (given dock side and width, compute expected margin). For the actual UI behavior, rely on manual testing (which the plan already requires via screenshots) or a single integration test using Playwright that verifies the CSS class is applied correctly. The verification tasks already include runtime screenshots -- that's your real test.

---

### 9. Task 13 (LangBuilder compatibility) is speculative

- **Category**: Over-Engineering
- **Finding**: Task 13 ensures side-by-side LangBuilder layout is disabled when docked. The fix is literally: in `setDockMode()`, if docking, call `setLayoutMode('single')` and hide the layout toggle button. In `setLayoutMode()`, if docked, return early. This is 5-10 lines of guard code, not a standalone task.
- **Severity**: Minor
- **Suggestion**: Fold into Task 3 (or wherever `setDockMode` is implemented). Add two guard clauses. Done.

---

### 10. Dock toggle button cycling behavior is unnecessarily complex

- **Category**: Simplification
- **Finding**: Task 6 describes the toggle button cycling between `floating -> dock-right -> dock-left -> floating`, then walks it back to "simpler: toggles between floating and last-used dock side." The plan should commit to one approach. The simpler one is correct.
- **Severity**: Minor
- **Suggestion**: Commit to the simple toggle: floating <-> last-used-side (default right). One button, two states. No cycling. This is what VS Code, JetBrains, and every sidebar implementation does.

---

### 11. Window resize auto-switch to floating at <480px is over-engineering

- **Category**: Over-Engineering
- **Finding**: Task 11 proposes auto-switching to floating mode when the viewport is very narrow (<480px). This is a defensive edge case that will essentially never happen on a Google Meet call (Meet itself becomes unusable below ~600px). Adding a window resize listener with debouncing, width clamping, margin recalculation, and automatic mode switching is a lot of code for a scenario nobody will encounter.
- **Severity**: Minor
- **Suggestion**: Skip the auto-switch logic. Just clamp the panel width to `Math.min(dockedWidth, window.innerWidth - 200)` in the CSS or initial setup. The `100vh` height is already CSS-native and doesn't need JS. If someone narrows their window absurdly, the panel overlapping is an acceptable degradation. Add a `window.resize` listener only if a real user reports a problem.

---

### 12. The evidence/verification framework is heavyweight for this feature

- **Category**: Over-Engineering
- **Finding**: The plan includes a full evidence generation protocol with HTML reports, screenshot artifacts, split-agent verification (Agent A/B/C), and a summary rollup page. For 14 tasks adding a sidebar dock mode to an overlay, this is disproportionate. The verification tasks alone double the task count from 14 to 28.
- **Severity**: Minor (process, not code)
- **Suggestion**: This is a process concern, not a code concern. But if you're looking to cut time, the verification protocol could be simplified to: typecheck passes, manual screenshot, done. The HTML evidence reports are overkill for a UI feature where you can just look at it.

---

## Recommended Cuts (30% reduction)

**Original**: 14 implementation tasks + 14 verification = 28 total

**Recommended**: 9 implementation tasks

| # | Merged Task | Original Tasks Covered |
|---|-------------|----------------------|
| 1 | Add dock mode constants and storage keys | Task 1 (unchanged) |
| 2 | Add docked CSS rules | Task 2 (simplified: no 48px strip, use same minimized circle) |
| 3 | Implement dock mode in overlay (load, apply, persist, live-sync) | Tasks 3 + 8 + 10 (all storage/state in one pass) |
| 4 | Extend Resizable for width-only dock resize | Task 4 (extend Resizable, don't duplicate) |
| 5 | Inject page margin when docked (spike + implement) | Task 5 (but spike first to validate approach) |
| 6 | Add dock toggle button to header | Task 6 (unchanged) |
| 7 | LangBuilder + minimize guards | Tasks 7 + 13 (guard clauses, not standalone features) |
| 8 | Options page Panel Position dropdown | Task 9 (unchanged) |
| 9 | Update docs | Task 14 (unchanged) |

**Cut entirely**: Task 11 (window resize edge cases -- YAGNI), Task 12 (unit tests for DOM -- write pure logic tests only as part of Task 3)

This reduces from 28 tasks to 9 implementation tasks (+ however many verification cycles you want to run).

---

## Summary

The plan's product vision is good. The main issues are:

1. **Highest risk item (margin injection) is under-investigated** -- needs a spike before committing to the `body` margin approach.
2. **Too many small tasks that should be atomic** -- persistence, live-sync, and minimize behavior are part of implementing dock mode, not separate features.
3. **Duplicate resize logic** -- extend the existing `Resizable` class, don't build a parallel one.
4. **Overlay.ts keeps growing** -- extract `dockable.ts` to keep the main file from becoming unmaintainable.
5. **Minimized strip is scope creep** -- use the existing minimized circle for V1.
