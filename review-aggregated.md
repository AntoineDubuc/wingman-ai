# Aggregated Review: Docked Overlay Mode (Phase 25)

Three reviewers examined the implementation plan: End User, Product Manager, Senior Engineer. Below are all actionable findings, deduplicated and prioritized.

---

## CRITICAL (must fix before implementation)

### C1. Margin injection on `document.body` may not work on Google Meet
- **Sources:** Engineer F3, PM F4
- **Issue:** Google Meet renders inside deeply nested flex containers. Setting `margin` on `body` likely won't shift the video grid. The plan acknowledges the uncertainty but defers investigation to implementation time.
- **Action:** Add a **spike task** (Task 0) before Task 5: open Google Meet in DevTools, inspect the actual layout, and test whether body margin shifts content. If it doesn't, identify the correct CSS target (e.g., Meet's main flex root) or decide to skip margin injection entirely and let the docked panel float over the edge like Grammarly/Notion sidebars.

### C2. Google Meet's own side panels (Chat, People) conflict with dock-right
- **Source:** User F12
- **Issue:** Google Meet has native side panels that open on the right. If Wingman is docked right and the user opens Meet's Chat, both panels fight for the same edge. Not addressed in the plan.
- **Action:** Add investigation to the spike task (C1 above): test with Meet's Chat panel open. Document the behavior and decide how to handle it (recommendation: dock left is the safer default, or auto-detect Meet's panel state).

### C3. Margin cleanup when extension unloads/destroys
- **Source:** PM F2
- **Issue:** If the extension is disabled, crashes, or the user navigates away, the injected body margin stays on the page permanently until refresh.
- **Action:** Add acceptance criteria to Task 5: "Margin is removed in `destroy()`, `hide()`, and `handleExtensionInvalidated()`. If the content script is torn down for any reason, no orphaned margin remains."

### C4. Storage key naming collision (`overlayPosition`)
- **Source:** PM F1
- **Issue:** `STORAGE_KEYS.OVERLAY_POSITION` already stores floating pixel coords. Adding a "Panel Position" dropdown creates naming confusion.
- **Action:** Rename the new setting's label to **"Panel Layout"** (not "Panel Position"). Storage key stays `overlayDockMode` which is already distinct. No rename of the existing key needed.

---

## IMPORTANT (should fix to avoid rework)

### I1. Merge Tasks 7, 8, 10, 13 into earlier tasks
- **Sources:** Engineer F4, F9; PM F5, F15
- **Issue:** These tasks are too granular. Task 8 (persist state) duplicates work in Task 3. Task 10 (live-sync) is 5 lines. Task 13 (LangBuilder compat) is 5-10 guard lines. Task 7 (minimize in docked mode) is CSS + one margin update.
- **Action:** Reduce 14 tasks → 9 tasks:
  - Merge Task 8 into Task 3 (persist dock mode as part of setDockMode)
  - Merge Task 10 into Task 3 (add storage listener alongside loadDockMode, same pattern as loadTheme)
  - Merge Task 13 into Task 3 (guard clauses in setDockMode)
  - Merge Task 7 into Tasks 2+3 (CSS in Task 2, logic in Task 3)
  - Cut Task 11 (window resize edge cases — YAGNI)
  - Simplify Task 12 (pure logic tests only, no DOM)

### I2. Extend Resizable instead of duplicating resize logic
- **Source:** Engineer F1
- **Issue:** Task 4 proposes building new mouse event handlers for dock resize, duplicating what Resizable already does.
- **Action:** Add `widthOnly?: boolean` and `edge?: 'left' | 'right'` options to the existing `Resizable` class (~15 lines). Create a second Resizable instance for the dock edge handle. No duplicate mouse handling.

### I3. Extract dock logic into `dockable.ts`
- **Source:** Engineer F6
- **Issue:** `overlay.ts` is 1663 lines. Adding dock mode will push it past 1800.
- **Action:** Create `src/content/overlay/dockable.ts` (same pattern as `draggable.ts` and `resizable.ts`). It owns: dock mode state, CSS class/attribute application, margin injection, dock resize handle, storage persistence. Overlay passes it the panel element and a margin update callback.

### I4. Simplify minimized-while-docked state (drop the 48px strip)
- **Source:** Engineer F5
- **Issue:** The 48px strip requires new CSS, margin reduction logic, a restore icon, and a visible status indicator. Disproportionate complexity for V1.
- **Action:** For V1, use the same 48px circle for docked mode. Position it at the docked edge. When minimized, remove the page margin entirely (not reduce to 48px). Revisit the strip UI if users request it.

### I5. `forceShow()` must re-apply dock mode
- **Source:** PM F3
- **Issue:** Mentioned in Task 3 notes but not an acceptance criterion. `forceShow()` is called at session start and must re-apply the dock CSS class and margin.
- **Action:** Promote to acceptance criterion in Task 3.

### I6. Define close-while-docked behavior
- **Source:** PM F8
- **Issue:** What happens when user clicks X while docked? Plan doesn't specify.
- **Action:** Decision: closing removes margin but preserves dock mode in storage. Next session starts docked again. Add as acceptance criterion to the margin injection task.

### I7. User-facing labels: "Sidebar Left/Right" instead of "Dock Left/Right"
- **Sources:** PM F13, User F5
- **Issue:** "Dock" is technical jargon. Users may not understand it.
- **Action:** Use "Floating", "Sidebar Left", "Sidebar Right" as dropdown labels. Internal code remains `dock-left`/`dock-right`.

### I8. Header crowding with new button
- **Source:** PM F7
- **Issue:** The header already has 8+ elements. Adding a dock toggle at 280px min width risks cramping.
- **Action:** Replace the layout toggle button with the dock toggle when in docked mode (since side-by-side is disabled when docked anyway). This keeps the button count constant.

### I9. Fill in human time estimates
- **Source:** PM F16
- **Action:** Add estimates to the Progress Dashboard before starting.

---

## MINOR (nice-to-have, can defer)

### M1. No keyboard shortcut for dock toggle
- **Source:** User F1
- **Note:** Out of scope for V1 but should be a fast-follow. Note in Out of Scope.

### M2. No transition animation when switching modes
- **Sources:** User F7, PM F6
- **Note:** Add a `transition: all 200ms ease` to `.overlay-panel` for position/size changes. One CSS line.

### M3. Width persistence across different screen sizes
- **Source:** User F13
- **Note:** Clamp restored width to `Math.min(savedWidth, window.innerWidth - 200)` on load. One line.

### M4. No onboarding for the new feature
- **Source:** User F11
- **Note:** Out of scope for V1. Consider a tooltip on first use as a fast-follow.

### M5. LangBuilder revert is silent
- **Source:** User F9
- **Note:** Add a brief console.log. Toast is optional for V1.

### M6. Use `data-dock` attribute instead of CSS classes
- **Source:** Engineer F2
- **Note:** Slightly cleaner than class toggling. One setter instead of add/remove.

### M7. Drop Task 11 (window resize edge cases)
- **Source:** Engineer F11
- **Note:** YAGNI. Meet is unusable below 600px anyway. Just clamp width on restore.

### M8. Simplify Task 12 to pure logic tests only
- **Source:** Engineer F8, PM F9
- **Note:** Test dock mode validation and margin calculation. Skip DOM/Shadow DOM tests.

### M9. Drag-to-dock as fast-follow
- **Source:** User F10
- **Note:** Already listed as out of scope. Keep it there, note as Phase 25.1.

### M10. Add `aria-label` to dock toggle button
- **Source:** PM F14
- **Note:** Easy addition to the button creation. Include in Task 6.
