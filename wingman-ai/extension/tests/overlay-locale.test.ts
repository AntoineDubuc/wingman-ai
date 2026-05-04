/**
 * Tests for F3-T3: Content script overlay localization
 *
 * Covers overlay i18n initialization, language change handling,
 * shadow host lang attribute management, and session-lock enforcement (FR-006).
 *
 * Uses jsdom for Shadow DOM / DOM testing.
 * @vitest-environment jsdom
 *
 * Acceptance Criteria:
 * AC1. Overlay text renders in the stored language on page load
 * AC2. All hardcoded strings replaceable with t() — verified via locale lookup
 * AC3. Speaker labels use interpolation (speaker_n with n parameter)
 * AC4. shadowHost.lang set on init and updated on language change
 * AC5. Language does NOT change mid-session (FR-006)
 * AC6. Overlay continues to function after language change (no crashes)
 * AC7. Cyrillic font stack specified in overlay CSS (NFR-A11Y-01)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';
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
vi.mock('@shared/i18n-init', () => ({
  createI18nInstance: vi.fn((locale: string) => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'overlay.suggestion.try_again': locale === 'fr' ? 'Réessayer' : locale === 'es' ? 'Intentar de nuevo' : locale === 'ru' ? 'Попробовать снова' : 'Try Again',
        'overlay.suggestion.thinking': locale === 'fr' ? 'Réflexion en cours…' : 'Thinking…',
        'overlay.suggestion.no_suggestion': locale === 'fr' ? 'Écoute en cours…' : 'Listening…',
        'overlay.speaker.you': locale === 'fr' ? 'Vous' : 'You',
        'overlay.speaker.speaker_n': locale === 'fr' ? `Intervenant ${opts?.n}` : `Speaker ${opts?.n}`,
        'overlay.transcript.live': locale === 'fr' ? 'En direct' : 'Live',
        'overlay.controls.minimize': locale === 'fr' ? 'Réduire' : 'Minimize',
        'overlay.controls.close': locale === 'fr' ? 'Fermer' : 'Close',
        'overlay.controls.dock': locale === 'fr' ? 'Ancrer' : 'Dock',
        'overlay.controls.undock': locale === 'fr' ? 'Désancrer' : 'Undock',
        'summary.cost.label': locale === 'fr' ? 'Coût estimé' : 'Estimated cost',
        'summary.cost.format': `${opts?.amount} USD`,
      };
      return translations[key] ?? key;
    },
    language: locale,
    isInitialized: true,
    changeLanguage: vi.fn().mockImplementation(function (this: any, newLocale: string) {
      this.language = newLocale;
      return Promise.resolve();
    }),
  })),
  validateLocale: vi.fn((raw: string): SupportedLocale | null => {
    const supported = ['en', 'fr', 'es', 'ro', 'ru'];
    return supported.includes(raw) ? (raw as SupportedLocale) : null;
  }),
}));

import { languagePreferenceService } from '../src/services/language-preference';
import {
  initOverlayI18n,
  handleOverlayStorageChange,
  createOverlayI18nInstance,
} from '../src/content/content-script-locale';

describe('createOverlayI18nInstance', () => {
  it('AC1: returns an i18n instance initialized with the given locale', () => {
    const i18n = createOverlayI18nInstance('fr');
    expect(i18n).toBeDefined();
    expect(i18n.t('overlay.suggestion.try_again')).toBe('Réessayer');
  });

  it('returns English strings for "en" locale', () => {
    const i18n = createOverlayI18nInstance('en');
    expect(i18n.t('overlay.suggestion.try_again')).toBe('Try Again');
    expect(i18n.t('overlay.suggestion.thinking')).toBe('Thinking…');
    expect(i18n.t('overlay.suggestion.no_suggestion')).toBe('Listening…');
  });

  it('returns Spanish strings for "es" locale', () => {
    const i18n = createOverlayI18nInstance('es');
    expect(i18n.t('overlay.suggestion.try_again')).toBe('Intentar de nuevo');
  });
});

describe('initOverlayI18n', () => {
  let shadowHost: HTMLDivElement;

  beforeEach(() => {
    shadowHost = document.createElement('div');
    document.body.appendChild(shadowHost);
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('en');
    fakeBrowser.reset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('AC1: returns an i18n instance initialized with the stored locale', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('fr');

    const result = await initOverlayI18n(shadowHost);

    expect(result.i18n).toBeDefined();
    expect(result.locale).toBe('fr');
    expect(result.i18n.t('overlay.suggestion.try_again')).toBe('Réessayer');
  });

  it('AC4: sets lang attribute on shadowHost on init', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('fr');

    await initOverlayI18n(shadowHost);

    expect(shadowHost.getAttribute('lang')).toBe('fr');
  });

  it('AC4: sets lang attribute to "ro" when stored locale is "ro"', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('ro');

    await initOverlayI18n(shadowHost);

    expect(shadowHost.getAttribute('lang')).toBe('ro');
  });

  it('AC4: sets lang attribute to "en" for default English locale', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('en');

    await initOverlayI18n(shadowHost);

    expect(shadowHost.getAttribute('lang')).toBe('en');
  });

  it('uses English as fallback when getLanguage returns "en"', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('en');

    const result = await initOverlayI18n(shadowHost);

    expect(result.locale).toBe('en');
  });
});

describe('handleOverlayStorageChange', () => {
  let shadowHost: HTMLDivElement;

  beforeEach(() => {
    shadowHost = document.createElement('div');
    shadowHost.setAttribute('lang', 'en');
    document.body.appendChild(shadowHost);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  function makeMockI18n(locale = 'en') {
    return {
      changeLanguage: vi.fn().mockResolvedValue(undefined),
      t: (key: string) => key,
      language: locale,
      isInitialized: true,
    } as any;
  }

  it('AC4: updates shadowHost lang attribute when language_preference changes', async () => {
    const mockI18n = makeMockI18n('en');
    const mockRefresh = vi.fn();

    await handleOverlayStorageChange(
      { language_preference: { newValue: 'fr', oldValue: 'en' } },
      'sync',
      shadowHost,
      mockI18n,
      false,
      mockRefresh,
    );

    expect(shadowHost.getAttribute('lang')).toBe('fr');
  });

  it('AC4: calls i18n.changeLanguage with new locale', async () => {
    const mockI18n = makeMockI18n('en');
    const mockRefresh = vi.fn();

    await handleOverlayStorageChange(
      { language_preference: { newValue: 'es', oldValue: 'en' } },
      'sync',
      shadowHost,
      mockI18n,
      false,
      mockRefresh,
    );

    expect(mockI18n.changeLanguage).toHaveBeenCalledWith('es');
  });

  it('AC6: calls refresh callback after language change (out-of-session)', async () => {
    const mockI18n = makeMockI18n('en');
    const mockRefresh = vi.fn();

    await handleOverlayStorageChange(
      { language_preference: { newValue: 'ro', oldValue: 'en' } },
      'sync',
      shadowHost,
      mockI18n,
      false,
      mockRefresh,
    );

    expect(mockRefresh).toHaveBeenCalledWith(mockI18n);
  });

  it('AC5: does NOT change language when session is active (FR-006)', async () => {
    const mockI18n = makeMockI18n('en');
    const mockRefresh = vi.fn();

    // Session is active = true
    await handleOverlayStorageChange(
      { language_preference: { newValue: 'ru', oldValue: 'en' } },
      'sync',
      shadowHost,
      mockI18n,
      true, // sessionActive
      mockRefresh,
    );

    // Lang attribute should NOT have changed
    expect(shadowHost.getAttribute('lang')).toBe('en');
    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('ignores changes from non-sync storage areas', async () => {
    const mockI18n = makeMockI18n('en');
    const mockRefresh = vi.fn();

    await handleOverlayStorageChange(
      { language_preference: { newValue: 'fr', oldValue: 'en' } },
      'local', // not sync
      shadowHost,
      mockI18n,
      false,
      mockRefresh,
    );

    expect(shadowHost.getAttribute('lang')).toBe('en');
    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('ignores changes that do not include language_preference', async () => {
    const mockI18n = makeMockI18n('en');
    const mockRefresh = vi.fn();

    await handleOverlayStorageChange(
      { theme: { newValue: 'dark', oldValue: 'light' } },
      'sync',
      shadowHost,
      mockI18n,
      false,
      mockRefresh,
    );

    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('ignores changes with invalid (unsupported) locale values', async () => {
    const mockI18n = makeMockI18n('en');
    const mockRefresh = vi.fn();

    await handleOverlayStorageChange(
      { language_preference: { newValue: 'de', oldValue: 'en' } },
      'sync',
      shadowHost,
      mockI18n,
      false,
      mockRefresh,
    );

    expect(shadowHost.getAttribute('lang')).toBe('en');
    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe('AC2: overlay string key coverage', () => {
  it('t("overlay.controls.minimize") returns locale-appropriate string', () => {
    const i18n = createOverlayI18nInstance('fr');
    expect(i18n.t('overlay.controls.minimize')).toBe('Réduire');
  });

  it('t("overlay.controls.close") returns locale-appropriate string', () => {
    const i18n = createOverlayI18nInstance('fr');
    expect(i18n.t('overlay.controls.close')).toBe('Fermer');
  });

  it('t("overlay.controls.dock") returns locale-appropriate string', () => {
    const i18n = createOverlayI18nInstance('fr');
    expect(i18n.t('overlay.controls.dock')).toBe('Ancrer');
  });

  it('t("overlay.controls.undock") returns locale-appropriate string', () => {
    const i18n = createOverlayI18nInstance('fr');
    expect(i18n.t('overlay.controls.undock')).toBe('Désancrer');
  });

  it('t("overlay.transcript.live") returns locale-appropriate string', () => {
    const i18n = createOverlayI18nInstance('fr');
    expect(i18n.t('overlay.transcript.live')).toBe('En direct');
  });

  it('t("overlay.speaker.you") returns locale-appropriate string', () => {
    const i18n = createOverlayI18nInstance('fr');
    expect(i18n.t('overlay.speaker.you')).toBe('Vous');
  });
});

describe('AC3: speaker label interpolation', () => {
  it('renders "Speaker 2" for English locale', () => {
    const i18n = createOverlayI18nInstance('en');
    const label = i18n.t('overlay.speaker.speaker_n', { n: 2 });
    expect(label).toBe('Speaker 2');
  });

  it('renders locale-specific "Speaker 2" equivalent for French locale', () => {
    const i18n = createOverlayI18nInstance('fr');
    const label = i18n.t('overlay.speaker.speaker_n', { n: 2 });
    expect(label).toBe('Intervenant 2');
  });

  it('renders "Speaker 5" with n=5 for English locale', () => {
    const i18n = createOverlayI18nInstance('en');
    const label = i18n.t('overlay.speaker.speaker_n', { n: 5 });
    expect(label).toBe('Speaker 5');
  });
});

describe('AC7: overlay CSS Cyrillic font stack audit', () => {
  it('overlay.css specifies a Cyrillic-capable font stack', async () => {
    // Read the overlay CSS file and verify it includes a font family with
    // Cyrillic-capable fonts (e.g., Segoe UI, Noto Sans, or system-ui)
    const { readFile } = await import('fs/promises');
    const { resolve } = await import('path');
    const cssPath = resolve(__dirname, '../src/content/overlay/overlay.css');
    const cssContent = await readFile(cssPath, 'utf8');
    // Verify font-family declaration includes at least one Cyrillic-capable font
    const cyrillicFonts = ['Segoe UI', 'Noto Sans', 'system-ui', 'sans-serif'];
    const hasCyrillicFont = cyrillicFonts.some((font) => cssContent.includes(font));
    expect(hasCyrillicFont).toBe(true);
  });
});
