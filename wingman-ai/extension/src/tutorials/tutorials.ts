// Theme toggle functionality for tutorials page
import { createI18nInstance } from '../shared/i18n-init';
import { languagePreferenceService } from '../services/language-preference';
import type { SupportedLocale } from '../shared/i18n-types';

const toggle = document.getElementById('theme-toggle');

// Load saved theme
chrome.storage.local.get(['theme'], (result) => {
  if (result.theme) {
    document.documentElement.setAttribute('data-theme', result.theme);
  }
});

// Toggle theme on click
toggle?.addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  let newTheme: string;
  if (currentTheme === 'dark') {
    newTheme = 'light';
  } else if (currentTheme === 'light') {
    newTheme = 'dark';
  } else {
    newTheme = prefersDark ? 'light' : 'dark';
  }

  document.documentElement.setAttribute('data-theme', newTheme);
  chrome.storage.local.set({ theme: newTheme });
});

/**
 * Initialises i18n for the tutorial index page and injects the OQ-02
 * English-only notice banner for non-English locales.
 *
 * Exported for testability.
 */
export async function initTutorialsI18n(): Promise<{ i18n: ReturnType<typeof createI18nInstance>; locale: SupportedLocale }> {
  const locale = await languagePreferenceService.getLanguage();
  const i18n = createI18nInstance(locale);

  // Set the HTML lang attribute to the active locale
  document.documentElement.setAttribute('lang', locale);

  // Show the English-only banner for non-English locales (OQ-02 mitigation)
  if (locale !== 'en') {
    const banner = document.getElementById('english-only-banner');
    if (banner) {
      banner.textContent = i18n.t('tutorials.english_only_banner');
      banner.style.display = 'block';
    }
  }

  return { i18n, locale };
}

// Initialise on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  initTutorialsI18n();
});
