/**
 * Tests for pure helpers in setup-import-helpers.ts.
 *
 * Part of the setup-folder-import feature (Task 5). Tests for the
 * SetupImportSection class itself are DOM-dependent and live in the
 * integration test file.
 */

import { describe, it, expect } from 'vitest';
import {
  isTopLevelEnvFile,
  isPersonaJsonFile,
  walkFolderFiles,
  protoReviver,
  hasCleanPrototype,
  computeHostPermissionDiff,
  OPENROUTER_ORIGIN,
  GROQ_ORIGIN,
} from '../src/options/sections/setup-import-helpers';

// Helper: build a fake File with a specific webkitRelativePath.
// Note: `size` cannot be overridden via defineProperty on a File because
// it's a getter on the prototype. To test the size check, pad the content
// to the desired byte length.
function fakeFile(
  name: string,
  content: string,
  webkitRelativePath: string
): File {
  const blob = new Blob([content], { type: 'text/plain' });
  const file = new File([blob], name, { type: 'text/plain' });
  Object.defineProperty(file, 'webkitRelativePath', { value: webkitRelativePath, writable: false });
  return file;
}

// Build a fake File with exact byte size (pads content to target size).
function fakeFileWithSize(
  name: string,
  webkitRelativePath: string,
  size: number
): File {
  const content = 'x'.repeat(size);
  return fakeFile(name, content, webkitRelativePath);
}

