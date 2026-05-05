/**
 * Tests for service-worker.ts onInstalled handler — Plan 1 Task 4
 *
 * Verifies the handler dispatches the correct recordInstall(reason) for each
 * of the four chrome.runtime.onInstalled.OnInstalledReason values:
 *   - 'install'              → recordInstall('install')
 *   - 'update'               → recordInstall('update')
 *   - 'chrome_update'        → no-op (recordInstall NOT called)
 *   - 'shared_module_update' → no-op (recordInstall NOT called)
 *
 * Strategy: spy on installationStateService.recordInstall to assert call count
 * and arguments, then trigger fakeBrowser.runtime.onInstalled with each reason.
 * Uses vi.resetModules() in beforeEach so the service-worker.ts top-level
 * addListener call re-binds to the freshly-reset fakeBrowser event.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';

// ---------------------------------------------------------------------------
// Mock all heavy service-worker.ts dependencies (matches tests/service-worker.test.ts).
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

// Spy-able mock of installationStateService — the unit under test consumes this
// service, so we mock it here so each test can assert exact call signature.
vi.mock('@/services/installation-state', () => ({
  installationStateService: {
    recordInstall: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockResolvedValue('STEADY_STATE'),
    acknowledgeUpgrade: vi.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('service-worker onInstalled handler — reason dispatch (Plan 1 Task 4)', () => {
  let recordInstallMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // global setup.ts beforeEach already ran fakeBrowser.reset() + vi.clearAllMocks().
    // resetModules() forces a fresh top-level evaluation of service-worker.ts so
    // its chrome.runtime.onInstalled.addListener() re-registers against the
    // freshly-reset fakeBrowser event registry.
    vi.resetModules();
    await import('@/background/service-worker');

    // Grab the mocked recordInstall AFTER the dynamic import so we share the
    // same vi.fn() instance the imported service-worker module will call.
    const mod = await import('@/services/installation-state');
    recordInstallMock = mod.installationStateService.recordInstall as unknown as ReturnType<typeof vi.fn>;
  });

  it("dispatches recordInstall('install') for details.reason === 'install'", async () => {
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' } as any);

    expect(recordInstallMock).toHaveBeenCalledTimes(1);
    expect(recordInstallMock).toHaveBeenCalledWith('install');
  });

  it("dispatches recordInstall('update') for details.reason === 'update'", async () => {
    await fakeBrowser.runtime.onInstalled.trigger({
      reason: 'update',
      previousVersion: '1.0.0',
    } as any);

    expect(recordInstallMock).toHaveBeenCalledTimes(1);
    expect(recordInstallMock).toHaveBeenCalledWith('update');
  });

  it("does NOT call recordInstall for details.reason === 'chrome_update' (no-op)", async () => {
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'chrome_update' } as any);

    expect(recordInstallMock).not.toHaveBeenCalled();
  });

  it("does NOT call recordInstall for details.reason === 'shared_module_update' (no-op)", async () => {
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'shared_module_update' } as any);

    expect(recordInstallMock).not.toHaveBeenCalled();
  });
});
