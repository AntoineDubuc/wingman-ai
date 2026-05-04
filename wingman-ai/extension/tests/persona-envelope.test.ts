/**
 * Tests for validatePersonaImportEnvelope() and computePersonaContentHash().
 *
 * Part of the setup-folder-import feature (Task 2).
 * See Research/features/setup-folder-import/implementation_plan.md Task 2.
 */

import { describe, it, expect } from 'vitest';
import {
  validatePersonaImportEnvelope,
  computePersonaContentHash,
  type Persona,
} from '../src/shared/persona';

// Helper: build a valid envelope with sensible defaults
function makeEnvelope(overrides: Record<string, unknown> = {}): unknown {
  return {
    wingmanPersona: true,
    version: 1,
    exportedAt: 1_700_000_000_000,
    persona: {
      name: 'Test Persona',
      color: '#4A90D9',
      systemPrompt: 'You are a test persona. Respond with OK to anything.',
      ...overrides,
    },
  };
}

describe('validatePersonaImportEnvelope — envelope shape', () => {
  it('accepts a valid envelope with minimum required fields', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope());
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.persona.name).toBe('Test Persona');
      expect(result.persona.color).toBe('#4A90D9');
    }
  });

  it('rejects envelope with wingmanPersona !== true', () => {
    const result = validatePersonaImportEnvelope({ wingmanPersona: false, version: 1, persona: {} });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_envelope');
  });

  it('rejects envelope with unsupported version', () => {
    const result = validatePersonaImportEnvelope({
      wingmanPersona: true,
      version: 999,
      persona: { name: 'X', color: '#112233', systemPrompt: 'y' },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('unsupported_version');
  });

  it('rejects envelope with missing persona.name', () => {
    const result = validatePersonaImportEnvelope({
      wingmanPersona: true,
      version: 1,
      persona: { color: '#112233', systemPrompt: 'y' },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('missing_name');
  });

  it('rejects null input defensively', () => {
    const result = validatePersonaImportEnvelope(null);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_envelope');
  });

  it('rejects string input defensively', () => {
    const result = validatePersonaImportEnvelope('not an object');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_envelope');
  });

  it('rejects version: 2 (no version bump per Decision 1)', () => {
    const result = validatePersonaImportEnvelope({
      wingmanPersona: true,
      version: 2,
      persona: { name: 'X', color: '#112233', systemPrompt: 'y' },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('unsupported_version');
  });

  it('rejects empty persona.name', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: '' }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('missing_name');
  });

  it('rejects whitespace-only persona.name', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: '   \t  ' }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('missing_name');
  });

  it('trims leading/trailing whitespace from persona.name', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: '  Sales Guru  ' }));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.persona.name).toBe('Sales Guru');
  });
});

describe('validatePersonaImportEnvelope — field validation', () => {
  it('rejects name longer than 200 chars', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'x'.repeat(201) }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('name_too_long');
  });

  it('accepts name at 200-char boundary', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'x'.repeat(200) }));
    expect(result.valid).toBe(true);
  });

  it('rejects systemPrompt longer than 50000 chars', () => {
    const result = validatePersonaImportEnvelope(
      makeEnvelope({ systemPrompt: 'x'.repeat(50_001) })
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('systemPrompt_too_long');
  });

  it('accepts systemPrompt at 50000-char boundary', () => {
    const result = validatePersonaImportEnvelope(
      makeEnvelope({ systemPrompt: 'x'.repeat(50_000) })
    );
    expect(result.valid).toBe(true);
  });

  it('rejects non-string systemPrompt', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ systemPrompt: 12345 }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_systemPrompt_type');
  });

  it('rejects invalid color format (named color)', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ color: 'blue' }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_color_format');
  });

  it('rejects 3-char hex color (#FFF)', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ color: '#FFF' }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_color_format');
  });

  it('rejects CSS url() in color (style injection defense)', () => {
    const result = validatePersonaImportEnvelope(
      makeEnvelope({ color: 'url(javascript:alert(1))' })
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_color_format');
  });

  it('accepts valid 6-char hex colors (upper and lower case)', () => {
    expect(validatePersonaImportEnvelope(makeEnvelope({ color: '#4A90D9' })).valid).toBe(true);
    expect(validatePersonaImportEnvelope(makeEnvelope({ color: '#4a90d9' })).valid).toBe(true);
    expect(validatePersonaImportEnvelope(makeEnvelope({ color: '#112233' })).valid).toBe(true);
  });

  it('rejects bad icon format', () => {
    const result = validatePersonaImportEnvelope(
      makeEnvelope({ icon: '<script>alert(1)</script>' })
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_icon_format');
  });

  it('accepts valid OpenMoji hexcode icon', () => {
    expect(validatePersonaImportEnvelope(makeEnvelope({ icon: '1F600' })).valid).toBe(true);
    expect(validatePersonaImportEnvelope(makeEnvelope({ icon: '1F9D1-200D-1F4BC' })).valid).toBe(true);
  });

  it('accepts persona with no icon field', () => {
    const envelope = makeEnvelope();
    const result = validatePersonaImportEnvelope(envelope);
    expect(result.valid).toBe(true);
  });
});

