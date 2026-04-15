/**
 * Tests for mergePersonasFromImport() — the pure function that decides
 * which personas to add, overwrite, or skip on setup-folder-import.
 *
 * Part of the setup-folder-import feature (Task 3). This is the single
 * highest-risk piece of logic in the feature — a wrong merge destroys
 * salesperson edits. Every collision case has its own test.
 */

import { describe, it, expect } from 'vitest';
import {
  mergePersonasFromImport,
  type MergeResult,
  type ParsedPersonaFile,
  type MergeDeps,
} from '../src/shared/persona-merge';
import {
  type Persona,
  computePersonaContentHash,
  DEFAULT_PERSONA_COLOR,
} from '../src/shared/persona';

// Deterministic deps for testing
const fakeDeps: MergeDeps = {
  now: () => 2_000_000,
  uuid: (() => {
    let n = 0;
    return () => `fake-uuid-${++n}`;
  })(),
};

function makePersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: 'existing-uuid-1',
    name: 'Sales Guru',
    color: '#4A90D9',
    systemPrompt: 'You are a sales expert.',
    kbDocumentIds: [],
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    order: 0,
    ...overrides,
  };
}

function makeIncoming(overrides: Record<string, unknown> = {}): ParsedPersonaFile {
  return {
    fileName: 'sales-guru-persona.json',
    persona: {
      name: 'Sales Guru',
      color: '#4A90D9',
      systemPrompt: 'You are a sales expert.',
      ...overrides,
    },
  };
}

describe('mergePersonasFromImport — name match + unedited (overwrite)', () => {
  it('overwrites name, color, systemPrompt when signature matches content', async () => {
    const existing = makePersona({
      name: 'Sales Guru',
      color: '#4A90D9',
      systemPrompt: 'Old prompt.',
    });
    existing.importSignature = await computePersonaContentHash(existing);

    const incoming: ParsedPersonaFile = {
      fileName: 'sales-guru.json',
      persona: {
        name: 'Sales Guru',
        color: '#FF0000',
        systemPrompt: 'NEW prompt from folder.',
      },
    };

    const out = await mergePersonasFromImport([existing], [incoming], fakeDeps);
    expect(out.log.overwritten).toEqual(['Sales Guru']);
    expect(out.log.skipped).toEqual([]);
    expect(out.log.created).toEqual([]);
    expect(out.merged).toHaveLength(1);
    const merged = out.merged[0]!;
    expect(merged.name).toBe('Sales Guru');
    expect(merged.color).toBe('#FF0000');
    expect(merged.systemPrompt).toBe('NEW prompt from folder.');
  });

  it('preserves id, createdAt, order, kbDocumentIds on overwrite', async () => {
    const existing = makePersona({
      id: 'stable-id',
      createdAt: 1_234,
      order: 7,
      kbDocumentIds: ['kb1', 'kb2'],
    });
    existing.importSignature = await computePersonaContentHash(existing);

    const incoming = makeIncoming({ systemPrompt: 'NEW' });
    const out = await mergePersonasFromImport([existing], [incoming], fakeDeps);
    const merged = out.merged[0]!;
    expect(merged.id).toBe('stable-id');
    expect(merged.createdAt).toBe(1_234);
    expect(merged.order).toBe(7);
    expect(merged.kbDocumentIds).toEqual(['kb1', 'kb2']);
  });

  it('bumps updatedAt on overwrite', async () => {
    const existing = makePersona({ updatedAt: 1_000_000 });
    existing.importSignature = await computePersonaContentHash(existing);
    const incoming = makeIncoming({ systemPrompt: 'NEW' });

    const out = await mergePersonasFromImport([existing], [incoming], fakeDeps);
    expect(out.merged[0]!.updatedAt).toBe(2_000_000); // fakeDeps.now()
  });

  it('preserves modelPrompts and promptVersions on overwrite', async () => {
    const existing = makePersona({
      modelPrompts: { 'gemini': 'custom' },
      promptVersions: [{ version: 1, timestamp: 100, summary: 'v1', source: 'manual', targetModel: 'gemini', prompt: 'old' }],
    });
    existing.importSignature = await computePersonaContentHash(existing);
    const incoming = makeIncoming({ systemPrompt: 'NEW' });

    const out = await mergePersonasFromImport([existing], [incoming], fakeDeps);
    expect(out.merged[0]!.modelPrompts).toEqual({ 'gemini': 'custom' });
    expect(out.merged[0]!.promptVersions).toHaveLength(1);
  });

  it('re-stamps importSignature with the NEW content hash after overwrite', async () => {
    const existing = makePersona({ systemPrompt: 'OLD' });
    existing.importSignature = await computePersonaContentHash(existing);
    const incoming = makeIncoming({ systemPrompt: 'NEW' });

    const out = await mergePersonasFromImport([existing], [incoming], fakeDeps);
    const merged = out.merged[0]!;
    const expectedNewHash = await computePersonaContentHash(merged);
    expect(merged.importSignature).toBe(expectedNewHash);
  });

  it('updates icon on overwrite when incoming has one', async () => {
    const existing = makePersona({ icon: '1F600' });
    existing.importSignature = await computePersonaContentHash(existing);
    const incoming = makeIncoming({ icon: '1F4BC' });
    const out = await mergePersonasFromImport([existing], [incoming], fakeDeps);
    expect(out.merged[0]!.icon).toBe('1F4BC');
  });

  it('preserves icon on overwrite when incoming omits it', async () => {
    const existing = makePersona({ icon: '1F600' });
    existing.importSignature = await computePersonaContentHash(existing);
    const incoming = makeIncoming();
    delete (incoming.persona as { icon?: string }).icon;
    const out = await mergePersonasFromImport([existing], [incoming], fakeDeps);
    expect(out.merged[0]!.icon).toBe('1F600');
  });
});

