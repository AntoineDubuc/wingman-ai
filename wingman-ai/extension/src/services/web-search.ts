/**
 * Web Search module — Brave Search provider.
 *
 * Contract frozen: Plan 4 consumes `webSearch()` and `formatResultsForPrompt()`
 * unchanged. Do not modify signatures.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

/** Shape of the daily counter stored in chrome.storage.local */
export interface DailyCounter {
  date: string;   // 'YYYY-MM-DD'
  count: number;
}

// ── Storage Keys & Defaults ─────────────────────────────────────────────────

export const STORAGE_KEY_WEB_SEARCH_API_KEY = 'webSearchApiKey';
export const STORAGE_KEY_WEB_SEARCH_PROVIDER = 'webSearchProvider';
export const STORAGE_KEY_WEB_SEARCH_DAILY_CAP = 'webSearchDailyCap';
export const STORAGE_KEY_WEB_SEARCH_COUNTER = 'webSearchDailyCounter';
export const DEFAULT_DAILY_CAP = 100;
export const DEFAULT_PROVIDER: 'brave' = 'brave';
export const MAX_RESULTS = 5;
export const QUERY_MAX_CHARS = 400;

const BRAVE_API_BASE = 'https://api.search.brave.com/res/v1/web/search';
const RETRY_DELAYS_MS = [500, 1000];
const WARN_THRESHOLD = 0.8;

// ── Internal: has 80% warn been emitted today? ──────────────────────────────

let warnEmittedDate = '';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip HTML tags, unescape the 5 common HTML entities, trim.
 * Exact chain per plan specification.
 */
