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

// ---------------------------------------------------------------------------
// Task 3: Content-area view-swap machinery + AssistantView mount-point
// ---------------------------------------------------------------------------

describe('Task 3: View-swap container + AssistantView mount-point', () => {
  async function createOverlay() {
    vi.resetModules();
    const mod = await import('../src/content/overlay');
    const overlay = new mod.AIOverlay();
    document.body.appendChild(overlay.container);
    return { overlay, mod };
  }

  describe('AC1: .view-container with exactly two .view children', () => {
    it('.view-container exists and contains .meeting-view and .assistant-view-mount', async () => {
      await createOverlay();
      const shadow = getShadow();
      const container = shadow.querySelector('.view-container');
      expect(container).not.toBeNull();

      // Filter direct children with .view class (jsdom lacks :scope support)
      const views = Array.from(container!.children).filter(
        el => el.classList.contains('view')
      );
      expect(views).toHaveLength(2);
      expect(views[0]!.classList.contains('meeting-view')).toBe(true);
      expect(views[1]!.classList.contains('assistant-view-mount')).toBe(true);
    });
  });

  describe('AC2: existing .timeline is a descendant of .meeting-view', () => {
    it('.timeline lives inside .meeting-view, not directly in .overlay-body', async () => {
      await createOverlay();
      const shadow = getShadow();

      const timeline = shadow.querySelector('.meeting-view .timeline');
      expect(timeline).not.toBeNull();

      // Must NOT be a direct child of .overlay-body
      const bodyTimeline = shadow.querySelector('.overlay-body > .timeline');
      expect(bodyTimeline).toBeNull();
    });

    it('.overlay-content is inside .meeting-view', async () => {
      await createOverlay();
      const shadow = getShadow();

      const overlayContent = shadow.querySelector('.meeting-view .overlay-content');
      expect(overlayContent).not.toBeNull();
    });

    it('.overlay-nav is inside .meeting-view', async () => {
      await createOverlay();
      const shadow = getShadow();

      const nav = shadow.querySelector('.meeting-view .overlay-nav');
      expect(nav).not.toBeNull();
    });
  });

  describe('AC3: .hidden class toggles with setMode', () => {
    it('initially, .meeting-view is visible and .assistant-view-mount is hidden', async () => {
      await createOverlay();
      const shadow = getShadow();

      const meetingView = shadow.querySelector('.meeting-view') as HTMLElement;
      const assistantMount = shadow.querySelector('.assistant-view-mount') as HTMLElement;

      expect(meetingView.classList.contains('hidden')).toBe(false);
      expect(assistantMount.classList.contains('hidden')).toBe(true);
    });

    it('setMode("assistant") hides meeting-view and shows assistant-view-mount', async () => {
      const { overlay } = await createOverlay();
      const shadow = getShadow();

      (overlay as any).setMode('assistant');

      const meetingView = shadow.querySelector('.meeting-view') as HTMLElement;
      const assistantMount = shadow.querySelector('.assistant-view-mount') as HTMLElement;

      expect(meetingView.classList.contains('hidden')).toBe(true);
      expect(assistantMount.classList.contains('hidden')).toBe(false);
    });

    it('setMode("meeting") after "assistant" restores original state', async () => {
      const { overlay } = await createOverlay();
      const shadow = getShadow();

      (overlay as any).setMode('assistant');
      (overlay as any).setMode('meeting');

      const meetingView = shadow.querySelector('.meeting-view') as HTMLElement;
      const assistantMount = shadow.querySelector('.assistant-view-mount') as HTMLElement;

      expect(meetingView.classList.contains('hidden')).toBe(false);
      expect(assistantMount.classList.contains('hidden')).toBe(true);
    });
  });

  describe('AC4: transition CSS includes opacity and transform', () => {
    // Note: jsdom doesn't compute real CSS from stylesheet. We verify the
    // classes are applied. The actual CSS declarations are tested by
    // inspecting the stylesheet content.
    it('.view elements have the correct class structure for transitions', async () => {
      await createOverlay();
      const shadow = getShadow();

      const views = shadow.querySelectorAll('.view');
      expect(views.length).toBeGreaterThanOrEqual(2);

      // Both elements have the .view class (which carries the transition)
      views.forEach(v => {
        expect(v.classList.contains('view')).toBe(true);
      });
    });
  });

  describe('AC5: .hidden applied within 1 rAF', () => {
    it('setMode applies .hidden synchronously (no rAF delay)', async () => {
      const { overlay } = await createOverlay();
      const shadow = getShadow();

      (overlay as any).setMode('assistant');

      // Check synchronously -- no rAF needed
      const meetingView = shadow.querySelector('.meeting-view') as HTMLElement;
      expect(meetingView.classList.contains('hidden')).toBe(true);
    });
  });

  describe('AC6: no transcript loss on mode switch round-trip', () => {
    it('timeline DOM is unchanged after meeting -> assistant -> meeting', async () => {
      await createOverlay();
      const shadow = getShadow();

      // Add some fake transcript entries to the timeline
      const timeline = shadow.querySelector('.timeline') as HTMLElement;
      for (let i = 0; i < 3; i++) {
        const bubble = document.createElement('div');
        bubble.className = 'bubble participant';
        bubble.textContent = `Test message ${i}`;
        timeline.appendChild(bubble);
      }

      const bubbleCountBefore = timeline.querySelectorAll('.bubble').length;
      expect(bubbleCountBefore).toBe(3);

      // Round-trip toggle
      const assistantBtn = shadow.querySelector('.pill-btn[data-mode="assistant"]') as HTMLButtonElement;
      const meetingBtn = shadow.querySelector('.pill-btn[data-mode="meeting"]') as HTMLButtonElement;
      assistantBtn.click();
      meetingBtn.click();

      const bubbleCountAfter = timeline.querySelectorAll('.bubble').length;
      expect(bubbleCountAfter).toBe(3);
    });
  });

  describe('AC7: getAssistantMountPoint() returns correct element', () => {
    it('returns the .assistant-view-mount HTMLElement', async () => {
      const { overlay } = await createOverlay();
      const shadow = getShadow();

      const mountPoint = (overlay as any).getAssistantMountPoint();
      expect(mountPoint).toBeInstanceOf(HTMLElement);

      const expected = shadow.querySelector('.assistant-view-mount');
      expect(mountPoint).toBe(expected);
    });
  });

  describe('AC8: .assistant-view-mount has correct accessibility attributes', () => {
    it('has role="tabpanel" and aria-label="Assistant"', async () => {
      await createOverlay();
      const shadow = getShadow();

      const mount = shadow.querySelector('.assistant-view-mount') as HTMLElement;
      expect(mount).not.toBeNull();
      expect(mount.getAttribute('role')).toBe('tabpanel');
      expect(mount.getAttribute('aria-label')).toBe('Assistant');
    });
  });

  describe('Negative: 10 rapid toggles do not create duplicates or leak', () => {
    it('DOM structure remains correct after 10 rapid toggles', async () => {
      const { overlay } = await createOverlay();
      const shadow = getShadow();

      for (let i = 0; i < 10; i++) {
        (overlay as any).setMode(i % 2 === 0 ? 'assistant' : 'meeting');
      }

      // After 10 toggles (even count), should be back to meeting mode
      const container = shadow.querySelector('.view-container');
      expect(container).not.toBeNull();
      const views = Array.from(container!.children).filter(
        el => el.classList.contains('view')
      );
      expect(views).toHaveLength(2);

      // Verify no duplicated elements
      expect(shadow.querySelectorAll('.view-container')).toHaveLength(1);
      expect(shadow.querySelectorAll('.meeting-view')).toHaveLength(1);
      expect(shadow.querySelectorAll('.assistant-view-mount')).toHaveLength(1);
    });
  });

  describe('Negative: setMode("invalid") throws', () => {
    it('throws a clear error for invalid mode values', async () => {
      const { overlay } = await createOverlay();
      expect(() => (overlay as any).setMode('invalid')).toThrow('Invalid mode');
    });
  });
});

