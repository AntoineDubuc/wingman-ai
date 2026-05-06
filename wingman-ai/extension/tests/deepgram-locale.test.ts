/**
 * Tests for F2-T6: DeepgramClient STT Model Routing
 *
 * Verifies that DeepgramClient uses the per-locale model and language
 * from LOCALE_DEEPGRAM_MODEL when connecting, reading the locale at
 * connect() call time (not instantiation time).
 *
 * AC1: connect() with activeLocale='ro' → model=nova-2 AND language=ro in WebSocket URL
 * AC2: connect() with activeLocale='fr' → model=nova-3 AND language=fr in WebSocket URL
 * AC3: connect() with activeLocale='en' → model=nova-3 AND language=en in WebSocket URL
 * AC4: Both model and language params are locale-driven (neither hardcoded)
 * AC5: Locale determined at connect() call time (not at instantiation)
 * AC6: Public connect() signature unchanged
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock sw-locale — MUST be declared before the module under test is imported
// ---------------------------------------------------------------------------
const mockGetActiveLocale = vi.fn().mockReturnValue('en');
vi.mock('../src/background/sw-locale', () => ({
  getActiveLocale: () => mockGetActiveLocale(),
  rehydrateActiveLocale: vi.fn(),
  registerLocaleOnChanged: vi.fn(),
  resetActiveLocale: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import module under test after mocks are set up
// ---------------------------------------------------------------------------
import { DeepgramClient } from '../src/services/deepgram-client';

// ---------------------------------------------------------------------------
// WebSocket mock setup
// ---------------------------------------------------------------------------
function makeWsCapture() {
  const wsUrlCapture: string[] = [];

  // Must use a real constructor function (not arrow) so `new WebSocket(...)` works
  function MockWebSocket(this: any, url: string) {
    wsUrlCapture.push(url);
    this.readyState = 1; // OPEN
    this.send = vi.fn();
    this.close = vi.fn();
    this.addEventListener = vi.fn();
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    // Fire onopen after a tick to simulate connection
    setTimeout(() => this.onopen?.({} as Event));
  }
  // Add static OPEN constant that DeepgramClient checks
  (MockWebSocket as any).OPEN = 1;

  vi.stubGlobal('WebSocket', MockWebSocket);
  return wsUrlCapture;
}

// ---------------------------------------------------------------------------
// chrome.storage.local mock (override the global from setup.ts)
// ---------------------------------------------------------------------------
function mockStorage() {
  (global as any).chrome = {
    ...((global as any).chrome ?? {}),
    storage: {
      ...(((global as any).chrome ?? {}).storage ?? {}),
      local: {
        get: vi.fn().mockResolvedValue({ deepgramApiKey: 'test-key', endpointingMs: '700' }),
        set: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: wait for WebSocket to be constructed
// ---------------------------------------------------------------------------
async function waitForWsCreated(capture: string[]): Promise<void> {
  // Flush microtasks and the setTimeout in the WS mock
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeepgramClient STT Model Routing — F2-T6', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveLocale.mockReturnValue('en');
    mockStorage();
  });

  // -------------------------------------------------------------------------
  // AC1: Romanian uses nova-2 (ADR-007)
  // -------------------------------------------------------------------------
  it('AC1: uses nova-2 and language=ro for Romanian', async () => {
    const wsUrlCapture = makeWsCapture();
    mockGetActiveLocale.mockReturnValue('ro');

    const client = new DeepgramClient();
    const connectPromise = client.connect();
    await waitForWsCreated(wsUrlCapture);
    await connectPromise;

    expect(wsUrlCapture.length).toBeGreaterThan(0);
    expect(wsUrlCapture[0]).toContain('model=nova-2');
    expect(wsUrlCapture[0]).toContain('language=ro');
  });

  // -------------------------------------------------------------------------
  // AC2: French uses nova-3
  // -------------------------------------------------------------------------
  it('AC2: uses nova-3 and language=fr for French', async () => {
    const wsUrlCapture = makeWsCapture();
    mockGetActiveLocale.mockReturnValue('fr');

    const client = new DeepgramClient();
    const connectPromise = client.connect();
    await waitForWsCreated(wsUrlCapture);
    await connectPromise;

    expect(wsUrlCapture.length).toBeGreaterThan(0);
    expect(wsUrlCapture[0]).toContain('model=nova-3');
    expect(wsUrlCapture[0]).toContain('language=fr');
  });

  // -------------------------------------------------------------------------
  // AC3: English uses nova-3
  // -------------------------------------------------------------------------
  it('AC3: uses nova-3 and language=en for English', async () => {
    const wsUrlCapture = makeWsCapture();
    mockGetActiveLocale.mockReturnValue('en');

    const client = new DeepgramClient();
    const connectPromise = client.connect();
    await waitForWsCreated(wsUrlCapture);
    await connectPromise;

    expect(wsUrlCapture.length).toBeGreaterThan(0);
    expect(wsUrlCapture[0]).toContain('model=nova-3');
    expect(wsUrlCapture[0]).toContain('language=en');
  });

  // -------------------------------------------------------------------------
  // AC5: Locale determined at connect() time not at instantiation
  // -------------------------------------------------------------------------
  it('AC5: model and language determined at connect() time, not at instantiation', async () => {
    const wsUrlCapture = makeWsCapture();

    // Instantiate when locale is 'en'
    mockGetActiveLocale.mockReturnValue('en');
    const client = new DeepgramClient();

    // Change locale AFTER instantiation but BEFORE connect
    mockGetActiveLocale.mockReturnValue('ru');

    const connectPromise = client.connect();
    await waitForWsCreated(wsUrlCapture);
    await connectPromise;

    expect(wsUrlCapture.length).toBeGreaterThan(0);
    // Should use 'ru' (set before connect), not 'en' (set at instantiation)
    expect(wsUrlCapture[0]).toContain('language=ru');
    expect(wsUrlCapture[0]).toContain('model=nova-3');
  });

  // -------------------------------------------------------------------------
  // AC4: Both model and language are locale-driven for Spanish
  // -------------------------------------------------------------------------
  it('AC4: uses nova-3 and language=es for Spanish — both params locale-driven', async () => {
    const wsUrlCapture = makeWsCapture();
    mockGetActiveLocale.mockReturnValue('es');

    const client = new DeepgramClient();
    const connectPromise = client.connect();
    await waitForWsCreated(wsUrlCapture);
    await connectPromise;

    expect(wsUrlCapture.length).toBeGreaterThan(0);
    expect(wsUrlCapture[0]).toContain('model=nova-3');
    expect(wsUrlCapture[0]).toContain('language=es');
  });

  // -------------------------------------------------------------------------
  // AC6: connect() signature is unchanged (returns Promise<boolean>)
  // -------------------------------------------------------------------------
  it('AC6: connect() returns Promise<boolean> — signature unchanged', async () => {
    const wsUrlCapture = makeWsCapture();
    mockGetActiveLocale.mockReturnValue('en');

    const client = new DeepgramClient();
    const connectPromise = client.connect();

    // Must be a Promise
    expect(connectPromise).toBeInstanceOf(Promise);

    await waitForWsCreated(wsUrlCapture);
    const result = await connectPromise;

    // Must resolve to boolean
    expect(typeof result).toBe('boolean');
  });
});
