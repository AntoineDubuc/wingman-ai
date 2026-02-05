/**
 * Tests for model tuning profiles and family resolution.
 * Pure logic — no Chrome APIs needed.
 */

import { describe, it, expect } from 'vitest';
import {
  getModelFamily,
  getTuningProfile,
  MODEL_FAMILY_MAP,
  MODEL_TUNING_PROFILES,
  NEUTRAL_PROFILE,
} from '../src/shared/model-tuning';
import { OPENROUTER_MODELS, GROQ_MODELS } from '../src/shared/llm-config';

describe('MODEL_FAMILY_MAP', () => {
  it('maps every OpenRouter model ID to a family', () => {
    for (const model of OPENROUTER_MODELS) {
      expect(MODEL_FAMILY_MAP[model.id]).toBeDefined();
    }
  });

  it('maps every Groq model ID to a family', () => {
    for (const model of GROQ_MODELS) {
      expect(MODEL_FAMILY_MAP[model.id]).toBeDefined();
    }
  });

  it('maps direct Gemini model ID', () => {
    expect(MODEL_FAMILY_MAP['gemini-2.5-flash']).toBe('gemini');
  });
});

describe('getModelFamily', () => {
  it('returns correct family for known models', () => {
    expect(getModelFamily('google/gemini-2.5-flash')).toBe('gemini');
    expect(getModelFamily('anthropic/claude-sonnet-4')).toBe('claude');
    expect(getModelFamily('openai/gpt-4o')).toBe('gpt');
    expect(getModelFamily('meta-llama/llama-4-scout-17b-16e-instruct')).toBe('llama');
    expect(getModelFamily('qwen/qwen3-32b')).toBe('qwen');
  });

  it('returns null for unknown models', () => {
    expect(getModelFamily('some/unknown-model')).toBeNull();
  });
});

describe('getTuningProfile', () => {
  it('returns Gemini profile for Gemini models (no-op)', () => {
    const profile = getTuningProfile('google/gemini-2.5-flash');
    expect(profile.suggestionTemperature).toBe(0.3);
    expect(profile.silenceReinforcement).toBe('');
    expect(profile.promptPrefix).toBeNull();
  });

  it('returns Llama profile with silence few-shot example', () => {
    const profile = getTuningProfile('meta-llama/llama-4-scout-17b-16e-instruct');
    expect(profile.suggestionTemperature).toBe(0.5);
    expect(profile.silenceReinforcement).toContain('MUST respond with exactly three hyphens');
    expect(profile.conversationSilenceHint).toContain('ONLY ---');
    expect(profile.summaryJsonHint).toContain('No markdown fencing');
  });

  it('returns Qwen profile with /no_think prefix', () => {
    const profile = getTuningProfile('qwen/qwen3-32b');
    expect(profile.suggestionTemperature).toBe(0.6);
    expect(profile.promptPrefix).toBe('/no_think\n');
    expect(profile.summaryPromptPrefix).toBe('/think\n');
  });

  it('returns neutral profile for unknown models', () => {
    const profile = getTuningProfile('some/unknown-model');
    expect(profile).toBe(NEUTRAL_PROFILE);
    expect(profile.suggestionTemperature).toBe(0.4);
  });
});

describe('MODEL_TUNING_PROFILES', () => {
  it('Gemini profile is a no-op (backwards-compatible)', () => {
    const p = MODEL_TUNING_PROFILES.gemini;
    expect(p.silenceReinforcement).toBe('');
    expect(p.conversationSilenceHint).toBeNull();
    expect(p.promptPrefix).toBeNull();
    expect(p.promptSuffix).toBeNull();
    expect(p.summaryPromptPrefix).toBeNull();
    expect(p.summaryJsonHint).toBeNull();
    expect(p.jsonHint).toBeNull();
  });

  it('every profile has a valid temperature between 0 and 2', () => {
    for (const [, profile] of Object.entries(MODEL_TUNING_PROFILES)) {
      expect(profile.suggestionTemperature).toBeGreaterThanOrEqual(0);
      expect(profile.suggestionTemperature).toBeLessThanOrEqual(2);
    }
  });
});