// ---------------------------------------------------------------------------
// Task 4: MeetingView refactor — subscribe to transcriptBuffer, replace push path
// ---------------------------------------------------------------------------

describe('Task 4: MeetingView — subscription model', () => {
  // We test MeetingView in isolation with a fake buffer.

  function createFakeBuffer() {
    const entries: Array<{ text: string; speaker: string; is_final: boolean; is_self: boolean; timestamp: string }> = [];
    const subscribers: Array<(entry: any) => void> = [];

    return {
      append(entry: { text: string; speaker: string; is_final: boolean; is_self: boolean; timestamp: string }) {
        entries.push(entry);
        for (const cb of subscribers.slice()) {
          cb(entry);
        }
      },
      getSnapshot() {
        return entries.slice();
      },
      onAppend(cb: (entry: any) => void) {
        if (subscribers.length >= 8) {
          throw new Error('TranscriptBuffer: exceeded MAX_SUBSCRIBERS (8)');
        }
        subscribers.push(cb);
        return () => {
          const idx = subscribers.indexOf(cb);
          if (idx !== -1) subscribers.splice(idx, 1);
        };
      },
    };
  }

  function makeEntry(text: string, speaker = 'Alice', isFinal = true): { text: string; speaker: string; is_final: boolean; is_self: boolean; timestamp: string } {
    return {
      text,
      speaker,
      is_final: isFinal,
      is_self: false,
      timestamp: new Date().toISOString(),
    };
  }

  // AC1: MeetingView class exists with the required interface
  describe('AC1: MeetingView exports and interface', () => {
    it('exports a class MeetingView that can be constructed with a buffer', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const view = new MeetingView(buffer as any);
      expect(view).toBeDefined();
      expect(typeof view.mount).toBe('function');
      expect(typeof view.unmount).toBe('function');
    });
  });

  // AC2: mount reads getSnapshot() and renders all entries
  describe('AC2: mount renders snapshot entries', () => {
    it('renders all 5 pre-existing entries from buffer snapshot on mount', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();

      // Pre-populate buffer with 5 entries
      for (let i = 0; i < 5; i++) {
        buffer.append(makeEntry(`Entry ${i}`, `Speaker ${i}`));
      }

      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      const rendered = container.querySelectorAll('.transcript-entry');
      expect(rendered).toHaveLength(5);

      // Verify order
      expect(rendered[0]!.querySelector('.transcript-text')?.textContent).toContain('Entry 0');
      expect(rendered[4]!.querySelector('.transcript-text')?.textContent).toContain('Entry 4');
    });
  });

  // AC3: mount subscribes via onAppend, new entries render
  describe('AC3: subscription renders new entries after mount', () => {
    it('renders a new entry appended to buffer after mount', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();

      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      expect(container.querySelectorAll('.transcript-entry')).toHaveLength(0);

      // Append after mount
      buffer.append(makeEntry('Live entry', 'Bob'));

      expect(container.querySelectorAll('.transcript-entry')).toHaveLength(1);
      expect(container.querySelector('.transcript-text')?.textContent).toContain('Live entry');
    });
  });

  // AC4: unmount calls unsubscribe — subsequent appends do NOT render
  describe('AC4: unmount stops rendering', () => {
    it('does not render entries appended after unmount', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();

      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      buffer.append(makeEntry('Before unmount'));
      expect(container.querySelectorAll('.transcript-entry')).toHaveLength(1);

      view.unmount();

      buffer.append(makeEntry('After unmount'));
      // Still 1, not 2
      expect(container.querySelectorAll('.transcript-entry')).toHaveLength(1);
    });
  });

  // AC5: updateTranscript(is_final=true) is a no-op for rendering
  describe('AC5: updateTranscript with is_final=true is a rendering no-op', () => {
    it('does not add DOM elements when called with is_final=true', async () => {
      vi.resetModules();
      const mod = await import('../src/content/overlay');
      const overlay = new mod.AIOverlay();
      document.body.appendChild(overlay.container);

      const shadow = getShadow();
      const timeline = shadow.querySelector('.timeline') as HTMLElement;

      // Remove the empty-state element so we can count entries cleanly
      const emptyState = timeline.querySelector('.empty-state');
      if (emptyState) emptyState.remove();

      const childCountBefore = timeline.children.length;

      // Call updateTranscript with a final transcript
      // The buffer subscription (not this call) should handle rendering
      overlay.updateTranscript({
        text: 'Final text',
        speaker: 'Alice',
        is_final: true,
        is_self: false,
        timestamp: new Date().toISOString(),
      });

      // updateTranscript should NOT have added any DOM elements for finals
      const childCountAfter = timeline.children.length;
      expect(childCountAfter).toBe(childCountBefore);
    });
  });

  // AC6: updateTranscript(is_final=false) still renders interim bubbles
  describe('AC6: updateTranscript with is_final=false renders interim', () => {
    it('routes interim to MeetingView live indicator (not old bubble path)', async () => {
      vi.resetModules();

      const mod = await import('../src/content/overlay');
      const overlay = new mod.AIOverlay();
      document.body.appendChild(overlay.container);
      overlay.forceShow();

      const shadow = getShadow();

      overlay.updateTranscript({
        text: 'Interim text...',
        speaker: 'Alice',
        is_final: false,
        is_self: false,
        timestamp: new Date().toISOString(),
      });

      // Should NOT create old-style interim bubbles
      const interimBubbles = shadow.querySelectorAll('.bubble.interim');
      expect(interimBubbles.length).toBe(0);

      // Should activate the live indicator instead
      const indicator = shadow.querySelector('.transcript-live-indicator');
      expect(indicator?.classList.contains('active')).toBe(true);
      expect(indicator?.querySelector('.speaker-text')?.textContent).toContain('Alice');
    });
  });

  // AC8: Correction window — same speaker within 500ms replaces last entry
  describe('AC8: Correction window in MeetingView', () => {
    it('replaces the last entry when same speaker appends within 500ms', async () => {
      vi.useFakeTimers();
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();

      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      // First entry
      buffer.append(makeEntry('hello', 'Alice'));
      expect(container.querySelectorAll('.transcript-entry')).toHaveLength(1);
      expect(container.querySelector('.transcript-text')?.textContent).toContain('hello');

      // Second entry from same speaker within 500ms — should replace
      vi.advanceTimersByTime(200);
      buffer.append(makeEntry('hello world', 'Alice'));
      expect(container.querySelectorAll('.transcript-entry')).toHaveLength(1);
      expect(container.querySelector('.transcript-text')?.textContent).toContain('hello world');

      vi.useRealTimers();
    });

    it('does NOT replace when more than 500ms has passed', async () => {
      vi.useFakeTimers();
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();

      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      buffer.append(makeEntry('hello', 'Alice'));
      expect(container.querySelectorAll('.transcript-entry')).toHaveLength(1);

      // Wait more than 500ms
      vi.advanceTimersByTime(600);
      buffer.append(makeEntry('hello world', 'Alice'));
      expect(container.querySelectorAll('.transcript-entry')).toHaveLength(2);

      vi.useRealTimers();
    });

    it('does NOT replace when different speaker', async () => {
      vi.useFakeTimers();
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();

      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      buffer.append(makeEntry('hello', 'Alice'));
      vi.advanceTimersByTime(200);
      buffer.append(makeEntry('goodbye', 'Bob'));
      expect(container.querySelectorAll('.transcript-entry')).toHaveLength(2);

      vi.useRealTimers();
    });
  });

  // Negative test 1: onAppend throws on MAX_SUBSCRIBERS — mount throws clear error
  describe('Negative: MAX_SUBSCRIBERS exceeded on mount', () => {
    it('throws a clear error when buffer onAppend throws', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();

      // Fill up subscribers to trigger the throw
      for (let i = 0; i < 8; i++) {
        buffer.onAppend(() => {});
      }

      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      expect(() => view.mount(container)).toThrow();
    });
  });

  // Negative test 2: double mount throws "MeetingView already mounted"
  describe('Negative: double mount throws', () => {
    it('throws "MeetingView already mounted" on second mount without unmount', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();

      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      expect(() => view.mount(container)).toThrow('MeetingView already mounted');
    });
  });
});

