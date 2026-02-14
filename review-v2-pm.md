# PM Review v2: Docked Overlay Mode (Phase 25)

**Reviewer:** Product Manager
**Focus:** Acceptance criteria gaps, dependency errors, scope creep risks, naming consistency.

## Findings

### 1. Task 3 missing acceptance criterion: Draggable `isDisabled` integration
- **Category:** Acceptance Criteria
- **Finding:** Task 3 states "disables drag" when docked and Task 2 says "Header cursor changes from grab to default when docked." However, neither Task 2 nor Task 3 includes an acceptance criterion for wiring `Draggable.isDisabled` to return `true` when docked. The existing `Draggable` class already has an `isDisabled` callback option. If this wiring is missed, users will be able to drag the panel out of its docked position while the CSS thinks it's still docked.
- **Severity:** Important
- **Suggestion:** Add to Task 3 acceptance criteria: "Draggable's `isDisabled` callback returns `true` when dock mode is not `'floating'`, preventing drag in docked mode."

### 2. Task 4 width constraints (280px-600px) not defined in Task 1 constants
- **Category:** Naming Consistency
- **Finding:** Task 4 specifies width constraints "between 280px and 600px" but these values are hardcoded in the task description only. Task 1 defines `UI.OVERLAY_DOCKED_DEFAULT_WIDTH` (350) but not `OVERLAY_DOCKED_MIN_WIDTH` (280) or `OVERLAY_DOCKED_MAX_WIDTH` (600). The existing `Resizable` uses `minWidth: 280` from overlay.ts. If the dock resize uses different limits without a shared constant, they'll diverge silently.
- **Severity:** Minor
- **Suggestion:** Either add `UI.OVERLAY_DOCKED_MIN_WIDTH` and `UI.OVERLAY_DOCKED_MAX_WIDTH` to Task 1, or explicitly state in Task 4 that it reuses the existing `minWidth: 280` from overlay and sets `maxWidth: 600` inline. Just be intentional about it.

### 3. Task 5 depends on Task 0 findings but has no fallback acceptance criteria
- **Category:** Acceptance Criteria
- **Finding:** Task 5 says "If the spike found that margin injection doesn't work on Meet, this task adapts to the fallback." But the acceptance criteria are all written assuming margin injection works (e.g., "Docking right adds margin on the correct side"). If the spike recommends the overlay-over-content fallback, Task 5 should be reduced to a no-op or its criteria adjusted. There is no defined decision point or criteria branch.
- **Severity:** Important
- **Suggestion:** Add a conditional acceptance criterion to Task 5: "If Task 0 recommends overlay-over-content (no margin injection), this task is reduced to: remove margin-related callbacks from dockable.ts, update Task 3 to skip margin calls, and mark Task 5 as N/A with a note." This prevents the implementing agent from spending time on Task 5 with unclear requirements.

### 4. Task 3 scope is large after merging 5 original tasks
- **Category:** Scope Creep
- **Finding:** Task 3 now encompasses: dock mode state, data-dock attribute, storage persistence, live-sync from options, minimize behavior in docked mode, LangBuilder compatibility guards, forceShow support, close behavior, and destroy cleanup. It has 15 acceptance criteria and 7 negative tests. The human estimate is 45 minutes, which seems aggressive for a file that needs to coordinate with overlay.ts, content-script.ts, and chrome.storage.
- **Severity:** Minor
- **Suggestion:** Not recommending splitting (the review already consolidated these), but flag this as the task most likely to exceed its estimate. Consider bumping the human estimate to 60 minutes to set realistic expectations.

### 5. Task 6 dock toggle "replaces" layout toggle but no criteria for restoring it
- **Category:** Edge Case
- **Finding:** Task 6 says "In docked mode, dock toggle replaces layout toggle (button count stays constant)." Task 3 says "Show [layout toggle] again when undocking." But Task 6's acceptance criteria don't test the reverse: undocking should restore the layout toggle button. If LangBuilder is configured and the user undocks, the layout toggle must reappear.
- **Severity:** Important
- **Suggestion:** Add to Task 6 acceptance criteria: "Undocking restores the layout toggle button when LangBuilder is configured." Also add negative test: "Layout toggle does not reappear on undock if LangBuilder is not configured."

