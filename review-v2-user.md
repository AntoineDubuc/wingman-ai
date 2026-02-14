# End-User Review v2: Docked Overlay Mode (Phase 25)

**Reviewer perspective:** Daily Wingman AI user, sales professional, non-technical.
**Focus:** Only genuinely confusing or frustrating gaps remaining after v1 review.

## Findings

### F1 — No indication of what happens when Meet's own Chat panel is already open on the right
- **Category:** Confusion Risk
- **Finding:** The spike (Task 0) will investigate the conflict between Meet's native right-side panels (Chat, People) and Wingman's Sidebar Right mode. But there's no plan for what the user actually *experiences* if both collide. If I dock Wingman on the right and then open Meet's Chat, will things overlap? Will the page look broken? The plan says "document the behavior" but doesn't commit to a user-facing solution (e.g., a warning, auto-switching to left, or just accepting overlap). I could end up confused mid-call with two panels fighting for the same edge.
- **Severity:** Important
- **Suggestion:** After the spike, commit to a specific user-facing behavior for this conflict. Even if it's just "Wingman overlaps Meet's Chat panel — use Sidebar Left if you use Meet Chat often," that should be documented in the tooltip or settings description so I know before it happens.

### F2 — Default dock side is "right" but right side has the most conflicts
- **Category:** UX
- **Finding:** The plan defaults to `dock-right` when toggling from floating. But the right side is exactly where Google Meet puts its own Chat and People panels. Defaulting to the side with the most conflicts means more users will hit the overlap issue on first use.
- **Severity:** Minor
- **Suggestion:** Consider defaulting to `dock-left` instead, or let the spike determine which side is safer as the default. Not a blocker, but first impressions matter.

### F3 — No feedback when side-by-side layout is silently disabled
- **Category:** Confusion Risk
- **Finding:** If I'm in side-by-side layout (LangBuilder) and I dock, it silently reverts to single-panel with only a `console.log`. I'm a sales user — I don't look at the console. I'll just wonder why my side-by-side view disappeared and think the feature is broken.
- **Severity:** Important
- **Suggestion:** Show a brief toast or a subtle visual cue ("Side-by-side not available in sidebar mode") so I understand what happened. A console.log alone is invisible to users.

## Summary

The plan is solid after the v1 review round. The spike task, margin cleanup, and "Sidebar" labeling address the biggest prior concerns. The two remaining important items are both about giving the user clear feedback when something changes unexpectedly (Meet panel conflict, side-by-side auto-revert). Everything else looks ready to build.
