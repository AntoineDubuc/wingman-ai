/**
 * Tests for Plan 4, Task 3: Chat Pipeline Orchestrator
 *
 * Tests registerChatPipeline() which wires onSend → assembler → streamChat
 * → renderAssistantMessage with source attribution and cost tracking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

const mockAssembleChatContext = vi.fn();
vi.mock('../src/services/chat-context-assembler', () => ({
  assembleChatContext: (...args: unknown[]) => mockAssembleChatContext(...args),
}));

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
// Helpers
// ---------------------------------------------------------------------------

/** Create a fake async iterable from an array of StreamChunks. */
async function* fakeStream(chunks: Array<{ delta: string; done: boolean; usage?: { inputTokens: number; outputTokens: number } }>) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

/** Create a fake AssistantView with spied methods. */
function createFakeView() {
  const subscribers: Array<(text: string, ctx: { transcript: boolean; personaIds: string[]; web: boolean }) => void> = [];

  return {
    onSend: vi.fn((cb: (text: string, ctx: { transcript: boolean; personaIds: string[]; web: boolean }) => void) => {
      subscribers.push(cb);
      return () => {
        const idx = subscribers.indexOf(cb);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    }),
    getChatHistory: vi.fn().mockReturnValue([]),
    renderAssistantMessage: vi.fn(),
    showTypingIndicator: vi.fn(),
    hideTypingIndicator: vi.fn(),
    appendUserMessage: vi.fn(),
    // Helper to fire onSend subscribers
    _fireOnSend(text: string, ctx: { transcript: boolean; personaIds: string[]; web: boolean }) {
      for (const cb of subscribers) {
        cb(text, ctx);
      }
    },
    _getSubscriberCount() {
      return subscribers.length;
    },
  };
}

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { registerChatPipeline } from '../src/services/chat-pipeline';

describe('registerChatPipeline — Task 3', () => {
  let fakeView: ReturnType<typeof createFakeView>;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeView = createFakeView();

    // Default assembler mock
    mockAssembleChatContext.mockResolvedValue({
      systemPrompt: 'You are helpful.',
      userMessage: 'hello',
      history: [],
      sources: [],
      stats: { transcriptChars: 0, kbChunks: 0, webResults: 0, historyMsgs: 0, totalChars: 50 },
    });

    // Default streamChat mock
    mockStreamChat.mockReturnValue(fakeStream([
      { delta: 'Hi', done: false },
      { delta: ' there', done: false },
      { delta: '', done: true, usage: { inputTokens: 10, outputTokens: 5 } },
    ]));
  });

  // -------------------------------------------------------------------------
  // AC1: registers exactly one onSend subscriber
  // -------------------------------------------------------------------------
  it('registers exactly one onSend subscriber', () => {
    registerChatPipeline(fakeView as any);
    expect(fakeView.onSend).toHaveBeenCalledTimes(1);
    expect(fakeView._getSubscriberCount()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // AC2: on first chunk, renderAssistantMessage called with streaming: true
  // -------------------------------------------------------------------------
  it('calls renderAssistantMessage with streaming:true on first chunk', async () => {
    registerChatPipeline(fakeView as any);

    fakeView._fireOnSend('hello', { transcript: false, personaIds: [], web: false });

    // Wait for async pipeline
    await vi.waitFor(() => {
      expect(fakeView.renderAssistantMessage).toHaveBeenCalled();
    });

    // First render call (typing indicator): streaming true, empty text
    const firstCall = fakeView.renderAssistantMessage.mock.calls[0];
    expect(firstCall[0].streaming).toBe(true);
    expect(firstCall[0].messageId).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // AC3: on done chunk, renderAssistantMessage called with streaming: false and sources
  // -------------------------------------------------------------------------
  it('finalizes with streaming:false, sources, and messageId on done chunk', async () => {
    mockAssembleChatContext.mockResolvedValue({
      systemPrompt: 'prompt',
      userMessage: 'hello',
      history: [],
      sources: ['transcript', 'Architect KB'],
      stats: { transcriptChars: 100, kbChunks: 2, webResults: 0, historyMsgs: 0, totalChars: 200 },
    });

    registerChatPipeline(fakeView as any);
    fakeView._fireOnSend('hello', { transcript: true, personaIds: ['arch-id'], web: false });

    await vi.waitFor(() => {
      const calls = fakeView.renderAssistantMessage.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0].streaming).toBe(false);
    });

    const calls = fakeView.renderAssistantMessage.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0].sources).toEqual(['transcript', 'Architect KB']);
    expect(lastCall[0].messageId).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // AC4: costTracker.addLLMUsage called exactly once per completed query
  // -------------------------------------------------------------------------
  it('calls costTracker.addLLMUsage exactly once with usage from done chunk', async () => {
    registerChatPipeline(fakeView as any);
    fakeView._fireOnSend('hello', { transcript: false, personaIds: [], web: false });

    await vi.waitFor(() => {
      expect(mockAddLLMUsage).toHaveBeenCalledTimes(1);
    });

    expect(mockAddLLMUsage).toHaveBeenCalledWith(10, 5);
  });

  // -------------------------------------------------------------------------
  // AC5: empty sources → LLM still called, sources is []
  // -------------------------------------------------------------------------
  it('calls LLM with empty sources when all toggles off', async () => {
    registerChatPipeline(fakeView as any);
    fakeView._fireOnSend('general question', { transcript: false, personaIds: [], web: false });

    await vi.waitFor(() => {
      expect(mockStreamChat).toHaveBeenCalledTimes(1);
    });

    const calls = fakeView.renderAssistantMessage.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0].sources).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // AC6: streaming correctness — accumulated text per chunk
  // -------------------------------------------------------------------------
  it('accumulates delta text across chunks and renders progressively', async () => {
    mockStreamChat.mockReturnValue(fakeStream([
      { delta: 'A', done: false },
      { delta: 'B', done: false },
      { delta: 'C', done: false },
      { delta: '', done: true, usage: { inputTokens: 5, outputTokens: 3 } },
    ]));

    registerChatPipeline(fakeView as any);
    fakeView._fireOnSend('go', { transcript: false, personaIds: [], web: false });

    await vi.waitFor(() => {
      expect(mockAddLLMUsage).toHaveBeenCalled();
    });

    const calls = fakeView.renderAssistantMessage.mock.calls;
    // First call: typing indicator (empty text, streaming true)
    expect(calls[0][0].text).toBe('');
    expect(calls[0][0].streaming).toBe(true);

    // Streaming delta calls
    expect(calls[1][0].text).toBe('A');
    expect(calls[1][0].streaming).toBe(true);
    expect(calls[2][0].text).toBe('AB');
    expect(calls[2][0].streaming).toBe(true);
    expect(calls[3][0].text).toBe('ABC');
    expect(calls[3][0].streaming).toBe(true);

    // Final call
    expect(calls[4][0].text).toBe('ABC');
    expect(calls[4][0].streaming).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Negative: serial sends — second send ignored while streaming
  // -------------------------------------------------------------------------
  it('ignores second send while a stream is already running', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    // A slow stream that we control
    let resolveStream: () => void;
    const streamPromise = new Promise<void>((resolve) => { resolveStream = resolve; });

    async function* slowStream() {
      yield { delta: 'slow', done: false };
      await streamPromise; // stall here
      yield { delta: '', done: true, usage: { inputTokens: 1, outputTokens: 1 } };
    }

    mockStreamChat.mockReturnValueOnce(slowStream());

    registerChatPipeline(fakeView as any);

    // First send
    fakeView._fireOnSend('first', { transcript: false, personaIds: [], web: false });

    // Wait for stream to start
    await vi.waitFor(() => {
      expect(mockStreamChat).toHaveBeenCalledTimes(1);
    });

    // Second send while first is still streaming
    fakeView._fireOnSend('second', { transcript: false, personaIds: [], web: false });

    // Stream should not have been called a second time
    expect(mockStreamChat).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalled();

    // Complete the stream
    resolveStream!();
    await vi.waitFor(() => {
      expect(mockAddLLMUsage).toHaveBeenCalled();
    });

    debugSpy.mockRestore();
  });
});
