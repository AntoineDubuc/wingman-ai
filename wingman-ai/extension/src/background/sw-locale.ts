/**
 * SW Locale Rehydration Module (F2-T1)
 *
 * Manages the `activeLocale` module-level variable for the Service Worker.
 *
 * Key design constraints (RISK-T02):
 * - `rehydrateActiveLocale()` MUST be awaited BEFORE any message handler is registered.
 *   This ensures the SW never processes an LLM call with a stale 'en' default when the
 *   user has set a different language preference.
 * - `registerLocaleOnChanged()` registers the storage.onChanged listener ONCE at
 *   module level (not inside message handlers) to receive live preference updates.
 *
 * Note: languagePreferenceService is NOT used here — the SW reads storage directly
 * to avoid the service's browser-locale fallback chain in the SW context.
 */

import { type SupportedLocale } from '../shared/i18n-types';
import { validateLocale } from '../shared/i18n-init';

// Language preference for LLM injection and Deepgram model routing.
// Rehydrated from chrome.storage.sync on every SW wake (non-persistent MV3 SW).
// MUST be set before message handlers fire — see ensureLocaleRehydrated() in service-worker.ts.
let activeLocale: SupportedLocale = 'en';

/**
 * Returns the current active locale for this SW instance.
 * Use this in LLM call sites (gemini-client, chat-pipeline, etc.)
 */
export function getActiveLocale(): SupportedLocale {
  return activeLocale;
}

/**
 * Resets activeLocale to 'en' default.
 * Used only in tests to isolate state between test cases.
 * Do NOT call in production code.
 */
export function resetActiveLocale(): void {
  activeLocale = 'en';
}

/**
 * Reads language_preference from chrome.storage.sync and sets activeLocale.
 *
 * CRITICAL: Await this BEFORE registering any chrome.runtime.onMessage listeners.
 * If a message arrives before this completes, LLM calls will use 'en' even if
 * the user has set a different locale.
 *
 * On failure (MDM enterprise policy blocking storage.sync), keeps 'en' default.
 */
export async function rehydrateActiveLocale(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get('language_preference');
    const validated = validateLocale(String(result.language_preference ?? ''));
    if (validated) {
      activeLocale = validated;
    }
    // If null: keep 'en' default — safe fallback, next getLanguage() will auto-detect
  } catch {
    // storage.sync unavailable (enterprise MDM) — keep 'en' default
  }
}

/**
 * Registers a chrome.storage.onChanged listener that keeps activeLocale in sync
 * with user preference changes made while the SW is alive.
 *
 * MUST be called once at module level (not inside a message handler or callback).
 * The listener is idempotent with respect to invalid locale values (ignored).
 */
export function registerLocaleOnChanged(): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;
    if (!('language_preference' in changes)) return;
    const newLocale = validateLocale(String(changes.language_preference.newValue ?? ''));
    if (newLocale) {
      activeLocale = newLocale;
    }
  });
}
