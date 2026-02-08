/**
 * Lightweight API caller for testing prompts against actual models.
 *
 * Does NOT use the Gemini service singleton — makes direct fetch() calls
 * for isolation. No session state, no cooldowns, no KB injection, no
 * model-tuning runtime. Tests the raw prompt as written.
 */

import type { TestQuestion, TestResult, ComparisonTestResult, KBTestQuestion, KBTestResult } from '../shared/persona';
import type { LLMProvider } from '../shared/llm-config';
import { OPENROUTER_API_BASE, GROQ_API_BASE, PROVIDER_COOLDOWNS } from '../shared/llm-config';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Groq model IDs that don't have a slash prefix
const GROQ_DIRECT_MODELS = new Set([
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
]);

// Groq models with slash prefix
const GROQ_SLASH_MODELS = new Set([
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'qwen/qwen3-32b',
]);

/**
 * Infer the provider from a model ID.
 */
export function inferProvider(modelId: string): LLMProvider {
  if (modelId.startsWith('gemini-')) return 'gemini';
  if (GROQ_DIRECT_MODELS.has(modelId)) return 'groq';
  if (GROQ_SLASH_MODELS.has(modelId)) return 'groq';
  // Remaining slash models are OpenRouter
  return 'openrouter';
}

/**
 * Make a single API call to test a prompt with a user message.
 * Returns the raw response text, latency, and estimated cost.
 */
export async function testApiCall(
  modelId: string,
  apiKey: string,
  systemPrompt: string,
  userMessage: string
): Promise<{ response: string; latencyMs: number; cost: number }> {
  const provider = inferProvider(modelId);
  const start = performance.now();

  let response: string;

  if (provider === 'gemini') {
    response = await callGemini(modelId, apiKey, systemPrompt, userMessage);
  } else if (provider === 'openrouter') {
    response = await callOpenAIFormat(
      `${OPENROUTER_API_BASE}/chat/completions`,
      modelId,
      apiKey,
      systemPrompt,
      userMessage
    );
  } else {
    response = await callOpenAIFormat(
      `${GROQ_API_BASE}/chat/completions`,
      modelId,
      apiKey,
      systemPrompt,
      userMessage
    );
  }

  const latencyMs = Math.round(performance.now() - start);
  // Rough cost estimate: ~$0.001 per 1K tokens, ~4 chars per token
  const estimatedTokens = (systemPrompt.length + userMessage.length + response.length) / 4;
  const cost = (estimatedTokens / 1000) * 0.001;

  return { response, latencyMs, cost };
}

