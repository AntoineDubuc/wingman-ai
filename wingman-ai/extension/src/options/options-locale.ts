/**
 * Options page localization helpers (F3-T2)
 *
 * Provides:
 *  - renderLanguagePicker: renders the language selector into #language-picker-container
 *  - initOptionsI18n: reads stored locale, sets document.documentElement.lang, returns i18n instance
 *  - handleStorageChange: chrome.storage.onChanged handler for language_preference updates
 */

import type { i18n as I18n } from 'i18next';
import { SUPPORTED_LOCALES, LOCALE_DISPLAY_NAMES, type SupportedLocale } from '../shared/i18n-types';
import { createI18nInstance, validateLocale } from '../shared/i18n-init';
import { languagePreferenceService } from '../services/language-preference';

/**
 * Renders the language picker UI into #language-picker-container.
 *
 * @param i18n        - Initialized i18next instance for the current locale
 * @param currentLocale - The locale to mark as selected
 * @param sessionActive - When true, the picker is disabled (FR-008, FR-009)
 */
export function renderLanguagePicker(
  i18n: I18n,
  currentLocale: SupportedLocale,
  sessionActive: boolean,
): void {
  const container = document.querySelector('#language-picker-container');
  if (!container) return;
  container.replaceChildren();

  const label = document.createElement('label');
  label.textContent = i18n.t('options.setup.language_picker_label');
  label.htmlFor = 'language-picker';

  const select = document.createElement('select');
  select.id = 'language-picker';
  select.disabled = sessionActive;
  if (sessionActive) {
    select.title = i18n.t('options.setup.language_locked_tooltip');
  }

  for (const locale of SUPPORTED_LOCALES) {
    const option = document.createElement('option');
    option.value = locale;
    option.textContent = LOCALE_DISPLAY_NAMES[locale];
    option.selected = locale === currentLocale;
    select.appendChild(option);
  }

  select.addEventListener('change', (e) => {
    const newLocale = validateLocale((e.target as HTMLSelectElement).value);
    if (newLocale) {
      languagePreferenceService.setLanguage(newLocale).catch((err) => {
        console.warn('[i18n] Failed to persist language preference:', err);
      });
    }
  });

  container.appendChild(label);
  container.appendChild(select);
}

/**
 * Initializes the options page i18n instance.
 * Reads the stored locale preference, sets document.documentElement.lang,
 * and returns an initialized i18n instance.
 */
export async function initOptionsI18n(): Promise<{ i18n: I18n; locale: SupportedLocale }> {
  const locale = await languagePreferenceService.getLanguage();
  document.documentElement.setAttribute('lang', locale);
  const i18n = createI18nInstance(locale);
  return { i18n, locale };
}

/**
 * chrome.storage.onChanged handler for language_preference key changes.
 *
 * Updates document.documentElement.lang and triggers i18n.changeLanguage()
 * followed by a full re-render.
 *
 * @param changes   - The changes object from chrome.storage.onChanged
 * @param areaName  - Storage area name ('sync' | 'local' | 'session')
 * @param i18n      - The active i18n instance to update
 * @param rerender  - Callback to re-render all localized strings
 */
export async function handleStorageChange(
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  areaName: string,
  i18n: I18n,
  rerender: (i18n: I18n) => void,
): Promise<void> {
  if (areaName !== 'sync') return;
  if (!('language_preference' in changes)) return;

  const newLocale = validateLocale(String(changes.language_preference.newValue ?? ''));
  if (!newLocale) return;

  document.documentElement.setAttribute('lang', newLocale);
  await i18n.changeLanguage(newLocale);
  rerender(i18n);
}