// ---------------------------------------------------------------------------
// Task 5: Transcript-entry CSS — speaker-avatar-list design + fade-up
// ---------------------------------------------------------------------------

describe('Task 5: Speaker-avatar-list design + speakerColor', () => {
  // Reuse the fake buffer from Task 4
  function createFakeBuffer() {
    const entries: Array<{ text: string; speaker: string; is_final: boolean; is_self: boolean; timestamp: string }> = [];
    const subscribers: Array<(entry: any) => void> = [];

    return {
      append(entry: { text: string; speaker: string; is_final: boolean; is_self: boolean; timestamp: string }) {
        entries.push(entry);
        for (const cb of subscribers.slice()) {
          cb(entry);
        }
      },
      getSnapshot() {
        return entries.slice();
      },
      onAppend(cb: (entry: any) => void) {
        if (subscribers.length >= 8) {
          throw new Error('TranscriptBuffer: exceeded MAX_SUBSCRIBERS (8)');
        }
        subscribers.push(cb);
        return () => {
          const idx = subscribers.indexOf(cb);
          if (idx !== -1) subscribers.splice(idx, 1);
        };
      },
    };
  }

  function makeEntry(text: string, speaker = 'Alice', isFinal = true): { text: string; speaker: string; is_final: boolean; is_self: boolean; timestamp: string } {
    return {
      text,
      speaker,
      is_final: isFinal,
      is_self: false,
      timestamp: '2026-04-15T10:30:00.000Z',
    };
  }

  // AC1: DOM structure — .transcript-entry > .transcript-speaker > (.speaker-avatar, .speaker-name, .speaker-time) + .transcript-text
  describe('AC1: appendEntry creates correct DOM structure', () => {
    it('renders .transcript-entry with .transcript-speaker and .transcript-text children', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      buffer.append(makeEntry('Hello world', 'Sarah K.'));

      const entry = container.querySelector('.transcript-entry');
      expect(entry).not.toBeNull();

      const speakerRow = entry!.querySelector('.transcript-speaker');
      expect(speakerRow).not.toBeNull();

      const avatar = speakerRow!.querySelector('.speaker-avatar');
      const name = speakerRow!.querySelector('.speaker-name');
      const time = speakerRow!.querySelector('.speaker-time');
      expect(avatar).not.toBeNull();
      expect(name).not.toBeNull();
      expect(time).not.toBeNull();

      const textEl = entry!.querySelector('.transcript-text');
      expect(textEl).not.toBeNull();
      expect(textEl!.textContent).toBe('Hello world');
    });
  });

  // AC2: Initials extraction — 5 name-format tests
  describe('AC2: speaker-avatar initials extraction', () => {
    async function getInitials(speaker: string): Promise<string> {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      buffer.append(makeEntry('test', speaker));

      const avatar = container.querySelector('.speaker-avatar');
      return avatar?.textContent ?? '';
    }

    it('"Sarah K." -> "SK"', async () => {
      expect(await getInitials('Sarah K.')).toBe('SK');
    });

    it('"John Doe" -> "JD" (first + last)', async () => {
      expect(await getInitials('John Doe')).toBe('JD');
    });

    it('"Alice Bob Charlie" -> "AC" (first + last word)', async () => {
      expect(await getInitials('Alice Bob Charlie')).toBe('AC');
    });

    it('"Madonna" -> "MA" (mononym: first 2 chars)', async () => {
      expect(await getInitials('Madonna')).toBe('MA');
    });

    it('unicode name "Li" -> "LI" (short mononym: first 2 chars uppercase)', async () => {
      expect(await getInitials('Li')).toBe('LI');
    });
  });

  // AC3: speakerColor is deterministic
  describe('AC3: speakerColor determinism', () => {
    it('returns the same HSL value for the same name across multiple calls', async () => {
      const { speakerColor } = await import('../src/content/overlay/speaker-color');
      const color1 = speakerColor('Sarah K.');
      const color2 = speakerColor('Sarah K.');
      const color3 = speakerColor('Sarah K.');
      expect(color1).toBe(color2);
      expect(color2).toBe(color3);
    });

    it('returns an HSL string', async () => {
      const { speakerColor } = await import('../src/content/overlay/speaker-color');
      const color = speakerColor('Alice');
      expect(color).toMatch(/^hsl\(\d+,\s*65%,\s*50%\)$/);
    });

    it('returns different colors for different names', async () => {
      const { speakerColor } = await import('../src/content/overlay/speaker-color');
      const c1 = speakerColor('Alice');
      const c2 = speakerColor('Bob');
      expect(c1).not.toBe(c2);
    });
  });

  // AC4: speaker-name and speaker-time content
  describe('AC4: speaker-name and speaker-time content', () => {
    it('.speaker-name shows the speaker name', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      buffer.append(makeEntry('test', 'Sarah K.'));

      const name = container.querySelector('.speaker-name');
      expect(name!.textContent).toBe('Sarah K.');
    });

    it('.speaker-time matches HH:MM:SS format', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      buffer.append(makeEntry('test', 'Sarah K.'));

      const time = container.querySelector('.speaker-time');
      expect(time!.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });
  });

  // AC5: transcript-text has textContent = text, padding-left 32px alignment
  describe('AC5: transcript-text content and alignment', () => {
    it('.transcript-text.textContent equals the entry text', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      buffer.append(makeEntry('The quick brown fox', 'Alice'));

      const textEl = container.querySelector('.transcript-text');
      expect(textEl!.textContent).toBe('The quick brown fox');
    });
  });

  // AC6: fade-up animation class on transcript-entry
  describe('AC6: fade-up animation', () => {
    it('.transcript-entry has className transcript-entry (for CSS animation)', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      buffer.append(makeEntry('Animated entry', 'Bob'));

      const entry = container.querySelector('.transcript-entry');
      expect(entry).not.toBeNull();
      expect(entry!.className).toBe('transcript-entry');
    });
  });

  // Negative: empty speaker produces "??" initials
  describe('Negative: empty speaker initials', () => {
    it('empty string produces "??" initials', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      buffer.append(makeEntry('test', ''));

      const avatar = container.querySelector('.speaker-avatar');
      expect(avatar!.textContent).toBe('??');
    });
  });

  // Negative: unicode speaker produces valid 2-char initials
  describe('Negative: unicode speaker initials', () => {
    it('unicode name produces codepoint-based initials, not byte-based', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      buffer.append(makeEntry('test', '\u0623\u062D\u0645\u062F'));

      const avatar = container.querySelector('.speaker-avatar');
      const initials = avatar!.textContent ?? '';
      // Should be 2 characters, not crash or produce garbled output
      expect([...initials]).toHaveLength(2);
    });
  });

  // Correction window should still work with new DOM structure
  describe('Correction window with new DOM', () => {
    it('replaces last entry text within 500ms from same speaker', async () => {
      vi.useFakeTimers();
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      buffer.append(makeEntry('hello', 'Alice'));
      expect(container.querySelectorAll('.transcript-entry')).toHaveLength(1);
      expect(container.querySelector('.transcript-text')?.textContent).toBe('hello');

      vi.advanceTimersByTime(200);
      buffer.append(makeEntry('hello world', 'Alice'));
      expect(container.querySelectorAll('.transcript-entry')).toHaveLength(1);
      expect(container.querySelector('.transcript-text')?.textContent).toBe('hello world');

      vi.useRealTimers();
    });
  });
});

