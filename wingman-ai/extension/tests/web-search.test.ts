/**
 * Tests for src/services/web-search.ts — Brave Search integration.
 *
 * Mocks: chrome.storage.local (via setup.ts), global fetch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Will be imported once the module exists with real implementation
import {
  webSearch,
  formatResultsForPrompt,
  STORAGE_KEY_WEB_SEARCH_API_KEY,
  STORAGE_KEY_WEB_SEARCH_PROVIDER,
  STORAGE_KEY_WEB_SEARCH_DAILY_CAP,
  STORAGE_KEY_WEB_SEARCH_COUNTER,
  DEFAULT_DAILY_CAP,
  DEFAULT_PROVIDER,
  MAX_RESULTS,
  QUERY_MAX_CHARS,
  type SearchResult,
} from '../src/services/web-search';

// ── Helpers ─────────────────────────────────────────────────────────────────

function braveResponse(results: Array<{ title: string; description: string; url: string }>) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ web: { results } }),
  };
}

function braveErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: 'test error' }),
  };
}

// ── Constants ───────────────────────────────────────────────────────────────

describe('web-search constants', () => {
  it('exports correct storage key names', () => {
    expect(STORAGE_KEY_WEB_SEARCH_API_KEY).toBe('webSearchApiKey');
    expect(STORAGE_KEY_WEB_SEARCH_PROVIDER).toBe('webSearchProvider');
    expect(STORAGE_KEY_WEB_SEARCH_DAILY_CAP).toBe('webSearchDailyCap');
    expect(STORAGE_KEY_WEB_SEARCH_COUNTER).toBe('webSearchDailyCounter');
  });

  it('exports correct defaults', () => {
    expect(DEFAULT_DAILY_CAP).toBe(100);
    expect(DEFAULT_PROVIDER).toBe('brave');
    expect(MAX_RESULTS).toBe(5);
    expect(QUERY_MAX_CHARS).toBe(400);
  });
});

// ── webSearch() ─────────────────────────────────────────────────────────────

describe('webSearch()', () => {
  beforeEach(async () => {
    // Seed a valid API key in storage
    await chrome.storage.local.set({
      [STORAGE_KEY_WEB_SEARCH_API_KEY]: 'test-brave-key-123',
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  // AC: empty query rejects BEFORE network call
  it('rejects with "query required" on empty string', async () => {
    await expect(webSearch('')).rejects.toThrow('query required');
    expect(fetch).not.toHaveBeenCalled();
  });

  // AC: missing API key rejects
  it('rejects with "web search API key not configured" when key is missing', async () => {
    await chrome.storage.local.remove(STORAGE_KEY_WEB_SEARCH_API_KEY);
    await expect(webSearch('test')).rejects.toThrow('web search API key not configured');
    expect(fetch).not.toHaveBeenCalled();
  });

  // AC: empty API key rejects
  it('rejects with "web search API key not configured" when key is empty string', async () => {
    await chrome.storage.local.set({ [STORAGE_KEY_WEB_SEARCH_API_KEY]: '' });
    await expect(webSearch('test')).rejects.toThrow('web search API key not configured');
  });

  // AC: successful call returns SearchResult[] with correct mapping
  it('returns mapped SearchResult[] from Brave response', async () => {
    const mockResults = [
      { title: 'Result 1', description: 'Snippet 1', url: 'https://example.com/1' },
      { title: 'Result 2', description: 'Snippet 2', url: 'https://example.com/2' },
    ];
    vi.mocked(fetch).mockResolvedValue(braveResponse(mockResults) as Response);

    const results = await webSearch('oauth');

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ title: 'Result 1', snippet: 'Snippet 1', url: 'https://example.com/1' });
    expect(results[1]).toEqual({ title: 'Result 2', snippet: 'Snippet 2', url: 'https://example.com/2' });
  });

  // AC: max 5 results
  it('returns at most MAX_RESULTS (5) results', async () => {
    const mockResults = Array.from({ length: 8 }, (_, i) => ({
      title: `Title ${i}`,
      description: `Desc ${i}`,
      url: `https://example.com/${i}`,
    }));
    vi.mocked(fetch).mockResolvedValue(braveResponse(mockResults) as Response);

    const results = await webSearch('test');
    expect(results.length).toBeLessThanOrEqual(MAX_RESULTS);
    expect(results).toHaveLength(5);
  });

  // AC: correct Brave request shape (URL + headers)
  it('sends correct URL and headers to Brave', async () => {
    vi.mocked(fetch).mockResolvedValue(braveResponse([]) as Response);

    await webSearch('oauth');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.search.brave.com/res/v1/web/search?q=oauth&count=5',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Subscription-Token': 'test-brave-key-123',
          Accept: 'application/json',
        }),
      }),
    );
  });

  // AC: HTTP 401 rejects
  it('rejects with "Brave 401" on unauthorized response', async () => {
    vi.mocked(fetch).mockResolvedValue(braveErrorResponse(401) as unknown as Response);
    await expect(webSearch('test')).rejects.toThrow(/Brave 401/);
  });

  // AC: HTTP 429 rejects
  it('rejects with "Brave 429" on rate limit response', async () => {
    vi.mocked(fetch).mockResolvedValue(braveErrorResponse(429) as unknown as Response);
    await expect(webSearch('test')).rejects.toThrow(/Brave 429/);
  });

  // AC: HTTP 5xx rejects (after retries)
  it('rejects with "Brave 5xx" on server error after retries', async () => {
    vi.mocked(fetch).mockResolvedValue(braveErrorResponse(503) as unknown as Response);
    await expect(webSearch('test')).rejects.toThrow(/Brave 5xx/);
  });

  // AC: empty results → resolves to []
  it('resolves to [] when Brave returns no results', async () => {
    vi.mocked(fetch).mockResolvedValue(braveResponse([]) as Response);
    const results = await webSearch('nonexistent');
    expect(results).toEqual([]);
  });

  // AC: snippet HTML tag stripping
  it('strips HTML tags from snippets', async () => {
    const mockResults = [
      { title: 'Test', description: '<strong>bold</strong> text', url: 'https://example.com' },
    ];
    vi.mocked(fetch).mockResolvedValue(braveResponse(mockResults) as Response);

    const results = await webSearch('test');
    expect(results[0]!.snippet).toBe('bold text');
  });

  // AC: entity unescaping
  it('unescapes HTML entities in snippets', async () => {
    const mockResults = [
      { title: 'Test', description: 'a&amp;b &lt;c&gt; &quot;d&quot; &#39;e&#39;', url: 'https://example.com' },
    ];
    vi.mocked(fetch).mockResolvedValue(braveResponse(mockResults) as Response);

    const results = await webSearch('test');
    expect(results[0]!.snippet).toBe('a&b <c> "d" \'e\'');
  });

  // AC: <em> stripping
  it('strips <em> tags from snippets', async () => {
    const mockResults = [
      { title: 'Test', description: '<em>hi</em>', url: 'https://example.com' },
    ];
    vi.mocked(fetch).mockResolvedValue(braveResponse(mockResults) as Response);

    const results = await webSearch('test');
    expect(results[0]!.snippet).toBe('hi');
  });

  // AC: <script> tag stripped (content retained)
  it('strips <script> tags but retains content', async () => {
    const mockResults = [
      { title: 'Test', description: '<script>bad</script>', url: 'https://example.com' },
    ];
    vi.mocked(fetch).mockResolvedValue(braveResponse(mockResults) as Response);

    const results = await webSearch('test');
    expect(results[0]!.snippet).toBe('bad');
  });

  // AC: URL verbatim passthrough
  it('returns URLs verbatim from Brave', async () => {
    const mockResults = [
      { title: 'Test', description: 'desc', url: 'https://example.com/path?q=1&r=2' },
    ];
    vi.mocked(fetch).mockResolvedValue(braveResponse(mockResults) as Response);

    const results = await webSearch('test');
    expect(results[0]!.url).toBe('https://example.com/path?q=1&r=2');
  });

  // Negative: network failure
  it('rejects with "web search network error" on fetch throw', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'));
    await expect(webSearch('test')).rejects.toThrow(/web search network error/);
  });

  // Negative: malformed JSON
  it('rejects with "web search parse error" on malformed JSON', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('bad json')),
    } as unknown as Response);
    await expect(webSearch('test')).rejects.toThrow('web search parse error');
  });

  // Negative: special chars URL-encoded
  it('URL-encodes special characters in query', async () => {
    vi.mocked(fetch).mockResolvedValue(braveResponse([]) as Response);
    await webSearch('oauth & OIDC');

    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(calledUrl).toContain('q=oauth%20%26%20OIDC');
  });

  // Negative: query > 400 chars truncated with warn (no query text in warn)
  it('truncates queries over 400 chars and warns without query text', async () => {
    const longQuery = 'a'.repeat(450);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValue(braveResponse([]) as Response);

    await webSearch(longQuery);

    // Verify truncation in the URL
    const calledUrl = vi.mocked(fetch).mock.calls[0]![0] as string;
    const qParam = new URL(calledUrl).searchParams.get('q');
    expect(qParam).toHaveLength(400);

    // Verify warn was called with metadata only (no query text)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('truncated to 400 chars'));
    // The warn message should NOT contain the actual query content
    const warnMsg = warnSpy.mock.calls[0]![0] as string;
    expect(warnMsg).not.toContain('aaaa');

    warnSpy.mockRestore();
  });

  // AC: 5xx retry with exponential backoff
  it('retries 5xx errors twice with exponential backoff', async () => {
    const error5xx = braveErrorResponse(503);
    const success = braveResponse([{ title: 'T', description: 'D', url: 'https://x.com' }]);

    vi.mocked(fetch)
      .mockResolvedValueOnce(error5xx as unknown as Response)
      .mockResolvedValueOnce(error5xx as unknown as Response)
      .mockResolvedValueOnce(success as Response);

    const results = await webSearch('test');
    expect(results).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('fails after exhausting 5xx retries', async () => {
    const error5xx = braveErrorResponse(503);
    vi.mocked(fetch)
      .mockResolvedValueOnce(error5xx as unknown as Response)
      .mockResolvedValueOnce(error5xx as unknown as Response)
      .mockResolvedValueOnce(error5xx as unknown as Response);

    await expect(webSearch('test')).rejects.toThrow(/Brave 5xx/);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
