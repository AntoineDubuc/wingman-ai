/**
 * Template Matching for Prompt Setup Assistant
 *
 * Compares user description against 12 built-in persona templates.
 * Uses keyword matching (fast path) + Gemini embedding similarity (slow path).
 * Caches template embeddings in chrome.storage.local with hash-based invalidation.
 */

import {
  DEFAULT_PERSONA_TEMPLATES,
  type PersonaTemplate,
} from '../shared/default-personas';
import { LLM } from '../shared/constants';

// === CONSTANTS ===

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const SIMILARITY_THRESHOLD = 0.7;
const CACHE_STORAGE_KEY = 'templateEmbeddings';

// === TYPES ===

export interface TemplateMatchResult {
  templateName: string;
  similarity: number;
  template: PersonaTemplate;
}

interface TemplateEmbeddingCache {
  version: string;
  embeddings: Record<string, number[]>;
}

/**
 * Keywords mapped to template names for fast-path matching.
 * Each entry: [templateName, keywords[]]
 */
const TEMPLATE_KEYWORDS: Array<[string, string[]]> = [
  ['Job Interview Candidate', ['job interview', 'interview candidate', 'interview prep', 'interview coach']],
  ['Startup Founder (Fundraising)', ['fundraising', 'fundraise', 'investor pitch', 'startup founder', 'vc pitch', 'raise capital', 'pitch deck']],
  ['Freelancer (Rate Negotiation)', ['freelancer', 'freelance', 'rate negotiation', 'client negotiation', 'consulting rate']],
  ['Nonprofit Grant Pitcher', ['nonprofit', 'non-profit', 'grant', 'foundation pitch', 'grant pitch']],
  ['Patient Advocate', ['patient advocate', 'medical appointment', 'insurance dispute', 'healthcare billing', 'medical billing']],
  ['Tenant (Lease Negotiation)', ['tenant', 'lease negotiation', 'landlord', 'rent negotiation', 'rental']],
  ['Parent (IEP Meeting)', ['iep meeting', 'iep', 'special education', 'individualized education']],
  ['Small Business Loan Seeker', ['small business loan', 'business loan', 'sba loan', 'loan seeker', 'bank loan']],
  ['Journalist Interviewer', ['journalist', 'journalism', 'source interview', 'press interview', 'reporter']],
  ['ESL Professional', ['esl', 'english as a second language', 'non-native english', 'language support', 'communication coach']],
  ['Cloud Solutions Sales Consultant', ['cloud sales', 'cloud solutions', 'cloud migration', 'saas sales', 'enterprise cloud']],
];

// === COSINE SIMILARITY (copied from kb-search.ts, no IndexedDB dependency) ===

/**
 * Cosine similarity between two vectors.
 * Assumes normalized embeddings from Gemini (dot product is sufficient).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
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

// === HASH UTILITY ===

/**
 * Simple string hash for cache invalidation.
 * Generates a hex hash from concatenated template prompt texts.
 */
export function computeTemplateHash(templates: PersonaTemplate[]): string {
  const combined = templates.map(t => t.systemPrompt).join('|||');
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0; // Convert to 32-bit integer
  }
  // Convert to unsigned hex string
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// === KEYWORD MATCHING (FAST PATH) ===

/**
 * Check if user description matches any template via keyword matching.
 * Returns immediately with similarity 1.0 if a match is found.
 */
export function matchByKeyword(userDescription: string): TemplateMatchResult | null {
  const lower = userDescription.toLowerCase();

  for (const [templateName, keywords] of TEMPLATE_KEYWORDS) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        const template = DEFAULT_PERSONA_TEMPLATES.find(t => t.name === templateName);
        if (template) {
          return { templateName, similarity: 1.0, template };
        }
      }
    }
  }

  // Also check if user description contains a template name directly
  for (const template of DEFAULT_PERSONA_TEMPLATES) {
    if (lower.includes(template.name.toLowerCase())) {
      return { templateName: template.name, similarity: 1.0, template };
    }
  }

  return null;
}

// === EMBEDDING GENERATION ===

async function getGeminiKey(): Promise<string | null> {
  const storage = await chrome.storage.local.get(['geminiApiKey']);
  return (storage.geminiApiKey as string) ?? null;
}

/**
 * Generate an embedding for a single text using Gemini Embedding API.
 */
