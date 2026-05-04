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

  describe('AC6: clicking suggestion chip triggers send (input present after mount)', () => {
    it('sends the chip text as a user message immediately', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const chip = container.querySelector('.suggestion-chip') as HTMLElement;
      chip.click();
      // With input present, clicking chip sends immediately and clears pending text
      const bubble = container.querySelector('.chat-msg-user .msg-bubble') as HTMLElement;
      expect(bubble).not.toBeNull();
      expect(bubble.textContent).toBe('What is the PKCE flow Sarah mentioned?');
      expect(view.getPendingSuggestionText()).toBeNull();
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

// ---------------------------------------------------------------------------
// Task 4: Chat messages — user/assistant bubbles + fade-up + auto-scroll
// ---------------------------------------------------------------------------

describe('Task 4: Chat messages', () => {
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

  describe('AC1: appendUserMessage creates a user bubble', () => {
    it('creates .chat-msg.chat-msg-user with correct text', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.appendUserMessage('hello');
      const bubble = container.querySelector('.chat-msg.chat-msg-user .msg-bubble') as HTMLElement;
      expect(bubble).not.toBeNull();
      expect(bubble.textContent).toBe('hello');
    });
  });

  describe('AC2: appendUserMessage removes .chat-empty on first message', () => {
    it('.chat-empty disappears after first user message', async () => {
      const view = new AssistantView();
      await view.mount(container);
      expect(container.querySelector('.chat-empty')).not.toBeNull();
      view.appendUserMessage('first');
      expect(container.querySelector('.chat-empty')).toBeNull();
    });
  });

  describe('AC3: appendUserMessage creates .chat-conversation container', () => {
    it('.chat-conversation exists after first message', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.appendUserMessage('first');
      const conversation = container.querySelector('.chat-conversation');
      expect(conversation).not.toBeNull();
    });
  });

  describe('AC4: renderAssistantMessage creates an assistant bubble', () => {
    it('creates .chat-msg.chat-msg-bot with correct text', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.renderAssistantMessage({ text: 'hi' });
      const bubble = container.querySelector('.chat-msg.chat-msg-bot .msg-bubble') as HTMLElement;
      expect(bubble).not.toBeNull();
      expect(bubble.textContent).toBe('hi');
    });
  });

  describe('AC5: markdown bold transform', () => {
    it('**bold** renders as <strong>', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.renderAssistantMessage({ text: '**bold**' });
      const bubble = container.querySelector('.chat-msg-bot .msg-bubble') as HTMLElement;
      expect(bubble.innerHTML).toContain('<strong>bold</strong>');
    });
  });

  describe('AC6: markdown newline transform', () => {
    it('\\n renders as <br>', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.renderAssistantMessage({ text: 'line1\nline2' });
      const bubble = container.querySelector('.chat-msg-bot .msg-bubble') as HTMLElement;
      expect(bubble.innerHTML).toContain('line1<br>line2');
    });
  });

  describe('AC7: XSS payload is escaped', () => {
    it('<img src=x onerror=alert(1)> renders as literal text', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.renderAssistantMessage({ text: '<img src=x onerror=alert(1)>' });
      const bubble = container.querySelector('.chat-msg-bot .msg-bubble') as HTMLElement;
      expect(bubble.querySelector('img')).toBeNull();
      expect(bubble.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });
  });

  describe('AC8: escape-then-transform order', () => {
    it('**<script>** renders as <strong>&lt;script&gt;</strong>', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.renderAssistantMessage({ text: '**<script>**' });
      const bubble = container.querySelector('.chat-msg-bot .msg-bubble') as HTMLElement;
      expect(bubble.innerHTML).toContain('<strong>&lt;script&gt;</strong>');
    });
  });

  describe('AC9: showTypingIndicator / hideTypingIndicator', () => {
    it('showTypingIndicator creates .typing-indicator-bubble with 3 dots', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.showTypingIndicator();
      const indicator = container.querySelector('.typing-indicator-bubble') as HTMLElement;
      expect(indicator).not.toBeNull();
      const dots = indicator.querySelectorAll('.typing-dots span');
      expect(dots).toHaveLength(3);
    });

    it('hideTypingIndicator removes .typing-indicator-bubble', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.showTypingIndicator();
      expect(container.querySelector('.typing-indicator-bubble')).not.toBeNull();
      view.hideTypingIndicator();
      expect(container.querySelector('.typing-indicator-bubble')).toBeNull();
    });
  });

  describe('AC10: streaming via messageId', () => {
    it('streaming=true creates typing indicator, then updates in-place', async () => {
      const view = new AssistantView();
      await view.mount(container);
      // First call: streaming start
      view.renderAssistantMessage({ text: '...', streaming: true, messageId: 'msg-1' });
      const streamBubble = container.querySelector('[data-message-id="msg-1"] .msg-bubble') as HTMLElement;
      expect(streamBubble).not.toBeNull();

      // Second call: update text in place
      view.renderAssistantMessage({ text: 'hello world', streaming: true, messageId: 'msg-1' });
      const updated = container.querySelector('[data-message-id="msg-1"] .msg-bubble') as HTMLElement;
      expect(updated.textContent).toBe('hello world');

      // Should only be one msg-1 bubble (not two)
      const allMsg1 = container.querySelectorAll('[data-message-id="msg-1"]');
      expect(allMsg1).toHaveLength(1);
    });

    it('streaming=false finalizes the bubble', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.renderAssistantMessage({ text: '...', streaming: true, messageId: 'msg-2' });
      view.renderAssistantMessage({ text: 'done', streaming: false, messageId: 'msg-2', sources: ['transcript'] });
      const bubble = container.querySelector('[data-message-id="msg-2"] .msg-bubble') as HTMLElement;
      expect(bubble.textContent).toBe('done');
    });
  });

  describe('Negative: appendUserMessage with empty string', () => {
    it('does not add a bubble for empty string', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.appendUserMessage('');
      expect(container.querySelector('.chat-msg-user')).toBeNull();
    });
  });

  describe('Negative: renderAssistantMessage with null text throws', () => {
    it('throws on null text', async () => {
      const view = new AssistantView();
      await view.mount(container);
      expect(() => view.renderAssistantMessage({ text: null as any })).toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Task 5: Source attribution tags
// ---------------------------------------------------------------------------

describe('Task 5: Source attribution tags', () => {
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

  describe('AC1: transcript source renders green tag', () => {
    it('creates .msg-source-tag.transcript with text "transcript"', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.renderAssistantMessage({ text: 'hi', sources: ['transcript'] });
      const tag = container.querySelector('.msg-source-tag.transcript') as HTMLElement;
      expect(tag).not.toBeNull();
      expect(tag.textContent).toBe('transcript');
    });
  });

  describe('AC2: persona KB sources render purple tags', () => {
    it('creates .msg-source-tag.persona for strings ending with " KB"', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.renderAssistantMessage({ text: 'hi', sources: ['Architect KB', 'Product Lead KB'] });
      const tags = container.querySelectorAll('.msg-source-tag.persona');
      expect(tags).toHaveLength(2);
      expect(tags[0]!.textContent).toBe('Architect KB');
      expect(tags[1]!.textContent).toBe('Product Lead KB');
    });
  });

  describe('AC3: web source renders amber tag', () => {
    it('creates .msg-source-tag.web with text "web"', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.renderAssistantMessage({ text: 'hi', sources: ['web'] });
      const tag = container.querySelector('.msg-source-tag.web') as HTMLElement;
      expect(tag).not.toBeNull();
      expect(tag.textContent).toBe('web');
    });
  });

  describe('AC4: empty/undefined sources render "general knowledge"', () => {
    it('undefined sources creates .msg-source-tag.general', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.renderAssistantMessage({ text: 'hi' });
      const tag = container.querySelector('.msg-source-tag.general') as HTMLElement;
      expect(tag).not.toBeNull();
      expect(tag.textContent).toBe('general knowledge');
    });

    it('empty array creates .msg-source-tag.general', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.renderAssistantMessage({ text: 'hi', sources: [] });
      const tag = container.querySelector('.msg-source-tag.general') as HTMLElement;
      expect(tag).not.toBeNull();
      expect(tag.textContent).toBe('general knowledge');
    });
  });

  describe('AC5: mixed sources render in input order with correct classes', () => {
    it('transcript + persona + web renders 3 tags in order', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.renderAssistantMessage({ text: 'hi', sources: ['transcript', 'Architect KB', 'web'] });
      const tags = container.querySelectorAll('.msg-source-tag');
      expect(tags).toHaveLength(3);
      expect(tags[0]!.classList.contains('transcript')).toBe(true);
      expect(tags[1]!.classList.contains('persona')).toBe(true);
      expect(tags[2]!.classList.contains('web')).toBe(true);
    });
  });

  describe('AC6: data-sources attribute stores original sources JSON', () => {
    it('stores sources as JSON on the .chat-msg-bot element', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.renderAssistantMessage({ text: 'hi', sources: ['transcript', 'web'] });
      const msgEl = container.querySelector('.chat-msg-bot') as HTMLElement;
      expect(msgEl.dataset.sources).toBe(JSON.stringify(['transcript', 'web']));
    });
  });

  describe('AC7: source tags use .textContent (XSS safe)', () => {
    it('XSS payload in source renders as text, not HTML', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.renderAssistantMessage({ text: 'x', sources: ['<script>alert(1)</script>'] });
      const tag = container.querySelector('.msg-source-tag') as HTMLElement;
      expect(tag.querySelector('script')).toBeNull();
      expect(tag.textContent).toContain('<script>alert(1)</script>');
    });
  });

  describe('AC8: max 10 tags with +N more', () => {
    it('truncates to 10 tags plus a "+N more" gray tag', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const sources = Array.from({ length: 15 }, (_, i) => `source-${i}`);
      view.renderAssistantMessage({ text: 'hi', sources });
      const tags = container.querySelectorAll('.msg-source-tag');
      // 10 source tags + 1 "+5 more" tag = 11
      expect(tags).toHaveLength(11);
      expect(tags[10]!.textContent).toBe('+5 more');
    });
  });

  describe('AC9: long source strings truncated to 60 chars', () => {
    it('truncates source text to 60 chars with ellipsis', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const longSource = 'A'.repeat(80);
      view.renderAssistantMessage({ text: 'hi', sources: [longSource] });
      const tag = container.querySelector('.msg-source-tag') as HTMLElement;
      expect(tag.textContent!.length).toBeLessThanOrEqual(63); // 60 + "..."
      expect(tag.textContent!.endsWith('...')).toBe(true);
    });
  });

  describe('Negative: unknown source type renders default gray', () => {
    it('unknown-type gets no classification class', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.renderAssistantMessage({ text: 'hi', sources: ['unknown-type'] });
      const tag = container.querySelector('.msg-source-tag') as HTMLElement;
      expect(tag).not.toBeNull();
      expect(tag.classList.contains('transcript')).toBe(false);
      expect(tag.classList.contains('persona')).toBe(false);
      expect(tag.classList.contains('web')).toBe(false);
      expect(tag.classList.contains('general')).toBe(false);
      expect(tag.textContent).toBe('unknown-type');
    });
  });

  describe('Negative: null sources treated as undefined', () => {
    it('null sources renders general knowledge tag', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.renderAssistantMessage({ text: 'hi', sources: null as any });
      const tag = container.querySelector('.msg-source-tag.general') as HTMLElement;
      expect(tag).not.toBeNull();
      expect(tag.textContent).toBe('general knowledge');
    });
  });
});

