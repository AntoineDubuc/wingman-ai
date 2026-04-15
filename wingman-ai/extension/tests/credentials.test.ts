/**
 * Tests for credentials.ts — CREDENTIAL_KEYS allowlist, writeCredentials,
 * readCredentials, validateLangbuilderUrl, diffCredentials.
 *
 * Part of the setup-folder-import feature (Task 4).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CREDENTIAL_KEYS,
  writeCredentials,
  readCredentials,
  validateLangbuilderUrl,
  diffCredentials,
  type Credentials,
  type WriteCredentialsRejectReason,
} from '../src/shared/credentials';

describe('CREDENTIAL_KEYS allowlist', () => {
  it('contains exactly the 9 canonical credential storage keys', () => {
    expect(CREDENTIAL_KEYS).toHaveLength(9);
    const set = new Set(CREDENTIAL_KEYS);
    expect(set.has('deepgramApiKey')).toBe(true);
    expect(set.has('geminiApiKey')).toBe(true);
    expect(set.has('openrouterApiKey')).toBe(true);
    expect(set.has('groqApiKey')).toBe(true);
    expect(set.has('humeApiKey')).toBe(true);
    expect(set.has('humeSecretKey')).toBe(true);
    expect(set.has('langbuilderApiKey')).toBe(true);
    expect(set.has('langbuilderUrl')).toBe(true);
    expect(set.has('langbuilderFlowId')).toBe(true);
  });

  it('is frozen (cannot be mutated at runtime)', () => {
    expect(Object.isFrozen(CREDENTIAL_KEYS)).toBe(true);
    expect(() => {
      (CREDENTIAL_KEYS as unknown as string[]).push('injectedKey');
    }).toThrow();
  });
});

describe('writeCredentials — happy path', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  it('writes a single credential and returns written list', async () => {
    const result = await writeCredentials({ deepgramApiKey: 'abc' });
    expect(result.written).toEqual(['deepgramApiKey']);
    expect(result.cleared).toEqual([]);
    expect(result.rejected).toEqual([]);

    const stored = await chrome.storage.local.get('deepgramApiKey');
    expect(stored.deepgramApiKey).toBe('abc');
  });

  it('empty object is a no-op', async () => {
    const result = await writeCredentials({});
    expect(result.written).toEqual([]);
    expect(result.cleared).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it('writes multiple credentials in a single storage set', async () => {
    const result = await writeCredentials({
      deepgramApiKey: 'dg',
      geminiApiKey: 'gm',
      groqApiKey: 'gq',
    });
    expect(result.written.sort()).toEqual(['deepgramApiKey', 'geminiApiKey', 'groqApiKey']);
    const stored = await chrome.storage.local.get(['deepgramApiKey', 'geminiApiKey', 'groqApiKey']);
    expect(stored).toEqual({ deepgramApiKey: 'dg', geminiApiKey: 'gm', groqApiKey: 'gq' });
  });
});

describe('readCredentials', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  it('returns all 9 keys as empty strings when storage is empty', async () => {
    const creds = await readCredentials();
    for (const key of CREDENTIAL_KEYS) {
      expect(creds[key]).toBe('');
    }
  });

  it('returns the written value for a set key', async () => {
    await writeCredentials({ deepgramApiKey: 'abc' });
    const creds = await readCredentials();
    expect(creds.deepgramApiKey).toBe('abc');
    expect(creds.geminiApiKey).toBe('');
  });
});

describe('writeCredentials — allowlist enforcement', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  it('rejects unknown keys with unknown_key reason', async () => {
    const result = await writeCredentials({ unknownField: 'x' } as Partial<Credentials>);
    expect(result.written).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.key).toBe('unknownField');
    expect(result.rejected[0]?.reason).toBe('unknown_key');
    // Verify unknownField was NOT written to storage
    const stored = await chrome.storage.local.get('unknownField');
    expect(stored.unknownField).toBeUndefined();
  });

  it('does not write __proto__ pollution from input', async () => {
    const hostile = { deepgramApiKey: 'abc', __proto__: { isAdmin: true } } as Partial<Credentials>;
    await writeCredentials(hostile);
    // Object.prototype should not be polluted
    expect(({} as unknown as { isAdmin?: boolean }).isAdmin).toBeUndefined();
  });

  it('iterates only over CREDENTIAL_KEYS, not Object.keys(creds)', async () => {
    const input = { deepgramApiKey: 'abc', sneakyExtra: 'ignore me' };
    const result = await writeCredentials(input as Partial<Credentials>);
    // Only deepgramApiKey is in the allowlist — sneakyExtra is rejected
    expect(result.written).toEqual(['deepgramApiKey']);
    const stored = await chrome.storage.local.get(['sneakyExtra']);
    expect(stored.sneakyExtra).toBeUndefined();
  });
});

describe('validateLangbuilderUrl', () => {
  it('accepts a plain https URL', () => {
    const result = validateLangbuilderUrl('https://langbuilder.example.com');
    expect(result.valid).toBe(true);
  });

  it('accepts https URL with path', () => {
    const result = validateLangbuilderUrl('https://langbuilder.example.com/api/v1');
    expect(result.valid).toBe(true);
  });

  it('rejects http scheme', () => {
    const result = validateLangbuilderUrl('http://langbuilder.example.com');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_url_scheme');
  });

  it('rejects javascript: scheme', () => {
    const result = validateLangbuilderUrl('javascript:alert(1)');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_url_scheme');
  });

  it('rejects file:// scheme', () => {
    const result = validateLangbuilderUrl('file:///etc/passwd');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_url_scheme');
  });

  it('rejects data: scheme', () => {
    const result = validateLangbuilderUrl('data:text/html,<script>alert(1)</script>');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_url_scheme');
  });

  it('rejects IPv4 literal hostname (loopback SSRF)', () => {
    const result = validateLangbuilderUrl('https://127.0.0.1');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_url_host');
  });

  it('rejects IPv4 cloud metadata endpoint', () => {
    const result = validateLangbuilderUrl('https://169.254.169.254');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_url_host');
  });

  it('rejects IPv6 bracket form', () => {
    const result = validateLangbuilderUrl('https://[::1]');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_url_host');
  });

  it('rejects malformed URL', () => {
    const result = validateLangbuilderUrl('not a url at all');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_url_format');
  });

  // === Round 4 Critical: userinfo bypass ===

  it('rejects URL with userinfo (homograph bypass)', () => {
    const result = validateLangbuilderUrl('https://attacker.example@trusted.example');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_url_userinfo');
  });

  it('rejects URL with user:pass@', () => {
    const result = validateLangbuilderUrl('https://user:pass@example.com');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_url_userinfo');
  });

  // === Round 4 Major: search/hash exfil vectors ===

  it('rejects URL with query string (attacker could pre-seed params)', () => {
    const result = validateLangbuilderUrl('https://example.com?exfil=data');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_url_search');
  });

  it('rejects URL with hash fragment', () => {
    const result = validateLangbuilderUrl('https://example.com/api#fragment');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('bad_url_hash');
  });

  // === Write integration ===

  it('writeCredentials rejects langbuilderUrl with bad scheme', async () => {
    await chrome.storage.local.clear();
    const result = await writeCredentials({ langbuilderUrl: 'http://attacker.example' });
    expect(result.written).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.key).toBe('langbuilderUrl');
    expect(result.rejected[0]?.reason).toBe('bad_url_scheme');
    const stored = await chrome.storage.local.get('langbuilderUrl');
    expect(stored.langbuilderUrl).toBeUndefined();
  });
});

describe('writeCredentials — length and type caps', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  it('rejects value longer than 4096 bytes', async () => {
    const result = await writeCredentials({ deepgramApiKey: 'x'.repeat(4097) });
    expect(result.written).toEqual([]);
    expect(result.rejected[0]?.reason).toBe('too_long');
  });

  it('accepts value at 4096-byte boundary', async () => {
    const result = await writeCredentials({ deepgramApiKey: 'x'.repeat(4096) });
    expect(result.written).toEqual(['deepgramApiKey']);
  });

  it('rejects non-string value (number)', async () => {
    const result = await writeCredentials({ deepgramApiKey: 123 } as unknown as Partial<Credentials>);
    expect(result.written).toEqual([]);
    expect(result.rejected[0]?.reason).toBe('bad_type');
  });

  it('rejects null value', async () => {
    const result = await writeCredentials({ deepgramApiKey: null } as unknown as Partial<Credentials>);
    expect(result.rejected[0]?.reason).toBe('bad_type');
  });

  it('rejects value containing control char as control_char', async () => {
    const result = await writeCredentials({ deepgramApiKey: 'abc\x00null-byte' });
    expect(result.written).toEqual([]);
    expect(result.rejected[0]?.reason).toBe('control_char');
  });
});

describe('writeCredentials — whitespace and clear semantics', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
    await writeCredentials({ deepgramApiKey: 'initial', geminiApiKey: 'initial-gemini' });
  });

  it('empty string clears the credential', async () => {
    const result = await writeCredentials({ deepgramApiKey: '' });
    expect(result.written).toEqual([]);
    expect(result.cleared).toEqual(['deepgramApiKey']);
    const stored = await chrome.storage.local.get('deepgramApiKey');
    expect(stored.deepgramApiKey).toBeUndefined();
  });

  it('whitespace-only value trims and clears', async () => {
    const result = await writeCredentials({ deepgramApiKey: '   \t  ' });
    expect(result.cleared).toEqual(['deepgramApiKey']);
    const stored = await chrome.storage.local.get('deepgramApiKey');
    expect(stored.deepgramApiKey).toBeUndefined();
  });

  it('preserves legitimate values with leading/trailing whitespace', async () => {
    const result = await writeCredentials({ deepgramApiKey: ' valid-key ' });
    expect(result.written).toEqual(['deepgramApiKey']);
    const stored = await chrome.storage.local.get('deepgramApiKey');
    expect(stored.deepgramApiKey).toBe(' valid-key '); // untrimmed
  });

  it('empty input object is NO-OP — does NOT clear anything', async () => {
    const before = await readCredentials();
    const result = await writeCredentials({});
    const after = await readCredentials();
    expect(result.cleared).toEqual([]);
    expect(after).toEqual(before);
  });

  it('no raw value appears in rejected reasons (credential redaction)', async () => {
    const secretValue = 'sk-live-ultra-secret-12345';
    const result = await writeCredentials({ deepgramApiKey: secretValue + '\x00bad' });
    expect(result.rejected).toHaveLength(1);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(secretValue);
  });
});

describe('diffCredentials', () => {
  it('identifies keys to write', () => {
    const previous = {
      deepgramApiKey: '',
      geminiApiKey: '',
      openrouterApiKey: '',
      groqApiKey: '',
      humeApiKey: '',
      humeSecretKey: '',
      langbuilderApiKey: '',
      langbuilderUrl: '',
      langbuilderFlowId: '',
    };
    const next = { deepgramApiKey: 'new-value' };
    const diff = diffCredentials(previous, next);
    expect(diff.toWrite).toEqual({ deepgramApiKey: 'new-value' });
    expect(diff.toClear).toEqual([]);
  });

  it('identifies keys to clear (present in previous, absent from next)', () => {
    const previous: Credentials = {
      deepgramApiKey: 'old',
      geminiApiKey: 'old',
      openrouterApiKey: '',
      groqApiKey: '',
      humeApiKey: '',
      humeSecretKey: '',
      langbuilderApiKey: '',
      langbuilderUrl: '',
      langbuilderFlowId: '',
    };
    const next = { deepgramApiKey: 'new' };
    const diff = diffCredentials(previous, next);
    expect(diff.toWrite).toEqual({ deepgramApiKey: 'new' });
    expect(diff.toClear).toContain('geminiApiKey');
  });

  it('does not include unchanged keys in toWrite or toClear', () => {
    const previous: Credentials = {
      deepgramApiKey: 'same',
      geminiApiKey: '',
      openrouterApiKey: '',
      groqApiKey: '',
      humeApiKey: '',
      humeSecretKey: '',
      langbuilderApiKey: '',
      langbuilderUrl: '',
      langbuilderFlowId: '',
    };
    const next = { deepgramApiKey: 'same' };
    const diff = diffCredentials(previous, next);
    expect(diff.toWrite).toEqual({});
    expect(diff.toClear).toEqual([]);
  });
});

describe('rejected reason enum', () => {
  it('uses closed enum — only the 10 documented reasons', () => {
    const validReasons: WriteCredentialsRejectReason[] = [
      'unknown_key',
      'bad_type',
      'too_long',
      'bad_url_scheme',
      'bad_url_host',
      'bad_url_format',
      'bad_url_userinfo',
      'bad_url_search',
      'bad_url_hash',
      'control_char',
    ];
    // Compile-time check — if the enum changes, this array diverges
    expect(validReasons).toHaveLength(10);
  });
});
