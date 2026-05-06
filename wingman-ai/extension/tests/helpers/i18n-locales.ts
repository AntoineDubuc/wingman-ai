/**
 * Locale-parameterized test harness for Plan 12 (NFR-TEST-01).
 *
 * Wraps a describe block in a per-locale loop, providing each iteration with
 * a real i18n instance bound to that locale. Plans 4-11 use this to run the
 * same behavioral test against all 5 supported locales.
 *
 * @example
 * import { describeEachLocale } from '../helpers/i18n-locales';
 *
 * describeEachLocale('popup renders', (locale, i18n) => {
 *   it('shows the start-session label in the active locale', () => {
 *     expect(i18n.t('popup.start_session')).toBeTruthy();
 *   });
 * });
 */

import { describe } from 'vitest';
import type { i18n as I18n } from 'i18next';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@shared/i18n-types';
import { createI18nInstance } from '@shared/i18n-init';

export function describeEachLocale(
  name: string,
  body: (locale: SupportedLocale, i18n: I18n) => void,
): void {
  for (const locale of SUPPORTED_LOCALES) {
    describe(`${name} [locale=${locale}]`, () => {
      const i18n = createI18nInstance(locale);
      body(locale, i18n);
    });
  }
}
