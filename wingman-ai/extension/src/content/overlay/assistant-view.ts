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
  private chatMessagesEl: HTMLElement | null = null;
  private conversationEl: HTMLElement | null = null;
  private typingIndicatorEl: HTMLElement | null = null;
  private chatInputEl: HTMLInputElement | null = null;
  private chatSendBtnEl: HTMLButtonElement | null = null;

  /** Map of active streaming messageIds to their DOM elements. */
  private streamingBubbles = new Map<string, HTMLElement>();

  /** Near-bottom scroll tolerance (matches MeetingView). */
  private static readonly SCROLL_THRESHOLD = 50;

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
    this.chatMessagesEl = chatMessages;
    this.root.appendChild(chatMessages);

    // Chat input area
    const inputArea = this.buildChatInputArea();
    this.root.appendChild(inputArea);

    container.appendChild(this.root);

    // Consume pending suggestion text (from chip click before input existed)
    if (this.pendingSuggestionText) {
      const text = this.pendingSuggestionText;
      this.pendingSuggestionText = null;
      this.handleSend(text);
    }
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

  // ── Public: Chat message API ──

  /**
   * Append a user message bubble to the chat.
   * Removes the empty state on the first message.
   */
  appendUserMessage(text: string): void {
    if (!text) return; // guard: empty input rejected

    this.chatHistory.push({ role: 'user', text });
    this.ensureConversation();

    const msg = document.createElement('div');
    msg.className = 'chat-msg chat-msg-user';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;

    msg.appendChild(bubble);
    this.conversationEl!.appendChild(msg);
    this.autoScroll();
  }

  /**
   * Render an assistant message bubble.
   *
   * @param msg.text The message text (required). Supports **bold** and \n line breaks.
   * @param msg.sources Source attribution strings (optional). Classification:
   *   - "transcript" -> green tag
   *   - ends with " KB" -> purple persona tag
   *   - "web" -> amber tag
   *   - empty/undefined -> gray "general knowledge" tag
   * @param msg.streaming If true, creates or updates a streaming bubble.
   * @param msg.messageId If provided with streaming, updates the same bubble in place.
   *   Without messageId, each call creates a new bubble.
   */
  renderAssistantMessage(msg: { text: string; sources?: string[]; streaming?: boolean; messageId?: string }): void {
    if (msg.text === null || msg.text === undefined) {
      throw new Error('renderAssistantMessage: text is required');
    }

    // Handle streaming updates via messageId
    if (msg.messageId) {
      const existing = this.streamingBubbles.get(msg.messageId);
      if (existing) {
        // Update existing bubble in-place
        const bubble = existing.querySelector('.msg-bubble') as HTMLElement;
        if (msg.streaming === false) {
          // Finalize: set final text + add sources
          bubble.innerHTML = this.transformMarkdown(msg.text);
          this.buildSourceTags(existing, msg.sources);
          this.streamingBubbles.delete(msg.messageId);
          this.chatHistory.push({ role: 'assistant', text: msg.text, sources: msg.sources });
        } else {
          // Still streaming: update text
          bubble.innerHTML = this.transformMarkdown(msg.text);
        }
        this.autoScroll();
        return;
      }

      // No existing bubble for this messageId
      if (msg.streaming === false) {
        // Orphan messageId: warn and no-op
        console.warn('[AssistantView] unknown messageId: ' + msg.messageId + ' — ignoring');
        return;
      }

      // New streaming bubble: create it
      this.ensureConversation();
      this.hideTypingIndicator();

      const msgEl = document.createElement('div');
      msgEl.className = 'chat-msg chat-msg-bot';
      msgEl.dataset.messageId = msg.messageId;

      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      bubble.innerHTML = this.transformMarkdown(msg.text);

      msgEl.appendChild(bubble);
      this.conversationEl!.appendChild(msgEl);
      this.streamingBubbles.set(msg.messageId, msgEl);
      this.autoScroll();
      return;
    }

    // Non-streaming: create new bubble
    this.ensureConversation();
    this.chatHistory.push({ role: 'assistant', text: msg.text, sources: msg.sources });

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg chat-msg-bot';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.innerHTML = this.transformMarkdown(msg.text);

    msgEl.appendChild(bubble);
    this.buildSourceTags(msgEl, msg.sources);
    this.conversationEl!.appendChild(msgEl);
    this.autoScroll();
  }

  /**
   * Show a typing indicator bubble (three animated dots).
   */
  showTypingIndicator(): void {
    if (this.typingIndicatorEl) return; // already showing

    this.ensureConversation();

    const wrapper = document.createElement('div');
    wrapper.className = 'chat-msg chat-msg-bot';

    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator-bubble';

    const dots = document.createElement('div');
    dots.className = 'typing-dots';
    for (let i = 0; i < 3; i++) {
      dots.appendChild(document.createElement('span'));
    }

    indicator.appendChild(dots);
    wrapper.appendChild(indicator);
    this.conversationEl!.appendChild(wrapper);
    this.typingIndicatorEl = wrapper;
    this.autoScroll();
  }

  /**
   * Hide the typing indicator bubble.
   */
  hideTypingIndicator(): void {
    if (this.typingIndicatorEl) {
      this.typingIndicatorEl.remove();
      this.typingIndicatorEl = null;
    }
  }

  /**
   * Returns the chat history array.
   */
  getChatHistory(): ChatMessage[] {
    return this.chatHistory;
  }

  // ── Private: Markdown + HTML escape ──

  /**
   * Escape HTML entities, then apply minimal markdown transforms.
   * SECURITY: escape FIRST, then transform. Order is critical.
   */
  private transformMarkdown(text: string): string {
    // Step 1: escape HTML entities
    let escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    // Step 2: apply bold transform
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Step 3: apply newline transforms (double newline = paragraph break)
    escaped = escaped.replace(/\n\n/g, '<br><br>');
    escaped = escaped.replace(/\n/g, '<br>');

    return escaped;
  }

  /** Maximum number of source tags rendered per message. */
  private static readonly MAX_SOURCE_TAGS = 10;

  /** Maximum display length for a single source tag. */
  private static readonly MAX_SOURCE_TAG_LENGTH = 60;

  /**
   * Build source-attribution tags below an assistant bubble.
   *
   * Classification rules:
   * - "transcript" -> .transcript (green)
   * - ends with " KB" -> .persona (purple)
   * - "web" -> .web (amber)
   * - empty/undefined -> single .general "general knowledge" tag
   */
  private buildSourceTags(msgEl: HTMLElement, sources?: string[] | null): void {
    const effectiveSources = sources && sources.length > 0 ? sources : ['general knowledge'];

    // Store original sources as JSON attribute
    if (sources && sources.length > 0) {
      msgEl.dataset.sources = JSON.stringify(sources);
    }

    const container = document.createElement('div');
    container.className = 'msg-sources';

    const displayCount = Math.min(effectiveSources.length, AssistantView.MAX_SOURCE_TAGS);
    for (let i = 0; i < displayCount; i++) {
      const source = effectiveSources[i]!;
      const tag = document.createElement('span');
      tag.className = 'msg-source-tag';

      // Classify
      if (source === 'transcript') {
        tag.classList.add('transcript');
      } else if (source.endsWith(' KB')) {
        tag.classList.add('persona');
      } else if (source === 'web') {
        tag.classList.add('web');
      } else if (source === 'general knowledge') {
        tag.classList.add('general');
      }
      // else: no classification class (default gray)

      // Truncate display text
      const displayText = source.length > AssistantView.MAX_SOURCE_TAG_LENGTH
        ? source.slice(0, AssistantView.MAX_SOURCE_TAG_LENGTH) + '...'
        : source;

      // SECURITY: use .textContent, never .innerHTML
      tag.textContent = displayText;
      container.appendChild(tag);
    }

    // +N more tag if truncated
    if (effectiveSources.length > AssistantView.MAX_SOURCE_TAGS) {
      const moreTag = document.createElement('span');
      moreTag.className = 'msg-source-tag';
      moreTag.textContent = `+${effectiveSources.length - AssistantView.MAX_SOURCE_TAGS} more`;
      container.appendChild(moreTag);
    }

    msgEl.appendChild(container);
  }

  // ── Private: Chat helpers ──

  /**
   * Ensure the .chat-conversation container exists (removing .chat-empty if needed).
   */
  private ensureConversation(): void {
    if (this.conversationEl) return;

    // Remove empty state if present
    if (this.chatMessagesEl) {
      const empty = this.chatMessagesEl.querySelector('.chat-empty');
      if (empty) empty.remove();

      const conversation = document.createElement('div');
      conversation.className = 'chat-conversation';
      this.chatMessagesEl.appendChild(conversation);
      this.conversationEl = conversation;
    }
  }

  /**
   * Auto-scroll to bottom if user is near the bottom.
   */
  private autoScroll(): void {
    if (!this.chatMessagesEl) return;
    const el = this.chatMessagesEl;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= AssistantView.SCROLL_THRESHOLD;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
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
    if (this.chatInputEl) {
      // Input exists — send immediately
      this.pendingSuggestionText = null;
      this.handleSend(text);
    } else {
      // Input not yet mounted — store for consumption on mount
      this.pendingSuggestionText = text;
    }
  }

  // ── Private: Chat Input Area ──

  private buildChatInputArea(): HTMLElement {
    const area = document.createElement('div');
    area.className = 'chat-input-area';

    const wrapper = document.createElement('div');
    wrapper.className = 'chat-input-wrapper';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'chat-input';
    input.placeholder = 'Ask anything...';
    input.maxLength = 4000;
    this.chatInputEl = input;

    const sendBtn = document.createElement('button');
    sendBtn.className = 'chat-send-btn';
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
    this.chatSendBtnEl = sendBtn;

    // Enable/disable send button based on input content
    input.addEventListener('input', () => {
      sendBtn.disabled = input.value.trim().length === 0;
    });

    // Enter to send
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const trimmed = input.value.trim();
        if (trimmed) {
          this.handleSend(trimmed);
        }
      }
    });

    // Click send button
    sendBtn.addEventListener('click', () => {
      if (sendBtn.disabled) return;
      const trimmed = input.value.trim();
      if (trimmed) {
        this.handleSend(trimmed);
      }
    });

    wrapper.appendChild(input);
    wrapper.appendChild(sendBtn);
    area.appendChild(wrapper);
    return area;
  }

  /**
   * Handle sending a message. Creates user bubble, clears input, invokes onSend subscribers.
   */
  private handleSend(text: string): void {
    this.appendUserMessage(text);

    // Clear input
    if (this.chatInputEl) {
      this.chatInputEl.value = '';
    }
    if (this.chatSendBtnEl) {
      this.chatSendBtnEl.disabled = true;
    }

    // Emit to subscribers (Task 7 wires this)
    this.emitSend(text, this.getContextState());
  }

  /**
   * Emit send event to all registered subscribers.
   * Placeholder for Task 7 — currently a no-op.
   */
  private emitSend(_text: string, _ctx: ContextState): void {
    // Task 7 will implement subscriber dispatch
  }
}