describe('isTopLevelEnvFile', () => {
  it('matches <folder>/.env exactly', () => {
    expect(isTopLevelEnvFile('valid-setup/.env')).toBe(true);
  });

  it('matches the macOS-friendly alternate names', () => {
    expect(isTopLevelEnvFile('Wingman Setup/wingman.env')).toBe(true);
    expect(isTopLevelEnvFile('Wingman Setup/setup.env')).toBe(true);
    expect(isTopLevelEnvFile('Wingman Setup/credentials.env')).toBe(true);
    expect(isTopLevelEnvFile('Wingman Setup/env.txt')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(isTopLevelEnvFile('Setup/WINGMAN.ENV')).toBe(true);
    expect(isTopLevelEnvFile('Setup/Wingman.Env')).toBe(true);
  });

  it('rejects nested .env (node_modules/.env)', () => {
    expect(isTopLevelEnvFile('project/node_modules/.env')).toBe(false);
  });

  it('rejects .env in a nested subdir', () => {
    expect(isTopLevelEnvFile('setup/subdir/.env')).toBe(false);
  });

  it('rejects non-credential files at top level', () => {
    expect(isTopLevelEnvFile('setup/config.env')).toBe(false);
    expect(isTopLevelEnvFile('setup/settings.json')).toBe(false);
    expect(isTopLevelEnvFile('setup/random.env')).toBe(false);
  });

  it('normalizes Unicode before matching (defeats eta-spoofing)', () => {
    // Greek eta U+03B7 instead of Latin 'n' — should NOT match after NFKC
    const spoofed = 'setup/.e\u03b7v';
    expect(isTopLevelEnvFile(spoofed)).toBe(false);
  });
});

describe('isPersonaJsonFile', () => {
  it('matches basename-starting "persona" json files', () => {
    expect(isPersonaJsonFile('setup/personas/sales-guru-persona.json')).toBe(true);
    expect(isPersonaJsonFile('setup/my-persona-v2.json')).toBe(true);
    expect(isPersonaJsonFile('setup/persona.json')).toBe(true);
  });

  it('matches persona.json at any depth', () => {
    expect(isPersonaJsonFile('setup/deeply/nested/persona.json')).toBe(true);
  });

  it('rejects persona.json.bak (additional dot after persona)', () => {
    expect(isPersonaJsonFile('setup/persona.json.bak')).toBe(false);
  });

  it('rejects files inside dot-prefixed folders', () => {
    expect(isPersonaJsonFile('.git/personas.json')).toBe(false);
    expect(isPersonaJsonFile('.vscode/persona.json')).toBe(false);
  });

  it('rejects files inside __MACOSX', () => {
    expect(isPersonaJsonFile('__MACOSX/persona.json')).toBe(false);
  });

  it('rejects non-json files', () => {
    expect(isPersonaJsonFile('setup/persona.txt')).toBe(false);
  });

  it('rejects files where "persona" is only a substring without a word boundary', () => {
    expect(isPersonaJsonFile('setup/nopersona.json')).toBe(false);
  });
});

describe('protoReviver', () => {
  it('strips __proto__ keys', () => {
    expect(protoReviver('__proto__', { foo: 'bar' })).toBeUndefined();
  });

  it('strips prototype keys', () => {
    expect(protoReviver('prototype', { foo: 'bar' })).toBeUndefined();
  });

  it('does NOT strip constructor (not a prototype-pollution vector)', () => {
    expect(protoReviver('constructor', 'value')).toBe('value');
  });

  it('passes through normal keys', () => {
    expect(protoReviver('name', 'Sales Guru')).toBe('Sales Guru');
  });

  it('JSON.parse with protoReviver defeats __proto__ pollution', () => {
    const hostile = '{"foo":"bar","__proto__":{"isAdmin":true}}';
    const parsed = JSON.parse(hostile, protoReviver);
    expect(parsed).toEqual({ foo: 'bar' });
    expect(({} as { isAdmin?: boolean }).isAdmin).toBeUndefined();
  });
});

describe('hasCleanPrototype', () => {
  it('accepts object literal prototypes', () => {
    expect(hasCleanPrototype({ foo: 'bar' })).toBe(true);
  });

  it('accepts primitive values (null, string, number)', () => {
    expect(hasCleanPrototype(null)).toBe(true);
    expect(hasCleanPrototype('string' as unknown as object)).toBe(true);
  });

  it('rejects objects with custom prototype', () => {
    const hostile = Object.create({ isAdmin: true });
    hostile.foo = 'bar';
    expect(hasCleanPrototype(hostile)).toBe(false);
  });
});

describe('walkFolderFiles', () => {
  it('categorizes .env and persona files', async () => {
    const files = [
      fakeFile('.env', 'DEEPGRAM_API_KEY=abc', 'setup/.env'),
      fakeFile(
        'sales-guru-persona.json',
        JSON.stringify({
          wingmanPersona: true,
          version: 1,
          persona: { name: 'Sales Guru', color: '#4A90D9', systemPrompt: 'Be helpful.' },
        }),
        'setup/sales-guru-persona.json'
      ),
      fakeFile('readme.md', 'docs', 'setup/readme.md'),
    ];

    const result = await walkFolderFiles(files);
    expect(result.envCredentials).not.toBeNull();
    expect(result.envCredentials?.deepgramApiKey).toBe('abc');
    expect(result.personaFiles).toHaveLength(1);
    expect(result.personaFiles[0]?.persona.name).toBe('Sales Guru');
    expect(result.errors).toEqual([]);
  });

  it('rejects oversized .env file (> 64KB)', async () => {
    // MAX_ENV_FILE_SIZE = 64 * 1024 = 65_536 bytes
    const bigEnv = fakeFileWithSize('.env', 'setup/.env', 66_000);
    const result = await walkFolderFiles([bigEnv]);
    expect(result.envCredentials).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toBe('file_too_large');
  });

  it('rejects oversized persona file (> 5MB)', async () => {
    const bigPersona = fakeFileWithSize('persona.json', 'setup/persona.json', 6 * 1024 * 1024);
    const result = await walkFolderFiles([bigPersona]);
    expect(result.personaFiles).toHaveLength(0);
    expect(result.errors[0]?.reason).toBe('file_too_large');
  });

  it('rejects persona JSON with __proto__ pollution (caught by reviver)', async () => {
    const hostile = fakeFile(
      'evil-persona.json',
      '{"wingmanPersona":true,"version":1,"persona":{"name":"X","color":"#111111","systemPrompt":"y"},"__proto__":{"polluted":true}}',
      'setup/evil-persona.json'
    );
    await walkFolderFiles([hostile]);
    // Verify Object.prototype is NOT polluted
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('rejects persona JSON with invalid envelope', async () => {
    const invalid = fakeFile(
      'bad-persona.json',
      JSON.stringify({ notWingman: true }),
      'setup/bad-persona.json'
    );
    const result = await walkFolderFiles([invalid]);
    expect(result.personaFiles).toHaveLength(0);
    expect(result.errors[0]?.reason).toBe('bad_envelope');
  });

  it('rejects malformed JSON as json_parse_error', async () => {
    const malformed = fakeFile('malformed-persona.json', '{not valid json', 'setup/malformed-persona.json');
    const result = await walkFolderFiles([malformed]);
    expect(result.errors[0]?.reason).toBe('json_parse_error');
  });

  it('ignores files not matching .env or *persona*.json', async () => {
    const files = [
      fakeFile('.env', 'DEEPGRAM_API_KEY=abc', 'setup/.env'),
      fakeFile('readme.md', '# docs', 'setup/readme.md'),
      fakeFile('config.json', '{}', 'setup/config.json'),
    ];
    const result = await walkFolderFiles(files);
    expect(result.envCredentials).not.toBeNull();
    expect(result.personaFiles).toHaveLength(0);
    expect(result.errors).toEqual([]);
  });

  it('filters .env output to CREDENTIAL_KEYS allowlist', async () => {
    const files = [
      fakeFile('.env', 'DEEPGRAM_API_KEY=abc\nUNKNOWN_KEY=evil\nRANDOM=x', 'setup/.env'),
    ];
    const result = await walkFolderFiles(files);
    expect(result.envCredentials?.deepgramApiKey).toBe('abc');
    const asRecord = result.envCredentials as unknown as Record<string, unknown>;
    expect(asRecord.UNKNOWN_KEY).toBeUndefined();
    expect(asRecord.RANDOM).toBeUndefined();
  });
});

describe('computeHostPermissionDiff', () => {
  it('requests OpenRouter when key is being written AND permission missing', async () => {
    const hasPermission = async () => false;
    const diff = await computeHostPermissionDiff(
      { openrouterApiKey: 'new-key' },
      [],
      hasPermission
    );
    expect(diff.toRequest).toContain(OPENROUTER_ORIGIN);
    expect(diff.toRevoke).toEqual([]);
  });

  it('does NOT re-request if permission already granted', async () => {
    const hasPermission = async () => true;
    const diff = await computeHostPermissionDiff(
      { openrouterApiKey: 'new-key' },
      [],
      hasPermission
    );
    expect(diff.toRequest).toEqual([]);
  });

  it('revokes OpenRouter when key is being cleared AND permission exists', async () => {
    const hasPermission = async () => true;
    const diff = await computeHostPermissionDiff(
      {},
      ['openrouterApiKey'],
      hasPermission
    );
    expect(diff.toRevoke).toContain(OPENROUTER_ORIGIN);
  });

  it('handles both OpenRouter and Groq in the same diff', async () => {
    const hasPermission = async () => false;
    const diff = await computeHostPermissionDiff(
      { openrouterApiKey: 'o', groqApiKey: 'g' },
      [],
      hasPermission
    );
    expect(diff.toRequest).toContain(OPENROUTER_ORIGIN);
    expect(diff.toRequest).toContain(GROQ_ORIGIN);
  });
});