### 6. Task 7 section module file doesn't match existing naming convention
- **Category:** Naming Consistency
- **Finding:** Task 7 proposes creating `src/options/sections/panel-layout.ts`. Existing section files use feature names: `speaker-filter.ts`, `call-summary.ts`, `drive.ts`, `theme.ts`. The name `panel-layout.ts` is fine and consistent. However, the task says "follows ThemeSection pattern" but doesn't specify the exported class name. Other sections export `SpeakerFilterSection`, `CallSummarySection`, etc.
- **Severity:** Minor
- **Suggestion:** Explicitly state the exported class name: `PanelLayoutSection`. Minor, but prevents the implementing agent from naming it `DockSection` or `LayoutSection`.

### 7. No acceptance criterion for `overlayDockMode` being read during initial overlay load
- **Category:** Acceptance Criteria
- **Finding:** The existing overlay reads `overlayPosition`, `overlayMinimized`, and `overlayFontSize` from storage in a single `chrome.storage.local.get()` call during initialization (line 1551 of overlay.ts). Task 3 says `loadDockMode()` reads `overlayDockMode` and `overlayDockedWidth`. But there's no criterion ensuring these reads happen in the right order relative to the existing initialization. If `loadDockMode()` fires after position restore, the position will be applied and then immediately overridden by dock mode, causing a visual flash.
- **Severity:** Important
- **Suggestion:** Add to Task 3 acceptance criteria: "Dock mode is applied before or during position restore to avoid visual flash (panel should not appear floating then snap to docked)." The simplest implementation: add `overlayDockMode` and `overlayDockedWidth` to the existing `chrome.storage.local.get()` call in overlay's init.

### 8. Task 8 tests reference width clamping but the formula is only in Task 3 description
- **Category:** Dependencies
- **Finding:** Task 8 says to test "Width clamping logic: `Math.min(savedWidth, window.innerWidth - 200)`." This formula lives in Task 3's description but is not exported as a testable pure function. If the implementing agent embeds it as an inline expression inside `Dockable.loadDockMode()`, there's nothing to unit test without importing the class and mocking the DOM.
- **Severity:** Minor
- **Suggestion:** Add a note to Task 3: "Extract width clamping as a pure exported function (e.g., `clampDockedWidth(savedWidth: number, viewportWidth: number): number`) so Task 8 can test it without DOM."

### 9. Task 2 CSS transition `all 200ms` may interfere with drag and resize
- **Category:** Edge Case
- **Finding:** Task 2 specifies `transition: all 200ms ease` on `.overlay-panel` for smooth mode switching. But `all` includes `left`, `top`, `width`, and `height` — the same properties modified during drag and resize. This will make dragging and resizing feel sluggish (200ms lag on every mouse move). The transition should only apply during mode switches, not during continuous interaction.
- **Severity:** Critical
- **Suggestion:** Either: (a) scope the transition to mode switch only by adding/removing a `transitioning` class with a setTimeout to remove it after 200ms, or (b) use specific properties in the transition (`transition: width 200ms ease, left 200ms ease, top 200ms ease, height 200ms ease`) and remove them during active drag/resize via the `isResizing`/`isDragging` flags. Add acceptance criterion to Task 2: "CSS transition does not cause lag during drag or resize operations."

### 10. No acceptance criterion for what happens when user resizes the browser window while docked
- **Category:** Edge Case
- **Finding:** The plan explicitly calls out "Window resize auto-switch" as out of scope, which is fine. But it doesn't address what happens to the docked panel when the browser window is resized narrower than the panel width. If the browser goes to 400px and the panel is 350px, Meet content gets 50px. The width clamp is only applied "on restore" (from storage), not on live window resize.
- **Severity:** Minor
- **Suggestion:** This is correctly out of scope for V1 per the plan's own decision. No action needed, but add a note in Task 3's description: "Live window resize does not trigger width re-clamping in V1. The panel may exceed available space at very narrow widths." This makes the known limitation explicit so nobody files a bug about it later.

## Summary
| Severity | Count |
|----------|-------|
| Critical | 1 |
| Important | 4 |
| Minor | 5 |

**Overall assessment:** The plan is solid and well-structured. The v1 review concerns were addressed thoroughly — task consolidation, spike task, naming, minimized state simplification, and margin cleanup are all properly handled. The one critical finding (CSS transition interfering with drag/resize) is a real bug that will ship if not addressed. The important findings are mostly missing acceptance criteria that could cause subtle issues during implementation. None of these require restructuring the plan.
