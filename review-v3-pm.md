# PM Review v3: Docked Overlay Mode (Phase 25)

**Reviewer:** Product Manager
**Focus:** Final check — any remaining gaps that would cause bugs or rework.

## Findings

**Spike task (Task 0)** is the critical blocker: margin injection feasibility on Google Meet's flex layout is untested. All margin-related acceptance criteria in Task 5 depend on this. If the spike finds that body margin doesn't work, Task 5 shrinks to a single line (mark as N/A, no margin injection). This could cascade to reduce dock visual polish but doesn't break the feature — the docked panel will just float over content (like Grammarly sidebars do).

**CSS specificity resolution** — all critical findings from v2 are addressed. Inline style clearing, single storage read, CSS transition targeting, and Resizable cursor/width handling are all specified in the updated plan.

**Closure on Task 6 (dock toggle button)** — accepted the layout toggle replacement pattern. Prevents header bloat. Restoration on undock is now explicitly tested.

**Dockable ownership model is clean** — standalone module, config object constructor, pure exported functions for tests, idempotent margin removal. No red flags.

**Documentation and tutorial updates are planned** — CLAUDE.md and call-settings.html will be updated in Task 9. No knowledge debt.

**One minor refinement:** Task 1 should also export `UI.OVERLAY_DOCKED_MIN_WIDTH` and `UI.OVERLAY_DOCKED_MAX_WIDTH` (280–600px range) as explicit constants. Currently described in Task 3 prose, but better as concrete Task 1 additions for consistency with `OVERLAY_DOCKED_DEFAULT_WIDTH`.

## Verdict

Ready to build. Spike (Task 0) is the first blocker; start there immediately to validate margin injection feasibility. All 20 tasks are well-defined, acceptance criteria are testable, and split-agent verification protocol is clear.
