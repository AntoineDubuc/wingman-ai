import type { SupportedLocale } from './i18n-types';

const CYRILLIC_REGEX = /[Ѐ-ӿ]/;

function hasCyrillicContent(text: string): boolean {
  const alphaChars = text.replace(/[^a-zA-ZЀ-ӿ]/g, '');
  if (alphaChars.length < 10) return false;
  const cyrillicCount = (text.match(/[Ѐ-ӿ]/g) ?? []).length;
  return cyrillicCount / alphaChars.length > 0.1;
}

// Plan 10: locale-specific diacritic / script signatures used as a positive
// signal. A response of any reasonable length in fr/es/ro is overwhelmingly
// likely to contain at least one of these characters; their total absence is
// the strongest cheap signal that the LLM responded in English.
//
// Exported for unit tests.
export const LOCALE_SIGNATURE_PATTERNS: Record<Exclude<SupportedLocale, 'en' | 'ru'>, RegExp> = {
  // French: accented vowels, ç, œ, æ
  fr: /[àâäçèéêëîïôöùûüÿœæÀÂÄÇÈÉÊËÎÏÔÖÙÛÜŸŒÆ]/,
  // Spanish: ñ, accented vowels, ¿/¡
  es: /[áéíóúüñ¿¡ÁÉÍÓÚÜÑ]/,
  // Romanian: comma-below ș/ț, breve ă, circumflex â/î (covers both standards)
  ro: /[ăâîșțĂÂÎȘȚşţŞŢ]/,
};

// English-specific function-word density helps distinguish a fully-English
// response from a French/Spanish/Romanian one when no diacritics are present
// (e.g., a single-word reply like "Yes." won't match a locale signature but
// also has no English-specific signal). Returns true if the text reads as
// substantially English by common-word density.
function looksLikeEnglish(text: string): boolean {
  const tokens = text.toLowerCase().match(/\b[a-z]+\b/g) ?? [];
  if (tokens.length < 8) return false; // not enough signal
  const englishStopwords = new Set([
    'the', 'and', 'a', 'an', 'of', 'to', 'in', 'is', 'it', 'that',
    'this', 'with', 'for', 'on', 'are', 'was', 'be', 'as', 'have',
    'not', 'or', 'you', 'your',
  ]);
  let stopwordCount = 0;
  for (const t of tokens) if (englishStopwords.has(t)) stopwordCount++;
  return stopwordCount / tokens.length > 0.15;
}

// Heuristic: returns true if response appears to be in the wrong language.
// Plan 10 fix: fr/es/ro now use a positive locale signature + English
// stopword density as a fallback (was: only Cyrillic detection, which never
// fired on Latin-script-only text).
export function isWrongLanguage(text: string, expectedLocale: SupportedLocale): boolean {
  if (expectedLocale === 'en') return false;

  if (expectedLocale === 'ru') {
    if (text.trim().length < 20) return false;
    return !hasCyrillicContent(text);
  }

  // fr, es, ro: Cyrillic content is always wrong (defensive)
  if (hasCyrillicContent(text)) return true;

  // Skip very short replies (single-word affirmations etc. — too little signal)
  if (text.trim().length < 30) return false;

  const sigPattern = LOCALE_SIGNATURE_PATTERNS[expectedLocale];
  // If text contains the locale's diacritic signature, it's plausibly correct.
  if (sigPattern.test(text)) return false;

  // No locale signature found AND text reads like English → flag as wrong.
  return looksLikeEnglish(text);
}

// Exported for testing — suppress unused variable warning
export { CYRILLIC_REGEX };
