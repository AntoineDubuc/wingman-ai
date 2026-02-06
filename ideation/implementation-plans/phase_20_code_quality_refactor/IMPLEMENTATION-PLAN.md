# Phase 20: Code Quality Refactor

## From Functional MVP to Production-Grade Architecture

**Status**: Planning
**Priority**: High (Tech Debt)
**Estimated Effort**: 3-4 weeks
**Risk Level**: Medium (behavioral changes possible)

---

## Executive Summary

The Wingman AI extension is functionally complete and stable. However, the codebase exhibits classic "AI-assisted development" anti-patterns: monolithic files, god classes, embedded CSS, functions exceeding 200+ lines, and mixed abstraction levels. This plan transforms the codebase into a maintainable, testable, and extensible architecture that would pass senior engineering review at any top-tier company.

### Current State Metrics

| File | Lines | Largest Function | Violations |
|------|-------|------------------|------------|
| `overlay.ts` | 2,463 | `loadStyles()` — 812 lines | God class, CSS-in-JS, 5+ responsibilities |
| `gemini-client.ts` | 1,186 | `processTranscriptForPersona()` — 302 lines | Mixed concerns, untestable |
| `service-worker.ts` | 992 | `handleStartSession()` — 239 lines | Orchestration + business logic |
| `personas.ts` | 923 | Multiple 50+ line functions | UI + storage + validation mixed |
| `popup.ts` | 502 | Inline HTML templates | Mixed concerns |

### Target State Metrics

| Metric | Current | Target | Standard |
|--------|---------|--------|----------|
| Max file length | 2,463 | < 400 | < 500 |
| Max function length | 812 | < 50 | < 30 |
| Test coverage | ~5% | > 80% | > 70% |
| Cyclomatic complexity | High | Low | < 10 per function |
| Single Responsibility | Violated | Enforced | 1 class = 1 purpose |

---

## Architectural Principles

### 1. Single Responsibility Principle (SRP)
Every module, class, and function should have exactly one reason to change.

### 2. Separation of Concerns
- **View**: DOM manipulation, event binding, rendering
- **State**: Data storage, retrieval, caching
- **Logic**: Business rules, transformations, validations
- **Infrastructure**: API calls, WebSocket connections, Chrome APIs

### 3. Dependency Injection
Services receive dependencies via constructor, enabling:
- Unit testing with mocks
- Swappable implementations
- Clear dependency graphs

### 4. Interface Segregation
Define small, focused interfaces rather than large, monolithic ones.

### 5. Immutability by Default
Prefer `readonly`, `const`, and pure functions. Mutate only when necessary.

---

## Refactoring Plan

### Module 1: Overlay System Decomposition

**Current**: Single 2,463-line god class
**Target**: 8 focused modules with clear boundaries

#### 1.1 Extract CSS to Dedicated Stylesheet

**Problem**: 812-line CSS string embedded in `loadStyles()` function.

**Solution**: External CSS file with CSS Custom Properties for theming.

```
src/content/
├── overlay/
│   ├── index.ts              # Public API, orchestrates modules
│   ├── overlay.css           # All styles (extracted)
│   ├── overlay-panel.ts      # Panel DOM structure
│   ├── overlay-drag.ts       # Drag-and-drop behavior
│   ├── overlay-resize.ts     # Resize behavior
│   ├── overlay-theme.ts      # Theme switching logic
│   ├── overlay-header.ts     # Header with persona display
│   ├── overlay-transcripts.ts # Transcript rendering
│   ├── overlay-suggestions.ts # Suggestion cards
│   ├── overlay-summary.ts    # Post-call summary view
│   └── types.ts              # Shared interfaces
```

**CSS Injection Strategy**:
```typescript
// overlay-panel.ts
export class OverlayPanel {
  private shadow: ShadowRoot;

  constructor(host: HTMLElement) {
    this.shadow = host.attachShadow({ mode: 'closed' });
    this.injectStyles();
  }

  private async injectStyles(): Promise<void> {
    const cssUrl = chrome.runtime.getURL('src/content/overlay/overlay.css');
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    this.shadow.appendChild(link);
  }
}
```

**Migration Steps**:
1. Create `overlay.css` with all existing styles
2. Add to `web_accessible_resources` in manifest
3. Replace `loadStyles()` with stylesheet injection
4. Verify theme switching still works via CSS custom properties
5. Delete 812-line function

#### 1.2 Extract Drag Behavior

**Current**: Inline mouse event handlers in main class
**Target**: Reusable `Draggable` behavior class

