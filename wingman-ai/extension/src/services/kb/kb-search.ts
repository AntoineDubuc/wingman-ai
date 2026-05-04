import { kbDatabase, type KBSearchResult } from './kb-database';
import { geminiClient } from '../gemini-client';

const DEFAULT_TOP_K = 3;
const DEFAULT_THRESHOLD = 0.55;
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
  if (docs.length === 0) {
    console.warn('[KB] No documents in IndexedDB at all');
    return [];
  }

  // Build document name lookup
  const docNames = new Map(docs.map((d) => [d.id, d.filename]));

  // Build filter set for persona-scoped search
  const filterSet = documentIds && documentIds.length > 0
    ? new Set(documentIds)
    : null;

  console.debug(`[KB] Search: ${docs.length} docs, filter: ${filterSet ? `${filterSet.size} persona docs` : 'all'}, threshold: ${threshold}`);

  // Get query embedding
  let queryEmbedding: number[];
  try {
    queryEmbedding = await geminiClient.generateEmbedding(query, 'RETRIEVAL_QUERY');
  } catch (embError) {
    console.error('[KB] Query embedding generation failed:', embError);
    return [];
  }

  const stats = await kbDatabase.getStats();
  const results: KBSearchResult[] = [];
  let totalScanned = 0;
  let filteredOut = 0;
  let bestScore = 0;
  let bestChunkDoc = '';

  if (stats.chunkCount > CURSOR_THRESHOLD) {
    // Stream via cursor for large datasets
    await kbDatabase.getAllChunksWithCursor((batch) => {
      for (const chunk of batch) {
        totalScanned++;
        if (filterSet && !filterSet.has(chunk.documentId)) { filteredOut++; continue; }
        const score = cosineSimilarity(queryEmbedding, chunk.embedding);
        if (score > bestScore) { bestScore = score; bestChunkDoc = docNames.get(chunk.documentId) ?? 'Unknown'; }
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
      totalScanned++;
      if (filterSet && !filterSet.has(chunk.documentId)) { filteredOut++; continue; }
      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      if (score > bestScore) { bestScore = score; bestChunkDoc = docNames.get(chunk.documentId) ?? 'Unknown'; }
      if (score >= threshold) {
        results.push({
          chunk,
          score,
          documentName: docNames.get(chunk.documentId) ?? 'Unknown',
        });
      }
    }
  }

  console.debug(`[KB] Scanned ${totalScanned} chunks, best: ${bestScore.toFixed(3)} (${bestChunkDoc}), matches: ${results.length}`);

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
    const incompleteDocs = docs.filter((d) => d.status !== 'complete');

    // If filtering by persona, only count docs in the persona's set
    const relevantDocs = documentIds && documentIds.length > 0
      ? completeDocs.filter((d) => documentIds.includes(d.id))
      : completeDocs;

    if (relevantDocs.length === 0) {
      // Diagnose WHY there are no relevant docs
      if (docs.length === 0) {
        console.warn('[KB] No documents in database');
      } else if (completeDocs.length === 0) {
        console.warn(`[KB] ${docs.length} documents exist but none are complete (${incompleteDocs.map(d => `${d.filename}:${d.status}`).join(', ')})`);
      } else if (documentIds && documentIds.length > 0) {
        const existingIds = new Set(completeDocs.map(d => d.id));
        const missingIds = documentIds.filter(id => !existingIds.has(id));
        console.warn(`[KB] Persona filter has ${documentIds.length} doc IDs but ${missingIds.length} don't exist in DB. Complete docs: ${completeDocs.map(d => `${d.filename}(${d.id.slice(0, 8)})`).join(', ')}. Persona IDs: ${documentIds.map(id => id.slice(0, 8)).join(', ')}`);
      }
      return { context: null, source: null, matched: false };
    }

    console.debug(`[KB] Searching ${relevantDocs.length} docs: ${relevantDocs.map(d => d.filename).join(', ')}`);

    const start = performance.now();
    const results = await searchKB(utterance, DEFAULT_TOP_K, DEFAULT_THRESHOLD, documentIds);
    const elapsed = Math.round(performance.now() - start);
    console.debug(`[KB] Retrieval: ${elapsed}ms, ${results.length} results`);

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
