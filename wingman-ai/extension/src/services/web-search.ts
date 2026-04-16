/**
 * Web Search stub — returns empty results until Plan 5 implements Brave Search.
 * Contract frozen: Plan 4 consumes this signature unchanged.
 */

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export async function webSearch(_query: string): Promise<SearchResult[]> {
  return [];
}

export function formatResultsForPrompt(results: SearchResult[]): string {
  if (results.length === 0) return '';
  return results
    .map((r, i) => `[${i + 1}] Title: ${r.title}\n    URL: ${r.url}\n    Snippet: ${r.snippet}`)
    .join('\n\n');
}
