/**
 * Mic permission page localization helpers (F3-T4)
 *
 * Provides:
 *  - createMicPermissionI18nInstance: creates an i18n instance for the mic-permission context
 *  - renderMicPermissionStrings: injects translated strings into the mic-permission DOM elements
 *  - initMicPermissionPage: reads stored locale, sets document.documentElement.lang,
 *    renders all strings, and returns the i18n instance and locale
 *
 * Build approach: mic-permission.js is served via viteStaticCopy (not Vite-processed),
 * so ES module imports do not work directly in that file. This companion module is a
 * Vite-processed TypeScript entry point that mic-permission.html loads as a module script.
 * mic-permission.js handles the navigator.mediaDevices.getUserMedia permission request
 * separately; this module handles only the i18n/UI layer.
 *
 * Note: This page does NOT need a chrome.storage.onChanged listener — it is displayed
 * briefly during the permission grant flow and will not be visible long enough for a
 * language change. (Per F3-T4 spec.)
 *
 * Follows the companion module pattern established by:
 *   - options-locale.ts (F3-T2)
 *   - content-script-locale.ts (F3-T3)
 *   - popup-locale.ts (F3-T1)
 * i18n is isolated per context (ADR-003).
 */

import type { i18n as I18n } from 'i18next';
import type { SupportedLocale } from './shared/i18n-types';
import { createI18nInstance } from './shared/i18n-init';
import { languagePreferenceService } from './services/language-preference';

/**
 * Creates an i18n instance configured for the mic-permission page context.
 *
 * Uses createInstance() for isolation from other context i18n instances (ADR-003).
 */
export function createMicPermissionI18nInstance(locale: SupportedLocale): I18n {
  return createI18nInstance(locale);
}

/**
 * Injects translated strings into mic-permission DOM elements.
 *
 * Targets:
 *  - #permission-title — page heading
 *  - #permission-body  — explanatory body text
 *
 * Safe to call when elements are absent — no-ops per missing element.
 *
 * @param i18n - Initialized i18next instance for the current locale
 */
export function renderMicPermissionStrings(i18n: I18n): void {
  const titleEl = document.querySelector('#permission-title');
  if (titleEl) {
    titleEl.textContent = i18n.t('mic_permission.title');
  }

  const bodyEl = document.querySelector('#permission-body');
  if (bodyEl) {
    bodyEl.textContent = i18n.t('mic_permission.body');
  }
}

/**
 * Initializes mic-permission page i18n.
 *
 * Reads the stored language preference, sets document.documentElement.lang
 * (NFR-A11Y-01), renders all page strings via renderMicPermissionStrings(),
 * and returns the initialized i18n instance and resolved locale.
 *
 * @returns The i18n instance and the active locale
 */
export async function initMicPermissionPage(): Promise<{
  i18n: I18n;
  locale: SupportedLocale;
}> {
  const locale = await languagePreferenceService.getLanguage();

  // NFR-A11Y-01: set lang attribute on document element
  document.documentElement.setAttribute('lang', locale);

  const i18n = createMicPermissionI18nInstance(locale);
  renderMicPermissionStrings(i18n);

  return { i18n, locale };
}

// Auto-initialize when loaded as the browser entry point for mic-permission.html.
// In test environments, DOMContentLoaded has already fired before module import,
// so this listener never executes — tests call initMicPermissionPage() directly.
document.addEventListener('DOMContentLoaded', () => {
  initMicPermissionPage().catch((err) => {
    console.error('[i18n] mic-permission page init failed:', err);
  });
});
