/**
 * Tests for Plan 2 Task 2: OptionsController picker wiring.
 *
 * Asserts that the picker is rendered with the correct sessionActive value
 * read from the SW's GET_STATUS reply.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { i18n as I18n } from 'i18next';

// Mock options-locale BEFORE importing the module under test
vi.mock('../src/options/options-locale', () => ({
  initOptionsI18n: vi.fn(),
  renderLanguagePicker: vi.fn(),
  handleStorageChange: vi.fn(),
}));

import { setupLanguagePickerWiring } from '../src/options/options';
import { renderLanguagePicker } from '../src/options/options-locale';

const mockSendMessage = vi.fn();
const mockAddListener = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // Stub chrome APIs we touch
  (globalThis as any).chrome = {
    runtime: { sendMessage: mockSendMessage },
    storage: { onChanged: { addListener: mockAddListener } },
  };
});

afterEach(() => {
  delete (globalThis as any).chrome;
});

function makeMockI18n(): I18n {
  return {
    t: vi.fn((key: string) => key),
    language: 'en',
    isInitialized: true,
    changeLanguage: vi.fn().mockResolvedValue(undefined),
  } as unknown as I18n;
}

describe('setupLanguagePickerWiring', () => {
  it('AC-T2-2: renders picker exactly once with i18n, locale, sessionActive=false when SW says inactive', async () => {
    mockSendMessage.mockResolvedValue({ isSessionActive: false });
    const i18n = makeMockI18n();

    const { stop } = await setupLanguagePickerWiring(i18n, 'fr');
    stop();

    expect(renderLanguagePicker).toHaveBeenCalledTimes(1);
    expect(renderLanguagePicker).toHaveBeenCalledWith(i18n, 'fr', false);
  });

  it('AC-T2-2: renders picker with sessionActive=true when SW says active', async () => {
    mockSendMessage.mockResolvedValue({ isSessionActive: true });
    const i18n = makeMockI18n();

    const { stop } = await setupLanguagePickerWiring(i18n, 'en');
    stop();

    expect(renderLanguagePicker).toHaveBeenCalledTimes(1);
    expect(renderLanguagePicker).toHaveBeenCalledWith(i18n, 'en', true);
  });

  it('AC-T2-3: reads response.isSessionActive (NOT response.isActive)', async () => {
    // SW reply has BOTH fields with conflicting values to expose any wrong-field bug
    mockSendMessage.mockResolvedValue({ isSessionActive: false, isActive: true });
    const i18n = makeMockI18n();

    const { stop } = await setupLanguagePickerWiring(i18n, 'en');
    stop();

    // If reading the wrong field, this would be `true`. With correct field, it's `false`.
    expect(renderLanguagePicker).toHaveBeenCalledWith(i18n, 'en', false);
  });

  it('AC-T2-3: strict equality === true rejects truthy-but-not-boolean (e.g., 1, "true", "yes")', async () => {
    mockSendMessage.mockResolvedValue({ isSessionActive: 1 });
    const i18n = makeMockI18n();

    const { stop } = await setupLanguagePickerWiring(i18n, 'en');
    stop();

    expect(renderLanguagePicker).toHaveBeenCalledWith(i18n, 'en', false);
  });

  it('AC-T2-4: returns false when chrome.runtime.sendMessage throws (SW unavailable)', async () => {
    mockSendMessage.mockRejectedValue(new Error('Could not establish connection'));
    const i18n = makeMockI18n();

    const { stop } = await setupLanguagePickerWiring(i18n, 'en');
    stop();

    expect(renderLanguagePicker).toHaveBeenCalledWith(i18n, 'en', false);
  });

  it('returns a stop() handle for cleanup', async () => {
    mockSendMessage.mockResolvedValue({ isSessionActive: false });
    const i18n = makeMockI18n();

    const result = await setupLanguagePickerWiring(i18n, 'en');

    expect(typeof result.stop).toBe('function');
    expect(() => result.stop()).not.toThrow();
  });
});
