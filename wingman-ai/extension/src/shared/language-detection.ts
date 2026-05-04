import type { SupportedLocale } from './i18n-types';

const CYRILLIC_REGEX = /[Ѐ-ӿ]/;

function hasCyrillicContent(text: string): boolean {
  const alphaChars = text.replace(/[^a-zA-ZЀ-ӿ]/g, '');
  if (alphaChars.length < 10) return false;
  const cyrillicCount = (text.match(/[Ѐ-ӿ]/g) ?? []).length;
  return cyrillicCount / alphaChars.length > 0.1;
}

// Heuristic: returns true if response appears to be in the wrong language.
// Conservative — prefer false negatives over false positives.
// English always returns false (Latin charset shared with FR/ES/RO — unreliable).
export function isWrongLanguage(text: string, expectedLocale: SupportedLocale): boolean {
  if (expectedLocale === 'en') return false;

  if (expectedLocale === 'ru') {
    if (text.trim().length < 20) return false;
    return !hasCyrillicContent(text);
  }

  // fr, es, ro: expect Latin script — wrong if Cyrillic detected
  if (hasCyrillicContent(text)) return true;

  return false;
}

// Exported for testing — suppress unused variable warning
export { CYRILLIC_REGEX };
