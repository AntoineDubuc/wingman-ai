import i18next, { type i18n } from 'i18next';
import type { SupportedLocale } from './i18n-types';
import { SUPPORTED_LOCALES } from './i18n-types';

// All locale bundles imported synchronously at module parse time (ADR-003, ADR-006)
// This is intentional — all 5 bundles are loaded before any context function runs
import enBundle from '../locales/en/translation.json';
import frBundle from '../locales/fr/translation.json';
import esBundle from '../locales/es/translation.json';
import roBundle from '../locales/ro/translation.json';
import ruBundle from '../locales/ru/translation.json';

const RESOURCES = {
  en: { translation: enBundle },
  fr: { translation: frBundle },
  es: { translation: esBundle },
  ro: { translation: roBundle },
  ru: { translation: ruBundle },
} as const;

export function createI18nInstance(locale: SupportedLocale): i18n {
  const instance = i18next.createInstance();
  instance.init({
    lng: locale,
    fallbackLng: 'en',
    resources: RESOURCES,
    ns: ['translation'],
    defaultNS: 'translation',
    returnNull: false,
    interpolation: {
      escapeValue: true, // NFR-SEC04 — XSS prevention, mandatory
    },
    missingKeyHandler: (_lngs: readonly string[], _ns: string, key: string) => {
      // Structured warning: distinguishes dev/runtime gaps from BUILD-01 coverage gaps
      console.warn(`[i18n] missing key | lngs=${_lngs.join(',')} ns=${_ns} key=${key}`);
    },
  });
  return instance;
}

export function validateLocale(raw: string): SupportedLocale | null {
  if (SUPPORTED_LOCALES.includes(raw as SupportedLocale)) {
    return raw as SupportedLocale;
  }
  return null;
}
