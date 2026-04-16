/**
 * AssistantView — the Assistant tab UI inside the overlay Shadow DOM.
 *
 * Mounts into `.assistant-view-mount` created by Plan 2. Renders:
 * - Context bar (Transcript / Personas / Web Search toggles)
 * - Persona dropdown (collapsible, pre-checked chips)
 * - Chat empty state with suggestion chips
 * - Chat messages area (Task 4+)
 * - Chat input (Task 6)
 *
 * All state lives here — nothing bleeds into overlay.ts.
 *
 * Plan 3 of 5 — In-Meeting Assistant.
 */

import { getActivePersonas } from '../../shared/persona';
import type { Persona } from '../../shared/persona';

/** Shape returned by getContextState(). */
export interface ContextState {
  transcript: boolean;
  personaIds: string[];
  web: boolean;
}

/** A single chat message in history. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
}

/** Suggestion chip definitions for the empty state. */
const SUGGESTION_CHIPS = [
  { icon: '\uD83D\uDCC4', text: 'What is the PKCE flow Sarah mentioned?' },
  { icon: '\u2709', text: 'Draft a follow-up email with action items' },
  { icon: '\uD83D\uDCDA', text: 'Explain OAuth 2.0 token rotation best practices' },
  { icon: '\uD83E\uDDE0', text: 'What does our Architect know about session migration?' },
] as const;

export class AssistantView {
  private mounted = false;
  private container: HTMLElement | null = null;
  private root: HTMLElement | null = null;

  // Context bar state
  private transcriptActive = true;
  private webActive = false;
  private personas: Persona[] = [];
  private checkedPersonaIds: Set<string> = new Set();
  private personaLoadFailed = false;

  // Chat state
  private chatHistory: ChatMessage[] = [];
  private pendingSuggestionText: string | null = null;

  // DOM references for updates
  private personaBtnTextEl: HTMLElement | null = null;
  private personaBtnEl: HTMLElement | null = null;
  private dropdownEl: HTMLElement | null = null;
  private chevronEl: HTMLElement | null = null;

  /**
   * Mount the AssistantView into the given container element.
   * Throws if already mounted (call unmount first).
   */
  async mount(container: HTMLElement): Promise<void> {
    if (this.mounted) {
      throw new Error('AssistantView already mounted');
    }

    this.mounted = true;
    this.container = container;

    // Load personas (async — handle rejection)
    try {
      this.personas = await getActivePersonas();
    } catch (err) {
      console.error('[AssistantView] getActivePersonas failed', err);
      this.personas = [];
      this.personaLoadFailed = true;
    }

    // All personas pre-checked by default
    this.checkedPersonaIds = new Set(this.personas.map(p => p.id));

    // Build the root
    this.root = document.createElement('div');
    this.root.className = 'assistant-view';

    // Context bar
    const contextBar = this.buildContextBar();
    this.root.appendChild(contextBar);

    // Persona dropdown (collapsed by default)
    const dropdown = this.buildPersonaDropdown();
    this.root.appendChild(dropdown);

    // Chat messages area
    const chatMessages = this.buildChatMessages();
    this.root.appendChild(chatMessages);

    container.appendChild(this.root);
  }

  /**
   * Unmount the view — removes DOM and resets state.
   */
  unmount(): void {
    if (this.root && this.container) {
      this.container.removeChild(this.root);
    }
    this.root = null;
    this.container = null;
    this.mounted = false;
    this.personaBtnTextEl = null;
    this.personaBtnEl = null;
    this.dropdownEl = null;
    this.chevronEl = null;
  }

  /**
   * Returns current context toggle state.
   */
  getContextState(): ContextState {
    return {
      transcript: this.transcriptActive,
      personaIds: this.personas
        .filter(p => this.checkedPersonaIds.has(p.id))
        .map(p => p.id),
      web: this.webActive,
    };
  }

  /**
   * Returns the pending suggestion text (set by clicking a suggestion chip).
   * Task 6's chat input will consume this.
   */
  getPendingSuggestionText(): string | null {
    return this.pendingSuggestionText;
  }

  /**
   * Pre-seed chat history before mounting (for testing / restore).
   * Must be called before mount().
   */
  seedChatHistory(messages: ChatMessage[]): void {
    this.chatHistory = [...messages];
  }

  // ── Private: Context Bar ──

  private buildContextBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'context-bar';

    // 1. Transcript toggle (default active)
    const transcriptToggle = this.createContextToggle('transcript', 'Transcript', this.transcriptActive);
    transcriptToggle.addEventListener('click', () => {
      this.transcriptActive = !this.transcriptActive;
      transcriptToggle.classList.toggle('active', this.transcriptActive);
    });

    // 2. Separator
    const sep1 = document.createElement('div');
    sep1.className = 'context-separator';

    // 3. Personas expand button
    const personaBtn = document.createElement('div');
    personaBtn.className = 'persona-expand-btn';
    this.personaBtnEl = personaBtn;
    if (this.checkedPersonaIds.size > 0) {
      personaBtn.classList.add('has-active');
    }

    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.textContent = '\u25BE'; // down-pointing small triangle
    this.chevronEl = chevron;

    const btnText = document.createElement('span');
    btnText.textContent = this.getPersonaBtnText();
    this.personaBtnTextEl = btnText;

    personaBtn.appendChild(btnText);
    personaBtn.appendChild(chevron);

    personaBtn.addEventListener('click', () => {
      this.togglePersonaDropdown();
    });

    // 4. Separator
    const sep2 = document.createElement('div');
    sep2.className = 'context-separator';

