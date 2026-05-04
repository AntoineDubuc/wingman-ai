export type SupportedLocale = 'en' | 'fr' | 'es' | 'ro' | 'ru';

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['en', 'fr', 'es', 'ro', 'ru'] as const;

export const LOCALE_DISPLAY_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  ro: 'Română',
  ru: 'Русский',
} as const;

// Used in addLanguageInstruction() — HARDCODED, never from storage or bundles (security requirement)
export const LOCALE_LANGUAGE_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  ro: 'Romanian',
  ru: 'Russian',
} as const;

// Deepgram STT model per locale — nova-2 for RO because nova-3 does not support Romanian (ADR-007)
export const LOCALE_DEEPGRAM_MODEL: Record<SupportedLocale, string> = {
  en: 'nova-3',
  fr: 'nova-3',
  es: 'nova-3',
  ro: 'nova-2',
  ru: 'nova-3',
} as const;