```typescript
// overlay-drag.ts
export interface DraggableOptions {
  handle: HTMLElement;
  container: HTMLElement;
  onDragStart?: () => void;
  onDragEnd?: (position: { x: number; y: number }) => void;
  bounds?: { minX: number; maxX: number; minY: number; maxY: number };
}

export class Draggable {
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private initialX = 0;
  private initialY = 0;

  constructor(private options: DraggableOptions) {
    this.bindEvents();
  }

  private bindEvents(): void {
    this.options.handle.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  destroy(): void {
    this.options.handle.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  }

  private onMouseDown = (e: MouseEvent): void => { /* ... */ };
  private onMouseMove = (e: MouseEvent): void => { /* ... */ };
  private onMouseUp = (): void => { /* ... */ };
}
```

#### 1.3 Extract Transcript Rendering

**Current**: Mixed with suggestion and summary rendering
**Target**: Dedicated transcript module with virtualization support

```typescript
// overlay-transcripts.ts
export interface TranscriptEntry {
  id: string;
  speaker: string;
  text: string;
  timestamp: number;
  isSelf: boolean;
}

export class TranscriptRenderer {
  private container: HTMLElement;
  private entries: TranscriptEntry[] = [];
  private maxVisible = 100; // Virtualization threshold

  constructor(container: HTMLElement) {
    this.container = container;
  }

  addEntry(entry: TranscriptEntry): void {
    this.entries.push(entry);
    this.render(entry);
    this.pruneOldEntries();
  }

  private render(entry: TranscriptEntry): void {
    const bubble = this.createBubble(entry);
    this.container.appendChild(bubble);
    this.scrollToBottom();
  }

  private createBubble(entry: TranscriptEntry): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = `transcript-bubble ${entry.isSelf ? 'self' : 'other'}`;
    bubble.dataset.id = entry.id;

    bubble.innerHTML = `
      <span class="speaker">${this.escapeHtml(entry.speaker)}</span>
      <span class="text">${this.escapeHtml(entry.text)}</span>
    `;

    return bubble;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  clear(): void {
    this.entries = [];
    this.container.innerHTML = '';
  }
}
```

#### 1.4 Extract Summary View

**Current**: 300+ lines mixed with other rendering logic
**Target**: Self-contained summary component

```typescript
// overlay-summary.ts
export interface CallSummary {
  title: string;
  duration: string;
  overview: string;
  actionItems: string[];
  keyMoments: Array<{ timestamp: string; description: string }>;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export class SummaryView {
  private container: HTMLElement;
  private summary: CallSummary | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.bindEvents();
  }

  show(summary: CallSummary): void {
    this.summary = summary;
    this.render();
  }

  hide(): void {
    this.container.hidden = true;
  }

  private render(): void {
    if (!this.summary) return;

    this.container.innerHTML = this.buildHtml(this.summary);
    this.container.hidden = false;
  }

  private buildHtml(summary: CallSummary): string {
    return `
      <div class="summary-header">
        <h3>${this.escapeHtml(summary.title)}</h3>
        <span class="duration">${summary.duration}</span>
      </div>
      <div class="summary-overview">${this.escapeHtml(summary.overview)}</div>
      ${this.buildActionItems(summary.actionItems)}
      ${this.buildKeyMoments(summary.keyMoments)}
      <div class="summary-actions">
        <button class="copy-btn">Copy</button>
        <button class="drive-btn">Save to Drive</button>
      </div>
    `;
  }

  private bindEvents(): void {
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('copy-btn')) this.copyToClipboard();
      if (target.classList.contains('drive-btn')) this.saveToDrive();
    });
  }
}
```

#### 1.5 Orchestrator Pattern

**Target**: Thin coordinator that composes modules

```typescript
// overlay/index.ts
export class Overlay {
  private panel: OverlayPanel;
  private drag: Draggable;
  private transcripts: TranscriptRenderer;
  private suggestions: SuggestionRenderer;
  private summary: SummaryView;
  private theme: ThemeManager;

  constructor(private host: HTMLElement) {
    this.panel = new OverlayPanel(host);
    this.drag = new Draggable({
      handle: this.panel.header,
      container: this.panel.container,
    });
    this.transcripts = new TranscriptRenderer(this.panel.transcriptArea);
    this.suggestions = new SuggestionRenderer(this.panel.suggestionArea);
    this.summary = new SummaryView(this.panel.summaryArea);
    this.theme = new ThemeManager(this.panel.shadow);
  }

  // Public API - thin wrappers
  addTranscript(entry: TranscriptEntry): void {
    this.transcripts.addEntry(entry);
  }

  showSuggestion(suggestion: Suggestion): void {
    this.suggestions.show(suggestion);
  }

  showSummary(summary: CallSummary): void {
    this.summary.show(summary);
  }

  destroy(): void {
    this.drag.destroy();
    this.host.remove();
  }
}
```

