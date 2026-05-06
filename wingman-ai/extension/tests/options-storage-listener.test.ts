/**
 * Tests for Plan 2 Task 3: chrome.storage.onChanged listener registration.
 *
 * Asserts that setupLanguagePickerWiring registers a single onChanged listener
 * with correct gating (language_preference + sync only) and that the rerender
 * callback calls window.location.reload(). Also asserts that handleStorageChange
 * is a read-only consumer (no storage writes during execution).
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { i18n as I18n } from 'i18next';

// Mock options-locale: we use the REAL handleStorageChange, but spy on renderLanguagePicker.
vi.mock('../src/options/options-locale', async () => {
  const actual = await vi.importActual<typeof import('../src/options/options-locale')>(
    '../src/options/options-locale',
  );
  return {
    ...actual,
    initOptionsI18n: vi.fn(),
    renderLanguagePicker: vi.fn(),
  };
});

// Mock validateLocale to be a real function (handleStorageChange depends on it)
// — handled by importActual in the i18n-init path; no separate mock needed.

import { setupLanguagePickerWiring } from '../src/options/options';

const mockSendMessage = vi.fn();
const mockAddListener = vi.fn();
const mockSyncSet = vi.fn();
const mockLocalSet = vi.fn();
const mockReload = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as any).chrome = {
    runtime: { sendMessage: mockSendMessage },
    storage: {
      onChanged: { addListener: mockAddListener },
      sync: { set: mockSyncSet, get: vi.fn().mockResolvedValue({}) },
      local: { set: mockLocalSet, get: vi.fn().mockResolvedValue({}) },
    },
  };
  // Stub window.location.reload (jsdom's reload throws "Not implemented")
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload: mockReload },
  });
  mockSendMessage.mockResolvedValue({ isSessionActive: false });
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

describe('setupLanguagePickerWiring: storage listener registration', () => {
  it('AC-T3-1: chrome.storage.onChanged.addListener called exactly once', async () => {
    const { stop } = await setupLanguagePickerWiring(makeMockI18n(), 'en');
    stop();

    expect(mockAddListener).toHaveBeenCalledTimes(1);
    expect(typeof mockAddListener.mock.calls[0][0]).toBe('function');
  });

  it('AC-T3-3: rerender callback calls window.location.reload()', async () => {
    const i18n = makeMockI18n();
    const { stop } = await setupLanguagePickerWiring(i18n, 'en');
    stop();

    // Get the registered listener and fire it with a valid sync language_preference change
    const listener = mockAddListener.mock.calls[0][0];
    await listener({ language_preference: { newValue: 'fr', oldValue: 'en' } }, 'sync');

    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('AC-T3-2 / AC-T3-4: listener registers AFTER renderLanguagePicker (call-order)', async () => {
    const callOrder: string[] = [];
    const { renderLanguagePicker } = await import('../src/options/options-locale');
    vi.mocked(renderLanguagePicker).mockImplementation(() => {
      callOrder.push('render');
    });
    mockAddListener.mockImplementation(() => {
      callOrder.push('listener');
    });

    const { stop } = await setupLanguagePickerWiring(makeMockI18n(), 'en');
    stop();

    expect(callOrder).toEqual(['render', 'listener']);
  });

  it('AC-T3-5: ignores changes that do not include language_preference (no reload)', async () => {
    const { stop } = await setupLanguagePickerWiring(makeMockI18n(), 'en');
    stop();

    const listener = mockAddListener.mock.calls[0][0];
    await listener({ other_key: { newValue: 'something', oldValue: 'other' } }, 'sync');

    expect(mockReload).not.toHaveBeenCalled();
  });

  it('AC-T3-5: ignores changes from non-sync storage areas (no reload)', async () => {
    const { stop } = await setupLanguagePickerWiring(makeMockI18n(), 'en');
    stop();

    const listener = mockAddListener.mock.calls[0][0];
    await listener({ language_preference: { newValue: 'fr', oldValue: 'en' } }, 'local');

    expect(mockReload).not.toHaveBeenCalled();
  });

  it('AC-T3-6: handleStorageChange is read-only (no chrome.storage.{sync,local}.set calls during execution)', async () => {
    const { stop } = await setupLanguagePickerWiring(makeMockI18n(), 'en');
    stop();

    const listener = mockAddListener.mock.calls[0][0];
    await listener({ language_preference: { newValue: 'fr', oldValue: 'en' } }, 'sync');

    expect(mockSyncSet).not.toHaveBeenCalled();
    expect(mockLocalSet).not.toHaveBeenCalled();
  });

  it('AC-T3-5: ignores invalid locale value (not in SUPPORTED_LOCALES)', async () => {
    const { stop } = await setupLanguagePickerWiring(makeMockI18n(), 'en');
    stop();

    const listener = mockAddListener.mock.calls[0][0];
    await listener({ language_preference: { newValue: 'zh', oldValue: 'en' } }, 'sync');

    expect(mockReload).not.toHaveBeenCalled();
  });
});
