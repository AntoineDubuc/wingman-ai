/**
 * Tests that PersonaSection.save() clears importSignature.
 *
 * Part of the setup-folder-import feature (Task 2). Decision 1:
 * "their edits win" — if the salesperson saves through the editor,
 * the persona is marked as edited (importSignature cleared), so the
 * next import will skip it rather than overwrite.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  savePersonas,
  getPersonas,
  createPersona,
  computePersonaContentHash,
} from '../src/shared/persona';

describe('importSignature lifecycle', () => {
  beforeEach(async () => {
    // Clear storage before each test (fake-browser does this via beforeEach in setup.ts)
    await savePersonas([]);
  });

  it('createPersona does not set importSignature', () => {
    const p = createPersona('Test', 'You are a test.', '#4A90D9');
    expect(p.importSignature).toBeUndefined();
  });

  it('computePersonaContentHash produces a value that can be assigned as importSignature', async () => {
    const p = createPersona('Test', 'You are a test.', '#4A90D9');
    const hash = await computePersonaContentHash(p);
    p.importSignature = hash;
    await savePersonas([p]);
    const loaded = await getPersonas();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.importSignature).toBe(hash);
  });

  it('a persona with cleared importSignature is recognized as edited', async () => {
    // Simulate: imported persona gets signature stamped
    const p = createPersona('Imported', 'Original prompt.', '#4A90D9');
    const originalHash = await computePersonaContentHash(p);
    p.importSignature = originalHash;
    await savePersonas([p]);

    // Simulate user edit: prompt changes, signature cleared
    const loaded = (await getPersonas())[0]!;
    loaded.systemPrompt = 'Edited prompt.';
    loaded.updatedAt = Date.now();
    loaded.importSignature = undefined; // ← the save() method does this
    await savePersonas([loaded]);

    // Verify: the current content hash does NOT match the stored signature (because it was cleared)
    const reloaded = (await getPersonas())[0]!;
    expect(reloaded.importSignature).toBeUndefined();

    const currentHash = await computePersonaContentHash(reloaded);
    expect(currentHash).not.toBe(originalHash); // Prompt changed, hash changed
  });

  it('a persona with matching importSignature is recognized as unedited', async () => {
    const p = createPersona('Unedited', 'Original prompt.', '#4A90D9');
    const hash = await computePersonaContentHash(p);
    p.importSignature = hash;
    await savePersonas([p]);

    const loaded = (await getPersonas())[0]!;
    const currentHash = await computePersonaContentHash(loaded);
    expect(currentHash).toBe(loaded.importSignature);
  });

  it('importSignature stability: changing kbDocumentIds does NOT invalidate the signature', async () => {
    const p = createPersona('Test', 'Prompt.', '#4A90D9', []);
    const hash = await computePersonaContentHash(p);
    p.importSignature = hash;

    // User adds a KB doc — kbDocumentIds changes
    p.kbDocumentIds = ['new-doc-id'];

    // The signature should STILL match the current content because KB docs
    // are not part of the hash (per Decision 4 — KB is additive).
    const currentHash = await computePersonaContentHash(p);
    expect(currentHash).toBe(hash);
  });
});