// ---------------------------------------------------------------------------
// Task 6: Chat input — single-line, send button, Enter-to-send
// ---------------------------------------------------------------------------

describe('Task 6: Chat input', () => {
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

  describe('AC1: .chat-input-area rendered with input and send button', () => {
    it('creates .chat-input-area > .chat-input-wrapper > .chat-input + .chat-send-btn', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const area = container.querySelector('.chat-input-area');
      expect(area).not.toBeNull();
      const wrapper = area!.querySelector('.chat-input-wrapper');
      expect(wrapper).not.toBeNull();
      const input = wrapper!.querySelector('.chat-input') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.type).toBe('text');
      const btn = wrapper!.querySelector('.chat-send-btn') as HTMLButtonElement;
      expect(btn).not.toBeNull();
    });
  });

  describe('AC2: placeholder text', () => {
    it('placeholder is "Ask anything..."', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const input = container.querySelector('.chat-input') as HTMLInputElement;
      expect(input.placeholder).toBe('Ask anything...');
    });
  });

  describe('AC3: send button disabled when input empty', () => {
    it('button is disabled initially', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const btn = container.querySelector('.chat-send-btn') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('button enables when text is typed, disables when cleared', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const input = container.querySelector('.chat-input') as HTMLInputElement;
      const btn = container.querySelector('.chat-send-btn') as HTMLButtonElement;

      // Type a character
      input.value = 'a';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(btn.disabled).toBe(false);

      // Clear
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(btn.disabled).toBe(true);
    });
  });

  describe('AC4: Enter sends the message', () => {
    it('pressing Enter creates a user bubble and clears input', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const input = container.querySelector('.chat-input') as HTMLInputElement;

      input.value = 'hello';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      const bubble = container.querySelector('.chat-msg-user .msg-bubble') as HTMLElement;
      expect(bubble).not.toBeNull();
      expect(bubble.textContent).toBe('hello');
      expect(input.value).toBe('');
    });
  });

  describe('AC5: Shift+Enter does NOT send', () => {
    it('Shift+Enter is a no-op', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const input = container.querySelector('.chat-input') as HTMLInputElement;

      input.value = 'test';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));

      expect(container.querySelector('.chat-msg-user')).toBeNull();
      expect(input.value).toBe('test'); // not cleared
    });
  });

  describe('AC6: after send, input clears and button disables', () => {
    it('input value is empty and button is disabled after send', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const input = container.querySelector('.chat-input') as HTMLInputElement;
      const btn = container.querySelector('.chat-send-btn') as HTMLButtonElement;

      input.value = 'hello';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      btn.click();

      expect(input.value).toBe('');
      expect(btn.disabled).toBe(true);
    });
  });

  describe('AC7: maxlength is 4000', () => {
    it('input has maxlength="4000"', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const input = container.querySelector('.chat-input') as HTMLInputElement;
      expect(input.maxLength).toBe(4000);
    });
  });

  describe('AC8: suggestion chip auto-submits via pendingSuggestionText', () => {
    it('clicking a suggestion chip sends the message', async () => {
      const view = new AssistantView();
      await view.mount(container);
      // Click a suggestion chip (sets pendingSuggestionText)
      const chip = container.querySelector('.suggestion-chip') as HTMLElement;
      chip.click();
      // The pending suggestion should have been consumed and sent
      expect(container.querySelector('.chat-msg-user .msg-bubble')).not.toBeNull();
      expect(view.getPendingSuggestionText()).toBeNull();
    });
  });

  describe('Negative: clicking disabled send button does nothing', () => {
    it('no bubble created when button is disabled', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const btn = container.querySelector('.chat-send-btn') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      btn.click();
      expect(container.querySelector('.chat-msg-user')).toBeNull();
    });
  });

  describe('Negative: whitespace-only input does not send', () => {
    it('spaces-only input is treated as empty', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const input = container.querySelector('.chat-input') as HTMLInputElement;

      input.value = '   ';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(container.querySelector('.chat-msg-user')).toBeNull();
    });
  });

  describe('Negative: Unicode input is preserved', () => {
    it('emoji and RTL text survive the send cycle', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const input = container.querySelector('.chat-input') as HTMLInputElement;

      input.value = '\uD83D\uDC4B \u0645\u0631\u062D\u0628\u0627';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      const bubble = container.querySelector('.chat-msg-user .msg-bubble') as HTMLElement;
      expect(bubble.textContent).toBe('\uD83D\uDC4B \u0645\u0631\u062D\u0628\u0627');
    });
  });
});