---

### Module 2: Gemini Client Decomposition

**Current**: 1,186-line monolith handling 3 providers, embeddings, and summaries
**Target**: Provider-agnostic architecture with pluggable backends

#### 2.1 Provider Abstraction

```
src/services/llm/
├── index.ts                  # Public API
├── types.ts                  # Shared interfaces
├── base-provider.ts          # Abstract base class
├── providers/
│   ├── gemini-provider.ts    # Gemini implementation
│   ├── openrouter-provider.ts # OpenRouter implementation
│   └── groq-provider.ts      # Groq implementation
├── suggestion-generator.ts   # Orchestrates suggestion flow
├── embedding-service.ts      # Vector embeddings
├── summary-generator.ts      # Call summary generation
└── retry-handler.ts          # Exponential backoff utility
```

#### 2.2 Provider Interface

```typescript
// types.ts
export interface LLMProvider {
  readonly name: string;
  readonly supportsStreaming: boolean;

  configure(apiKey: string, model?: string): void;

  generateCompletion(request: CompletionRequest): Promise<CompletionResponse>;

  generateEmbedding?(text: string): Promise<number[]>;
}

export interface CompletionRequest {
  systemPrompt: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionResponse {
  text: string;
  usage: TokenUsage;
  finishReason: 'stop' | 'length' | 'error';
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}
```

#### 2.3 Base Provider with Common Logic

```typescript
// base-provider.ts
export abstract class BaseProvider implements LLMProvider {
  abstract readonly name: string;
  abstract readonly supportsStreaming: boolean;

  protected apiKey: string = '';
  protected model: string = '';
  protected retryHandler: RetryHandler;

  constructor() {
    this.retryHandler = new RetryHandler({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
    });
  }

  configure(apiKey: string, model?: string): void {
    this.apiKey = apiKey;
    if (model) this.model = model;
  }

  async generateCompletion(request: CompletionRequest): Promise<CompletionResponse> {
    return this.retryHandler.execute(() => this.doGenerateCompletion(request));
  }

  protected abstract doGenerateCompletion(request: CompletionRequest): Promise<CompletionResponse>;

  protected abstract buildRequestBody(request: CompletionRequest): unknown;

  protected abstract parseResponse(data: unknown): CompletionResponse;
}
```

#### 2.4 Gemini Provider Implementation

```typescript
// providers/gemini-provider.ts
export class GeminiProvider extends BaseProvider {
  readonly name = 'gemini';
  readonly supportsStreaming = false;

  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  protected async doGenerateCompletion(request: CompletionRequest): Promise<CompletionResponse> {
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
    const body = this.buildRequestBody(request);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new ProviderError(this.name, response.status, await response.text());
    }

    return this.parseResponse(await response.json());
  }

  protected buildRequestBody(request: CompletionRequest): GeminiRequestBody {
    return {
      systemInstruction: { parts: [{ text: request.systemPrompt }] },
      contents: request.messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 1024,
      },
    };
  }

  protected parseResponse(data: GeminiResponse): CompletionResponse {
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return {
      text,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
      finishReason: this.mapFinishReason(data.candidates?.[0]?.finishReason),
    };
  }
}
```

#### 2.5 Suggestion Generator (Business Logic)

```typescript
// suggestion-generator.ts
export class SuggestionGenerator {
  private provider: LLMProvider;
  private history: Message[] = [];
  private lastSuggestionTime = 0;
  private cooldownMs = 15000;

  constructor(
    private providerFactory: () => LLMProvider,
    private kbSearch: KBSearchService,
    private config: SuggestionConfig,
  ) {
    this.provider = providerFactory();
  }

  async generateSuggestion(transcript: Transcript): Promise<Suggestion | null> {
    if (!this.shouldGenerate(transcript)) {
      return null;
    }

    const kbContext = await this.getKBContext(transcript.text);
    const systemPrompt = this.buildSystemPrompt(kbContext);

    const response = await this.provider.generateCompletion({
      systemPrompt,
      messages: [...this.history, { role: 'user', content: transcript.text }],
      temperature: 0.7,
    });

    this.updateHistory(transcript, response);
    this.lastSuggestionTime = Date.now();

    return this.parseSuggestion(response.text);
  }

  private shouldGenerate(transcript: Transcript): boolean {
    if (!transcript.isFinal) return false;
    if (transcript.text.trim().length < 10) return false;
    if (Date.now() - this.lastSuggestionTime < this.cooldownMs) return false;
    return true;
  }

  private async getKBContext(query: string): Promise<string> {
    try {
      const results = await this.kbSearch.search(query, { limit: 3 });
      return results.map(r => `[${r.filename}]: ${r.content}`).join('\n\n');
    } catch {
      return '';
    }
  }
}
```

