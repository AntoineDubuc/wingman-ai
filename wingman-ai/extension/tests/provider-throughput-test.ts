/**
 * Provider Throughput Test
 *
 * Measures latency and sustainable request rate for Gemini and Groq.
 * Helps determine optimal Hydra stagger timing.
 *
 * Run: npx tsx tests/provider-throughput-test.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read API keys from .env file (in parent wingman-ai/ folder)
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
    console.error('Error: .env file not found at wingman-ai/.env');
    throw new Error('.env file not found');
  }
}

const env = loadEnv();

interface ProviderConfig {
  name: string;
  apiKey: string;
  endpoint: string;
  model: string;
  buildRequest: (prompt: string) => object;
  parseResponse: (data: unknown) => string;
}

const providers: ProviderConfig[] = [
  {
    name: 'Gemini',
    apiKey: env.GEMINI_API_KEY || '',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    model: 'gemini-2.0-flash',
    buildRequest: (prompt: string) => ({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 50 },
    }),
    parseResponse: (data: unknown) => {
      const d = data as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '(no response)';
    },
  },
  {
    name: 'Groq',
    apiKey: env.GROQ_API_KEY || '',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.1-8b-instant',
    buildRequest: (prompt: string) => ({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 50,
    }),
    parseResponse: (data: unknown) => {
      const d = data as { choices?: { message?: { content?: string } }[] };
      return d.choices?.[0]?.message?.content?.trim() ?? '(no response)';
    },
  },
];

interface RequestResult {
  success: boolean;
  latencyMs: number;
  error?: string;
  rateLimited?: boolean;
}

async function makeRequest(provider: ProviderConfig, prompt: string): Promise<RequestResult> {
  const start = Date.now();

  try {
    const url = provider.name === 'Gemini'
      ? `${provider.endpoint}?key=${provider.apiKey}`
      : provider.endpoint;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (provider.name !== 'Gemini') {
      headers['Authorization'] = `Bearer ${provider.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(provider.buildRequest(prompt)),
    });

    const latencyMs = Date.now() - start;

    if (response.status === 429) {
      return { success: false, latencyMs, rateLimited: true, error: 'Rate limited' };
    }

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, latencyMs, error: `${response.status}: ${errorText.slice(0, 100)}` };
    }

    await response.json(); // Parse to ensure valid response
    return { success: true, latencyMs };
  } catch (error) {
    return { success: false, latencyMs: Date.now() - start, error: String(error) };
  }
}

async function testBurstRate(provider: ProviderConfig, burstSize: number): Promise<{
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  successRate: number;
  rateLimitedCount: number;
}> {
  const prompt = 'Say "ok" and nothing else.';
  const results: RequestResult[] = [];

  console.log(`  Sending ${burstSize} parallel requests...`);

  // Fire all requests in parallel
  const promises = Array.from({ length: burstSize }, () => makeRequest(provider, prompt));
  const settled = await Promise.all(promises);
  results.push(...settled);

  const successful = results.filter(r => r.success);
  const rateLimited = results.filter(r => r.rateLimited);
  const latencies = successful.map(r => r.latencyMs);

  return {
    avgLatencyMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    minLatencyMs: latencies.length > 0 ? Math.min(...latencies) : 0,
    maxLatencyMs: latencies.length > 0 ? Math.max(...latencies) : 0,
    successRate: (successful.length / burstSize) * 100,
    rateLimitedCount: rateLimited.length,
  };
}

async function testSustainedRate(provider: ProviderConfig, requestsPerSecond: number, durationSec: number): Promise<{
  totalRequests: number;
  successfulRequests: number;
  rateLimitedRequests: number;
  avgLatencyMs: number;
}> {
  const prompt = 'Say "ok" and nothing else.';
  const intervalMs = 1000 / requestsPerSecond;
  const totalRequests = requestsPerSecond * durationSec;
  const results: RequestResult[] = [];

  console.log(`  Testing ${requestsPerSecond} req/s for ${durationSec}s (${totalRequests} total)...`);

  for (let i = 0; i < totalRequests; i++) {
    const start = Date.now();
    const result = await makeRequest(provider, prompt);
    results.push(result);

    // Show progress
    if ((i + 1) % 5 === 0) {
      const rateLimited = results.filter(r => r.rateLimited).length;
      process.stdout.write(`  Progress: ${i + 1}/${totalRequests} (${rateLimited} rate-limited)\r`);
    }

    // Wait to maintain target rate
    const elapsed = Date.now() - start;
    const waitTime = Math.max(0, intervalMs - elapsed);
    if (waitTime > 0) await new Promise(r => setTimeout(r, waitTime));
  }
  console.log(); // New line after progress

  const successful = results.filter(r => r.success);
  const rateLimited = results.filter(r => r.rateLimited);
  const latencies = successful.map(r => r.latencyMs);

  return {
    totalRequests,
    successfulRequests: successful.length,
    rateLimitedRequests: rateLimited.length,
    avgLatencyMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
  };
}

async function runTests() {
  console.log('='.repeat(70));
  console.log('PROVIDER THROUGHPUT TEST');
  console.log('='.repeat(70));
  console.log();

  for (const provider of providers) {
    if (!provider.apiKey) {
      console.log(`⚠️  Skipping ${provider.name}: No API key found`);
      continue;
    }

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`TESTING: ${provider.name} (${provider.model})`);
    console.log('─'.repeat(70));

    // Test 1: Single request latency (warm-up)
    console.log('\n📍 Single request (warm-up):');
    const warmup = await makeRequest(provider, 'Say "hello"');
    console.log(`  Latency: ${warmup.latencyMs}ms ${warmup.success ? '✓' : '✗ ' + warmup.error}`);

    // Test 2: Burst of 4 (simulates Hydra with 4 personas)
    console.log('\n📍 Burst test (4 parallel - Hydra simulation):');
    const burst4 = await testBurstRate(provider, 4);
    console.log(`  Success rate: ${burst4.successRate.toFixed(0)}%`);
    console.log(`  Latency: avg=${burst4.avgLatencyMs}ms, min=${burst4.minLatencyMs}ms, max=${burst4.maxLatencyMs}ms`);
    console.log(`  Rate limited: ${burst4.rateLimitedCount}/4`);

    // Wait before sustained test
    await new Promise(r => setTimeout(r, 2000));

    // Test 3: Sustained rate (2 req/s for 10 seconds)
    console.log('\n📍 Sustained rate test (2 req/s for 10s):');
    const sustained = await testSustainedRate(provider, 2, 10);
    console.log(`  Success: ${sustained.successfulRequests}/${sustained.totalRequests}`);
    console.log(`  Rate limited: ${sustained.rateLimitedRequests}`);
    console.log(`  Avg latency: ${sustained.avgLatencyMs}ms`);

    // Recommendations
    console.log('\n📊 Recommendations for Hydra:');
    if (burst4.rateLimitedCount === 0 && sustained.rateLimitedRequests === 0) {
      console.log(`  ✅ ${provider.name} can handle 4 parallel personas with ~${burst4.avgLatencyMs}ms latency`);
      console.log(`  ✅ Sustained 2 req/s is safe`);
      const stagger = Math.ceil(burst4.avgLatencyMs / 4);
      console.log(`  💡 Suggested stagger: ${stagger}ms between persona calls`);
    } else {
      console.log(`  ⚠️  Rate limiting detected — reduce parallel calls or increase stagger`);
      console.log(`  💡 Consider 200-300ms stagger between persona calls`);
    }

    // Wait between providers
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log('\n' + '='.repeat(70));
  console.log('TEST COMPLETE');
  console.log('='.repeat(70));
}

runTests().catch(console.error);
