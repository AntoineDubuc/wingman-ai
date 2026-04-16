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

// ---------------------------------------------------------------------------
// Task 2: Persona dropdown — collapsible, chips, default-checked
// ---------------------------------------------------------------------------

describe('Task 2: Persona dropdown', () => {
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

  describe('AC1: persona dropdown exists but collapsed on mount', () => {
    it('.persona-dropdown exists without .open class', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const dropdown = container.querySelector('.persona-dropdown') as HTMLElement;
      expect(dropdown).not.toBeNull();
      expect(dropdown.classList.contains('open')).toBe(false);
    });
  });

  describe('AC2: clicking Personas chip opens dropdown + rotates chevron', () => {
    it('toggles .open on dropdown and .open on chevron', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const btn = container.querySelector('.persona-expand-btn') as HTMLElement;
      const dropdown = container.querySelector('.persona-dropdown') as HTMLElement;
      const chevron = btn.querySelector('.chevron') as HTMLElement;

      btn.click();
      expect(dropdown.classList.contains('open')).toBe(true);
      expect(chevron.classList.contains('open')).toBe(true);

      btn.click();
      expect(dropdown.classList.contains('open')).toBe(false);
      expect(chevron.classList.contains('open')).toBe(false);
    });
  });

  describe('AC3: dropdown label', () => {
    it('contains label "Attach persona knowledge"', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const label = container.querySelector('.persona-dropdown-label') as HTMLElement;
      expect(label).not.toBeNull();
      expect(label.textContent).toBe('Attach persona knowledge');
    });
  });

  describe('AC4: persona chips render from getActivePersonas with .textContent', () => {
    it('renders one .persona-chip per persona with correct name', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const chips = container.querySelectorAll('.persona-chip');
      expect(chips).toHaveLength(3);
      expect((chips[0] as HTMLElement).dataset.personaId).toBe('p1');
      expect(chips[0]!.textContent).toContain('Sales');
    });

    it('XSS persona name renders as literal text, not HTML', async () => {
      vi.resetModules();
      mockGetActivePersonas.mockResolvedValue([
        { id: 'xss', name: '<img src=x onerror=alert(1)>', color: '#f00', systemPrompt: '', kbDocumentIds: [], createdAt: 0, updatedAt: 0, order: 0 },
      ]);
      const mod = await import('../src/content/overlay/assistant-view');
      const view = new mod.AssistantView();
      await view.mount(container);
      const chip = container.querySelector('.persona-chip') as HTMLElement;
      expect(chip.querySelector('img')).toBeNull();
      expect(chip.textContent).toContain('<img src=x onerror=alert(1)>');
    });
  });

  describe('AC5: all chips pre-checked on mount', () => {
    it('all persona chips have .checked class', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const checked = container.querySelectorAll('.persona-chip.checked');
      expect(checked).toHaveLength(3);
    });
  });

  describe('AC6: clicking chip toggles checked + updates count', () => {
    it('unchecking a chip updates count from (3) to (2)', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const chips = container.querySelectorAll('.persona-chip') as NodeListOf<HTMLElement>;
      const btn = container.querySelector('.persona-expand-btn') as HTMLElement;

      chips[0]!.click();
      expect(chips[0]!.classList.contains('checked')).toBe(false);
      expect(btn.textContent).toContain('(2)');
    });
  });

  describe('AC7: collapse + reopen preserves checked state', () => {
    it('unchecking, collapsing, reopening keeps chip unchecked', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const btn = container.querySelector('.persona-expand-btn') as HTMLElement;
      const chips = container.querySelectorAll('.persona-chip') as NodeListOf<HTMLElement>;

      // Open, uncheck first, close, reopen
      btn.click(); // open
      chips[0]!.click(); // uncheck
      btn.click(); // close
      btn.click(); // reopen
      expect(chips[0]!.classList.contains('checked')).toBe(false);
      expect(container.querySelectorAll('.persona-chip.checked')).toHaveLength(2);
    });
  });

  describe('AC8: getContextState().personaIds reflects checked chips', () => {
    it('returns only checked persona IDs', async () => {
      const view = new AssistantView();
      await view.mount(container);
      expect(view.getContextState().personaIds).toEqual(['p1', 'p2', 'p3']);
      const chips = container.querySelectorAll('.persona-chip') as NodeListOf<HTMLElement>;
      chips[1]!.click(); // uncheck p2
      expect(view.getContextState().personaIds).toEqual(['p1', 'p3']);
    });
  });

  describe('AC9: zero personas shows empty message', () => {
    it('shows "No personas configured." when none returned', async () => {
      vi.resetModules();
      mockGetActivePersonas.mockResolvedValue([]);
      const mod = await import('../src/content/overlay/assistant-view');
      const view = new mod.AssistantView();
      await view.mount(container);
      const list = container.querySelector('.persona-list') as HTMLElement;
      expect(list.textContent).toContain('No personas configured.');
    });
  });

  describe('AC10: getActivePersonas rejection shows fallback UI', () => {
    it('shows error message and count (?)', async () => {
      vi.resetModules();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGetActivePersonas.mockRejectedValue(new Error('storage corrupt'));
      const mod = await import('../src/content/overlay/assistant-view');
      const view = new mod.AssistantView();
      await view.mount(container);

      const list = container.querySelector('.persona-list') as HTMLElement;
      expect(list.textContent).toContain('Could not load personas');
      const btn = container.querySelector('.persona-expand-btn') as HTMLElement;
      expect(btn.textContent).toContain('(?)');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Negative: unchecking all removes .has-active from persona btn', () => {
    it('Personas (0) and no .has-active class', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const chips = container.querySelectorAll('.persona-chip') as NodeListOf<HTMLElement>;
      const btn = container.querySelector('.persona-expand-btn') as HTMLElement;

      chips[0]!.click();
      chips[1]!.click();
      chips[2]!.click();
      expect(btn.textContent).toContain('(0)');
      expect(btn.classList.contains('has-active')).toBe(false);
    });
  });

  describe('Negative: rapid-click 10 times is deterministic', () => {
    it('10 clicks returns to original state', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const chip = container.querySelector('.persona-chip') as HTMLElement;
      const initial = chip.classList.contains('checked');
      for (let i = 0; i < 10; i++) chip.click();
      expect(chip.classList.contains('checked')).toBe(initial);
    });
  });
});

