/**
 * Try Again button for wrong-language suggestion detection (F5-T1)
 *
 * When isWrongLanguage() detects the LLM response is in the wrong language,
 * this module surfaces a localized "Try Again" button on the suggestion bubble.
 *
 * Companion module pattern follows content-script-locale.ts (F3-T3).
 */

import type { SupportedLocale } from '../shared/i18n-types';
import { isWrongLanguage } from '../shared/language-detection';
import { createI18nInstance } from '../shared/i18n-init';

const TRY_AGAIN_BTN_ID = 'try-again-btn';
const TRY_AGAIN_I18N_KEY = 'overlay.suggestion.try_again';

// Module-level cache — one i18n instance per locale (matches singleton pattern from F3-T3)
const i18nCache = new Map<string, ReturnType<typeof createI18nInstance>>();

/**
 * Conditionally shows a localized "Try Again" button on a suggestion bubble.
 *
 * If isWrongLanguage(text, locale) returns true, appends (or reveals) a button
 * with text t('overlay.suggestion.try_again'). Clicking the button sends a
 * RETRY_SUGGESTION message to the service worker and hides the button.
 *
 * If isWrongLanguage returns false, no button is added (AC3, AC4).
 *
 * @param text        - The suggestion text from the LLM response
 * @param locale      - The active locale (SupportedLocale)
 * @param bubble      - The suggestion bubble DOM element to attach the button to
 */
export function showTryAgainIfNeeded(
  text: string,
  locale: SupportedLocale,
  bubble: HTMLElement,
): void {
  if (!isWrongLanguage(text, locale)) {
    return;
  }

  let i18n = i18nCache.get(locale);
  if (!i18n) {
    i18n = createI18nInstance(locale);
    i18nCache.set(locale, i18n);
  }
  const label = i18n.t(TRY_AGAIN_I18N_KEY);

  // Reuse existing button if present (idempotent)
  let btn = bubble.querySelector<HTMLButtonElement>(`#${TRY_AGAIN_BTN_ID}`);
  if (!btn) {
    btn = document.createElement('button');
    btn.id = TRY_AGAIN_BTN_ID;
    btn.className = 'try-again-btn';
    bubble.appendChild(btn);
  }

  btn.textContent = label;
  btn.style.display = 'block';

  btn.onclick = () => {
    try {
      chrome.runtime.sendMessage({ type: 'RETRY_SUGGESTION' });
    } catch {
      // Extension context may be invalid — fail silently
    }
    if (btn) btn.style.display = 'none';
  };
}
