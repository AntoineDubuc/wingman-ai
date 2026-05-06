import { describe, it, expect } from 'vitest';
import { createI18nInstance, validateLocale } from '@shared/i18n-init';
import { SUPPORTED_LOCALES } from '@shared/i18n-types';

describe('createI18nInstance', () => {
  describe.each(SUPPORTED_LOCALES)('locale: %s', (locale) => {
    it('initializes successfully', () => {
      const i18n = createI18nInstance(locale);
      expect(i18n.isInitialized).toBe(true);
      expect(i18n.language).toBe(locale);
    });

    it('resolves existing keys', () => {
      const i18n = createI18nInstance(locale);
      // popup.start_session must exist in all locale bundles (BUILD-01 gate)
      const result = i18n.t('popup.start_session');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns key string for missing keys (not null)', () => {
      const i18n = createI18nInstance(locale);
      const result = i18n.t('completely.nonexistent.key');
      expect(result).toBe('completely.nonexistent.key');
    });
  });

  it('creates independent instances', () => {
    const a = createI18nInstance('en');
    const b = createI18nInstance('fr');
    expect(a).not.toBe(b);
    expect(a.language).toBe('en');
    expect(b.language).toBe('fr');
  });

  it('returns French string for fr instance popup.start_session', () => {
    const i18n = createI18nInstance('fr');
    const result = i18n.t('popup.start_session');
    expect(result).toBe('Démarrer la session');
  });

  it('returns English when lng override is en regardless of instance locale', () => {
    const i18n = createI18nInstance('fr');
    const result = i18n.t('popup.start_session', { lng: 'en' });
    expect(result).toBe('Start Session');
  });

  it('returns the key string for nonexistent key (not null or undefined)', () => {
    const i18n = createI18nInstance('en');
    const result = i18n.t('nonexistent.key');
    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
    expect(result).toBe('nonexistent.key');
  });
});

describe('validateLocale', () => {
  it('accepts all supported locales', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(validateLocale(locale)).toBe(locale);
    }
  });

  it('rejects unsupported locales', () => {
    expect(validateLocale('de')).toBeNull();
    expect(validateLocale('fr-CA')).toBeNull();
    expect(validateLocale('')).toBeNull();
    expect(validateLocale('EN')).toBeNull(); // case-sensitive
  });
});
