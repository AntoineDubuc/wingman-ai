import { kbDatabase, type KBSearchResult } from './kb-database';
import { geminiClient } from '../gemini-client';

const DEFAULT_TOP_K = 3;
const DEFAULT_THRESHOLD = 0.7;
const CURSOR_THRESHOLD = 5000;

/**
 * Cosine similarity between two vectors.
 * Assumes normalized embeddings from Gemini (dot product is sufficient).
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Search the KB for chunks most similar to the query.
 * When documentIds is provided, only chunks from those documents are searched.
 */
export async function searchKB(
  query: string,
  topK: number = DEFAULT_TOP_K,
  threshold: number = DEFAULT_THRESHOLD,
  documentIds?: string[]
): Promise<KBSearchResult[]> {
  const docs = await kbDatabase.getDocuments();
  if (docs.length === 0) return [];

  // Build document name lookup
  const docNames = new Map(docs.map((d) => [d.id, d.filename]));

  // Build filter set for persona-scoped search
  const filterSet = documentIds && documentIds.length > 0
    ? new Set(documentIds)
    : null;

  // Get query embedding
  const queryEmbedding = await geminiClient.generateEmbedding(query, 'RETRIEVAL_QUERY');

  const stats = await kbDatabase.getStats();
  const results: KBSearchResult[] = [];

  if (stats.chunkCount > CURSOR_THRESHOLD) {
    // Stream via cursor for large datasets
    await kbDatabase.getAllChunksWithCursor((batch) => {
      for (const chunk of batch) {
        if (filterSet && !filterSet.has(chunk.documentId)) continue;
        const score = cosineSimilarity(queryEmbedding, chunk.embedding);
        if (score >= threshold) {
          results.push({
            chunk,
            score,
            documentName: docNames.get(chunk.documentId) ?? 'Unknown',
          });
        }
      }
    });
  } else {
    // Load all chunks for small datasets
    const chunks = await kbDatabase.getAllChunks();
    for (const chunk of chunks) {
      if (filterSet && !filterSet.has(chunk.documentId)) continue;
      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      if (score >= threshold) {
        results.push({
          chunk,
          score,
          documentName: docNames.get(chunk.documentId) ?? 'Unknown',
        });
      }
    }
  }

  // Sort descending by score, return topK
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * High-level retrieval for the suggestion flow.
 * Returns formatted context string and source filename, or null if no match.
 * When documentIds is provided, only those documents are considered.
 */
export async function getKBContext(
  utterance: string,
  documentIds?: string[]
): Promise<{
  context: string | null;
  source: string | null;
  matched: boolean;
}> {
  try {
    const docs = await kbDatabase.getDocuments();
    const completeDocs = docs.filter((d) => d.status === 'complete');

    // If filtering by persona, only count docs in the persona's set
    const relevantDocs = documentIds && documentIds.length > 0
      ? completeDocs.filter((d) => documentIds.includes(d.id))
      : completeDocs;

    if (relevantDocs.length === 0) {
      return { context: null, source: null, matched: false };
    }

    const start = performance.now();
    const results = await searchKB(utterance, DEFAULT_TOP_K, DEFAULT_THRESHOLD, documentIds);
    const elapsed = Math.round(performance.now() - start);
    console.log(`[KB] Retrieval took ${elapsed}ms, found ${results.length} results`);

    if (results.length === 0) {
      return { context: null, source: null, matched: false };
    }

    const context = results
      .map((r) => r.chunk.text)
      .join('\n\n---\n\n');

    // Primary source is the highest-scored result
    const source = results[0]!.documentName;

    return { context, source, matched: true };
  } catch (error) {
    console.error('[KB] Retrieval failed, proceeding without KB:', error);
    return { context: null, source: null, matched: false };
  }
}
