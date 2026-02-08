/**
 * Prompt Review Modal — Review / Edit / Test generated prompts
 *
 * Replaces the chat body content inside #assistant-chat-overlay after
 * prompt generation. Provides model-switching, inline editing with
 * live diff, test questions tab, and save/refine callbacks.
 */

import type { GeneratedTestQuestion } from '../../services/prompt-assistant-engine';
import { adaptPromptForModel } from '../../services/prompt-adapter';
import { generateDiff, type DiffLine } from '../../services/prompt-diff';
import { getModelFamily } from '../../shared/model-tuning';

// === TYPES ===

export interface ReviewModalOptions {
  promptText: string;
  testQuestions: GeneratedTestQuestion[];
  modelId: string;
  generationNumber: number;
  previousPrompt?: string;
  onSave?: (promptText: string, modelId: string, testQuestions?: GeneratedTestQuestion[]) => void;
  onTest?: (promptText: string, modelId: string, testQuestions: GeneratedTestQuestion[]) => void;
  onRefine?: () => void;
  onClose?: () => void;
}

type ReviewState = 'review' | 'edit' | 'edit-diff';
type ActiveTab = 'prompt' | 'test-questions';

// === STATE ===

let currentState: ReviewState = 'review';
let activeTab: ActiveTab = 'prompt';
let opts: ReviewModalOptions | null = null;
let basePrompt = '';
let displayedPrompt = '';
let selectedModelId = '';
let adaptationNotice = '';
let checkedQuestions: Set<number> = new Set();

// === DOM REFERENCES ===

function getMessagesContainer(): HTMLElement | null {
  return document.getElementById('chat-messages');
}

function getFooter(): HTMLElement | null {
  return document.getElementById('chat-footer');
}

// === MODEL DROPDOWN DATA ===

interface ModelGroup {
  label: string;
  provider: 'direct' | 'openrouter' | 'groq';
  models: Array<{ id: string; name: string }>;
}

const MODEL_GROUPS: ModelGroup[] = [
  {
    label: 'Gemini (Direct)',
    provider: 'direct',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    ],
  },
  {
    label: 'OpenRouter',
    provider: 'openrouter',
    models: [
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
      { id: 'openai/gpt-4o', name: 'GPT-4o' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
    ],
  },
  {
    label: 'Groq',
    provider: 'groq',
    models: [
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B' },
      { id: 'qwen/qwen3-32b', name: 'Qwen3 32B' },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
    ],
  },
];

const MAX_CHARS = 10_000;

// === PUBLIC API ===

/**
 * Open the review modal by replacing the chat body content.
 */
export function openReviewModal(options: ReviewModalOptions): void {
  opts = options;
  basePrompt = options.promptText;
  displayedPrompt = options.promptText;
  selectedModelId = options.modelId;
  currentState = 'review';
  activeTab = 'prompt';
  adaptationNotice = '';
  checkedQuestions = new Set(options.testQuestions.map((_, i) => i));

  render();
}

/**
 * Close the review modal (restores chat body to empty).
 */
export function closeReviewModal(): void {
  const container = getMessagesContainer();
  if (container) container.innerHTML = '';
  const footer = getFooter();
  if (footer) footer.innerHTML = '';
  opts = null;
  currentState = 'review';
  activeTab = 'prompt';
}

// === RENDERING ===

function render(): void {
  const container = getMessagesContainer();
  const footer = getFooter();
  if (!container || !footer) return;

  container.innerHTML = '';
  container.appendChild(buildReviewContainer());

  footer.innerHTML = '';
  footer.appendChild(buildFooter());

  bindEvents();
}

function buildReviewContainer(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'prompt-review-container';

  // Tab bar
  wrapper.appendChild(buildTabBar());

  // Tab content
  if (activeTab === 'prompt') {
    wrapper.appendChild(buildPromptTab());
  } else {
    wrapper.appendChild(buildTestQuestionsTab());
  }

  return wrapper;
}

// --- Tab bar ---

function buildTabBar(): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'prompt-tab-bar';

  const promptTab = document.createElement('button');
  promptTab.className = `prompt-tab${activeTab === 'prompt' ? ' prompt-tab--active' : ''}`;
  promptTab.textContent = 'Prompt';
  promptTab.dataset['tab'] = 'prompt';

  const testTab = document.createElement('button');
  testTab.className = `prompt-tab${activeTab === 'test-questions' ? ' prompt-tab--active' : ''}`;
  testTab.textContent = 'Test Questions';
  testTab.dataset['tab'] = 'test-questions';

  // Badge for test question count
  if (opts && opts.testQuestions.length > 0) {
    const badge = document.createElement('span');
    badge.className = 'prompt-tab-badge';
    badge.textContent = String(opts.testQuestions.length);
    testTab.appendChild(badge);
  }

  bar.appendChild(promptTab);
  bar.appendChild(testTab);
  return bar;
}