describe('mergePersonasFromImport — name match + edited (skip)', () => {
  it('skips when importSignature is missing', async () => {
    const existing = makePersona();
    // No importSignature set — persona was created locally, never imported
    const incoming = makeIncoming({ systemPrompt: 'NEW from folder' });

    const out = await mergePersonasFromImport([existing], [incoming], fakeDeps);
    expect(out.log.skipped).toEqual(['Sales Guru']);
    expect(out.log.overwritten).toEqual([]);
    expect(out.merged[0]!.systemPrompt).toBe('You are a sales expert.'); // unchanged
  });

  it('skips when importSignature does not match current content (edited)', async () => {
    const existing = makePersona({ systemPrompt: 'Original prompt.' });
    // Stamp a signature, then "edit" the prompt to invalidate it
    existing.importSignature = await computePersonaContentHash(existing);
    existing.systemPrompt = 'Edited locally.';

    const incoming = makeIncoming({ systemPrompt: 'Company update.' });
    const out = await mergePersonasFromImport([existing], [incoming], fakeDeps);

    expect(out.log.skipped).toEqual(['Sales Guru']);
    expect(out.merged[0]!.systemPrompt).toBe('Edited locally.');
  });

  it('does not modify a skipped persona (stable reference contents)', async () => {
    const existing = makePersona();
    const incoming = makeIncoming({ systemPrompt: 'NEW' });
    const out = await mergePersonasFromImport([existing], [incoming], fakeDeps);
    const merged = out.merged[0]!;
    expect(merged.name).toBe(existing.name);
    expect(merged.color).toBe(existing.color);
    expect(merged.systemPrompt).toBe(existing.systemPrompt);
    expect(merged.updatedAt).toBe(existing.updatedAt); // NOT bumped
  });
});

