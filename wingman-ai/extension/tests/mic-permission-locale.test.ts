/**
 * Tests for F3-T4: Mic permission page localization
 *
 * Tests for mic-permission-locale.ts companion module alongside mic-permission.html.
 * Uses jsdom for DOM manipulation testing of the mic permission page i18n.
 * @vitest-environment jsdom
 *
 * Acceptance Criteria:
 * AC1. Mic permission page text renders in stored locale on open
 * AC2. All visible strings localized — no hardcoded English for non-English locales
 * AC3. document.documentElement.lang set to active locale
 * AC4. Grant and cancel buttons function correctly after localization
 * AC5. Renders in English by default when no preference stored
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
    t: (key: string) => {
      const translations: Record<string, Record<string, string>> = {
        en: {
          'mic_permission.title': 'Microphone Access Required',
          'mic_permission.body': 'Wingman needs access to your microphone to transcribe the meeting.',
          'mic_permission.grant_button': 'Allow Access',
          'mic_permission.cancel_button': 'Cancel',
        },
        fr: {
          'mic_permission.title': 'Accès au microphone requis',
          'mic_permission.body': 'Wingman a besoin d\'accéder à votre microphone pour transcrire la réunion.',
          'mic_permission.grant_button': 'Autoriser l\'accès',
          'mic_permission.cancel_button': 'Annuler',
        },
        es: {
          'mic_permission.title': 'Se requiere acceso al micrófono',
          'mic_permission.body': 'Wingman necesita acceso a su micrófono para transcribir la reunión.',
          'mic_permission.grant_button': 'Permitir acceso',
          'mic_permission.cancel_button': 'Cancelar',
        },
        ro: {
          'mic_permission.title': 'Acces la microfon necesar',
          'mic_permission.body': 'Wingman are nevoie de acces la microfonul dvs. pentru a transcrie întâlnirea.',
          'mic_permission.grant_button': 'Permite accesul',
          'mic_permission.cancel_button': 'Anulare',
        },
        ru: {
          'mic_permission.title': 'Требуется доступ к микрофону',
          'mic_permission.body': 'Wingman нуждается в доступе к вашему микрофону для транскрипции встречи.',
          'mic_permission.grant_button': 'Разрешить доступ',
          'mic_permission.cancel_button': 'Отмена',
        },
      };
      return (translations[locale] ?? translations['en'])[key] ?? key;
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
  createMicPermissionI18nInstance,
  initMicPermissionPage,
  renderMicPermissionStrings,
} from '../src/mic-permission-locale';

/** Set up the minimal mic-permission HTML structure in jsdom */
function setupMicPermissionDOM(): void {
  document.body.innerHTML = `
    <div class="container">
      <h2 id="permission-title"></h2>
      <p id="permission-body"></p>
      <p id="denied" class="denied" style="display:none"></p>
    </div>
  `;
  // Reset lang attribute
  document.documentElement.removeAttribute('lang');
}

describe('createMicPermissionI18nInstance', () => {
  it('returns an i18n instance initialized with the given locale', () => {
    const i18n = createMicPermissionI18nInstance('fr');
    expect(i18n).toBeDefined();
    expect(i18n.t('mic_permission.title')).toBe('Accès au microphone requis');
  });

  it('returns English strings for "en" locale', () => {
    const i18n = createMicPermissionI18nInstance('en');
    expect(i18n.t('mic_permission.title')).toBe('Microphone Access Required');
    expect(i18n.t('mic_permission.grant_button')).toBe('Allow Access');
  });
});

describe('renderMicPermissionStrings', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setupMicPermissionDOM();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('AC2: injects translated title into #permission-title element', () => {
    const i18n = createMicPermissionI18nInstance('fr');
    renderMicPermissionStrings(i18n);
    const title = document.querySelector('#permission-title');
    expect(title).not.toBeNull();
    expect(title!.textContent).toBe('Accès au microphone requis');
  });

  it('AC2: injects translated body into #permission-body element', () => {
    const i18n = createMicPermissionI18nInstance('fr');
    renderMicPermissionStrings(i18n);
    const body = document.querySelector('#permission-body');
    expect(body).not.toBeNull();
    expect(body!.textContent).not.toBe('');
    expect(body!.textContent).not.toBe('mic_permission.body');
  });

  it('AC2: English strings render for "en" locale', () => {
    const i18n = createMicPermissionI18nInstance('en');
    renderMicPermissionStrings(i18n);
    expect(document.querySelector('#permission-title')!.textContent).toBe(
      'Microphone Access Required',
    );
  });

  it('AC2: does not throw when optional elements are absent', () => {
    document.body.innerHTML = '<div></div>'; // no IDs
    const i18n = createMicPermissionI18nInstance('en');
    expect(() => renderMicPermissionStrings(i18n)).not.toThrow();
  });
});

describe('initMicPermissionPage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setupMicPermissionDOM();
    vi.clearAllMocks();
    fakeBrowser.reset();
    // Re-install chrome.storage mock since fakeBrowser.reset() clears state
    (chrome.storage.sync as any).get = (keys: any) =>
      fakeBrowser.storage.sync.get(keys);
    (chrome.storage.sync as any).set = (items: any) =>
      fakeBrowser.storage.sync.set(items);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('lang');
    vi.clearAllMocks();
  });

  it('AC1+AC3: renders permission page in French when stored locale is fr', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('fr');

    await initMicPermissionPage();

    expect(document.querySelector('#permission-title')!.textContent).toBe(
      'Accès au microphone requis',
    );
    expect(document.documentElement.getAttribute('lang')).toBe('fr');
  });

  it('AC3+AC5: renders in English by default and sets lang="en"', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('en');

    await initMicPermissionPage();

    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(document.querySelector('#permission-title')!.textContent).toBe(
      'Microphone Access Required',
    );
  });

  it('AC2: renders in Spanish when stored locale is es', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('es');

    await initMicPermissionPage();

    expect(document.querySelector('#permission-title')!.textContent).toBe(
      'Se requiere acceso al micrófono',
    );
    expect(document.documentElement.getAttribute('lang')).toBe('es');
  });

  it('AC2: renders in Russian (Cyrillic) when stored locale is ru', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('ru');

    await initMicPermissionPage();

    expect(document.querySelector('#permission-title')!.textContent).toBe(
      'Требуется доступ к микрофону',
    );
    expect(document.documentElement.getAttribute('lang')).toBe('ru');
  });

  it('AC4: page body element gets translated content after init', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('fr');

    await initMicPermissionPage();

    const body = document.querySelector('#permission-body');
    expect(body).not.toBeNull();
    expect(body!.textContent).not.toBe('');
    // Non-English locale must not display English text
    expect(body!.textContent).not.toBe(
      'Wingman needs access to your microphone to transcribe the meeting.',
    );
  });

  it('AC1: returns the i18n instance and locale from initMicPermissionPage', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('ro');

    const result = await initMicPermissionPage();

    expect(result).toBeDefined();
    expect(result.locale).toBe('ro');
    expect(result.i18n).toBeDefined();
    expect(typeof result.i18n.t).toBe('function');
  });
});
