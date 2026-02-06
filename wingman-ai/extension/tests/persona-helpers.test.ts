/**
 * Tests for Hydra multi-persona helper functions.
 * Verifies backward compatibility with single activePersonaId and new activePersonaIds array.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getActivePersonaIds,
  setActivePersonaIds,
  getConclaveLeaderId,
  setConclaveLeaderId,
  getConclavePresets,
  saveConclavePreset,
  deleteConclavePreset,
  createConclavePreset,
  MAX_ACTIVE_PERSONAS,
} from '../src/shared/persona';

describe('getActivePersonaIds', () => {
  it('returns activePersonaIds when set', async () => {
    await chrome.storage.local.set({ activePersonaIds: ['p1', 'p2', 'p3'] });

    const ids = await getActivePersonaIds();

    expect(ids).toEqual(['p1', 'p2', 'p3']);
  });

  it('falls back to [activePersonaId] when activePersonaIds not set', async () => {
    await chrome.storage.local.set({ activePersonaId: 'legacy-id' });

    const ids = await getActivePersonaIds();

    expect(ids).toEqual(['legacy-id']);
  });

  it('returns empty array when neither key exists', async () => {
    const ids = await getActivePersonaIds();

    expect(ids).toEqual([]);
  });

  it('prefers activePersonaIds over activePersonaId when both exist', async () => {
    await chrome.storage.local.set({
      activePersonaIds: ['new1', 'new2'],
      activePersonaId: 'legacy-id',
    });

    const ids = await getActivePersonaIds();

    expect(ids).toEqual(['new1', 'new2']);
  });
});

describe('setActivePersonaIds', () => {
  it('writes activePersonaIds array', async () => {
    await setActivePersonaIds(['a', 'b']);

    const result = await chrome.storage.local.get(['activePersonaIds']);
    expect(result.activePersonaIds).toEqual(['a', 'b']);
  });

  it('writes activePersonaId = first ID for backward compat', async () => {
    await setActivePersonaIds(['first', 'second', 'third']);

    const result = await chrome.storage.local.get(['activePersonaId']);
    expect(result.activePersonaId).toBe('first');
  });

  it('throws error for empty array', async () => {
    await expect(setActivePersonaIds([])).rejects.toThrow('At least one active persona is required');
  });

  it('throws error for more than MAX_ACTIVE_PERSONAS', async () => {
    const tooMany = Array.from({ length: MAX_ACTIVE_PERSONAS + 1 }, (_, i) => `p${i}`);

    await expect(setActivePersonaIds(tooMany)).rejects.toThrow(`Maximum ${MAX_ACTIVE_PERSONAS} active personas allowed`);
  });

  it('accepts exactly MAX_ACTIVE_PERSONAS personas', async () => {
    const maxPersonas = Array.from({ length: MAX_ACTIVE_PERSONAS }, (_, i) => `p${i}`);

    await setActivePersonaIds(maxPersonas);

    const ids = await getActivePersonaIds();
    expect(ids).toHaveLength(MAX_ACTIVE_PERSONAS);
  });
});

describe('getConclaveLeaderId', () => {
  beforeEach(async () => {
    await chrome.storage.local.set({ activePersonaIds: ['active1', 'active2', 'active3'] });
  });

  it('returns conclaveLeaderId when set and in active list', async () => {
    await chrome.storage.local.set({ conclaveLeaderId: 'active2' });

    const leader = await getConclaveLeaderId();

    expect(leader).toBe('active2');
  });

  it('falls back to first active persona when leader not set', async () => {
    const leader = await getConclaveLeaderId();

    expect(leader).toBe('active1');
  });

  it('falls back to first active persona when leader is stale (not in active list)', async () => {
    await chrome.storage.local.set({ conclaveLeaderId: 'deleted-persona' });

    const leader = await getConclaveLeaderId();

    expect(leader).toBe('active1');
  });

  it('returns null when no active personas', async () => {
    await chrome.storage.local.clear();

    const leader = await getConclaveLeaderId();

    expect(leader).toBeNull();
  });
});

describe('setConclaveLeaderId', () => {
  it('stores the leader ID', async () => {
    await setConclaveLeaderId('leader-1');

    const result = await chrome.storage.local.get(['conclaveLeaderId']);
    expect(result.conclaveLeaderId).toBe('leader-1');
  });
});

describe('Conclave Presets CRUD', () => {
  it('returns empty array when no presets exist', async () => {
    const presets = await getConclavePresets();
    expect(presets).toEqual([]);
  });

  it('creates a preset with createConclavePreset', () => {
    const preset = createConclavePreset('Test Preset', ['p1', 'p2']);

    expect(preset.name).toBe('Test Preset');
    expect(preset.personaIds).toEqual(['p1', 'p2']);
    expect(preset.id).toBeDefined();
    expect(preset.createdAt).toBeDefined();
  });

  it('saves and retrieves a preset', async () => {
    const preset = createConclavePreset('My Preset', ['a', 'b']);
    await saveConclavePreset(preset);

    const presets = await getConclavePresets();
    expect(presets).toHaveLength(1);
    expect(presets[0]!.name).toBe('My Preset');
  });

  it('rejects preset with empty personaIds', async () => {
    const preset = createConclavePreset('Empty', []);

    await expect(saveConclavePreset(preset)).rejects.toThrow('at least one persona');
  });

  it('rejects preset with more than MAX_ACTIVE_PERSONAS', async () => {
    const tooMany = Array.from({ length: MAX_ACTIVE_PERSONAS + 1 }, (_, i) => `p${i}`);
    const preset = createConclavePreset('Too Many', tooMany);

    await expect(saveConclavePreset(preset)).rejects.toThrow(`at most ${MAX_ACTIVE_PERSONAS}`);
  });

  it('rejects duplicate preset names (case-insensitive)', async () => {
    const preset1 = createConclavePreset('Board Meeting', ['p1']);
    await saveConclavePreset(preset1);

    const preset2 = createConclavePreset('board meeting', ['p2']);
    await expect(saveConclavePreset(preset2)).rejects.toThrow('already exists');
  });

  it('allows updating existing preset with same name', async () => {
    const preset = createConclavePreset('Updatable', ['p1']);
    await saveConclavePreset(preset);

    const updated = { ...preset, personaIds: ['p1', 'p2'], updatedAt: Date.now() };
    await saveConclavePreset(updated);

    const presets = await getConclavePresets();
    expect(presets).toHaveLength(1);
    expect(presets[0]!.personaIds).toEqual(['p1', 'p2']);
  });

  it('deletes a preset', async () => {
    const preset = createConclavePreset('To Delete', ['x']);
    await saveConclavePreset(preset);

    await deleteConclavePreset(preset.id);

    const presets = await getConclavePresets();
    expect(presets).toHaveLength(0);
  });
});
