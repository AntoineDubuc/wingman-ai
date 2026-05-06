/**
 * Popup localization helpers (F3-T1)
 *
 * Provides:
 *  - createPopupI18nInstance: creates an i18n instance for the popup context
 *  - initPopupI18n: reads stored locale, sets document.documentElement.lang,
 *    renders all popup strings, and returns the i18n instance
 *  - renderPopupStrings: injects t() values into popup DOM elements
 *  - handlePopupStorageChange: chrome.storage.onChanged handler for
 *    language_preference updates with FR-006 session-lock enforcement
 *
 * Follows the companion module pattern established by options-locale.ts (F3-T2)
 * and content-script-locale.ts (F3-T3). i18n is isolated per context (ADR-003).
 */

import type { i18n as I18n } from 'i18next';
import type { SupportedLocale } from '../shared/i18n-types';
import { createI18nInstance, validateLocale } from '../shared/i18n-init';
import { languagePreferenceService } from '../services/language-preference';

/**
 * Creates an i18n instance configured for the popup context.
 *
 * Uses createInstance() for isolation from options/overlay i18n instances (ADR-003).
 */
export function createPopupI18nInstance(locale: SupportedLocale): I18n {
  return createI18nInstance(locale);
}

/**
 * Injects translated strings into popup DOM elements.
 *
 * Replaces hardcoded English text with t() calls for:
 *  - session button (start/stop state — defaults to start/idle state)
 *  - session status text (idle state on initial render)
 *  - API status text (via data attribute or existing element lookup)
 *
 * This function is idempotent and safe to call after each language change.
 *
 * @param i18n - Initialized i18next instance for the current locale
 */
export function renderPopupStrings(i18n: I18n): void {
  // Walk all elements marked with data-i18n and apply translations.
  // Supports multi-attribute targets via space-separated `data-i18n-attr`
  // (e.g., `data-i18n-attr="title aria-label"`). Missing keys leave the
  // static fallback in place (i18next returns the key on miss).
  const elements = document.querySelectorAll<HTMLElement>('[data-i18n]');
  for (const el of elements) {
    const key = el.dataset['i18n'];
    if (!key) continue;
    const translated = i18n.t(key);
    if (translated === key) continue;
    const attrSpec = el.dataset['i18nAttr'];
    if (attrSpec) {
      for (const attr of attrSpec.split(/\s+/).filter(Boolean)) {
        el.setAttribute(attr, translated);
      }
    } else {
      el.textContent = translated;
    }
  }

  const sessionBtn = document.getElementById('session-btn');
  if (sessionBtn) {
    // Render idle/start state by default; updateStatus() in PopupController
    // will override with stop_session when session becomes active
    sessionBtn.textContent = i18n.t('popup.start_session');
  }

  const sessionStatusText = document.querySelector('#session-status .status-text');
  if (sessionStatusText) {
    sessionStatusText.textContent = i18n.t('popup.status.idle');
  }

  // API status text — seeded here; PopupController.updateApiKeyStatus() overrides
  // after checkApiKeys() completes (called during init sequence).
}

/**
 * Initializes the popup i18n instance.
 *
 * Reads the stored language preference, sets document.documentElement.lang
 * (NFR-A11Y-01), renders all popup strings via renderPopupStrings(), and
 * returns the initialized i18n instance and resolved locale.
 *
 * @returns The i18n instance and the active locale
 */
export async function initPopupI18n(): Promise<{ i18n: I18n; locale: SupportedLocale }> {
  const locale = await languagePreferenceService.getLanguage();

  // NFR-A11Y-01: set lang attribute on document element
  document.documentElement.setAttribute('lang', locale);

  const i18n = createPopupI18nInstance(locale);
  renderPopupStrings(i18n);

  return { i18n, locale };
}

/**
 * chrome.storage.onChanged handler for language_preference key changes.
 *
 * Updates document.documentElement.lang and triggers i18n.changeLanguage()
 * followed by a full re-render of popup strings.
 *
 * FR-006 enforcement: language changes are blocked during active sessions.
 * The guard is at the read point (here) rather than the write point because
 * the popup receives storage changes regardless of session state.
 *
 * @param changes       - The changes object from chrome.storage.onChanged
 * @param areaName      - Storage area name ('sync' | 'local' | 'session')
 * @param i18n          - The active i18n instance to update
 * @param sessionActive - When true, language changes are ignored (FR-006)
 * @param rerender      - Callback to re-render all localized popup strings
 */
export async function handlePopupStorageChange(
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  areaName: string,
  i18n: I18n,
  sessionActive: boolean,
  rerender: (i18n: I18n) => void,
): Promise<void> {
  if (areaName !== 'sync') return;
  if (!('language_preference' in changes)) return;

  // FR-006: Do not change language during an active session.
  if (sessionActive) return;

  const newLocale = validateLocale(String(changes.language_preference.newValue ?? ''));
  if (!newLocale) return;

  // NFR-A11Y-01: update lang attribute on document element
  document.documentElement.setAttribute('lang', newLocale);

  await i18n.changeLanguage(newLocale);
  rerender(i18n);
}
