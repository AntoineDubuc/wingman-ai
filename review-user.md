# End-User Review: Docked Overlay Mode (Phase 25)

**Reviewer perspective:** Daily Wingman AI user, sales professional, non-technical.

---

## 1. Does this solve my problem?

**Yes, mostly.** The core issue -- Wingman floating on top of video tiles -- is directly addressed. Docking pushes Google Meet content aside so I can see everyone's face while reading suggestions. That is the number-one thing I need.

---

## 2. Findings

### F1 -- No keyboard shortcut for dock/undock

- **Category:** Missing Feature
- **Finding:** There is no keyboard shortcut to toggle docking. During a live sales call, moving my mouse to the overlay header and clicking a small button is distracting. A quick shortcut (e.g., Ctrl+Shift+D) would let me dock or undock without looking away from the call.
- **Severity:** Important
- **Suggestion:** Add a configurable keyboard shortcut. Even a hardcoded one is better than none for v1.

---

### F2 -- No way to preview modes before committing

- **Category:** UX
- **Finding:** In Settings, I pick "Dock Left" or "Dock Right" from a dropdown with a one-line description. I have no idea what each one looks like until I join a call. If I pick wrong, I have to go back to settings or figure out the in-call toggle.
- **Severity:** Minor
- **Suggestion:** Add a small illustration or thumbnail next to each dropdown option showing a rough sketch of where the panel sits. Even a simple CSS diagram would help.

---

### F3 -- Accidental close / panel recovery is unclear

- **Category:** Confusion Risk
- **Finding:** The plan describes minimize (collapses to a 48px strip) but says nothing about what happens if I fully close the overlay -- e.g., clicking an "X" button or if the overlay crashes. Is there a way to bring the docked panel back without reloading the page? In floating mode I can at least hunt for the small circle. In docked mode, a thin 48px strip at the edge of my screen could be easy to miss, especially if my window is partially off-screen.
- **Severity:** Important
- **Suggestion:** Clarify the recovery path. Consider adding a small persistent tab/nub that stays visible even when minimized, or allow the popup (extension icon) to have a "Show panel" button.

---

### F4 -- 13-inch laptop experience not addressed

- **Category:** UX
- **Finding:** A 350px default dock width on a 1280px-wide laptop screen eats 27% of my viewport. Google Meet on the remaining 930px will noticeably shrink the video grid. The plan mentions clamping the panel if the window is narrow, but there is no discussion of what "good" looks like on a small screen versus a 27-inch monitor.
- **Severity:** Important
- **Suggestion:** Test with at least two viewport widths (1280px and 2560px) and set sensible defaults for each. Consider a narrower default (300px) for smaller screens, or auto-adjust the default based on viewport width. At minimum, document what the minimum comfortable width is.

---

### F5 -- Toggle button behavior could confuse me

- **Category:** Confusion Risk
- **Finding:** The dock toggle cycles between floating and "last-used dock side." If I have never docked before, it defaults to "dock right." But if I docked left last week and forgot, pressing the toggle sends me to dock-left, which might not be what I expect. There is no visual cue telling me which side I am about to dock to before I click.
- **Severity:** Minor
- **Suggestion:** The tooltip should say "Dock to right" or "Dock to left" (not just "Dock"), so I know where the panel is going before I click. A long-press or right-click option to pick the other side would be a nice bonus.

---

### F6 -- What happens to my transcripts when I switch modes mid-call?

- **Category:** Confusion Risk
- **Finding:** The plan says "timeline entries and session state are preserved" in Task 10's acceptance criteria, but it is not mentioned anywhere in the user-facing feature description (Features 1-4). As a user, I would be nervous that switching modes mid-call might lose my transcripts or reset the suggestion history. There is no reassurance in the UX.
- **Severity:** Important
- **Suggestion:** When switching modes mid-call, briefly show a toast or subtle animation confirming "Panel moved -- your conversation is intact." Even better, the transition should be visually smooth (slide animation) so I can see my content moving, not disappearing and reappearing.

---

### F7 -- No transition animation when docking/undocking

- **Category:** UX
- **Finding:** The plan describes applying/removing CSS classes to snap the panel into position. There is no mention of a transition animation. Instant snapping can feel jarring, especially mid-call when I am focused on a conversation. It might look like something broke.
- **Severity:** Minor
- **Suggestion:** Add a short CSS transition (200-300ms) when switching between floating and docked modes. The panel should slide to the edge rather than teleport. Google Meet's content margin should also transition smoothly.

