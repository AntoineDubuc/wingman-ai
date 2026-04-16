/**
 * Tests for Plan 2: Overlay Shell + Meeting View
 *
 * Covers header restructure (status bar, pill toggle) and view-swap.
 * Uses jsdom for DOM testing of the AIOverlay class.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal stubs so AIOverlay constructor doesn't crash in jsdom
// ---------------------------------------------------------------------------

// chrome.runtime.getURL returns a fake path for CSS loading
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

// Stub attachShadow to return an open shadow root so we can query it
// (AIOverlay uses 'closed', but for testing we override to 'open')
const originalAttachShadow = HTMLElement.prototype.attachShadow;
let lastShadow: ShadowRoot | null = null;

beforeEach(() => {
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

function getShadow(): ShadowRoot {
  if (!lastShadow) throw new Error('No shadow root captured');
  return lastShadow;
}

// ---------------------------------------------------------------------------
// Task 1: Status bar row (recording indicator + timer)
// ---------------------------------------------------------------------------

describe('Task 1: Status bar row', () => {
  // Lazy import so stubs are in place first
  async function createOverlay() {
    vi.resetModules();
    const mod = await import('../src/content/overlay');
    const overlay = new mod.AIOverlay();
    document.body.appendChild(overlay.container);
    return { overlay, mod };
  }

  describe('AC1: .status-bar is first child of .overlay-header', () => {
    it('creates a .status-bar element inside .overlay-header', async () => {
      await createOverlay();
      const shadow = getShadow();
      const statusBar = shadow.querySelector('.overlay-header > .status-bar');
      expect(statusBar).not.toBeNull();
    });

    it('.status-bar is the first child of .overlay-header', async () => {
      await createOverlay();
      const shadow = getShadow();
      const header = shadow.querySelector('.overlay-header');
      expect(header).not.toBeNull();
      const firstChild = header!.firstElementChild;
      expect(firstChild?.classList.contains('status-bar')).toBe(true);
    });
  });

  describe('AC2: .status-bar has exactly two children', () => {
    it('contains .recording-indicator and .meeting-timer as direct children', async () => {
      await createOverlay();
      const shadow = getShadow();
      const statusBar = shadow.querySelector('.status-bar');
      expect(statusBar).not.toBeNull();
      const children = statusBar!.children;
      expect(children).toHaveLength(2);
      expect(children[0]?.classList.contains('recording-indicator')).toBe(true);
      expect(children[1]?.classList.contains('meeting-timer')).toBe(true);
    });
  });

  describe('AC3: .recording-indicator contains dot and text', () => {
    it('contains .recording-dot and "Recording" text', async () => {
      await createOverlay();
      const shadow = getShadow();
      const indicator = shadow.querySelector('.recording-indicator');
      expect(indicator).not.toBeNull();
      const dot = indicator!.querySelector('.recording-dot');
      expect(dot).not.toBeNull();
      expect(indicator!.textContent).toContain('Recording');
    });
  });

  describe('AC5: .meeting-timer initial text', () => {
    it('shows 00:00:00 initially', async () => {
      await createOverlay();
      const shadow = getShadow();
      const timer = shadow.querySelector('.meeting-timer');
      expect(timer).not.toBeNull();
      expect(timer!.textContent).toBe('00:00:00');
    });
  });

  describe('AC6: timer counts up with fake timers', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('advances to 00:00:01 after 1 second when started', async () => {
      const { overlay } = await createOverlay();
      const shadow = getShadow();

      // Start the meeting timer (public or via session lifecycle)
      (overlay as any).startMeetingTimer();

      vi.advanceTimersByTime(1000);

      const timer = shadow.querySelector('.meeting-timer');
      expect(timer!.textContent).toBe('00:00:01');
    });

    it('advances to 00:01:00 after 60 seconds', async () => {
      const { overlay } = await createOverlay();
      const shadow = getShadow();

      (overlay as any).startMeetingTimer();
      vi.advanceTimersByTime(60_000);

      const timer = shadow.querySelector('.meeting-timer');
      expect(timer!.textContent).toBe('00:01:00');
    });

    it('advances to 01:00:00 after 3600 seconds', async () => {
      const { overlay } = await createOverlay();
      const shadow = getShadow();

      (overlay as any).startMeetingTimer();
      vi.advanceTimersByTime(3_600_000);

      const timer = shadow.querySelector('.meeting-timer');
      expect(timer!.textContent).toBe('01:00:00');
    });

    it('matches HH:MM:SS regex pattern', async () => {
      const { overlay } = await createOverlay();
      const shadow = getShadow();

      (overlay as any).startMeetingTimer();
      vi.advanceTimersByTime(5_000);

      const timer = shadow.querySelector('.meeting-timer');
      expect(timer!.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('AC8: existing header elements preserved', () => {
    it('drag-handle still exists under .overlay-header', async () => {
      await createOverlay();
      const shadow = getShadow();
      expect(shadow.querySelector('.overlay-header .drag-handle')).not.toBeNull();
    });

    it('persona-dots still exists', async () => {
      await createOverlay();
      const shadow = getShadow();
      expect(shadow.querySelector('.overlay-header .persona-dots')).not.toBeNull();
    });

    it('cost-ticker still exists', async () => {
      await createOverlay();
      const shadow = getShadow();
      expect(shadow.querySelector('.overlay-header .cost-ticker')).not.toBeNull();
    });

    it('controls with all buttons still exist', async () => {
      await createOverlay();
      const shadow = getShadow();
      expect(shadow.querySelector('.overlay-header .controls')).not.toBeNull();
      expect(shadow.querySelector('.overlay-header .font-decrease-btn')).not.toBeNull();
      expect(shadow.querySelector('.overlay-header .font-increase-btn')).not.toBeNull();
      expect(shadow.querySelector('.overlay-header .display-toggle-btn')).not.toBeNull();
      expect(shadow.querySelector('.overlay-header .dock-toggle-btn')).not.toBeNull();
      expect(shadow.querySelector('.overlay-header .minimize-btn')).not.toBeNull();
      expect(shadow.querySelector('.overlay-header .close-btn')).not.toBeNull();
    });
  });

  describe('Negative: timer interval leak protection', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calling startMeetingTimer twice does not create two intervals', async () => {
      const { overlay } = await createOverlay();
      const shadow = getShadow();

      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

      (overlay as any).startMeetingTimer();
      (overlay as any).startMeetingTimer();

      // Only one setInterval call (from the second call -- first is cleared)
      // OR total of 2 calls but the first interval was cleared
      vi.advanceTimersByTime(2000);

      const timer = shadow.querySelector('.meeting-timer');
      // If two intervals ran, we'd see double-counting (00:00:04 instead of 00:00:02)
      expect(timer!.textContent).toBe('00:00:02');

      setIntervalSpy.mockRestore();
    });

    it('destroy clears the timer interval', async () => {
      const { overlay } = await createOverlay();

      (overlay as any).startMeetingTimer();

      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

      overlay.destroy();

      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// Task 2: Pill toggle row + currentMode observable
// ---------------------------------------------------------------------------

describe('Task 2: Pill toggle row + currentMode observable', () => {
  async function createOverlay() {
    vi.resetModules();
    const mod = await import('../src/content/overlay');
    const overlay = new mod.AIOverlay();
    document.body.appendChild(overlay.container);
    return { overlay, mod };
  }

  describe('AC1: .pill-toggle exists inside .overlay-header', () => {
    it('creates a .pill-toggle element inside .overlay-header', async () => {
      await createOverlay();
      const shadow = getShadow();
      const pillToggle = shadow.querySelector('.overlay-header .pill-toggle');
      expect(pillToggle).not.toBeNull();
    });
  });

  describe('AC2: .pill-toggle has exactly two pill-btn children', () => {
    it('contains two button.pill-btn with correct data-mode attributes', async () => {
      await createOverlay();
      const shadow = getShadow();
      const pillToggle = shadow.querySelector('.pill-toggle');
      expect(pillToggle).not.toBeNull();
      const buttons = pillToggle!.querySelectorAll('button.pill-btn');
      expect(buttons).toHaveLength(2);
      expect((buttons[0] as HTMLButtonElement).dataset.mode).toBe('meeting');
      expect((buttons[1] as HTMLButtonElement).dataset.mode).toBe('assistant');
    });
  });

  describe('AC3: initial state', () => {
    it('Meeting button has .active class and aria-selected="true"', async () => {
      await createOverlay();
      const shadow = getShadow();
      const meetingBtn = shadow.querySelector('.pill-btn[data-mode="meeting"]') as HTMLButtonElement;
      const assistantBtn = shadow.querySelector('.pill-btn[data-mode="assistant"]') as HTMLButtonElement;

      expect(meetingBtn).not.toBeNull();
      expect(assistantBtn).not.toBeNull();
      expect(meetingBtn.classList.contains('active')).toBe(true);
      expect(meetingBtn.getAttribute('aria-selected')).toBe('true');
      expect(assistantBtn.classList.contains('active')).toBe(false);
      expect(assistantBtn.getAttribute('aria-selected')).toBe('false');
    });
  });

  describe('AC4: getCurrentMode()', () => {
    it('returns "meeting" initially', async () => {
      const { overlay } = await createOverlay();
      expect((overlay as any).getCurrentMode()).toBe('meeting');
    });

    it('returns "assistant" after clicking the Assistant button', async () => {
      const { overlay } = await createOverlay();
      const shadow = getShadow();
      const assistantBtn = shadow.querySelector('.pill-btn[data-mode="assistant"]') as HTMLButtonElement;
      assistantBtn.click();
      expect((overlay as any).getCurrentMode()).toBe('assistant');
    });
  });

  describe('AC5: onModeChange subscription', () => {
    it('calls subscriber on mode change and returns unsubscribe function', async () => {
      const { overlay } = await createOverlay();
      const shadow = getShadow();

      const calls: string[] = [];
      const unsub = (overlay as any).onModeChange((mode: string) => calls.push(mode));

      // Switch to assistant
      const assistantBtn = shadow.querySelector('.pill-btn[data-mode="assistant"]') as HTMLButtonElement;
      assistantBtn.click();
      expect(calls).toEqual(['assistant']);

      // Unsubscribe
      unsub();

      // Switch back to meeting -- should NOT call subscriber
      const meetingBtn = shadow.querySelector('.pill-btn[data-mode="meeting"]') as HTMLButtonElement;
      meetingBtn.click();
      expect(calls).toEqual(['assistant']); // unchanged
    });
  });

  describe('AC6: subscriber error isolation', () => {
    it('if one subscriber throws, subsequent subscribers are still called', async () => {
      const { overlay } = await createOverlay();
      const shadow = getShadow();

      const results: string[] = [];

      (overlay as any).onModeChange(() => results.push('first'));
      (overlay as any).onModeChange(() => { throw new Error('boom'); });
      (overlay as any).onModeChange(() => results.push('third'));

      const assistantBtn = shadow.querySelector('.pill-btn[data-mode="assistant"]') as HTMLButtonElement;
      assistantBtn.click();

      expect(results).toEqual(['first', 'third']);
    });
  });

  describe('AC7: active/inactive button styling distinction', () => {
    it('pill-toggle has role="tablist"', async () => {
      await createOverlay();
      const shadow = getShadow();
      const pillToggle = shadow.querySelector('.pill-toggle');
      expect(pillToggle?.getAttribute('role')).toBe('tablist');
    });

    it('buttons have role="tab"', async () => {
      await createOverlay();
      const shadow = getShadow();
      const buttons = shadow.querySelectorAll('.pill-btn');
      buttons.forEach(btn => {
        expect(btn.getAttribute('role')).toBe('tab');
      });
    });
  });

  describe('AC8: clicking swaps active state', () => {
    it('clicking Assistant moves .active class and aria-selected', async () => {
      await createOverlay();
      const shadow = getShadow();
      const meetingBtn = shadow.querySelector('.pill-btn[data-mode="meeting"]') as HTMLButtonElement;
      const assistantBtn = shadow.querySelector('.pill-btn[data-mode="assistant"]') as HTMLButtonElement;

      assistantBtn.click();

      expect(assistantBtn.classList.contains('active')).toBe(true);
      expect(assistantBtn.getAttribute('aria-selected')).toBe('true');
      expect(meetingBtn.classList.contains('active')).toBe(false);
      expect(meetingBtn.getAttribute('aria-selected')).toBe('false');
    });

    it('clicking back to Meeting restores original state', async () => {
      await createOverlay();
      const shadow = getShadow();
      const meetingBtn = shadow.querySelector('.pill-btn[data-mode="meeting"]') as HTMLButtonElement;
      const assistantBtn = shadow.querySelector('.pill-btn[data-mode="assistant"]') as HTMLButtonElement;

      assistantBtn.click();
      meetingBtn.click();

      expect(meetingBtn.classList.contains('active')).toBe(true);
      expect(meetingBtn.getAttribute('aria-selected')).toBe('true');
      expect(assistantBtn.classList.contains('active')).toBe(false);
      expect(assistantBtn.getAttribute('aria-selected')).toBe('false');
    });
  });

  describe('Negative: already-active button is no-op', () => {
    it('clicking Meeting twice does not fire subscriber', async () => {
      const { overlay } = await createOverlay();
      const shadow = getShadow();

      const calls: string[] = [];
      (overlay as any).onModeChange((mode: string) => calls.push(mode));

      const meetingBtn = shadow.querySelector('.pill-btn[data-mode="meeting"]') as HTMLButtonElement;
      meetingBtn.click();
      meetingBtn.click();

      expect(calls).toEqual([]); // No mode change -- meeting was already active
    });
  });

  describe('Negative: onModeChange with non-function throws', () => {
    it('throws when passed null', async () => {
      const { overlay } = await createOverlay();
      expect(() => (overlay as any).onModeChange(null)).toThrow('callback must be a function');
    });

    it('throws when passed undefined', async () => {
      const { overlay } = await createOverlay();
      expect(() => (overlay as any).onModeChange(undefined)).toThrow('callback must be a function');
    });
  });

  describe('Negative: setMode with invalid value throws', () => {
    it('throws on invalid mode', async () => {
      const { overlay } = await createOverlay();
      expect(() => (overlay as any).setMode('invalid')).toThrow();
    });
  });
});
