/**
 * Tests for streamChat() API-key resilience across Chrome extension contexts.
 *
 * Bug context:
 *   Chrome extensions run JS in isolated contexts (service worker, content
 *   script, popup). Each context gets its own gemini-client singleton.
 *   The service worker calls loadProviderConfig() at session start, which
 *   populates its in-memory cache. The content script's singleton never has
 *   loadProviderConfig() called — so its cache is empty even when keys are
 *   present in chrome.storage.local.
 *
 * Pre-fix behavior:
 *   streamChat() in the content-script context throws
 *   "No API key configured for provider: gemini" even though the key IS in
 *   chrome.storage.local. The user sees the AssistantView fail to respond.
 *
 * Expected behavior:
 *   streamChat() should fall back to chrome.storage.local when its in-memory
 *   cache is empty — matching the pattern already used by getApiKey() for
 *   embedding calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { GeminiClient } from '../src/services/gemini-client';
import type { ChatRequest } from '../src/services/gemini-client';

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

function geminiSSELine(text: string, usage?: { promptTokenCount: number; candidatesTokenCount: number }): string {
  const obj: Record<string, unknown> = {
    candidates: [{ content: { parts: [{ text }] } }],
  };
  if (usage) obj.usageMetadata = usage;
  return `data: ${JSON.stringify(obj)}`;
}

function openaiSSELine(content: string, finishReason: string | null = null, usage?: { prompt_tokens: number; completion_tokens: number }): string {
  const obj: Record<string, unknown> = {
    choices: [{ delta: { content }, finish_reason: finishReason }],
  };
  if (usage) obj.usage = usage;
  return `data: ${JSON.stringify(obj)}`;
}

describe('streamChat — API-key fallback to chrome.storage (cross-context resilience)', () => {
  let client: GeminiClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Critical: do NOT call loadProviderConfig() — simulating the
    // content-script context where the singleton's cache is empty.
    client = new GeminiClient();
    client.startSession();
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  // -------------------------------------------------------------------------
  // The bug — and its fix
  // -------------------------------------------------------------------------

  it('Gemini: when cache is empty but key is in storage, streamChat reads from storage and the request URL contains the key', async () => {
    // Storage has the key — but cache is empty (loadProviderConfig was never called)
    await chrome.storage.local.set({
      llmProvider: 'gemini',
      geminiApiKey: 'storage-only-gemini-key',
    });

    fetchSpy.mockResolvedValueOnce(new Response(
      sseStream([
        geminiSSELine('Hi'),
        geminiSSELine('', { promptTokenCount: 10, candidatesTokenCount: 5 }),
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ));

    const req: ChatRequest = { systemPrompt: 'Be helpful', userMessage: 'Hello' };
    for await (const _chunk of client.streamChat(req)) { /* drain */ }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url: string = fetchSpy.mock.calls[0]![0];
    expect(url).toContain('key=storage-only-gemini-key');
  });

  it('OpenRouter: when cache is empty but key is in storage, streamChat reads from storage and Authorization header has Bearer key', async () => {
    await chrome.storage.local.set({
      llmProvider: 'openrouter',
      openrouterApiKey: 'storage-only-openrouter-key',
      openrouterModel: 'anthropic/claude-sonnet-4',
    });

    fetchSpy.mockResolvedValueOnce(new Response(
      sseStream([
        openaiSSELine('Hi'),
        openaiSSELine('', 'stop', { prompt_tokens: 10, completion_tokens: 3 }),
        'data: [DONE]',
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ));

    const req: ChatRequest = { systemPrompt: 'Be helpful', userMessage: 'Hello' };
    for await (const _chunk of client.streamChat(req)) { /* drain */ }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer storage-only-openrouter-key');
  });

  it('Groq: when cache is empty but key is in storage, streamChat reads from storage and Authorization header has Bearer key', async () => {
    await chrome.storage.local.set({
      llmProvider: 'groq',
      groqApiKey: 'storage-only-groq-key',
      groqModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    });

    fetchSpy.mockResolvedValueOnce(new Response(
      sseStream([
        openaiSSELine('Hi'),
        openaiSSELine('', 'stop', { prompt_tokens: 10, completion_tokens: 3 }),
        'data: [DONE]',
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ));

    const req: ChatRequest = { systemPrompt: 'Be helpful', userMessage: 'Hello' };
    for await (const _chunk of client.streamChat(req)) { /* drain */ }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer storage-only-groq-key');
  });

  // -------------------------------------------------------------------------
  // Negative test — cache empty AND storage empty: still throws clearly
  // -------------------------------------------------------------------------

  it('throws "No API key configured" when both cache and storage are empty', async () => {
    await chrome.storage.local.clear();

    const req: ChatRequest = { systemPrompt: 'Be helpful', userMessage: 'Hello' };
    let caught: Error | null = null;
    try {
      for await (const _chunk of client.streamChat(req)) { /* drain */ }
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/No API key configured/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Cache priority — when cache IS populated, storage is NOT re-read
  // (efficiency check: existing service-worker behavior must not regress)
  // -------------------------------------------------------------------------

  it('does NOT re-read storage when cache is already populated (service-worker behavior preserved)', async () => {
    // Pre-populate cache via loadProviderConfig
    await chrome.storage.local.set({
      llmProvider: 'gemini',
      geminiApiKey: 'cached-key',
    });
    await client.loadProviderConfig();

    // Now overwrite storage with a different key — cache should win
    await chrome.storage.local.set({ geminiApiKey: 'new-storage-key' });

    fetchSpy.mockResolvedValueOnce(new Response(
      sseStream([
        geminiSSELine('Hi'),
        geminiSSELine('', { promptTokenCount: 5, candidatesTokenCount: 2 }),
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ));

    const req: ChatRequest = { systemPrompt: 'Be helpful', userMessage: 'Hello' };
    for await (const _chunk of client.streamChat(req)) { /* drain */ }

    const url: string = fetchSpy.mock.calls[0]![0];
    // The cached key should be used, not the new storage key
    expect(url).toContain('key=cached-key');
    expect(url).not.toContain('key=new-storage-key');
  });
});
