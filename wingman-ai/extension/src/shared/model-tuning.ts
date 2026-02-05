/**
 * Model Tuning Profiles
 *
 * Maps model IDs to families and defines per-family prompt tuning profiles.
 * Used by the prompt tuning engine to adapt persona prompts for each model's quirks.
 *
 * Profiles encode research findings — no API calls, no AI.
 * Summary temperature (0.2) is never overridden; only suggestion temperature is tuned.
 */

export type ModelFamily = 'gemini' | 'claude' | 'gpt' | 'llama' | 'qwen';

/**
 * Maps every model ID (across all providers) to its family.
 * Unknown models are not in this map — they get the neutral fallback profile.
 */
export const MODEL_FAMILY_MAP: Record<string, ModelFamily> = {
  // Gemini (direct provider — hardcoded model, not in a dropdown)
  'gemini-2.5-flash': 'gemini',

  // OpenRouter models
  'google/gemini-2.5-flash': 'gemini',
  'google/gemini-2.5-pro': 'gemini',
  'anthropic/claude-sonnet-4': 'claude',
  'openai/gpt-4o': 'gpt',
  'openai/gpt-4o-mini': 'gpt',
  'meta-llama/llama-3.3-70b-instruct': 'llama',

  // Groq models
  'meta-llama/llama-4-scout-17b-16e-instruct': 'llama',
  'qwen/qwen3-32b': 'qwen',
  'llama-3.3-70b-versatile': 'llama',
  'llama-3.1-8b-instant': 'llama',
};

export interface ModelTuningProfile {
  /** Optimal temperature for suggestion calls only. Summary uses hardcoded 0.2. */
  suggestionTemperature: number;
  /** Extra text appended to system prompt about the --- silence convention. */
  silenceReinforcement: string;
  /** Adapted text for the hardcoded silence hints in buildConversationMessages(). Null = keep default. */
  conversationSilenceHint: string | null;
  /** Text prepended to system prompt (e.g., Qwen /no_think). */
  promptPrefix: string | null;
  /** Text appended to system prompt. */
  promptSuffix: string | null;
  /** Text prepended to the standalone summary prompt string. */
  summaryPromptPrefix: string | null;
  /** Extra text injected before the "Return ONLY valid JSON" line in summary prompt. */
  summaryJsonHint: string | null;
  /** Extra text to ensure JSON compliance for non-summary calls. */
  jsonHint: string | null;
}

/**
 * Per-family tuning profiles.
 * Gemini is the baseline (no-op); others add model-specific adaptations.
 */
export const MODEL_TUNING_PROFILES: Record<ModelFamily, ModelTuningProfile> = {
  gemini: {
    suggestionTemperature: 0.3,
    silenceReinforcement: '',
    conversationSilenceHint: null,
    promptPrefix: null,
    promptSuffix: null,
    summaryPromptPrefix: null,
    summaryJsonHint: null,
    jsonHint: null,
  },

  claude: {
    suggestionTemperature: 0.3,
    silenceReinforcement:
      'When you choose silence (---), it means the conversation is flowing naturally and your input would interrupt. Silence is a valid, positive action — not a failure to respond.',
    conversationSilenceHint: null,
    promptPrefix: null,
    promptSuffix: null,
    summaryPromptPrefix: null,
    summaryJsonHint: null,
    jsonHint: null,
  },

  gpt: {
    suggestionTemperature: 0.3,
    silenceReinforcement:
      'When you respond with ---, do not add any explanation, caveat, or commentary. The response must be exactly --- and nothing else.',
    conversationSilenceHint: null,
    promptPrefix: null,
    promptSuffix: null,
    summaryPromptPrefix: null,
    summaryJsonHint: null,
    jsonHint: 'Respond with valid JSON. Do not wrap in markdown code fences.',
  },

  llama: {
    suggestionTemperature: 0.5,
    silenceReinforcement:
      'If you have nothing valuable to add, you MUST respond with exactly three hyphens: ---\nThis is not optional. Do NOT add explanations or caveats when staying silent.\nHere is an example of correct silence:\nUser: [Speaker 1]: Sounds good, let me check my calendar.\nAssistant: ---',
    conversationSilenceHint:
      'Should I provide a suggestion, or stay silent (---)? Remember: if you stay silent, respond with ONLY --- and nothing else.',
    promptPrefix: null,
    promptSuffix: null,
    summaryPromptPrefix: null,
    summaryJsonHint:
      'You MUST respond with raw JSON only. No markdown fencing. No text before or after the JSON object.',
    jsonHint:
      'You MUST respond with raw JSON only. No markdown fencing. No text before or after the JSON object.',
  },

  qwen: {
    suggestionTemperature: 0.6,
    silenceReinforcement:
      'You are allowed to stay silent. If you have nothing useful to add, respond with exactly: ---',
    conversationSilenceHint: null,
    promptPrefix: '/no_think\n',
    promptSuffix: null,
    summaryPromptPrefix: '/think\n',
    summaryJsonHint: 'Respond only in raw JSON. No extra text or explanations.',
    jsonHint: 'Respond only in raw JSON. No extra text or explanations.',
  },
};

/** Default profile for unknown models — minimal, safe defaults. */
export const NEUTRAL_PROFILE: ModelTuningProfile = {
  suggestionTemperature: 0.4,
  silenceReinforcement: '',
  conversationSilenceHint: null,
  promptPrefix: null,
  promptSuffix: null,
  summaryPromptPrefix: null,
  summaryJsonHint: null,
  jsonHint: null,
};

/**
 * Resolve the model family for a given model ID.
 * Returns null for unknown models (caller should use NEUTRAL_PROFILE).
 */
export function getModelFamily(modelId: string): ModelFamily | null {
  return MODEL_FAMILY_MAP[modelId] ?? null;
}

/**
 * Get the tuning profile for a model ID.
 * Returns the neutral profile for unknown models.
 */
export function getTuningProfile(modelId: string): ModelTuningProfile {
  const family = getModelFamily(modelId);
  return family ? MODEL_TUNING_PROFILES[family] : NEUTRAL_PROFILE;
}

/** Storage key for prompt tuning mode. Values: 'off' | 'once' | 'auto' */
export const PROMPT_TUNING_STORAGE_KEY = 'promptTuningMode';

export type PromptTuningMode = 'off' | 'once' | 'auto';

export const DEFAULT_PROMPT_TUNING_MODE: PromptTuningMode = 'auto';