async function callGemini(
  modelId: string,
  apiKey: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const url = `${GEMINI_API_BASE}/${modelId}:generateContent?key=${apiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 512,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await res.json();
  // Handle thinking models: skip parts with thought=true
  const parts = data?.candidates?.[0]?.content?.parts as
    Array<{ text?: string; thought?: boolean }> | undefined;
  if (parts && parts.length > 0) {
    const nonThought = parts.filter((p: { thought?: boolean }) => !p.thought);
    if (nonThought.length > 0) return (nonThought[0] as { text?: string }).text ?? '';
  }
  return parts?.[0]?.text ?? '';
}

async function callOpenAIFormat(
  baseUrl: string,
  modelId: string,
  apiKey: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const body = {
    model: modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.3,
    max_tokens: 512,
  };

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

/**
 * Evaluate a single test result: did the model pass or fail?
 */
export function evaluateResult(
  question: TestQuestion,
  response: string
): Pick<TestResult, 'status' | 'failureReason'> {
  const trimmed = response.trim();
  const isSilent = trimmed === '---';
  const isSubstantive = trimmed.length > 10 && !isSilent;

  if (question.expectedBehavior === 'respond') {
    if (isSubstantive) return { status: 'pass' };
    if (isSilent) return { status: 'fail', failureReason: 'should-have-responded' };
    return { status: 'fail', failureReason: 'wrong-behavior' };
  }

  // expectedBehavior === 'silent'
  if (isSilent) return { status: 'pass' };
  return { status: 'fail', failureReason: 'should-be-silent' };
}

/**
 * Run a batch of test questions against a prompt.
 * Spaces calls by provider cooldown to avoid rate limiting.
 */
export async function runTests(
  modelId: string,
  apiKey: string,
  systemPrompt: string,
  questions: TestQuestion[]
): Promise<TestResult[]> {
  const provider = inferProvider(modelId);
  const cooldown = PROVIDER_COOLDOWNS[provider];
  const results: TestResult[] = [];

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i]!;

    try {
      const { response, latencyMs, cost } = await testApiCall(
        modelId, apiKey, systemPrompt, question.text
      );

      const evaluation = evaluateResult(question, response);
      results.push({
        question,
        response,
        status: evaluation.status,
        failureReason: evaluation.failureReason,
        cost,
        latencyMs,
      });
    } catch (err) {
      results.push({
        question,
        response: '',
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        cost: 0,
        latencyMs: 0,
      });
    }

    // Rate limit: wait between calls (skip after last)
    if (i < questions.length - 1) {
      await new Promise(resolve => setTimeout(resolve, cooldown));
    }
  }

  return results;
}

/**
 * Run comparison tests: same questions against two prompts.
 */
export async function runComparisonTests(
  modelId: string,
  apiKey: string,
  currentPrompt: string,
  comparedPrompt: string,
  questions: TestQuestion[]
): Promise<ComparisonTestResult[]> {
  const currentResults = await runTests(modelId, apiKey, currentPrompt, questions);
  const comparedResults = await runTests(modelId, apiKey, comparedPrompt, questions);

  return questions.map((question, i) => ({
    question,
    current: currentResults[i]!,
    compared: comparedResults[i]!,
  }));
}

/**
 * Estimate cost before running tests.
 */
export function estimateCost(
  questionCount: number,
  comparison: boolean,
  _avgPromptLength: number = 2000
): number {
  const callsPerQuestion = comparison ? 2 : 1;
  const totalCalls = questionCount * callsPerQuestion;
  // ~$0.001 per call (rough average across models)
  return totalCalls * 0.001;
}

// === KB INTEGRATION TESTS (Phase 24 — Task 10) ===

const DEFAULT_IMPOSSIBLE_FACT = '$999/seat for the Enterprise tier';
const MISSING_DATA_DECLINE_PATTERNS = [
  '---',
  "don't have",
  "do not have",
  'not available',
  'no information',
  'not in',
  "don't know",
  "do not know",
  'no data',
  'cannot find',
  "can't find",
  'not mentioned',
  'no mention',
  'not specified',
  'unable to find',
];

/**
 * Extract the numeric value from an impossible fact string.
 * E.g. "$999/seat for the Enterprise tier" → "999"
 */
function extractImpossibleNumber(fact: string): string {
  const match = /\d[\d,]*/.exec(fact);
  return match ? match[0].replace(/,/g, '') : fact;
}

/**
 * Extract the dollar amount string from an impossible fact.
 * E.g. "$999/seat for the Enterprise tier" → "$999"
 */
function extractImpossibleDollar(fact: string): string {
  const match = /\$[\d,]+/.exec(fact);
  return match ? match[0] : '';
}

/**
 * Build KB test questions for a persona's knowledge base.
 */
export function buildKBTestQuestions(
  kbDocNames: string[],
  customImpossibleFact?: string,
): KBTestQuestion[] {
  const impossibleFact = customImpossibleFact ?? DEFAULT_IMPOSSIBLE_FACT;
  const questions: KBTestQuestion[] = [];

  // 1. Real citation test — references the first doc name
  const docTopic = kbDocNames.length > 0
    ? kbDocNames[0]!.replace(/\.[^.]+$/, '') // strip file extension
    : 'the uploaded documents';

  questions.push({
    text: `Based on the knowledge base documents, what are the key details about ${docTopic}?`,
    expectedBehavior: 'respond',
    category: 'kb',
    source: 'auto',
    testType: 'real-citation',
    groupLabel: 'KB: Real Citation',
    behaviorHint: 'Should cite data from uploaded KB documents',
  });

  // 2. Impossible knowledge test — inject synthetic fact
  questions.push({
    text: 'What is the exact pricing?',
    expectedBehavior: 'respond',
    category: 'kb',
    source: 'auto',
    testType: 'impossible-knowledge',
    kbContext: `PRICING INFORMATION:\n${impossibleFact}. This is the only available pricing tier.`,
    expectedCitation: impossibleFact,
    groupLabel: 'KB: Impossible Knowledge',
    behaviorHint: `Should return the injected fact: ${impossibleFact}`,
  });

  // 3. Missing data test — query for something not in KB
  questions.push({
    text: "What is the company's policy on quantum computing?",
    expectedBehavior: 'silent',
    category: 'kb',
    source: 'auto',
    testType: 'missing-data',
    groupLabel: 'KB: Missing Data',
    behaviorHint: 'Should decline — no KB data on this topic',
  });

  return questions;
}

/**
 * Evaluate a KB test result based on its test type.
 */
export function evaluateKBResult(
  question: KBTestQuestion,
  response: string,
): Pick<KBTestResult, 'status' | 'failureReason' | 'citationCorrect'> {
  const trimmed = response.trim();
  const isSilent = trimmed === '---';
  const lower = trimmed.toLowerCase();

  switch (question.testType) {
    case 'real-citation': {
      // Pass if the model gave a substantive response with KB data
      const isSubstantive = trimmed.length > 10 && !isSilent;
      if (isSubstantive) {
        return { status: 'pass', citationCorrect: true };
      }
      if (isSilent) {
        return { status: 'fail', failureReason: 'should-have-responded', citationCorrect: false };
      }
      return { status: 'fail', failureReason: 'wrong-behavior', citationCorrect: false };
    }

    case 'impossible-knowledge': {
      // Pass if response contains the injected number or dollar amount
      const fact = question.expectedCitation ?? DEFAULT_IMPOSSIBLE_FACT;
      const number = extractImpossibleNumber(fact);
      const dollar = extractImpossibleDollar(fact);

      const containsNumber = trimmed.includes(number);
      const containsDollar = dollar !== '' && trimmed.includes(dollar);

      if (containsNumber || containsDollar) {
        return { status: 'pass', citationCorrect: true };
      }
      return { status: 'fail', failureReason: 'wrong-behavior', citationCorrect: false };
    }

    case 'missing-data': {
      // Pass if model declines (silent or uses decline phrases)
      if (isSilent) {
        return { status: 'pass', citationCorrect: null };
      }
      const declines = MISSING_DATA_DECLINE_PATTERNS.some(
        pattern => lower.includes(pattern),
      );
      if (declines) {
        return { status: 'pass', citationCorrect: null };
      }
      return { status: 'fail', failureReason: 'should-be-silent', citationCorrect: null };
    }
  }
}

/**
 * Run KB integration tests against a persona's knowledge base.
 *
 * Uses dynamic import for KB search (depends on IndexedDB).
 */
export async function runKBTests(
  modelId: string,
  apiKey: string,
  systemPrompt: string,
  personaId: string,
  customImpossibleFact?: string,
): Promise<KBTestResult[]> {
  const provider = inferProvider(modelId);
  const cooldown = PROVIDER_COOLDOWNS[provider];
  const results: KBTestResult[] = [];

  // Load persona's KB document IDs
  const { getPersonas } = await import('../shared/persona');
  const personas = await getPersonas();
  const persona = personas.find(p => p.id === personaId);
  const kbDocumentIds = persona?.kbDocumentIds ?? [];

  // Get doc names for building questions
  let kbDocNames: string[] = [];
  try {
    const { kbDatabase } = await import('./kb/kb-database');
    await kbDatabase.init();
    const docs = await kbDatabase.getDocuments();
    const idSet = new Set(kbDocumentIds);
    kbDocNames = docs
      .filter(d => idSet.has(d.id) && d.status === 'complete')
      .map(d => d.filename);
  } catch {
    // IndexedDB may not be available
  }

  const questions = buildKBTestQuestions(kbDocNames, customImpossibleFact);

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i]!;

    try {
      let augmentedPrompt = systemPrompt;
      let kbChunkRetrieved = false;
      let similarityScore: number | null = null;
      let sourceFilename: string | null = null;

      if (question.testType === 'real-citation') {
        // Search real KB for context
        try {
          const { searchKB } = await import('./kb/kb-search');
          const kbResults = await searchKB(question.text, 3, 0.55, kbDocumentIds);
          if (kbResults.length > 0) {
            kbChunkRetrieved = true;
            similarityScore = kbResults[0]!.score;
            sourceFilename = kbResults[0]!.documentName;
            const kbContext = kbResults.map(r => r.chunk.text).join('\n\n---\n\n');
            augmentedPrompt = `${systemPrompt}\n\nRelevant knowledge base context (source: ${sourceFilename}):\n${kbContext}`;
          }
        } catch {
          // KB search failed — test will still run without context
        }
      } else if (question.testType === 'impossible-knowledge' && question.kbContext) {
        // Inject synthetic KB context
        kbChunkRetrieved = true;
        similarityScore = 1.0; // synthetic — perfect match
        sourceFilename = 'injected-test-data';
        augmentedPrompt = `${systemPrompt}\n\nRelevant knowledge base context:\n${question.kbContext}`;
      }
      // missing-data: no KB context injected

      const { response, latencyMs, cost } = await testApiCall(
        modelId, apiKey, augmentedPrompt, question.text,
      );

      const evaluation = evaluateKBResult(question, response);

      results.push({
        question,
        response,
        status: evaluation.status,
        failureReason: evaluation.failureReason,
        citationCorrect: evaluation.citationCorrect,
        kbChunkRetrieved,
        similarityScore,
        sourceFilename,
        cost,
        latencyMs,
      });
    } catch (err) {
      results.push({
        question,
        response: '',
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        kbChunkRetrieved: false,
        similarityScore: null,
        sourceFilename: null,
        citationCorrect: null,
        cost: 0,
        latencyMs: 0,
      });
    }

    // Rate limit: wait between calls (skip after last)
    if (i < questions.length - 1) {
      await new Promise(resolve => setTimeout(resolve, cooldown));
    }
  }

  return results;
}
