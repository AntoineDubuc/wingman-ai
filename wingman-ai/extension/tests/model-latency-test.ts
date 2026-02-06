/**
 * Model Latency Test — All Providers, All Models
 *
 * Tests latency for every selectable model to determine per-model stagger timing.
 *
 * Run: npx tsx tests/model-latency-test.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read API keys from .env file
function loadEnv(): Record<string, string> {
  const envPath = resolve(import.meta.dirname, '../../.env');
  try {
    const content = readFileSync(envPath, 'utf-8');
    const env: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      if (key) env[key.trim()] = valueParts.join('=').trim();
    }
    return env;
  } catch {
    throw new Error('.env file not found at wingman-ai/.env');
  }
}

const env = loadEnv();

interface ModelConfig {
  provider: 'gemini' | 'groq' | 'openrouter';
  model: string;
  label: string;
}

// All models from llm-config.ts
const ALL_MODELS: ModelConfig[] = [
  // Gemini (direct API)
  { provider: 'gemini', model: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { provider: 'gemini', model: 'gemini-2.5-flash-preview-05-20', label: 'Gemini 2.5 Flash Preview' },

  // Groq
  { provider: 'groq', model: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B' },
  { provider: 'groq', model: 'qwen/qwen3-32b', label: 'Qwen 3 32B' },
  { provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
  { provider: 'groq', model: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },

  // OpenRouter
  { provider: 'openrouter', model: 'google/gemini-2.5-flash', label: 'OR: Gemini 2.5 Flash' },
  { provider: 'openrouter', model: 'google/gemini-2.5-pro', label: 'OR: Gemini 2.5 Pro' },
  { provider: 'openrouter', model: 'anthropic/claude-sonnet-4', label: 'OR: Claude Sonnet 4' },
  { provider: 'openrouter', model: 'openai/gpt-4o', label: 'OR: GPT-4o' },
  { provider: 'openrouter', model: 'openai/gpt-4o-mini', label: 'OR: GPT-4o Mini' },
  { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct', label: 'OR: Llama 3.3 70B' },
];

interface LatencyResult {
  model: string;
  label: string;
  provider: string;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  successCount: number;
  totalCount: number;
  suggestedStaggerMs: number;
  error?: string;
}

async function testModel(config: ModelConfig, numRequests: number = 3): Promise<LatencyResult> {
  const prompt = 'Say "ok" and nothing else.';
  const latencies: number[] = [];
  let errorMsg: string | undefined;

  for (let i = 0; i < numRequests; i++) {
    const start = Date.now();
    try {
      let response: Response;

      if (config.provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${env.GEMINI_API_KEY}`;
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 50 },
          }),
        });
      } else if (config.provider === 'groq') {
        response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 50,
          }),
        });
      } else {
        // OpenRouter
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.OPEN_ROUTER_API_KEY}`,
            'HTTP-Referer': 'https://wingman-ai.com',
            'X-Title': 'Wingman AI Latency Test',
          },
          body: JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 50,
          }),
        });
      }

      const latencyMs = Date.now() - start;

      if (response.status === 429) {
        errorMsg = 'Rate limited';
        await new Promise(r => setTimeout(r, 2000)); // Back off
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        errorMsg = `${response.status}: ${text.slice(0, 80)}`;
        continue;
      }

      await response.json();
      latencies.push(latencyMs);

      // Small delay between requests
      if (i < numRequests - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (err) {
      errorMsg = String(err);
    }
  }

  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0;

  // Suggested stagger = avg latency / 4 personas * 1.5 buffer, minimum 50ms
  const suggestedStagger = latencies.length > 0
    ? Math.max(50, Math.round((avgLatency / 4) * 1.5))
    : 200;

  return {
    model: config.model,
    label: config.label,
    provider: config.provider,
    avgLatencyMs: avgLatency,
    minLatencyMs: latencies.length > 0 ? Math.min(...latencies) : 0,
    maxLatencyMs: latencies.length > 0 ? Math.max(...latencies) : 0,
    successCount: latencies.length,
    totalCount: numRequests,
    suggestedStaggerMs: suggestedStagger,
    error: errorMsg,
  };
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('MODEL LATENCY TEST — All Providers, All Models');
  console.log('='.repeat(80));
  console.log();

  const results: LatencyResult[] = [];

  for (const config of ALL_MODELS) {
    // Check API key
    const keyMap: Record<string, string | undefined> = {
      gemini: env.GEMINI_API_KEY,
      groq: env.GROQ_API_KEY,
      openrouter: env.OPEN_ROUTER_API_KEY,
    };

    if (!keyMap[config.provider]) {
      console.log(`⚠️  Skipping ${config.label}: No ${config.provider} API key`);
      continue;
    }

    process.stdout.write(`Testing ${config.label}...`);
    const result = await testModel(config);
    results.push(result);

    if (result.successCount === 0) {
      console.log(` ❌ FAILED (${result.error})`);
    } else {
      console.log(` ✓ avg=${result.avgLatencyMs}ms (${result.minLatencyMs}-${result.maxLatencyMs}ms)`);
    }

    // Delay between models to avoid rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  // Summary table
  console.log('\n' + '='.repeat(80));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(80));
  console.log();
  console.log('Model                              | Avg    | Min-Max       | Stagger | Status');
  console.log('-'.repeat(80));

  for (const r of results) {
    const status = r.successCount === r.totalCount ? '✓' : `${r.successCount}/${r.totalCount}`;
    const latencyRange = r.successCount > 0 ? `${r.minLatencyMs}-${r.maxLatencyMs}ms` : 'N/A';
    console.log(
      `${r.label.padEnd(34)} | ${String(r.avgLatencyMs).padStart(4)}ms | ${latencyRange.padStart(13)} | ${String(r.suggestedStaggerMs).padStart(5)}ms | ${status}`
    );
  }

  // Generate code for MODEL_STAGGER_MS constant
  console.log('\n' + '='.repeat(80));
  console.log('GENERATED CODE — Copy to llm-config.ts or service-worker.ts');
  console.log('='.repeat(80));
  console.log();
  console.log('export const MODEL_STAGGER_MS: Record<string, number> = {');
  for (const r of results) {
    if (r.successCount > 0) {
      console.log(`  '${r.model}': ${r.suggestedStaggerMs},`);
    }
  }
  console.log('};');
  console.log();
  console.log('// Default fallbacks by provider');

  // Calculate provider averages
  const providerAvg: Record<string, number[]> = { gemini: [], groq: [], openrouter: [] };
  for (const r of results) {
    if (r.successCount > 0) {
      providerAvg[r.provider].push(r.suggestedStaggerMs);
    }
  }

  console.log('export const PROVIDER_STAGGER_FALLBACK: Record<string, number> = {');
  for (const [provider, staggers] of Object.entries(providerAvg)) {
    if (staggers.length > 0) {
      const avg = Math.round(staggers.reduce((a, b) => a + b, 0) / staggers.length);
      console.log(`  '${provider}': ${avg},`);
    }
  }
  console.log('};');
}

runTests().catch(console.error);