// --- Prompt tab ---

function buildPromptTab(): HTMLElement {
  const section = document.createElement('div');
  section.className = 'prompt-tab-content';

  // Model selector row
  section.appendChild(buildModelSelectorRow());

  // Version badge
  if (opts) {
    const versionRow = document.createElement('div');
    versionRow.className = 'version-badge';
    versionRow.innerHTML = `Generation: <strong>#${opts.generationNumber}</strong>`;
    section.appendChild(versionRow);
  }

  // Adaptation notice
  if (adaptationNotice) {
    const notice = document.createElement('div');
    notice.className = 'prompt-notice';
    notice.textContent = adaptationNotice;
    section.appendChild(notice);
  }

  // Editing indicator
  if (currentState === 'edit' || currentState === 'edit-diff') {
    const indicator = document.createElement('div');
    indicator.className = 'editing-indicator';
    indicator.innerHTML = '<span class="editing-dot"></span> Editing — unsaved changes';
    section.appendChild(indicator);
  }

  // Prompt textarea
  const textarea = document.createElement('textarea');
  textarea.id = 'review-prompt-textarea';
  textarea.className = 'prompt-textarea prompt-textarea--review';
  if (currentState === 'edit' || currentState === 'edit-diff') {
    textarea.className += ' prompt-textarea--editing';
    textarea.readOnly = false;
  } else {
    textarea.readOnly = true;
  }
  textarea.value = displayedPrompt;
  textarea.spellcheck = false;
  section.appendChild(textarea);

  // Char count
  const charCount = document.createElement('div');
  charCount.className = 'char-count';
  charCount.id = 'review-char-count';
  const count = displayedPrompt.length;
  let charText = `${count.toLocaleString()} / ${MAX_CHARS.toLocaleString()} chars`;
  if (currentState === 'edit' || currentState === 'edit-diff') {
    charText += ' \u00B7 modified';
  }
  charCount.textContent = charText;
  if (count > MAX_CHARS) charCount.classList.add('error');
  else if (count > MAX_CHARS * 0.9) charCount.classList.add('warning');
  section.appendChild(charCount);

  // Diff panel (edit-diff state)
  if (currentState === 'edit-diff') {
    section.appendChild(buildDiffPanel());
  }

  // Compare vs previous generation
  if (opts && opts.generationNumber > 1 && opts.previousPrompt && currentState === 'review') {
    const compareBtn = document.createElement('button');
    compareBtn.className = 'btn-secondary btn-small';
    compareBtn.id = 'review-compare-prev-btn';
    compareBtn.textContent = `Compare vs generation #${opts.generationNumber - 1}`;
    compareBtn.style.marginTop = 'var(--spacing-sm)';
    section.appendChild(compareBtn);
  }

  return section;
}

function buildModelSelectorRow(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'model-selector-row';

  const label = document.createElement('label');
  label.className = 'input-label';
  label.textContent = 'Target Model';
  label.htmlFor = 'review-model-select';

  const select = document.createElement('select');
  select.id = 'review-model-select';
  select.className = 'select-input';

  for (const group of MODEL_GROUPS) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    for (const model of group.models) {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      if (model.id === selectedModelId) option.selected = true;
      optgroup.appendChild(option);
    }
    select.appendChild(optgroup);
  }

  const providerBadge = document.createElement('span');
  providerBadge.className = 'provider-badge';
  providerBadge.id = 'review-provider-badge';
  updateProviderBadge(providerBadge, selectedModelId);

  row.appendChild(label);
  row.appendChild(select);
  row.appendChild(providerBadge);

  return row;
}

function updateProviderBadge(badge: HTMLElement, modelId: string): void {
  // Determine provider from model groups
  let provider: 'direct' | 'openrouter' | 'groq' = 'direct';
  for (const group of MODEL_GROUPS) {
    for (const model of group.models) {
      if (model.id === modelId) {
        provider = group.provider;
      }
    }
  }

  badge.className = 'provider-badge';
  badge.classList.add(`provider-badge--${provider}`);

  const labels: Record<string, string> = {
    direct: 'DIRECT',
    openrouter: 'OPENROUTER',
    groq: 'GROQ',
  };
  badge.textContent = labels[provider] ?? 'DIRECT';
}

