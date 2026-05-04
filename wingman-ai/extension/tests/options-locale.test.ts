/**
 * Tests for F3-T2: Options page language picker and locale initialization
 *
 * Uses jsdom for DOM manipulation testing of the language picker UI.
 * @vitest-environment jsdom
 *
 * Acceptance Criteria:
 * AC1. Language picker shows 5 options with native-script names
 * AC2. Selecting a locale calls setLanguage on languagePreferenceService
 * AC3. Picker is disabled during active session with tooltip
 * AC4. Picker is enabled when no active session
 * AC5. document.documentElement.lang set to active locale on open
 * AC6. document.documentElement.lang updates when language changes via onChanged
 * AC7. Picker selection persists (setLanguage called with correct value)
 * AC8. renderLanguagePicker populates LOCALE_DISPLAY_NAMES as option text
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SUPPORTED_LOCALES, LOCALE_DISPLAY_NAMES, type SupportedLocale } from '@shared/i18n-types';
import { languagePreferenceService } from '../src/services/language-preference';
import { renderLanguagePicker, initOptionsI18n, handleStorageChange } from '../src/options/options-locale';

// Mock languagePreferenceService
vi.mock('../src/services/language-preference', () => ({
  languagePreferenceService: {
    getLanguage: vi.fn().mockResolvedValue('en'),
    setLanguage: vi.fn().mockResolvedValue(undefined),
    detectFromBrowser: vi.fn().mockReturnValue('en'),
  },
}));

// Mock i18n-init
vi.mock('@shared/i18n-init', () => ({
  createI18nInstance: vi.fn((locale: string) => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'options.setup.language_picker_label': 'Language',
        'options.setup.language_locked_tooltip': 'Language locked during active session',
      };
      return translations[key] ?? key;
    },
    language: locale,
    isInitialized: true,
    changeLanguage: vi.fn().mockResolvedValue(undefined),
  })),
  validateLocale: vi.fn((raw: string): SupportedLocale | null => {
    const supported = ['en', 'fr', 'es', 'ro', 'ru'];
    return supported.includes(raw) ? (raw as SupportedLocale) : null;
  }),
}));

function createContainer(): HTMLDivElement {
  const container = document.createElement('div');
  container.id = 'language-picker-container';
  document.body.appendChild(container);
  return container;
}

describe('renderLanguagePicker', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = createContainer();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('AC1: shows all 5 supported locales as options', () => {
    const mockI18n = {
      t: (key: string) => {
        const map: Record<string, string> = {
          'options.setup.language_picker_label': 'Language',
          'options.setup.language_locked_tooltip': 'Language locked during active session',
        };
        return map[key] ?? key;
      },
    };

    renderLanguagePicker(mockI18n as any, 'en', false);

    const options = container.querySelectorAll('#language-picker option');
    expect(options).toHaveLength(5);
  });

  it('AC8: displays native-script display names for each locale', () => {
    const mockI18n = {
      t: (key: string) => {
        const map: Record<string, string> = {
          'options.setup.language_picker_label': 'Language',
          'options.setup.language_locked_tooltip': 'Language locked during active session',
        };
        return map[key] ?? key;
      },
    };

    renderLanguagePicker(mockI18n as any, 'en', false);

    const options = container.querySelectorAll('#language-picker option');
    const optionTexts = Array.from(options).map((o) => o.textContent);

    expect(optionTexts).toContain('English');
    expect(optionTexts).toContain('Français');
    expect(optionTexts).toContain('Español');
    expect(optionTexts).toContain('Română');
    expect(optionTexts).toContain('Русский');
  });

  it('AC4: picker is enabled when session is not active', () => {
    const mockI18n = {
      t: (key: string) => key,
    };

    renderLanguagePicker(mockI18n as any, 'en', false);

    const picker = container.querySelector('#language-picker') as HTMLSelectElement;
    expect(picker).not.toBeNull();
    expect(picker.disabled).toBe(false);
  });

  it('AC3: picker is disabled during active session', () => {
    const mockI18n = {
      t: (key: string) => {
        if (key === 'options.setup.language_locked_tooltip') {
          return 'Language locked during active session';
        }
        return key;
      },
    };

    renderLanguagePicker(mockI18n as any, 'en', true);

    const picker = container.querySelector('#language-picker') as HTMLSelectElement;
    expect(picker).not.toBeNull();
    expect(picker.disabled).toBe(true);
  });

  it('AC3: picker shows tooltip when disabled during active session', () => {
    const mockI18n = {
      t: (key: string) => {
        if (key === 'options.setup.language_locked_tooltip') {
          return 'Language locked during active session';
        }
        return key;
      },
    };

    renderLanguagePicker(mockI18n as any, 'en', true);

    const picker = container.querySelector('#language-picker') as HTMLSelectElement;
    expect(picker.title).toBe('Language locked during active session');
  });

  it('AC3: picker has no tooltip when session is not active', () => {
    const mockI18n = {
      t: (key: string) => key,
    };

    renderLanguagePicker(mockI18n as any, 'en', false);

    const picker = container.querySelector('#language-picker') as HTMLSelectElement;
    expect(picker.title).toBe('');
  });

  it('marks current locale as selected', () => {
    const mockI18n = {
      t: (key: string) => key,
    };

    renderLanguagePicker(mockI18n as any, 'fr', false);

    const picker = container.querySelector('#language-picker') as HTMLSelectElement;
    expect(picker.value).toBe('fr');
  });

  it('AC2/AC7: calls setLanguage when selection changes', async () => {
    const setLangSpy = vi.spyOn(languagePreferenceService, 'setLanguage').mockResolvedValue(undefined);
    const mockI18n = {
      t: (key: string) => key,
    };

    renderLanguagePicker(mockI18n as any, 'en', false);

    const picker = container.querySelector('#language-picker') as HTMLSelectElement;
    picker.value = 'fr';
    picker.dispatchEvent(new Event('change'));

    // Allow async handler to run
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(setLangSpy).toHaveBeenCalledWith('fr');
  });

  it('does not call setLanguage for invalid locale selection', async () => {
    const setLangSpy = vi.spyOn(languagePreferenceService, 'setLanguage').mockResolvedValue(undefined);
    const mockI18n = {
      t: (key: string) => key,
    };

    renderLanguagePicker(mockI18n as any, 'en', false);

    const picker = container.querySelector('#language-picker') as HTMLSelectElement;
    // Simulate an invalid value (DOM manipulation)
    Object.defineProperty(picker, 'value', { value: 'invalid', configurable: true });
    picker.dispatchEvent(new Event('change'));

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(setLangSpy).not.toHaveBeenCalled();
  });

  it('renders a label with language_picker_label text', () => {
    const mockI18n = {
      t: (key: string) => {
        if (key === 'options.setup.language_picker_label') return 'Language';
        return key;
      },
    };

    renderLanguagePicker(mockI18n as any, 'en', false);

    const label = container.querySelector('label');
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('Language');
  });
});

describe('initOptionsI18n', () => {
  beforeEach(() => {
    document.documentElement.lang = '';
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.documentElement.lang = '';
  });

  it('AC5: sets document.documentElement.lang to active locale', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('fr');

    await initOptionsI18n();

    expect(document.documentElement.lang).toBe('fr');
  });

  it('returns i18n instance initialized with current locale', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('es');

    const result = await initOptionsI18n();

    expect(result.i18n).toBeDefined();
    expect(result.locale).toBe('es');
  });

  it('uses english as fallback when getLanguage returns en', async () => {
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('en');

    const result = await initOptionsI18n();

    expect(result.locale).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('handleStorageChange', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en';
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.documentElement.lang = '';
  });

  it('AC6: updates document.documentElement.lang when language_preference changes', async () => {
    const mockI18n = {
      changeLanguage: vi.fn().mockResolvedValue(undefined),
      t: (key: string) => key,
    };
    const mockRerender = vi.fn();

    const changes = {
      language_preference: { newValue: 'fr', oldValue: 'en' },
    };

    await handleStorageChange(changes, 'sync', mockI18n as any, mockRerender);

    expect(document.documentElement.lang).toBe('fr');
  });

  it('AC6: calls i18n.changeLanguage with new locale', async () => {
    const mockI18n = {
      changeLanguage: vi.fn().mockResolvedValue(undefined),
      t: (key: string) => key,
    };
    const mockRerender = vi.fn();

    const changes = {
      language_preference: { newValue: 'ro', oldValue: 'en' },
    };

    await handleStorageChange(changes, 'sync', mockI18n as any, mockRerender);

    expect(mockI18n.changeLanguage).toHaveBeenCalledWith('ro');
  });

  it('AC6: calls rerenderAllStrings after language change', async () => {
    const mockI18n = {
      changeLanguage: vi.fn().mockResolvedValue(undefined),
      t: (key: string) => key,
    };
    const mockRerender = vi.fn();

    const changes = {
      language_preference: { newValue: 'ru', oldValue: 'en' },
    };

    await handleStorageChange(changes, 'sync', mockI18n as any, mockRerender);

    expect(mockRerender).toHaveBeenCalledWith(mockI18n);
  });

  it('ignores changes outside sync storage area', async () => {
    const mockI18n = {
      changeLanguage: vi.fn().mockResolvedValue(undefined),
      t: (key: string) => key,
    };
    const mockRerender = vi.fn();

    const changes = {
      language_preference: { newValue: 'fr', oldValue: 'en' },
    };

    await handleStorageChange(changes, 'local', mockI18n as any, mockRerender);

    expect(document.documentElement.lang).toBe('en');
    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
    expect(mockRerender).not.toHaveBeenCalled();
  });

  it('ignores changes that do not include language_preference', async () => {
    const mockI18n = {
      changeLanguage: vi.fn().mockResolvedValue(undefined),
      t: (key: string) => key,
    };
    const mockRerender = vi.fn();

    const changes = {
      other_key: { newValue: 'something', oldValue: 'other' },
    };

    await handleStorageChange(changes, 'sync', mockI18n as any, mockRerender);

    expect(document.documentElement.lang).toBe('en');
    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
  });

  it('ignores changes where new locale is invalid', async () => {
    const mockI18n = {
      changeLanguage: vi.fn().mockResolvedValue(undefined),
      t: (key: string) => key,
    };
    const mockRerender = vi.fn();

    const changes = {
      language_preference: { newValue: 'zh', oldValue: 'en' },
    };

    await handleStorageChange(changes, 'sync', mockI18n as any, mockRerender);

    expect(mockI18n.changeLanguage).not.toHaveBeenCalled();
    expect(mockRerender).not.toHaveBeenCalled();
  });
});

describe('LOCALE_DISPLAY_NAMES completeness', () => {
  it('has a display name for every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(LOCALE_DISPLAY_NAMES[locale]).toBeDefined();
      expect(typeof LOCALE_DISPLAY_NAMES[locale]).toBe('string');
      expect(LOCALE_DISPLAY_NAMES[locale].length).toBeGreaterThan(0);
    }
  });

  it('includes expected native-script names', () => {
    expect(LOCALE_DISPLAY_NAMES['en']).toBe('English');
    expect(LOCALE_DISPLAY_NAMES['fr']).toBe('Français');
    expect(LOCALE_DISPLAY_NAMES['es']).toBe('Español');
    expect(LOCALE_DISPLAY_NAMES['ro']).toBe('Română');
    expect(LOCALE_DISPLAY_NAMES['ru']).toBe('Русский');
  });
});