#### 2.6 Retry Handler Utility

```typescript
// retry-handler.ts
export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryOn?: (error: Error) => boolean;
}

export class RetryHandler {
  constructor(private options: RetryOptions) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (!this.shouldRetry(error as Error, attempt)) {
          throw error;
        }

        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private shouldRetry(error: Error, attempt: number): boolean {
    if (attempt >= this.options.maxRetries) return false;
    if (this.options.retryOn) return this.options.retryOn(error);
    return this.isRetryableError(error);
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('rate limit') ||
           message.includes('timeout') ||
           message.includes('503') ||
           message.includes('429');
  }

  private calculateDelay(attempt: number): number {
    const delay = this.options.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * delay;
    return Math.min(delay + jitter, this.options.maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

### Module 3: Service Worker Decomposition

**Current**: 992-line orchestrator mixing session management, message routing, and business logic
**Target**: Clean separation of concerns with event-driven architecture

#### 3.1 Target Structure

```
src/background/
├── service-worker.ts         # Entry point, message router only
├── session/
│   ├── session-manager.ts    # Session lifecycle
│   ├── session-state.ts      # State machine
│   └── session-events.ts     # Event definitions
├── handlers/
│   ├── transcript-handler.ts # Transcript processing
│   ├── audio-handler.ts      # Audio chunk routing
│   └── command-handler.ts    # User commands
├── services/
│   └── tab-manager.ts        # Tab tracking, cleanup
└── utils/
    └── message-router.ts     # Type-safe message routing
```

#### 3.2 Message Router Pattern

```typescript
// utils/message-router.ts
type MessageHandler<T, R> = (payload: T, sender: chrome.runtime.MessageSender) => Promise<R>;

interface RouteDefinition<T, R> {
  type: string;
  handler: MessageHandler<T, R>;
}

export class MessageRouter {
  private routes = new Map<string, MessageHandler<unknown, unknown>>();

  register<T, R>(type: string, handler: MessageHandler<T, R>): void {
    this.routes.set(type, handler as MessageHandler<unknown, unknown>);
  }

  async handle(message: { type: string; [key: string]: unknown }, sender: chrome.runtime.MessageSender): Promise<unknown> {
    const handler = this.routes.get(message.type);

    if (!handler) {
      console.warn(`No handler for message type: ${message.type}`);
      return { success: false, error: 'Unknown message type' };
    }

    try {
      return await handler(message, sender);
    } catch (error) {
      console.error(`Handler error for ${message.type}:`, error);
      return { success: false, error: String(error) };
    }
  }
}
```

#### 3.3 Session State Machine

```typescript
// session/session-state.ts
export type SessionState = 'idle' | 'starting' | 'active' | 'stopping' | 'error';

export interface SessionContext {
  tabId: number | null;
  startTime: number | null;
  personas: string[];
  error: string | null;
}

export type SessionEvent =
  | { type: 'START'; tabId: number }
  | { type: 'STARTED' }
  | { type: 'STOP' }
  | { type: 'STOPPED' }
  | { type: 'ERROR'; error: string }
  | { type: 'TAB_CLOSED' };

export class SessionStateMachine {
  private state: SessionState = 'idle';
  private context: SessionContext = {
    tabId: null,
    startTime: null,
    personas: [],
    error: null,
  };
  private listeners = new Set<(state: SessionState, context: SessionContext) => void>();

  getState(): SessionState {
    return this.state;
  }

  getContext(): Readonly<SessionContext> {
    return { ...this.context };
  }

  transition(event: SessionEvent): void {
    const [nextState, nextContext] = this.reduce(this.state, this.context, event);

    if (nextState !== this.state) {
      console.log(`Session: ${this.state} -> ${nextState}`, event.type);
      this.state = nextState;
      this.context = nextContext;
      this.notify();
    }
  }

  private reduce(
    state: SessionState,
    context: SessionContext,
    event: SessionEvent,
  ): [SessionState, SessionContext] {
    switch (state) {
      case 'idle':
        if (event.type === 'START') {
          return ['starting', { ...context, tabId: event.tabId, error: null }];
        }
        break;

      case 'starting':
        if (event.type === 'STARTED') {
          return ['active', { ...context, startTime: Date.now() }];
        }
        if (event.type === 'ERROR') {
          return ['error', { ...context, error: event.error }];
        }
        break;

      case 'active':
        if (event.type === 'STOP' || event.type === 'TAB_CLOSED') {
          return ['stopping', context];
        }
        break;

      case 'stopping':
        if (event.type === 'STOPPED') {
          return ['idle', { tabId: null, startTime: null, personas: [], error: null }];
        }
        break;

      case 'error':
        if (event.type === 'STOP') {
          return ['idle', { tabId: null, startTime: null, personas: [], error: null }];
        }
        break;
    }

    return [state, context];
  }

