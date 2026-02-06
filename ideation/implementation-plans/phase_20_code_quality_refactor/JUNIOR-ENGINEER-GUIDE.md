# Junior Engineer Onboarding: Writing Production-Quality Code

## A Practical Guide with Real Examples

This document teaches clean code principles using real before/after examples from the Wingman AI codebase. Every anti-pattern shown here was actual code that shipped. Learn from these mistakes.

---

## Table of Contents

1. [The Golden Rules](#the-golden-rules)
2. [Functions: The Building Blocks](#functions-the-building-blocks)
3. [Classes: Single Responsibility](#classes-single-responsibility)
4. [Files: Organization Matters](#files-organization-matters)
5. [Constants: No Magic Numbers](#constants-no-magic-numbers)
6. [Error Handling: Fail Gracefully](#error-handling-fail-gracefully)
7. [Testing: Write Tests First](#testing-write-tests-first)
8. [CSS: Separation of Concerns](#css-separation-of-concerns)
9. [State Management: Predictability](#state-management-predictability)
10. [Code Review Checklist](#code-review-checklist)

---

## The Golden Rules

Before diving into specifics, internalize these principles:

### 1. Code is Read More Than Written
You write code once. Others (including future you) read it hundreds of times. Optimize for readability.

### 2. Small is Beautiful
Small functions, small classes, small files. If something is big, it's probably doing too much.

### 3. One Thing, One Place
Every piece of logic should live in exactly one place. If you're copying code, you're doing it wrong.

### 4. Make It Work, Make It Right, Make It Fast
In that order. Don't optimize prematurely. Don't skip "make it right."

### 5. The Boy Scout Rule
Leave code better than you found it. Every commit should improve the codebase slightly.

---

## Functions: The Building Blocks

### Rule: A function should do ONE thing

**How to know if your function does one thing**: Can you describe what it does without using "and"?

### Bad Example: 239-line Function

This is from our actual `service-worker.ts`:

```typescript
// BAD: handleStartSession() - 239 lines doing MANY things
async function handleStartSession(): Promise<{ success: boolean; error?: string }> {
  // 1. Check if session already active (lines 1-10)
  // 2. Load API keys from storage (lines 11-30)
  // 3. Validate API keys exist (lines 31-50)
  // 4. Load persona configuration (lines 51-80)
  // 5. Set up Gemini client (lines 81-100)
  // 6. Create offscreen document (lines 101-130)
  // 7. Connect to Deepgram (lines 131-160)
  // 8. Inject content script (lines 161-190)
  // 9. Initialize overlay (lines 191-220)
  // 10. Set up event listeners (lines 221-239)

  // This function uses "and" about 9 times to describe it!
}
```

### Good Example: Decomposed Functions

```typescript
// GOOD: Each function does ONE thing

async function handleStartSession(): Promise<SessionResult> {
  if (isSessionActive()) {
    return { success: false, error: 'Session already active' };
  }

  const config = await loadSessionConfig();
  if (!config.success) {
    return config;
  }

  const services = await initializeServices(config.data);
  if (!services.success) {
    return services;
  }

  const ui = await initializeUI(config.data.tabId);
  if (!ui.success) {
    await cleanupServices(services.data);
    return ui;
  }

  return { success: true };
}

// Each sub-function is small and focused:

function isSessionActive(): boolean {
  return sessionState === 'active' && activeTabId !== null;
}

async function loadSessionConfig(): Promise<ConfigResult> {
  const keys = await loadApiKeys();
  const personas = await loadActivePersonas();
  const tab = await getCurrentMeetTab();

  if (!keys.deepgram) {
    return { success: false, error: 'Deepgram API key required' };
  }

  return { success: true, data: { keys, personas, tabId: tab.id } };
}

async function initializeServices(config: SessionConfig): Promise<ServicesResult> {
  const deepgram = await connectDeepgram(config.keys.deepgram);
  const gemini = await configureGemini(config.keys.gemini, config.personas);

  return { success: true, data: { deepgram, gemini } };
}
```

### Why This Matters

| Metric | 239-line function | Decomposed |
|--------|-------------------|------------|
| Testable? | No (too many dependencies) | Yes (each function isolated) |
| Readable? | No (scroll for 10 screens) | Yes (fits on one screen) |
| Debuggable? | No (which line failed?) | Yes (stack trace is clear) |
| Reusable? | No (all-or-nothing) | Yes (use pieces independently) |

### The 30-Line Rule

**Guideline**: If a function exceeds 30 lines, it probably does more than one thing.

This isn't a hard rule, but it's a good smell test. When you see a long function, ask: "Can I extract a meaningful sub-function?"

---

## Classes: Single Responsibility

### Rule: A class should have ONE reason to change

Ask yourself: "What would cause me to modify this class?" If you can name multiple unrelated reasons, the class is too big.

### Bad Example: God Class (2,463 lines)

Our actual `overlay.ts` has ONE class that handles:

```typescript
// BAD: Overlay class does EVERYTHING
class Overlay {
  // Theme management (50 lines)
  private loadTheme(): void { /* ... */ }
  private toggleTheme(): void { /* ... */ }

  // CSS injection (812 lines!!!)
  private loadStyles(): void { /* giant CSS string */ }

  // Drag behavior (80 lines)
  private initDrag(): void { /* ... */ }
  private onMouseDown(): void { /* ... */ }
  private onMouseMove(): void { /* ... */ }
  private onMouseUp(): void { /* ... */ }

  // Transcript rendering (200 lines)
  addTranscript(): void { /* ... */ }
  private createBubble(): void { /* ... */ }
  private scrollToBottom(): void { /* ... */ }

  // Suggestion rendering (150 lines)
  showSuggestion(): void { /* ... */ }
  private createSuggestionCard(): void { /* ... */ }

  // Summary display (300 lines)
  showSummary(): void { /* ... */ }
  private buildSummaryHtml(): void { /* ... */ }
  private copyToClipboard(): void { /* ... */ }
  private saveToDrive(): void { /* ... */ }

  // Persona display (100 lines)
  private loadPersonaLabel(): void { /* ... */ }
  private setupPersonaTooltip(): void { /* ... */ }

  // Resize behavior (50 lines)
  private initResize(): void { /* ... */ }

  // Font size controls (40 lines)
  private adjustFontSize(): void { /* ... */ }
}
```

**Reasons this class would change**:
1. Theme colors change → modify loadStyles()
2. Drag behavior changes → modify drag methods
3. Transcript format changes → modify transcript methods
4. Summary layout changes → modify summary methods
5. New persona features → modify persona methods

That's 5+ unrelated reasons = too many responsibilities.

### Good Example: Focused Classes

```typescript
// GOOD: Each class has ONE responsibility

// Responsibility: Managing drag behavior
class Draggable {
  constructor(private handle: HTMLElement, private container: HTMLElement) {
    this.bindEvents();
  }

  private bindEvents(): void {
    this.handle.addEventListener('mousedown', this.onStart);
    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('mouseup', this.onEnd);
  }

  destroy(): void {
    this.handle.removeEventListener('mousedown', this.onStart);
    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('mouseup', this.onEnd);
  }
}

// Responsibility: Rendering transcripts
class TranscriptRenderer {
  constructor(private container: HTMLElement) {}

  addEntry(entry: TranscriptEntry): void {
    const bubble = this.createBubble(entry);
    this.container.appendChild(bubble);
    this.scrollToBottom();
  }

  clear(): void {
    this.container.innerHTML = '';
  }

  private createBubble(entry: TranscriptEntry): HTMLElement {
    // 10-15 lines max
  }

  private scrollToBottom(): void {
    this.container.scrollTop = this.container.scrollHeight;
  }
}

// Responsibility: Coordinating sub-components (thin!)
class Overlay {
  private drag: Draggable;
  private transcripts: TranscriptRenderer;
  private suggestions: SuggestionRenderer;
  private summary: SummaryView;

  constructor(host: HTMLElement) {
    const panel = new OverlayPanel(host);

    this.drag = new Draggable(panel.header, panel.container);
    this.transcripts = new TranscriptRenderer(panel.transcriptArea);
    this.suggestions = new SuggestionRenderer(panel.suggestionArea);
    this.summary = new SummaryView(panel.summaryArea);
  }

  // Thin delegation methods
  addTranscript(entry: TranscriptEntry): void {
    this.transcripts.addEntry(entry);
  }

  showSuggestion(suggestion: Suggestion): void {
    this.suggestions.show(suggestion);
  }

  destroy(): void {
    this.drag.destroy();
  }
}
```

### The "Reason to Change" Test

For each class, ask: **"If requirement X changes, which classes need to change?"**

| Requirement Change | God Class | Focused Classes |
|-------------------|-----------|-----------------|
| New drag constraints | Overlay | Draggable only |
| Transcript timestamps | Overlay | TranscriptRenderer only |
| Summary PDF export | Overlay | SummaryView only |
| Dark mode tweaks | Overlay | ThemeManager only |

With focused classes, changes are **isolated**. With a god class, every change risks breaking unrelated features.

---

## Files: Organization Matters

### Rule: One concept per file, grouped by feature

### Bad: Grouping by Type

```
src/
├── components/
│   ├── Overlay.ts
│   ├── Popup.ts
│   └── Options.ts
├── services/
│   ├── GeminiClient.ts
│   ├── DeepgramClient.ts
│   └── DriveService.ts
├── types/
│   ├── overlay-types.ts
│   ├── popup-types.ts
│   └── service-types.ts
└── utils/
    ├── overlay-utils.ts
    ├── popup-utils.ts
    └── service-utils.ts
```

**Problem**: To understand the overlay feature, you jump between 4 directories.

### Good: Grouping by Feature

```
src/
├── content/
│   └── overlay/
│       ├── index.ts           # Public API
│       ├── overlay.css        # Styles
│       ├── overlay-panel.ts   # DOM structure
│       ├── overlay-drag.ts    # Drag behavior
│       ├── transcripts.ts     # Transcript rendering
│       ├── suggestions.ts     # Suggestion rendering
│       ├── summary.ts         # Summary view
│       └── types.ts           # All overlay types
├── services/
│   └── llm/
│       ├── index.ts           # Public API
│       ├── types.ts           # Shared interfaces
│       ├── base-provider.ts   # Abstract base
│       ├── providers/
│       │   ├── gemini.ts
│       │   ├── openrouter.ts
│       │   └── groq.ts
│       ├── suggestion-generator.ts
│       └── retry-handler.ts
└── background/
    └── session/
        ├── index.ts
        ├── session-manager.ts
        ├── session-state.ts
        └── handlers/
```

**Benefit**: Everything related to a feature is in one place. To understand overlays, look in `src/content/overlay/`.

### The 400-Line Rule

**Guideline**: If a file exceeds 400 lines, it's probably doing too much.

When a file gets big:
1. Look for natural groupings
2. Extract related functions into a new file
3. Create an `index.ts` that re-exports the public API

---

## Constants: No Magic Numbers

### Rule: Every number should have a name

### Bad: Magic Numbers Everywhere

```typescript
// BAD: What do these numbers mean?
if (Date.now() - lastTime < 15000) {
  return; // Skip
}

if (text.split(' ').length < 2) {
  return; // Too short
}

const width = 350;
const height = 450;

setTimeout(retry, 1000 * Math.pow(2, attempt));
```

Reading this code requires you to **guess** what each number means.

### Good: Named Constants

```typescript
// GOOD: Self-documenting code
const TIMING = {
  SUGGESTION_COOLDOWN_MS: 15_000,  // Minimum time between suggestions
  RETRY_BASE_DELAY_MS: 1_000,      // Initial retry delay
} as const;

const LIMITS = {
  MIN_TRANSCRIPT_WORDS: 2,  // Ignore very short utterances
} as const;

const UI = {
  OVERLAY_DEFAULT_WIDTH: 350,
  OVERLAY_DEFAULT_HEIGHT: 450,
} as const;

// Now the code is readable:
if (Date.now() - lastTime < TIMING.SUGGESTION_COOLDOWN_MS) {
  return;
}

if (text.split(' ').length < LIMITS.MIN_TRANSCRIPT_WORDS) {
  return;
}

const width = UI.OVERLAY_DEFAULT_WIDTH;
const height = UI.OVERLAY_DEFAULT_HEIGHT;

setTimeout(retry, TIMING.RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
```

### Benefits

1. **Searchable**: Grep for `SUGGESTION_COOLDOWN_MS` to find all usages
2. **Changeable**: Update the value in one place
3. **Documented**: The constant name explains the purpose
4. **Type-safe**: `as const` prevents accidental modification

### The Underscore Trick

Use underscores for readability in large numbers:

```typescript
// Hard to read
const cooldown = 15000;
const maxSize = 10485760;

// Easy to read
const cooldown = 15_000;      // 15 seconds
const maxSize = 10_485_760;   // 10 MB
```

---

## Error Handling: Fail Gracefully

### Rule: Handle errors at the appropriate level

### Bad: Swallowing Errors

```typescript
// BAD: Silent failure
async function loadKBContext(query: string): Promise<string> {
  try {
    const results = await kbSearch.search(query);
    return results.map(r => r.content).join('\n');
  } catch {
    return ''; // Error? What error?
  }
}
```

**Problem**: When KB search fails, you have no idea why. Was it a network error? Invalid query? Database corruption?

### Bad: Logging and Rethrowing

```typescript
// BAD: Redundant logging
async function loadKBContext(query: string): Promise<string> {
  try {
    return await kbSearch.search(query);
  } catch (error) {
    console.error('KB search failed:', error);
    throw error; // Now the caller also logs it!
  }
}
```

**Problem**: The same error gets logged multiple times as it bubbles up.

### Good: Handle at the Right Level

```typescript
// GOOD: Let errors bubble, handle at boundaries

// Low-level: Just throw, don't log
async function kbSearch(query: string): Promise<KBResult[]> {
  const response = await fetch(/* ... */);
  if (!response.ok) {
    throw new KBSearchError(`Search failed: ${response.status}`);
  }
  return response.json();
}

// Mid-level: Add context, rethrow
async function getKBContext(query: string, personaIds: string[]): Promise<string> {
  try {
    const results = await kbSearch(query, { filter: personaIds });
    return formatKBResults(results);
  } catch (error) {
    throw new ContextError('Failed to load KB context', { cause: error });
  }
}

// Top-level: Handle gracefully, log once
async function generateSuggestion(transcript: Transcript): Promise<Suggestion> {
  let kbContext = '';

  try {
    kbContext = await getKBContext(transcript.text, this.personaIds);
  } catch (error) {
    // KB is optional - log and continue without it
    console.warn('KB context unavailable, continuing without:', error.message);
  }

  // Continue generating suggestion, with or without KB context
  return this.provider.generate(/* ... */);
}
```

### Error Handling Levels

| Level | Action | Example |
|-------|--------|---------|
| Low | Throw with details | `throw new APIError(status, body)` |
| Mid | Add context, rethrow | `throw new ContextError('During X', { cause })` |
| Top | Handle, log, recover | `try { ... } catch { log; use default }` |

---

## Testing: Write Tests First

### Rule: If you can't test it, you can't trust it

### Bad: Untestable Code

```typescript
// BAD: Impossible to unit test
async function processTranscript(text: string): Promise<Suggestion | null> {
  // Direct dependency on global singleton
  const apiKey = await chrome.storage.local.get('apiKey');

  // Direct dependency on network
  const response = await fetch('https://api.example.com', {
    body: JSON.stringify({ text, key: apiKey }),
  });

  // Direct dependency on another singleton
  geminiClient.updateHistory(text);

  // Side effect: updates global state
  lastProcessedTime = Date.now();

  return response.json();
}
```

To test this, you'd need to:
- Mock Chrome APIs globally
- Mock `fetch` globally
- Mock `geminiClient` globally
- Track global `lastProcessedTime`

That's not a unit test, that's an integration test in disguise.

### Good: Testable Code with Dependency Injection

```typescript
// GOOD: Dependencies are injected
class SuggestionGenerator {
  constructor(
    private provider: LLMProvider,      // Injected
    private storage: StorageService,    // Injected
    private clock: Clock = Date,        // Injectable for testing
  ) {}

  async process(text: string): Promise<Suggestion | null> {
    const config = await this.storage.get('llmConfig');

    if (this.clock.now() - this.lastTime < config.cooldown) {
      return null;
    }

    const response = await this.provider.generate({
      prompt: config.systemPrompt,
      input: text,
    });

    this.lastTime = this.clock.now();
    return this.parseResponse(response);
  }
}

// Easy to test!
describe('SuggestionGenerator', () => {
  it('respects cooldown period', async () => {
    const mockProvider = { generate: vi.fn() };
    const mockStorage = { get: vi.fn().mockResolvedValue({ cooldown: 1000 }) };
    const mockClock = { now: vi.fn() };

    const generator = new SuggestionGenerator(
      mockProvider,
      mockStorage,
      mockClock,
    );

    mockClock.now.mockReturnValue(0);
    await generator.process('first');

    mockClock.now.mockReturnValue(500); // Only 500ms later
    const result = await generator.process('second');

    expect(result).toBeNull();
    expect(mockProvider.generate).toHaveBeenCalledTimes(1);
  });
});
```

### The Test Writing Order

1. **Write the test first** (it will fail)
2. **Write minimal code** to make it pass
3. **Refactor** while keeping tests green
4. **Repeat**

This is called TDD (Test-Driven Development). It forces you to:
- Think about the interface before implementation
- Write testable code from the start
- Have confidence when refactoring

---

## CSS: Separation of Concerns

### Rule: CSS belongs in CSS files

### Bad: 812 Lines of CSS in JavaScript

```typescript
// BAD: Our actual code
private loadStyles(): void {
  const styles = document.createElement('style');
  styles.textContent = `
    :host {
      all: initial;
      position: fixed;
      /* ... 800 more lines ... */
    }

    .overlay-panel {
      position: fixed;
      right: 20px;
      /* ... */
    }

    /* ... 50 more selectors ... */
  `;
  this.shadow.appendChild(styles);
}
```

**Problems**:
- No syntax highlighting for CSS
- No CSS linting
- Can't use CSS preprocessors
- Bloats the JS bundle
- Hard to find specific styles
- IDE can't help with autocomplete

### Good: External CSS File

```typescript
// overlay-panel.ts
export class OverlayPanel {
  constructor(host: HTMLElement) {
    this.shadow = host.attachShadow({ mode: 'closed' });
    this.injectStyles();
    this.createStructure();
  }

  private async injectStyles(): Promise<void> {
    // Option 1: Link tag (separate network request)
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('src/content/overlay/overlay.css');
    this.shadow.appendChild(link);

    // Option 2: Adopted stylesheets (modern, no extra request)
    const cssText = await fetch(chrome.runtime.getURL('overlay.css')).then(r => r.text());
    const sheet = new CSSStyleSheet();
    await sheet.replace(cssText);
    this.shadow.adoptedStyleSheets = [sheet];
  }
}
```

```css
/* overlay.css - proper CSS file */
:host {
  all: initial;
  position: fixed;
  z-index: 999999;
}

.overlay-panel {
  position: fixed;
  right: 20px;
  top: 100px;
  width: var(--overlay-width, 350px);
  height: var(--overlay-height, 450px);
}

/* Theme via CSS custom properties */
:host(.dark) {
  --overlay-bg: #1f2937;
  --overlay-text: #f3f4f6;
}
```

### Benefits

- Proper syntax highlighting
- CSS linting catches errors
- Smaller JS bundle
- Hot reload for styles during development
- IDE autocomplete for class names
- Can use CSS nesting, variables, etc.

---

## State Management: Predictability

### Rule: State should be predictable and traceable

### Bad: Scattered Mutable State

```typescript
// BAD: State everywhere
let isActive = false;
let currentTab: number | null = null;
let lastError: string | null = null;
let retryCount = 0;

function startSession() {
  isActive = true;
  currentTab = getActiveTab();
  lastError = null;
  // What if this fails halfway? Inconsistent state!
}

function stopSession() {
  isActive = false;
  // Did we forget to clear currentTab?
  // Who sets lastError?
}
```

**Problems**:
- State changes are scattered
- Hard to know current state
- Easy to forget to update all variables
- Race conditions possible

### Good: State Machine

```typescript
// GOOD: Single source of truth
type SessionState = 'idle' | 'starting' | 'active' | 'stopping' | 'error';

interface SessionContext {
  tabId: number | null;
  error: string | null;
  startTime: number | null;
}

type SessionEvent =
  | { type: 'START'; tabId: number }
  | { type: 'STARTED' }
  | { type: 'STOP' }
  | { type: 'STOPPED' }
  | { type: 'ERROR'; error: string };

class SessionStateMachine {
  private state: SessionState = 'idle';
  private context: SessionContext = { tabId: null, error: null, startTime: null };

  transition(event: SessionEvent): void {
    const [nextState, nextContext] = this.reduce(event);

    console.log(`Session: ${this.state} -> ${nextState}`, event.type);

    this.state = nextState;
    this.context = nextContext;
    this.notifyListeners();
  }

  private reduce(event: SessionEvent): [SessionState, SessionContext] {
    // All state transitions in ONE place
    switch (this.state) {
      case 'idle':
        if (event.type === 'START') {
          return ['starting', { ...this.context, tabId: event.tabId, error: null }];
        }
        break;

      case 'starting':
        if (event.type === 'STARTED') {
          return ['active', { ...this.context, startTime: Date.now() }];
        }
        if (event.type === 'ERROR') {
          return ['error', { ...this.context, error: event.error }];
        }
        break;

      case 'active':
        if (event.type === 'STOP') {
          return ['stopping', this.context];
        }
        break;

      case 'stopping':
        if (event.type === 'STOPPED') {
          return ['idle', { tabId: null, error: null, startTime: null }];
        }
        break;
    }

    // Invalid transition - stay in current state
    console.warn(`Invalid transition: ${this.state} + ${event.type}`);
    return [this.state, this.context];
  }
}
```

### Benefits of State Machines

| Aspect | Scattered State | State Machine |
|--------|-----------------|---------------|
| Valid states | Unknown | Explicitly defined |
| Transitions | Implicit | Explicitly defined |
| Debugging | Hard | Easy (log transitions) |
| Testing | Complex | Simple (input → output) |
| Documentation | None | The machine IS documentation |

---

## Code Review Checklist

Use this checklist before submitting code for review:

### Functions
- [ ] Each function does ONE thing
- [ ] Function name describes what it does (verb + noun)
- [ ] No function exceeds 30 lines
- [ ] No more than 3 parameters (use object for more)
- [ ] Pure functions where possible (no side effects)

### Classes
- [ ] Single responsibility (one reason to change)
- [ ] Dependencies injected via constructor
- [ ] Public API is minimal and clear
- [ ] No `any` types
- [ ] Private members are actually private

### Files
- [ ] One concept per file
- [ ] No file exceeds 400 lines
- [ ] Related files grouped in directory
- [ ] Index file exports public API only

### Constants
- [ ] No magic numbers
- [ ] All constants have meaningful names
- [ ] Constants grouped in logical objects
- [ ] Marked as `const` or `as const`

### Error Handling
- [ ] Errors handled at appropriate level
- [ ] No silent failures (empty catch blocks)
- [ ] Error messages are actionable
- [ ] Recovery strategy for non-fatal errors

### Testing
- [ ] Unit tests for all public functions
- [ ] Edge cases covered
- [ ] Tests are independent (no shared state)
- [ ] Test names describe the scenario

### Style
- [ ] CSS in CSS files (not in JS)
- [ ] Consistent naming convention
- [ ] No commented-out code
- [ ] No TODO comments (create issues instead)

---

## Quick Reference Card

### Function Size
```
< 10 lines  →  Perfect
10-20 lines →  Good
20-30 lines →  Acceptable
> 30 lines  →  Refactor
```

### Class Size
```
< 100 lines →  Perfect
100-200     →  Good
200-300     →  Acceptable
> 300 lines →  Refactor
```

### File Size
```
< 200 lines →  Perfect
200-300     →  Good
300-400     →  Acceptable
> 400 lines →  Split it
```

### Cyclomatic Complexity (if/else/switch branches)
```
1-5   →  Simple, easy to test
6-10  →  Moderate, needs attention
> 10  →  Too complex, refactor
```

---

## Summary: The Professional Difference

Junior developers write code that **works**.

Senior developers write code that:
- **Works** (obviously)
- **Is testable** (dependencies injected)
- **Is readable** (small, named, documented)
- **Is maintainable** (single responsibility)
- **Fails gracefully** (proper error handling)
- **Is predictable** (explicit state management)

The difference between amateur and professional code isn't cleverness—it's discipline.

---

## Recommended Reading

1. **Clean Code** by Robert C. Martin — The classic
2. **Refactoring** by Martin Fowler — How to improve existing code
3. **A Philosophy of Software Design** by John Ousterhout — Complexity management
4. **The Pragmatic Programmer** by Hunt & Thomas — Professional practices

---

*"Any fool can write code that a computer can understand. Good programmers write code that humans can understand."* — Martin Fowler
