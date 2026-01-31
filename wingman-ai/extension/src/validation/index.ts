/**
 * KB Validation Test Harness
 *
 * Runs technical validation tests for Knowledge Base components.
 * Triggered from service worker via message: { type: 'RUN_VALIDATION', test: 'all' | 'test-name' }
 */

import { testGeminiEmbeddings } from './test-gemini-embeddings';
import { testPdfExtraction } from './test-pdf-extraction';
import { testTextExtraction } from './test-text-extraction';
import { testIndexedDbVectors } from './test-indexeddb-vectors';
import { testCosineSearch } from './test-cosine-search';
import { testE2ePipeline } from './test-e2e-pipeline';

export interface ValidationResult {
  name: string;
  success: boolean;
  duration: number;
  details: string;
  error?: string;
}

type TestFunction = () => Promise<ValidationResult>;

const tests: Record<string, TestFunction> = {
  'gemini-embeddings': testGeminiEmbeddings,
  'pdf-extraction': testPdfExtraction,
  'text-extraction': testTextExtraction,
  'indexeddb-vectors': testIndexedDbVectors,
  'cosine-search': testCosineSearch,
  'e2e-pipeline': testE2ePipeline,
};

/**
 * Run a single validation test
 */
export async function runTest(name: string): Promise<ValidationResult> {
  const testFn = tests[name];
  if (!testFn) {
    return {
      name,
      success: false,
      duration: 0,
      details: `Unknown test: ${name}`,
      error: 'Test not found',
    };
  }

  console.log(`[VALIDATION] Starting: ${name}`);
  const start = performance.now();

  try {
    const result = await testFn();
    const duration = Math.round(performance.now() - start);
    result.duration = duration;

    const status = result.success ? 'PASS' : 'FAIL';
    console.log(`[VALIDATION] ${name}: ${status} (${duration}ms) - ${result.details}`);

    return result;
  } catch (error) {
    const duration = Math.round(performance.now() - start);
    const errorMsg = error instanceof Error ? error.message : String(error);

    console.error(`[VALIDATION] ${name}: ERROR (${duration}ms) - ${errorMsg}`);

    return {
      name,
      success: false,
      duration,
      details: 'Test threw an exception',
      error: errorMsg,
    };
  }
}

/**
 * Run all validation tests
 */
export async function runAllTests(): Promise<ValidationResult[]> {
  console.log('[VALIDATION] ========================================');
  console.log('[VALIDATION] Starting KB Technical Validation');
  console.log('[VALIDATION] ========================================');

  const results: ValidationResult[] = [];

  for (const name of Object.keys(tests)) {
    const result = await runTest(name);
    results.push(result);
  }

  // Summary
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log('[VALIDATION] ========================================');
  console.log(`[VALIDATION] SUMMARY: ${passed}/${results.length} passed, ${failed} failed`);
  console.log(`[VALIDATION] Total duration: ${totalDuration}ms`);
  console.log('[VALIDATION] ========================================');

  // Log failed tests
  if (failed > 0) {
    console.log('[VALIDATION] Failed tests:');
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`[VALIDATION]   - ${r.name}: ${r.error || r.details}`);
      });
  }

  return results;
}

/**
 * Get list of available tests
 */
export function getAvailableTests(): string[] {
  return Object.keys(tests);
}
