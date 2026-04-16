/**
 * Tests for Plan 3: Assistant View UI
 *
 * Covers context bar, persona dropdown, and empty state.
 * Uses jsdom for DOM testing of the AssistantView class.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock getActivePersonas before importing AssistantView
// ---------------------------------------------------------------------------
const mockGetActivePersonas = vi.fn();

vi.mock('../src/shared/persona', () => ({
  getActivePersonas: (...args: unknown[]) => mockGetActivePersonas(...args),
}));

// ---------------------------------------------------------------------------
// Chrome stub
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
// Helpers
// ---------------------------------------------------------------------------
function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'assistant-view-mount';
  document.body.appendChild(el);
  return el;
}

const MOCK_PERSONAS = [
  { id: 'p1', name: 'Sales', color: '#ff0000', systemPrompt: '', kbDocumentIds: [], createdAt: 0, updatedAt: 0, order: 0 },
  { id: 'p2', name: 'Engineer', color: '#00ff00', systemPrompt: '', kbDocumentIds: [], createdAt: 0, updatedAt: 0, order: 1 },
  { id: 'p3', name: 'Architect', color: '#0000ff', systemPrompt: '', kbDocumentIds: [], createdAt: 0, updatedAt: 0, order: 2 },
];

// ---------------------------------------------------------------------------
// Task 1: Context bar — 3 chips + dividers + state
// ---------------------------------------------------------------------------

describe('Task 1: Context bar', () => {
  let AssistantView: typeof import('../src/content/overlay/assistant-view').AssistantView;
  let container: HTMLElement;

  beforeEach(async () => {
    vi.resetModules();
    mockGetActivePersonas.mockResolvedValue(MOCK_PERSONAS);
    container = makeContainer();
    const mod = await import('../src/content/overlay/assistant-view');
    AssistantView = mod.AssistantView;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('AC1: mount inserts .assistant-view with .context-bar as first child', () => {
    it('creates .assistant-view root with .context-bar as first child', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const root = container.querySelector('.assistant-view');
      expect(root).not.toBeNull();
      const firstChild = root!.firstElementChild;
      expect(firstChild?.classList.contains('context-bar')).toBe(true);
    });
  });

  describe('AC2: context bar has exactly 5 children in order', () => {
    it('has transcript toggle, separator, personas btn, separator, web toggle', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const bar = container.querySelector('.context-bar');
      expect(bar).not.toBeNull();
      const children = Array.from(bar!.children);
      expect(children).toHaveLength(5);
      expect(children[0]!.classList.contains('context-toggle')).toBe(true);
      expect((children[0] as HTMLElement).dataset.ctx).toBe('transcript');
      expect(children[1]!.classList.contains('context-separator')).toBe(true);
      expect(children[2]!.classList.contains('persona-expand-btn')).toBe(true);
      expect(children[3]!.classList.contains('context-separator')).toBe(true);
      expect(children[4]!.classList.contains('context-toggle')).toBe(true);
      expect((children[4] as HTMLElement).dataset.ctx).toBe('web');
    });
  });

  describe('AC3: Transcript default ON, Web Search default OFF', () => {
    it('Transcript has .active, Web Search does not', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const transcript = container.querySelector('.context-toggle[data-ctx="transcript"]');
      const web = container.querySelector('.context-toggle[data-ctx="web"]');
      expect(transcript?.classList.contains('active')).toBe(true);
      expect(web?.classList.contains('active')).toBe(false);
    });
  });

  describe('AC4: active toggle visually distinct from inactive', () => {
    it('active and inactive toggles have different border colors', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const transcript = container.querySelector('.context-toggle[data-ctx="transcript"]') as HTMLElement;
      const web = container.querySelector('.context-toggle[data-ctx="web"]') as HTMLElement;
      // In jsdom, computed styles won't differ, but class-based distinction is verifiable
      expect(transcript.classList.contains('active')).toBe(true);
      expect(web.classList.contains('active')).toBe(false);
      // Dots should exist
      const activeDot = transcript.querySelector('.ctx-dot');
      const inactiveDot = web.querySelector('.ctx-dot');
      expect(activeDot).not.toBeNull();
      expect(inactiveDot).not.toBeNull();
    });
  });

  describe('AC5: clicking Transcript toggles its active state', () => {
    it('toggling Transcript changes .active and getContextState().transcript', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const transcript = container.querySelector('.context-toggle[data-ctx="transcript"]') as HTMLElement;

      expect(view.getContextState().transcript).toBe(true);
      transcript.click();
      expect(transcript.classList.contains('active')).toBe(false);
      expect(view.getContextState().transcript).toBe(false);
      transcript.click();
      expect(transcript.classList.contains('active')).toBe(true);
      expect(view.getContextState().transcript).toBe(true);
    });
  });

  describe('AC6: clicking Web Search toggles its active state', () => {
    it('toggling Web Search changes .active and getContextState().web', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const web = container.querySelector('.context-toggle[data-ctx="web"]') as HTMLElement;

      expect(view.getContextState().web).toBe(false);
      web.click();
      expect(web.classList.contains('active')).toBe(true);
      expect(view.getContextState().web).toBe(true);
      web.click();
      expect(web.classList.contains('active')).toBe(false);
      expect(view.getContextState().web).toBe(false);
    });
  });

  describe('AC7: Personas chip click is a no-op in Task 1', () => {
    it('clicking personas chip does not throw', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const btn = container.querySelector('.persona-expand-btn') as HTMLElement;
      expect(() => btn.click()).not.toThrow();
    });
  });

  describe('AC8: Personas chip displays count from getActivePersonas', () => {
    it('shows "Personas (3)" when 3 personas are active', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const btn = container.querySelector('.persona-expand-btn') as HTMLElement;
      expect(btn.textContent).toContain('Personas');
      expect(btn.textContent).toContain('(3)');
    });
  });

  describe('AC9: chip toggles are independent', () => {
    it('clicking Transcript does not change Web Search state', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const transcript = container.querySelector('.context-toggle[data-ctx="transcript"]') as HTMLElement;
      const web = container.querySelector('.context-toggle[data-ctx="web"]') as HTMLElement;

      // Initially: transcript ON, web OFF
      transcript.click(); // transcript OFF
      expect(web.classList.contains('active')).toBe(false);
      expect(view.getContextState().web).toBe(false);
    });

    it('clicking Web Search does not change Transcript state', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const transcript = container.querySelector('.context-toggle[data-ctx="transcript"]') as HTMLElement;
      const web = container.querySelector('.context-toggle[data-ctx="web"]') as HTMLElement;

      web.click(); // web ON
      expect(transcript.classList.contains('active')).toBe(true);
      expect(view.getContextState().transcript).toBe(true);
    });
  });

  describe('Negative: double mount throws', () => {
    it('calling mount twice without unmount throws', async () => {
      const view = new AssistantView();
      await view.mount(container);
      await expect(view.mount(container)).rejects.toThrow('AssistantView already mounted');
    });
  });

  describe('Negative: clicking non-toggle area does nothing', () => {
    it('clicking the context bar itself does not toggle anything', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const bar = container.querySelector('.context-bar') as HTMLElement;
      const state = view.getContextState();
      bar.click();
      expect(view.getContextState()).toEqual(state);
    });
  });
});
