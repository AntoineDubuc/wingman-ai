import { describe, test, expect } from 'vitest';
import { flattenKeys, checkLocaleKeys, checkBundleSize } from '../scripts/check-i18n-keys';

// ---- flattenKeys ----

describe('flattenKeys', () => {
  test('flattens a flat object', () => {
    const obj = { a: 'hello', b: 'world' };
    expect(flattenKeys(obj).sort()).toEqual(['a', 'b']);
  });

  test('flattens a nested object using dot notation', () => {
    const obj = { a: { b: 'x', c: 'y' }, d: 'z' };
    expect(flattenKeys(obj).sort()).toEqual(['a.b', 'a.c', 'd']);
  });

  test('excludes the _meta key at top level', () => {
    const obj = { _meta: { generator: 'test' }, a: 'x' };
    expect(flattenKeys(obj)).toEqual(['a']);
  });

  test('excludes _meta key at nested level', () => {
    const obj = { section: { _meta: 'skip', value: 'x' } };
    expect(flattenKeys(obj)).toEqual(['section.value']);
  });

  test('returns empty array for empty object', () => {
    expect(flattenKeys({})).toEqual([]);
  });

  test('handles deeply nested keys', () => {
    const obj = { a: { b: { c: 'deep' } } };
    expect(flattenKeys(obj)).toEqual(['a.b.c']);
  });
});

// ---- checkLocaleKeys ----

const BASE_EN_KEYS = ['popup.start_session', 'popup.stop_session', 'options.title'];

describe('checkLocaleKeys', () => {
  test('returns no errors when locale keys match English exactly', () => {
    const bundle = {
      popup: { start_session: 'Démarrer', stop_session: 'Arrêter' },
      options: { title: 'Paramètres' },
    };
    const errors = checkLocaleKeys(BASE_EN_KEYS, bundle);
    expect(errors).toHaveLength(0);
  });

  test('reports MISSING error when locale is missing an English key', () => {
    const bundle = {
      popup: { start_session: 'Démarrer' },
      options: { title: 'Paramètres' },
    };
    const errors = checkLocaleKeys(BASE_EN_KEYS, bundle);
    expect(errors.some(e => e.startsWith('MISSING') && e.includes('popup.stop_session'))).toBe(true);
  });

  test('reports EXTRA error when locale has a key not in English', () => {
    const bundle = {
      popup: { start_session: 'Démarrer', stop_session: 'Arrêter', extra_key: 'Bonus' },
      options: { title: 'Paramètres' },
    };
    const errors = checkLocaleKeys(BASE_EN_KEYS, bundle);
    expect(errors.some(e => e.startsWith('EXTRA') && e.includes('popup.extra_key'))).toBe(true);
  });

  test('_meta is excluded from locale key comparison', () => {
    const bundle = {
      _meta: { generator: 'tool', generated_date: '2026-01-01' },
      popup: { start_session: 'Démarrer', stop_session: 'Arrêter' },
      options: { title: 'Paramètres' },
    };
    // No _meta in enKeys, but it should not raise an EXTRA error
    const errors = checkLocaleKeys(BASE_EN_KEYS, bundle);
    expect(errors.filter(e => e.includes('_meta'))).toHaveLength(0);
  });

  test('reports multiple MISSING keys in one call', () => {
    const bundle = { popup: { start_session: 'x' } };
    const errors = checkLocaleKeys(BASE_EN_KEYS, bundle);
    const missing = errors.filter(e => e.startsWith('MISSING'));
    expect(missing.length).toBeGreaterThanOrEqual(2);
  });

  test('reports both MISSING and EXTRA in the same call', () => {
    const bundle = {
      popup: { start_session: 'Démarrer', ghost_key: 'Extra' },
      options: { title: 'Paramètres' },
    };
    const errors = checkLocaleKeys(BASE_EN_KEYS, bundle);
    expect(errors.some(e => e.startsWith('MISSING'))).toBe(true);
    expect(errors.some(e => e.startsWith('EXTRA'))).toBe(true);
  });
});

// ---- checkBundleSize ----

describe('checkBundleSize', () => {
  test('returns no errors for a small bundle (under 100KB raw)', () => {
    const smallContent = JSON.stringify({ a: 'x'.repeat(100) });
    const errors = checkBundleSize('fr', smallContent);
    expect(errors).toHaveLength(0);
  });

  test('returns SIZE error when raw content exceeds 100KB', () => {
    // 100KB limit proxy = 50KB * 2 per spec
    const largeContent = 'x'.repeat(102 * 1024); // 102KB
    const errors = checkBundleSize('fr', largeContent);
    expect(errors.some(e => e.startsWith('SIZE') && e.includes('fr'))).toBe(true);
  });

  test('SIZE error message includes locale name and KB value', () => {
    const largeContent = 'x'.repeat(110 * 1024);
    const errors = checkBundleSize('es', largeContent);
    expect(errors[0]).toMatch(/SIZE.*es.*KB/);
  });

  test('content at exactly 100KB raw is accepted (boundary)', () => {
    const edgeContent = 'x'.repeat(100 * 1024);
    const errors = checkBundleSize('ro', edgeContent);
    expect(errors).toHaveLength(0);
  });
});
