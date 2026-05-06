/**
 * Tests for F2-T3: ChatPipeline Language Injection
 *
 * Verifies that registerChatPipeline calls addLanguageInstruction with the
 * system prompt and active locale, and passes the localized result to streamChat.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock modules — order matters: mocks must be declared before imports
// ---------------------------------------------------------------------------

const mockAddLanguageInstruction = vi.fn((prompt: string, locale: string) => `${prompt} [${locale}]`);
vi.mock('../src/shared/language-injection', () => ({
  addLanguageInstruction: (...args: unknown[]) => mockAddLanguageInstruction(...args as [string, string]),
}));

const mockGetActiveLocale = vi.fn().mockReturnValue('en');
vi.mock('../src/background/sw-locale', () => ({
  getActiveLocale: () => mockGetActiveLocale(),
  rehydrateActiveLocale: vi.fn(),
  registerLocaleOnChanged: vi.fn(),
  resetActiveLocale: vi.fn(),
}));

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

vi.mock('../src/services/cost-tracker', () => ({
  costTracker: {
    addLLMUsage: vi.fn(),
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

describe('registerChatPipeline — F2-T3 Language Injection', () => {
  let fakeView: ReturnType<typeof createFakeView>;
  const defaultCtx = { transcript: false, personaIds: [], web: false };

  beforeEach(() => {
    vi.clearAllMocks();
    fakeView = createFakeView();

    // Restore default mock implementations after clearAllMocks
    mockAddLanguageInstruction.mockImplementation((prompt: string, locale: string) => `${prompt} [${locale}]`);
    mockGetActiveLocale.mockReturnValue('en');

    mockAssembleChatContext.mockResolvedValue({
      systemPrompt: 'You are a helpful assistant.',
      userMessage: 'hello',
      history: [],
      sources: [],
      stats: { transcriptChars: 0, kbChunks: 0, webResults: 0, historyMsgs: 0, totalChars: 50 },
    });

    mockStreamChat.mockReturnValue(fakeStream([
      { delta: 'Hi', done: false },
      { delta: '', done: true, usage: { inputTokens: 10, outputTokens: 5 } },
    ]));
  });

  // -------------------------------------------------------------------------
  // Test 1: addLanguageInstruction called with systemPrompt and active locale for French
  // -------------------------------------------------------------------------
  it('addLanguageInstruction called with systemPrompt and active locale for French', async () => {
    mockGetActiveLocale.mockReturnValue('fr');

    registerChatPipeline(fakeView as any);
    fakeView._fireOnSend('Bonjour', defaultCtx);

    await vi.waitFor(() => {
      expect(mockAddLanguageInstruction).toHaveBeenCalled();
    });

    expect(mockAddLanguageInstruction).toHaveBeenCalledWith(
      expect.any(String),
      'fr',
    );
  });

  // -------------------------------------------------------------------------
  // Test 2: addLanguageInstruction called with 'en' for English locale (no-op path)
  // -------------------------------------------------------------------------
  it("addLanguageInstruction called with 'en' for English locale (no-op path)", async () => {
    mockGetActiveLocale.mockReturnValue('en');

    registerChatPipeline(fakeView as any);
    fakeView._fireOnSend('Hello', defaultCtx);

    await vi.waitFor(() => {
      expect(mockAddLanguageInstruction).toHaveBeenCalled();
    });

    expect(mockAddLanguageInstruction).toHaveBeenCalledWith(
      expect.any(String),
      'en',
    );
  });

  // -------------------------------------------------------------------------
  // Test 3: streamChat receives the localized system prompt
  // -------------------------------------------------------------------------
  it('streamChat receives the localized system prompt from addLanguageInstruction', async () => {
    const originalSystemPrompt = 'You are a helpful assistant.';
    const localizedPrompt = `${originalSystemPrompt} [fr]`;
    mockGetActiveLocale.mockReturnValue('fr');
    mockAddLanguageInstruction.mockImplementation((prompt: string, locale: string) => `${prompt} [${locale}]`);

    registerChatPipeline(fakeView as any);
    fakeView._fireOnSend('Bonjour', defaultCtx);

    await vi.waitFor(() => {
      expect(mockStreamChat).toHaveBeenCalled();
    });

    const streamChatArg = mockStreamChat.mock.calls[0][0] as { systemPrompt: string };
    expect(streamChatArg.systemPrompt).toBe(localizedPrompt);
  });
});
