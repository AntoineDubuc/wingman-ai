import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

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
 * Strips an i18next plural-form suffix from a leaf key, normalizing it to its
 * "logical" form for cross-locale comparison.
 *
 * i18next plural-form suffixes per CLDR: `_zero`, `_one`, `_two`, `_few`, `_many`, `_other`.
 * Different locales use different subsets — e.g., English uses `_one`/`_other` (2 forms),
 * Russian and Romanian use `_one`/`_few`/`_other` (3 forms each, with different rules).
 * The canonical English bundle declares plural keys with `_one`/`_other`; a non-English
 * bundle may add `_few` (or other CLDR forms) without that being a key-set mismatch —
 * those are i18next plural-form variants of the same logical key.
 */
export function normalizeKey(key: string): string {
  return key.replace(/_(?:zero|one|two|few|many|other)$/, '');
}

/**
 * Compares a locale bundle against the canonical English key list.
 * Returns an array of error strings (empty = pass).
 *
 * Plural-form suffixes are normalized before comparison (see `normalizeKey`)
 * so that locale-specific extra plural forms (e.g., Russian/Romanian `_few`)
 * do not register as EXTRA keys when the corresponding logical key exists in en.
 */
export function checkLocaleKeys(enKeys: string[], bundle: Record<string, unknown>): string[] {
  const localeKeys = flattenKeys(bundle);
  const enLogicalSet = new Set(enKeys.map(normalizeKey));
  const localeLogicalSet = new Set(localeKeys.map(normalizeKey));
  const errors: string[] = [];

  for (const logicalKey of enLogicalSet) {
    if (!localeLogicalSet.has(logicalKey)) {
      errors.push(`MISSING: ${logicalKey}`);
    }
  }
  for (const logicalKey of localeLogicalSet) {
    if (!enLogicalSet.has(logicalKey)) {
      errors.push(`EXTRA: ${logicalKey}`);
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

// CLI entrypoint check that works on both POSIX and Windows.
// Same fix as scripts/sanitize-locale-files.ts (Plan 1 Task 3) — the original
// `import.meta.url === new URL(argv[1], 'file://').href` comparison fails on
// Windows due to path-separator/drive-case/percent-encoding differences,
// making the NFR-M02 CI gate silently inert. Compare resolved filesystem paths.
if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  main();
}