function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Get today's date as YYYY-MM-DD using explicit padding (NOT locale-dependent). */
function getTodayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Fetch with retry on 5xx. Retries up to RETRY_DELAYS_MS.length times
 * with exponential backoff. Non-5xx errors are thrown immediately.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt - 1]!;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      throw new Error(`web search network error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Non-5xx: return immediately (caller handles 4xx)
    if (response.status < 500) {
      return response;
    }

    // 5xx: retry
    lastResponse = response;
  }

  // All retries exhausted on 5xx
  return lastResponse!;
}

// ── Budget Counter ──────────────────────────────────────────────────────────

async function readCounter(): Promise<DailyCounter> {
  const result = await chrome.storage.local.get([STORAGE_KEY_WEB_SEARCH_COUNTER]);
  const counter = result[STORAGE_KEY_WEB_SEARCH_COUNTER] as DailyCounter | undefined;
  if (counter && counter.date && typeof counter.count === 'number') {
    return counter;
  }
  return { date: getTodayString(), count: 0 };
}

async function writeCounter(counter: DailyCounter): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_WEB_SEARCH_COUNTER]: counter });
}

async function getDailyCap(): Promise<number> {
  const result = await chrome.storage.local.get([STORAGE_KEY_WEB_SEARCH_DAILY_CAP]);
  const cap = result[STORAGE_KEY_WEB_SEARCH_DAILY_CAP];
  return typeof cap === 'number' && cap > 0 ? cap : DEFAULT_DAILY_CAP;
}

// ── Main: webSearch ─────────────────────────────────────────────────────────

/**
 * Search the web using Brave Search API.
 *
 * @param query - Search query string. Must not be empty.
 * @returns Up to MAX_RESULTS search results.
 * @throws On empty query, missing API key, HTTP errors, network failures.
 */
export async function webSearch(query: string): Promise<SearchResult[]> {
  // Input validation: empty query
  if (!query || !query.trim()) {
    throw new Error('query required');
  }

  // Read API key from storage — NEVER log it
  const stored = await chrome.storage.local.get([STORAGE_KEY_WEB_SEARCH_API_KEY]);
  const apiKey = stored[STORAGE_KEY_WEB_SEARCH_API_KEY] as string | undefined;
  if (!apiKey) {
    throw new Error('web search API key not configured');
  }

  // Budget check: daily counter
  const today = getTodayString();
  let counter = await readCounter();
  if (counter.date !== today) {
    counter = { date: today, count: 0 };
    await writeCounter(counter);
    warnEmittedDate = '';
  }

  const cap = await getDailyCap();
  if (counter.count >= cap) {
    throw new Error(`daily web search cap reached (${counter.count}/${cap})`);
  }

  // Truncate long queries — warn with metadata only (no query text)
  let q = query.trim();
  if (q.length > QUERY_MAX_CHARS) {
    console.warn(`[webSearch] query truncated to ${QUERY_MAX_CHARS} chars`);
    q = q.slice(0, QUERY_MAX_CHARS);
  }

  // Build request
  const url = `${BRAVE_API_BASE}?q=${encodeURIComponent(q)}&count=${MAX_RESULTS}`;

  const response = await fetchWithRetry(url, {
    method: 'GET',
    headers: {
      'X-Subscription-Token': apiKey,
      Accept: 'application/json',
    },
  });

  // Handle HTTP errors
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Brave 401 — API key invalid or expired');
    }
    if (response.status === 429) {
      throw new Error('Brave 429 — rate limit');
    }
    if (response.status >= 500) {
      throw new Error('Brave 5xx — temporary');
    }
    throw new Error(`Brave ${response.status} — unexpected error`);
  }

  // Parse JSON
  let data: { web?: { results?: Array<{ title: string; description: string; url: string }> } };
  try {
    data = await response.json();
  } catch {
    throw new Error('web search parse error');
  }

  const rawResults = data?.web?.results ?? [];
  const results: SearchResult[] = rawResults.slice(0, MAX_RESULTS).map((r) => ({
    title: r.title,
    snippet: stripHtml(r.description ?? ''),
    url: r.url,
  }));

  // Post-call: increment counter on success
  counter.count += 1;
  await writeCounter(counter);

  // Soft warn at 80% (once per day)
  const pct = counter.count / cap;
  if (pct >= WARN_THRESHOLD && warnEmittedDate !== today) {
    const pctRounded = Math.round(pct * 100);
    console.warn(`[webSearch] daily cap approaching: ${counter.count}/${cap} (${pctRounded}%)`);
    warnEmittedDate = today;
  }

  return results;
}

// ── Test Helper (counter-exempt) ────────────────────────────────────────────

/**
 * Test-only Brave Search call that does NOT increment the daily counter.
 * Used by the options page "Test connection" button.
 */
export async function webSearchTestCall(apiKey: string, query: string): Promise<SearchResult[]> {
  if (!apiKey) {
    throw new Error('web search API key not configured');
  }

  const q = query.trim().slice(0, QUERY_MAX_CHARS);
  const url = `${BRAVE_API_BASE}?q=${encodeURIComponent(q)}&count=${MAX_RESULTS}`;

  const response = await fetchWithRetry(url, {
    method: 'GET',
    headers: {
      'X-Subscription-Token': apiKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Brave 401 — API key invalid or expired');
    }
    if (response.status === 429) {
      throw new Error('Brave 429 — rate limit');
    }
    if (response.status >= 500) {
      throw new Error('Brave 5xx — temporary');
    }
    throw new Error(`Brave ${response.status} — unexpected error`);
  }

  let data: { web?: { results?: Array<{ title: string; description: string; url: string }> } };
  try {
    data = await response.json();
  } catch {
    throw new Error('web search parse error');
  }

  const rawResults = data?.web?.results ?? [];
  return rawResults.slice(0, MAX_RESULTS).map((r) => ({
    title: r.title,
    snippet: stripHtml(r.description ?? ''),
    url: r.url,
  }));
}

// ── Format Helper ───────────────────────────────────────────────────────────

/**
 * Format search results for LLM prompt injection.
 * Plan 4's assembler calls this directly.
 */
export function formatResultsForPrompt(results: SearchResult[]): string {
  if (results.length === 0) return '';
  return results
    .map(
      (r, i) =>
        `[${i + 1}] Title: ${r.title}\n    URL: ${r.url}\n    Snippet: ${r.snippet}`,
    )
    .join('\n\n');
}
