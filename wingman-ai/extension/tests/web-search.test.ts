/**
 * Tests for src/services/web-search.ts — Brave Search integration.
 *
 * Mocks: chrome.storage.local (via setup.ts), global fetch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Will be imported once the module exists with real implementation
import {
  webSearch,
  webSearchTestCall,
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
  type DailyCounter,
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

// ── Daily Budget Counter (Task 3) ───────────────────────────────────────────

describe('daily budget counter', () => {
  beforeEach(async () => {
    await chrome.storage.local.set({
      [STORAGE_KEY_WEB_SEARCH_API_KEY]: 'test-brave-key-123',
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  // AC: counter shape in storage
  it('stores counter as { date: YYYY-MM-DD, count: number }', async () => {
    vi.mocked(fetch).mockResolvedValue(braveResponse([
      { title: 'T', description: 'D', url: 'https://x.com' },
    ]) as Response);

    await webSearch('test');

    const result = await chrome.storage.local.get([STORAGE_KEY_WEB_SEARCH_COUNTER]);
    const counter = result[STORAGE_KEY_WEB_SEARCH_COUNTER] as DailyCounter;
    expect(counter).toBeDefined();
    expect(counter.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof counter.count).toBe('number');
    expect(counter.count).toBe(1);
  });

  // AC: counter increments on each successful call
  it('increments counter on successful call', async () => {
    vi.mocked(fetch).mockResolvedValue(braveResponse([
      { title: 'T', description: 'D', url: 'https://x.com' },
    ]) as Response);

    await webSearch('test1');
    await webSearch('test2');

    const result = await chrome.storage.local.get([STORAGE_KEY_WEB_SEARCH_COUNTER]);
    const counter = result[STORAGE_KEY_WEB_SEARCH_COUNTER] as DailyCounter;
    expect(counter.count).toBe(2);
  });

  // AC: hard stop at cap
  it('rejects when daily cap is reached', async () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    await chrome.storage.local.set({
      [STORAGE_KEY_WEB_SEARCH_COUNTER]: { date: today, count: 100 },
      [STORAGE_KEY_WEB_SEARCH_DAILY_CAP]: 100,
    });

    await expect(webSearch('test')).rejects.toThrow('daily web search cap reached (100/100)');
    expect(fetch).not.toHaveBeenCalled();
  });

  // AC: count exceeding cap (stale write) → still hard-stops
  it('hard-stops when count exceeds cap due to stale write', async () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    await chrome.storage.local.set({
      [STORAGE_KEY_WEB_SEARCH_COUNTER]: { date: today, count: 150 },
      [STORAGE_KEY_WEB_SEARCH_DAILY_CAP]: 100,
    });

    await expect(webSearch('test')).rejects.toThrow(/daily web search cap reached/);
    expect(fetch).not.toHaveBeenCalled();
  });

  // AC: no increment on failure
  it('does NOT increment counter on failed call', async () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    await chrome.storage.local.set({
      [STORAGE_KEY_WEB_SEARCH_COUNTER]: { date: today, count: 5 },
    });

    vi.mocked(fetch).mockResolvedValue(braveErrorResponse(401) as unknown as Response);

    await expect(webSearch('test')).rejects.toThrow(/Brave 401/);

    const result = await chrome.storage.local.get([STORAGE_KEY_WEB_SEARCH_COUNTER]);
    const counter = result[STORAGE_KEY_WEB_SEARCH_COUNTER] as DailyCounter;
    expect(counter.count).toBe(5);
  });

  // AC: date rollover resets counter
  it('resets counter when date changes', async () => {
    await chrome.storage.local.set({
      [STORAGE_KEY_WEB_SEARCH_COUNTER]: { date: '2026-04-14', count: 99 },
    });

    vi.mocked(fetch).mockResolvedValue(braveResponse([
      { title: 'T', description: 'D', url: 'https://x.com' },
    ]) as Response);

    // The date in storage is yesterday, so it should reset
    await webSearch('test');

    const result = await chrome.storage.local.get([STORAGE_KEY_WEB_SEARCH_COUNTER]);
    const counter = result[STORAGE_KEY_WEB_SEARCH_COUNTER] as DailyCounter;
    // Count should be 1 (reset to 0, then incremented)
    expect(counter.count).toBe(1);
    // Date should be today
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(counter.date).toBe(today);
  });

  // AC: soft warn at 80% (once per day)
  it('logs warning at 80% cap threshold', async () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    await chrome.storage.local.set({
      [STORAGE_KEY_WEB_SEARCH_COUNTER]: { date: today, count: 79 },
      [STORAGE_KEY_WEB_SEARCH_DAILY_CAP]: 100,
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValue(braveResponse([
      { title: 'T', description: 'D', url: 'https://x.com' },
    ]) as Response);

    await webSearch('test');

    // After increment, count = 80, which is 80% of 100
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('daily cap approaching: 80/100'),
    );

    warnSpy.mockRestore();
  });

  // AC: custom cap from storage
  it('uses custom cap from storage', async () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    await chrome.storage.local.set({
      [STORAGE_KEY_WEB_SEARCH_COUNTER]: { date: today, count: 50 },
      [STORAGE_KEY_WEB_SEARCH_DAILY_CAP]: 50,
    });

    await expect(webSearch('test')).rejects.toThrow('daily web search cap reached (50/50)');
  });
});

// ── formatResultsForPrompt() (Task 4) ───────────────────────────────────────

describe('formatResultsForPrompt()', () => {
  // AC: empty results → empty string
  it('returns empty string for empty results', () => {
    expect(formatResultsForPrompt([])).toBe('');
  });

  // AC: single result formatted with [1] numbering
  it('formats a single result with [1] numbering', () => {
    const results: SearchResult[] = [
      { title: 'OAuth Guide', url: 'https://example.com/oauth', snippet: 'How to implement OAuth' },
    ];
    const output = formatResultsForPrompt(results);
    expect(output).toBe(
      '[1] Title: OAuth Guide\n    URL: https://example.com/oauth\n    Snippet: How to implement OAuth',
    );
  });

  // AC: multi-result numbered sequentially
  it('numbers multiple results sequentially', () => {
    const results: SearchResult[] = [
      { title: 'Title A', url: 'https://a.com', snippet: 'Snippet A' },
      { title: 'Title B', url: 'https://b.com', snippet: 'Snippet B' },
      { title: 'Title C', url: 'https://c.com', snippet: 'Snippet C' },
    ];
    const output = formatResultsForPrompt(results);
    expect(output).toContain('[1] Title: Title A');
    expect(output).toContain('[2] Title: Title B');
    expect(output).toContain('[3] Title: Title C');
    // Blocks separated by blank line
    expect(output).toContain('\n\n[2]');
    expect(output).toContain('\n\n[3]');
  });

  // AC: special characters preserved verbatim
  it('preserves special characters in title/snippet verbatim', () => {
    const results: SearchResult[] = [
      { title: 'A < B & C > D', url: 'https://x.com', snippet: 'a & b < c' },
    ];
    const output = formatResultsForPrompt(results);
    expect(output).toContain('Title: A < B & C > D');
    expect(output).toContain('Snippet: a & b < c');
  });

  // Negative: empty snippet still renders
  it('renders block even with empty snippet', () => {
    const results: SearchResult[] = [
      { title: 'No Snippet', url: 'https://x.com', snippet: '' },
    ];
    const output = formatResultsForPrompt(results);
    expect(output).toContain('[1] Title: No Snippet');
    expect(output).toContain('URL: https://x.com');
    expect(output).toContain('Snippet: ');
  });
});

// ── webSearchTestCall() — counter-exempt ────────────────────────────────────

describe('webSearchTestCall()', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('does NOT increment the daily counter', async () => {
    // Seed counter at count=5
    const counter: DailyCounter = {
      date: new Date().toISOString().slice(0, 10),
      count: 5,
    };
    await chrome.storage.local.set({ [STORAGE_KEY_WEB_SEARCH_COUNTER]: counter });

    vi.mocked(fetch).mockResolvedValue(braveResponse([
      { title: 'T', description: 'D', url: 'https://x.com' },
    ]) as Response);

    await webSearchTestCall('test-key', 'wingman test');

    // Counter should still be 5
    const result = await chrome.storage.local.get([STORAGE_KEY_WEB_SEARCH_COUNTER]);
    const stored = result[STORAGE_KEY_WEB_SEARCH_COUNTER] as DailyCounter;
    expect(stored.count).toBe(5);
  });

  it('rejects with "web search API key not configured" when key is empty', async () => {
    await expect(webSearchTestCall('', 'test')).rejects.toThrow('web search API key not configured');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns results from Brave', async () => {
    vi.mocked(fetch).mockResolvedValue(braveResponse([
      { title: 'Result', description: 'Desc', url: 'https://example.com' },
    ]) as Response);

    const results = await webSearchTestCall('test-key', 'wingman test');
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe('Result');
  });

  it('passes API key in X-Subscription-Token header', async () => {
    vi.mocked(fetch).mockResolvedValue(braveResponse([]) as Response);

    await webSearchTestCall('my-test-key', 'test');

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Subscription-Token': 'my-test-key',
        }),
      }),
    );
  });
});
