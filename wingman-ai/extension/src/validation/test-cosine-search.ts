/**
 * Validation Test: Cosine Similarity Search Performance
 *
 * Tests that brute-force cosine similarity search meets latency requirements.
 */

import type { ValidationResult } from './index';

const VECTOR_DIMENSIONS = 768;

/**
 * Generate a random normalized vector
 */
function generateRandomVector(dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, () => Math.random() * 2 - 1);
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return vector.map((v) => v / magnitude);
}

/**
 * Compute dot product of two vectors (cosine similarity for normalized vectors)
 */
function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return sum;
}

/**
 * Compute cosine similarity (full formula, for comparison)
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProd = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dotProd += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  return dotProd / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface SearchResult {
  index: number;
  score: number;
}

/**
 * Perform brute-force search for top-K similar vectors
 */
function searchTopK(query: number[], vectors: number[][], topK: number): SearchResult[] {
  const scores: SearchResult[] = vectors.map((v, i) => ({
    index: i,
    score: dotProduct(query, v),
  }));

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  return scores.slice(0, topK);
}

/**
 * Benchmark search with given vector count
 */
function benchmarkSearch(
  vectorCount: number,
  iterations: number = 10
): { avgMs: number; minMs: number; maxMs: number } {
  // Generate vectors
  const vectors: number[][] = [];
  for (let i = 0; i < vectorCount; i++) {
    vectors.push(generateRandomVector(VECTOR_DIMENSIONS));
  }

  const query = generateRandomVector(VECTOR_DIMENSIONS);
  const times: number[] = [];

  // Warm up
  searchTopK(query, vectors, 5);

  // Benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    searchTopK(query, vectors, 5);
    times.push(performance.now() - start);
  }

  return {
    avgMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length * 100) / 100,
    minMs: Math.round(Math.min(...times) * 100) / 100,
    maxMs: Math.round(Math.max(...times) * 100) / 100,
  };
}

export async function testCosineSearch(): Promise<ValidationResult> {
  const details: string[] = [];
  let success = true;

  // Test 1: Verify cosine similarity calculation
  const v1 = [1, 0, 0];
  const v2 = [1, 0, 0];
  const v3 = [0, 1, 0];
  const v4 = [-1, 0, 0];

  const sim1 = cosineSimilarity(v1, v2);
  const sim2 = cosineSimilarity(v1, v3);
  const sim3 = cosineSimilarity(v1, v4);

  if (Math.abs(sim1 - 1.0) > 0.001) {
    success = false;
    details.push(`FAIL: Same vector sim=${sim1}, expected 1.0`);
  }
  if (Math.abs(sim2 - 0.0) > 0.001) {
    success = false;
    details.push(`FAIL: Orthogonal sim=${sim2}, expected 0.0`);
  }
  if (Math.abs(sim3 - -1.0) > 0.001) {
    success = false;
    details.push(`FAIL: Opposite sim=${sim3}, expected -1.0`);
  }

  if (success) {
    details.push('Cosine math verified');
  }

  // Test 2: Verify dot product equals cosine for normalized vectors
  const normV1 = generateRandomVector(VECTOR_DIMENSIONS);
  const normV2 = generateRandomVector(VECTOR_DIMENSIONS);
  const dot = dotProduct(normV1, normV2);
  const cos = cosineSimilarity(normV1, normV2);

  if (Math.abs(dot - cos) > 0.001) {
    details.push(`WARNING: Dot (${dot.toFixed(4)}) != Cosine (${cos.toFixed(4)})`);
  } else {
    details.push('Dot product optimization verified');
  }

  // Test 3: Benchmark with 100 vectors
  const bench100 = benchmarkSearch(100, 20);
  details.push(`100 vectors: avg=${bench100.avgMs}ms`);

  if (bench100.avgMs > 5) {
    success = false;
    details.push(`FAIL: 100 vectors too slow (>${5}ms)`);
  }

  // Test 4: Benchmark with 1000 vectors
  const bench1000 = benchmarkSearch(1000, 10);
  details.push(`1000 vectors: avg=${bench1000.avgMs}ms`);

  if (bench1000.avgMs > 20) {
    success = false;
    details.push(`FAIL: 1000 vectors too slow (>${20}ms)`);
  }

  // Test 5: Benchmark with 5000 vectors
  const bench5000 = benchmarkSearch(5000, 5);
  details.push(`5000 vectors: avg=${bench5000.avgMs}ms`);

  if (bench5000.avgMs > 100) {
    success = false;
    details.push(`FAIL: 5000 vectors too slow (>${100}ms)`);
  } else if (bench5000.avgMs > 50) {
    details.push('WARNING: Consider Web Worker for 5K+ vectors');
  }

  // Test 6: Verify search correctness
  const testVectors = [
    [1, 0, 0, 0, 0], // Most similar to query
    [0.9, 0.1, 0, 0, 0],
    [0.5, 0.5, 0, 0, 0],
    [0, 1, 0, 0, 0],
    [-1, 0, 0, 0, 0], // Least similar
  ];
  const testQuery = [1, 0, 0, 0, 0];
  const results = searchTopK(testQuery, testVectors, 3);

  if (results[0]?.index !== 0 || results[1]?.index !== 1 || results[2]?.index !== 2) {
    success = false;
    details.push(`FAIL: Wrong ranking: [${results.map((r) => r.index).join(',')}]`);
  } else {
    details.push('Ranking verified');
  }

  // Memory estimate
  const memoryMB = (5000 * VECTOR_DIMENSIONS * 8) / (1024 * 1024);
  details.push(`5K vectors memory: ~${memoryMB.toFixed(1)}MB`);

  return {
    name: 'cosine-search',
    success,
    duration: 0,
    details: details.join(' | '),
  };
}
