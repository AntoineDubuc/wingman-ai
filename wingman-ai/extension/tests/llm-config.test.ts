/**
 * Tests for LLM provider configuration constants.
 * Validates model lists, defaults, and storage key coverage.
 */

import { describe, it, expect } from 'vitest';
import {
  OPENROUTER_MODELS,
  GROQ_MODELS,
  DEFAULT_PROVIDER_CONFIG,
  PROVIDER_COOLDOWNS,
  PROVIDER_STORAGE_KEYS,
  OPENROUTER_API_BASE,
  GROQ_API_BASE,
} from '../src/shared/llm-config';

describe('OPENROUTER_MODELS', () => {
  it('has at least one model', () => {
    expect(OPENROUTER_MODELS.length).toBeGreaterThan(0);
  });

  it('every model has id and label', () => {
    for (const model of OPENROUTER_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.label).toBeTruthy();
    }
  });

  it('no duplicate IDs', () => {
    const ids = OPENROUTER_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('GROQ_MODELS', () => {
  it('has at least one model', () => {
    expect(GROQ_MODELS.length).toBeGreaterThan(0);
  });

  it('every model has id and label', () => {
    for (const model of GROQ_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.label).toBeTruthy();
    }
  });

  it('no duplicate IDs', () => {
    const ids = GROQ_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('DEFAULT_PROVIDER_CONFIG', () => {
  it('defaults to gemini provider', () => {
    expect(DEFAULT_PROVIDER_CONFIG.provider).toBe('gemini');
  });

  it('default OpenRouter model is in the model list', () => {
    const ids = OPENROUTER_MODELS.map((m) => m.id);
    expect(ids).toContain(DEFAULT_PROVIDER_CONFIG.openrouterModel);
  });

  it('default Groq model is in the model list', () => {
    const ids = GROQ_MODELS.map((m) => m.id);
    expect(ids).toContain(DEFAULT_PROVIDER_CONFIG.groqModel);
  });
});

describe('PROVIDER_COOLDOWNS', () => {
  it('Gemini has highest cooldown (rate-limited free tier)', () => {
    expect(PROVIDER_COOLDOWNS.gemini).toBeGreaterThan(PROVIDER_COOLDOWNS.openrouter);
    expect(PROVIDER_COOLDOWNS.gemini).toBeGreaterThan(PROVIDER_COOLDOWNS.groq);
  });

  it('all cooldowns are positive', () => {
    for (const [, ms] of Object.entries(PROVIDER_COOLDOWNS)) {
      expect(ms).toBeGreaterThan(0);
    }
  });
});

describe('PROVIDER_STORAGE_KEYS', () => {
  it('includes all required keys', () => {
    expect(PROVIDER_STORAGE_KEYS).toContain('llmProvider');
    expect(PROVIDER_STORAGE_KEYS).toContain('openrouterApiKey');
    expect(PROVIDER_STORAGE_KEYS).toContain('groqApiKey');
    expect(PROVIDER_STORAGE_KEYS).toContain('groqModel');
    expect(PROVIDER_STORAGE_KEYS).toContain('suggestionCooldownMs');
  });
});

describe('API base URLs', () => {
  it('OpenRouter URL is HTTPS', () => {
    expect(OPENROUTER_API_BASE).toMatch(/^https:\/\//);
  });

  it('Groq URL is HTTPS', () => {
    expect(GROQ_API_BASE).toMatch(/^https:\/\//);
  });

  it('Groq URL uses OpenAI-compatible path', () => {
    expect(GROQ_API_BASE).toContain('/openai/v1');
  });
});
