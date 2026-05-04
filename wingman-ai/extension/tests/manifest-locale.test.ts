/**
 * F1-T9: manifest.json — Add default_locale
 *
 * Validates that manifest.json contains the fields required for Chrome extension
 * i18n compatibility: default_locale and minimum_chrome_version.
 *
 * These are build-time structural checks — no browser environment needed.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read manifest from project root (relative to extension/ which is CWD for vitest)
const MANIFEST_PATH = resolve(process.cwd(), 'manifest.json');

interface ChromeManifest {
  manifest_version: number;
  name: string;
  version: string;
  default_locale?: string;
  minimum_chrome_version?: string;
  description?: string;
  [key: string]: unknown;
}

let manifest: ChromeManifest;

try {
  const raw = readFileSync(MANIFEST_PATH, 'utf-8');
  manifest = JSON.parse(raw) as ChromeManifest;
} catch {
  manifest = {} as ChromeManifest;
}

describe('manifest.json — i18n fields (F1-T9)', () => {
  test('manifest.json is readable and valid JSON', () => {
    expect(manifest).toBeDefined();
    expect(typeof manifest).toBe('object');
    expect(manifest.manifest_version).toBe(3);
  });

  test('manifest.json contains default_locale field', () => {
    expect(manifest).toHaveProperty('default_locale');
  });

  test('default_locale is set to "en"', () => {
    expect(manifest.default_locale).toBe('en');
  });

  test('manifest.json contains minimum_chrome_version field', () => {
    expect(manifest).toHaveProperty('minimum_chrome_version');
  });

  test('minimum_chrome_version is "116" (NFR-COMP-01)', () => {
    expect(manifest.minimum_chrome_version).toBe('116');
  });

  test('name field remains unchanged in English (OQ-01)', () => {
    // name should be a non-empty string and unchanged
    expect(typeof manifest.name).toBe('string');
    expect(manifest.name.length).toBeGreaterThan(0);
  });

  test('description field remains unchanged in English (OQ-01)', () => {
    // description should be a non-empty string and unchanged
    expect(typeof manifest.description).toBe('string');
    expect((manifest.description ?? '').length).toBeGreaterThan(0);
  });
});
