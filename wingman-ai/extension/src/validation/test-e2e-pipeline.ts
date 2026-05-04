/**
 * Validation Test: End-to-End Pipeline
 *
 * Tests the complete flow: text → chunk → embed → store → query → retrieve
 */

import type { ValidationResult } from './index';

// Sample product content for testing
const SAMPLE_CONTENT = `
CloudGeometry Enterprise Platform

Security and Compliance
Our platform is SOC2 Type II certified and supports HIPAA compliance. We maintain ISO 27001 certification and undergo annual third-party security audits. All data is encrypted at rest using AES-256 and in transit using TLS 1.3.

Pricing and Plans
We offer three tiers: Starter ($500/month for up to 10 users), Professional ($2000/month for up to 50 users), and Enterprise (custom pricing for unlimited users). All plans include 24/7 support and 99.9% SLA.

Integration Capabilities
CloudGeometry integrates with AWS, Azure, and GCP natively. We support Kubernetes, Terraform, and all major CI/CD platforms including GitHub Actions, GitLab CI, and Jenkins.
`.trim();

// Query that should match the Security section
const TEST_QUERY = 'What security certifications do you have?';

const EMBEDDING_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';

interface Chunk {
  id: string;
  text: string;
  embedding: number[];
}

/**
 * Simple chunking by paragraphs
 */
function chunkText(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 50);
}

/**
 * Get API key from storage
 */
async function getApiKey(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(['geminiApiKey']);
    return result.geminiApiKey || null;
  } catch {
    return null;
  }
}

/**
 * Generate embedding for text
 */
async function embed(
  apiKey: string,
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'
): Promise<number[]> {
  const response = await fetch(`${EMBEDDING_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: 768,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status}`);
  }

  const data = await response.json();
  return data.embedding.values;
}

/**
 * Dot product for normalized vectors
 */
function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return sum;
}

/**
 * Search for top-K similar chunks
 */
function searchTopK(
  queryEmbedding: number[],
  chunks: Chunk[],
  topK: number
): Array<{ chunk: Chunk; score: number }> {
  const scored = chunks.map((chunk) => ({
    chunk,
    score: dotProduct(queryEmbedding, chunk.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

export async function testE2ePipeline(): Promise<ValidationResult> {
  const details: string[] = [];
  let success = true;

  // Check API key first
  const apiKey = await getApiKey();
  if (!apiKey) {
    return {
      name: 'e2e-pipeline',
      success: false,
      duration: 0,
      details: 'No Gemini API key configured. Set it in Options.',
      error: 'Missing API key',
    };
  }

  const totalStart = performance.now();

  try {
    // Step 1: Chunk the content
    const chunkStart = performance.now();
    const textChunks = chunkText(SAMPLE_CONTENT);
    const chunkTime = Math.round(performance.now() - chunkStart);

    details.push(`Chunked: ${textChunks.length} chunks, ${chunkTime}ms`);

    if (textChunks.length < 2) {
      success = false;
      details.push('FAIL: Not enough chunks created');
      throw new Error('Chunking failed');
    }

    // Step 2: Embed all chunks
    const embedStart = performance.now();
    const chunks: Chunk[] = [];

    for (let i = 0; i < textChunks.length; i++) {
      const chunkText = textChunks[i];
      if (chunkText) {
        const embedding = await embed(apiKey, chunkText, 'RETRIEVAL_DOCUMENT');
        chunks.push({
          id: `chunk-${i}`,
          text: chunkText,
          embedding,
        });
      }
    }

    const embedTime = Math.round(performance.now() - embedStart);
    details.push(`Embedded: ${chunks.length} chunks, ${embedTime}ms`);
    details.push(`Avg embed: ${Math.round(embedTime / chunks.length)}ms/chunk`);

    // Step 3: Simulate storage (just verify we have the data)
    const storageStart = performance.now();
    // In real implementation, this would go to IndexedDB
    const storedChunks = [...chunks];
    const storageTime = Math.round(performance.now() - storageStart);
    details.push(`Storage sim: ${storageTime}ms`);

    // Step 4: Embed the query
    const queryStart = performance.now();
    const queryEmbedding = await embed(apiKey, TEST_QUERY, 'RETRIEVAL_QUERY');
    const queryEmbedTime = Math.round(performance.now() - queryStart);
    details.push(`Query embed: ${queryEmbedTime}ms`);

    // Step 5: Search for relevant chunks
    const searchStart = performance.now();
    const results = searchTopK(queryEmbedding, storedChunks, 3);
    const searchTime = Math.round(performance.now() - searchStart);
    details.push(`Search: ${searchTime}ms`);

    // Step 6: Verify retrieval quality
    const topResult = results[0];

    if (!topResult) {
      success = false;
      details.push('FAIL: No results returned from search');
    } else {
      const topText = topResult.chunk.text.toLowerCase();

      // The query asks about security certifications
      // The top result should be the Security section
      const isSecurityChunk =
        topText.includes('soc2') || topText.includes('security') || topText.includes('compliance');

      if (isSecurityChunk) {
        details.push(`Retrieval verified: score=${topResult.score.toFixed(3)}`);
      } else {
        success = false;
        details.push(`FAIL: Wrong chunk retrieved (score=${topResult.score.toFixed(3)})`);
        details.push(`Got: "${topResult.chunk.text.slice(0, 50)}..."`);
      }

      // Log all result scores for debugging
      console.log('[E2E Pipeline] Query:', TEST_QUERY);
      console.log('[E2E Pipeline] Results:');
      results.forEach((r, i) => {
        console.log(`  ${i + 1}. [${r.score.toFixed(3)}] ${r.chunk.text.slice(0, 60)}...`);
      });
    }

    // Calculate total latency
    const totalTime = Math.round(performance.now() - totalStart);

    // Separate indexing vs query latency
    const indexingLatency = chunkTime + embedTime + storageTime;
    const queryLatency = queryEmbedTime + searchTime;

    details.push(`Total: ${totalTime}ms`);
    details.push(`Indexing: ${indexingLatency}ms`);
    details.push(`Query: ${queryLatency}ms`);

    // Check latency thresholds
    if (queryLatency > 500) {
      details.push(`WARNING: Query latency ${queryLatency}ms > 500ms target`);
    }
  } catch (error) {
    success = false;
    const errorMsg = error instanceof Error ? error.message : String(error);
    details.push(`FAIL: ${errorMsg}`);
  }

  return {
    name: 'e2e-pipeline',
    success,
    duration: 0,
    details: details.join(' | '),
  };
}