    // 5. Web Search toggle (default inactive)
    const webToggle = this.createContextToggle('web', 'Web Search', this.webActive);
    webToggle.addEventListener('click', () => {
      this.webActive = !this.webActive;
      webToggle.classList.toggle('active', this.webActive);
    });

    bar.appendChild(transcriptToggle);
    bar.appendChild(sep1);
    bar.appendChild(personaBtn);
    bar.appendChild(sep2);
    bar.appendChild(webToggle);

    return bar;
  }

  private createContextToggle(ctx: string, label: string, active: boolean): HTMLElement {
    const toggle = document.createElement('div');
    toggle.className = 'context-toggle';
    if (active) toggle.classList.add('active');
    toggle.dataset.ctx = ctx;

    const dot = document.createElement('span');
    dot.className = 'ctx-dot';

    const text = document.createElement('span');
    text.textContent = label;

    toggle.appendChild(dot);
    toggle.appendChild(text);

    return toggle;
  }

  // ── Private: Persona Dropdown ──

  private buildPersonaDropdown(): HTMLElement {
    const dropdown = document.createElement('div');
    dropdown.className = 'persona-dropdown';
    this.dropdownEl = dropdown;

    const label = document.createElement('div');
    label.className = 'persona-dropdown-label';
    label.textContent = 'Attach persona knowledge';
    dropdown.appendChild(label);

    const list = document.createElement('div');
    list.className = 'persona-list';

    if (this.personaLoadFailed) {
      const errMsg = document.createElement('span');
      errMsg.textContent = 'Could not load personas \u2014 reload the extension.';
      list.appendChild(errMsg);
    } else if (this.personas.length === 0) {
      const emptyMsg = document.createElement('span');
      emptyMsg.textContent = 'No personas configured.';
      list.appendChild(emptyMsg);
    } else {
      for (const persona of this.personas) {
        const chip = this.createPersonaChip(persona);
        list.appendChild(chip);
      }
    }

    dropdown.appendChild(list);
    return dropdown;
  }

  private createPersonaChip(persona: Persona): HTMLElement {
    const chip = document.createElement('div');
    chip.className = 'persona-chip checked'; // pre-checked by default
    chip.dataset.personaId = persona.id;

    const check = document.createElement('span');
    check.className = 'persona-check';
    check.textContent = '\u2713'; // checkmark

    const name = document.createElement('span');
    name.textContent = persona.name; // .textContent for XSS safety

    chip.appendChild(check);
    chip.appendChild(name);

    chip.addEventListener('click', () => {
      this.togglePersonaChip(chip, persona.id);
    });

    return chip;
  }

  private togglePersonaChip(chip: HTMLElement, personaId: string): void {
    if (this.checkedPersonaIds.has(personaId)) {
      this.checkedPersonaIds.delete(personaId);
      chip.classList.remove('checked');
    } else {
      this.checkedPersonaIds.add(personaId);
      chip.classList.add('checked');
    }
    this.updatePersonaBtnCount();
  }

  private togglePersonaDropdown(): void {
    if (this.dropdownEl) {
      this.dropdownEl.classList.toggle('open');
    }
    if (this.chevronEl) {
      this.chevronEl.classList.toggle('open');
    }
  }

  private updatePersonaBtnCount(): void {
    if (this.personaBtnTextEl) {
      this.personaBtnTextEl.textContent = this.getPersonaBtnText();
    }
    if (this.personaBtnEl) {
      this.personaBtnEl.classList.toggle('has-active', this.checkedPersonaIds.size > 0);
    }
  }

  private getPersonaBtnText(): string {
    if (this.personaLoadFailed) {
      return 'Personas (?)';
    }
    return `Personas (${this.checkedPersonaIds.size})`;
  }

  // ── Private: Chat Messages Area ──

  private buildChatMessages(): HTMLElement {
    const area = document.createElement('div');
    area.className = 'chat-messages';

    if (this.chatHistory.length === 0) {
      const empty = this.buildChatEmpty();
      area.appendChild(empty);
    }

    return area;
  }

  private buildChatEmpty(): HTMLElement {
    const empty = document.createElement('div');
    empty.className = 'chat-empty';

    // Icon
    const icon = document.createElement('div');
    icon.className = 'chat-empty-icon';
    icon.textContent = '\u2728'; // sparkle emoji

    // Title
    const title = document.createElement('div');
    title.className = 'chat-empty-title';
    title.textContent = 'How can I help?';

    // Subtitle
    const subtitle = document.createElement('div');
    subtitle.className = 'chat-empty-subtitle';
    subtitle.textContent = 'Ask me anything. Toggle context sources above to include meeting transcript or persona knowledge.';

    // Suggestion chips
    const suggestions = document.createElement('div');
    suggestions.className = 'chat-empty-suggestions';

    for (const chipDef of SUGGESTION_CHIPS) {
      const chip = document.createElement('div');
      chip.className = 'suggestion-chip';
      chip.dataset.text = chipDef.text;

      const chipIcon = document.createElement('span');
      chipIcon.className = 'suggestion-icon';
      chipIcon.textContent = chipDef.icon;

      const chipText = document.createElement('span');
      chipText.textContent = chipDef.text;

      chip.appendChild(chipIcon);
      chip.appendChild(chipText);

      chip.addEventListener('click', () => {
        this.handleSuggestionClick(chipDef.text);
      });

      suggestions.appendChild(chip);
    }

    empty.appendChild(icon);
    empty.appendChild(title);
    empty.appendChild(subtitle);
    empty.appendChild(suggestions);

    return empty;
  }

  private handleSuggestionClick(text: string): void {
    this.pendingSuggestionText = text;
  }
}
