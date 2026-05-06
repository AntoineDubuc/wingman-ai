import type { SupportedLocale } from './i18n-types';
import { LOCALE_LANGUAGE_NAMES } from './i18n-types';

// Appends language instruction as final line of system prompt.
// No-ops for English to avoid unnecessary prompt inflation.
// LOCALE_LANGUAGE_NAMES is the ONLY source of language name strings — never from user input (security).
export function addLanguageInstruction(systemPrompt: string, locale: SupportedLocale): string {
  if (locale === 'en') return systemPrompt;
  return `${systemPrompt}\n\nRespond in ${LOCALE_LANGUAGE_NAMES[locale]} only.`;
}