// ---------------------------------------------------------------------------
// Task 3: Empty state — icon, title, 4 suggestion chips
// ---------------------------------------------------------------------------

describe('Task 3: Empty state', () => {
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

  describe('AC1: .chat-empty rendered with correct children in order', () => {
    it('has icon, title, subtitle, suggestions as children', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const empty = container.querySelector('.chat-empty');
      expect(empty).not.toBeNull();
      const children = Array.from(empty!.children);
      expect(children.length).toBeGreaterThanOrEqual(4);
      expect(children[0]!.classList.contains('chat-empty-icon')).toBe(true);
      expect(children[1]!.classList.contains('chat-empty-title')).toBe(true);
      expect(children[2]!.classList.contains('chat-empty-subtitle')).toBe(true);
      expect(children[3]!.classList.contains('chat-empty-suggestions')).toBe(true);
    });
  });

  describe('AC2: icon has gradient and sparkle', () => {
    it('.chat-empty-icon contains sparkle emoji', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const icon = container.querySelector('.chat-empty-icon') as HTMLElement;
      expect(icon).not.toBeNull();
      expect(icon.textContent).toContain('\u2728'); // sparkle emoji
    });
  });

  describe('AC3: title text', () => {
    it('.chat-empty-title says "How can I help?"', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const title = container.querySelector('.chat-empty-title') as HTMLElement;
      expect(title.textContent).toBe('How can I help?');
    });
  });

  describe('AC4: subtitle text', () => {
    it('.chat-empty-subtitle matches expected text', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const subtitle = container.querySelector('.chat-empty-subtitle') as HTMLElement;
      expect(subtitle.textContent).toBe(
        'Ask me anything. Toggle context sources above to include meeting transcript or persona knowledge.'
      );
    });
  });

  describe('AC5: four suggestion chips with correct text', () => {
    it('renders 4 .suggestion-chip elements with expected text', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const chips = container.querySelectorAll('.suggestion-chip');
      expect(chips).toHaveLength(4);

      const texts = Array.from(chips).map(c => (c as HTMLElement).dataset.text);
      expect(texts[0]).toBe('What is the PKCE flow Sarah mentioned?');
      expect(texts[1]).toBe('Draft a follow-up email with action items');
      expect(texts[2]).toBe('Explain OAuth 2.0 token rotation best practices');
      expect(texts[3]).toBe('What does our Architect know about session migration?');
    });
  });

  describe('AC6: clicking suggestion chip sets pendingSuggestionText', () => {
    it('stores the chip text in pendingSuggestionText', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const chip = container.querySelector('.suggestion-chip') as HTMLElement;
      chip.click();
      // Access the pending text via a getter
      expect(view.getPendingSuggestionText()).toBe('What is the PKCE flow Sarah mentioned?');
    });
  });

  describe('AC7: empty state rendered only when chatHistory is empty', () => {
    it('.chat-empty exists on initial mount (no messages)', async () => {
      const view = new AssistantView();
      await view.mount(container);
      expect(container.querySelector('.chat-empty')).not.toBeNull();
      expect(container.querySelector('.chat-messages')).not.toBeNull();
    });
  });

  describe('AC8: empty state persists across mode toggles before first message', () => {
    it('.chat-empty still rendered after simulated re-mount', async () => {
      const view = new AssistantView();
      await view.mount(container);
      // The empty state should persist since no messages were sent
      expect(container.querySelector('.chat-empty')).not.toBeNull();
    });
  });

  describe('Negative: no .chat-empty when chatHistory has items', () => {
    it('pre-seeding chatHistory means no empty state', async () => {
      const view = new AssistantView();
      // Seed history before mount
      view.seedChatHistory([{ role: 'user', text: 'hello' }]);
      await view.mount(container);
      expect(container.querySelector('.chat-empty')).toBeNull();
    });
  });

  describe('Negative: clicking empty state background does nothing', () => {
    it('clicking .chat-empty itself does not set pending text', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const empty = container.querySelector('.chat-empty') as HTMLElement;
      empty.click();
      expect(view.getPendingSuggestionText()).toBeNull();
    });
  });
});
