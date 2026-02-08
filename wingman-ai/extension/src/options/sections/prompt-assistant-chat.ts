/**
 * Prompt Setup Assistant — Chat Modal UI Shell
 *
 * Manages the chat modal lifecycle: show/hide, message rendering,
 * quick-reply buttons, footer state transitions, and template preview.
 * Discovery logic (API calls, state machine) lives in prompt-assistant-engine.ts (Task 5).
 */

// === TYPES ===

export interface ChatMessage {
  role: 'bot' | 'user';
  content: string;
  quickReplies?: QuickReply[];
  summaryBox?: SummaryBox;
  isError?: boolean;
}

export interface QuickReply {
  label: string;
  action: string;
  primary?: boolean;
}

export interface SummaryBox {
  header: string;
  items: string[];
}

export type ChatFooterState =
  | 'discovery'      // "Refine..." + "Generate Prompts"
  | 'reenter'        // "Cancel" + "Generate v[N]"
  | 'generating'     // spinner on generate button
  | 'error'          // "Close" + "Retry"
  | 'template'       // "Back to Chat" + "Use as-is" + "Customize this"
  | 'hidden';        // no footer

export interface ChatModalOptions {
  personaId: string;
  personaName: string;
  onGenerate?: (params: unknown) => void;
  onClose?: () => void;
  showConfirmModal?: (title: string, message: string, onConfirm: () => void) => void;
}

// === STATE ===

let messages: ChatMessage[] = [];
let currentFooterState: ChatFooterState = 'hidden';
let modalOptions: ChatModalOptions | null = null;
let modalAbortController: AbortController | null = null;

// === CALLBACKS (must be declared before renderFooter which references them) ===

let onSendCallback: ((text: string) => void) | null = null;
let onQuickReplyCallback: ((action: string) => void) | null = null;
let onTemplateActionCallback: ((action: 'back' | 'use-asis' | 'customize') => void) | null = null;

// === DOM REFERENCES ===

function getOverlay(): HTMLElement | null {
  return document.getElementById('assistant-chat-overlay');
}

function getMessagesContainer(): HTMLElement | null {
  return document.getElementById('chat-messages');
}

function getFooter(): HTMLElement | null {
  return document.getElementById('chat-footer');
}

function getInputRow(): HTMLElement | null {
  return document.getElementById('chat-input-row');
}

function getInput(): HTMLTextAreaElement | null {
  return document.getElementById('chat-input') as HTMLTextAreaElement | null;
}

function getSendBtn(): HTMLButtonElement | null {
  return document.getElementById('chat-send-btn') as HTMLButtonElement | null;
}

// === PUBLIC API ===

/**
 * Open the chat modal with initial state.
 */
export function openChatModal(options: ChatModalOptions): void {
  modalOptions = options;
  messages = [];
  currentFooterState = 'hidden';

  // Clean up any previous listeners
  modalAbortController?.abort();
  modalAbortController = new AbortController();
  const signal = modalAbortController.signal;

  const overlay = getOverlay();
  if (!overlay) return;

  overlay.hidden = false;
  overlay.classList.add('visible');

  // Set up close button (cleaned up on abort)
  const closeBtn = overlay.querySelector('.assistant-chat-close');
  closeBtn?.addEventListener('click', handleClose, { signal });

  // Close on overlay background click (cleaned up on abort)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) handleClose();
  }, { signal });

  // Set up chat input (cleaned up on abort)
  setupChatInput(signal);

  // Add initial bot message
  addMessage({
    role: 'bot',
    content: 'What will this persona help you with? Describe the use case, and I\'ll generate an optimized system prompt.',
  });

  renderFooter('discovery');

  // Focus the input
  getInput()?.focus();
}

/**
 * Close the chat modal.
 */
export function closeChatModal(): void {
  // Abort all event listeners registered via the AbortController
  modalAbortController?.abort();
  modalAbortController = null;

  const overlay = getOverlay();
  if (!overlay) return;

  overlay.classList.remove('visible');
  overlay.hidden = true;
  messages = [];
  modalOptions = null;

  // Clear message container
  const container = getMessagesContainer();
  if (container) container.innerHTML = '';
}

/**
 * Add a message to the chat.
 */
export function addMessage(message: ChatMessage): void {
  messages.push(message);
  renderMessage(message);
  scrollToBottom();
}

/**
 * Add a user message (convenience wrapper).
 */
