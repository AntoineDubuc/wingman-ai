/**
 * Tests for Plan A: AssistantView Wiring (Bug #1 fix)
 *
 * Verifies that registerChatPipeline() is called from AIOverlay's
 * initAssistantView() after the AssistantView mount() resolves.
 *
 * Test approach: vi.mock() on chat-pipeline module + capture calls.
 * NO private field access on AssistantView (per Plan A v2 design).
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// chrome.* stubs (same pattern as overlay-meeting-view.test.ts)
// ---------------------------------------------------------------------------
vi.stubGlobal('chrome', {
  ...((globalThis as any).chrome ?? {}),
  runtime: {
    ...((globalThis as any).chrome?.runtime ?? {}),
    getURL: vi.fn((path: string) => `chrome-extension://fake/${path}`),
  },
  storage: {
    local: {
      get: vi.fn((_keys: any, cb?: any) => {
        if (typeof cb === 'function') cb({});
        return Promise.resolve({});
      }),
      set: vi.fn(() => Promise.resolve()),
    },
    onChanged: {
      addListener: vi.fn(),
    },
  },
});

// ---------------------------------------------------------------------------
// Mock chat-pipeline module — capture registerChatPipeline calls
// ---------------------------------------------------------------------------
const mockRegisterChatPipeline = vi.fn();
vi.mock('../src/services/chat-pipeline', () => ({
  registerChatPipeline: (...args: unknown[]) => mockRegisterChatPipeline(...args),
}));

// ---------------------------------------------------------------------------
// Stub attachShadow to 'open' so we can query it
// ---------------------------------------------------------------------------
const originalAttachShadow = HTMLElement.prototype.attachShadow;
let lastShadow: ShadowRoot | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the implementation that some tests override
  mockRegisterChatPipeline.mockReset();
  HTMLElement.prototype.attachShadow = function (init: ShadowRootInit) {
    const shadow = originalAttachShadow.call(this, { ...init, mode: 'open' });
    lastShadow = shadow;
    return shadow;
  };
});

afterEach(() => {
  HTMLElement.prototype.attachShadow = originalAttachShadow;
  lastShadow = null;
  document.body.innerHTML = '';
});

async function createOverlay() {
  vi.resetModules();
  const mod = await import('../src/content/overlay');
  const overlay = new mod.AIOverlay();
  document.body.appendChild(overlay.container);
  return { overlay, mod };
}

// ---------------------------------------------------------------------------
// Plan A — Task 1 acceptance criteria
// ---------------------------------------------------------------------------

describe('Plan A — AssistantView wiring (Bug #1 fix)', () => {
  // -------------------------------------------------------------------------
  // AC: registerChatPipeline is called exactly once during overlay init
  // -------------------------------------------------------------------------
  describe('AC: registerChatPipeline is called once during overlay init', () => {
    it('calls registerChatPipeline exactly once after assistantView.mount() resolves', async () => {
      await createOverlay();
      // mount() is async — wait for the registration to fire
      await vi.waitFor(
        () => {
          expect(mockRegisterChatPipeline).toHaveBeenCalledTimes(1);
        },
        { timeout: 2000 }
      );
    });
  });

  // -------------------------------------------------------------------------
  // AC: registerChatPipeline argument is the AssistantView instance
  // -------------------------------------------------------------------------
  describe('AC: registerChatPipeline receives an AssistantView-like object', () => {
    it('passes a non-null object whose onSend property is a function', async () => {
      await createOverlay();
      await vi.waitFor(
        () => {
          expect(mockRegisterChatPipeline).toHaveBeenCalledTimes(1);
        },
        { timeout: 2000 }
      );
      const captured = mockRegisterChatPipeline.mock.calls[0]![0] as { onSend?: unknown };
      expect(captured).toBeDefined();
      expect(captured).not.toBeNull();
      expect(typeof captured.onSend).toBe('function');
    });

    it('passes the same AssistantView instance exposed via the devtools hook', async () => {
      const { overlay } = await createOverlay();
      await vi.waitFor(
        () => {
          expect(mockRegisterChatPipeline).toHaveBeenCalledTimes(1);
        },
        { timeout: 2000 }
      );
      const captured = mockRegisterChatPipeline.mock.calls[0]![0];
      // The constructor stores assistantView on the container via __wingmanAssistantView__ devtools hook (overlay.ts:152)
      const exposed = (overlay.container as unknown as { __wingmanAssistantView__?: unknown })
        .__wingmanAssistantView__;
      expect(exposed).toBeDefined();
      expect(captured).toBe(exposed);
    });
  });

  // -------------------------------------------------------------------------
  // AC: Send → orchestrator end-to-end via the public onSend API
  // -------------------------------------------------------------------------
  describe('AC: registered orchestrator fires when Send is triggered', () => {
    it('orchestrator callback receives text and SendContext when Send is triggered via DOM', async () => {
      // Stub registerChatPipeline to register an orchestrator spy via the public onSend API.
      // This mirrors what the real chat-pipeline.ts does, but with a spy we can assert on.
      const orchestratorSpy = vi.fn();
      mockRegisterChatPipeline.mockImplementation((view: { onSend: (cb: any) => void }) => {
        view.onSend(orchestratorSpy);
      });

      await createOverlay();
      await vi.waitFor(
        () => {
          expect(mockRegisterChatPipeline).toHaveBeenCalledTimes(1);
        },
        { timeout: 2000 }
      );

      // The chat input + send button live inside the shadow DOM under the assistant-view mount.
      const shadow = lastShadow!;
      const chatInput = shadow.querySelector('.chat-input') as HTMLInputElement | null;
      const sendBtn = shadow.querySelector('.chat-send-btn') as HTMLButtonElement | null;

      expect(chatInput, 'chat-input must exist after AssistantView mount').not.toBeNull();
      expect(sendBtn, 'chat-send-btn must exist after AssistantView mount').not.toBeNull();

      // Type "hello" and click Send
      chatInput!.value = 'hello';
      chatInput!.dispatchEvent(new Event('input', { bubbles: true }));
      sendBtn!.click();

      // Wait for the orchestrator to be invoked
      await vi.waitFor(() => {
        expect(orchestratorSpy).toHaveBeenCalled();
      });

      const calls = orchestratorSpy.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      const firstCall = calls[0]!;
      expect(firstCall[0]).toBe('hello');
      expect(firstCall[1]).toMatchObject({ transcript: true });
    });
  });
});