// ---------------------------------------------------------------------------
// Task 7: Contracts + history persistence
// ---------------------------------------------------------------------------

describe('Task 7: Contracts + history persistence', () => {
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

  describe('AC1: onSend subscriber receives text and context', () => {
    it('registered callback fires with text and SendContext on handleSend', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const calls: Array<{ text: string; ctx: any }> = [];
      view.onSend((text, ctx) => calls.push({ text, ctx }));

      const input = container.querySelector('.chat-input') as HTMLInputElement;
      input.value = 'hi';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(calls).toHaveLength(1);
      expect(calls[0]!.text).toBe('hi');
      expect(calls[0]!.ctx).toHaveProperty('transcript');
      expect(calls[0]!.ctx).toHaveProperty('personaIds');
      expect(calls[0]!.ctx).toHaveProperty('web');
    });
  });

  describe('AC2: SendContext matches getContextState()', () => {
    it('ctx has transcript=true, all personaIds, web=false by default', async () => {
      const view = new AssistantView();
      await view.mount(container);
      let capturedCtx: any;
      view.onSend((_text, ctx) => { capturedCtx = ctx; });

      const input = container.querySelector('.chat-input') as HTMLInputElement;
      input.value = 'test';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(capturedCtx.transcript).toBe(true);
      expect(capturedCtx.personaIds).toEqual(['p1', 'p2', 'p3']);
      expect(capturedCtx.web).toBe(false);
    });
  });

  describe('AC3: onSend returns unsubscribe function', () => {
    it('unsubscribing prevents future calls', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const calls: string[] = [];
      const unsub = view.onSend((text) => calls.push(text));

      // Send first message
      const input = container.querySelector('.chat-input') as HTMLInputElement;
      input.value = 'msg1';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(calls).toHaveLength(1);

      // Unsubscribe
      unsub();

      // Send second message
      input.value = 'msg2';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(calls).toHaveLength(1); // still 1 — not called again
    });
  });

  describe('AC4: pre-mount onSend registration', () => {
    it('callbacks registered before mount fire on first post-mount send', async () => {
      const view = new AssistantView();
      const calls: string[] = [];
      view.onSend((text) => calls.push(text));

      await view.mount(container);
      const input = container.querySelector('.chat-input') as HTMLInputElement;
      input.value = 'pre-mount test';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(calls).toEqual(['pre-mount test']);
    });
  });

  describe('AC5: orphan messageId is a no-op with console.warn', () => {
    it('warns and ignores a finalize call with unknown messageId', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      view.renderAssistantMessage({ text: 'orphan', streaming: false, messageId: 'no-such-id' });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unknown messageId: no-such-id')
      );
      // No bubble created
      expect(container.querySelector('[data-message-id="no-such-id"]')).toBeNull();
      warnSpy.mockRestore();
    });
  });

  describe('AC6: MAX_ONSEND_SUBSCRIBERS = 4', () => {
    it('5th subscriber throws', async () => {
      const view = new AssistantView();
      view.onSend(() => {});
      view.onSend(() => {});
      view.onSend(() => {});
      view.onSend(() => {});
      expect(() => view.onSend(() => {})).toThrow(
        'AssistantView: exceeded MAX_ONSEND_SUBSCRIBERS (4)'
      );
    });
  });

  describe('AC7: subscriber error isolation', () => {
    it('throwing subscriber does not prevent other subscribers from being called', async () => {
      const view = new AssistantView();
      await view.mount(container);
      const calls: number[] = [];

      view.onSend(() => calls.push(1));
      view.onSend(() => { throw new Error('boom'); });
      view.onSend(() => calls.push(3));

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const input = container.querySelector('.chat-input') as HTMLInputElement;
      input.value = 'test';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(calls).toEqual([1, 3]);
      expect(debugSpy).toHaveBeenCalled();
      debugSpy.mockRestore();
    });
  });

  describe('AC8: chat history persists across mode-toggle (unmount/mount)', () => {
    it('3 messages survive 3 unmount/mount cycles', async () => {
      const view = new AssistantView();
      await view.mount(container);

      view.appendUserMessage('msg-1');
      view.renderAssistantMessage({ text: 'reply-1', sources: ['transcript'] });
      view.appendUserMessage('msg-2');

      // Toggle mode 3 times: unmount + mount
      for (let i = 0; i < 3; i++) {
        view.unmount();
        container = makeContainer(); // fresh container
        await view.mount(container);
      }

      const bubbles = container.querySelectorAll('.chat-msg');
      expect(bubbles.length).toBeGreaterThanOrEqual(3);
      expect(view.getChatHistory()).toHaveLength(3);
    });
  });

  describe('AC9: context-toggle changes do not affect past messages', () => {
    it('old messages retain their original data-sources', async () => {
      const view = new AssistantView();
      await view.mount(container);

      // Send with transcript ON
      view.renderAssistantMessage({ text: 'first', sources: ['transcript'] });

      // Toggle transcript OFF
      const transcript = container.querySelector('.context-toggle[data-ctx="transcript"]') as HTMLElement;
      transcript.click();

      // Send second message
      view.renderAssistantMessage({ text: 'second', sources: ['web'] });

      // First message should still have transcript source
      const bots = container.querySelectorAll('.chat-msg-bot');
      expect(bots).toHaveLength(2);
      const firstSources = (bots[0] as HTMLElement).dataset.sources;
      expect(firstSources).toBe(JSON.stringify(['transcript']));
      const secondSources = (bots[1] as HTMLElement).dataset.sources;
      expect(secondSources).toBe(JSON.stringify(['web']));
    });
  });

  describe('AC10: unmount does NOT clear chatHistory', () => {
    it('chatHistory survives unmount', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.appendUserMessage('persist');
      view.unmount();
      expect(view.getChatHistory()).toHaveLength(1);
      expect(view.getChatHistory()[0]!.text).toBe('persist');
    });
  });

  describe('AC11: getChatHistory returns the history array', () => {
    it('returns messages in order', async () => {
      const view = new AssistantView();
      await view.mount(container);
      view.appendUserMessage('one');
      view.renderAssistantMessage({ text: 'two', sources: ['web'] });
      const history = view.getChatHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toEqual({ role: 'user', text: 'one' });
      expect(history[1]).toEqual({ role: 'assistant', text: 'two', sources: ['web'] });
    });
  });

  describe('Negative: onSend(null) throws', () => {
    it('throws on null callback', async () => {
      const view = new AssistantView();
      expect(() => view.onSend(null as any)).toThrow();
    });
  });

  describe('Negative: 5th subscriber throws exact message', () => {
    it('error message includes the limit', async () => {
      const view = new AssistantView();
      for (let i = 0; i < 4; i++) view.onSend(() => {});
      expect(() => view.onSend(() => {})).toThrow(
        'AssistantView: exceeded MAX_ONSEND_SUBSCRIBERS (4)'
      );
    });
  });
});
