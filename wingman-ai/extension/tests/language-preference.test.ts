/**
 * Tests for LanguagePreferenceService (F1-T5)
 *
 * Covers all ACs:
 *  1. getLanguage() returns stored sync value ('fr')
 *  2. getLanguage() falls back to browser locale when storage empty
 *  3. getLanguage() returns 'en' for unsupported browser locale ('zh-TW')
 *  4. getLanguage() rejects invalid stored values → falls through to next tier
 *  5. getLanguage() reads from local when sync unavailable
 *  6. setLanguage('ro') writes to storage.sync
 *  7. setLanguage('fr') does not reject when storage.sync throws
 *  8. setLanguage('fr') falls back to local if sync.set throws
 *  9. detectFromBrowser maps correctly: fr-CA→fr, es-419→es, ru→ru, zh-TW→en, de→en
 * 10. Kill switch: locale_disabled=true → getLanguage() returns 'en'
 * 11. Kill switch failure (local.get throws) → getLanguage() works normally
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';
import { languagePreferenceService } from '../src/services/language-preference';

// The global `chrome` is set up in tests/setup.ts using fakeBrowser bridging.
// We need chrome.i18n.getUILanguage which is not in the global setup,
// so we add it here and restore it between tests.

// Snapshot of the original chrome from setup.ts — captured once, reused to reset
let baseChrome: any;

function buildTestChrome(uiLanguage: string, overrides?: Partial<any>): any {
  return {
    ...baseChrome,
    i18n: {
      getUILanguage: vi.fn().mockReturnValue(uiLanguage),
    },
    storage: {
      ...baseChrome.storage,
      ...(overrides?.storage ?? {}),
    },
    ...overrides,
  };
}

beforeEach(() => {
  // Capture the base chrome once (it is set up by tests/setup.ts before each test)
  if (!baseChrome) {
    baseChrome = (globalThis as any).chrome;
  }
  fakeBrowser.reset();
  vi.clearAllMocks();
  // Default browser locale to 'en' for isolation
  (globalThis as any).chrome = buildTestChrome('en');
});

afterEach(() => {
  // Restore chrome to the base chrome so mocks don't leak between tests
  (globalThis as any).chrome = baseChrome;
});

describe('LanguagePreferenceService.getLanguage()', () => {
  it('AC1: returns stored locale from storage.sync', async () => {
    await fakeBrowser.storage.sync.set({ language_preference: 'fr' });
    const result = await languagePreferenceService.getLanguage();
    expect(result).toBe('fr');
  });

  it('AC2: falls back to browser locale (es-419) when storage is empty', async () => {
    (globalThis as any).chrome = buildTestChrome('es-419');
    const result = await languagePreferenceService.getLanguage();
    expect(result).toBe('es');
  });

  it('AC3: returns "en" when browser locale is unsupported (zh-TW)', async () => {
    (globalThis as any).chrome = buildTestChrome('zh-TW');
    const result = await languagePreferenceService.getLanguage();
    expect(result).toBe('en');
  });

  it('AC4: rejects invalid stored value in sync and falls through to browser locale', async () => {
    // 'de' is not a supported locale → validateLocale returns null
    await fakeBrowser.storage.sync.set({ language_preference: 'de' });
    (globalThis as any).chrome = buildTestChrome('ru');
    const result = await languagePreferenceService.getLanguage();
    expect(result).toBe('ru');
  });

  it('AC5: reads from local storage when sync storage is unavailable (sync.get throws)', async () => {
    // Mock chrome.storage.sync.get to throw
    const existingChrome = (globalThis as any).chrome;
    (globalThis as any).chrome = {
      ...existingChrome,
      storage: {
        ...existingChrome.storage,
        sync: {
          ...existingChrome.storage.sync,
          get: vi.fn().mockRejectedValue(new Error('sync unavailable')),
        },
      },
    };
    await fakeBrowser.storage.local.set({ language_preference: 'ro' });
    const result = await languagePreferenceService.getLanguage();
    expect(result).toBe('ro');
  });

  it('AC10: kill switch returns "en" when locale_disabled=true in local storage', async () => {
    await fakeBrowser.storage.sync.set({ language_preference: 'fr' });
    await fakeBrowser.storage.local.set({ locale_disabled: true });
    const result = await languagePreferenceService.getLanguage();
    expect(result).toBe('en');
  });

  it('AC11: kill switch failure does not block normal flow', async () => {
    // Mock chrome.storage.local.get to throw, but sync has a valid locale
    const existingChrome = (globalThis as any).chrome;
    (globalThis as any).chrome = {
      ...existingChrome,
      storage: {
        ...existingChrome.storage,
        local: {
          ...existingChrome.storage.local,
          get: vi.fn().mockRejectedValue(new Error('local unavailable')),
        },
      },
    };
    await fakeBrowser.storage.sync.set({ language_preference: 'fr' });
    // Kill switch check uses local.get (will throw), but flow should continue
    // However, local.get throwing means both kill switch check AND local fallback fail
    // Sync still has 'fr', so result should be 'fr'
    const result = await languagePreferenceService.getLanguage();
    expect(result).toBe('fr');
  });
});

describe('LanguagePreferenceService.setLanguage()', () => {
  it('AC6: writes to storage.sync', async () => {
    await languagePreferenceService.setLanguage('ro');
    const result = await fakeBrowser.storage.sync.get('language_preference');
    expect(result.language_preference).toBe('ro');
  });

  it('AC7: does not reject when storage.sync.set throws', async () => {
    const existingChrome = (globalThis as any).chrome;
    (globalThis as any).chrome = {
      ...existingChrome,
      storage: {
        ...existingChrome.storage,
        sync: {
          ...existingChrome.storage.sync,
          set: vi.fn().mockRejectedValue(new Error('sync write failed')),
        },
      },
    };
    // Should not throw
    await expect(languagePreferenceService.setLanguage('fr')).resolves.toBeUndefined();
  });

  it('AC8: falls back to local storage if sync.set throws', async () => {
    const existingChrome = (globalThis as any).chrome;
    (globalThis as any).chrome = {
      ...existingChrome,
      storage: {
        ...existingChrome.storage,
        sync: {
          ...existingChrome.storage.sync,
          set: vi.fn().mockRejectedValue(new Error('sync write failed')),
        },
      },
    };
    await languagePreferenceService.setLanguage('fr');
    const result = await fakeBrowser.storage.local.get('language_preference');
    expect(result.language_preference).toBe('fr');
  });
});

describe('LanguagePreferenceService.detectFromBrowser()', () => {
  it('AC9a: maps fr-CA to fr', () => {
    expect(languagePreferenceService.detectFromBrowser('fr-CA')).toBe('fr');
  });

  it('AC9b: maps es-419 to es', () => {
    expect(languagePreferenceService.detectFromBrowser('es-419')).toBe('es');
  });

  it('AC9c: maps ru to ru', () => {
    expect(languagePreferenceService.detectFromBrowser('ru')).toBe('ru');
  });

  it('AC9d: maps zh-TW to en (unsupported)', () => {
    expect(languagePreferenceService.detectFromBrowser('zh-TW')).toBe('en');
  });

  it('AC9e: maps de to en (unsupported)', () => {
    expect(languagePreferenceService.detectFromBrowser('de')).toBe('en');
  });
});
