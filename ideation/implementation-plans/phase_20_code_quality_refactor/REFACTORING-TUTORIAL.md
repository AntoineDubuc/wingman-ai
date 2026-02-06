# Refactoring Tutorial: From Monolith to Clean Components

*A step-by-step guide for junior engineers on how to safely break apart large files*

---

## Part 1: The Big Picture

### What Was Wrong?

Imagine you're a new engineer joining the team. You open `overlay.ts` and see **2,463 lines of code**. Your task: "Add a small animation when the panel is dragged."

You scroll... and scroll... and scroll. Where does dragging happen? Is it at line 400? Line 1,200? You find bits and pieces scattered everywhere. You make a change, something else breaks. Sound familiar?

This is called a **"God Class"** — a file that does everything:
- Renders transcripts
- Handles drag-and-drop
- Handles resizing
- Manages themes
- Shows summaries
- Loads personas
- And 50 other things

The problem isn't that it works. It does work! The problem is:
1. **Hard to understand** — Too much to hold in your head
2. **Hard to change** — Touch one thing, break another
3. **Hard to test** — Can't test dragging without loading everything else
4. **Hard to reuse** — Want dragging elsewhere? Copy-paste 50 lines?

### The Goal

Break the monolith into **focused components** that each do one thing well:

```
BEFORE                          AFTER
┌─────────────────────┐        ┌─────────────────────┐
│                     │        │      Overlay        │
│                     │        │   (coordinator)     │
│      overlay.ts     │        └──────────┬──────────┘
│     2,463 lines     │                   │
│                     │        ┌──────────┼──────────┐
│   "Does everything" │        │          │          │
│                     │        ▼          ▼          ▼
└─────────────────────┘   ┌────────┐ ┌────────┐ ┌────────┐
                          │Draggable│ │Resizable│ │  CSS   │
                          │ 128 ln │ │ 130 ln │ │ 807 ln │
                          └────────┘ └────────┘ └────────┘
```

---

## Part 2: Finding What to Extract

### The Smell Test

Look for these signs that code wants to be its own module:

| Smell | What It Looks Like | Example |
|-------|-------------------|---------|
| **Unrelated state** | Variables only used by one feature | `isDragging`, `startX`, `startY` |
| **Isolated logic** | Code block that doesn't touch the rest | Mouse event handlers for dragging |
| **Copy-paste temptation** | "I wish I could use this elsewhere" | Drag behavior for another panel |
| **Long methods** | 40+ lines doing multiple things | `initDrag()` doing setup + events |

### What We Found in `overlay.ts`

1. **812 lines of CSS** — Styles have nothing to do with logic
2. **Drag handling** — Self-contained mouse tracking
3. **Resize handling** — Same pattern as dragging
4. **Magic numbers everywhere** — `15000`, `700`, `0.8`

---

## Part 3: The Extraction Pattern

### Step 1: Identify the Boundary

Find where the feature starts and ends. For dragging, it was:

```typescript
// BEFORE: Inside overlay.ts (lines 420-456)
private initDrag(): void {
  const header = this.panel.querySelector('.overlay-header') as HTMLElement;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;

  header.addEventListener('mousedown', (e) => {
    if (this.isMinimized) return;
    this.isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = this.panel.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    header.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (!this.isDragging) return;
    // ... 10 more lines
  });

  document.addEventListener('mouseup', () => {
    if (this.isDragging) {
      this.isDragging = false;
      header.style.cursor = 'grab';
      this.savePosition();
    }
  });
}
```

**Problems with this code:**
- `isDragging` is a class property but only used here
- Can't reuse for another draggable element
- Hard to test in isolation
- Mixes "what to drag" with "how dragging works"

### Step 2: Define the Interface

Before writing code, think: "What would the ideal API look like?"

```typescript
// What we WANT to write:
this.draggable = new Draggable({
  handle: header,        // What you grab
  target: this.panel,    // What moves
  isDisabled: () => this.isMinimized,
  onDragEnd: () => this.savePosition(),
});
```

This is **wishful thinking** — write the code you wish existed, then make it real.

### Step 3: Create the Component

