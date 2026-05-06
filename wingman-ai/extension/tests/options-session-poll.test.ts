/**
 * Tests for Plan 2 Task 4: session-state polling for FR-009 picker lock.
 *
 * Asserts that setupLanguagePickerWiring polls the SW's GET_STATUS every
 * SESSION_POLL_INTERVAL_MS, re-renders the picker on transitions, and uses
 * an in-flight guard to prevent out-of-order resolves on slow SW replies.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { i18n as I18n } from 'i18next';

vi.mock('../src/options/options-locale', () => ({
  initOptionsI18n: vi.fn(),
  renderLanguagePicker: vi.fn(),
  handleStorageChange: vi.fn(),
}));

import {
  setupLanguagePickerWiring,
  SESSION_POLL_INTERVAL_MS,
} from '../src/options/options';
import { renderLanguagePicker } from '../src/options/options-locale';

const mockSendMessage = vi.fn();
const mockAddListener = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  (globalThis as any).chrome = {
    runtime: { sendMessage: mockSendMessage },
    storage: {
      onChanged: { addListener: mockAddListener },
      sync: { set: vi.fn(), get: vi.fn().mockResolvedValue({}) },
      local: { set: vi.fn(), get: vi.fn().mockResolvedValue({}) },
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
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

// Helper to flush all pending microtasks (Promise resolutions) without advancing fake timers.
async function flushMicrotasks() {
  // vi.advanceTimersByTimeAsync also flushes microtasks; use a 0-ms advance.
  await vi.advanceTimersByTimeAsync(0);
}

describe('setupLanguagePickerWiring: session-state polling', () => {
  it('exports SESSION_POLL_INTERVAL_MS as a positive integer', () => {
    expect(SESSION_POLL_INTERVAL_MS).toBeGreaterThan(0);
    expect(Number.isInteger(SESSION_POLL_INTERVAL_MS)).toBe(true);
  });

  it('AC-T4-1: starts polling on setup with initial sessionActive value (initial render only, no extra render before first tick)', async () => {
    mockSendMessage.mockResolvedValue({ isSessionActive: false });
    const i18n = makeMockI18n();

    const { stop } = await setupLanguagePickerWiring(i18n, 'en');

    // Initial render only (the polling tick has not yet fired)
    expect(renderLanguagePicker).toHaveBeenCalledTimes(1);
    expect(renderLanguagePicker).toHaveBeenLastCalledWith(i18n, 'en', false);

    stop();
  });

  it('AC-T4-2: re-renders with sessionActive=true on false→true transition', async () => {
    // Initial: inactive
    mockSendMessage.mockResolvedValueOnce({ isSessionActive: false });
    const i18n = makeMockI18n();
    const { stop } = await setupLanguagePickerWiring(i18n, 'en');
    expect(renderLanguagePicker).toHaveBeenCalledTimes(1);

    // Transition to active before next tick
    mockSendMessage.mockResolvedValue({ isSessionActive: true });
    await vi.advanceTimersByTimeAsync(SESSION_POLL_INTERVAL_MS);
    await flushMicrotasks();

    expect(renderLanguagePicker).toHaveBeenCalledTimes(2);
    expect(renderLanguagePicker).toHaveBeenLastCalledWith(i18n, 'en', true);

    stop();
  });

  it('AC-T4-3: re-renders with sessionActive=false on true→false transition', async () => {
    mockSendMessage.mockResolvedValueOnce({ isSessionActive: true });
    const i18n = makeMockI18n();
    const { stop } = await setupLanguagePickerWiring(i18n, 'en');
    expect(renderLanguagePicker).toHaveBeenCalledTimes(1);

    mockSendMessage.mockResolvedValue({ isSessionActive: false });
    await vi.advanceTimersByTimeAsync(SESSION_POLL_INTERVAL_MS);
    await flushMicrotasks();

    expect(renderLanguagePicker).toHaveBeenCalledTimes(2);
    expect(renderLanguagePicker).toHaveBeenLastCalledWith(i18n, 'en', false);

    stop();
  });

  it('AC-T4-4: does NOT re-render when SW status unchanged across two ticks', async () => {
    mockSendMessage.mockResolvedValue({ isSessionActive: false });
    const i18n = makeMockI18n();
    const { stop } = await setupLanguagePickerWiring(i18n, 'en');
    expect(renderLanguagePicker).toHaveBeenCalledTimes(1);

    // Two ticks at the same status — no transition, no re-render
    await vi.advanceTimersByTimeAsync(SESSION_POLL_INTERVAL_MS * 2);
    await flushMicrotasks();

    expect(renderLanguagePicker).toHaveBeenCalledTimes(1);

    stop();
  });

  it('AC-T4-5: in-flight guard — slow SW reply does NOT cause stuck-locked picker on rapid transitions', async () => {
    // Setup: initial active, then a rapid sequence of slow replies that should resolve in order
    mockSendMessage.mockResolvedValueOnce({ isSessionActive: true });
    const i18n = makeMockI18n();
    const { stop } = await setupLanguagePickerWiring(i18n, 'en');
    expect(renderLanguagePicker).toHaveBeenCalledTimes(1);
    expect(renderLanguagePicker).toHaveBeenLastCalledWith(i18n, 'en', true);

    // Now make sendMessage return a Promise that resolves slowly to false (session ended).
    // While the first tick's request is in-flight, the next tick fires (1000ms passes again)
    // and should be GUARDED (no overlapping request).
    let resolveSlow!: (v: { isSessionActive: boolean }) => void;
    mockSendMessage.mockImplementationOnce(
      () => new Promise((r) => { resolveSlow = r; }),
    );
    // A second mock for any subsequent (non-guarded) call — should NOT be reached.
    mockSendMessage.mockResolvedValue({ isSessionActive: true });

    await vi.advanceTimersByTimeAsync(SESSION_POLL_INTERVAL_MS); // tick 1 fires
    await vi.advanceTimersByTimeAsync(SESSION_POLL_INTERVAL_MS); // tick 2 fires — should early-return because tick 1 is in-flight

    // Only ONE sendMessage should have been called by the polling (initial setup made one too)
    // Initial: 1 sendMessage. Tick 1: 1 more. Tick 2: 0 (guarded). Total: 2.
    expect(mockSendMessage).toHaveBeenCalledTimes(2);

    // Now resolve tick 1's reply with sessionActive=false (transition true → false)
    resolveSlow({ isSessionActive: false });
    await flushMicrotasks();

    // Picker should now reflect the most recent value (false)
    expect(renderLanguagePicker).toHaveBeenLastCalledWith(i18n, 'en', false);

    stop();
  });

  it('stop() handle clears the polling interval', async () => {
    mockSendMessage.mockResolvedValue({ isSessionActive: false });
    const i18n = makeMockI18n();
    const { stop } = await setupLanguagePickerWiring(i18n, 'en');

    stop();

    // After stop, advance time — no further sendMessage calls beyond the initial.
    const initialCalls = mockSendMessage.mock.calls.length;
    await vi.advanceTimersByTimeAsync(SESSION_POLL_INTERVAL_MS * 5);
    await flushMicrotasks();

    expect(mockSendMessage.mock.calls.length).toBe(initialCalls);
  });
});
