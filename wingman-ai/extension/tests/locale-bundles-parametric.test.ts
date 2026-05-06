/**
 * Tests for Plan 12 Task 2: parametric demo of describeEachLocale.
 *
 * Asserts per-locale invariants on the bundles by running the same test
 * block once per supported locale. Plans 4-11 will use this same pattern
 * for surface-level i18n tests.
 */

import { it, expect } from 'vitest';
import { describeEachLocale } from './helpers/i18n-locales';

const REQUIRED_KEYS = [
  'options.setup.language_picker_label',
  'options.setup.language_locked_tooltip',
  'options.upgrade_banner.title',
  'options.upgrade_banner.body',
  'options.upgrade_banner.dismiss_button',
] as const;

describeEachLocale('locale bundle smoke', (locale, i18n) => {
  it('AC-T2-1: i18n is bound to this locale', () => {
    expect(i18n.language).toBe(locale);
  });

  it.each(REQUIRED_KEYS)('AC-T2-2: %s resolves to a non-empty string', (key) => {
    const value = i18n.t(key);
    expect(value).toBeTruthy();
    expect(typeof value).toBe('string');
    expect(value.length).toBeGreaterThan(0);
  });

  if (locale !== 'en') {
    it('AC-T2-3: language_picker_label is NOT identical to English (proves real translation)', () => {
      const localeValue = i18n.t('options.setup.language_picker_label');
      // Bind a separate English instance via the same harness contract
      // (avoids relying on a parallel-test mutation surface).
      // Easier approach: hard-code the known-English value, since the harness
      // already proves the en path returns 'Language'.
      const ENGLISH_VALUE = 'Language';
      expect(localeValue).not.toBe(ENGLISH_VALUE);
    });
  }
});
