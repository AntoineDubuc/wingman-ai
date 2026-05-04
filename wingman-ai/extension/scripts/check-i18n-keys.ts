import { readFileSync } from 'fs';
import { join } from 'path';

const LOCALES_DIR = join(process.cwd(), 'src', 'locales');
const NON_ENGLISH_LOCALES = ['fr', 'es', 'ro', 'ru'];
const META_KEY = '_meta'; // excluded from key comparison

const BUNDLE_SIZE_LIMIT_KB = 50; // NFR-PERF-02: each locale bundle must gzip ≤50KB

/**
 * Flattens a nested object into dot-separated leaf key paths.
 * The `_meta` key is excluded at every level of the hierarchy.
 */
export function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    if (key === META_KEY) return [];
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, unknown>, fullKey);
    }
    return [fullKey];
  });
}

/**
 * Compares a locale bundle against the canonical English key list.
 * Returns an array of error strings (empty = pass).
 */
export function checkLocaleKeys(enKeys: string[], bundle: Record<string, unknown>): string[] {
  const localeKeys = new Set(flattenKeys(bundle));
  const enKeySet = new Set(enKeys);
  const errors: string[] = [];

  for (const key of enKeys) {
    if (!localeKeys.has(key)) {
      errors.push(`MISSING: ${key}`);
    }
  }
  for (const key of localeKeys) {
    if (!enKeySet.has(key)) {
      errors.push(`EXTRA: ${key}`);
    }
  }
  return errors;
}

/**
 * Checks raw bundle content size as a proxy for gzip size (NFR-PERF-02).
 * Fails if raw size exceeds 2× the gzip limit (100KB).
 * Accepts content as a string to allow unit testing without file I/O.
 */
export function checkBundleSize(locale: string, content: string): string[] {
  const rawKb = Buffer.byteLength(content, 'utf-8') / 1024;
  if (rawKb > BUNDLE_SIZE_LIMIT_KB * 2) {
    return [
      `SIZE in ${locale}: ${rawKb.toFixed(1)}KB raw (gzip estimate exceeds ${BUNDLE_SIZE_LIMIT_KB}KB limit)`,
    ];
  }
  return [];
}

// ---- CLI entry point ----

function readBundle(locale: string): { raw: string; bundle: Record<string, unknown> } {
  const raw = readFileSync(join(LOCALES_DIR, locale, 'translation.json'), 'utf-8');
  return { raw, bundle: JSON.parse(raw) as Record<string, unknown> };
}

function main() {
  const { raw: enRaw, bundle: enBundle } = readBundle('en');
  const enKeys = flattenKeys(enBundle);

  let allErrors: string[] = [];

  // English size check
  allErrors = allErrors.concat(checkBundleSize('en', enRaw));

  // Size + key exhaustiveness check for non-English locales (single read per locale)
  for (const locale of NON_ENGLISH_LOCALES) {
    const { raw, bundle } = readBundle(locale);
    allErrors = allErrors.concat(checkBundleSize(locale, raw));
    allErrors = allErrors.concat(
      checkLocaleKeys(enKeys, bundle).map(e => e.replace(':', ` in ${locale}:`)),
    );
  }

  if (allErrors.length > 0) {
    console.error('\nBUILD-01 FAILED: Locale key mismatch or bundle size violation\n');
    for (const error of allErrors) {
      console.error(`  ${error}`);
    }
    console.error(
      '\nFix: Add missing keys to locale files, remove extra keys, or reduce string count if over size limit.\n',
    );
    process.exit(1);
  }

  console.log(
    `BUILD-01 PASSED: All ${NON_ENGLISH_LOCALES.length + 1} locale bundles have complete key coverage and are within size limits`,
  );
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  main();
}
