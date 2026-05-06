/**
 * Content script overlay localization helpers (F3-T3)
 *
 * Provides:
 *  - createOverlayI18nInstance: creates an i18n instance for the overlay context
 *  - initOverlayI18n: reads stored locale, sets lang on shadow host, returns i18n instance
 *  - handleOverlayStorageChange: chrome.storage.onChanged handler for language_preference updates
 *
 * Follows the same pattern as options-locale.ts (F3-T2).
 * The shadow host lang attribute satisfies RISK-T01 (Spike outcome A):
 * setting lang on the host element containing the shadow root is the most
 * ARIA-compatible approach per the spike.
 */

import type { i18n as I18n } from 'i18next';
import type { SupportedLocale } from '../shared/i18n-types';
import { createI18nInstance, validateLocale } from '../shared/i18n-init';
import { languagePreferenceService } from '../services/language-preference';

/**
 * Creates an i18n instance configured for the content script overlay context.
 *
 * Uses createInstance() for isolation from popup/options i18n instances (ADR-003).
 */
export function createOverlayI18nInstance(locale: SupportedLocale): I18n {
  return createI18nInstance(locale);
}

/**
 * Initializes overlay localization.
 *
 * Reads the stored language preference, sets the `lang` attribute on the
 * shadow host element (RISK-T01 Spike outcome A — sets lang on host element
 * that contains the shadow root, which is the most ARIA-compatible approach),
 * and returns an initialized i18n instance.
 *
 * @param shadowHost - The host element that contains the overlay Shadow DOM
 * @returns The i18n instance and the active locale
 */
export async function initOverlayI18n(
  shadowHost: HTMLElement,
): Promise<{ i18n: I18n; locale: SupportedLocale }> {
  const locale = await languagePreferenceService.getLanguage();

  // RISK-T01 Spike outcome A: set lang on the shadow host for ARIA/screen reader compatibility
  shadowHost.setAttribute('lang', locale);

  const i18n = createOverlayI18nInstance(locale);
  return { i18n, locale };
}

/**
 * chrome.storage.onChanged handler for language_preference key changes.
 *
 * Updates the shadow host lang attribute and triggers i18n.changeLanguage()
 * followed by an overlay refresh.
 *
 * FR-006 enforcement: language changes are blocked during active sessions.
 * The guard is at the read point (here) rather than the write point because
 * the content script receives storage changes regardless of UI state.
 *
 * @param changes      - The changes object from chrome.storage.onChanged
 * @param areaName     - Storage area name ('sync' | 'local' | 'session')
 * @param shadowHost   - The shadow host element whose lang attribute to update
 * @param i18n         - The active i18n instance to update
 * @param sessionActive - When true, language changes are ignored (FR-006)
 * @param refresh      - Callback to re-render all localized strings
 */
export async function handleOverlayStorageChange(
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  areaName: string,
  shadowHost: HTMLElement,
  i18n: I18n,
  sessionActive: boolean,
  refresh: (i18n: I18n) => void,
): Promise<void> {
  if (areaName !== 'sync') return;
  if (!('language_preference' in changes)) return;

  // FR-006: Do not change language during an active session.
  // The language picker in options is disabled during sessions (F3-T2 guard),
  // but this guard at the read point provides defense-in-depth.
  if (sessionActive) return;

  const newLocale = validateLocale(String(changes.language_preference.newValue ?? ''));
  if (!newLocale) return;

  // RISK-T01 Spike outcome A: update lang on shadow host
  shadowHost.setAttribute('lang', newLocale);

  await i18n.changeLanguage(newLocale);
  refresh(i18n);
}
