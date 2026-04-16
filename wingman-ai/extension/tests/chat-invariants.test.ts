/**
 * Tests for Plan 4, Task 6: No-truncation + rolling-context invariants
 *
 * Architectural invariant tests:
 * - No truncation of transcript/KB/web/history content
 * - Rolling context (fresh read per call, no caching)
 * - Toggle independence (prior messages unaffected by toggle changes)
 * - Grep audit for forbidden truncation patterns
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

const mockGetSnapshot = vi.fn();
vi.mock('../src/content/overlay/transcript-buffer', () => ({
  transcriptBuffer: {
    getSnapshot: () => mockGetSnapshot(),
  },
}));

const mockSearchKB = vi.fn();
vi.mock('../src/services/kb/kb-search', () => ({
  searchKB: (...args: unknown[]) => mockSearchKB(...args),
}));

const mockWebSearch = vi.fn();
const mockFormatResults = vi.fn();
vi.mock('../src/services/web-search', () => ({
  webSearch: (...args: unknown[]) => mockWebSearch(...args),
  formatResultsForPrompt: (...args: unknown[]) => mockFormatResults(...args),
}));

const mockGetPersonas = vi.fn();
const mockGetActivePersonas = vi.fn();
vi.mock('../src/shared/persona', () => ({
  getPersonas: () => mockGetPersonas(),
  getActivePersonas: () => mockGetActivePersonas(),
}));

// Mock geminiClient and costTracker for pipeline integration
const mockStreamChat = vi.fn();
vi.mock('../src/services/gemini-client', () => ({
  geminiClient: {
    streamChat: (...args: unknown[]) => mockStreamChat(...args),
  },
}));

const mockAddLLMUsage = vi.fn();
vi.mock('../src/services/cost-tracker', () => ({
  costTracker: {
    addLLMUsage: (...args: unknown[]) => mockAddLLMUsage(...args),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
import { assembleChatContext } from '../src/services/chat-context-assembler';
import { AssistantView } from '../src/content/overlay/assistant-view';
import { registerChatPipeline } from '../src/services/chat-pipeline';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function* fakeStream(chunks: Array<{ delta: string; done: boolean; usage?: { inputTokens: number; outputTokens: number } }>) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('No-truncation + rolling-context invariants — Task 6', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSnapshot.mockReturnValue([]);
    mockSearchKB.mockResolvedValue([]);
    mockWebSearch.mockResolvedValue([]);
    mockFormatResults.mockReturnValue('');
    mockGetPersonas.mockResolvedValue([]);
    mockGetActivePersonas.mockResolvedValue([]);
    document.body.innerHTML = '';
  });

  // -------------------------------------------------------------------------
  // Grep audit: no truncation patterns in assembler or pipeline
  // -------------------------------------------------------------------------
  it('grep audit: no truncation patterns in assembler or pipeline', () => {
    const cwd = process.cwd().replace(/\/tests$/, '');
    const extensionDir = cwd.includes('wingman-ai/extension')
      ? cwd
      : cwd + '/wingman-ai/extension';

    // grep for truncation patterns — should find ZERO matches
    let output = '';
    try {
      output = execSync(
        'grep -n "truncate\\|slice\\|substring\\|\\.substr\\|summarize\\|window\\|evict" ' +
        'src/services/chat-context-assembler.ts src/services/chat-pipeline.ts 2>/dev/null || true',
        { cwd: extensionDir, encoding: 'utf-8' },
      );
    } catch {
      // grep returns exit code 1 when no matches — that's what we want
      output = '';
    }

    // Filter out comments and non-content lines
    const significantLines = output
      .split('\n')
      .filter(line => line.trim().length > 0)
      // Allow "// no truncation" comments — they're documentation, not truncation code
      .filter(line => !line.includes('//') || line.indexOf('//') > line.indexOf('truncate'));

    expect(significantLines).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // No-truncation: 5000 transcript entries all appear in prompt
  // -------------------------------------------------------------------------
  it('5000 transcript entries all appear in prompt (no truncation)', async () => {
    const entries = Array.from({ length: 5000 }, (_, i) => ({
      text: `Entry number ${i}`,
      speaker: 'Speaker',
      timestamp: '2026-04-15T10:00:00Z',
      is_final: true,
      is_self: false,
    }));
    mockGetSnapshot.mockReturnValue(entries);

    const result = await assembleChatContext({
      userText: 'summarize',
      ctx: { transcript: true, personaIds: [], web: false },
      chatHistory: [],
    });

    // Count unique entry markers in the prompt
    const entryCount = (result.systemPrompt.match(/Entry number \d+/g) || []).length;
    expect(entryCount).toBe(5000);

    // Verify specific entries exist
    expect(result.systemPrompt).toContain('Entry number 0');
    expect(result.systemPrompt).toContain('Entry number 2500');
    expect(result.systemPrompt).toContain('Entry number 4999');
  });

  // -------------------------------------------------------------------------
  // Rolling context: second call has more content than first
  // -------------------------------------------------------------------------
  it('second assembler call includes entries appended after first call', async () => {
    // First call: 3 entries
    mockGetSnapshot.mockReturnValue([
      { text: 'A', speaker: 'X', timestamp: '2026-04-15T10:00:00Z', is_final: true, is_self: false },
      { text: 'B', speaker: 'Y', timestamp: '2026-04-15T10:00:01Z', is_final: true, is_self: false },
      { text: 'C', speaker: 'X', timestamp: '2026-04-15T10:00:02Z', is_final: true, is_self: false },
    ]);

    const r1 = await assembleChatContext({
      userText: 'q1',
      ctx: { transcript: true, personaIds: [], web: false },
      chatHistory: [],
    });

    // Between calls: buffer grows by 1 entry
    mockGetSnapshot.mockReturnValue([
      { text: 'A', speaker: 'X', timestamp: '2026-04-15T10:00:00Z', is_final: true, is_self: false },
      { text: 'B', speaker: 'Y', timestamp: '2026-04-15T10:00:01Z', is_final: true, is_self: false },
      { text: 'C', speaker: 'X', timestamp: '2026-04-15T10:00:02Z', is_final: true, is_self: false },
      { text: 'D', speaker: 'Y', timestamp: '2026-04-15T10:00:03Z', is_final: true, is_self: false },
    ]);

    const r2 = await assembleChatContext({
      userText: 'q2',
      ctx: { transcript: true, personaIds: [], web: false },
      chatHistory: [],
    });

    expect(r2.stats.transcriptChars).toBeGreaterThan(r1.stats.transcriptChars);
    expect(r2.systemPrompt).toContain('D');
    expect(r1.systemPrompt).not.toContain('10:00:03');
    expect(r2.systemPrompt).toContain('10:00:03');
  });

  // -------------------------------------------------------------------------
  // Toggle independence: prior message tags unchanged after toggle change
  // -------------------------------------------------------------------------
  it('toggling transcript OFF does not change prior message source tags', async () => {
    // Setup transcript
    mockGetSnapshot.mockReturnValue([
      { text: 'Meeting', speaker: 'A', timestamp: '2026-04-15T10:00:00Z', is_final: true, is_self: false },
    ]);

    mockStreamChat.mockReturnValue(fakeStream([
      { delta: 'Answer', done: false },
      { delta: '', done: true, usage: { inputTokens: 5, outputTokens: 2 } },
    ]));

    mockGetActivePersonas.mockResolvedValue([]);
    const view = new AssistantView();
    const container = makeContainer();
    await view.mount(container);

    registerChatPipeline(view);

    // Send with transcript ON
    const input = container.querySelector('.chat-input') as HTMLInputElement;
    const sendBtn = container.querySelector('.chat-send-btn') as HTMLButtonElement;
    input.value = 'question about meeting';
    input.dispatchEvent(new Event('input'));
    sendBtn.click();

    await vi.waitFor(() => {
      expect(mockAddLLMUsage).toHaveBeenCalledTimes(1);
    });

    // Verify first message has transcript source tag
    const firstBotMsg = container.querySelector('.chat-msg-bot') as HTMLElement;
    expect(firstBotMsg).not.toBeNull();
    const firstSources = firstBotMsg.dataset.sources;
    expect(firstSources).toBeDefined();
    expect(firstSources).toContain('transcript');

    // Now toggle transcript OFF by clicking the toggle
    const transcriptToggle = container.querySelector('[data-ctx="transcript"]') as HTMLElement;
    transcriptToggle.click();

    // The first message's data-sources should be UNCHANGED
    const unchangedSources = firstBotMsg.dataset.sources;
    expect(unchangedSources).toBe(firstSources);
    expect(unchangedSources).toContain('transcript');

    view.unmount();
  });

  // -------------------------------------------------------------------------
  // Soft-warn threshold: >900k chars triggers console.warn
  // -------------------------------------------------------------------------
  it('warns on prompt > 900k chars but does not truncate', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 500 entries x 2000 chars each = ~1M chars
    const bigEntries = Array.from({ length: 500 }, (_, i) => ({
      text: 'x'.repeat(2000),
      speaker: 'Speaker',
      timestamp: '2026-04-15T10:00:00Z',
      is_final: true,
      is_self: false,
    }));
    mockGetSnapshot.mockReturnValue(bigEntries);

    const result = await assembleChatContext({
      userText: 'q',
      ctx: { transcript: true, personaIds: [], web: false },
      chatHistory: [],
    });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[assembler]'));
    expect(result.stats.totalChars).toBeGreaterThan(900_000);
    // All 500 entries still present
    expect(result.stats.transcriptChars).toBeGreaterThan(900_000);

    warnSpy.mockRestore();
  });
});
