import { type SupportedLocale, SUPPORTED_LOCALES } from '../shared/i18n-types';
import { validateLocale } from '../shared/i18n-init';

function mapBrowserLocaleToSupported(uiLanguage: string): SupportedLocale {
  const primaryTag = (uiLanguage.split('-')[0] ?? '').toLowerCase();
  if (SUPPORTED_LOCALES.includes(primaryTag as SupportedLocale)) {
    return primaryTag as SupportedLocale;
  }
  return 'en';
}

async function readFromSync(): Promise<SupportedLocale | null> {
  try {
    const result = await chrome.storage.sync.get('language_preference');
    const raw = result.language_preference;
    if (!raw) return null;
    return validateLocale(String(raw));
  } catch {
    return null;
  }
}

async function readFromLocal(): Promise<SupportedLocale | null> {
  try {
    const result = await chrome.storage.local.get('language_preference');
    const raw = result.language_preference;
    if (!raw) return null;
    return validateLocale(String(raw));
  } catch {
    return null;
  }
}

class LanguagePreferenceServiceImpl {
  async getLanguage(): Promise<SupportedLocale> {
    // Kill switch: forces English during incidents
    // Activated via: chrome.storage.local.set({ locale_disabled: true })
    try {
      const kill = await chrome.storage.local.get('locale_disabled');
      if (kill.locale_disabled === true) return 'en';
    } catch { /* kill switch failure must not block normal flow */ }

    // Tier 1: chrome.storage.sync (cross-device preference)
    const fromSync = await readFromSync();
    if (fromSync) return fromSync;

    // Tier 2: chrome.storage.local (fallback if sync disabled)
    const fromLocal = await readFromLocal();
    if (fromLocal) return fromLocal;

    // Tier 3: Browser UI language auto-detection
    const uiLanguage = chrome.i18n.getUILanguage();
    return this.detectFromBrowser(uiLanguage);
  }

  async setLanguage(locale: SupportedLocale): Promise<void> {
    try {
      await chrome.storage.sync.set({ language_preference: locale });
    } catch (syncError) {
      console.warn('[i18n] storage.sync unavailable, using local fallback:', syncError);
      try {
        await chrome.storage.local.set({ language_preference: locale });
      } catch (localError) {
        console.warn('[i18n] storage.local also unavailable:', localError);
      }
    }
  }

  detectFromBrowser(uiLanguage: string): SupportedLocale {
    return mapBrowserLocaleToSupported(uiLanguage);
  }
}

export const languagePreferenceService = new LanguagePreferenceServiceImpl();