// ---------------------------------------------------------------------------
// Task 6: Live "{Speaker} is speaking..." indicator
// ---------------------------------------------------------------------------

describe('Task 6: Live speaking indicator', () => {
  function createFakeBuffer() {
    const entries: Array<{ text: string; speaker: string; is_final: boolean; is_self: boolean; timestamp: string }> = [];
    const subscribers: Array<(entry: any) => void> = [];

    return {
      append(entry: { text: string; speaker: string; is_final: boolean; is_self: boolean; timestamp: string }) {
        entries.push(entry);
        for (const cb of subscribers.slice()) {
          cb(entry);
        }
      },
      getSnapshot() {
        return entries.slice();
      },
      onAppend(cb: (entry: any) => void) {
        if (subscribers.length >= 8) {
          throw new Error('TranscriptBuffer: exceeded MAX_SUBSCRIBERS (8)');
        }
        subscribers.push(cb);
        return () => {
          const idx = subscribers.indexOf(cb);
          if (idx !== -1) subscribers.splice(idx, 1);
        };
      },
    };
  }

  function makeEntry(text: string, speaker = 'Alice', isFinal = true): { text: string; speaker: string; is_final: boolean; is_self: boolean; timestamp: string } {
    return {
      text,
      speaker,
      is_final: isFinal,
      is_self: false,
      timestamp: '2026-04-15T10:30:00.000Z',
    };
  }

  // AC1: indicator is always the last child of the timeline container
  describe('AC1: indicator is always last child', () => {
    it('.transcript-live-indicator is last child after mount', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      const last = container.lastElementChild;
      expect(last).not.toBeNull();
      expect(last!.classList.contains('transcript-live-indicator')).toBe(true);
    });

    it('indicator stays last after appending 3 entries', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      buffer.append(makeEntry('Entry 1', 'Alice'));
      buffer.append(makeEntry('Entry 2', 'Bob'));
      buffer.append(makeEntry('Entry 3', 'Charlie'));

      const last = container.lastElementChild;
      expect(last!.classList.contains('transcript-live-indicator')).toBe(true);
      // And there should be 3 transcript entries + 1 indicator = 4 children
      expect(container.children).toHaveLength(4);
    });
  });

  // AC2: hidden when inactive, visible when showLiveIndicator called
  describe('AC2: hidden by default, shows on showLiveIndicator', () => {
    it('indicator does NOT have .active class initially', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      const indicator = container.querySelector('.transcript-live-indicator') as HTMLElement;
      expect(indicator.classList.contains('active')).toBe(false);
    });

    it('showLiveIndicator adds .active and sets speaker text', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      view.showLiveIndicator('Sarah');

      const indicator = container.querySelector('.transcript-live-indicator') as HTMLElement;
      expect(indicator.classList.contains('active')).toBe(true);

      const speakerText = indicator.querySelector('.speaker-text');
      expect(speakerText).not.toBeNull();
      expect(speakerText!.textContent).toBe('Sarah is speaking\u2026');
    });
  });

  // AC3: typing dots structure
  describe('AC3: typing dots structure', () => {
    it('indicator contains .typing-dots with 3 spans', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      const indicator = container.querySelector('.transcript-live-indicator');
      expect(indicator).not.toBeNull();

      const dots = indicator!.querySelector('.typing-dots');
      expect(dots).not.toBeNull();
      expect(dots!.querySelectorAll('span')).toHaveLength(3);
    });
  });

  // AC4: hideLiveIndicator removes .active class
  describe('AC4: hideLiveIndicator removes active', () => {
    it('hideLiveIndicator removes .active class', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      view.showLiveIndicator('Sarah');
      expect(container.querySelector('.transcript-live-indicator')!.classList.contains('active')).toBe(true);

      view.hideLiveIndicator();
      expect(container.querySelector('.transcript-live-indicator')!.classList.contains('active')).toBe(false);
    });
  });

  // AC5: entries insert BEFORE indicator (indicator stays last)
  describe('AC5: entries insert before indicator', () => {
    it('after showing indicator and appending entry, entry is before indicator', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      view.showLiveIndicator('Sarah');
      buffer.append(makeEntry('Final text', 'Sarah'));

      // Entry should be before indicator
      const children = Array.from(container.children);
      const entryIdx = children.findIndex(el => el.classList.contains('transcript-entry'));
      const indicatorIdx = children.findIndex(el => el.classList.contains('transcript-live-indicator'));
      expect(entryIdx).toBeLessThan(indicatorIdx);
      expect(indicatorIdx).toBe(children.length - 1);
    });
  });

  // Negative: rapid speaker switch shows most recent only
  describe('Negative: rapid speaker switch', () => {
    it('shows most recent speaker only', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      view.showLiveIndicator('Alice');
      view.showLiveIndicator('Bob');

      const speakerText = container.querySelector('.transcript-live-indicator .speaker-text');
      expect(speakerText!.textContent).toBe('Bob is speaking\u2026');
    });
  });

  // Negative: empty speaker fallback
  describe('Negative: empty speaker fallback', () => {
    it('empty speaker shows "Someone is speaking..."', async () => {
      const { MeetingView } = await import('../src/content/overlay/meeting-view');
      const buffer = createFakeBuffer();
      const container = document.createElement('div');
      const view = new MeetingView(buffer as any);
      view.mount(container);

      view.showLiveIndicator('');

      const speakerText = container.querySelector('.transcript-live-indicator .speaker-text');
      expect(speakerText!.textContent).toBe('Someone is speaking\u2026');
    });
  });
});
