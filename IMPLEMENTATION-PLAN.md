# Implementation Plan: Docked Overlay Mode (Phase 25)

---

## Executive Summary

Wingman AI's chat overlay currently floats freely on top of Google Meet, which can obscure video tiles and controls. This phase adds "Sidebar Left" and "Sidebar Right" modes that snap the overlay to the browser edge as a full-height panel, pushing Google Meet's content aside so nothing is hidden. Users choose their preferred mode (Floating, Sidebar Left, Sidebar Right) in the Call Settings tab of the options page, and can also toggle docking live from the overlay header during a call.

**Key Outcomes:**
- Users can dock the Wingman panel to the left or right edge of the browser window
- Google Meet content shifts over automatically so video tiles and controls remain visible
- Dock mode, side, and width persist across sessions
- Floating mode remains the default — zero change for existing users
- Live toggle button in the overlay header lets users switch modes mid-call

---

## Project Configuration

| Variable | Value | Description |
|----------|-------|-------------|
| `{EVIDENCE_ROOT}` | `./evidence/phase-25` | Root directory for all evidence artifacts |
| `{STATIC_ANALYSIS_CMD}` | `npm run typecheck && npm run lint` | Static analysis command(s) for changed files |
| `{DEV_SERVER_CMD}` | `npm run dev` | Command to start the development server |
| `{TEST_CMD}` | `npm test` | Command to run unit/integration tests |
| `{RUNTIME_LOGS_CMD}` | `chrome://extensions/ → Service worker console + F12 on Google Meet tab` | How to capture runtime errors |
| `{BUILD_CMD}` | `npm run build` | Production build command |
| `{VERIFICATION_AGENT}` | `Playwright MCP` | Primary tool for runtime verification |
| `{SCREENSHOT_TOOL}` | `browser_take_screenshot` | Tool used to capture visual evidence |
| `{MAX_RETRIES}` | `3` | Max verification failures before escalating to user |

---

## Product Manager Review

### Feature Overview

This implementation adds dockable panel positioning to the Wingman overlay. Users can anchor the overlay to either side of the browser, turning it into a persistent sidebar that doesn't cover Google Meet content. The existing floating mode remains available for users who prefer it.

### Features

#### Feature 1: Panel Layout Setting

**What it is:** A new "Panel Layout" dropdown in Call Settings that lets users choose Floating, Sidebar Left, or Sidebar Right.

**Why it matters:** Users complain that the floating overlay covers important parts of Google Meet (participant video, chat, controls). Docking eliminates this entirely.

**User perspective:** Open Settings → Call Settings → select "Sidebar Right" from the Panel Layout dropdown. Next time Wingman starts, the panel appears as a full-height sidebar on the right, and Google Meet shifts to make room.

---

#### Feature 2: Docked Panel Layout

**What it is:** When docked, the overlay snaps to the chosen edge at full viewport height, disables drag, restricts resize to width-only, and injects a CSS margin on the Google Meet page to push content over.

**Why it matters:** The panel should feel like a native browser sidebar, not a floating window stuck to the edge. Pushing Meet's content prevents any overlap.

**User perspective:** The panel fills the full height of the browser window on the chosen side. Users can drag the inner edge to adjust width. Google Meet's video grid and controls adjust automatically — nothing is hidden behind the panel.

---

#### Feature 3: Live Dock Toggle

**What it is:** A small dock/undock button in the overlay header that lets users switch between floating and docked modes during a live call without going to Settings.

**Why it matters:** Users may want to dock during a call when the overlay gets in the way, or undock to move it closer to specific content. Going to Settings mid-call is disruptive.

**User perspective:** Click the dock icon in the overlay header → panel snaps to the right edge (or whichever side was last used). Click again → panel returns to floating mode at its previous position. Tooltip shows "Sidebar Right" or "Undock" so you know what will happen before clicking.

---

#### Feature 4: Persistent Dock State

**What it is:** Dock mode, side preference, and docked width are saved to chrome.storage.local and restored on next session.

**Why it matters:** Users shouldn't have to re-dock every time they join a new call.

**User perspective:** Set it once, it stays. Open a new Meet call next week — Wingman is already docked on the right at the width you left it.

---

## Pre-Flight Readiness

> **Complete before starting any implementation task.** All items must be checked.

- [ ] **Dependencies installed** — `npm run build` succeeds without errors
- [ ] **Environment configured** — `.env` has all required variables
- [ ] **Dev server starts** — `npm run dev` launches without errors
- [ ] **Static analysis baseline** — `npm run typecheck && npm run lint` passes (or known issues documented)
- [ ] **Test suite baseline** — `npm test` passes (or known failures documented)
- [ ] **Evidence directory exists** — `./evidence/phase-25/assets/` created
- [ ] **Mock/seed data ready** — N/A (no seed data needed)
- [ ] **Git branch created** — Working on `feature/docked-overlay`

---

## Master Checklist

### Instructions for the Implementing Agent

