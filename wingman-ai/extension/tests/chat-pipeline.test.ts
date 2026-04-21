/**
 * Tests for Plan 4, Task 1: streamChat method on GeminiClient
 *
 * Mocks fetch to return SSE-formatted ReadableStream bodies and verifies
 * the AsyncIterable<StreamChunk> contract for all 3 providers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock modules that gemini-client imports
// ---------------------------------------------------------------------------
vi.mock('../src/services/kb/kb-search', () => ({
  getKBContext: vi.fn().mockResolvedValue({ matched: false, context: null, source: null }),
}));

vi.mock('../src/services/cost-tracker', () => ({
  costTracker: {
    addLLMUsage: vi.fn(),
    startSession: vi.fn(),
    getSnapshot: vi.fn().mockReturnValue(null),
  },
}));

vi.mock('../src/shared/default-prompt', () => ({
  DEFAULT_SYSTEM_PROMPT: 'Default prompt for testing.',
}));

// ---------------------------------------------------------------------------
// Helpers: build SSE ReadableStream from lines
// ---------------------------------------------------------------------------

function sseStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const text = lines.join('\n') + '\n';
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

/**
 * Build a multi-chunk SSE stream where each string is delivered as
 * a separate network read (tests split-across-reads).
 */
function sseStreamChunked(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

/**
 * Build a Gemini SSE data line.
 * Gemini streaming returns JSON with candidates array.
 */
function geminiSSELine(text: string, done = false, usage?: { promptTokenCount: number; candidatesTokenCount: number }): string {
  // Real Gemini streaming: `usageMetadata` appears on EVERY chunk (cumulative).
  // The termination signal is `candidates[0].finishReason` being set — not
  // the presence of usageMetadata. See docs/flows/ASSISTANT-CHAT-FLOW.md.
  const obj: Record<string, unknown> = {
    candidates: [{
      content: { parts: [{ text }] },
      ...(done ? { finishReason: 'STOP' } : {}),
    }],
  };
  if (usage) {
    obj.usageMetadata = usage;
  }
  return `data: ${JSON.stringify(obj)}`;
}

/**
 * Build an OpenAI-compat SSE data line (OpenRouter / Groq).
 */
function openaiSSELine(content: string, finishReason: string | null = null, usage?: { prompt_tokens: number; completion_tokens: number }): string {
  const obj: Record<string, unknown> = {
    choices: [{
      delta: { content },
      finish_reason: finishReason,
    }],
  };
  if (usage) {
    obj.usage = usage;
  }
  return `data: ${JSON.stringify(obj)}`;
}

// ---------------------------------------------------------------------------
// Import the module under test (AFTER mocks)
// ---------------------------------------------------------------------------
import { GeminiClient } from '../src/services/gemini-client';
import type { ChatRequest, StreamChunk } from '../src/services/gemini-client';

describe('streamChat — Task 1', () => {
  let client: GeminiClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    client = new GeminiClient();
    client.startSession();
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // Set API keys via storage so loadProviderConfig picks them up
    await chrome.storage.local.set({
      llmProvider: 'gemini',
      geminiApiKey: 'test-gemini-key',
      openrouterApiKey: 'test-or-key',
      groqApiKey: 'test-groq-key',
    });
    await client.loadProviderConfig();
  });

  // -------------------------------------------------------------------------
  // AC1: returns an AsyncIterable<StreamChunk>
  // -------------------------------------------------------------------------
  it('returns an AsyncIterable<StreamChunk>', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(
      sseStream([
        geminiSSELine('Hi'),
        geminiSSELine('', true, { promptTokenCount: 10, candidatesTokenCount: 5 }),
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ));

    const req: ChatRequest = { systemPrompt: 'Be helpful', userMessage: 'Hello' };
    const iter = client.streamChat(req);
    expect(iter[Symbol.asyncIterator]).toBeDefined();

    // Consume to avoid hanging
    for await (const _chunk of iter) { /* drain */ }
  });

  // -------------------------------------------------------------------------
  // AC2: Gemini provider uses streamGenerateContent?alt=sse endpoint
  // -------------------------------------------------------------------------
  it('Gemini provider uses streamGenerateContent?alt=sse with API key', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(
      sseStream([
        geminiSSELine('OK'),
        geminiSSELine('', true, { promptTokenCount: 5, candidatesTokenCount: 2 }),
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ));

    const req: ChatRequest = { systemPrompt: 'test', userMessage: 'hi' };
    for await (const _chunk of client.streamChat(req)) { /* drain */ }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url: string = fetchSpy.mock.calls[0][0];
    expect(url).toMatch(/streamGenerateContent\?.*alt=sse/);
    expect(url).toContain('key=test-gemini-key');
  });

  // -------------------------------------------------------------------------
  // AC3: OpenRouter uses POST /chat/completions with stream:true + Bearer
  // -------------------------------------------------------------------------
  it('OpenRouter uses POST /chat/completions with stream:true and Bearer', async () => {
    await chrome.storage.local.set({ llmProvider: 'openrouter' });
    await client.loadProviderConfig();

    fetchSpy.mockResolvedValueOnce(new Response(
      sseStream([
        openaiSSELine('Hey'),
        openaiSSELine('', 'stop', { prompt_tokens: 10, completion_tokens: 3 }),
        'data: [DONE]',
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ));

    const req: ChatRequest = { systemPrompt: 'test', userMessage: 'hi' };
    for await (const _chunk of client.streamChat(req)) { /* drain */ }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url: string = fetchSpy.mock.calls[0][0];
    expect(url).toContain('/chat/completions');
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-or-key');
    const body = JSON.parse(init.body as string);
    expect(body.stream).toBe(true);
  });

  // -------------------------------------------------------------------------
  // AC4: Groq uses same OpenAI-compat SSE pattern
  // -------------------------------------------------------------------------
  it('Groq uses OpenAI-compat SSE with Bearer token', async () => {
    await chrome.storage.local.set({ llmProvider: 'groq' });
    await client.loadProviderConfig();

    fetchSpy.mockResolvedValueOnce(new Response(
      sseStream([
        openaiSSELine('Hi from Groq'),
        openaiSSELine('', 'stop', { prompt_tokens: 8, completion_tokens: 4 }),
        'data: [DONE]',
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ));

    const req: ChatRequest = { systemPrompt: 'test', userMessage: 'hello' };
    for await (const _chunk of client.streamChat(req)) { /* drain */ }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url: string = fetchSpy.mock.calls[0][0];
    expect(url).toContain('groq.com');
    expect(url).toContain('/chat/completions');
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-groq-key');
  });

  // -------------------------------------------------------------------------
  // AC5: deltas concatenate to full response
  // -------------------------------------------------------------------------
  it('yields chunks whose deltas concatenate to full response', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(
      sseStream([
        geminiSSELine('Hel'),
        geminiSSELine('lo'),
        geminiSSELine('', true, { promptTokenCount: 10, candidatesTokenCount: 5 }),
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ));

    const req: ChatRequest = { systemPrompt: 'test', userMessage: 'greet' };
    const chunks: StreamChunk[] = [];
    for await (const chunk of client.streamChat(req)) {
      chunks.push(chunk);
    }

    // Should have 3 chunks: "Hel", "lo", and final
    expect(chunks.length).toBe(3);
    const fullText = chunks.map(c => c.delta).join('');
    expect(fullText).toBe('Hello');
  });

  // -------------------------------------------------------------------------
  // AC6: final chunk has done:true + usage, non-final chunks don't
  // -------------------------------------------------------------------------
  it('final chunk has done:true and usage; non-final chunks do not', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(
      sseStream([
        geminiSSELine('A'),
        geminiSSELine('B'),
        geminiSSELine('', true, { promptTokenCount: 20, candidatesTokenCount: 10 }),
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ));

    const req: ChatRequest = { systemPrompt: 'test', userMessage: 'go' };
    const chunks: StreamChunk[] = [];
    for await (const chunk of client.streamChat(req)) {
      chunks.push(chunk);
    }

    // Non-final chunks
    expect(chunks[0]!.done).toBe(false);
    expect(chunks[0]!.usage).toBeUndefined();
    expect(chunks[1]!.done).toBe(false);
    expect(chunks[1]!.usage).toBeUndefined();

    // Final chunk
    const last = chunks[chunks.length - 1]!;
    expect(last.done).toBe(true);
    expect(last.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
  });

  // -------------------------------------------------------------------------
  // AC7: SSE parsing handles split-across-reads, multi-line, [DONE] sentinel
  // -------------------------------------------------------------------------
  describe('SSE parsing edge cases', () => {
    it('handles single-event-per-read correctly', async () => {
      await chrome.storage.local.set({ llmProvider: 'openrouter' });
      await client.loadProviderConfig();

      fetchSpy.mockResolvedValueOnce(new Response(
        sseStream([
          openaiSSELine('token1'),
          '',
          openaiSSELine('token2'),
          '',
          openaiSSELine('', 'stop', { prompt_tokens: 5, completion_tokens: 2 }),
          '',
          'data: [DONE]',
        ]),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      ));

      const chunks: StreamChunk[] = [];
      for await (const chunk of client.streamChat({ systemPrompt: 't', userMessage: 'x' })) {
        chunks.push(chunk);
      }

      expect(chunks.map(c => c.delta).join('')).toBe('token1token2');
    });

    it('handles event split across network reads', async () => {
      await chrome.storage.local.set({ llmProvider: 'openrouter' });
      await client.loadProviderConfig();

      // Split a single SSE event across two reads
      const fullLine = openaiSSELine('split-token');
      const half1 = fullLine.slice(0, 10);
      const half2 = fullLine.slice(10) + '\n\n';
      const doneLine = openaiSSELine('', 'stop', { prompt_tokens: 3, completion_tokens: 1 }) + '\n\ndata: [DONE]\n';

      fetchSpy.mockResolvedValueOnce(new Response(
        sseStreamChunked([half1, half2, doneLine]),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      ));

      const chunks: StreamChunk[] = [];
      for await (const chunk of client.streamChat({ systemPrompt: 't', userMessage: 'x' })) {
        chunks.push(chunk);
      }

      expect(chunks.some(c => c.delta === 'split-token')).toBe(true);
    });

    it('[DONE] sentinel terminates the iterator', async () => {
      await chrome.storage.local.set({ llmProvider: 'openrouter' });
      await client.loadProviderConfig();

      fetchSpy.mockResolvedValueOnce(new Response(
        sseStream([
          openaiSSELine('text'),
          openaiSSELine('', 'stop', { prompt_tokens: 5, completion_tokens: 1 }),
          'data: [DONE]',
          // These should never be reached
          openaiSSELine('GHOST'),
        ]),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      ));

      const chunks: StreamChunk[] = [];
      for await (const chunk of client.streamChat({ systemPrompt: 't', userMessage: 'x' })) {
        chunks.push(chunk);
      }

      // "GHOST" should not appear
      expect(chunks.every(c => c.delta !== 'GHOST')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // AC8: HTTP non-2xx throws Error with status code
  // -------------------------------------------------------------------------
  it('HTTP 429 rejects iterator with Error containing status code', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));

    const req: ChatRequest = { systemPrompt: 'test', userMessage: 'hi' };
    await expect(async () => {
      for await (const _chunk of client.streamChat(req)) { /* should not reach */ }
    }).rejects.toThrow(/429/);
  });

  // -------------------------------------------------------------------------
  // AC9: AbortSignal terminates iterator with AbortError
  // -------------------------------------------------------------------------
  it('pre-aborted signal throws AbortError before fetch', async () => {
    const controller = new AbortController();
    controller.abort(); // abort before starting

    const req: ChatRequest = { systemPrompt: 'test', userMessage: 'hi' };
    await expect(async () => {
      for await (const _chunk of client.streamChat(req, { signal: controller.signal })) {
        /* should not reach */
      }
    }).rejects.toThrow(/abort/i);

    // fetch should never have been called
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Negative: malformed SSE line -> console.warn, skip, continue
  // -------------------------------------------------------------------------
  it('malformed SSE line is skipped with console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    fetchSpy.mockResolvedValueOnce(new Response(
      sseStream([
        geminiSSELine('good'),
        'data: NOT_VALID_JSON',
        geminiSSELine('', true, { promptTokenCount: 5, candidatesTokenCount: 2 }),
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ));

    const chunks: StreamChunk[] = [];
    for await (const chunk of client.streamChat({ systemPrompt: 't', userMessage: 'x' })) {
      chunks.push(chunk);
    }

    // Should have skipped the malformed line and continued
    expect(chunks.some(c => c.delta === 'good')).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Negative: empty response body
  // -------------------------------------------------------------------------
  it('empty response body yields one done chunk with zero usage', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(
      sseStream([]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ));

    const chunks: StreamChunk[] = [];
    for await (const chunk of client.streamChat({ systemPrompt: 't', userMessage: 'x' })) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(1);
    expect(chunks[0]!.delta).toBe('');
    expect(chunks[0]!.done).toBe(true);
    expect(chunks[0]!.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  // -------------------------------------------------------------------------
  // Negative: empty userMessage rejects before network call
  // -------------------------------------------------------------------------
  it('empty userMessage throws before any network call', async () => {
    await expect(async () => {
      for await (const _chunk of client.streamChat({ systemPrompt: 'x', userMessage: '' })) {
        /* should not reach */
      }
    }).rejects.toThrow(/userMessage required/i);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // AC10: existing methods unchanged (structural test)
  // -------------------------------------------------------------------------
  it('existing methods processTranscript, generateKBAnswer, generateEmbedding still exist', () => {
    expect(typeof client.processTranscript).toBe('function');
    expect(typeof client.generateKBAnswer).toBe('function');
    expect(typeof client.generateEmbedding).toBe('function');
  });

  // -------------------------------------------------------------------------
  // OpenRouter: includes stream_options for usage in final chunk
  // -------------------------------------------------------------------------
  it('OpenRouter request includes stream_options.include_usage for usage in final chunk', async () => {
    await chrome.storage.local.set({ llmProvider: 'openrouter' });
    await client.loadProviderConfig();

    fetchSpy.mockResolvedValueOnce(new Response(
      sseStream([
        openaiSSELine('ok'),
        openaiSSELine('', 'stop', { prompt_tokens: 5, completion_tokens: 1 }),
        'data: [DONE]',
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ));

    for await (const _chunk of client.streamChat({ systemPrompt: 't', userMessage: 'x' })) { /* drain */ }

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  // -------------------------------------------------------------------------
  // ChatRequest optional fields: maxTokens & temperature
  // -------------------------------------------------------------------------
  it('passes maxTokens and temperature when provided', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(
      sseStream([
        geminiSSELine('ok', true, { promptTokenCount: 5, candidatesTokenCount: 1 }),
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ));

    const req: ChatRequest = {
      systemPrompt: 'test',
      userMessage: 'hi',
      maxTokens: 500,
      temperature: 0.7,
    };
    for await (const _chunk of client.streamChat(req)) { /* drain */ }

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.generationConfig.maxOutputTokens).toBe(500);
    expect(body.generationConfig.temperature).toBe(0.7);
  });

  // -------------------------------------------------------------------------
  // ChatRequest history is passed in request
  // -------------------------------------------------------------------------
  it('passes history as conversation turns in the request', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(
      sseStream([
        geminiSSELine('response', true, { promptTokenCount: 10, candidatesTokenCount: 3 }),
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ));

    const req: ChatRequest = {
      systemPrompt: 'test',
      userMessage: 'follow up',
      history: [
        { role: 'user', text: 'previous question' },
        { role: 'assistant', text: 'previous answer' },
      ],
    };
    for await (const _chunk of client.streamChat(req)) { /* drain */ }

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    // Gemini format: contents array should have history + current user message
    expect(body.contents.length).toBeGreaterThanOrEqual(3);
  });
});
