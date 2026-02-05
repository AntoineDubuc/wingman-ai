/**
 * Pricing Table & Cost Types
 *
 * Per-model pricing for all supported providers + Deepgram.
 * Prices are hardcoded (updated with releases). Staleness guard
 * logs a warning if PRICING_LAST_UPDATED is >90 days old.
 */

import type { LLMProvider } from './llm-config';

// ── Staleness guard ──────────────────────────────────────────────

export const PRICING_LAST_UPDATED = '2026-02-05';
const STALE_DAYS = 90;

export function checkPricingStaleness(): void {
  const age = Date.now() - new Date(PRICING_LAST_UPDATED).getTime();
  if (age > STALE_DAYS * 86_400_000) {
    console.warn(
      `[Pricing] Pricing data is ${Math.floor(age / 86_400_000)} days old (last updated ${PRICING_LAST_UPDATED}). Check provider pricing pages.`
    );
  }
}

// ── Per-model token pricing (USD per token) ──────────────────────

export interface ModelPricing {
  inputPerToken: number;
  outputPerToken: number;
}

/**
 * Per-model pricing in USD **per token** (not per million).
 * Rates as of Feb 2026.
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
  // Gemini direct
  'gemini-2.5-flash':            { inputPerToken: 0.15e-6,  outputPerToken: 0.60e-6 },
  'gemini-2.5-pro':              { inputPerToken: 1.25e-6,  outputPerToken: 5.00e-6 },

  // OpenRouter models (includes OR markup)
  'google/gemini-2.5-flash':     { inputPerToken: 0.15e-6,  outputPerToken: 0.60e-6 },
  'google/gemini-2.5-pro':       { inputPerToken: 1.25e-6,  outputPerToken: 5.00e-6 },
  'anthropic/claude-sonnet-4':   { inputPerToken: 3.00e-6,  outputPerToken: 15.00e-6 },
  'openai/gpt-4o':               { inputPerToken: 2.50e-6,  outputPerToken: 10.00e-6 },
  'openai/gpt-4o-mini':          { inputPerToken: 0.15e-6,  outputPerToken: 0.60e-6 },
  'meta-llama/llama-3.3-70b-instruct': { inputPerToken: 0.59e-6, outputPerToken: 0.79e-6 },

  // Groq models
  'meta-llama/llama-4-scout-17b-16e-instruct': { inputPerToken: 0.11e-6, outputPerToken: 0.18e-6 },
  'qwen/qwen3-32b':              { inputPerToken: 0.18e-6,  outputPerToken: 0.18e-6 },
  'llama-3.3-70b-versatile':     { inputPerToken: 0.59e-6,  outputPerToken: 0.79e-6 },
  'llama-3.1-8b-instant':        { inputPerToken: 0.05e-6,  outputPerToken: 0.08e-6 },
};

/** Fallback for unknown models — uses Gemini Flash rates (middle-of-road) */
const FALLBACK_PRICING: ModelPricing = {
  inputPerToken: 0.15e-6,
  outputPerToken: 0.60e-6,
};

export function getModelPricing(modelId: string): ModelPricing {
  return MODEL_PRICING[modelId] ?? FALLBACK_PRICING;
}

// ── Deepgram pricing ─────────────────────────────────────────────

/** Deepgram Nova-3 streaming PAYG rate in USD per minute */
export const DEEPGRAM_RATE_PER_MINUTE = 0.0077;

// ── Provider free tier flags ─────────────────────────────────────

export const PROVIDER_FREE_TIER: Record<LLMProvider, boolean> = {
  gemini: true,
  groq: true,
  openrouter: false,
};

// ── Shared cost types ────────────────────────────────────────────

/** Live cost snapshot (sent during session via cost_update message) */
export interface CostSnapshot {
  deepgramCost: number;
  llmCost: number;
  totalCost: number;
  audioMinutes: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  suggestionCount: number;
  provider: string;
  providerLabel: string;
  isFreeTier: boolean;
}

/** Final cost attached to call summary */
export interface CostEstimate {
  deepgramCost: number;
  llmCost: number;
  totalCost: number;
  audioMinutes: number;
  suggestionCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  provider: string;
  providerLabel: string;
  isFreeTier: boolean;
}