> **CRITICAL: You must follow these rules exactly.**
>
> 1. **Save at checkpoints.** Update this file at four checkpoints per task: **start time**, **end time/totals**, **verdict**, and **blocker/change** (if any). Do not batch — save immediately at each checkpoint.
>
> 2. **Check the checkbox** when you begin a task. This serves as a visual indicator of which task is currently in progress.
>
> 3. **Workflow for each IMPLEMENTATION task (numbered N):**
>    - Check the checkbox `✅` → Save (start checkpoint)
>    - Write start time → Save
>    - Complete the implementation work
>    - Run `npm run typecheck && npm run lint` on changed files (capture output)
>    - Run `npm test` if applicable (capture output)
>    - Write end time, total time, human estimate, multiplier → Save (end checkpoint)
>    - **Immediately proceed to the paired verification task (Nv)**
>
> 4. **Workflow for each VERIFICATION task (numbered Nv):**
>    - Check the checkbox `✅` → Save (start checkpoint)
>    - Write start time → Save
>    - **Launch verification sub-agents in parallel** (see "Split-Agent Verification" below):
>      - **Agent A (Code Review)** — reads changed files, checks for defects and agentic smells
>      - **Agent B (Static + Tests)** — runs `npm run typecheck && npm run lint` and `npm test`, captures output
>      - **Agent C (Runtime)** — UI/API tasks only: navigates app, screenshots, interaction tests, negative tests
>    - Wait for all agents to complete. Collect their JSON output files from `./evidence/phase-25/assets/`.
>    - **Merge results** into the HTML evidence report (see "Report Merge" below). This is a mechanical step — no judgment, just assembly.
>    - Save report to `./evidence/phase-25/task_NN_report.html`
>    - **Apply verdict:** ALL agents must report PASS for an overall PASS. ANY agent FAIL = overall FAIL.
>    - Update the Evidence column with `[PASS](./evidence/phase-25/task_NN_report.html)` or `[FAIL](./evidence/phase-25/task_NN_report.html)` → Save (verdict checkpoint)
>    - Write end time, total time, human estimate, multiplier → Save
>    - **If FAIL:** Increment the Attempts column. Fix the issue in the implementation task, then launch NEW sub-agents for re-verification (fresh eyes — never reuse the same ones).
>    - **If FAIL and Attempts = 3:** STOP. Update Status to `BLOCKED`. Write the blocker in the task description → Save (blocker checkpoint). Ask the user for guidance before continuing.
>    - **If PASS:** Move to next implementation task.
>
> 5. **Time format:** Use `HH:MM` (24-hour format) for start/end times. Use minutes for total time and estimates.
>
> 6. **Multiplier calculation:** `Multiplier = Human Estimate ÷ Total Time`. Express as `Nx` (e.g., `10x` means 10 times faster than human estimate).
>
> 7. **If blocked:** Note the blocker in the task description section below, set Status to `BLOCKED`, and move to the next unblocked task.

### Progress Dashboard

| Done | # | Task Name | Risk | Start | End | Total (min) | Human Est. (min) | Multiplier | Status | Attempts | Evidence | Blocker |
|:----:|:-:|-----------|:----:|:-----:|:---:|:-----------:|:----------------:|:----------:|:------:|:--------:|:--------:|:-------:|
| ⬜ | 0 | Implement: Spike — investigate Google Meet layout for margin injection | H | | | | 30 | | pending | — | — | |
| ⬜ | 0v | Verify: Spike — investigate Google Meet layout for margin injection | | | | | 10 | | pending | 0 | | |
| ⬜ | 1 | Implement: Add dock mode constants and storage keys | L | | | | 15 | | pending | — | — | |
| ⬜ | 1v | Verify: Add dock mode constants and storage keys | | | | | 5 | | pending | 0 | | |
| ⬜ | 2 | Implement: Add docked CSS rules to overlay.css | M | | | | 30 | | pending | — | — | |
| ⬜ | 2v | Verify: Add docked CSS rules to overlay.css | | | | | 10 | | pending | 0 | | |
| ⬜ | 3 | Implement: Create dockable.ts — dock mode state, persist, live-sync, guards | M | | | | 60 | | pending | — | — | |
| ⬜ | 3v | Verify: Create dockable.ts — dock mode state, persist, live-sync, guards | | | | | 15 | | pending | 0 | | |
| ⬜ | 4 | Implement: Extend Resizable for width-only dock resize | M | | | | 30 | | pending | — | — | |
| ⬜ | 4v | Verify: Extend Resizable for width-only dock resize | | | | | 10 | | pending | 0 | | |
| ⬜ | 5 | Implement: Inject page margin when docked | H | | | | 45 | | pending | — | — | |
| ⬜ | 5v | Verify: Inject page margin when docked | | | | | 15 | | pending | 0 | | |
| ⬜ | 6 | Implement: Add dock toggle button to overlay header | M | | | | 30 | | pending | — | — | |
| ⬜ | 6v | Verify: Add dock toggle button to overlay header | | | | | 10 | | pending | 0 | | |
| ⬜ | 7 | Implement: Add Panel Layout setting to options page | M | | | | 30 | | pending | — | — | |
| ⬜ | 7v | Verify: Add Panel Layout setting to options page | | | | | 10 | | pending | 0 | | |
| ⬜ | 8 | Implement: Unit tests for dock mode pure logic | M | | | | 30 | | pending | — | — | |
| ⬜ | 8v | Verify: Unit tests for dock mode pure logic | | | | | 10 | | pending | 0 | | |
| ⬜ | 9 | Implement: Update CLAUDE.md and tutorial docs | L | | | | 20 | | pending | — | — | |
| ⬜ | 9v | Verify: Update CLAUDE.md and tutorial docs | | | | | 5 | | pending | 0 | | |

> **Risk levels:** L = Low (boilerplate, config), M = Medium (feature work, standard logic), H = High (complex logic, shared state, security-sensitive)

> **Status values:** `pending` | `in_progress` | `passed` | `failed` | `blocked`

> **Note:** Task 7 (options page) can be parallelized with Tasks 2–6 since it only depends on Task 1.

**Summary:**
- Total tasks: 10 (implementation) + 10 (verification) = 20 total
- Completed: 0
- Passed verification: 0 / 10
- Failed then passed: 0
- Blocked: 0
- Total time spent: 0 minutes
- Total human estimate: 320 minutes (implementation) + 100 minutes (verification) = 420 minutes
- Overall multiplier: --

---

## Evidence Generation Protocol

### Overview

Every implementation task is paired with a verification task that produces a **self-contained HTML evidence report**. The PM can open this file in any browser to review proof that the feature works correctly.

### Evidence Directory

```
./evidence/phase-25/
├── assets/                  ← screenshots and large artifacts (linked, not embedded)
│   ├── task_01_screen.png
│   ├── task_01_after.png
│   ├── task_02_response.json
│   └── ...
├── task_00_report.html      ← individual task reports
├── task_01_report.html
├── ...
├── task_09_report.html
└── summary.html             ← rollup of all task verdicts
```

> **Screenshots and large artifacts go in `assets/` and are linked from reports — never base64-embedded.** This keeps reports lightweight and evidence independently reviewable.

### Evidence Types by Task Category

| Task Category | Required Evidence |
|---------------|-------------------|
| **Spike/Investigation** | DevTools screenshots, findings document, decision recorded |
| **UI (new screen/component)** | `npm run typecheck && npm run lint` output, screenshot(s), runtime logs, interaction test (click/type/navigate) |
| **UI (modified screen/component)** | `npm run typecheck && npm run lint` output, before/after screenshots, interaction test |
| **Wiring (state/routing/DI)** | `npm run typecheck && npm run lint` output, navigation proof (screenshot of reached screen), error log |
| **Config/Constants** | `npm run typecheck && npm run lint` output, `npm test` output |

