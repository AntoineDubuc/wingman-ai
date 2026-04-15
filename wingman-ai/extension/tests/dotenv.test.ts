/**
 * Tests for parseDotEnv — a minimal, dependency-free .env parser.
 *
 * Part of the setup-folder-import feature (Task 1).
 * Security-critical parser for API credentials — see acceptance criteria
 * in Research/features/setup-folder-import/implementation_plan.md Task 1.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseDotEnv } from '../src/shared/dotenv';

describe('parseDotEnv — functional behavior', () => {
  it('parses a single KEY=VALUE line', () => {
    const out = parseDotEnv('DEEPGRAM_API_KEY=abc123');
    expect(out.result.DEEPGRAM_API_KEY).toBe('abc123');
    expect(out.errors).toEqual([]);
  });

  it('strips a UTF-8 BOM before parsing', () => {
    // \uFEFF is the BOM. Without stripping, the first line's KEY won't match the regex.
    const out = parseDotEnv('\uFEFFDEEPGRAM_API_KEY=abc123');
    expect(out.result.DEEPGRAM_API_KEY).toBe('abc123');
    expect(out.errors).toEqual([]);
  });

  it('handles CRLF line endings', () => {
    const out = parseDotEnv('KEY1=v1\r\nKEY2=v2');
    expect(out.result.KEY1).toBe('v1');
    expect(out.result.KEY2).toBe('v2');
  });

  it('handles the `export` prefix', () => {
    const out = parseDotEnv('export DEEPGRAM_API_KEY=abc');
    expect(out.result.DEEPGRAM_API_KEY).toBe('abc');
  });

  it('strips surrounding double quotes', () => {
    const out = parseDotEnv('KEY="value with spaces"');
    expect(out.result.KEY).toBe('value with spaces');
  });

  it('strips surrounding single quotes', () => {
    const out = parseDotEnv("KEY='value'");
    expect(out.result.KEY).toBe('value');
  });

  it('skips comment and blank lines', () => {
    const out = parseDotEnv('# comment\nKEY=v\n\n');
    expect(out.result.KEY).toBe('v');
    expect(Object.keys(out.result)).toEqual(['KEY']);
  });

  it('preserves values containing `=`', () => {
    const out = parseDotEnv('KEY=base64==');
    expect(out.result.KEY).toBe('base64==');
  });

  it('returns empty result for empty input', () => {
    const out = parseDotEnv('');
    expect(out.result).toEqual({});
    expect(out.errors).toEqual([]);
  });

  it('reports malformed lines in errors array with closed-enum reason code', () => {
    const out = parseDotEnv('malformed line no equals');
    expect(out.result).toEqual({});
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]?.reason).toBe('malformed');
    expect(out.errors[0]?.line).toBe(1);
  });

  it('is exported as a named export returning the documented shape', () => {
    // Structural check: the return type is { result, errors }
    const out = parseDotEnv('KEY=v');
    expect(out).toHaveProperty('result');
    expect(out).toHaveProperty('errors');
    expect(Array.isArray(out.errors)).toBe(true);
  });
});

describe('parseDotEnv — security hardening', () => {
  it('rejects values containing NUL (\\x00) as control_char', () => {
    const out = parseDotEnv('KEY=abc\x00trailing');
    expect(out.result.KEY).toBeUndefined();
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]?.reason).toBe('control_char');
  });

  it('rejects values containing ESC (\\x1b) as control_char', () => {
    const out = parseDotEnv('KEY=abc\x1bdef');
    expect(out.errors[0]?.reason).toBe('control_char');
  });

  it('rejects values containing DEL (\\x7f) as control_char', () => {
    const out = parseDotEnv('KEY=abc\x7fdef');
    expect(out.errors[0]?.reason).toBe('control_char');
  });

  it('rejects values containing SOH (\\x01) as control_char', () => {
    const out = parseDotEnv('KEY=abc\x01def');
    expect(out.errors[0]?.reason).toBe('control_char');
  });

  it('accepts printable Unicode values (café, 中, 🙂)', () => {
    const out = parseDotEnv('K1=café\nK2=中国\nK3=🙂');
    expect(out.result.K1).toBe('café');
    expect(out.result.K2).toBe('中国');
    expect(out.result.K3).toBe('🙂');
    expect(out.errors).toEqual([]);
  });

  it('rejects a single line longer than 8192 bytes as line_too_long', () => {
    const longLine = 'KEY=' + 'x'.repeat(10_000);
    const out = parseDotEnv(longLine);
    expect(out.result.KEY).toBeUndefined();
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]?.reason).toBe('line_too_long');
  });

  it('accepts a line at the 8192-byte boundary', () => {
    // Line length INCLUDING the KEY= prefix must be <= 8192
    const valueLen = 8192 - 'KEY='.length;
    const line = 'KEY=' + 'x'.repeat(valueLen);
    expect(line.length).toBe(8192);
    const out = parseDotEnv(line);
    expect(out.result.KEY).toBeDefined();
    expect(out.result.KEY?.length).toBe(valueLen);
  });

  it('does NOT call console.* for any input (prevents credential log leakage)', () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'debug').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ];

    // Run through every test case category to cover all code paths
    parseDotEnv('KEY=value');
    parseDotEnv('\uFEFFKEY=value');
    parseDotEnv('# comment\nKEY=v\n');
    parseDotEnv('malformed line');
    parseDotEnv('KEY=abc\x00bad');
    parseDotEnv('KEY=' + 'x'.repeat(10_000));
    parseDotEnv('');

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('uses only closed-enum reason codes — never the raw value', () => {
    const validReasons = new Set(['malformed', 'control_char', 'line_too_long', 'bad_key_format']);
    const secretValue = 'sk-live-very-secret-real-key-12345';
    const out = parseDotEnv(`KEY=${secretValue}\x00`);

    expect(out.errors).toHaveLength(1);
    expect(validReasons.has(out.errors[0]!.reason)).toBe(true);
    // The secret must NOT appear anywhere in the returned errors
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain(secretValue);
  });

  it('error reasons never contain raw line text', () => {
    const out = parseDotEnv('malformed-line-with-secret-data');
    // Error should have reason: 'bad_key_format' or 'malformed', never the line text
    const reasonString = JSON.stringify(out.errors);
    expect(reasonString).not.toContain('malformed-line-with-secret-data');
  });

  it('does not retain the raw input string on any module-level variable', () => {
    // This is a soft check — best we can do in JS is verify the function
    // returns a result and doesn't stash the input. The grep for no module-level
    // state variables runs in the grep-check test file (Task 5v).
    const secret = 'SECRET_VALUE_12345';
    const out = parseDotEnv(`KEY=${secret}`);
    expect(out.result.KEY).toBe(secret);
    // Calling with a different input should not be affected by prior state
    const out2 = parseDotEnv('OTHER=different');
    expect(out2.result.OTHER).toBe('different');
    expect(out2.result.KEY).toBeUndefined();
  });
});

describe('parseDotEnv — negative tests', () => {
  it('does not throw on null input, returns default shape', () => {
    expect(() => parseDotEnv(null as unknown as string)).not.toThrow();
    const out = parseDotEnv(null as unknown as string);
    expect(out.result).toEqual({});
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]?.reason).toBe('malformed');
  });

  it('does not throw on undefined input, returns default shape', () => {
    expect(() => parseDotEnv(undefined as unknown as string)).not.toThrow();
    const out = parseDotEnv(undefined as unknown as string);
    expect(out.result).toEqual({});
  });

  it('ignores lowercase keys (regex requires [A-Z_][A-Z0-9_]*)', () => {
    const out = parseDotEnv('deepgram_api_key=abc');
    expect(out.result.deepgram_api_key).toBeUndefined();
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]?.reason).toBe('bad_key_format');
  });

  it('ignores keys starting with a digit', () => {
    const out = parseDotEnv('1KEY=abc');
    expect(out.result['1KEY']).toBeUndefined();
    expect(out.errors[0]?.reason).toBe('bad_key_format');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