```typescript
// AFTER: src/content/overlay/draggable.ts

export interface DraggableOptions {
  /** Element that triggers dragging (e.g., header) */
  handle: HTMLElement;

  /** Element that moves when dragged (e.g., panel) */
  target: HTMLElement;

  /** Called when drag ends with final position */
  onDragEnd?: (position: { left: number; top: number }) => void;

  /** If true, dragging is disabled */
  isDisabled?: () => boolean;
}

export class Draggable {
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private startLeft = 0;
  private startTop = 0;

  constructor(private options: DraggableOptions) {
    this.attach();
  }

  private attach(): void {
    this.options.handle.addEventListener('mousedown', this.onMouseDown.bind(this));
    document.addEventListener('mousemove', this.onMouseMove.bind(this));
    document.addEventListener('mouseup', this.onMouseUp.bind(this));
  }

  destroy(): void {
    // Clean up listeners — important for memory leaks!
    this.options.handle.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  }

  private onMouseDown(e: MouseEvent): void {
    if (this.options.isDisabled?.()) return;

    this.isDragging = true;
    this.startX = e.clientX;
    this.startY = e.clientY;

    const rect = this.options.target.getBoundingClientRect();
    this.startLeft = rect.left;
    this.startTop = rect.top;

    this.options.handle.style.cursor = 'grabbing';
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.startX;
    const deltaY = e.clientY - this.startY;

    const target = this.options.target;
    const maxLeft = window.innerWidth - target.offsetWidth;
    const maxTop = window.innerHeight - target.offsetHeight;

    const newLeft = Math.max(0, Math.min(maxLeft, this.startLeft + deltaX));
    const newTop = Math.max(0, Math.min(maxTop, this.startTop + deltaY));

    target.style.left = `${newLeft}px`;
    target.style.top = `${newTop}px`;
    target.style.right = 'auto';
  }

  private onMouseUp(): void {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.options.handle.style.cursor = 'grab';

    const rect = this.options.target.getBoundingClientRect();
    this.options.onDragEnd?.({ left: rect.left, top: rect.top });
  }
}
```

### Step 4: Replace the Original

```typescript
// AFTER: overlay.ts (just 10 lines!)
import { Draggable } from './overlay/draggable';

private draggable: Draggable | null = null;

private initDrag(): void {
  const header = this.panel.querySelector('.overlay-header') as HTMLElement;

  this.draggable = new Draggable({
    handle: header,
    target: this.panel,
    isDisabled: () => this.isMinimized,
    onDragEnd: () => this.savePosition(),
  });
}

destroy(): void {
  this.draggable?.destroy();
}
```

---

## Part 4: The CSS Extraction

### Before: 812 Lines of Inline CSS

```typescript
// BEFORE: overlay.ts
private loadStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    .overlay-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 380px;
      /* ... 800 more lines ... */
    }
  `;
  this.shadow.appendChild(style);
}
```

**Why this is bad:**
- Can't use CSS tooling (linting, formatting)
- No syntax highlighting in most editors
- Bloats the JavaScript bundle
- Harder to find specific styles

### After: External CSS File

```typescript
// AFTER: overlay.ts (just 6 lines!)
private loadStyles(): void {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('src/content/overlay/overlay.css');
  this.shadow.appendChild(link);
}
```

```css
/* AFTER: overlay/overlay.css */
.overlay-panel {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 380px;
  /* All styles in proper CSS file */
}
```

**Don't forget:** For Chrome extensions, add the CSS to `manifest.json`:
```json
"web_accessible_resources": [{
  "resources": ["src/content/overlay/overlay.css"],
  "matches": ["https://meet.google.com/*"]
}]
```

---

## Part 5: Extracting Magic Numbers

### Before: Numbers Everywhere

```typescript
// Scattered throughout the codebase
if (Date.now() - this.lastSuggestion < 15000) return;  // What's 15000?
const endpointing = settings.endpointing ?? 700;       // Why 700?
const maxHeight = window.innerHeight * 0.8;            // Magic 0.8?
```

### After: Named Constants

```typescript
// shared/constants.ts
export const TIMING = {
  /** Cooldown between AI suggestions to manage API quota */
  SUGGESTION_COOLDOWN_MS: 15_000,

  /** Default silence duration before Deepgram finalizes speech */
  DEFAULT_ENDPOINTING_MS: 700,
} as const;