  subscribe(listener: (state: SessionState, context: SessionContext) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state, this.context);
    }
  }
}
```

#### 3.4 Session Manager

```typescript
// session/session-manager.ts
export class SessionManager {
  private stateMachine = new SessionStateMachine();
  private deepgramClient: DeepgramClient;
  private suggestionGenerator: SuggestionGenerator;
  private transcriptCollector: TranscriptCollector;

  constructor(
    private deps: {
      deepgramClient: DeepgramClient;
      suggestionGenerator: SuggestionGenerator;
      transcriptCollector: TranscriptCollector;
      tabManager: TabManager;
    },
  ) {
    this.deepgramClient = deps.deepgramClient;
    this.suggestionGenerator = deps.suggestionGenerator;
    this.transcriptCollector = deps.transcriptCollector;

    this.setupTabListeners();
  }

  async start(tabId: number): Promise<{ success: boolean; error?: string }> {
    if (this.stateMachine.getState() !== 'idle') {
      return { success: false, error: 'Session already active' };
    }

    this.stateMachine.transition({ type: 'START', tabId });

    try {
      await this.initializeServices(tabId);
      this.stateMachine.transition({ type: 'STARTED' });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.stateMachine.transition({ type: 'ERROR', error: message });
      return { success: false, error: message };
    }
  }

  async stop(): Promise<{ success: boolean }> {
    this.stateMachine.transition({ type: 'STOP' });

    await this.cleanupServices();

    this.stateMachine.transition({ type: 'STOPPED' });
    return { success: true };
  }

  getStatus(): { state: SessionState; context: SessionContext } {
    return {
      state: this.stateMachine.getState(),
      context: this.stateMachine.getContext(),
    };
  }

  private async initializeServices(tabId: number): Promise<void> {
    // Load API keys, connect Deepgram, inject content script, etc.
    // Each step is a small, focused method
  }

  private async cleanupServices(): Promise<void> {
    // Disconnect Deepgram, generate summary, save to Drive, etc.
  }

  private setupTabListeners(): void {
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (tabId === this.stateMachine.getContext().tabId) {
        this.stateMachine.transition({ type: 'TAB_CLOSED' });
        this.cleanupServices();
      }
    });
  }
}
```

#### 3.5 Thin Service Worker Entry Point

```typescript
// service-worker.ts
import { MessageRouter } from './utils/message-router';
import { SessionManager } from './session/session-manager';
import { TranscriptHandler } from './handlers/transcript-handler';
import { AudioHandler } from './handlers/audio-handler';

// Initialize dependencies
const sessionManager = new SessionManager({ /* deps */ });
const transcriptHandler = new TranscriptHandler(sessionManager);
const audioHandler = new AudioHandler(sessionManager);

// Configure routes
const router = new MessageRouter();

router.register('START_SESSION', async (_, sender) => {
  const tabId = sender.tab?.id;
  if (!tabId) return { success: false, error: 'No tab ID' };
  return sessionManager.start(tabId);
});

router.register('STOP_SESSION', async () => {
  return sessionManager.stop();
});

router.register('GET_STATUS', async () => {
  return sessionManager.getStatus();
});

router.register('AUDIO_CHUNK', async (message) => {
  audioHandler.handle(message.buffer);
});

// Single listener - all routing delegated
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  router.handle(message, sender).then(sendResponse);
  return true;
});
```

---

### Module 4: Constants and Configuration

**Current**: Magic numbers scattered throughout codebase
**Target**: Centralized, typed configuration

#### 4.1 Constants File

```typescript
// src/shared/constants.ts
export const TIMING = {
  SUGGESTION_COOLDOWN_MS: 15_000,
  DEEPGRAM_ENDPOINTING_MS: 700,
  RETRY_BASE_DELAY_MS: 1_000,
  RETRY_MAX_DELAY_MS: 30_000,
  COST_UPDATE_INTERVAL_MS: 5_000,
} as const;

export const LIMITS = {
  MIN_TRANSCRIPT_WORDS: 2,
  MIN_PROMPT_LENGTH: 50,
  MAX_PROMPT_LENGTH: 20_000,
  MAX_HISTORY_TURNS: 20,
  MAX_KB_RESULTS: 3,
  SUMMARY_FIRST_ENTRIES: 50,
  SUMMARY_LAST_ENTRIES: 400,
} as const;

export const AUDIO = {
  SAMPLE_RATE: 16_000,
  CHANNELS: 1,
  BIT_DEPTH: 16,
} as const;

