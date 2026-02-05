/**
 * LLM Provider Configuration
 *
 * Types and constants for the multi-provider system (Gemini direct + OpenRouter + Groq).
 * Embeddings always use Gemini regardless of provider selection.
 */

export type LLMProvider = 'gemini' | 'openrouter' | 'groq';

export interface ProviderConfig {
  provider: LLMProvider;
  openrouterApiKey?: string;
  openrouterModel: string;
  groqApiKey?: string;
  groqModel: string;
  suggestionCooldownMs: number;
}

export interface OpenRouterModel {
  id: string;
  label: string;
}

export const OPENROUTER_MODELS: OpenRouterModel[] = [
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
  { id: 'openai/gpt-4o', label: 'GPT-4o' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
];

/** Groq model entries — IDs are Groq-native format (not OpenRouter) */
export interface GroqModel {
  id: string;
  label: string;
}

export const GROQ_MODELS: GroqModel[] = [
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout — Fast & Balanced (recommended)' },
  { id: 'qwen/qwen3-32b', label: 'Qwen 3 32B — Strong Reasoning' },
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B — Highest Quality' },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B — Ultra Fast, Basic' },
];

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  provider: 'gemini',
  openrouterModel: 'google/gemini-2.5-flash',
  groqModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
  suggestionCooldownMs: 15000,
};

/**
 * Provider-specific cooldown defaults (ms).
 *
 * Gemini free-tier enforces strict per-minute quotas → 15 s gap.
 * OpenRouter paid tier has no platform RPM cap (rate = $balance RPS),
 * so we only add a 2 s padding against upstream bursts.
 * Groq free tier allows 30 RPM → 2 s is safe.
 */
export const PROVIDER_COOLDOWNS: Record<LLMProvider, number> = {
  gemini: 15000,
  openrouter: 2000,
  groq: 2000,
};

/** Storage keys used for provider configuration */
export const PROVIDER_STORAGE_KEYS = [
  'llmProvider',
  'openrouterApiKey',
  'openrouterModel',
  'groqApiKey',
  'groqModel',
  'suggestionCooldownMs',
] as const;

/** OpenRouter API base URL */
export const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

/** Groq API base URL */
export const GROQ_API_BASE = 'https://api.groq.com/openai/v1';
