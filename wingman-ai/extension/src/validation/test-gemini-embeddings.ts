/**
 * Validation Test: Gemini Embedding API
 *
 * Tests that the Gemini embedding endpoint works from extension context.
 */

import type { ValidationResult } from './index';

const EMBEDDING_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';
const BATCH_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents';

const TEST_TEXTS = [
  'CloudGeometry provides enterprise cloud consulting services.',
  'Our CGDevX platform reduces Kubernetes costs by 50%.',
  'We are an AWS Advanced Consulting Partner with SOC2 compliance.',
];

interface EmbeddingResponse {
  embedding: {
    values: number[];
  };
}

interface BatchEmbeddingResponse {
  embeddings: Array<{
    values: number[];
  }>;
}

async function getApiKey(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(['geminiApiKey']);
    return result.geminiApiKey || null;
  } catch {
    return null;
  }
}

async function generateSingleEmbedding(
  apiKey: string,
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'
): Promise<{ embedding: number[]; latency: number }> {
  const start = performance.now();

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
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const data: EmbeddingResponse = await response.json();
  const latency = Math.round(performance.now() - start);

  return { embedding: data.embedding.values, latency };
}

async function generateBatchEmbeddings(
  apiKey: string,
  texts: string[]
): Promise<{ embeddings: number[][]; latency: number }> {
  const start = performance.now();

  const requests = texts.map((text) => ({
    model: 'models/gemini-embedding-001',
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_DOCUMENT',
    outputDimensionality: 768,
  }));

  const response = await fetch(`${BATCH_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Batch API error ${response.status}: ${errorText}`);
  }

  const data: BatchEmbeddingResponse = await response.json();
  const latency = Math.round(performance.now() - start);

  return {
    embeddings: data.embeddings.map((e) => e.values),
    latency,
  };
}

function vectorMagnitude(v: number[]): number {
  return Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
}

export async function testGeminiEmbeddings(): Promise<ValidationResult> {
  const details: string[] = [];
  let success = true;

  // Check API key
  const apiKey = await getApiKey();
  if (!apiKey) {
    return {
      name: 'gemini-embeddings',
      success: false,
      duration: 0,
      details: 'No Gemini API key configured. Set it in Options.',
      error: 'Missing API key',
    };
  }
  details.push('API key found');

  // Test 1: Single embedding with RETRIEVAL_DOCUMENT
  try {
    const { embedding, latency } = await generateSingleEmbedding(
      apiKey,
      TEST_TEXTS[0]!,
      'RETRIEVAL_DOCUMENT'
    );

    if (embedding.length !== 768) {
      success = false;
      details.push(`FAIL: Expected 768 dims, got ${embedding.length}`);
    } else {
      details.push(`Single embedding: 768 dims, ${latency}ms`);
    }

    // Check normalization
    const magnitude = vectorMagnitude(embedding);
    if (Math.abs(magnitude - 1.0) > 0.01) {
      details.push(`WARNING: Vector not normalized (magnitude=${magnitude.toFixed(3)})`);
    } else {
      details.push(`Normalized: magnitude=${magnitude.toFixed(3)}`);
    }

    if (latency > 500) {
      details.push(`WARNING: Single embedding slow (${latency}ms > 500ms)`);
    }
  } catch (error) {
    success = false;
    details.push(`FAIL: Single embedding error - ${error}`);
  }

  // Test 2: Single embedding with RETRIEVAL_QUERY
  try {
    const { embedding, latency } = await generateSingleEmbedding(
      apiKey,
      'What security certifications do you have?',
      'RETRIEVAL_QUERY'
    );

    if (embedding.length !== 768) {
      success = false;
      details.push(`FAIL: Query embedding wrong dims: ${embedding.length}`);
    } else {
      details.push(`Query embedding: 768 dims, ${latency}ms`);
    }
  } catch (error) {
    success = false;
    details.push(`FAIL: Query embedding error - ${error}`);
  }

  // Test 3: Batch embedding
  try {
    const { embeddings, latency } = await generateBatchEmbeddings(apiKey!, TEST_TEXTS);

    if (embeddings.length !== TEST_TEXTS.length) {
      success = false;
      details.push(`FAIL: Batch returned ${embeddings.length}/${TEST_TEXTS.length} embeddings`);
    } else {
      const allCorrectDims = embeddings.every((e) => e.length === 768);
      if (!allCorrectDims) {
        success = false;
        details.push('FAIL: Batch embeddings have wrong dimensions');
      } else {
        details.push(`Batch embedding: ${embeddings.length} vectors, ${latency}ms total`);
        details.push(`Batch avg: ${Math.round(latency / embeddings.length)}ms per embedding`);
      }
    }

    if (latency > 1500) {
      details.push(`WARNING: Batch slow (${latency}ms > 1500ms)`);
    }
  } catch (error) {
    success = false;
    details.push(`FAIL: Batch embedding error - ${error}`);
  }

  return {
    name: 'gemini-embeddings',
    success,
    duration: 0, // Will be set by harness
    details: details.join(' | '),
  };
}