export const UI = {
  OVERLAY_DEFAULT_WIDTH: 350,
  OVERLAY_DEFAULT_HEIGHT: 450,
  OVERLAY_MIN_WIDTH: 280,
  OVERLAY_MIN_HEIGHT: 200,
  OVERLAY_MAX_WIDTH: 600,
  FONT_SIZE_MIN: 12,
  FONT_SIZE_MAX: 18,
  FONT_SIZE_DEFAULT: 14,
} as const;

export const STORAGE_KEYS = {
  DEEPGRAM_API_KEY: 'deepgramApiKey',
  GEMINI_API_KEY: 'geminiApiKey',
  OPENROUTER_API_KEY: 'openrouterApiKey',
  GROQ_API_KEY: 'groqApiKey',
  LLM_PROVIDER: 'llmProvider',
  PERSONAS: 'personas',
  ACTIVE_PERSONA_IDS: 'activePersonaIds',
  THEME: 'theme',
} as const;
```

#### 4.2 Type-Safe Storage Access

```typescript
// src/shared/storage.ts
import { STORAGE_KEYS } from './constants';

type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

interface StorageSchema {
  [STORAGE_KEYS.DEEPGRAM_API_KEY]: string;
  [STORAGE_KEYS.GEMINI_API_KEY]: string;
  [STORAGE_KEYS.OPENROUTER_API_KEY]: string;
  [STORAGE_KEYS.GROQ_API_KEY]: string;
  [STORAGE_KEYS.LLM_PROVIDER]: 'gemini' | 'openrouter' | 'groq';
  [STORAGE_KEYS.PERSONAS]: Persona[];
  [STORAGE_KEYS.ACTIVE_PERSONA_IDS]: string[];
  [STORAGE_KEYS.THEME]: 'light' | 'dark';
}

export async function getStorageValue<K extends StorageKey>(
  key: K,
): Promise<StorageSchema[K] | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as StorageSchema[K] | undefined;
}

export async function setStorageValue<K extends StorageKey>(
  key: K,
  value: StorageSchema[K],
): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}
```

---

### Module 5: Testing Infrastructure

**Current**: ~5% coverage, mostly validation tests
**Target**: 80%+ coverage with unit, integration, and E2E tests

#### 5.1 Test Structure

```
tests/
├── unit/
│   ├── services/
│   │   ├── suggestion-generator.test.ts
│   │   ├── retry-handler.test.ts
│   │   └── providers/
│   │       ├── gemini-provider.test.ts
│   │       └── openrouter-provider.test.ts
│   ├── overlay/
│   │   ├── transcript-renderer.test.ts
│   │   ├── suggestion-renderer.test.ts
│   │   └── draggable.test.ts
│   └── background/
│       ├── session-state-machine.test.ts
│       └── message-router.test.ts
├── integration/
│   ├── session-flow.test.ts
│   ├── kb-search.test.ts
│   └── persona-lifecycle.test.ts
├── e2e/
│   └── google-meet-session.test.ts
├── mocks/
│   ├── chrome-api.ts
│   ├── fetch.ts
│   └── websocket.ts
└── fixtures/
    ├── personas.ts
    ├── transcripts.ts
    └── api-responses.ts
```

#### 5.2 Example Unit Test

```typescript
// tests/unit/services/retry-handler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetryHandler } from '@/services/llm/retry-handler';

describe('RetryHandler', () => {
  let handler: RetryHandler;

  beforeEach(() => {
    handler = new RetryHandler({
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 1000,
    });
    vi.useFakeTimers();
  });

  it('returns immediately on success', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await handler.execute(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on rate limit error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('rate limit exceeded'))
      .mockResolvedValueOnce('success');

    const promise = handler.execute(fn);
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('rate limit'));

    const promise = handler.execute(fn);
    await vi.advanceTimersByTimeAsync(10000);

    await expect(promise).rejects.toThrow('rate limit');
    expect(fn).toHaveBeenCalledTimes(4); // initial + 3 retries
  });

  it('does not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('invalid API key'));

    await expect(handler.execute(fn)).rejects.toThrow('invalid API key');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
```

#### 5.3 Example Integration Test

```typescript
// tests/integration/session-flow.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from '@/background/session/session-manager';
import { mockChromeApi } from '../mocks/chrome-api';
import { mockDeepgramClient } from '../mocks/deepgram';

describe('Session Flow', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    mockChromeApi();
    sessionManager = new SessionManager({
      deepgramClient: mockDeepgramClient(),
      // ... other mocked deps
    });
  });

  it('completes full session lifecycle', async () => {
    // Start session
    const startResult = await sessionManager.start(123);
    expect(startResult.success).toBe(true);
    expect(sessionManager.getStatus().state).toBe('active');

    // Simulate transcript processing
    // ...

    // Stop session
    const stopResult = await sessionManager.stop();
    expect(stopResult.success).toBe(true);
    expect(sessionManager.getStatus().state).toBe('idle');
  });
});
```

---

### Module 6: Documentation Standards

#### 6.1 JSDoc Requirements

Every exported function and class must have JSDoc with:
- One-line description
- `@param` for each parameter
- `@returns` description
- `@throws` for expected errors
- `@example` for non-obvious usage

```typescript
/**
 * Generates a contextual suggestion based on the conversation transcript.
 *
 * @param transcript - The latest transcript entry from the call
 * @returns A suggestion object, or null if no suggestion is warranted
 * @throws {ProviderError} If the LLM provider returns an error
 *
 * @example
 * const suggestion = await generator.generateSuggestion({
 *   text: "What's your pricing?",
 *   speaker: "Customer",
 *   isFinal: true,
 * });
 */
