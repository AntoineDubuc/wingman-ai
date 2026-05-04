/**
 * Tests for Plan 4, Task 4: Source attribution edge cases + integration tests
 *
 * Integration tests spanning Plan 3 (AssistantView) + Plan 4 (assembler/pipeline).
 * Covers: overflow tags, special chars, full round-trip through DOM.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock modules needed by assembler
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

describe('Source attribution edge cases — Task 4', () => {
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
  // 10-persona overflow: 10 KB tags + transcript = 11 tags → 10 + "+1 more"
  // -------------------------------------------------------------------------
  it('10 personas + transcript = 11 tags → renders 10 + "+1 more"', async () => {
    // Build 10 personas, each returning 1 KB chunk
    const personas = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      name: `Persona${i}`,
      kbDocumentIds: [`doc${i}`],
    }));
    mockGetPersonas.mockResolvedValue(personas);

    // Each persona returns 1 chunk
    for (let i = 0; i < 10; i++) {
      mockSearchKB.mockResolvedValueOnce([{
        chunk: { text: `chunk ${i}`, id: `c${i}`, documentId: `doc${i}`, embedding: [], chunkIndex: 0 },
        score: 0.8,
        documentName: `doc${i}.md`,
      }]);
    }

    // Transcript entries
    mockGetSnapshot.mockReturnValue([
      { text: 'Hi', speaker: 'A', timestamp: '2026-04-15T10:00:00Z', is_final: true, is_self: false },
    ]);

    // Run assembler
    const result = await assembleChatContext({
      userText: 'question',
      ctx: { transcript: true, personaIds: personas.map(p => p.id), web: false },
      chatHistory: [],
    });

    // Should have 11 sources: 'transcript' + 10 persona KB tags
    expect(result.sources.length).toBe(11);
    expect(result.sources[0]).toBe('transcript');
    for (let i = 0; i < 10; i++) {
      expect(result.sources).toContain(`Persona${i} KB`);
    }

    // Now render through AssistantView and check DOM
    mockGetActivePersonas.mockResolvedValue([]);
    const view = new AssistantView();
    const container = makeContainer();
    await view.mount(container);

    view.renderAssistantMessage({ text: 'test response', sources: result.sources, streaming: false });

    const sourceTags = container.querySelectorAll('.msg-source-tag');
    // 10 visible + 1 "+1 more" tag = 11
    expect(sourceTags.length).toBe(11);

    const lastTag = sourceTags[sourceTags.length - 1] as HTMLElement;
    expect(lastTag.textContent).toBe('+1 more');

    view.unmount();
  });

  // -------------------------------------------------------------------------
  // Special chars in persona name flow safely through .textContent
  // -------------------------------------------------------------------------
  it('persona name with special chars renders safely via .textContent', async () => {
    mockGetPersonas.mockResolvedValue([
      { id: 'special', name: 'AI & ML <Script>', kbDocumentIds: ['d1'] },
    ]);
    mockSearchKB.mockResolvedValue([{
      chunk: { text: 'data', id: 'c1', documentId: 'd1', embedding: [], chunkIndex: 0 },
      score: 0.9,
      documentName: 'doc.md',
    }]);

    const result = await assembleChatContext({
      userText: 'question',
      ctx: { transcript: false, personaIds: ['special'], web: false },
      chatHistory: [],
    });

    expect(result.sources).toContain('AI & ML <Script> KB');

    // Render in AssistantView
    mockGetActivePersonas.mockResolvedValue([]);
    const view = new AssistantView();
    const container = makeContainer();
    await view.mount(container);

    view.renderAssistantMessage({ text: 'answer', sources: result.sources, streaming: false });

    const personaTag = container.querySelector('.msg-source-tag.persona') as HTMLElement;
    expect(personaTag).not.toBeNull();
    // textContent renders the literal chars, not HTML-interpreted
    expect(personaTag.textContent).toBe('AI & ML <Script> KB');
    // innerHTML should NOT contain unescaped HTML
    expect(personaTag.innerHTML).not.toContain('<Script>');

    view.unmount();
  });

  // -------------------------------------------------------------------------
  // Full round-trip: onSend → assembler → fake streamChat → renderAssistantMessage → source tags
  // -------------------------------------------------------------------------
  it('full round-trip: send → assemble → stream → render with source tags in DOM', async () => {
    // Setup transcript
    mockGetSnapshot.mockReturnValue([
      { text: 'Meeting content', speaker: 'Alice', timestamp: '2026-04-15T10:00:00Z', is_final: true, is_self: false },
    ]);

    // Setup personas
    mockGetPersonas.mockResolvedValue([
      { id: 'arch', name: 'Architect', kbDocumentIds: ['d1'] },
    ]);
    mockSearchKB.mockResolvedValue([{
      chunk: { text: 'architecture stuff', id: 'c1', documentId: 'd1', embedding: [], chunkIndex: 0 },
      score: 0.8,
      documentName: 'arch.md',
    }]);

    // Setup fake LLM stream
    mockStreamChat.mockReturnValue(fakeStream([
      { delta: 'Here is ', done: false },
      { delta: 'the answer.', done: false },
      { delta: '', done: true, usage: { inputTokens: 50, outputTokens: 10 } },
    ]));

    // Mount AssistantView
    mockGetActivePersonas.mockResolvedValue([
      { id: 'arch', name: 'Architect', color: '#ff0000', systemPrompt: '', kbDocumentIds: ['d1'] },
    ]);
    const view = new AssistantView();
    const container = makeContainer();
    await view.mount(container);

    // Register pipeline
    registerChatPipeline(view);

    // Simulate send via the input
    const input = container.querySelector('.chat-input') as HTMLInputElement;
    const sendBtn = container.querySelector('.chat-send-btn') as HTMLButtonElement;

    input.value = 'What about the architecture?';
    input.dispatchEvent(new Event('input'));
    sendBtn.click();

    // Wait for streaming to complete
    await vi.waitFor(() => {
      expect(mockAddLLMUsage).toHaveBeenCalledTimes(1);
    });

    // Check that source tags are rendered
    const botMessages = container.querySelectorAll('.chat-msg-bot');
    expect(botMessages.length).toBeGreaterThanOrEqual(1);

    const lastBot = botMessages[botMessages.length - 1] as HTMLElement;
    const sourceTags = lastBot.querySelectorAll('.msg-source-tag');
    expect(sourceTags.length).toBeGreaterThan(0);

    // Check for expected source types
    const tagTexts = Array.from(sourceTags).map(t => t.textContent);
    expect(tagTexts).toContain('transcript');
    expect(tagTexts).toContain('Architect KB');

    view.unmount();
  });

  // -------------------------------------------------------------------------
  // Empty sources → "general knowledge" tag
  // -------------------------------------------------------------------------
  it('empty sources array renders "general knowledge" tag', async () => {
    mockGetActivePersonas.mockResolvedValue([]);
    const view = new AssistantView();
    const container = makeContainer();
    await view.mount(container);

    view.renderAssistantMessage({ text: 'general response', sources: [], streaming: false });

    const sourceTags = container.querySelectorAll('.msg-source-tag');
    expect(sourceTags.length).toBe(1);
    expect(sourceTags[0]!.textContent).toBe('general knowledge');
    expect(sourceTags[0]!.classList.contains('general')).toBe(true);

    view.unmount();
  });
});