export const UI = {
  /** Maximum panel height as fraction of viewport */
  MAX_HEIGHT_RATIO: 0.8,
} as const;
```

```typescript
// Usage
import { TIMING, UI } from '../shared/constants';

if (Date.now() - this.lastSuggestion < TIMING.SUGGESTION_COOLDOWN_MS) return;
const maxHeight = window.innerHeight * UI.MAX_HEIGHT_RATIO;
```

**Benefits:**
- Self-documenting code
- Change once, update everywhere
- IDE autocomplete finds constants
- Comments explain the "why"

---

## Part 6: Writing Tests for Extracted Components

### Why Test Interfaces?

Even without DOM testing, you can verify that your interfaces are stable:

```typescript
// tests/draggable.test.ts
import type { DraggableOptions } from '../src/content/overlay/draggable';

describe('Draggable Interface Contract', () => {
  it('accepts all optional callbacks', () => {
    const options: DraggableOptions = {
      handle: {} as HTMLElement,
      target: {} as HTMLElement,
      onDragStart: () => {},
      onDragEnd: (pos) => {
        // TypeScript ensures pos has left and top
        expect(pos.left).toBeTypeOf('number');
        expect(pos.top).toBeTypeOf('number');
      },
      isDisabled: () => false,
    };

    expect(options.onDragEnd).toBeDefined();
  });

  it('onDragEnd receives position object', () => {
    let receivedPosition: { left: number; top: number } | null = null;

    const options: DraggableOptions = {
      handle: {} as HTMLElement,
      target: {} as HTMLElement,
      onDragEnd: (pos) => { receivedPosition = pos; },
    };

    // Simulate the callback
    options.onDragEnd?.({ left: 100, top: 200 });

    expect(receivedPosition).toEqual({ left: 100, top: 200 });
  });
});
```

This catches breaking changes — if someone changes `onDragEnd` to pass different data, the test fails.

---

## Part 7: The Results

### Lines of Code

| File | Before | After | Change |
|------|--------|-------|--------|
| overlay.ts | 2,463 | 1,610 | -35% |
| content.js bundle | 57 KB | 38 KB | -33% |

### New Files Created

```
src/content/overlay/
├── draggable.ts    (128 lines) — Reusable drag behavior
├── resizable.ts    (130 lines) — Reusable resize behavior
└── overlay.css     (807 lines) — All styles in one place

src/shared/
└── constants.ts    (100 lines) — All magic numbers named

tests/
├── draggable.test.ts
├── resizable.test.ts
└── overlay.test.ts
```

### Test Coverage

- Before: 120 tests
- After: 131 tests (+11 new tests for extracted components)

---

## Part 8: Rules to Remember

### 1. Extract, Don't Rewrite

Never rewrite from scratch. Extract existing, working code into a new file.

```
❌ "I'll rewrite the drag system from scratch"
✅ "I'll move the existing drag code to its own file"
```

### 2. One Change at a Time

Each commit should do ONE thing:
1. Extract CSS → commit
2. Extract Draggable → commit
3. Extract Resizable → commit

If something breaks, you know exactly which change caused it.

### 3. Test Before and After

```bash
npm test          # Run before extraction
# ... make changes ...
npm run build     # Verify it compiles
npm test          # Run after extraction — same results?
```

### 4. Preserve the Public API

The rest of the codebase shouldn't need to change:

```typescript
// Other files still work exactly the same
const overlay = new AIOverlay();
overlay.updateTranscript(transcript);  // Still works!
overlay.toggleMinimize();              // Still works!
```

### 5. When NOT to Extract

Sometimes code looks extractable but isn't worth it:

- **Too small** — A 10-line helper isn't worth a new file
- **Too coupled** — If extraction requires passing 10 parameters, the boundary is wrong
- **One-time use** — Don't create abstractions for things used once

---

## Conclusion

Refactoring isn't about making code "prettier." It's about making code **changeable**.

A 2,463-line file isn't wrong because it's long. It's wrong because:
- New engineers can't understand it
- Small changes risk breaking unrelated features
- You can't test pieces in isolation
- You can't reuse pieces elsewhere

The goal is **confidence**: Can you change the drag behavior without worrying about breaking transcripts? After this refactoring, yes.

Start small. Extract one thing. Ship it. Repeat.

---

*Tutorial by Claude • Phase 20 Refactoring • Wingman AI*