async generateSuggestion(transcript: Transcript): Promise<Suggestion | null> {
  // ...
}
```

#### 6.2 Architecture Decision Records (ADRs)

Create `docs/adr/` directory for significant decisions:

```markdown
# ADR-001: Provider Abstraction Pattern

## Status
Accepted

## Context
The extension supports multiple LLM providers (Gemini, OpenRouter, Groq) with different APIs.

## Decision
Implement a provider abstraction with:
- Common interface (`LLMProvider`)
- Base class with shared logic (`BaseProvider`)
- Provider-specific implementations

## Consequences
- Easy to add new providers
- Shared retry logic
- Slightly more code than direct implementation
```

---

## Migration Strategy

### Phase 1: Foundation (Week 1)
1. Extract constants to `shared/constants.ts`
2. Create type-safe storage utilities
3. Set up testing infrastructure
4. Extract `overlay.css` from overlay.ts

### Phase 2: Overlay Decomposition (Week 2)
1. Extract `Draggable` utility
2. Extract `TranscriptRenderer`
3. Extract `SuggestionRenderer`
4. Extract `SummaryView`
5. Create `Overlay` orchestrator
6. Delete original 2,463-line file

### Phase 3: LLM Refactor (Week 3)
1. Create provider interface and base class
2. Implement `GeminiProvider`
3. Implement `OpenRouterProvider`
4. Implement `GroqProvider`
5. Extract `SuggestionGenerator`
6. Extract `RetryHandler`
7. Migrate gemini-client.ts callers

### Phase 4: Service Worker (Week 4)
1. Implement `SessionStateMachine`
2. Implement `SessionManager`
3. Create `MessageRouter`
4. Extract handlers
5. Migrate service-worker.ts

### Phase 5: Validation & Cleanup
1. Achieve 80% test coverage
2. Add JSDoc to all exports
3. Create ADRs
4. Update CLAUDE.md

---

## Success Criteria

### Quantitative
- [ ] No file exceeds 400 lines
- [ ] No function exceeds 50 lines
- [ ] Test coverage > 80%
- [ ] Zero TypeScript `any` types (except vendor)
- [ ] All exports have JSDoc

### Qualitative
- [ ] New developer can understand architecture in 30 minutes
- [ ] Adding a new LLM provider takes < 2 hours
- [ ] Each module can be tested in isolation
- [ ] Code review approval from senior engineer

---

## API Compatibility Requirements

**CRITICAL**: These public APIs must be preserved exactly to avoid breaking changes.

### Overlay Public API (content-script.ts depends on these)

The `AIOverlay` class is instantiated in `content-script.ts` and the following must remain unchanged:

```typescript
// Required exports from overlay module
export interface Suggestion { /* ... */ }
export interface Transcript { /* ... */ }
export class AIOverlay {
  public container: HTMLDivElement;

  constructor(onClose?: () => void);

