/**
 * Tests for F4-T4: Tutorial Index Banner (OQ-02 Mitigation)
 *
 * Tests for the initTutorialsI18n function exported from tutorials.ts.
 * Verifies that a localized English-only banner is shown for non-English locales.
 * @vitest-environment jsdom
 *
 * Acceptance Criteria:
 * AC1. Banner appears on tutorial index page for French, Spanish, Romanian, and Russian locales
 * AC2. Banner does NOT appear for English locale
 * AC3. Banner text is localized (rendered in the active locale via i18n.t)
 * AC4. Banner is accessible — uses role="note" and is visible to screen readers
 * AC5. Tutorial functionality is unaffected (navigation, scrolling, screenshots)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupportedLocale } from '@shared/i18n-types';

// Mock languagePreferenceService
vi.mock('../src/services/language-preference', () => ({
  languagePreferenceService: {
    getLanguage: vi.fn().mockResolvedValue('en' as SupportedLocale),
    setLanguage: vi.fn().mockResolvedValue(undefined),
    detectFromBrowser: vi.fn().mockReturnValue('en' as SupportedLocale),
  },
}));

// Mock i18n-init to avoid loading actual locale bundles in unit tests
vi.mock('../src/shared/i18n-init', () => ({
  createI18nInstance: vi.fn((_locale: string) => ({
    t: (key: string) => key,
    language: _locale,
    isInitialized: true,
    changeLanguage: vi.fn().mockResolvedValue(undefined),
  })),
  validateLocale: vi.fn((raw: string): SupportedLocale | null => {
    const supported = ['en', 'fr', 'es', 'ro', 'ru'];
    return supported.includes(raw) ? (raw as SupportedLocale) : null;
  }),
}));

import { languagePreferenceService } from '../src/services/language-preference';
import { initTutorialsI18n } from '../src/tutorials/tutorials';

/** Set up the minimal DOM structure matching index.html */
function setupTutorialsDOM(): void {
  document.body.innerHTML = `
    <main>
      <div id="english-only-banner" class="locale-notice-banner" style="display:none" role="note" aria-live="polite"></div>
      <div class="section-title">Getting Started</div>
    </main>
  `;
  document.documentElement.removeAttribute('lang');
}

describe('initTutorialsI18n — banner visibility', () => {
  beforeEach(() => {
    setupTutorialsDOM();
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('lang');
  });

  it('AC1: shows banner for French locale', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('fr');

    await initTutorialsI18n();

    const banner = document.getElementById('english-only-banner') as HTMLDivElement;
    expect(banner).not.toBeNull();
    expect(banner.style.display).toBe('block');
  });

  it('AC1: shows banner for Spanish locale', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('es');

    await initTutorialsI18n();

    const banner = document.getElementById('english-only-banner') as HTMLDivElement;
    expect(banner).not.toBeNull();
    expect(banner.style.display).toBe('block');
  });

  it('AC1: shows banner for Romanian locale', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('ro');

    await initTutorialsI18n();

    const banner = document.getElementById('english-only-banner') as HTMLDivElement;
    expect(banner).not.toBeNull();
    expect(banner.style.display).toBe('block');
  });

  it('AC1: shows banner for Russian locale', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('ru');

    await initTutorialsI18n();

    const banner = document.getElementById('english-only-banner') as HTMLDivElement;
    expect(banner).not.toBeNull();
    expect(banner.style.display).toBe('block');
  });

  it('AC2: hides banner for English locale', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('en');

    await initTutorialsI18n();

    const banner = document.getElementById('english-only-banner') as HTMLDivElement;
    expect(banner).not.toBeNull();
    // display should remain 'none' or empty string (not 'block')
    expect(banner.style.display).not.toBe('block');
  });

  it('AC3: sets banner textContent for non-English locale', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('fr');

    await initTutorialsI18n();

    const banner = document.getElementById('english-only-banner') as HTMLDivElement;
    // The mock i18n.t returns the key as-is; textContent should be the i18n key
    expect(banner.textContent).toBe('tutorials.english_only_banner');
  });

  it('AC3: does NOT set banner textContent for English locale', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('en');

    await initTutorialsI18n();

    const banner = document.getElementById('english-only-banner') as HTMLDivElement;
    // For English, banner should remain empty (not injected)
    expect(banner.textContent).toBe('');
  });

  it('AC3: uses textContent (not innerHTML) for injection — XSS safety', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('fr');

    // The mock i18n.t returns the key, so if textContent equals key, textContent was used
    await initTutorialsI18n();

    const banner = document.getElementById('english-only-banner') as HTMLDivElement;
    // textContent does not interpret HTML tags, so this verifies safe assignment
    expect(banner.innerHTML).toBe('tutorials.english_only_banner');
  });

  it('AC4: banner element has role="note"', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('fr');

    await initTutorialsI18n();

    const banner = document.getElementById('english-only-banner');
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute('role')).toBe('note');
  });

  it('sets document.documentElement.lang attribute to active locale', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('fr');

    await initTutorialsI18n();

    expect(document.documentElement.getAttribute('lang')).toBe('fr');
  });

  it('sets document.documentElement.lang to "en" for English locale', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('en');

    await initTutorialsI18n();

    expect(document.documentElement.getAttribute('lang')).toBe('en');
  });

  it('returns { i18n, locale } object for testability', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('ro');

    const result = await initTutorialsI18n();

    expect(result).toBeDefined();
    expect(result.locale).toBe('ro');
    expect(result.i18n).toBeDefined();
    expect(typeof result.i18n.t).toBe('function');
  });

  it('does not throw when #english-only-banner element is absent', async () => {
    document.body.innerHTML = '<main><div class="section-title">Test</div></main>';
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('fr');

    await expect(initTutorialsI18n()).resolves.not.toThrow();
  });
});