// --- Diff panel ---

function buildDiffPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'diff-panel-inline';

  const diffLabel = document.createElement('div');
  diffLabel.className = 'diff-panel-label';
  diffLabel.textContent = 'LIVE DIFF VS GENERATED';
  panel.appendChild(diffLabel);

  const diff = generateDiff(basePrompt, displayedPrompt);
  const diffHtml = renderDiffToHtml(diff);

  const diffContent = document.createElement('div');
  diffContent.className = 'diff-panel-content';
  diffContent.innerHTML = diffHtml;
  panel.appendChild(diffContent);

  return panel;
}

function buildPreviousGenDiffPanel(previousPrompt: string): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'diff-panel-inline';

  const genNum = opts ? opts.generationNumber - 1 : 0;
  const diffLabel = document.createElement('div');
  diffLabel.className = 'diff-panel-label';
  diffLabel.textContent = `DIFF VS GENERATION #${genNum}`;
  panel.appendChild(diffLabel);

  const diff = generateDiff(previousPrompt, displayedPrompt);
  const diffHtml = renderDiffToHtml(diff);

  const diffContent = document.createElement('div');
  diffContent.className = 'diff-panel-content';
  diffContent.innerHTML = diffHtml;
  panel.appendChild(diffContent);

  return panel;
}

