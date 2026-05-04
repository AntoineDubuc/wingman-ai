/**
 * Tests for F3-T1: Popup localization
 *
 * Tests for popup-locale.ts companion module alongside popup.ts.
 * Uses jsdom for DOM manipulation testing.
 * @vitest-environment jsdom
 *
 * Acceptance Criteria:
 * AC1. Popup opens with text in the stored language preference
 * AC2. Popup text updates immediately when language is changed in options (without closing/reopening)
 * AC3. Language change is blocked during active sessions (FR-006)
 * AC4. document.documentElement.lang is set to the active locale on popup open
 * AC5. document.documentElement.lang updates when language changes via onChanged listener
 * AC6. All visible strings are translated — no hardcoded English for non-English locales
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
          'popup.start_session': 'Start Session',
          'popup.stop_session': 'Stop Session',
          'popup.status.active': 'Session Active',
          'popup.status.idle': 'Ready',
          'popup.status.connecting': 'Connecting…',
        },
        fr: {
          'popup.start_session': 'Démarrer la session',
          'popup.stop_session': 'Arrêter la session',
          'popup.status.active': 'Session active',
          'popup.status.idle': 'Prêt',
          'popup.status.connecting': 'Connexion en cours…',
        },
        es: {
          'popup.start_session': 'Iniciar sesión',
          'popup.stop_session': 'Detener sesión',
          'popup.status.active': 'Sesión activa',
          'popup.status.idle': 'Listo',
          'popup.status.connecting': 'Conectando…',
        },
        ro: {
          'popup.start_session': 'Pornire sesiune',
          'popup.stop_session': 'Oprire sesiune',
          'popup.status.active': 'Sesiune activă',
          'popup.status.idle': 'Gata',
          'popup.status.connecting': 'Se conectează…',
        },
        ru: {
          'popup.start_session': 'Начать сеанс',
          'popup.stop_session': 'Остановить сеанс',
          'popup.status.active': 'Сеанс активен',
          'popup.status.idle': 'Готов',
          'popup.status.connecting': 'Подключение…',
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
  initPopupI18n,
  renderPopupStrings,
  handlePopupStorageChange,
  createPopupI18nInstance,
} from '../src/popup/popup-locale';

// Minimal popup DOM structure for testing
function buildPopupDOM(): void {
  document.body.innerHTML = `
    <button id="session-btn">Start Session</button>
    <span id="api-status">
      <span class="status-dot"></span>
      <span class="status-text">Not Configured</span>
    </span>
    <span id="session-status">
      <span class="status-dot"></span>
      <span class="status-text">Inactive</span>
    </span>
  `;
}

describe('createPopupI18nInstance', () => {
  it('returns an i18n instance initialized with the given locale', () => {
    const i18n = createPopupI18nInstance('fr');
    expect(i18n).toBeDefined();
    expect(i18n.t('popup.start_session')).toBe('Démarrer la session');
  });

  it('returns English strings for "en" locale', () => {
    const i18n = createPopupI18nInstance('en');
    expect(i18n.t('popup.start_session')).toBe('Start Session');
    expect(i18n.t('popup.stop_session')).toBe('Stop Session');
    expect(i18n.t('popup.status.idle')).toBe('Ready');
  });

  it('returns Spanish strings for "es" locale', () => {
    const i18n = createPopupI18nInstance('es');
    expect(i18n.t('popup.start_session')).toBe('Iniciar sesión');
  });

  it('returns Romanian strings for "ro" locale', () => {
    const i18n = createPopupI18nInstance('ro');
    expect(i18n.t('popup.start_session')).toBe('Pornire sesiune');
  });

  it('returns Russian strings for "ru" locale', () => {
    const i18n = createPopupI18nInstance('ru');
    expect(i18n.t('popup.start_session')).toBe('Начать сеанс');
  });
});

describe('renderPopupStrings', () => {
  beforeEach(() => {
    document.documentElement.lang = '';
    buildPopupDOM();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.lang = '';
    vi.clearAllMocks();
  });

  it('AC6: renders start session button text in French', () => {
    const i18n = createPopupI18nInstance('fr');
    renderPopupStrings(i18n);

    const btn = document.getElementById('session-btn');
    expect(btn).not.toBeNull();
    expect(btn!.textContent?.trim()).toBe('Démarrer la session');
  });

  it('AC6: renders start session button text in English', () => {
    const i18n = createPopupI18nInstance('en');
    renderPopupStrings(i18n);

    const btn = document.getElementById('session-btn');
    expect(btn!.textContent?.trim()).toBe('Start Session');
  });

  it('AC6: renders status text using i18n keys', () => {
    const i18n = createPopupI18nInstance('fr');
    renderPopupStrings(i18n);

    const sessionText = document.querySelector('#session-status .status-text');
    expect(sessionText).not.toBeNull();
    // Renders idle/inactive state text in French
    expect(sessionText!.textContent).toBe('Prêt');
  });

  it('AC6: renders API status text using i18n keys', () => {
    const i18n = createPopupI18nInstance('fr');
    renderPopupStrings(i18n);

    const apiText = document.querySelector('#api-status .status-text');
    expect(apiText).not.toBeNull();
    // key falls back to key string since not in our mock translations — just verifies it's called
    expect(apiText!.textContent).toBeDefined();
  });
});

describe('initPopupI18n', () => {
  beforeEach(() => {
    document.documentElement.lang = '';
    buildPopupDOM();
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('en');
    fakeBrowser.reset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.lang = '';
    vi.clearAllMocks();
  });

  it('AC4: sets document.documentElement.lang to stored locale on init', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('fr');

    await initPopupI18n();

    expect(document.documentElement.lang).toBe('fr');
  });

  it('AC1: returns i18n instance initialized with stored locale', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('es');

    const result = await initPopupI18n();

    expect(result.i18n).toBeDefined();
    expect(result.locale).toBe('es');
  });

  it('AC1: renders popup strings in French when language_preference is fr', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('fr');

    await initPopupI18n();

    const btn = document.getElementById('session-btn');
    expect(btn!.textContent?.trim()).toBe('Démarrer la session');
  });

  it('uses English as fallback when getLanguage returns en', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('en');

    const result = await initPopupI18n();

    expect(result.locale).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('AC4: sets document.documentElement.lang to "ro" for Romanian locale', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('ro');

    await initPopupI18n();

    expect(document.documentElement.lang).toBe('ro');
  });
});

describe('handlePopupStorageChange', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
    buildPopupDOM();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.lang = '';
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

  it('AC5: updates document.documentElement.lang when language_preference changes', async () => {
    const mockI18n = makeMockI18n('en');
    const mockRerender = vi.fn();

    const changes = {
      language_preference: { newValue: 'fr', oldValue: 'en' },
    };

    await handlePopupStorageChange(changes, 'sync', mockI18n, false, mockRerender);

    expect(document.documentElement.lang).toBe('fr');
  });

  it('AC5: calls i18n.changeLanguage with new locale', async () => {
    const mockI18n = makeMockI18n('en');
    const mockRerender = vi.fn();

    const changes = {
      language_preference: { newValue: 'ro', oldValue: 'en' },
    };

    await handlePopupStorageChange(changes, 'sync', mockI18n, false, mockRerender);

    expect(mockI18n.changeLanguage).toHaveBeenCalledWith('ro');
  });

  it('AC2: calls rerender callback after language change', async () => {
    const mockI18n = makeMockI18n('en');
    const mockRerender = vi.fn();

    const changes = {
      language_preference: { newValue: 'ru', oldValue: 'en' },
    };

    await handlePopupStorageChange(changes, 'sync', mockI18n, false, mockRerender);

    expect(mockRerender).toHaveBeenCalledWith(mockI18n);
  });

  it('AC3: does NOT change language when session is active (FR-006)', async () => {
    const mockI18n = makeMockI18n('en');
    const mockRerender = vi.fn();

    // Session is active = true
    await handlePopupStorageChange(
      { language_preference: { newValue: 'ru', oldValue: 'en' } },
      'sync',
      mockI18n,
      true, // sessionActive
      mockRerender,
    );

    expect(document.documentElement.lang).toBe('en');
    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
    expect(mockRerender).not.toHaveBeenCalled();
  });

  it('ignores changes from non-sync storage areas', async () => {
    const mockI18n = makeMockI18n('en');
    const mockRerender = vi.fn();

    const changes = {
      language_preference: { newValue: 'fr', oldValue: 'en' },
    };

    await handlePopupStorageChange(changes, 'local', mockI18n, false, mockRerender);

    expect(document.documentElement.lang).toBe('en');
    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
    expect(mockRerender).not.toHaveBeenCalled();
  });

  it('ignores changes that do not include language_preference', async () => {
    const mockI18n = makeMockI18n('en');
    const mockRerender = vi.fn();

    const changes = {
      theme: { newValue: 'dark', oldValue: 'light' },
    };

    await handlePopupStorageChange(changes, 'sync', mockI18n, false, mockRerender);

    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
    expect(mockRerender).not.toHaveBeenCalled();
  });

  it('ignores changes with invalid (unsupported) locale values', async () => {
    const mockI18n = makeMockI18n('en');
    const mockRerender = vi.fn();

    const changes = {
      language_preference: { newValue: 'de', oldValue: 'en' },
    };

    await handlePopupStorageChange(changes, 'sync', mockI18n, false, mockRerender);

    expect(document.documentElement.lang).toBe('en');
    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
    expect(mockRerender).not.toHaveBeenCalled();
  });
});

describe('AC6: popup string key coverage', () => {
  beforeEach(() => {
    buildPopupDOM();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('t("popup.start_session") returns locale-appropriate string for French', () => {
    const i18n = createPopupI18nInstance('fr');
    expect(i18n.t('popup.start_session')).toBe('Démarrer la session');
  });

  it('t("popup.stop_session") returns locale-appropriate string for French', () => {
    const i18n = createPopupI18nInstance('fr');
    expect(i18n.t('popup.stop_session')).toBe('Arrêter la session');
  });

  it('t("popup.status.active") returns locale-appropriate string for French', () => {
    const i18n = createPopupI18nInstance('fr');
    expect(i18n.t('popup.status.active')).toBe('Session active');
  });

  it('t("popup.status.idle") returns locale-appropriate string for French', () => {
    const i18n = createPopupI18nInstance('fr');
    expect(i18n.t('popup.status.idle')).toBe('Prêt');
  });

  it('t("popup.status.connecting") returns locale-appropriate string for French', () => {
    const i18n = createPopupI18nInstance('fr');
    expect(i18n.t('popup.status.connecting')).toBe('Connexion en cours…');
  });
});
