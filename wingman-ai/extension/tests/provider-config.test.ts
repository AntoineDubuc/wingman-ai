/**
 * Tests for provider configuration loading via chrome.storage.
 * Uses fake-browser for in-memory storage simulation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PROVIDER_COOLDOWNS, DEFAULT_PROVIDER_CONFIG } from '../src/shared/llm-config';
import {
  getTuningProfile,
  NEUTRAL_PROFILE,
  MODEL_TUNING_PROFILES,
} from '../src/shared/model-tuning';

describe('Provider config via chrome.storage', () => {
  beforeEach(async () => {
    // Start clean — setup.ts resets fakeBrowser before each test
  });

  it('stores and retrieves Gemini provider config', async () => {
    await chrome.storage.local.set({
      llmProvider: 'gemini',
      geminiApiKey: 'test-gemini-key',
    });

    const result = await chrome.storage.local.get(['llmProvider', 'geminiApiKey']);
    expect(result.llmProvider).toBe('gemini');
    expect(result.geminiApiKey).toBe('test-gemini-key');
  });

  it('stores and retrieves Groq provider config', async () => {
    await chrome.storage.local.set({
      llmProvider: 'groq',
      groqApiKey: 'gsk_test123',
      groqModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    });

    const result = await chrome.storage.local.get(['llmProvider', 'groqApiKey', 'groqModel']);
    expect(result.llmProvider).toBe('groq');
    expect(result.groqApiKey).toBe('gsk_test123');
    expect(result.groqModel).toBe('meta-llama/llama-4-scout-17b-16e-instruct');
  });

  it('stores and retrieves OpenRouter provider config', async () => {
    await chrome.storage.local.set({
      llmProvider: 'openrouter',
      openrouterApiKey: 'sk-or-test',
      openrouterModel: 'anthropic/claude-sonnet-4',
    });

    const result = await chrome.storage.local.get(['llmProvider', 'openrouterApiKey', 'openrouterModel']);
    expect(result.llmProvider).toBe('openrouter');
    expect(result.openrouterApiKey).toBe('sk-or-test');
    expect(result.openrouterModel).toBe('anthropic/claude-sonnet-4');
  });

  it('defaults to gemini when no provider is stored', async () => {
    const result = await chrome.storage.local.get(['llmProvider']);
    const provider = (result.llmProvider as string) || 'gemini';
    expect(provider).toBe('gemini');
  });
});

describe('Provider cooldown defaults', () => {
  it('returns correct cooldown for each provider', () => {
    expect(PROVIDER_COOLDOWNS['gemini']).toBe(15000);
    expect(PROVIDER_COOLDOWNS['openrouter']).toBe(2000);
    expect(PROVIDER_COOLDOWNS['groq']).toBe(2000);
  });
});

describe('Provider key validation logic', () => {
  it('correctly identifies missing provider key (simulates popup check)', async () => {
    await chrome.storage.local.set({
      deepgramApiKey: 'dg-test',
      llmProvider: 'groq',
      // No groqApiKey set
    });

    const storage = await chrome.storage.local.get([
      'deepgramApiKey', 'geminiApiKey', 'openrouterApiKey', 'groqApiKey', 'llmProvider',
    ]);

    const provider = (storage.llmProvider as string) || 'gemini';
    const providerKeyMap: Record<string, unknown> = {
      gemini: storage.geminiApiKey,
      openrouter: storage.openrouterApiKey,
      groq: storage.groqApiKey,
    };

    const hasApiKeys = !!(storage.deepgramApiKey && providerKeyMap[provider]);
    expect(hasApiKeys).toBe(false); // Missing Groq key
  });

  it('correctly identifies all keys present', async () => {
    await chrome.storage.local.set({
      deepgramApiKey: 'dg-test',
      llmProvider: 'groq',
      groqApiKey: 'gsk_test',
    });

    const storage = await chrome.storage.local.get([
      'deepgramApiKey', 'geminiApiKey', 'openrouterApiKey', 'groqApiKey', 'llmProvider',
    ]);

    const provider = (storage.llmProvider as string) || 'gemini';
    const providerKeyMap: Record<string, unknown> = {
      gemini: storage.geminiApiKey,
      openrouter: storage.openrouterApiKey,
      groq: storage.groqApiKey,
    };

    const hasApiKeys = !!(storage.deepgramApiKey && providerKeyMap[provider]);
    expect(hasApiKeys).toBe(true);
  });
});

describe('Tuning profile resolution for stored models', () => {
  it('Groq Llama model resolves to llama profile', () => {
    const profile = getTuningProfile(DEFAULT_PROVIDER_CONFIG.groqModel);
    expect(profile).toBe(MODEL_TUNING_PROFILES.llama);
  });

  it('OpenRouter default resolves to gemini profile', () => {
    const profile = getTuningProfile(DEFAULT_PROVIDER_CONFIG.openrouterModel);
    expect(profile).toBe(MODEL_TUNING_PROFILES.gemini);
  });

  it('stores and retrieves tuning mode', async () => {
    await chrome.storage.local.set({ promptTuningMode: 'off' });
    const result = await chrome.storage.local.get(['promptTuningMode']);
    expect(result.promptTuningMode).toBe('off');
  });

  it('auto mode uses model profile, off mode uses neutral', async () => {
    const modelId = 'qwen/qwen3-32b';

    // Auto mode → real profile
    const autoProfile = getTuningProfile(modelId);
    expect(autoProfile.promptPrefix).toBe('/no_think\n');

    // Off mode → caller should use NEUTRAL_PROFILE
    expect(NEUTRAL_PROFILE.promptPrefix).toBeNull();
  });
});