function renderDiffToHtml(diff: DiffLine[]): string {
  return diff
    .map((line) => {
      const escaped = escapeHtml(line.text);
      switch (line.type) {
        case 'same':
          return `<div class="diff-line diff-line--same">${escaped}</div>`;
        case 'add':
          return `<div class="diff-line diff-line--add">+ ${escaped}</div>`;
        case 'remove':
          return `<div class="diff-line diff-line--remove">- ${escaped}</div>`;
        case 'ellipsis':
          return `<div class="diff-line diff-line--ellipsis">${escaped}</div>`;
      }
    })
    .join('');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Test questions tab ---

function buildTestQuestionsTab(): HTMLElement {
  const section = document.createElement('div');
  section.className = 'prompt-tab-content';

  if (!opts || opts.testQuestions.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'prompt-review-empty';
    empty.textContent = 'No test questions generated.';
    section.appendChild(empty);
    return section;
  }

  const respondQs = opts.testQuestions.filter(q => q.expectedBehavior === 'respond');
  const silentQs = opts.testQuestions.filter(q => q.expectedBehavior === 'silent');

  if (respondQs.length > 0) {
    section.appendChild(buildQuestionGroup('AUTO-GENERATED — SHOULD RESPOND', respondQs, 0));
  }

  if (silentQs.length > 0) {
    section.appendChild(buildQuestionGroup('AUTO-GENERATED — SHOULD STAY SILENT', silentQs, respondQs.length));
  }

  return section;
}

function buildQuestionGroup(
  groupLabel: string,
  questions: GeneratedTestQuestion[],
  startIndex: number,
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'test-questions-group';

  const header = document.createElement('div');
  header.className = 'test-questions-group-label';
  header.textContent = groupLabel;
  group.appendChild(header);

  const list = document.createElement('div');
  list.className = 'test-questions-list';

  questions.forEach((q, i) => {
    const actualIndex = startIndex + i;
    const item = document.createElement('label');
    item.className = 'test-question-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'test-question-checkbox';
    checkbox.checked = checkedQuestions.has(actualIndex);
    checkbox.dataset['index'] = String(actualIndex);

    const textSpan = document.createElement('span');
    textSpan.className = 'test-question-text';
    textSpan.textContent = q.text;

    const badge = document.createElement('span');
    badge.className = 'test-question-badge';
    badge.textContent = 'new';

    item.appendChild(checkbox);
    item.appendChild(textSpan);
    item.appendChild(badge);

    if (q.behaviorHint) {
      const hint = document.createElement('span');
      hint.className = 'test-question-hint';
      hint.textContent = q.behaviorHint;
      item.appendChild(hint);
    }

    list.appendChild(item);
  });

  group.appendChild(list);
  return group;
}

// --- Footer ---

function buildFooter(): DocumentFragment {
  if (activeTab === 'test-questions') {
    return buildTestQuestionsFooter();
  }

  switch (currentState) {
    case 'review':
      return buildReviewFooter();
    case 'edit':
      return buildEditFooter();
    case 'edit-diff':
      return buildEditDiffFooter();
  }
}

function buildReviewFooter(): DocumentFragment {
  const frag = document.createDocumentFragment();
  const genNum = opts?.generationNumber ?? 1;

  const refineBtn = document.createElement('button');
  refineBtn.className = 'btn-secondary btn-small';
  refineBtn.id = 'review-refine-btn';
  refineBtn.textContent = 'Refine...';

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-secondary btn-small';
  editBtn.id = 'review-edit-btn';
  editBtn.textContent = 'Edit';

  const testBtn = document.createElement('button');
  testBtn.className = 'btn-secondary btn-small';
  testBtn.id = 'review-test-btn';
  testBtn.textContent = 'Test...';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary btn-small';
  saveBtn.id = 'review-save-btn';
  saveBtn.textContent = `Save All (v${genNum})`;

  frag.appendChild(refineBtn);
  frag.appendChild(editBtn);
  frag.appendChild(testBtn);
  frag.appendChild(saveBtn);
  return frag;
}

function buildEditFooter(): DocumentFragment {
  const frag = document.createDocumentFragment();

  const discardBtn = document.createElement('button');
  discardBtn.className = 'btn-secondary btn-small';
  discardBtn.id = 'review-discard-btn';
  discardBtn.textContent = 'Discard edits';

  const testBtn = document.createElement('button');
  testBtn.className = 'btn-secondary btn-small';
  testBtn.id = 'review-test-edited-btn';
  testBtn.textContent = 'Test this version';

  const diffBtn = document.createElement('button');
  diffBtn.className = 'btn-secondary btn-small';
  diffBtn.id = 'review-show-diff-btn';
  diffBtn.textContent = 'Show diff';

  frag.appendChild(discardBtn);
  frag.appendChild(testBtn);
  frag.appendChild(diffBtn);
  return frag;
}

function buildEditDiffFooter(): DocumentFragment {
  const frag = document.createDocumentFragment();

  const hideDiffBtn = document.createElement('button');
  hideDiffBtn.className = 'btn-secondary btn-small';
  hideDiffBtn.id = 'review-hide-diff-btn';
  hideDiffBtn.textContent = 'Hide diff';

  const testBtn = document.createElement('button');
  testBtn.className = 'btn-secondary btn-small';
  testBtn.id = 'review-test-edited-btn';
  testBtn.textContent = 'Test this version';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary btn-small';
  saveBtn.id = 'review-save-edited-btn';
  saveBtn.textContent = 'Save';

  frag.appendChild(hideDiffBtn);
  frag.appendChild(testBtn);
  frag.appendChild(saveBtn);
  return frag;
}

function buildTestQuestionsFooter(): DocumentFragment {
  const frag = document.createDocumentFragment();

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-secondary btn-small';
  removeBtn.id = 'review-remove-qs-btn';
  removeBtn.textContent = 'Remove test Qs';

  const testNowBtn = document.createElement('button');
  testNowBtn.className = 'btn-secondary btn-small';
  testNowBtn.id = 'review-test-now-btn';
  testNowBtn.textContent = 'Test now';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary btn-small';
  saveBtn.id = 'review-save-with-qs-btn';
  saveBtn.textContent = 'Save prompt + test Qs';

  frag.appendChild(removeBtn);
  frag.appendChild(testNowBtn);
  frag.appendChild(saveBtn);
  return frag;
}

// === EVENT BINDING ===

function bindEvents(): void {
  // Tab switching
  const tabs = document.querySelectorAll<HTMLElement>('.prompt-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset['tab'];
      if (tabId === 'prompt' || tabId === 'test-questions') {
        activeTab = tabId;
        render();
      }
    });
  });

  // Model selector
  const select = document.getElementById('review-model-select') as HTMLSelectElement | null;
  select?.addEventListener('change', () => {
    handleModelChange(select.value);
  });

  // Textarea input (char count + edit tracking)
  const textarea = document.getElementById('review-prompt-textarea') as HTMLTextAreaElement | null;
  textarea?.addEventListener('input', () => {
    displayedPrompt = textarea.value;

    updateCharCount();
  });

  // Footer buttons
  bindFooterEvents();

  // Test question checkboxes
  const checkboxes = document.querySelectorAll<HTMLInputElement>('.test-question-checkbox');
  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = Number(cb.dataset['index']);
      if (cb.checked) {
        checkedQuestions.add(idx);
      } else {
        checkedQuestions.delete(idx);
      }
    });
  });

  // Compare vs previous generation
  const comparePrevBtn = document.getElementById('review-compare-prev-btn');
  comparePrevBtn?.addEventListener('click', () => {
    if (!opts?.previousPrompt) return;
    const container = getMessagesContainer();
    const existing = container?.querySelector('.diff-panel-inline');
    if (existing) {
      existing.remove();
    } else {
      const panel = buildPreviousGenDiffPanel(opts.previousPrompt);
      const reviewContainer = container?.querySelector('.prompt-review-container');
      reviewContainer?.appendChild(panel);
    }
  });
}