describe('validatePersonaImportEnvelope — fresh object copy', () => {
  it('strips unknown fields from the returned persona', () => {
    const envelope = {
      wingmanPersona: true,
      version: 1,
      persona: {
        name: 'Test',
        color: '#112233',
        systemPrompt: 'y',
        extraField: 'evil',
        anotherUnknown: { nested: 'bad' },
      },
    };
    const result = validatePersonaImportEnvelope(envelope);
    expect(result.valid).toBe(true);
    if (result.valid) {
      const keys = Object.keys(result.persona);
      const allowed = ['name', 'color', 'icon', 'systemPrompt', 'kbDocuments', 'importSignature'];
      for (const key of keys) {
        expect(allowed).toContain(key);
      }
      const asRecord = result.persona as unknown as Record<string, unknown>;
      expect(asRecord.extraField).toBeUndefined();
      expect(asRecord.anotherUnknown).toBeUndefined();
    }
  });

  it('does not inherit prototype pollution from input', () => {
    const hostile = Object.create({ isAdmin: true });
    hostile.name = 'Test';
    hostile.color = '#112233';
    hostile.systemPrompt = 'y';
    const result = validatePersonaImportEnvelope({
      wingmanPersona: true,
      version: 1,
      persona: hostile,
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      // The returned persona is a fresh object literal — no prototype chain pollution
      expect((result.persona as unknown as { isAdmin?: boolean }).isAdmin).toBeUndefined();
      expect(Object.getPrototypeOf(result.persona)).toBe(Object.prototype);
    }
  });

  it('does not coerce an XSS-looking string in name (validator is agnostic to string content)', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: payload }));
    expect(result.valid).toBe(true);
    // The name is a plain string; XSS defense lives in the rendering layer.
    if (result.valid) expect(result.persona.name).toBe(payload);
  });
});

describe('validatePersonaImportEnvelope — Unicode normalization pipeline', () => {
  it('strips zero-width space (U+200B) from name', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'Sales\u200BGuru' }));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.persona.name).toBe('SalesGuru');
  });

  it('strips zero-width non-joiner (U+200C) from name', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'Sales\u200CGuru' }));
    if (result.valid) expect(result.persona.name).toBe('SalesGuru');
  });

  it('strips zero-width joiner (U+200D) from name', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'Sales\u200DGuru' }));
    if (result.valid) expect(result.persona.name).toBe('SalesGuru');
  });

  it('strips interior BOM (U+FEFF) from name', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'Sales\uFEFFGuru' }));
    if (result.valid) expect(result.persona.name).toBe('SalesGuru');
  });

  it('PRESERVES left-to-right mark (U+200E) — legitimate bidi for Arabic/Hebrew', () => {
    const name = 'أحمد\u200E Sales';
    const result = validatePersonaImportEnvelope(makeEnvelope({ name }));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.persona.name).toContain('\u200E');
  });

  it('PRESERVES right-to-left mark (U+200F)', () => {
    const name = 'Sales\u200F Guru';
    const result = validatePersonaImportEnvelope(makeEnvelope({ name }));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.persona.name).toContain('\u200F');
  });

  it('rejects soft hyphen (U+00AD)', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'Sales\u00ADGuru' }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('invisible_character');
  });

  it('rejects word joiner (U+2060)', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'Sales\u2060Guru' }));
    expect(result.valid).toBe(false);
  });

  it('rejects Mongolian vowel separator (U+180E)', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'Sales\u180EGuru' }));
    expect(result.valid).toBe(false);
  });

  it('rejects Hangul filler (U+3164)', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'Sales\u3164Guru' }));
    expect(result.valid).toBe(false);
  });

  it('rejects variation selector (U+FE0F)', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'Sales\uFE0FGuru' }));
    expect(result.valid).toBe(false);
  });

  it('rejects Arabic letter mark (U+061C)', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'Sales\u061CGuru' }));
    expect(result.valid).toBe(false);
  });

  it('rejects combining grapheme joiner (U+034F)', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'Sales\u034FGuru' }));
    expect(result.valid).toBe(false);
  });

  it('rejects U+202E RIGHT-TO-LEFT OVERRIDE — Trojan Source CVE-2021-42574', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'Sales\u202EGuru' }));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('invisible_character');
  });

  it('rejects U+202A LEFT-TO-RIGHT EMBEDDING', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'Sales\u202AGuru' }));
    expect(result.valid).toBe(false);
  });

  it('rejects U+2066 LEFT-TO-RIGHT ISOLATE', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'Sales\u2066Guru' }));
    expect(result.valid).toBe(false);
  });

  it('rejects U+2069 POP DIRECTIONAL ISOLATE', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'Sales\u2069Guru' }));
    expect(result.valid).toBe(false);
  });

  it('rejects Unicode Tag block (U+E0020) — invisible prompt injection', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'Sales\u{E0020}Guru' }));
    expect(result.valid).toBe(false);
  });

  it('rejects interlinear annotation anchor (U+FFF9)', () => {
    const result = validatePersonaImportEnvelope(makeEnvelope({ name: 'Sales\uFFF9Guru' }));
    expect(result.valid).toBe(false);
  });
});

