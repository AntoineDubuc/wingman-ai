import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPromptVersions,
  addPromptVersion,
  restorePromptVersion,
  deletePromptVersion,
} from '../src/services/prompt-version';
import { savePersonas } from '../src/shared/persona';
import type { Persona } from '../src/shared/persona';

function createTestPersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: 'test-persona',
    name: 'Test',
    color: '#4A90D9',
    systemPrompt: 'You are a test assistant.',
    kbDocumentIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    order: 0,
    ...overrides,
  };
}

describe('Prompt version storage helpers', () => {
  beforeEach(async () => {
    // Clear storage between tests
    await chrome.storage.local.clear();
  });

  it('addPromptVersion auto-increments version numbers', async () => {
    await savePersonas([createTestPersona()]);

    const v1 = await addPromptVersion('test-persona', {
      prompt: 'Prompt v1',
      summary: 'First version',
      source: 'manual',
      targetModel: 'gemini-2.5-flash',
    });
    // v1 is auto-created from systemPrompt, so this should be v2
    expect(v1.version).toBe(2);

    const v2 = await addPromptVersion('test-persona', {
      prompt: 'Prompt v2',
      summary: 'Second version',
      source: 'assistant',
      targetModel: 'gemini-2.5-flash',
    });
    expect(v2.version).toBe(3);
  });

  it('getPromptVersions returns sorted newest-first', async () => {
    const persona = createTestPersona({
      promptVersions: [
        { version: 1, timestamp: 1000, summary: 'v1', source: 'manual', targetModel: '', prompt: 'p1' },
        { version: 3, timestamp: 3000, summary: 'v3', source: 'assistant', targetModel: '', prompt: 'p3' },
        { version: 2, timestamp: 2000, summary: 'v2', source: 'manual', targetModel: '', prompt: 'p2' },
      ],
    });
    await savePersonas([persona]);

    const versions = await getPromptVersions('test-persona');
    expect(versions[0]!.version).toBe(3);
    expect(versions[1]!.version).toBe(2);
    expect(versions[2]!.version).toBe(1);
  });

  it('lazy auto-v1 migration creates v1 from systemPrompt', async () => {
    await savePersonas([createTestPersona({ promptVersions: undefined })]);

    const versions = await getPromptVersions('test-persona');
    expect(versions).toHaveLength(1);
    expect(versions[0]!.version).toBe(1);
    expect(versions[0]!.source).toBe('manual');
    expect(versions[0]!.prompt).toBe('You are a test assistant.');
    expect(versions[0]!.summary).toBe('Initial prompt');
  });

  it('restorePromptVersion creates new version with old content', async () => {
    const persona = createTestPersona({
      promptVersions: [
        { version: 1, timestamp: 1000, summary: 'v1', source: 'manual', targetModel: 'gemini-2.5-flash', prompt: 'Original prompt' },
        { version: 2, timestamp: 2000, summary: 'v2', source: 'assistant', targetModel: 'gemini-2.5-flash', prompt: 'Modified prompt' },
        { version: 3, timestamp: 3000, summary: 'v3', source: 'assistant', targetModel: 'gemini-2.5-flash', prompt: 'Latest prompt' },
      ],
    });
    await savePersonas([persona]);

    const restored = await restorePromptVersion('test-persona', 1);
    expect(restored.version).toBe(4);
    expect(restored.source).toBe('restored');
    expect(restored.prompt).toBe('Original prompt');
    expect(restored.summary).toContain('v1');
  });

  it('deletePromptVersion blocks deleting current version', async () => {
    const persona = createTestPersona({
      promptVersions: [
        { version: 1, timestamp: 1000, summary: 'v1', source: 'manual', targetModel: '', prompt: 'p1' },
        { version: 2, timestamp: 2000, summary: 'v2', source: 'manual', targetModel: '', prompt: 'p2' },
      ],
    });
    await savePersonas([persona]);

    // Deleting current (v2) should throw
    await expect(deletePromptVersion('test-persona', 2)).rejects.toThrow('Cannot delete the current version');

    // Deleting non-current (v1) should succeed
    await deletePromptVersion('test-persona', 1);
    const versions = await getPromptVersions('test-persona');
    expect(versions).toHaveLength(1);
    expect(versions[0]!.version).toBe(2);
  });

  it('auto-prunes oldest when exceeding 20 versions', async () => {
    const versions = Array.from({ length: 20 }, (_, i) => ({
      version: i + 1,
      timestamp: (i + 1) * 1000,
      summary: `v${i + 1}`,
      source: 'manual' as const,
      targetModel: '',
      prompt: `Prompt ${i + 1}`,
    }));

    await savePersonas([createTestPersona({ promptVersions: versions })]);

    // Add v21 — should prune v1
    await addPromptVersion('test-persona', {
      prompt: 'Prompt 21',
      summary: 'v21',
      source: 'manual',
      targetModel: 'gemini-2.5-flash',
    });

    const result = await getPromptVersions('test-persona');
    expect(result).toHaveLength(20);
    // v1 should be gone
    expect(result.find(v => v.version === 1)).toBeUndefined();
    // v21 should exist
    expect(result.find(v => v.version === 21)).toBeDefined();
  });

  it('summary field is always a non-empty string', async () => {
    await savePersonas([createTestPersona()]);

    const version = await addPromptVersion('test-persona', {
      prompt: 'Test prompt',
      summary: 'Added silence instructions',
      source: 'assistant',
      targetModel: 'gemini-2.5-flash',
    });

    expect(version.summary).toBeTruthy();
    expect(typeof version.summary).toBe('string');
    expect(version.summary.length).toBeGreaterThan(0);
  });

  it('returns empty array for non-existent persona', async () => {
    await savePersonas([]);
    const versions = await getPromptVersions('non-existent');
    expect(versions).toEqual([]);
  });
});