### HTML Report Template

Each `task_NN_report.html` follows this structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Evidence Report — Task [N]: [Task Name]</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 960px; margin: 0 auto; padding: 24px; color: #1a1a1a; background: #fafafa; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    h2 { font-size: 18px; margin: 24px 0 12px; border-bottom: 1px solid #e0e0e0; padding-bottom: 6px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-weight: 700; font-size: 14px; margin-left: 12px; }
    .pass { background: #d4edda; color: #155724; }
    .fail { background: #f8d7da; color: #721c24; }
    .meta { color: #666; font-size: 14px; margin-bottom: 24px; }
    .section { background: white; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .screenshot { max-width: 100%; border: 1px solid #ccc; border-radius: 4px; margin: 8px 0; }
    .log { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 4px; font-family: 'SF Mono', Monaco, monospace; font-size: 13px; overflow-x: auto; white-space: pre-wrap; }
    .checklist { list-style: none; }
    .checklist li { padding: 4px 0; }
    .checklist li::before { content: ''; display: inline-block; width: 16px; height: 16px; margin-right: 8px; border: 2px solid #ccc; border-radius: 3px; vertical-align: middle; }
    .checklist li.pass::before { background: #28a745; border-color: #28a745; content: '\2713'; color: white; text-align: center; line-height: 16px; font-size: 12px; }
    .checklist li.fail::before { background: #dc3545; border-color: #dc3545; content: '\2717'; color: white; text-align: center; line-height: 16px; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Task [N]: [Task Name] <span class="badge [pass|fail]">[PASS|FAIL]</span></h1>
  <p class="meta">Generated: [YYYY-MM-DD HH:MM] | Duration: [X] min | Attempt: [N] of 3 | Phase: Docked Overlay</p>
  <!-- sections follow template -->
</body>
</html>
```

### Summary Report

After all tasks complete, generate `./evidence/phase-25/summary.html` — a rollup page with aggregate stats.

---

### Split-Agent Verification

> **CRITICAL: Verification must be performed by SEPARATE sub-agents, NOT by the agent that wrote the code.**

See the v3 template for full Agent A/B/C protocols. Apply them as documented.

---

## Task Descriptions

This section provides context for each task. Read the relevant description before starting implementation.

---

### Task 0: Spike — Investigate Google Meet layout for margin injection

**Risk:** H

**Intent:** Before committing to any margin injection approach, investigate Google Meet's actual DOM layout to determine whether setting margin on `document.body` will shift the video grid, or whether a different CSS target is needed.

**Context:** This is a prerequisite for Task 5 (margin injection). The plan originally assumed `document.body.style.marginLeft` would push Meet content aside, but Meet renders inside deeply nested flex containers. Setting margin on body may not move the video grid at all. This spike must answer that question before implementation begins.

**Expected behavior:**
- Open Google Meet in DevTools and inspect the layout hierarchy from `<body>` down to the video grid
- Test `document.body.style.marginRight = '350px'` in the console and observe the result
- Test the same with `document.documentElement.style.marginRight = '350px'`
- If neither works, identify the correct CSS target (e.g., Meet's main flex root container)
- Also test with Meet's **Chat panel open** (right side) to check for conflicts with dock-right mode
- Also test with Meet's **People panel open** (right side)
- Document findings: which CSS property on which element successfully shifts Meet's content

**Key components:**
- No code changes — this is a research task
- Output: findings document saved to `./evidence/phase-25/assets/task_00_spike_findings.md`

**Acceptance criteria:**
- [ ] Documented which DOM element + CSS property shifts Google Meet content
- [ ] Tested with Meet's Chat panel open — documented any conflicts
- [ ] Tested with Meet's People panel open — documented any conflicts
- [ ] Recommendation: use margin injection OR accept overlay-over-content (like Grammarly/Notion sidebars)
- [ ] If margin injection works, documented the exact CSS selector/property to use
- [ ] If margin injection doesn't work, noted this in Task 5 so implementation can adapt

**Evidence requirements:**
- [ ] DevTools screenshots showing Meet's layout hierarchy
- [ ] Console screenshots showing margin test results
- [ ] Screenshots with Meet's Chat panel open + docked overlay

**Notes:** If `body` margin doesn't work on Meet's flex layout, the fallback is to let the docked panel float over the page edge (like Grammarly, Notion, and most sidebar extensions do). This would eliminate Task 5 entirely and reduce the highest-risk work. The spike should take a clear recommendation.

---

### Task 1: Add dock mode constants and storage keys

**Risk:** L

**Intent:** Define the `DockMode` type and storage keys so all other tasks can reference a single source of truth for dock state.

**Context:** This is a foundation task with no dependencies. Tasks 2–9 all depend on these definitions.

**Expected behavior:** A new `DockMode` type (`'floating' | 'dock-left' | 'dock-right'`) is exported from `constants.ts`. A new storage key `OVERLAY_DOCK_MODE` is added to the `STORAGE_KEYS` object. A new `OVERLAY_DOCKED_WIDTH` storage key is also added for persisting width in docked mode. Default docked width constant added to `UI` (350px). A dock icon SVG is added to `ICONS`.

**Key components:**
- `src/shared/constants.ts` — add type, storage keys, default width constant, dock icon SVG

**Acceptance criteria:**
- [ ] `DockMode` type exported from `constants.ts`
- [ ] `STORAGE_KEYS.OVERLAY_DOCK_MODE` exists with value `'overlayDockMode'`
- [ ] `STORAGE_KEYS.OVERLAY_DOCKED_WIDTH` exists with value `'overlayDockedWidth'`
- [ ] `UI.OVERLAY_DOCKED_DEFAULT_WIDTH` exists with value `350`
- [ ] `UI.OVERLAY_DOCKED_MIN_WIDTH` exists with value `280`
- [ ] `UI.OVERLAY_DOCKED_MAX_WIDTH` exists with value `600`
- [ ] Dock icon SVG added to `ICONS`
- [ ] TypeScript compiles with no errors

**Negative tests:**
- [ ] Existing constants are not modified or broken
- [ ] No unused imports introduced

**Evidence requirements:**
- [ ] `npm run typecheck` output with 0 errors
- [ ] `npm test` passes (no regressions)

**Documentation impact:** None

**Rollback plan:** Revert changes to `src/shared/constants.ts`

**Notes:** Two storage keys are sufficient: `overlayDockMode` and `overlayDockedWidth`. No `lastDockSide` key needed — derive it from `overlayDockMode` (default to `'dock-right'` on first use). The existing `overlayPosition` key continues to store floating pixel coords — no rename needed since the new setting is labeled "Panel Layout" (not "Panel Position"), avoiding confusion.

---

### Task 2: Add docked CSS rules to overlay.css

**Risk:** M

**Intent:** Create the CSS rules that transform the overlay panel into a full-height docked sidebar when the `data-dock` attribute is set.

**Context:** Depends on Task 1 for the dock mode concept. Tasks 3–6 depend on these CSS rules being available.

**Expected behavior:** CSS attribute selectors are added to `overlay.css`:
- `.overlay-panel[data-dock="left"]`: `position: fixed; left: 0; top: 0; height: 100vh; width: 350px; border-radius: 0 12px 12px 0; resize: none;` — removes right/top defaults, removes box-shadow on docked edge
- `.overlay-panel[data-dock="right"]`: `position: fixed; right: 0; top: 0; height: 100vh; width: 350px; border-radius: 12px 0 0 12px; resize: none;` — same concept, mirrored
- Both: hide the default `.resize-handle` (corner), set `max-height: 100vh`, override default positioning
- Header cursor changes from `grab` to `default` when docked (no dragging)
- **Transition for smooth mode switching** — merge with existing transitions. Use specific properties that **exclude `width`** to avoid rubbery resize: `transition: left 200ms ease, right 200ms ease, top 200ms ease, height 200ms ease, border-radius 200ms ease, box-shadow 200ms ease, background 200ms ease`. Do NOT use `transition: all` — it causes 200ms lag on every drag/resize mouse move.
- Docked + minimized: uses the **same 48px circle** as floating mode, positioned at the top of the docked edge (`top: 0` + `right: 0` or `left: 0`). No special strip UI.

**Key components:**
- `src/content/overlay/overlay.css` — new `[data-dock]` attribute selectors, dock resize handle styles

**Acceptance criteria:**
- [ ] `.overlay-panel[data-dock="left"]` positions panel at left edge, full height
- [ ] `.overlay-panel[data-dock="right"]` positions panel at right edge, full height
- [ ] Docked panel has rounded corners only on the inner edge (away from browser edge)
- [ ] Header shows `cursor: default` when docked (no grab cursor)
- [ ] Default `.resize-handle` is hidden when docked
- [ ] Docked + minimized uses the same 48px circle, positioned at the docked edge
- [ ] Dark mode variables still apply correctly when docked
- [ ] Mode transition is smooth (200ms CSS transition on specific properties)
- [ ] CSS transition does NOT cause lag during drag or resize operations

**Negative tests:**
- [ ] Floating mode CSS is unchanged — no regressions
- [ ] Minimized circle mode still works in floating mode
- [ ] Existing `transition: box-shadow, background` is preserved (merged, not overwritten)

**Evidence requirements:**
- [ ] `npm run typecheck` output with 0 errors
- [ ] Screenshot showing docked left panel (can be simulated by manually applying `data-dock` in devtools)

**Documentation impact:** None

**Rollback plan:** Revert changes to `overlay.css`

**Notes:** Using `data-dock` attribute (`.overlay-panel[data-dock="left"]`) instead of CSS classes. This is cleaner than class toggling — one `dataset.dock` setter replaces add/remove class. The attribute also serves as a readable state indicator in DevTools. The dock resize handle style (`.dock-resize-handle`) is a vertical strip on the inner edge with `cursor: ew-resize`.

---

### Task 3: Create dockable.ts — dock mode state, persist, live-sync, guards

**Risk:** M

**Intent:** Extract all dock mode logic into a new `dockable.ts` module (same pattern as `draggable.ts` and `resizable.ts`). This module owns: dock mode state, `data-dock` attribute application, storage persistence, live-sync from options, minimize behavior in docked mode, and LangBuilder compatibility guards.

**Context:** Depends on Tasks 1 (constants) and 2 (CSS rules). This is the core dock mode logic, kept in its own file to avoid growing `overlay.ts` (already 1663 lines). Merges the scope of original Tasks 3, 7, 8, 10, and 13 from the pre-review plan.

**Expected behavior:**
- New file `src/content/overlay/dockable.ts` exports a `Dockable` class
- Constructor takes a **config object** (matching `DraggableOptions`/`ResizableOptions` pattern):
  ```ts
  interface DockableOptions {
    panel: HTMLElement;
    onRestorePosition: () => void;
    onLayoutModeReset: () => void;
    onDockChange?: (mode: DockMode) => void;
  }
  ```
- **Single storage read** (CRITICAL): dock mode and docked width must be read in the **same** `chrome.storage.local.get()` call as the existing position/minimized/fontSize restore. This eliminates the race condition where `restorePosition()` and `loadDockMode()` resolve in unpredictable order. In `overlay.ts`, combine these into one call: `chrome.storage.local.get(['overlayPosition', 'overlayMinimized', 'overlayFontSize', 'overlayDockMode', 'overlayDockedWidth'])`, then apply either dock or floating based on the result.
- `setDockMode(mode: DockMode)`: applies/removes `data-dock` on the panel element. **When docking, must clear ALL conflicting inline styles**: `left`, `top`, `right`, `width`, `height`, `maxWidth` — because inline styles beat `[data-dock]` attribute selectors in CSS specificity. Calls `restorePosition()` callback when undocking.
- **Guards in `restorePosition()` and `savePosition()`**: skip when docked. `if (this.dockable?.isDocked()) return;` prevents restoring floating coords over dock CSS and prevents saving dock coords as the floating position.
- Saves dock mode and width to storage on change (same try/catch pattern as `savePosition()`)
- Listens to `chrome.storage.onChanged` for `overlayDockMode` changes. **Do NOT copy `loadTheme()`'s pattern** — it leaks listeners (never removes them in `destroy()`). Instead: save the listener reference as a named function, remove it in `destroy()` via `chrome.storage.onChanged.removeListener()`.
- **Pure exported functions** for testability: `parseDockMode(value: unknown): DockMode` (validates storage values, falls back to `'floating'`) and `clampDockedWidth(width: number, viewportWidth: number): number` (returns `Math.min(width, viewportWidth - 200)`, clamped to min/max).
- **Minimize in docked mode**: uses the same 48px circle as floating mode, positioned at the docked edge. When minimized, removes page margin entirely. When restored, re-applies full margin.
- **LangBuilder guard**: when docking, if side-by-side mode is active, revert to single-panel. Clear `maxWidth` inline style from `setLayoutMode('single')` before applying dock CSS. Show a brief toast: "Side-by-side view not available in sidebar mode." Hide the layout toggle button when docked. Show it again when undocking.
- **`forceShow()` support**: provides a `reapply()` method that re-applies dock CSS and margin when called at session start. Must be called **after** `panel.style.display = 'flex'`.
- **Close behavior**: closing the overlay while docked removes the page margin but preserves dock mode in storage. Next session starts docked again.
- **Dockable owns the dock Resizable instance**: creates, shows/hides, and destroys the dock resize handle. Overlay's existing corner Resizable stays untouched.
- `destroy()`: removes storage listener, destroys dock Resizable, cleans up state
- **Known limitation (V1):** live window resize does not trigger width re-clamping. The panel may exceed available space at very narrow widths.

**Key components:**
- `src/content/overlay/dockable.ts` — new file (Dockable class, DockableOptions interface, `parseDockMode()`, `clampDockedWidth()`)
- `src/content/overlay.ts` — create Dockable instance in constructor, combine storage reads into single `chrome.storage.local.get()`, add guards in `restorePosition()`/`savePosition()`, call `dockable.reapply()` in `forceShow()`, call `dockable.destroy()` in `destroy()`

**Acceptance criteria:**
- [ ] `dockable.ts` is a standalone module following the `draggable.ts` / `resizable.ts` pattern
- [ ] Constructor takes a `DockableOptions` config object (not positional args)
- [ ] Dock mode and docked width are read in the same `chrome.storage.local.get()` call as position/minimized/fontSize (single storage read, no race condition)
- [ ] `setDockMode('dock-right')` sets `data-dock="right"` and clears ALL inline styles (`left`, `top`, `right`, `width`, `height`, `maxWidth`)
- [ ] `setDockMode('dock-left')` sets `data-dock="left"` and clears ALL inline styles
- [ ] `setDockMode('floating')` removes `data-dock` attribute and restores saved floating position
- [ ] `restorePosition()` skips when docked (`if dockable.isDocked() return`)
- [ ] `savePosition()` skips when docked (don't corrupt floating coords)
- [ ] Draggable's `isDisabled` callback returns `true` when dock mode is not `'floating'`
- [ ] Dock mode change does not clear the timeline or reset session state
- [ ] Dock mode persists across page reloads
- [ ] Docked width persists across page reloads
- [ ] Changing dock mode in Settings immediately updates the overlay on the Meet tab (live-sync)
- [ ] Storage listener reference is saved and removed in `destroy()`
- [ ] `forceShow()` re-applies the current dock mode CSS and margin at session start (called after `display: flex`)
- [ ] Closing the overlay while docked removes margin but preserves dock mode in storage
- [ ] Side-by-side layout auto-reverts to single-panel when docking, with user-visible toast
- [ ] Layout toggle button is hidden when docked, shown when undocking
- [ ] Minimizing in docked mode uses the same 48px circle, positioned at docked edge
- [ ] Minimizing in docked mode removes page margin entirely
- [ ] Restoring from minimized re-applies full page margin
- [ ] `parseDockMode()` and `clampDockedWidth()` are exported as pure functions
- [ ] Dockable owns and manages the dock Resizable instance lifecycle

**Negative tests:**
- [ ] If storage has no `overlayDockMode` key, defaults to `'floating'`
- [ ] Invalid storage value (e.g., `'dock-top'`) is treated as `'floating'` via `parseDockMode()`
- [ ] Corrupted width values are clamped to min/max range via `clampDockedWidth()`
- [ ] Fresh install (no storage) defaults to floating mode
- [ ] Docking without LangBuilder configured doesn't throw errors
- [ ] Rapid dock mode toggles don't crash
- [ ] Storage listener doesn't fire for unrelated storage changes
- [ ] Panel does not flash from floating to docked on init (no FOUC from race condition)

**Evidence requirements:**
- [ ] `npm run typecheck` output with 0 errors
- [ ] Screenshot showing panel docked right
- [ ] Screenshot showing live-sync when changing dock mode in Settings

**Documentation impact:** None

**Rollback plan:** Delete `src/content/overlay/dockable.ts`, revert changes to `overlay.ts`

**Notes:** The Dockable class should be lightweight — it doesn't own the panel element, just decorates it. Overlay passes callbacks for: margin injection, layout mode reset, and position restore. This keeps the dependency direction clean (overlay → dockable, never the reverse).

---

### Task 4: Extend Resizable for width-only dock resize

**Risk:** M

**Intent:** Add `widthOnly` and `edge` options to the existing `Resizable` class so it can handle dock resize without duplicating mouse event handling.

**Context:** Depends on Task 3 (dock mode state). The existing `Resizable` class already supports `isDisabled`, dynamic `maxWidth`/`maxHeight`, and `onResizeEnd`. It only needs two new options: `widthOnly` to skip height adjustment, and `edge` to control which side the handle appears on and invert deltaX calculation.

**Expected behavior:**
- `Resizable` gains a `widthOnly?: boolean` option — when true, `onMouseMove` skips height adjustment entirely
- `Resizable` gains an `edge?: 'right' | 'left'` option — when `'left'`, deltaX is inverted in `onMouseMove`: `const dx = edge === 'left' ? -deltaX : deltaX`
- **Cursor handling**: when `widthOnly` is true, `onMouseDown` and `onMouseUp` set cursor to `ew-resize` instead of `nwse-resize`. The existing Resizable code sets cursor inline on these events — the `widthOnly` flag must control which cursor is used.
- Dockable creates and owns the dock Resizable instance (see Task 3). Overlay does not manage it.
- The dock Resizable instance is shown when docked, hidden when floating
- The original corner Resizable continues to work in floating mode
- On dock resize end, width is saved to `overlayDockedWidth` storage via the Dockable class
- Note: position adjustment is NOT needed for docked panels — CSS `right: 0` (dock-right) and `left: 0` (dock-left) handle growth direction naturally.

**Key components:**
- `src/content/overlay/resizable.ts` — add `widthOnly` and `edge` options (~15 lines)

**Acceptance criteria:**
- [ ] `Resizable` class supports `widthOnly: true` option (skips height in onMouseMove)
- [ ] `Resizable` class supports `edge: 'left' | 'right'` option (inverts deltaX for left edge)
- [ ] When `widthOnly` is true, cursor is `ew-resize` (not `nwse-resize`) in onMouseDown/onMouseUp
- [ ] A dock resize handle appears on the inner edge of the docked panel
- [ ] Dragging the dock resize handle adjusts panel width only (height stays at 100vh)
- [ ] Width is constrained between 280px and 600px
- [ ] On resize end, width is saved to storage

**Negative tests:**
- [ ] Floating mode drag and resize behavior is completely unchanged
- [ ] Dock resize handle is hidden when in floating mode
- [ ] Corner resize handle is hidden when docked
- [ ] Corner Resizable still uses `nwse-resize` cursor (not affected by new options)

**Evidence requirements:**
- [ ] `npm run typecheck` output with 0 errors
- [ ] Screenshot showing dock resize handle visible on inner edge

**Documentation impact:** None

**Rollback plan:** Revert changes to `resizable.ts` and `overlay.ts`

**Notes:** This is ~15 lines added to Resizable vs. ~60+ lines of duplicate mouse handling. The `edge` option also controls handle positioning: `edge: 'left'` means the handle appears on the left side of the panel (for dock-right mode, where the user resizes from the left edge).

---

### Task 5: Inject page margin when docked

**Risk:** H

**Intent:** When the overlay is docked, inject a CSS margin on Google Meet's page content so video tiles and controls shift over and nothing is hidden behind the panel.

**Context:** Depends on Tasks 0 (spike findings) and 3 (dock mode state). The spike will determine the exact CSS target. This task implements whatever approach the spike recommends. If the spike found that margin injection doesn't work on Meet's layout, this task adapts to the fallback (overlay-over-content).

**Expected behavior:**
- Based on spike findings: inject margin on the correct DOM element using the correct CSS property
- **If Task 0 recommends no margin injection (overlay-over-content fallback):** this task is reduced to removing margin callbacks from Dockable and marking as N/A. Update Task 3 to skip margin calls. Document the decision.
- When dock mode is set, the margin is applied
- When panel width changes (resize), the margin is updated in real-time
- When dock mode is set to `floating`, the overlay is hidden, or the overlay is closed: margin is removed
- When minimized in docked mode: margin is removed entirely (not reduced to 48px)
- When restored from minimized: margin is re-applied at full width
- **`removeDockMargin()` must be idempotent** — track a `marginApplied` boolean. Multiple calls become harmless no-ops. This prevents double-removal issues when multiple exit paths fire in sequence (e.g., `hide()` then `destroy()`).
- **Margin cleanup on all exit paths:**
  - `destroy()` — removes margin
  - `hide()` — removes margin
  - `handleExtensionInvalidated()` in `content-script.ts` — removes margin
  - If the extension is disabled/uninstalled — margin removed via destroy path
- Margin injection only occurs when the overlay is visible on a Google Meet page

**Key components:**
- `src/content/overlay/margin-injector.ts` — new standalone module with `injectDockMargin(side, width)` and `removeDockMargin()`. Both `content-script.ts` and `dockable.ts` import directly — avoids a 3-level callback chain. Since both run in the content script context (same `document`), direct imports work fine.
- `src/content/content-script.ts` — import `removeDockMargin` from margin-injector; call in `handleExtensionInvalidated()`
- `src/content/overlay/dockable.ts` — import margin functions directly from margin-injector

**Acceptance criteria:**
- [ ] Docking right adds margin on the correct side of the page content (per spike findings)
- [ ] Docking left adds margin on the correct side
- [ ] Resizing the docked panel updates the margin in real-time
- [ ] Switching to floating mode removes the margin completely
- [ ] Minimizing the docked panel removes the margin entirely
- [ ] Restoring from minimized re-applies the full margin
- [ ] Margin is removed in `destroy()`
- [ ] Margin is removed in `hide()`
- [ ] Margin is removed in `handleExtensionInvalidated()`
- [ ] No orphaned margin remains if the extension is disabled or crashes
- [ ] Closing the overlay while docked removes the margin

**Negative tests:**
- [ ] No margin injection in floating mode
- [ ] Multiple dock mode switches don't create duplicate style tags or orphaned margins
- [ ] Margin injection only fires on Google Meet pages

**Evidence requirements:**
- [ ] `npm run typecheck` output with 0 errors
- [ ] Screenshot showing Google Meet content shifted with margin applied
- [ ] Screenshot showing margin removed after undocking
- [ ] Screenshot showing no margin when minimized

**Documentation impact:** None

**Rollback plan:** Delete `margin-injector.ts`, revert changes to `content-script.ts` and `dockable.ts`

**Notes:** If the spike (Task 0) found that body margin doesn't work on Meet, this task implements the alternative (e.g., targeting a specific Meet container, or accepting overlay-over-content). The spike findings document should specify exactly what to do here. The standalone `margin-injector.ts` module keeps margin logic isolated and importable from both content-script and dockable without callback chains.

---

### Task 6: Add dock toggle button to overlay header

**Risk:** M

**Intent:** Add a button to the overlay header that lets users toggle between docked and floating modes during a live call.

**Context:** Depends on Tasks 3 (dockable) and 5 (margin injection). This provides the in-call UX for switching modes without going to Settings.

**Expected behavior:**
- A new button is added to the header controls area
- **When in docked mode**: the dock toggle button **replaces** the layout toggle button (since side-by-side is disabled when docked). This keeps the header button count constant.
- **When in floating mode**: the layout toggle is shown as before; the dock toggle is added nearby
- Toggle behavior: simple `floating ↔ last-used-side` (default `dock-right`). No cycling through three states.
- Tooltip shows actionable text: "Sidebar Right", "Sidebar Left", or "Undock" — so the user knows what will happen before clicking
- Button has `aria-label` attribute for accessibility
- Icon: a simple sidebar icon (two vertical rectangles, one highlighted) — distinct from the layout toggle

**Key components:**
- `src/content/overlay.ts` — add button element in `createOverlayStructure()`, wire click to `dockable.setDockMode()`
- `src/content/overlay/overlay.css` — button styling (consistent with existing header buttons)
- `src/shared/constants.ts` — dock icon SVG already added in Task 1

**Acceptance criteria:**
- [ ] Dock toggle button visible in overlay header
- [ ] Clicking toggles between floating and last-used docked side
- [ ] Button tooltip shows "Sidebar Right", "Sidebar Left", or "Undock"
- [ ] Icon visually indicates current dock state
- [ ] Button has `aria-label` attribute
- [ ] Button style matches existing header controls (transparent bg, white color, hover effect)
- [ ] In docked mode, dock toggle replaces layout toggle (button count stays constant)
- [ ] In floating mode, layout toggle is visible as normal
- [ ] Undocking restores the layout toggle button when LangBuilder is configured

**Negative tests:**
- [ ] Button click does not interfere with drag (event propagation stopped)
- [ ] Rapid clicking doesn't cause inconsistent state
- [ ] Button works at 280px minimum panel width without crowding
- [ ] Layout toggle does NOT reappear on undock if LangBuilder is not configured

**Evidence requirements:**
- [ ] Screenshot showing dock button in header (floating mode)
- [ ] Screenshot showing dock button in header (docked mode, replacing layout toggle)
- [ ] Screenshot showing panel after clicking dock button

**Documentation impact:** None

**Rollback plan:** Revert changes to `overlay.ts`, `overlay.css`

**Notes:** The toggle stores the last-used dock side in a property (defaulting to `dock-right`). When the user clicks "Undock", it goes to floating. When they click again, it goes back to the last side they docked to.

---

### Task 7: Add Panel Layout setting to options page

**Risk:** M

**Intent:** Add a "Panel Layout" dropdown to the Call Settings tab so users can set their preferred dock mode from Settings.

**Context:** Depends on Task 1 (storage key). Independent of Tasks 2–6 (can be parallelized). This is a UI-only settings task.

**Expected behavior:**
- A new "Panel Layout" card is added to the Call Settings tab (`panel-calls`), positioned after "Speaker Filter"
- Contains a `<select>` dropdown with three options: **Floating** (default), **Sidebar Left**, **Sidebar Right**
- Internal values remain `'floating'`, `'dock-left'`, `'dock-right'` — user-facing labels use "Sidebar" instead of "Dock"
- Below the dropdown, a brief description: "Controls where the Wingman panel appears during calls. Sidebar modes attach the panel to the browser edge."
- On change, saves `overlayDockMode` to `chrome.storage.local`
- On page load, reads and displays the current saved value

**Key components:**
- `src/options/options.html` — add the Panel Layout card HTML inside `panel-calls`
- `src/options/sections/panel-layout.ts` — new section module (follows `ThemeSection` pattern)
- `src/options/options.ts` — initialize the new section

**Acceptance criteria:**
- [ ] "Panel Layout" card visible in Call Settings tab
- [ ] Dropdown shows Floating, Sidebar Left, Sidebar Right
- [ ] Selecting a value saves it to storage immediately
- [ ] Page load restores the saved selection
- [ ] Card styling matches existing cards (consistent `options-card` class)

**Negative tests:**
- [ ] If storage read fails, dropdown defaults to "Floating"
- [ ] Dropdown doesn't break the existing Call Settings layout

**Evidence requirements:**
- [ ] Screenshot of the new Panel Layout card in Call Settings
- [ ] `npm run typecheck` output with 0 errors

**Documentation impact:** None

**Rollback plan:** Revert changes to `options.html`, delete `panel-layout.ts`, revert `options.ts`

**Notes:** Follow the `ThemeSection` pattern — a single class with `init()` and `load()`. Export as `PanelLayoutSection` (matching the naming convention: `SpeakerFilterSection`, `CallSummarySection`, etc.). User-facing labels are "Floating", "Sidebar Left", "Sidebar Right" to avoid the technical jargon of "Dock".

---

### Task 8: Unit tests for dock mode pure logic

**Risk:** M

**Intent:** Add unit tests covering dock mode validation and margin calculation — pure logic only, no DOM.

**Context:** Depends on Tasks 1 and 3. Tests use the existing Vitest + fake-browser setup.

**Expected behavior:**
- Tests verify the **pure exported functions** from `dockable.ts` (no Shadow DOM, no real element creation):
  - `parseDockMode(value)`: returns `'floating'` for `undefined`, `null`, `123`, `'dock-top'`, `''`; returns the value for `'floating'`, `'dock-left'`, `'dock-right'`
  - `clampDockedWidth(width, viewportWidth)`: returns `Math.min(width, viewportWidth - 200)`, clamped to `[280, 600]`; handles edge cases (0, negative, NaN, Infinity)
  - Derive last dock side: `'dock-left'` → `'left'`, `'dock-right'` → `'right'`, `'floating'` → defaults to `'right'`
- Do NOT test `chrome.storage` round-trips — low ROI, tests Chrome's API not our logic
- Skip DOM/Shadow DOM tests — those are verified by runtime screenshots in the verification tasks

**Key components:**
- `tests/dock-mode.test.ts` — new test file

**Acceptance criteria:**
- [ ] All new tests pass
- [ ] Existing tests still pass (no regressions)
- [ ] Tests cover all three dock modes
- [ ] Tests cover invalid input handling
- [ ] Tests cover storage read/write

**Negative tests:**
- [ ] Tests verify that invalid values fall back to floating

**Evidence requirements:**
- [ ] `npm test` output showing all tests passing

**Documentation impact:** None

**Rollback plan:** Delete `tests/dock-mode.test.ts`

**Notes:** Do NOT test Shadow DOM behavior — the overlay creates a closed Shadow DOM which JSDOM doesn't fully support. Testing DOM assertions would be brittle and test implementation details. The real UI verification is done by the screenshot-based verification tasks.

---

### Task 9: Update CLAUDE.md and tutorial docs

**Risk:** L

**Intent:** Document the new dock mode feature in CLAUDE.md and update relevant tutorial pages.

**Context:** Depends on all other tasks being complete. This is the final documentation task.

**Expected behavior:**
- `CLAUDE.md` Architecture section: add dock mode to the overlay description
- `CLAUDE.md` Key Components: add `dockable.ts` and `margin-injector.ts` to the overlay section
- `CLAUDE.md` Critical Conventions: add a "Dock mode and margin injection" section explaining how the page margin is managed
- Tutorial: update `src/tutorials/call-settings.html` to mention the Panel Layout setting

**Key components:**
- `CLAUDE.md` — update architecture, key components, and conventions sections
- `src/tutorials/call-settings.html` — add Panel Layout section

**Acceptance criteria:**
- [ ] CLAUDE.md documents dock mode behavior
- [ ] CLAUDE.md lists `dockable.ts` and `margin-injector.ts` in key components
- [ ] CLAUDE.md documents the page margin injection convention
- [ ] Tutorial mentions Panel Layout dropdown and what each option does
- [ ] No factual errors in documentation

**Negative tests:**
- [ ] Documentation doesn't reference features that weren't implemented

**Evidence requirements:**
- [ ] Documentation review by code review agent

**Documentation impact:** CLAUDE.md, tutorials/call-settings.html

**Rollback plan:** Revert changes to `CLAUDE.md` and `call-settings.html`

**Notes:** Keep CLAUDE.md updates concise — follow the existing style (bullets, not paragraphs).

---

## Appendix

### Technical Decisions

1. **`data-dock` attribute over CSS classes** — Using `panel.dataset.dock = 'left' | 'right' | ''` instead of `classList.add/remove`. One setter, no risk of stale classes. CSS selectors become `.overlay-panel[data-dock="left"]`. The attribute also serves as a readable state indicator in DevTools.

2. **Body margin injection (pending spike)** — Using margin on a page element to shift Google Meet content. The exact target will be determined by Task 0 (spike). If margin injection doesn't work on Meet's flex layout, the fallback is to let the panel float over the edge (like Grammarly/Notion sidebars), which eliminates Task 5.

3. **Extend Resizable, don't duplicate** — Adding `widthOnly` and `edge` options to the existing `Resizable` class (~15 lines) instead of duplicating ~60+ lines of mouse event handling. When `widthOnly` is true, cursor is `ew-resize` (not `nwse-resize`) and height adjustment is skipped. Dockable owns and manages the dock Resizable instance.

4. **Extract dock logic into `dockable.ts`** — Overlay.ts is 1663 lines. Rather than adding 150-200 more lines for dock mode, extract the logic into `src/content/overlay/dockable.ts` following the same pattern as `draggable.ts` and `resizable.ts`. Uses a `DockableOptions` config object for constructor args.

5. **Standalone `margin-injector.ts` module** — Margin injection/removal lives in its own module, directly importable by both `content-script.ts` and `dockable.ts`. Avoids a 3-level callback chain (content-script → overlay → dockable). `removeDockMargin()` is idempotent.

6. **Single storage read to avoid race condition** — Dock mode and docked width are read in the same `chrome.storage.local.get()` call as the existing position/minimized/fontSize. This prevents a race where `restorePosition()` and `loadDockMode()` resolve in unpredictable order and overwrite each other.

7. **Inline style clearing on dock** — When docking, `setDockMode()` explicitly clears all inline styles (`left`, `top`, `right`, `width`, `height`, `maxWidth`) because inline styles beat `[data-dock]` attribute selectors in CSS specificity. Guards in `restorePosition()` and `savePosition()` skip when docked.

8. **CSS transition excludes `width`** — Transition uses specific properties (`left`, `right`, `top`, `height`, `border-radius`, `box-shadow`, `background`) — NOT `transition: all`. Using `all` causes 200ms lag on every drag/resize mouse move.

9. **Dock toggle = floating ↔ last-used side** — Simple two-state toggle (not a three-state cycle). Default to `dock-right`. This matches VS Code, JetBrains, and standard sidebar behavior.

10. **Same minimized circle for docked mode** — No special 48px strip for V1. Use the same 48px circle positioned at the top of the docked edge. Remove margin entirely when minimized. If users request the strip UI later, add it as a follow-up.

11. **"Sidebar Left/Right" user-facing labels** — Internal code uses `dock-left`/`dock-right`. User-facing labels in the options page and tooltips use "Sidebar Left"/"Sidebar Right" to avoid technical jargon.

12. **Two storage keys only** — `overlayDockMode` and `overlayDockedWidth`. No `lastDockSide` — derive it from `overlayDockMode`. The existing `overlayPosition` continues to store floating coords.

13. **Pure functions for testability** — `parseDockMode()` and `clampDockedWidth()` are exported as pure functions from `dockable.ts`, enabling unit tests without DOM mocking.

### Dependencies

- No new external packages required
- All changes use existing Chrome Extension APIs (`chrome.storage.local`, `chrome.storage.onChanged`)
- CSS changes use standard properties (no vendor prefixes needed for target Chrome version)

### Out of Scope

- **Chrome Side Panel API integration** — Decided against due to API limitations (no width control, no left/right control, requires user gesture)
- **Drag-to-dock** — Dragging the overlay to the edge to auto-dock. Phase 25.1 fast-follow.
- **Keyboard shortcut for dock toggle** — Could be added later as part of a keyboard shortcuts feature. Phase 25.1 fast-follow.
- **Multi-monitor support** — Standard Chrome behavior applies
- **Resizable docked height** — Docked panels are always 100vh
- **Per-site dock preferences** — Dock mode applies globally
- **Window resize auto-switch** — No auto-switching to floating at narrow viewports. Meet is unusable below 600px anyway. Just clamp width on restore.
- **Onboarding/tooltip for new feature** — Consider a first-use tooltip as Phase 25.1 fast-follow
- **48px minimized strip UI** — V1 uses the same circle. Strip UI is a follow-up if users request it.
- **Live window resize width clamping** — Width is clamped on restore from storage only, not on live window resize. Panel may exceed available space at very narrow widths. Add a resize listener only if users report issues.
- **Google Meet Chat panel auto-detection** — If Meet's Chat/People panels conflict with dock-right, document the limitation. Auto-switching dock side is a follow-up.