function bindFooterEvents(): void {
  // Review state buttons
  document.getElementById('review-refine-btn')?.addEventListener('click', () => {
    opts?.onRefine?.();
  });

  document.getElementById('review-edit-btn')?.addEventListener('click', () => {
    currentState = 'edit';
    render();
    // Focus the textarea
    const ta = document.getElementById('review-prompt-textarea') as HTMLTextAreaElement | null;
    ta?.focus();
  });

  document.getElementById('review-test-btn')?.addEventListener('click', () => {
    opts?.onTest?.(displayedPrompt, selectedModelId, getSelectedTestQuestions());
  });

  document.getElementById('review-save-btn')?.addEventListener('click', () => {
    const selectedQs = getSelectedTestQuestions();
    opts?.onSave?.(displayedPrompt, selectedModelId, selectedQs);
  });

  // Edit state buttons
  document.getElementById('review-discard-btn')?.addEventListener('click', () => {
    displayedPrompt = basePrompt;
    currentState = 'review';
    render();
  });

  document.getElementById('review-test-edited-btn')?.addEventListener('click', () => {
    opts?.onTest?.(displayedPrompt, selectedModelId, getSelectedTestQuestions());
  });

  document.getElementById('review-show-diff-btn')?.addEventListener('click', () => {
    currentState = 'edit-diff';
    render();
  });

  // Edit+diff state buttons
  document.getElementById('review-hide-diff-btn')?.addEventListener('click', () => {
    currentState = 'edit';
    render();
  });

  document.getElementById('review-save-edited-btn')?.addEventListener('click', () => {
    basePrompt = displayedPrompt;
    currentState = 'review';
    opts?.onSave?.(displayedPrompt, selectedModelId);
  });

  // Test questions buttons
  document.getElementById('review-remove-qs-btn')?.addEventListener('click', () => {
    checkedQuestions.clear();
    render();
  });

  document.getElementById('review-test-now-btn')?.addEventListener('click', () => {
    opts?.onTest?.(displayedPrompt, selectedModelId, getSelectedTestQuestions());
  });

  document.getElementById('review-save-with-qs-btn')?.addEventListener('click', () => {
    const selectedQs = getSelectedTestQuestions();
    opts?.onSave?.(displayedPrompt, selectedModelId, selectedQs);
  });
}

// === HELPERS ===

function handleModelChange(newModelId: string): void {
  selectedModelId = newModelId;

  // Adapt the base prompt for the new model
  const result = adaptPromptForModel(basePrompt, newModelId);
  displayedPrompt = result.prompt;

  const family = getModelFamily(newModelId);
  const familyLabel = family ? family.charAt(0).toUpperCase() + family.slice(1) : 'Unknown';
  adaptationNotice = `Prompt adapted for ${familyLabel} \u2014 ${result.changesSummary}`;

  // Reset to review state when switching models
  currentState = 'review';
  render();
}

function updateCharCount(): void {
  const charCountEl = document.getElementById('review-char-count');
  if (!charCountEl) return;

  const count = displayedPrompt.length;
  let text = `${count.toLocaleString()} / ${MAX_CHARS.toLocaleString()} chars`;
  if (currentState === 'edit' || currentState === 'edit-diff') {
    text += ' \u00B7 modified';
  }
  charCountEl.textContent = text;

  charCountEl.classList.remove('error', 'warning');
  if (count > MAX_CHARS) charCountEl.classList.add('error');
  else if (count > MAX_CHARS * 0.9) charCountEl.classList.add('warning');
}

function getSelectedTestQuestions(): GeneratedTestQuestion[] {
  if (!opts) return [];
  return opts.testQuestions.filter((_, i) => checkedQuestions.has(i));
}

// === EXPORTS for external state queries ===

/** Get the current displayed prompt text. */
export function getCurrentPromptText(): string {
  return displayedPrompt;
}

/** Get the currently selected model ID. */
export function getCurrentModelId(): string {
  return selectedModelId;
}

/** Check if the prompt has been edited. */
export function hasUnsavedEdits(): boolean {
  return displayedPrompt !== basePrompt;
}
