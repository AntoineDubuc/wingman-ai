/**
 * Tests for service-worker.ts onInstalled handler integration (F4-T2)
 *
 * Verifies that installationStateService.recordInstall() is called on
 * fresh install (reason === 'install') but NOT on update/chrome_update.
 *
 * Strategy: Uses vi.resetModules() + dynamic import in beforeEach to
 * re-register the service-worker.ts onInstalled listener after each
 * fakeBrowser.reset() call (from global setup.ts). This ensures the
 * actual service-worker.ts handler code is exercised, providing
 * genuine RED → GREEN TDD behavior.
 *
 * AC1: installationStateService.recordInstall() called when reason === 'install'
 * AC2: NOT called when reason === 'update' or 'chrome_update'
 * AC3: Existing onInstalled logic is preserved (non-destructive change)
 * AC4: installTimestamp is set in local storage after fresh install
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';

// ---------------------------------------------------------------------------
// Mock all heavy service-worker.ts dependencies.
// vi.mock() is hoisted — these run before any import or dynamic import.
// ---------------------------------------------------------------------------

vi.mock('@/services/deepgram-client', () => ({
  deepgramClient: {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    sendAudio: vi.fn(),
    getIsConnected: vi.fn().mockReturnValue(false),
    setOnTranscript: vi.fn(),
    isConnected: false,
  },
  Transcript: {},
}));

vi.mock('@/services/gemini-client', () => ({
  geminiClient: {
    generateSuggestion: vi.fn().mockResolvedValue({ suggestion: '', type: 'answer' }),
    streamChat: vi.fn(),
  },
}));

vi.mock('@/services/transcript-collector', () => ({
  transcriptCollector: {
    add: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
    clear: vi.fn(),
    setOnThreshold: vi.fn(),
    getContext: vi.fn().mockReturnValue(''),
  },
}));

vi.mock('@/services/drive-service', () => ({
  driveService: {
    uploadTranscript: vi.fn().mockResolvedValue(undefined),
    isConfigured: vi.fn().mockResolvedValue(false),
    saveTranscript: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/services/langbuilder-client', () => ({
  langBuilderClient: {
    runFlow: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/services/cost-tracker', () => ({
  costTracker: {
    addLLMUsage: vi.fn(),
    startSession: vi.fn(),
    endSession: vi.fn(),
    getSnapshot: vi.fn().mockReturnValue(null),
    reset: vi.fn(),
  },
}));

vi.mock('@/services/hume-client', () => ({
  humeClient: {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    sendAudio: vi.fn(),
    setOnEmotion: vi.fn(),
  },
  HumeClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendAudio: vi.fn(),
    setOnEmotion: vi.fn(),
  })),
}));

vi.mock('@/services/kb/kb-search', () => ({
  searchKB: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/shared/persona', () => ({
  migrateToPersonas: vi.fn().mockResolvedValue(undefined),
  getActivePersonas: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/shared/llm-config', () => ({
  MODEL_STAGGER_MS: 0,
  PROVIDER_STAGGER_FALLBACK: 0,
}));

vi.mock('@/background/sw-locale', () => ({
  rehydrateActiveLocale: vi.fn().mockResolvedValue(undefined),
  registerLocaleOnChanged: vi.fn(),
  getActiveLocale: vi.fn().mockReturnValue('en'),
  resetActiveLocale: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('service-worker onInstalled handler (F4-T2)', () => {
  beforeEach(async () => {
    // global setup.ts beforeEach already called fakeBrowser.reset() and
    // vi.clearAllMocks() — listeners from previous module import are cleared.
    //
    // Re-import service-worker.ts using vi.resetModules() so its top-level
    // chrome.runtime.onInstalled.addListener() re-registers the handler with
    // the freshly-reset fakeBrowser.runtime.onInstalled event.
    vi.resetModules();
    await import('@/background/service-worker');
  });

  // AC1 + AC4
  it('sets installTimestamp when reason === "install"', async () => {
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' } as any);

    const result = await chrome.storage.local.get('installTimestamp');
    expect(result.installTimestamp).toBeDefined();
    expect(typeof result.installTimestamp).toBe('number');
  });

  // AC2
  it('does NOT set installTimestamp when reason === "update"', async () => {
    await fakeBrowser.runtime.onInstalled.trigger({
      reason: 'update',
      previousVersion: '1.0.0',
    } as any);

    const result = await chrome.storage.local.get('installTimestamp');
    expect(result.installTimestamp).toBeUndefined();
  });

  // AC2
  it('does NOT set installTimestamp when reason === "chrome_update"', async () => {
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'chrome_update' } as any);

    const result = await chrome.storage.local.get('installTimestamp');
    expect(result.installTimestamp).toBeUndefined();
  });

  // AC4 — value is valid epoch ms
  it('installTimestamp is a valid epoch ms after fresh install', async () => {
    const before = Date.now();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' } as any);
    const after = Date.now();

    const result = await chrome.storage.local.get('installTimestamp');
    const ts = result.installTimestamp as number;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  // AC3 — idempotency
  it('handler is idempotent — second install trigger does not overwrite timestamp', async () => {
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' } as any);
    const first = (await chrome.storage.local.get('installTimestamp')).installTimestamp;

    await new Promise(resolve => setTimeout(resolve, 5));

    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' } as any);
    const second = (await chrome.storage.local.get('installTimestamp')).installTimestamp;

    expect(second).toBe(first);
  });

  // AC3 — update after install does not clear timestamp
  it('update trigger after install does not overwrite installTimestamp', async () => {
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' } as any);
    const ts = (await chrome.storage.local.get('installTimestamp')).installTimestamp;
    expect(ts).toBeDefined();

    await fakeBrowser.runtime.onInstalled.trigger({
      reason: 'update',
      previousVersion: '1.0.0',
    } as any);

    const tsAfter = (await chrome.storage.local.get('installTimestamp')).installTimestamp;
    expect(tsAfter).toBe(ts);
  });

  // AC3 — no exception for any reason value
  it('handler does not throw for any reason value', async () => {
    await expect(
      fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' } as any),
    ).resolves.not.toThrow();
    await expect(
      fakeBrowser.runtime.onInstalled.trigger({
        reason: 'update',
        previousVersion: '1.0.0',
      } as any),
    ).resolves.not.toThrow();
    await expect(
      fakeBrowser.runtime.onInstalled.trigger({ reason: 'chrome_update' } as any),
    ).resolves.not.toThrow();
  });
});
