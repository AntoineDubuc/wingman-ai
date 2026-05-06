import { isWrongLanguage } from '../src/shared/language-detection';

describe('isWrongLanguage', () => {
  it('always returns false for English locale', () => {
    expect(isWrongLanguage('Hello', 'en')).toBe(false);
    expect(isWrongLanguage('Bonjour', 'en')).toBe(false);
    // Even Cyrillic in English locale is false
    expect(isWrongLanguage('Привет', 'en')).toBe(false);
  });

  it('detects non-Cyrillic when Russian expected', () => {
    expect(isWrongLanguage('This is an English response with enough content', 'ru')).toBe(true);
  });

  it('accepts Cyrillic for Russian', () => {
    // "Это ответ на русском языке"
    const russianText = 'Это ответ на русском языке';
    expect(isWrongLanguage(russianText, 'ru')).toBe(false);
  });

  it('detects Cyrillic contamination in Latin-expected locales', () => {
    // "Это русский текст который не должен быть здесь"
    const cyrillicText = 'Это русский текст который не должен быть здесь';
    expect(isWrongLanguage(cyrillicText, 'fr')).toBe(true);
    expect(isWrongLanguage(cyrillicText, 'es')).toBe(true);
    expect(isWrongLanguage(cyrillicText, 'ro')).toBe(true);
  });

  it('returns false for short responses regardless of locale', () => {
    expect(isWrongLanguage('Hi', 'ru')).toBe(false);
    expect(isWrongLanguage('Ok', 'fr')).toBe(false);
  });

  it('accepts normal French text', () => {
    expect(isWrongLanguage('Bonjour le monde, comment allez-vous?', 'fr')).toBe(false);
  });
});
