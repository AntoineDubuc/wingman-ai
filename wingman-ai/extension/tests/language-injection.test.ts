import { addLanguageInstruction } from '../src/shared/language-injection';
import { SUPPORTED_LOCALES } from '../src/shared/i18n-types';

describe('addLanguageInstruction', () => {
  it('is a no-op for English', () => {
    const prompt = 'You are a helpful assistant.';
    expect(addLanguageInstruction(prompt, 'en')).toBe(prompt);
  });

  it('appends French instruction correctly', () => {
    const result = addLanguageInstruction('System prompt.', 'fr');
    expect(result).toBe('System prompt.\n\nRespond in French only.');
  });

  it('appends Russian instruction correctly', () => {
    const result = addLanguageInstruction('System prompt.', 'ru');
    expect(result).toBe('System prompt.\n\nRespond in Russian only.');
  });

  it('appends Romanian instruction correctly', () => {
    const result = addLanguageInstruction('System prompt.', 'ro');
    expect(result).toBe('System prompt.\n\nRespond in Romanian only.');
  });

  it('instruction is always the last line', () => {
    const multilinePrompt = 'Line 1.\nLine 2.\nLine 3.';
    const result = addLanguageInstruction(multilinePrompt, 'es');
    expect(result.endsWith('\n\nRespond in Spanish only.')).toBe(true);
  });

  it('non-English locales all produce non-empty additions', () => {
    const base = 'Prompt.';
    for (const locale of SUPPORTED_LOCALES) {
      const result = addLanguageInstruction(base, locale);
      if (locale === 'en') {
        expect(result).toBe(base);
      } else {
        expect(result.length).toBeGreaterThan(base.length);
        expect(result).toContain('Respond in');
        expect(result).toContain('only.');
      }
    }
  });
});