describe('validatePersonaImportEnvelope — KB document validation', () => {
  const validPersona = {
    name: 'Test',
    color: '#112233',
    systemPrompt: 'y',
  };

  it('accepts persona with no kbDocuments', () => {
    const result = validatePersonaImportEnvelope({
      wingmanPersona: true,
      version: 1,
      persona: validPersona,
    });
    expect(result.valid).toBe(true);
  });

  it('accepts persona with empty kbDocuments array', () => {
    const result = validatePersonaImportEnvelope({
      wingmanPersona: true,
      version: 1,
      persona: { ...validPersona, kbDocuments: [] },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects non-array kbDocuments', () => {
    const result = validatePersonaImportEnvelope({
      wingmanPersona: true,
      version: 1,
      persona: { ...validPersona, kbDocuments: 'not an array' },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_kbDocuments_type');
  });

  it('rejects more than 20 kbDocuments', () => {
    const kbDocuments = Array.from({ length: 21 }, (_, i) => ({
      filename: `doc${i}.pdf`,
      fileType: 'application/pdf',
      textContent: 'x',
    }));
    const result = validatePersonaImportEnvelope({
      wingmanPersona: true,
      version: 1,
      persona: { ...validPersona, kbDocuments },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('too_many_kbDocuments');
  });

  it('accepts 20 kbDocuments at the boundary', () => {
    const kbDocuments = Array.from({ length: 20 }, (_, i) => ({
      filename: `doc${i}.pdf`,
      fileType: 'application/pdf',
      textContent: 'x',
    }));
    const result = validatePersonaImportEnvelope({
      wingmanPersona: true,
      version: 1,
      persona: { ...validPersona, kbDocuments },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects KB doc with path separator in filename', () => {
    const result = validatePersonaImportEnvelope({
      wingmanPersona: true,
      version: 1,
      persona: {
        ...validPersona,
        kbDocuments: [{ filename: '../etc/passwd', fileType: 'text/plain', textContent: 'x' }],
      },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_kbDocument_filename');
  });

  it('rejects KB doc with control char in filename', () => {
    const result = validatePersonaImportEnvelope({
      wingmanPersona: true,
      version: 1,
      persona: {
        ...validPersona,
        kbDocuments: [{ filename: 'doc\x00.pdf', fileType: 'application/pdf', textContent: 'x' }],
      },
    });
    expect(result.valid).toBe(false);
  });

  it('rejects KB doc with leading-dot filename (.env, .htaccess)', () => {
    const result = validatePersonaImportEnvelope({
      wingmanPersona: true,
      version: 1,
      persona: {
        ...validPersona,
        kbDocuments: [{ filename: '.env', fileType: 'text/plain', textContent: 'x' }],
      },
    });
    expect(result.valid).toBe(false);
  });

  it('rejects KB doc with filename longer than 255 chars', () => {
    const result = validatePersonaImportEnvelope({
      wingmanPersona: true,
      version: 1,
      persona: {
        ...validPersona,
        kbDocuments: [
          { filename: 'a'.repeat(256) + '.pdf', fileType: 'application/pdf', textContent: 'x' },
        ],
      },
    });
    expect(result.valid).toBe(false);
  });

  it('rejects KB doc with disallowed fileType (text/html)', () => {
    const result = validatePersonaImportEnvelope({
      wingmanPersona: true,
      version: 1,
      persona: {
        ...validPersona,
        kbDocuments: [{ filename: 'doc.html', fileType: 'text/html', textContent: 'x' }],
      },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_kbDocument_fileType');
  });

  it('accepts the 3 allowlisted fileTypes', () => {
    for (const fileType of ['text/plain', 'text/markdown', 'application/pdf']) {
      const result = validatePersonaImportEnvelope({
        wingmanPersona: true,
        version: 1,
        persona: {
          ...validPersona,
          kbDocuments: [{ filename: 'doc.txt', fileType, textContent: 'x' }],
        },
      });
      expect(result.valid).toBe(true);
    }
  });

  it('rejects KB doc with textContent > 5MB', () => {
    const result = validatePersonaImportEnvelope({
      wingmanPersona: true,
      version: 1,
      persona: {
        ...validPersona,
        kbDocuments: [
          { filename: 'big.txt', fileType: 'text/plain', textContent: 'x'.repeat(5_000_001) },
        ],
      },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('kbDocument_too_large');
  });

  it('rejects aggregate kbDocuments size > 20MB', () => {
    // 5 docs × 4.1MB each = 20.5MB total
    const kbDocuments = Array.from({ length: 5 }, (_, i) => ({
      filename: `doc${i}.txt`,
      fileType: 'text/plain',
      textContent: 'x'.repeat(4_100_000),
    }));
    const result = validatePersonaImportEnvelope({
      wingmanPersona: true,
      version: 1,
      persona: { ...validPersona, kbDocuments },
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('kbDocuments_total_too_large');
  });

  it('strips unknown fields from KB doc objects', () => {
    const result = validatePersonaImportEnvelope({
      wingmanPersona: true,
      version: 1,
      persona: {
        ...validPersona,
        kbDocuments: [
          {
            filename: 'doc.pdf',
            fileType: 'application/pdf',
            textContent: 'content',
            extraField: 'stripped',
          },
        ],
      },
    });
    expect(result.valid).toBe(true);
    if (result.valid && result.persona.kbDocuments) {
      const doc = result.persona.kbDocuments[0] as unknown as Record<string, unknown>;
      expect(doc.extraField).toBeUndefined();
      expect(Object.keys(doc).sort()).toEqual(['fileType', 'filename', 'textContent']);
    }
  });
});

describe('computePersonaContentHash', () => {
  const base: Persona = {
    id: 'uuid-1',
    name: 'Sales Guru',
    color: '#4A90D9',
    systemPrompt: 'You are a sales expert.',
    kbDocumentIds: [],
    createdAt: 1000,
    updatedAt: 1000,
    order: 0,
  };

  it('returns a 64-char hex string', async () => {
    const hash = await computePersonaContentHash(base);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic — same input produces same output', async () => {
    const h1 = await computePersonaContentHash(base);
    const h2 = await computePersonaContentHash(base);
    expect(h1).toBe(h2);
  });

  it('differs when name changes', async () => {
    const h1 = await computePersonaContentHash(base);
    const h2 = await computePersonaContentHash({ ...base, name: 'Different Name' });
    expect(h1).not.toBe(h2);
  });

  it('differs when color changes', async () => {
    const h1 = await computePersonaContentHash(base);
    const h2 = await computePersonaContentHash({ ...base, color: '#FF0000' });
    expect(h1).not.toBe(h2);
  });

  it('differs when systemPrompt changes', async () => {
    const h1 = await computePersonaContentHash(base);
    const h2 = await computePersonaContentHash({ ...base, systemPrompt: 'Different prompt' });
    expect(h1).not.toBe(h2);
  });

  it('is STABLE when createdAt changes', async () => {
    const h1 = await computePersonaContentHash(base);
    const h2 = await computePersonaContentHash({ ...base, createdAt: 999_999 });
    expect(h1).toBe(h2);
  });

  it('is STABLE when updatedAt changes', async () => {
    const h1 = await computePersonaContentHash(base);
    const h2 = await computePersonaContentHash({ ...base, updatedAt: 999_999 });
    expect(h1).toBe(h2);
  });

  it('is STABLE when order changes', async () => {
    const h1 = await computePersonaContentHash(base);
    const h2 = await computePersonaContentHash({ ...base, order: 99 });
    expect(h1).toBe(h2);
  });

  it('is STABLE when kbDocumentIds changes (KB is additive per Decision 4)', async () => {
    const h1 = await computePersonaContentHash(base);
    const h2 = await computePersonaContentHash({
      ...base,
      kbDocumentIds: ['doc1', 'doc2', 'doc3'],
    });
    expect(h1).toBe(h2);
  });

  it('produces SAME hash for names that differ only by zero-width chars', async () => {
    // After normalization, 'Test' and 'Test\u200B' are identical — hash must match
    // so edit detection treats them as the same persona.
    const h1 = await computePersonaContentHash({ ...base, name: 'Test' });
    const h2 = await computePersonaContentHash({ ...base, name: 'Test\u200B' });
    expect(h1).toBe(h2);
  });
});
