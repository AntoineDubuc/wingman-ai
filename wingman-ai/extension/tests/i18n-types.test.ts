import { SUPPORTED_LOCALES, LOCALE_DEEPGRAM_MODEL, LOCALE_LANGUAGE_NAMES, LOCALE_DISPLAY_NAMES } from '@shared/i18n-types';

test('SUPPORTED_LOCALES contains all 5 locales', () => {
  expect(SUPPORTED_LOCALES).toHaveLength(5);
  expect(SUPPORTED_LOCALES).toContain('en');
  expect(SUPPORTED_LOCALES).toContain('fr');
  expect(SUPPORTED_LOCALES).toContain('es');
  expect(SUPPORTED_LOCALES).toContain('ro');
  expect(SUPPORTED_LOCALES).toContain('ru');
});

test('LOCALE_DEEPGRAM_MODEL routes Romanian to nova-2', () => {
  expect(LOCALE_DEEPGRAM_MODEL['ro']).toBe('nova-2');
  expect(LOCALE_DEEPGRAM_MODEL['en']).toBe('nova-3');
  expect(LOCALE_DEEPGRAM_MODEL['fr']).toBe('nova-3');
});

test('all constants have entries for every SupportedLocale', () => {
  for (const locale of SUPPORTED_LOCALES) {
    expect(LOCALE_DISPLAY_NAMES[locale]).toBeTruthy();
    expect(LOCALE_LANGUAGE_NAMES[locale]).toBeTruthy();
    expect(LOCALE_DEEPGRAM_MODEL[locale]).toBeTruthy();
  }
});
