/**
 * Node.js Validation Test Runner
 *
 * Runs validation tests that don't require browser APIs.
 * For full browser tests, load the extension in Chrome and open validation.html
 *
 * Usage: npx tsx src/validation/node-runner.ts [GEMINI_API_KEY]
 */

// Polyfill for performance.now() if needed
if (typeof performance === 'undefined') {
  const { performance } = require('perf_hooks');
  (global as unknown as { performance: typeof performance }).performance = performance;
}

// Mock chrome.storage.local for tests that need API key
const apiKeyFromEnv = process.argv[2] || process.env.GEMINI_API_KEY;

if (!apiKeyFromEnv) {
  console.log('⚠️  No Gemini API key provided.');
  console.log('   Usage: npx tsx src/validation/node-runner.ts YOUR_API_KEY');
  console.log('   Or set GEMINI_API_KEY environment variable\n');
  console.log('   Tests requiring API key will be skipped.\n');
}

// Mock chrome.storage.local
(global as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: async (keys: string[]) => {
        if (keys.includes('geminiApiKey') && apiKeyFromEnv) {
          return { geminiApiKey: apiKeyFromEnv };
        }
        return {};
      },
    },
  },
};

// Import tests after mocking
import { testCosineSearch } from './test-cosine-search';
import { testTextExtraction } from './test-text-extraction';
import { testPdfExtraction } from './test-pdf-extraction';
import { testGeminiEmbeddings } from './test-gemini-embeddings';
import { testE2ePipeline } from './test-e2e-pipeline';
import type { ValidationResult } from './index';

interface TestConfig {
  name: string;
  fn: () => Promise<ValidationResult>;
  requiresApiKey: boolean;
  requiresBrowser: boolean;
}

const tests: TestConfig[] = [
  { name: 'cosine-search', fn: testCosineSearch, requiresApiKey: false, requiresBrowser: false },
  { name: 'text-extraction', fn: testTextExtraction, requiresApiKey: false, requiresBrowser: false },
  { name: 'pdf-extraction', fn: testPdfExtraction, requiresApiKey: false, requiresBrowser: true }, // PDF.js needs browser
  { name: 'gemini-embeddings', fn: testGeminiEmbeddings, requiresApiKey: true, requiresBrowser: false },
  { name: 'e2e-pipeline', fn: testE2ePipeline, requiresApiKey: true, requiresBrowser: false },
  // indexeddb-vectors requires IndexedDB which is browser-only
];

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Wingman AI - Knowledge Base Validation Tests (Node.js)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const results: ValidationResult[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const test of tests) {
    // Skip tests that require API key if not provided
    if (test.requiresApiKey && !apiKeyFromEnv) {
      console.log(`⏭️  ${test.name}: SKIPPED (no API key)`);
      skipped++;
      continue;
    }

    // Skip browser-only tests
    if (test.requiresBrowser) {
      console.log(`⏭️  ${test.name}: SKIPPED (requires browser)`);
      skipped++;
      continue;
    }

    console.log(`🔄 ${test.name}: Running...`);
    const start = Date.now();

    try {
      const result = await test.fn();
      result.duration = Date.now() - start;
      results.push(result);

      if (result.success) {
        console.log(`✅ ${test.name}: PASSED (${result.duration}ms)`);
        console.log(`   ${result.details}\n`);
        passed++;
      } else {
        console.log(`❌ ${test.name}: FAILED (${result.duration}ms)`);
        console.log(`   ${result.details}`);
        if (result.error) console.log(`   Error: ${result.error}`);
        console.log('');
        failed++;
      }
    } catch (error) {
      const duration = Date.now() - start;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`❌ ${test.name}: ERROR (${duration}ms)`);
      console.log(`   ${errorMsg}\n`);
      results.push({
        name: test.name,
        success: false,
        duration,
        details: 'Test threw an exception',
        error: errorMsg,
      });
      failed++;
    }
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  SUMMARY: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`  Total: ${results.length} tests run`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Additional test info
  console.log('📝 Note: IndexedDB tests require browser environment.');
  console.log('   Load the extension in Chrome and open:');
  console.log('   chrome-extension://[EXTENSION_ID]/src/validation/validation.html\n');

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
