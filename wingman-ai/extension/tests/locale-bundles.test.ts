import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { describe, test, expect, beforeAll } from 'vitest';

const LOCALES_DIR = join(process.cwd(), 'src', 'locales');
const SUPPORTED_LOCALES = ['en', 'fr', 'es', 'ro', 'ru'];
const REQUIRED_TOP_LEVEL_KEYS = ['_meta', 'popup', 'options', 'overlay', 'summary', 'mic_permission', 'errors', 'common'];
const INTERPOLATION_VARS = ['{{n}}', '{{rawError}}', '{{provider}}', '{{amount}}'];

function loadLocale(locale: string): Record<string, unknown> {
  const filePath = join(LOCALES_DIR, locale, 'translation.json');
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function getLeafPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return [prefix];
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    getLeafPaths(v, prefix ? `${prefix}.${k}` : k)
  );
}

function findInterpolationVars(obj: unknown): Set<string> {
  const found = new Set<string>();
  const str = JSON.stringify(obj);
  for (const v of INTERPOLATION_VARS) {
    if (str.includes(v)) found.add(v);
  }
  return found;
}

describe('Locale bundle files', () => {
  test('all 5 locale files exist', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const filePath = join(LOCALES_DIR, locale, 'translation.json');
      expect(existsSync(filePath), `${locale}/translation.json should exist`).toBe(true);
    }
  });

  test('all locale files are valid JSON', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(() => loadLocale(locale), `${locale} should be valid JSON`).not.toThrow();
    }
  });

  test('English bundle has all required top-level keys', () => {
    const en = loadLocale('en');
    for (const key of REQUIRED_TOP_LEVEL_KEYS) {
      expect(en, `English bundle should have key: ${key}`).toHaveProperty(key);
    }
  });

  test('all locales have identical key structure', () => {
    const enPaths = getLeafPaths(loadLocale('en')).sort();
    for (const locale of SUPPORTED_LOCALES.filter(l => l !== 'en')) {
      const localePaths = getLeafPaths(loadLocale(locale)).sort();
      expect(localePaths, `${locale} key structure should match English`).toEqual(enPaths);
    }
  });

  test('interpolation variables preserved in all locales', () => {
    const enStr = JSON.stringify(loadLocale('en'));
    const enVars = INTERPOLATION_VARS.filter(v => enStr.includes(v));

    for (const locale of SUPPORTED_LOCALES.filter(l => l !== 'en')) {
      const localeStr = JSON.stringify(loadLocale(locale));
      for (const v of enVars) {
        expect(localeStr.includes(v), `${locale} should preserve interpolation var: ${v}`).toBe(true);
      }
    }
  });

  test('all bundles have _meta key', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const bundle = loadLocale(locale);
      expect(bundle).toHaveProperty('_meta');
    }
  });
});
