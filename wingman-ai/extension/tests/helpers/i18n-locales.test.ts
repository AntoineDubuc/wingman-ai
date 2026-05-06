/**
 * Tests for Plan 12 Task 1: describeEachLocale harness.
 */

import { describe, it, expect } from 'vitest';
import { describeEachLocale } from './i18n-locales';
import { SUPPORTED_LOCALES } from '@shared/i18n-types';

const EXPECTED_LABEL_BY_LOCALE = {
  en: 'Language',
  fr: 'Langue',
  es: 'Idioma',
  ro: 'Limbă',
  ru: 'Язык',
} as const;

describe('describeEachLocale: contract', () => {
  it('AC-T1-1: exports describeEachLocale as a function', () => {
    expect(typeof describeEachLocale).toBe('function');
  });

  it('AC-T1-3: SUPPORTED_LOCALES has 5 locales', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(5);
  });
});

describeEachLocale('AC-T1-2: harness expansion', (locale, i18n) => {
  it('runs once per locale; each iteration has matching i18n', () => {
    expect(['en', 'fr', 'es', 'ro', 'ru']).toContain(locale);
    expect(i18n.language).toBe(locale);
  });
});

describeEachLocale('AC-T1-4: i18n resolves locale-specific values', (locale, i18n) => {
  it(`returns ${EXPECTED_LABEL_BY_LOCALE[locale]} for options.setup.language_picker_label`, () => {
    const label = i18n.t('options.setup.language_picker_label');
    expect(label).toBe(EXPECTED_LABEL_BY_LOCALE[locale]);
  });
});