---

### F8 -- Minimized docked strip may be too subtle

- **Category:** UX
- **Finding:** When minimized in docked mode, the panel becomes a 48px strip at the browser edge. On a busy call with screen-sharing, a plain 48px-wide strip blends in with the browser chrome. I might forget the panel is there or not realize I can click to restore it.
- **Severity:** Minor
- **Suggestion:** Give the minimized strip a distinct accent color (the Wingman brand color) or a gentle pulse/glow on new suggestions. Add a visible expand arrow icon. The strip should feel clickable, not just empty space.

---

### F9 -- Side-by-side LangBuilder disabled without explanation

- **Category:** Confusion Risk
- **Finding:** If I use LangBuilder in side-by-side mode and then dock the panel, it silently reverts to single-panel mode and hides the toggle button. I will not understand why my layout changed. There is no toast, warning, or explanation.
- **Severity:** Minor
- **Suggestion:** Show a brief toast: "Side-by-side view is not available in docked mode." When I undock, remind me that side-by-side is available again.

---

### F10 -- No drag-to-dock gesture

- **Category:** Nice-to-Have
- **Finding:** The plan explicitly marks "drag-to-dock" as out of scope. But as a user, the most intuitive way to dock a floating panel is to drag it to the edge of the screen -- this is how every OS sidebar and panel works (macOS, Windows, Chrome DevTools). The button toggle is functional but not discoverable.
- **Severity:** Minor
- **Suggestion:** Prioritize drag-to-dock for a fast follow-up. Show a visual hint (blue edge highlight) when the user drags the panel near a browser edge, and snap it into docked mode on release.

---

### F11 -- No onboarding or discovery for the new feature

- **Category:** Missing Feature
- **Finding:** Existing users who update the extension will have no idea docking exists. The setting is buried in Call Settings, and the header button is a small icon among several. There is no changelog popup, tooltip, or "new feature" badge to draw attention to it.
- **Severity:** Important
- **Suggestion:** On first load after update, show a one-time tooltip pointing to the dock button: "New! Pin Wingman to the side of your screen so it never blocks your video." Dismiss on click.

---

### F12 -- Dock mode and Google Meet "People" or "Chat" side panel conflict

- **Category:** Missing Feature
- **Finding:** Google Meet has its own side panels (Chat, People, Activities) that open on the right side. If I dock Wingman to the right and then open Google Meet's chat, both panels will fight for the right edge of the screen. The plan does not mention how this interaction is handled.
- **Severity:** Critical
- **Suggestion:** Investigate how Google Meet's native side panels interact with the injected body margin. Test explicitly with Meet's Chat panel open + Wingman docked right. If they overlap, either: (a) auto-switch Wingman to dock-left when Meet opens a side panel, or (b) document the conflict and recommend docking left if the user frequently uses Meet chat.

---

### F13 -- Width persistence across different screen sizes

- **Category:** UX
- **Finding:** Dock width is saved globally. If I set a 500px dock width on my 27-inch monitor at the office, then open my laptop at home (1280px screen), the panel takes up nearly 40% of my viewport. The saved width does not adapt to different screen sizes.
- **Severity:** Important
- **Suggestion:** Either save width as a percentage of viewport instead of pixels, or clamp the restored width against the current viewport on load (not just on resize). A "reset to default width" option in the right-click menu of the resize handle would also help.

---

### F14 -- Settings dropdown placement feels buried

- **Category:** UX
- **Finding:** The "Panel Position" dropdown is placed in Call Settings after "Speaker Filter." Call Settings already has many options. A new user looking for "where does the panel go" would not intuitively look in "Call Settings" -- they might look in a "Display" or "Appearance" section, or expect it near the theme toggle.
- **Severity:** Minor
- **Suggestion:** Consider grouping it with the theme setting under a "Display" or "Appearance" section, or at minimum, place it as the first item in Call Settings since it is the most visual setting there.

---

## 3. Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| Important | 5 |
| Minor | 8 |

**Overall assessment:** This plan solves the core problem well. The technical approach is sound, and the persistent dock state plus live toggle are thoughtful touches. The main gaps are around **discoverability** (F11), **Google Meet side panel conflicts** (F12), **small screen experience** (F4, F13), and **user reassurance during transitions** (F6, F7). The critical item (F12) should be investigated before implementation starts -- if Meet's own Chat panel collides with the docked Wingman, it will be the first thing users complain about.