  // These methods are called from content-script.ts
  forceShow(): void;
  updateTranscript(data: Transcript): void;
  showTimelineView(): void;
  showLoading(): void;
  showSummary(data: CallSummary): void;
  showSummaryError(message: string): void;
  updateDriveStatus(data: DriveStatus): void;
  updateCost(data: CostData): void;
}
```

**Migration strategy**: The new `overlay/index.ts` must re-export `AIOverlay` with identical signature. Internal decomposition is hidden behind this facade.

### Gemini Client Public API (service-worker.ts depends on these)

The singleton `geminiClient` is imported in `service-worker.ts` with 16+ call sites:

```typescript
// Required exports from gemini-client module
export const geminiClient: {
  startSession(): void;
  clearSession(): void;
  loadProviderConfig(): Promise<void>;
  setSystemPrompt(prompt: string): void;
  setKBDocumentFilter(documentIds: string[] | null): void;
  getActiveProvider(): LLMProvider;
  getActiveModel(): string;
  loadSystemPrompt(): Promise<void>;
  processTranscript(text: string, speaker: string, isFinal: boolean): Promise<Suggestion | null>;
  processTranscriptForPersona(text: string, speaker: string, isFinal: boolean, persona: Persona): Promise<Suggestion | null>;
  generateCallSummary(transcripts: Transcript[], personas: Persona[]): Promise<string>;
};
```

**Migration strategy**: Create a `LLMFacade` class that wraps the new provider architecture but exposes the same API. Export `geminiClient` as an instance of this facade.

### Manifest Updates Required

The CSS extraction requires adding to `web_accessible_resources`:

```json
{
  "web_accessible_resources": [
    {
      "resources": [
        "src/content/audio-processor.worklet.js",
        "src/content/overlay/overlay.css"  // ADD THIS
      ],
      "matches": ["https://meet.google.com/*"]
    }
  ]
}
```

### Message Types (service-worker.ts → content-script.ts)

These lowercase message types must remain unchanged:

| Type | Direction | Data |
|------|-----------|------|
| `transcript` | SW → CS | `{ text, speaker, isSelf }` |
| `suggestion` | SW → CS | `Suggestion` object |
| `summary` | SW → CS | `CallSummary` object |
| `summary_error` | SW → CS | `{ message }` |
| `drive_status` | SW → CS | `{ status, url?, error? }` |
| `cost_update` | SW → CS | `{ totalCost, breakdown }` |
| `show_loading` | SW → CS | `{}` |
| `show_timeline` | SW → CS | `{}` |

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **API breaking change** | Medium | **Critical** | Preserve public APIs exactly as documented above |
| Behavioral regression | Medium | High | Comprehensive test suite before refactor |
| Performance degradation | Low | Medium | Benchmark before/after |
| Incomplete migration | Medium | Medium | Feature flags for gradual rollout |
| Time overrun | Medium | Low | Prioritize highest-impact modules first |
| CSS not loading in shadow DOM | Medium | High | Test on Meet page, verify `chrome.runtime.getURL()` works |

---

## Appendix: File-by-File Migration Checklist

### overlay.ts (2,463 → ~200 lines)
- [ ] **FIRST**: Document current public API (see API Compatibility section)
- [ ] **FIRST**: Write integration tests for current behavior
- [ ] Add `overlay.css` to `web_accessible_resources` in manifest.json
- [ ] Extract CSS to `overlay.css`
- [ ] Extract `Draggable` class
- [ ] Extract `TranscriptRenderer` class
- [ ] Extract `SuggestionRenderer` class
- [ ] Extract `SummaryView` class
- [ ] Extract `ThemeManager` class
- [ ] Create `AIOverlay` facade in `overlay/index.ts` (preserves public API)
- [ ] Re-export `Suggestion` and `Transcript` interfaces
- [ ] Write unit tests for each extracted class
- [ ] Verify content-script.ts works without changes
- [ ] Delete original monolithic file

### gemini-client.ts (1,186 → ~150 lines)
- [ ] **FIRST**: Document all 16+ call sites in service-worker.ts
- [ ] **FIRST**: Write integration tests for current behavior
- [ ] Create `LLMProvider` interface
- [ ] Create `BaseProvider` abstract class
- [ ] Implement `GeminiProvider`
- [ ] Implement `OpenRouterProvider`
- [ ] Implement `GroqProvider`
- [ ] Extract `RetryHandler`
- [ ] Extract `SuggestionGenerator`
- [ ] Extract `EmbeddingService`
- [ ] Extract `SummaryGenerator`
- [ ] Create `LLMFacade` that wraps new architecture
- [ ] **Export `geminiClient` singleton with identical API** (see API Compatibility section)
- [ ] Write tests for each class
- [ ] Verify service-worker.ts works without changes
- [ ] Delete original file

### service-worker.ts (992 → ~100 lines)
- [ ] Create `SessionStateMachine`
- [ ] Create `SessionManager`
- [ ] Create `MessageRouter`
- [ ] Extract `TranscriptHandler`
- [ ] Extract `AudioHandler`
- [ ] Extract `TabManager`
- [ ] Write tests for each class
- [ ] Delete original monolith code

### personas.ts (923 → ~300 lines)
- [ ] Extract `PersonaStorage` class
- [ ] Extract `PersonaValidator` class
- [ ] Extract `PersonaImportExport` class
- [ ] Extract `PersonaEditorUI` class
- [ ] Write tests for storage and validation
- [ ] Delete original file

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-02-05 | Claude | Initial plan |
