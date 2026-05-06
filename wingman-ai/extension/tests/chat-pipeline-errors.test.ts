/**
 * Tests for Plan 4, Task 5: Cost tracking + error handling
 *
 * Tests the 7 error classes and cost tracking behavior in the orchestrator.
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

async function* fakeStream(chunks: Array<{ delta: string; done: boolean; usage?: { inputTokens: number; outputTokens: number } }>) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

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
    _fireOnSend(text: string, ctx: { transcript: boolean; personaIds: string[]; web: boolean }) {
      for (const cb of subscribers) {
        cb(text, ctx);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { registerChatPipeline } from '../src/services/chat-pipeline';

describe('Cost tracking + error handling — Task 5', () => {
  let fakeView: ReturnType<typeof createFakeView>;
  const defaultCtx = { transcript: false, personaIds: [], web: false };

  beforeEach(() => {
    vi.clearAllMocks();
    fakeView = createFakeView();

    mockAssembleChatContext.mockResolvedValue({
      systemPrompt: 'prompt',
      userMessage: 'hello',
      history: [],
      sources: [],
      stats: { transcriptChars: 0, kbChunks: 0, webResults: 0, historyMsgs: 0, totalChars: 50 },
    });
  });

  // -------------------------------------------------------------------------
  // Cost tracking: NOT called on error before done chunk
  // -------------------------------------------------------------------------
  it('costTracker NOT called when stream errors before done chunk', async () => {
    async function* errorStream() {
      yield { delta: 'partial', done: false };
      throw new Error('LLM API error 500');
    }
    mockStreamChat.mockReturnValue(errorStream());

    registerChatPipeline(fakeView as any);
    fakeView._fireOnSend('hello', defaultCtx);

    await vi.waitFor(() => {
      const calls = fakeView.renderAssistantMessage.mock.calls;
      const hasError = calls.some((c: any) => c[0].streaming === false);
      expect(hasError).toBe(true);
    });

    expect(mockAddLLMUsage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Error: 401 — invalid API key
  // -------------------------------------------------------------------------
  it('401 error shows API key invalid message', async () => {
    mockStreamChat.mockImplementation(() => { throw new Error('LLM API error 401'); });

    registerChatPipeline(fakeView as any);
    fakeView._fireOnSend('hello', defaultCtx);

    await vi.waitFor(() => {
      const calls = fakeView.renderAssistantMessage.mock.calls;
      const errorCall = calls.find((c: any) => c[0].streaming === false);
      expect(errorCall).toBeDefined();
    });

    const calls = fakeView.renderAssistantMessage.mock.calls;
    const errorCall = calls.find((c: any) => c[0].streaming === false);
    // Plan 10: classifyError now returns localized text from errors.api_key_missing
    expect(errorCall[0].text).toContain('API key not configured');
    expect(mockAddLLMUsage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Error: 429 — rate limited
  // -------------------------------------------------------------------------
  it('429 error shows rate limit message', async () => {
    mockStreamChat.mockImplementation(() => { throw new Error('LLM API error 429'); });

    registerChatPipeline(fakeView as any);
    fakeView._fireOnSend('hello', defaultCtx);

    await vi.waitFor(() => {
      const calls = fakeView.renderAssistantMessage.mock.calls;
      const errorCall = calls.find((c: any) => c[0].streaming === false);
      expect(errorCall).toBeDefined();
    });

    const calls = fakeView.renderAssistantMessage.mock.calls;
    const errorCall = calls.find((c: any) => c[0].streaming === false);
    // Plan 10: classifyError now returns localized text from errors.gemini.rate_limit
    expect(errorCall[0].text).toContain('rate limit reached');
  });

  // -------------------------------------------------------------------------
  // Error: 5xx — server error
  // -------------------------------------------------------------------------
  it('500 error shows server unavailable message', async () => {
    mockStreamChat.mockImplementation(() => { throw new Error('LLM API error 503'); });

    registerChatPipeline(fakeView as any);
    fakeView._fireOnSend('hello', defaultCtx);

    await vi.waitFor(() => {
      const calls = fakeView.renderAssistantMessage.mock.calls;
      const errorCall = calls.find((c: any) => c[0].streaming === false);
      expect(errorCall).toBeDefined();
    });

    const calls = fakeView.renderAssistantMessage.mock.calls;
    const errorCall = calls.find((c: any) => c[0].streaming === false);
    // Plan 10: classifyError now returns localized text from errors.gemini.api_failure
    expect(errorCall[0].text).toContain('service unavailable');
  });

  // -------------------------------------------------------------------------
  // Error: network drop mid-stream — keeps partial text
  // -------------------------------------------------------------------------
  it('network drop mid-stream preserves partial text and adds warning', async () => {
    async function* networkDropStream() {
      yield { delta: 'Partial ', done: false };
      yield { delta: 'response', done: false };
      throw new DOMException('The network connection was lost.', 'NetworkError');
    }
    mockStreamChat.mockReturnValue(networkDropStream());

    registerChatPipeline(fakeView as any);
    fakeView._fireOnSend('hello', defaultCtx);

    await vi.waitFor(() => {
      const calls = fakeView.renderAssistantMessage.mock.calls;
      const errorCall = calls.find((c: any) => c[0].streaming === false);
      expect(errorCall).toBeDefined();
    });

    const calls = fakeView.renderAssistantMessage.mock.calls;
    const errorCall = calls.find((c: any) => c[0].streaming === false);
    // Should contain both partial text and warning
    expect(errorCall[0].text).toContain('Partial response');
    // Plan 10: localized text — errors.session_interrupted = "Session interrupted unexpectedly."
    expect(errorCall[0].text).toContain('Session interrupted');
    expect(mockAddLLMUsage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Error: idle timeout triggers AbortError → interruption message
  // -------------------------------------------------------------------------
  it('abort signal triggers interruption message (simulates idle timeout)', async () => {
    // Instead of real 30s timeout, test that an AbortError mid-stream
    // produces the correct error message — same path the idle timer takes.
    async function* abortedStream() {
      yield { delta: 'started', done: false };
      throw new DOMException('Stream idle timeout', 'AbortError');
    }
    mockStreamChat.mockReturnValue(abortedStream());

    registerChatPipeline(fakeView as any);
    fakeView._fireOnSend('hello', defaultCtx);

    await vi.waitFor(() => {
      const calls = fakeView.renderAssistantMessage.mock.calls;
      const errorCall = calls.find((c: any) => c[0].streaming === false);
      expect(errorCall).toBeDefined();
    });

    const calls = fakeView.renderAssistantMessage.mock.calls;
    const errorCall = calls.find((c: any) => c[0].streaming === false);
    expect(errorCall[0].text).toContain('started');
    // Plan 10: localized — errors.session_interrupted = "Session interrupted unexpectedly."
    expect(errorCall[0].text).toContain('Session interrupted');
  });

  // -------------------------------------------------------------------------
  // Error: empty response
  // -------------------------------------------------------------------------
  it('empty response shows rephrasing message', async () => {
    mockStreamChat.mockReturnValue(fakeStream([
      { delta: '', done: true, usage: { inputTokens: 10, outputTokens: 0 } },
    ]));

    registerChatPipeline(fakeView as any);
    fakeView._fireOnSend('hello', defaultCtx);

    await vi.waitFor(() => {
      const calls = fakeView.renderAssistantMessage.mock.calls;
      const finalCall = calls.find((c: any) => c[0].streaming === false);
      expect(finalCall).toBeDefined();
    });

    const calls = fakeView.renderAssistantMessage.mock.calls;
    const finalCall = calls.find((c: any) => c[0].streaming === false);
    expect(finalCall[0].text).toContain('empty response');
    expect(finalCall[0].text).toContain('rephrasing');
    // Cost IS tracked for empty but successful response
    expect(mockAddLLMUsage).toHaveBeenCalledWith(10, 0);
  });

  // -------------------------------------------------------------------------
  // Error: fallback / unknown
  // -------------------------------------------------------------------------
  it('unknown error shows fallback message', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockStreamChat.mockImplementation(() => { throw new Error('something weird'); });

    registerChatPipeline(fakeView as any);
    fakeView._fireOnSend('hello', defaultCtx);

    await vi.waitFor(() => {
      const calls = fakeView.renderAssistantMessage.mock.calls;
      const errorCall = calls.find((c: any) => c[0].streaming === false);
      expect(errorCall).toBeDefined();
    });

    const calls = fakeView.renderAssistantMessage.mock.calls;
    const errorCall = calls.find((c: any) => c[0].streaming === false);
    expect(errorCall[0].text).toContain('Something went wrong');
    // Plan 10: localized errors.generic doesn't include "console" — that hint
    // moved to the console.error log only. The user-visible message is generic.

    errorSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Negative: costTracker called with (0, 0) for empty but successful response
  // -------------------------------------------------------------------------
  it('costTracker called with (0, 0) for empty response (tracks call count)', async () => {
    mockStreamChat.mockReturnValue(fakeStream([
      { delta: '', done: true, usage: { inputTokens: 0, outputTokens: 0 } },
    ]));

    registerChatPipeline(fakeView as any);
    fakeView._fireOnSend('hello', defaultCtx);

    await vi.waitFor(() => {
      expect(mockAddLLMUsage).toHaveBeenCalledTimes(1);
    });

    expect(mockAddLLMUsage).toHaveBeenCalledWith(0, 0);
  });

  // -------------------------------------------------------------------------
  // Negative: multiple errors each produce their own bubble
  // -------------------------------------------------------------------------
  it('multiple rapid errors each produce their own error bubble', async () => {
    // First call: error. Second call (after first completes): another error.
    mockStreamChat
      .mockImplementationOnce(() => { throw new Error('LLM API error 401'); })
      .mockImplementationOnce(() => { throw new Error('LLM API error 429'); });

    registerChatPipeline(fakeView as any);

    // First send
    fakeView._fireOnSend('first', defaultCtx);

    await vi.waitFor(() => {
      const calls = fakeView.renderAssistantMessage.mock.calls;
      const errorCalls = calls.filter((c: any) => c[0].streaming === false);
      expect(errorCalls.length).toBe(1);
    });

    // Second send (after first completes)
    fakeView._fireOnSend('second', defaultCtx);

    await vi.waitFor(() => {
      const calls = fakeView.renderAssistantMessage.mock.calls;
      const errorCalls = calls.filter((c: any) => c[0].streaming === false);
      expect(errorCalls.length).toBe(2);
    });

    const calls = fakeView.renderAssistantMessage.mock.calls;
    const errorCalls = calls.filter((c: any) => c[0].streaming === false);
    expect(errorCalls[0][0].text).toContain('API key');
    // Plan 10: localized — errors.gemini.rate_limit = "Gemini rate limit reached..."
    expect(errorCalls[1][0].text).toContain('rate limit');
  });

  // -------------------------------------------------------------------------
  // Assembler throws → error bubble
  // -------------------------------------------------------------------------
  it('assembler error shows preparation failure message', async () => {
    mockAssembleChatContext.mockRejectedValue(new Error('userText required and non-empty'));

    registerChatPipeline(fakeView as any);
    fakeView._fireOnSend('hello', defaultCtx);

    await vi.waitFor(() => {
      const calls = fakeView.renderAssistantMessage.mock.calls;
      const errorCall = calls.find((c: any) => c[0].streaming === false);
      expect(errorCall).toBeDefined();
    });

    const calls = fakeView.renderAssistantMessage.mock.calls;
    const errorCall = calls.find((c: any) => c[0].streaming === false);
    // Plan 10: assembler errors now use the generic localized fallback
    expect(errorCall[0].text).toContain('Something went wrong');
    expect(mockAddLLMUsage).not.toHaveBeenCalled();
  });
});