export function addUserMessage(text: string): void {
  addMessage({ role: 'user', content: text });
}

/**
 * Add a bot message with optional quick-replies and summary box.
 */
export function addBotMessage(
  content: string,
  options?: { quickReplies?: QuickReply[]; summaryBox?: SummaryBox; isError?: boolean }
): void {
  addMessage({
    role: 'bot',
    content,
    quickReplies: options?.quickReplies,
    summaryBox: options?.summaryBox,
    isError: options?.isError,
  });
}

/**
 * Update the footer state.
 */
export function renderFooter(state: ChatFooterState, context?: { versionNumber?: number }): void {
  currentFooterState = state;
  const footer = getFooter();
  if (!footer) return;

  footer.innerHTML = '';

  switch (state) {
    case 'discovery': {
      footer.innerHTML = `
        <button class="btn-secondary btn-small" id="chat-refine-btn">Refine...</button>
        <button class="btn-primary" id="chat-generate-btn">Generate Prompts</button>
      `;
      document.getElementById('chat-generate-btn')?.addEventListener('click', () => {
        modalOptions?.onGenerate?.(null);
      });
      document.getElementById('chat-refine-btn')?.addEventListener('click', () => {
        getInput()?.focus();
      });
      break;
    }
    case 'reenter': {
      const vNum = context?.versionNumber ?? '?';
      footer.innerHTML = `
        <button class="btn-secondary" id="chat-cancel-btn">Cancel</button>
        <button class="btn-primary" id="chat-generate-btn">Generate v${vNum}</button>
      `;
      document.getElementById('chat-generate-btn')?.addEventListener('click', () => {
        modalOptions?.onGenerate?.(null);
      });
      document.getElementById('chat-cancel-btn')?.addEventListener('click', handleClose);
      break;
    }
    case 'generating': {
      footer.innerHTML = `
        <button class="btn-primary" disabled>
          <span class="spinner-inline"></span> Generating...
        </button>
      `;
      break;
    }
    case 'error': {
      footer.innerHTML = `
        <button class="btn-secondary" id="chat-close-btn">Close</button>
        <button class="btn-primary" id="chat-retry-btn">Retry</button>
      `;
      document.getElementById('chat-close-btn')?.addEventListener('click', handleClose);
      document.getElementById('chat-retry-btn')?.addEventListener('click', () => {
        modalOptions?.onGenerate?.(null);
      });
      break;
    }
    case 'template': {
      footer.innerHTML = `
        <button class="btn-secondary" id="chat-back-btn">Back to Chat</button>
        <button class="btn-secondary" id="chat-use-asis-btn">Use as-is</button>
        <button class="btn-primary" id="chat-customize-btn">Customize this</button>
      `;
      document.getElementById('chat-back-btn')?.addEventListener('click', () => {
        onTemplateActionCallback?.('back');
      });
      document.getElementById('chat-use-asis-btn')?.addEventListener('click', () => {
        onTemplateActionCallback?.('use-asis');
      });
      document.getElementById('chat-customize-btn')?.addEventListener('click', () => {
        onTemplateActionCallback?.('customize');
      });
      break;
    }
    case 'hidden': {
      footer.innerHTML = '';
      break;
    }
  }
}

/**
 * Get all messages (for re-enter context).
 */
export function getMessages(): ChatMessage[] {
  return [...messages];
}

/**
 * Get current footer state.
 */
export function getFooterState(): ChatFooterState {
  return currentFooterState;
}

/**
 * Show a template preview card in the chat messages area.
 */
export function showTemplatePreview(templateName: string, promptText: string): void {
  const container = getMessagesContainer();
  if (!container) return;

  const previewDiv = document.createElement('div');
  previewDiv.className = 'chat-template-preview';

  const header = document.createElement('div');
  header.className = 'chat-template-preview-header';
  header.innerHTML = `<strong>${templateName}</strong> <span class="chat-template-preview-tag">Template</span>`;

  const content = document.createElement('div');
  content.className = 'chat-template-preview-content';
  // Show first 500 chars with expand option
  const isLong = promptText.length > 500;
  content.textContent = isLong ? promptText.slice(0, 500) + '...' : promptText;

  previewDiv.appendChild(header);
  previewDiv.appendChild(content);

  if (isLong) {
    const expandBtn = document.createElement('button');
    expandBtn.className = 'chat-template-expand-btn';
    expandBtn.textContent = 'Show full prompt';
    let expanded = false;
    expandBtn.addEventListener('click', () => {
      expanded = !expanded;
      content.textContent = expanded ? promptText : promptText.slice(0, 500) + '...';
      expandBtn.textContent = expanded ? 'Show less' : 'Show full prompt';
    });
    previewDiv.appendChild(expandBtn);
  }

  container.appendChild(previewDiv);
  scrollToBottom();
}

