/**
 * Tests for F5-T1: Wrong-Language "Try Again" Button
 *
 * Verifies that a localized "Try Again" button appears on suggestion cards
 * when isWrongLanguage() returns true, and disappears after click.
 *
 * @vitest-environment jsdom
 *
 * Acceptance Criteria:
 * AC1. "Try Again" button appears when isWrongLanguage() returns true
 * AC2. "Try Again" button text is localized: t('overlay.suggestion.try_again')
 * AC3. Button does NOT appear for English locale
 * AC4. Button does NOT appear when suggestion is in the correct language
 * AC5. Clicking "Try Again" triggers a new suggestion request (RETRY_SUGGESTION)
 * AC6. Button disappears after click
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock isWrongLanguage ──
vi.mock('../src/shared/language-detection', () => ({
  isWrongLanguage: vi.fn().mockReturnValue(false),
  CYRILLIC_REGEX: /[Ѐ-ӿ]/,
}));

// ── Mock language preference service ──
vi.mock('../src/services/language-preference', () => ({
  languagePreferenceService: {
    getLanguage: vi.fn().mockResolvedValue('en'),
    setLanguage: vi.fn().mockResolvedValue(undefined),
    detectFromBrowser: vi.fn().mockReturnValue('en'),
  },
}));

// ── Mock i18n-init ──
vi.mock('../src/shared/i18n-init', () => ({
  createI18nInstance: vi.fn((locale: string) => ({
    t: (key: string) => {
      const map: Record<string, Record<string, string>> = {
        fr: { 'overlay.suggestion.try_again': 'Réessayer' },
        es: { 'overlay.suggestion.try_again': 'Intentar de nuevo' },
        ru: { 'overlay.suggestion.try_again': 'Попробовать снова' },
        en: { 'overlay.suggestion.try_again': 'Try Again' },
      };
      return map[locale]?.[key] ?? key;
    },
    language: locale,
    isInitialized: true,
    changeLanguage: vi.fn().mockResolvedValue(undefined),
  })),
  validateLocale: vi.fn((raw: string) => {
    const supported = ['en', 'fr', 'es', 'ro', 'ru'];
    return supported.includes(raw) ? raw : null;
  }),
}));

import { isWrongLanguage } from '../src/shared/language-detection';
import { languagePreferenceService } from '../src/services/language-preference';
import { showTryAgainIfNeeded } from '../src/content/try-again-locale';

describe('F5-T1: Try Again button — wrong language detection', () => {
  let container: HTMLElement;
  let suggestionBubble: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chrome.runtime.sendMessage mock
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockReset();

    // Build a minimal suggestion bubble in the DOM
    container = document.createElement('div');
    container.id = 'timeline';
    document.body.appendChild(container);

    suggestionBubble = document.createElement('div');
    suggestionBubble.className = 'bubble wingman answer';
    container.appendChild(suggestionBubble);
  });

  afterEach(() => {
    container.remove();
  });

  // AC1: Try Again button appears when isWrongLanguage() returns true
  it('AC1: shows Try Again button when isWrongLanguage returns true', async () => {
    vi.mocked(isWrongLanguage).mockReturnValue(true);
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('fr');

    await showTryAgainIfNeeded(
      'This is an English response.',
      'fr',
      suggestionBubble,
    );

    const btn = suggestionBubble.querySelector<HTMLButtonElement>('#try-again-btn');
    expect(btn).not.toBeNull();
    expect(btn!.style.display).toBe('block');
  });

  // AC2: Button text is localized t('overlay.suggestion.try_again')
  it('AC2: button text is localized via t("overlay.suggestion.try_again")', async () => {
    vi.mocked(isWrongLanguage).mockReturnValue(true);
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('fr');

    await showTryAgainIfNeeded(
      'This is an English response.',
      'fr',
      suggestionBubble,
    );

    const btn = suggestionBubble.querySelector<HTMLButtonElement>('#try-again-btn');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe('Réessayer');
  });

  // AC3: Button does NOT appear for English locale
  it('AC3: button does not appear for English locale', async () => {
    vi.mocked(isWrongLanguage).mockReturnValue(false); // always false for 'en'
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('en');

    await showTryAgainIfNeeded(
      'This is correct English.',
      'en',
      suggestionBubble,
    );

    const btn = suggestionBubble.querySelector<HTMLButtonElement>('#try-again-btn');
    expect(!btn || btn.style.display === 'none').toBe(true);
  });

  // AC4: Button does NOT appear when suggestion is in the correct language
  it('AC4: button does not appear when suggestion is in correct language', async () => {
    vi.mocked(isWrongLanguage).mockReturnValue(false);
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('fr');

    await showTryAgainIfNeeded(
      'Bonjour, comment puis-je vous aider?',
      'fr',
      suggestionBubble,
    );

    const btn = suggestionBubble.querySelector<HTMLButtonElement>('#try-again-btn');
    expect(!btn || btn.style.display === 'none').toBe(true);
  });

  // AC5: Clicking "Try Again" triggers a new suggestion request
  it('AC5: clicking Try Again sends RETRY_SUGGESTION message', async () => {
    vi.mocked(isWrongLanguage).mockReturnValue(true);
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('ru');

    await showTryAgainIfNeeded(
      'This is an English response.',
      'ru',
      suggestionBubble,
    );

    const btn = suggestionBubble.querySelector<HTMLButtonElement>('#try-again-btn');
    expect(btn).not.toBeNull();
    btn!.click();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'RETRY_SUGGESTION' });
  });

  // AC6: Button disappears after click
  it('AC6: button disappears (display: none) after click', async () => {
    vi.mocked(isWrongLanguage).mockReturnValue(true);
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('ru');

    await showTryAgainIfNeeded(
      'This is an English response.',
      'ru',
      suggestionBubble,
    );

    const btn = suggestionBubble.querySelector<HTMLButtonElement>('#try-again-btn');
    expect(btn).not.toBeNull();
    expect(btn!.style.display).toBe('block');

    btn!.click();
    expect(btn!.style.display).toBe('none');
  });

  // Extra: multiple calls reuse the same button element (idempotent)
  it('reuses existing #try-again-btn on repeated calls', async () => {
    vi.mocked(isWrongLanguage).mockReturnValue(true);
    vi.mocked(languagePreferenceService.getLanguage).mockResolvedValue('fr');

    await showTryAgainIfNeeded('English text.', 'fr', suggestionBubble);
    await showTryAgainIfNeeded('More English text.', 'fr', suggestionBubble);

    const buttons = suggestionBubble.querySelectorAll('#try-again-btn');
    expect(buttons.length).toBe(1);
  });
});