describe('mergePersonasFromImport — create new', () => {
  it('creates a new persona when no name match exists', async () => {
    const existing: Persona[] = [makePersona({ name: 'Existing Persona' })];
    const incoming = makeIncoming({ name: 'Brand New' });

    const out = await mergePersonasFromImport(existing, [incoming], fakeDeps);
    expect(out.log.created).toEqual(['Brand New']);
    expect(out.merged).toHaveLength(2);

    const newPersona = out.merged.find((p) => p.name === 'Brand New')!;
    expect(newPersona.id).toBe('fake-uuid-1'); // from fakeDeps
    expect(newPersona.createdAt).toBe(2_000_000);
    expect(newPersona.updatedAt).toBe(2_000_000);
    expect(newPersona.kbDocumentIds).toEqual([]);
  });

  it('assigns order = max(existing.order) + 1 to new personas', async () => {
    const existing: Persona[] = [
      makePersona({ id: 'a', name: 'A', order: 3 }),
      makePersona({ id: 'b', name: 'B', order: 7 }),
    ];
    const incoming = makeIncoming({ name: 'New Persona' });
    const out = await mergePersonasFromImport(existing, [incoming], fakeDeps);
    const newP = out.merged.find((p) => p.name === 'New Persona')!;
    expect(newP.order).toBe(8);
  });

  it('assigns order = 0 when existing is empty', async () => {
    const incoming = makeIncoming({ name: 'First' });
    const out = await mergePersonasFromImport([], [incoming], fakeDeps);
    expect(out.merged[0]!.order).toBe(0);
  });

  it('uses DEFAULT_PERSONA_COLOR when incoming has no color (edge case — validator should have caught this)', async () => {
    const incoming: ParsedPersonaFile = {
      fileName: 'no-color.json',
      persona: {
        name: 'No Color',
        systemPrompt: 'x',
      } as unknown as ParsedPersonaFile['persona'],
    };
    const out = await mergePersonasFromImport([], [incoming], fakeDeps);
    expect(out.merged[0]!.color).toBe(DEFAULT_PERSONA_COLOR);
  });

  it('stamps importSignature on newly created personas', async () => {
    const incoming = makeIncoming({ name: 'Fresh' });
    const out = await mergePersonasFromImport([], [incoming], fakeDeps);
    expect(out.merged[0]!.importSignature).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('mergePersonasFromImport — duplicate names in incoming', () => {
  it('rejects the entire import when two incoming files have the same name', async () => {
    const incoming: ParsedPersonaFile[] = [
      { fileName: 'a.json', persona: { name: 'Same Name', color: '#111111', systemPrompt: 'a' } },
      { fileName: 'b.json', persona: { name: 'Same Name', color: '#222222', systemPrompt: 'b' } },
    ];
    const out = await mergePersonasFromImport([], incoming, fakeDeps);
    expect(out.log.errors).toHaveLength(2);
    expect(out.log.errors.map((e) => e.file).sort()).toEqual(['a.json', 'b.json']);
    for (const err of out.log.errors) {
      expect(err.reason).toBe('duplicate_persona_name');
    }
    // Neither applied
    expect(out.log.created).toEqual([]);
    expect(out.merged).toEqual([]);
  });

  it('duplicate detection is case-sensitive by name', async () => {
    const incoming: ParsedPersonaFile[] = [
      { fileName: 'a.json', persona: { name: 'sales guru', color: '#111111', systemPrompt: 'a' } },
      { fileName: 'b.json', persona: { name: 'Sales Guru', color: '#222222', systemPrompt: 'b' } },
    ];
    const out = await mergePersonasFromImport([], incoming, fakeDeps);
    // Different names under exact-match rule — both accepted
    expect(out.log.created.sort()).toEqual(['Sales Guru', 'sales guru']);
    expect(out.log.errors).toEqual([]);
  });
});

describe('mergePersonasFromImport — salesperson personas preserved', () => {
  it('leaves storage personas NOT in incoming list untouched', async () => {
    const existing: Persona[] = [
      makePersona({ id: 'company', name: 'Sales Guru' }),
      makePersona({ id: 'personal', name: 'My Custom Bot', systemPrompt: 'Personal' }),
    ];
    existing[0]!.importSignature = await computePersonaContentHash(existing[0]!);

    const incoming = makeIncoming({ name: 'Sales Guru', systemPrompt: 'NEW' });
    const out = await mergePersonasFromImport(existing, [incoming], fakeDeps);

    expect(out.merged).toHaveLength(2);
    const personal = out.merged.find((p) => p.id === 'personal')!;
    expect(personal.name).toBe('My Custom Bot');
    expect(personal.systemPrompt).toBe('Personal');
    expect(personal.updatedAt).toBe(existing[1]!.updatedAt); // unchanged
  });
});

describe('mergePersonasFromImport — edge cases', () => {
  it('empty incoming returns existing unchanged', async () => {
    const existing = [makePersona()];
    const out = await mergePersonasFromImport(existing, [], fakeDeps);
    expect(out.log.created).toEqual([]);
    expect(out.log.overwritten).toEqual([]);
    expect(out.log.skipped).toEqual([]);
    expect(out.log.errors).toEqual([]);
    expect(out.merged).toEqual(existing);
  });

  it('empty existing with 3 incoming creates 3 personas', async () => {
    const incoming: ParsedPersonaFile[] = [
      { fileName: '1.json', persona: { name: 'One', color: '#111111', systemPrompt: '1' } },
      { fileName: '2.json', persona: { name: 'Two', color: '#222222', systemPrompt: '2' } },
      { fileName: '3.json', persona: { name: 'Three', color: '#333333', systemPrompt: '3' } },
    ];
    const out = await mergePersonasFromImport([], incoming, fakeDeps);
    expect(out.merged).toHaveLength(3);
    expect(out.log.created).toEqual(['One', 'Two', 'Three']);
  });

  it('does not mutate the input existing array', async () => {
    const existing = [makePersona()];
    const existingSnapshot = JSON.parse(JSON.stringify(existing));
    const incoming = makeIncoming({ name: 'New' });
    await mergePersonasFromImport(existing, [incoming], fakeDeps);
    expect(existing).toEqual(existingSnapshot);
  });

  it('merged.length === existing.length + created.length (no personas lost)', async () => {
    const existing: Persona[] = [
      makePersona({ id: 'a', name: 'Sales Guru' }), // will be overwritten
      makePersona({ id: 'b', name: 'Local Only' }), // will be preserved
      makePersona({ id: 'c', name: 'Discovery' }),  // will be skipped (edited)
    ];
    existing[0]!.importSignature = await computePersonaContentHash(existing[0]!);

    const incoming: ParsedPersonaFile[] = [
      { fileName: '1.json', persona: { name: 'Sales Guru', color: '#4A90D9', systemPrompt: 'NEW' } },
      { fileName: '2.json', persona: { name: 'Discovery', color: '#FF0000', systemPrompt: 'NEW' } },
      { fileName: '3.json', persona: { name: 'Brand New', color: '#00FF00', systemPrompt: 'NEW' } },
    ];

    const out = await mergePersonasFromImport(existing, incoming, fakeDeps);
    expect(out.merged).toHaveLength(4); // 3 existing + 1 new
    expect(out.log.created).toEqual(['Brand New']);
    expect(out.log.overwritten).toEqual(['Sales Guru']);
    expect(out.log.skipped).toEqual(['Discovery']);
  });
});