async function generateEmbedding(
  text: string,
  apiKey: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT',
): Promise<number[]> {
  const response = await fetch(
    `${GEMINI_API_BASE}/${LLM.EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${LLM.EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: LLM.EMBEDDING_DIMENSIONS,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Embedding API error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = (await response.json()) as { embedding: { values: number[] } };
  return data.embedding.values;
}

// === CACHE MANAGEMENT ===

/**
 * Get cached template embeddings or generate them.
 * Uses hash-based cache invalidation: only regenerates if template prompts changed.
 */
export async function getTemplateEmbeddings(): Promise<Map<string, number[]>> {
  const currentHash = computeTemplateHash(DEFAULT_PERSONA_TEMPLATES);

  // Check cache
  const storage = await chrome.storage.local.get([CACHE_STORAGE_KEY]);
  const cached = storage[CACHE_STORAGE_KEY] as TemplateEmbeddingCache | undefined;

  if (cached && cached.version === currentHash) {
    console.debug('[TemplateMatcher] Using cached embeddings');
    const map = new Map<string, number[]>();
    for (const [name, embedding] of Object.entries(cached.embeddings)) {
      map.set(name, embedding);
    }
    return map;
  }

  // Generate embeddings
  console.debug('[TemplateMatcher] Generating template embeddings...');
  const apiKey = await getGeminiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not configured — cannot generate template embeddings');
  }

  const embeddings = new Map<string, number[]>();

  for (const template of DEFAULT_PERSONA_TEMPLATES) {
    // Embed the template name + first 500 chars of system prompt for matching
    const embeddingText = `${template.name}: ${template.systemPrompt.slice(0, 500)}`;
    const embedding = await generateEmbedding(embeddingText, apiKey);
    embeddings.set(template.name, embedding);
  }

  // Save to cache
  const cacheData: TemplateEmbeddingCache = {
    version: currentHash,
    embeddings: Object.fromEntries(embeddings),
  };
  await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: cacheData });
  console.debug(`[TemplateMatcher] Cached embeddings for ${embeddings.size} templates`);

  return embeddings;
}

/**
 * Clear the template embedding cache.
 */
export async function clearTemplateEmbeddingCache(): Promise<void> {
  await chrome.storage.local.remove(CACHE_STORAGE_KEY);
  console.debug('[TemplateMatcher] Embedding cache cleared');
}

// === MAIN MATCHING FUNCTION ===

/**
 * Match user input against templates. Returns best match if above threshold, null otherwise.
 *
 * Strategy:
 * 1. Fast path: keyword matching (returns similarity 1.0)
 * 2. Slow path: embed user description, compare against cached template embeddings
 */
export async function matchTemplate(userDescription: string): Promise<TemplateMatchResult | null> {
  // Fast path: keyword matching
  const keywordMatch = matchByKeyword(userDescription);
  if (keywordMatch) {
    console.debug(`[TemplateMatcher] Keyword match: "${keywordMatch.templateName}"`);
    return keywordMatch;
  }

  // Slow path: embedding similarity
  const apiKey = await getGeminiKey();
  if (!apiKey) {
    console.warn('[TemplateMatcher] No Gemini API key — skipping embedding match');
    return null;
  }

  try {
    const templateEmbeddings = await getTemplateEmbeddings();
    const queryEmbedding = await generateEmbedding(userDescription, apiKey, 'RETRIEVAL_QUERY');

    let bestMatch: TemplateMatchResult | null = null;
    let bestScore = 0;

    for (const [templateName, templateEmbedding] of templateEmbeddings) {
      const similarity = cosineSimilarity(queryEmbedding, templateEmbedding);
      if (similarity > bestScore) {
        bestScore = similarity;
        const template = DEFAULT_PERSONA_TEMPLATES.find(t => t.name === templateName);
        if (template) {
          bestMatch = { templateName, similarity, template };
        }
      }
    }

    if (bestMatch && bestMatch.similarity >= SIMILARITY_THRESHOLD) {
      console.debug(`[TemplateMatcher] Embedding match: "${bestMatch.templateName}" (${bestMatch.similarity.toFixed(3)})`);
      return bestMatch;
    }

    console.debug(`[TemplateMatcher] No match above threshold (best: ${bestScore.toFixed(3)})`);
    return null;
  } catch (error) {
    console.error('[TemplateMatcher] Embedding match failed:', error);
    return null;
  }
}