// === RENDERING ===

function renderMessage(message: ChatMessage): void {
  const container = getMessagesContainer();
  if (!container) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-msg chat-msg--${message.role}`;

  // Avatar
  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.textContent = message.role === 'bot' ? (message.isError ? '!' : '\u{1F916}') : '\u{1F464}';
  if (message.isError) avatar.classList.add('chat-avatar--error');

  // Bubble
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble${message.role === 'user' ? ' chat-bubble--user' : ''}${message.isError ? ' chat-bubble--error' : ''}`;
  bubble.textContent = message.content;

  // Summary box (if present)
  if (message.summaryBox) {
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'chat-summary';
    const header = document.createElement('strong');
    header.textContent = message.summaryBox.header;
    summaryDiv.appendChild(header);
    const list = document.createElement('ul');
    list.className = 'chat-summary-list';
    for (const item of message.summaryBox.items) {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    }
    summaryDiv.appendChild(list);
    bubble.appendChild(summaryDiv);
  }

  msgDiv.appendChild(avatar);
  msgDiv.appendChild(bubble);

  // Quick replies (if present)
  if (message.quickReplies && message.quickReplies.length > 0) {
    const repliesDiv = document.createElement('div');
    repliesDiv.className = 'chat-quick-reply';
    for (const reply of message.quickReplies) {
      const btn = document.createElement('button');
      btn.className = reply.primary ? 'btn-primary btn-small' : 'btn-secondary btn-small';
      btn.textContent = reply.label;
      btn.dataset['action'] = reply.action;
      btn.addEventListener('click', () => {
        onQuickReplyCallback?.(reply.action);
      });
      repliesDiv.appendChild(btn);
    }
    msgDiv.appendChild(repliesDiv);
  }

  container.appendChild(msgDiv);
}

function scrollToBottom(): void {
  const container = getMessagesContainer();
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

// === CHAT INPUT ===

/**
 * Register a callback for when the user sends a message via the input.
 */
export function onUserSend(callback: (text: string) => void): void {
  onSendCallback = callback;
}

/**
 * Register a callback for when the user clicks a quick-reply button.
 */
export function onQuickReply(callback: (action: string) => void): void {
  onQuickReplyCallback = callback;
}

/**
 * Register a callback for template footer actions (Back / Use as-is / Customize).
 */
export function onTemplateAction(callback: (action: 'back' | 'use-asis' | 'customize') => void): void {
  onTemplateActionCallback = callback;
}

function setupChatInput(signal: AbortSignal): void {
  const input = getInput();
  const sendBtn = getSendBtn();
  if (!input || !sendBtn) return;

  // Auto-resize textarea as user types
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    sendBtn.disabled = input.value.trim().length === 0;
  }, { signal });

  // Send on Enter (Shift+Enter for newline)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, { signal });

  // Send button click
  sendBtn.addEventListener('click', handleSend, { signal });

  // Initial state: disabled until user types
  sendBtn.disabled = true;
}

function handleSend(): void {
  const input = getInput();
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  // Add user message to chat
  addUserMessage(text);

  // Clear input
  input.value = '';
  input.style.height = 'auto';
  const sendBtn = getSendBtn();
  if (sendBtn) sendBtn.disabled = true;

  // Notify callback
  onSendCallback?.(text);
}

/**
 * Show or hide the input row (e.g., hide during generation or review).
 */
export function setInputVisible(visible: boolean): void {
  const row = getInputRow();
  if (row) row.hidden = !visible;
}

function handleClose(): void {
  // Capture onClose before closeChatModal nulls modalOptions
  const onClose = modalOptions?.onClose;
  const hasConversation = messages.some(m => m.role === 'user');

  if (hasConversation && modalOptions?.showConfirmModal) {
    modalOptions.showConfirmModal(
      'Discard conversation?',
      'Your discovery conversation will be lost. You can restart the assistant anytime.',
      () => {
        closeChatModal();
        onClose?.();
      },
    );
  } else {
    closeChatModal();
    onClose?.();
  }
}
