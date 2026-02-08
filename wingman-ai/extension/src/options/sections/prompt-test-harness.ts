/**
 * Prompt Test Harness — Modal UI
 *
 * 3-tab test interface: Sample Qs, Custom Q, KB + Query.
 * Manages test execution, result display, and comparison mode.
 * Uses prompt-test-runner.ts for actual API calls.
 */

import type { TestQuestion, TestResult, ComparisonTestResult, KBTestResult } from '../../shared/persona';
import { getPersonas } from '../../shared/persona';
import { estimateCost, runKBTests } from '../../services/prompt-test-runner';
import { kbDatabase, type KBSearchResult } from '../../services/kb/kb-database';
import { searchKB } from '../../services/kb/kb-search';
import { generateTestQuestionsFromPrompt } from '../../services/prompt-assistant-engine';

// === TYPES ===

export type TestHarnessTab = 'sample' | 'custom' | 'kb';

export type TestHarnessContext =
  | 'review'    // from review/generation — footer: "Back to Edit" + "Save as v1"
  | 'editor'    // from "Test Current Prompts" — footer: "Close" + "Edit Prompt to Fix"
  | 'history';  // from version history — footer: "Back to History" + "Restore v[N]"

export interface AvailableVersion {
  version: number;
  summary: string;
  prompt: string;
}

export interface TestHarnessOptions {
  promptText: string;
  modelId: string;
  personaId: string;
  personaName: string;
  versionNumber?: number;
  context: TestHarnessContext;
  sampleQuestions?: TestQuestion[];
  availableVersions?: AvailableVersion[];
  onClose?: () => void;
  onSave?: () => void;
  onEditFix?: () => void;
  onRestore?: () => void;
}

// === STATE ===

let activeTab: TestHarnessTab = 'sample';
let options: TestHarnessOptions | null = null;
let sampleQuestions: TestQuestion[] = [];
let customQuestions: TestQuestion[] = [];
let results: TestResult[] | null = null;
let comparedVersionNumber: number | null = null;
let comparisonPrompt: string | null = null;
let comparisonResults: ComparisonTestResult[] | null = null;
let isRunning = false;
let isGeneratingQuestions = false;
let kbSearchResults: KBSearchResult[] | null = null;
let isKBSearching = false;
let kbTestResults: KBTestResult[] | null = null;
let isKBTesting = false;

// === DOM REFERENCES ===

function getOverlay(): HTMLElement | null {
  return document.getElementById('test-harness-overlay');
}

function getTitle(): HTMLElement | null {
  return document.getElementById('test-harness-title');
}

function getBody(): HTMLElement | null {
  return document.getElementById('test-harness-body');
}

function getFooter(): HTMLElement | null {
  return document.getElementById('test-harness-footer');
}

// === PUBLIC API ===

/**
 * Open the test harness modal.
 */
export function openTestHarness(opts: TestHarnessOptions): void {
  options = opts;
  activeTab = 'sample';
  results = null;
  comparedVersionNumber = null;
  comparisonPrompt = null;
  comparisonResults = null;
  isRunning = false;

  // Use provided sample questions or empty
  sampleQuestions = opts.sampleQuestions ?? [];
  customQuestions = [];

  const overlay = getOverlay();
  if (!overlay) return;

  overlay.hidden = false;
  overlay.classList.add('visible');

  // Close button
  const closeBtn = overlay.querySelector('.test-harness-close');
  closeBtn?.addEventListener('click', handleClose, { once: true });

  // Close on background click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) handleClose();
  }, { once: true });

  renderTitle();
  renderBody();
  renderFooter();
}

/**
 * Close the test harness modal.
 */
export function closeTestHarness(): void {
  const overlay = getOverlay();
  if (!overlay) return;

  overlay.classList.remove('visible');
  overlay.hidden = true;
  options = null;
  results = null;
  comparisonResults = null;
  comparisonPrompt = null;
  comparedVersionNumber = null;
}

/**
 * Set sample questions (called by external generation).
 */
export function setSampleQuestions(questions: TestQuestion[]): void {
  sampleQuestions = questions;
  if (activeTab === 'sample') renderBody();
}

/**
 * Get test results (for saving to version).
 */
export function getTestResults(): { passed: number; total: number; cost: number } | null {
  if (!results) return null;
  const passed = results.filter(r => r.status === 'pass').length;
  const total = results.length;
  const cost = results.reduce((sum, r) => sum + r.cost, 0);
  return { passed, total, cost };
}

// === RENDERING ===

function renderTitle(): void {
  const title = getTitle();
  if (!title || !options) return;

  if (comparisonResults) {
    const currentLabel = options.versionNumber ? `v${options.versionNumber}` : 'current';
    const comparedLabel = comparedVersionNumber ? `v${comparedVersionNumber}` : 'compared';
    title.textContent = `Comparison: ${currentLabel} vs ${comparedLabel}`;
  } else if (results) {
    const passed = results.filter(r => r.status === 'pass').length;
    const total = results.length;
    const allPass = passed === total;
    const hasError = results.some(r => r.status === 'error');

    if (hasError && passed < total) {
      title.textContent = 'Prompt Tester — Interrupted';
    } else if (allPass) {
      title.textContent = 'Test Results';
    } else {
      title.textContent = `Test Results — ${passed}/${total} pass`;
    }
  } else {
    const versionSuffix = options.versionNumber ? ` — v${options.versionNumber}` : '';
    title.textContent = activeTab === 'kb'
      ? `KB Validation${versionSuffix}`
      : `Prompt Tester${versionSuffix}`;
  }
}

function renderBody(): void {
  const body = getBody();
  if (!body || !options) return;

  body.innerHTML = '';

  // Version warning banner (non-current version)
  if (options.versionNumber && options.context === 'history') {
    const banner = document.createElement('div');
    banner.className = 'test-version-warning';
    banner.innerHTML = `Testing <strong>v${options.versionNumber}</strong> — not the current version`;
    body.appendChild(banner);
  }

  // Tab bar
  const tabBar = document.createElement('div');
  tabBar.className = 'test-tabs';
  const tabs: { id: TestHarnessTab; label: string }[] = [
    { id: 'sample', label: 'Sample Qs' },
    { id: 'custom', label: 'Custom Q' },
    { id: 'kb', label: 'KB + Query' },
  ];
  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.className = `test-tab${activeTab === tab.id ? ' test-tab--active' : ''}`;
    btn.textContent = tab.label;
    btn.addEventListener('click', () => {
      activeTab = tab.id;
      renderTitle();
      renderBody();
      renderFooter();
    });
    tabBar.appendChild(btn);
  }
  body.appendChild(tabBar);

  // Tab content
  if (comparisonResults) {
    renderComparisonResults(body);
  } else if (results) {
    renderResults(body);
  } else {
    switch (activeTab) {
      case 'sample': renderSampleTab(body); break;
      case 'custom': renderCustomTab(body); break;
      case 'kb': renderKBTab(body); break;
    }
  }
}

function renderSampleTab(container: HTMLElement): void {
  // If no sample questions, auto-generate them
  if (sampleQuestions.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'test-question-group';
    const hint = document.createElement('p');
    hint.className = 'test-empty-hint';
    hint.textContent = isGeneratingQuestions
      ? 'Generating sample questions from your prompt...'
      : 'No sample questions yet.';
    emptyState.appendChild(hint);

    if (!isGeneratingQuestions) {
      const genBtn = document.createElement('button');
      genBtn.className = 'btn-primary btn-small';
      genBtn.textContent = 'Generate Sample Questions';
      genBtn.style.marginTop = 'var(--spacing-sm)';
      genBtn.addEventListener('click', handleGenerateQuestions);
      emptyState.appendChild(genBtn);
    }

    container.appendChild(emptyState);
    return;
  }

  // Should Respond group
  const respondGroup = document.createElement('div');
  respondGroup.className = 'test-question-group';
  respondGroup.innerHTML = '<div class="test-question-group-label">SHOULD RESPOND</div>';
  const respondQs = sampleQuestions.filter(q => q.expectedBehavior === 'respond');
  for (const q of respondQs) {
    respondGroup.appendChild(createQuestionCheckbox(q, true));
  }
  container.appendChild(respondGroup);

  // Should Stay Silent group
  const silentGroup = document.createElement('div');
  silentGroup.className = 'test-question-group';
  silentGroup.innerHTML = '<div class="test-question-group-label">SHOULD STAY SILENT</div>';
  const silentQs = sampleQuestions.filter(q => q.expectedBehavior === 'silent');
  for (const q of silentQs) {
    silentGroup.appendChild(createQuestionCheckbox(q, true));
  }
  container.appendChild(silentGroup);

  // Cost estimate
  const totalQs = sampleQuestions.length + customQuestions.length;
  const isComparison = comparisonPrompt !== null;
  const cost = estimateCost(totalQs, isComparison);
  const costBox = document.createElement('div');
  costBox.className = 'test-cost-estimate';
  costBox.textContent = `${totalQs} questions × 1 model${isComparison ? ' × 2 versions' : ''} = ~$${cost.toFixed(3)}`;
  container.appendChild(costBox);

  // Comparison version selector
  renderComparisonSelector(container);

  // Run button
  const runBtn = document.createElement('button');
  runBtn.className = 'btn-primary test-run-btn';
  const versionLabel = options?.versionNumber ? ` on v${options.versionNumber}` : '';
  runBtn.textContent = `Run Tests${versionLabel}`;
  if (totalQs === 0) {
    runBtn.disabled = true;
  } else {
    runBtn.addEventListener('click', handleRunTests);
  }
  container.appendChild(runBtn);
}

function renderCustomTab(container: HTMLElement): void {
  // Existing custom questions
  if (customQuestions.length > 0) {
    const list = document.createElement('div');
    list.className = 'test-question-group';
    for (const q of customQuestions) {
      const item = createQuestionCheckbox(q, true);
      const removeBtn = document.createElement('button');
      removeBtn.className = 'test-question-remove';
      removeBtn.textContent = '\u00d7';
      removeBtn.addEventListener('click', () => {
        customQuestions = customQuestions.filter(cq => cq !== q);
        renderBody();
      });
      item.appendChild(removeBtn);
      list.appendChild(item);
    }
    container.appendChild(list);
  }

  // Add new question
  const addSection = document.createElement('div');
  addSection.className = 'test-add-question';
  addSection.innerHTML = `
    <div class="test-add-label">Add a question</div>
    <input type="text" class="text-input test-add-input" placeholder="Enter a test question..." id="custom-q-input">
    <div class="test-add-behavior">
      <label class="radio-option">
        <input type="radio" name="custom-q-behavior" value="respond" checked>
        <span class="radio-label">Should respond</span>
      </label>
      <label class="radio-option">
        <input type="radio" name="custom-q-behavior" value="silent">
        <span class="radio-label">Should stay silent</span>
      </label>
    </div>
    <button class="btn-primary btn-small" id="custom-q-add-btn">+ Add</button>
  `;
  container.appendChild(addSection);

  // Add button handler
  const addBtn = addSection.querySelector('#custom-q-add-btn');
  addBtn?.addEventListener('click', () => {
    const input = document.getElementById('custom-q-input') as HTMLInputElement | null;
    const behaviorRadio = addSection.querySelector('input[name="custom-q-behavior"]:checked') as HTMLInputElement | null;
    if (input?.value.trim()) {
      customQuestions.push({
        text: input.value.trim(),
        expectedBehavior: (behaviorRadio?.value as 'respond' | 'silent') ?? 'respond',
        source: 'user',
        category: 'custom',
      });
      input.value = '';
      renderBody();
    }
  });

  // Cost estimate + Run button (same as sample tab)
  const totalQs = sampleQuestions.length + customQuestions.length;
  const isComparison = comparisonPrompt !== null;
  const cost = estimateCost(totalQs, isComparison);
  const costBox = document.createElement('div');
  costBox.className = 'test-cost-estimate';
  costBox.textContent = `${totalQs} questions × 1 model${isComparison ? ' × 2 versions' : ''} = ~$${cost.toFixed(3)}`;
  container.appendChild(costBox);

  renderComparisonSelector(container);

  const runBtn = document.createElement('button');
  runBtn.className = 'btn-primary test-run-btn';
  const versionLabel = options?.versionNumber ? ` on v${options.versionNumber}` : '';
  runBtn.textContent = `Run Tests${versionLabel}`;
  if (totalQs === 0) {
    runBtn.disabled = true;
  } else {
    runBtn.addEventListener('click', handleRunTests);
  }
  container.appendChild(runBtn);
}

function renderKBTab(container: HTMLElement): void {
  if (!options) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'test-kb-wrapper';

  // Load persona's KB doc IDs and show linked documents
  void (async () => {
    const personas = await getPersonas();
    const persona = personas.find(p => p.id === options?.personaId);
    const docIds = persona?.kbDocumentIds ?? [];

    if (docIds.length === 0) {
      wrapper.innerHTML = '<p class="test-empty-hint">No KB documents linked to this persona. Upload documents in the persona editor to enable KB testing.</p>';
      return;
    }

    // Show linked docs
    const allDocs = await kbDatabase.getDocuments();
    const linkedDocs = allDocs.filter(d => docIds.includes(d.id));

    const docsHeader = document.createElement('div');
    docsHeader.className = 'test-kb-docs';
    docsHeader.innerHTML = `<strong>Linked KB Documents (${linkedDocs.length})</strong>`;
    const docList = document.createElement('ul');
    docList.className = 'test-kb-doc-list';
    for (const doc of linkedDocs) {
      const li = document.createElement('li');
      li.textContent = `${doc.filename} (${doc.chunkCount} chunks)`;
      docList.appendChild(li);
    }
    docsHeader.appendChild(docList);
    wrapper.appendChild(docsHeader);

    // Query input row
    const queryRow = document.createElement('div');
    queryRow.className = 'test-kb-query-row';
    queryRow.innerHTML = `
      <input type="text" id="kb-query-input" placeholder="Search your KB..." class="test-input" />
      <button class="btn-primary btn-small" id="kb-search-btn">Search</button>
    `;
    wrapper.appendChild(queryRow);

    // Results container
    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'kb-search-results';
    wrapper.appendChild(resultsContainer);

    // Wire search
    const searchBtn = queryRow.querySelector('#kb-search-btn') as HTMLButtonElement;
    const queryInput = queryRow.querySelector('#kb-query-input') as HTMLInputElement;

    const doSearch = async () => {
      const query = queryInput.value.trim();
      if (!query || isKBSearching) return;

      isKBSearching = true;
      searchBtn.disabled = true;
      searchBtn.textContent = 'Searching...';
      resultsContainer.innerHTML = '';

      try {
        kbSearchResults = await searchKB(query, 5, 0.3, docIds);
        renderKBResults(resultsContainer, query);
      } catch (err) {
        resultsContainer.innerHTML = `<p class="test-error">Search failed: ${err instanceof Error ? err.message : 'Unknown error'}</p>`;
      } finally {
        isKBSearching = false;
        searchBtn.disabled = false;
        searchBtn.textContent = 'Search';
      }
    };

    searchBtn.addEventListener('click', doSearch);
    queryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void doSearch();
    });

    // --- KB Integration Tests section ---
    const testSection = document.createElement('div');
    testSection.className = 'test-kb-integration';

    const testHeader = document.createElement('div');
    testHeader.className = 'test-kb-docs';
    testHeader.innerHTML = '<strong>KB Integration Tests</strong>';
    testSection.appendChild(testHeader);

    const testDesc = document.createElement('p');
    testDesc.className = 'test-empty-hint';
    testDesc.textContent = 'Auto-generates 3 tests: real citation, impossible knowledge (injected fact), and missing data (should decline).';
    testSection.appendChild(testDesc);

    // Optional impossible fact input
    const factRow = document.createElement('div');
    factRow.className = 'test-kb-query-row';
    factRow.innerHTML = `
      <input type="text" id="kb-impossible-fact" placeholder="Custom impossible fact (default: $999/seat Enterprise)" class="test-input" />
      <button class="btn-primary btn-small" id="kb-run-tests-btn">${isKBTesting ? 'Running...' : 'Run KB Tests'}</button>
    `;
    testSection.appendChild(factRow);

    // KB test results container
    const kbTestContainer = document.createElement('div');
    kbTestContainer.id = 'kb-test-results';
    if (kbTestResults) {
      renderKBTestResults(kbTestContainer);
    }
    testSection.appendChild(kbTestContainer);

    wrapper.appendChild(testSection);

    // Wire run button
    const runTestsBtn = factRow.querySelector('#kb-run-tests-btn') as HTMLButtonElement;
    runTestsBtn.disabled = isKBTesting;
    runTestsBtn.addEventListener('click', async () => {
      if (!options || isKBTesting) return;
      isKBTesting = true;
      runTestsBtn.disabled = true;
      runTestsBtn.textContent = 'Running...';
      kbTestContainer.innerHTML = '<p class="test-empty-hint">Running 3 KB tests against the model... this may take 15-30 seconds.</p>';

      // Get API key
      const storage = await chrome.storage.local.get(['geminiApiKey', 'llmProvider', 'openrouterApiKey', 'groqApiKey']);
      const provider = (storage['llmProvider'] as string) ?? 'gemini';
      let apiKey = '';
      switch (provider) {
        case 'gemini': apiKey = (storage['geminiApiKey'] as string) ?? ''; break;
        case 'openrouter': apiKey = (storage['openrouterApiKey'] as string) ?? ''; break;
        case 'groq': apiKey = (storage['groqApiKey'] as string) ?? ''; break;
      }

      if (!apiKey) {
        kbTestContainer.innerHTML = '<p class="test-error">No API key configured for the active provider.</p>';
        isKBTesting = false;
        runTestsBtn.disabled = false;
        runTestsBtn.textContent = 'Run KB Tests';
        return;
      }

      const factInput = document.getElementById('kb-impossible-fact') as HTMLInputElement | null;
      const customFact = factInput?.value.trim() || undefined;

      try {
        kbTestResults = await runKBTests(
          options.modelId, apiKey, options.promptText, options.personaId, customFact,
        );
        kbTestContainer.innerHTML = '';
        renderKBTestResults(kbTestContainer);
      } catch (err) {
        kbTestContainer.innerHTML = `<p class="test-error">KB tests failed: ${err instanceof Error ? err.message : 'Unknown error'}</p>`;
      } finally {
        isKBTesting = false;
        runTestsBtn.disabled = false;
        runTestsBtn.textContent = 'Run KB Tests';
      }
    });
  })();

  container.appendChild(wrapper);
}

function renderKBResults(container: HTMLElement, query: string): void {
  if (!kbSearchResults || kbSearchResults.length === 0) {
    container.innerHTML = `<p class="test-empty-hint">No results found for "${query}". Try a different query or check that documents are fully indexed.</p>`;
    return;
  }

  const header = document.createElement('div');
  header.className = 'test-kb-results-header';
  header.innerHTML = `<strong>${kbSearchResults.length} results</strong> for "${query}"`;
  container.appendChild(header);

  for (const result of kbSearchResults) {
    const card = document.createElement('div');
    card.className = 'test-result-card';

    const scorePercent = Math.round(result.score * 100);
    const scoreClass = result.score >= 0.7 ? 'pass' : result.score >= 0.5 ? 'warn' : 'fail';

    card.innerHTML = `
      <div class="test-result-header">
        <span class="test-result-badge test-badge--${scoreClass}">${scorePercent}%</span>
        <span class="test-result-source">${result.documentName}</span>
      </div>
      <div class="test-result-text">${truncateText(result.chunk.text, 300)}</div>
    `;
    container.appendChild(card);
  }
}

function renderKBTestResults(container: HTMLElement): void {
  if (!kbTestResults || kbTestResults.length === 0) return;

  const passed = kbTestResults.filter(r => r.status === 'pass').length;
  const total = kbTestResults.length;
  const allPass = passed === total;

  // Summary banner
  const banner = document.createElement('div');
  banner.className = allPass ? 'test-success-banner' : 'test-fail-banner';
  banner.innerHTML = allPass
    ? `<strong>All KB Tests Passed</strong> (${passed}/${total})`
    : `<strong>KB Tests: ${passed}/${total} passed</strong>`;
  container.appendChild(banner);

  // Individual result cards
  for (const result of kbTestResults) {
    const card = document.createElement('div');
    card.className = `test-result-card test-result-card--${result.status}`;

    const icon = result.status === 'pass' ? '\u2713' : result.status === 'fail' ? '\u2717' : '\u26a0';
    const header = document.createElement('div');
    header.className = 'test-result-header';
    header.textContent = `${icon} ${result.question.groupLabel ?? result.question.category}`;
    card.appendChild(header);

    if (result.question.behaviorHint) {
      const hint = document.createElement('div');
      hint.className = 'test-behavior-hint';
      hint.textContent = result.question.behaviorHint;
      card.appendChild(hint);
    }

    // KB metadata
    const meta: string[] = [];
    if (result.kbChunkRetrieved) meta.push('KB chunk retrieved');
    if (result.similarityScore !== null) meta.push(`Similarity: ${Math.round(result.similarityScore * 100)}%`);
    if (result.sourceFilename) meta.push(`Source: ${result.sourceFilename}`);
    if (result.citationCorrect !== null) meta.push(result.citationCorrect ? 'Citation correct' : 'Citation incorrect');

    if (meta.length > 0) {
      const metaDiv = document.createElement('div');
      metaDiv.className = 'test-summary-line';
      metaDiv.textContent = meta.join(' \u00b7 ');
      card.appendChild(metaDiv);
    }

    if (result.response) {
      const responseDiv = document.createElement('div');
      responseDiv.className = 'test-result-response';
      responseDiv.textContent = truncateText(result.response, 300);
      card.appendChild(responseDiv);
    }

    // Badge
    const badge = document.createElement('span');
    badge.className = `test-result-badge test-result-badge--${result.status}`;
    badge.textContent = result.status === 'pass' ? '\u2713 Pass'
      : result.status === 'fail' ? `\u2717 ${result.failureReason ?? 'Failed'}`
      : `\u26a0 ${result.errorMessage ?? 'Error'}`;
    card.appendChild(badge);

    container.appendChild(card);
  }
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

function renderResults(container: HTMLElement): void {
  if (!results) return;

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const errors = results.filter(r => r.status === 'error').length;
  const total = results.length;
  const allPass = passed === total;
  const allFail = passed === 0 && errors === 0;

  // All-pass banner
  if (allPass) {
    const banner = document.createElement('div');
    banner.className = 'test-success-banner';
    banner.innerHTML = `
      <div class="test-success-icon">\ud83c\udf89</div>
      <div class="test-success-title">All Tests Passed</div>
      <div class="test-success-detail">${total}/${total} questions \u00b7 ${options?.modelId ?? 'Unknown'}</div>
    `;
    container.appendChild(banner);
  }

  // All-fail banner
  if (allFail) {
    const banner = document.createElement('div');
    banner.className = 'test-fail-banner';
    banner.innerHTML = `
      <strong>All tests failed</strong>
      <p>This prompt may need significant revision. Consider re-running the Setup Assistant with different inputs, or try a different target model.</p>
    `;
    container.appendChild(banner);
  }

  // Result cards
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const card = document.createElement('div');
    card.className = `test-result-card test-result-card--${result.status}`;

    const icon = result.status === 'pass' ? '\u2713' : result.status === 'fail' ? '\u2717' : '\u26a0';
    const header = document.createElement('div');
    header.className = 'test-result-header';
    header.textContent = `${icon} Q${i + 1}: ${result.question.text}`;
    if (result.question.behaviorHint) {
      const hint = document.createElement('span');
      hint.className = 'test-behavior-hint';
      hint.textContent = ` (${result.question.behaviorHint})`;
      header.appendChild(hint);
    }
    card.appendChild(header);

    if (result.response) {
      const responseDiv = document.createElement('div');
      responseDiv.className = 'test-result-response';
      responseDiv.textContent = result.response;
      card.appendChild(responseDiv);
    }

    // Badge
    const badge = document.createElement('span');
    badge.className = `test-result-badge test-result-badge--${result.status}`;
    if (result.status === 'pass') {
      badge.textContent = result.question.expectedBehavior === 'silent' ? '\u2713 Silent' : '\u2713 Pass';
    } else if (result.status === 'fail' && result.failureReason) {
      const reasons: Record<string, string> = {
        'wrong-behavior': '\u2717 Wrong behavior',
        'should-have-responded': '\u2717 Should have responded',
        'off-topic': '\u2717 Off-topic response',
        'should-be-silent': '\u2717 Should be silent',
      };
      badge.textContent = reasons[result.failureReason] ?? '\u2717 Failed';
    } else if (result.status === 'error') {
      badge.textContent = `\u26a0 Error: ${result.errorMessage ?? 'Unknown'}`;
    }
    card.appendChild(badge);

    container.appendChild(card);
  }

  // Summary line
  const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
  const summary = document.createElement('div');
  summary.className = 'test-summary-line';
  summary.textContent = `${passed}/${total} passed \u00b7 ${failed} failure${failed !== 1 ? 's' : ''} \u00b7 Actual cost: $${totalCost.toFixed(3)}`;
  container.appendChild(summary);
}

function renderFooter(): void {
  const footer = getFooter();
  if (!footer || !options) return;

  footer.innerHTML = '';

  if (comparisonResults) {
    // Comparison mode footer
    footer.innerHTML = `
      <button class="btn-secondary" id="test-close-btn">Close</button>
      <button class="btn-primary" id="test-editfix-btn">Edit Prompt to Fix</button>
    `;
  } else if (results) {
    const allPass = results.every(r => r.status === 'pass');
    const hasError = results.some(r => r.status === 'error');

    if (hasError) {
      footer.innerHTML = `
        <button class="btn-secondary" id="test-close-btn">Close</button>
        <button class="btn-primary" id="test-retry-btn">Retry Failed Tests</button>
      `;
    } else if (allPass && options.context === 'review') {
      footer.innerHTML = `
        <button class="btn-secondary" id="test-edit-btn">Edit More</button>
        <button class="btn-primary" id="test-save-btn">Save as v${options.versionNumber ?? 1}</button>
      `;
    } else {
      switch (options.context) {
        case 'review':
          footer.innerHTML = `
            <button class="btn-secondary" id="test-back-btn">Back to Edit</button>
            <button class="btn-primary" id="test-save-btn">Save as v${options.versionNumber ?? 1}</button>
          `;
          break;
        case 'editor':
          footer.innerHTML = `
            <button class="btn-secondary" id="test-close-btn">Close</button>
            <button class="btn-primary" id="test-editfix-btn">Edit Prompt to Fix</button>
          `;
          break;
        case 'history':
          footer.innerHTML = `
            <button class="btn-secondary" id="test-back-btn">Back to History</button>
            ${options.versionNumber ? `<button class="btn-secondary" id="test-restore-btn">Restore v${options.versionNumber}</button>` : ''}
          `;
          break;
      }
    }
  } else {
    // Pre-run footer
    footer.innerHTML = '';
  }

  // Bind events
  footer.querySelector('#test-close-btn')?.addEventListener('click', handleClose);
  footer.querySelector('#test-back-btn')?.addEventListener('click', handleClose);
  footer.querySelector('#test-save-btn')?.addEventListener('click', () => options?.onSave?.());
  footer.querySelector('#test-editfix-btn')?.addEventListener('click', () => options?.onEditFix?.());
  footer.querySelector('#test-restore-btn')?.addEventListener('click', () => options?.onRestore?.());
  footer.querySelector('#test-edit-btn')?.addEventListener('click', handleClose);
  footer.querySelector('#test-retry-btn')?.addEventListener('click', () => {
    // Clear previous results and re-run
    results = null;
    comparisonResults = null;
    renderTitle();
    renderBody();
    renderFooter();
    void handleRunTests();
  });
}

// === COMPARISON UI ===

function renderComparisonSelector(container: HTMLElement): void {
  const versions = options?.availableVersions;
  if (!versions || versions.length === 0) return;

  const section = document.createElement('div');
  section.className = 'test-comparison-selector';

  const label = document.createElement('div');
  label.className = 'test-comparison-label';
  label.textContent = 'Compare against:';
  section.appendChild(label);

  const radioGroup = document.createElement('div');
  radioGroup.className = 'test-comparison-options';

  // "None" option
  const noneOption = createComparisonRadio('none', 'None', comparedVersionNumber === null);
  noneOption.querySelector('input')?.addEventListener('change', () => {
    comparisonPrompt = null;
    comparedVersionNumber = null;
    renderBody();
  });
  radioGroup.appendChild(noneOption);

  // One option per available version
  for (const ver of versions) {
    const isSelected = comparedVersionNumber === ver.version;
    const optionLabel = `v${ver.version} — ${ver.summary}`;
    const option = createComparisonRadio(`v${ver.version}`, optionLabel, isSelected);
    option.querySelector('input')?.addEventListener('change', () => {
      comparisonPrompt = ver.prompt;
      comparedVersionNumber = ver.version;
      renderBody();
    });
    radioGroup.appendChild(option);
  }

  section.appendChild(radioGroup);
  container.appendChild(section);
}

function createComparisonRadio(value: string, labelText: string, checked: boolean): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'radio-option test-comparison-radio';

  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'comparison-version';
  input.value = value;
  input.checked = checked;

  const span = document.createElement('span');
  span.className = 'radio-label';
  span.textContent = labelText;

  wrapper.appendChild(input);
  wrapper.appendChild(span);
  return wrapper;
}

function renderComparisonResults(container: HTMLElement): void {
  if (!comparisonResults || !options) return;

  const currentLabel = options.versionNumber ? `v${options.versionNumber}` : 'current';
  const comparedLabel = comparedVersionNumber ? `v${comparedVersionNumber}` : 'compared';

  const currentPassed = comparisonResults.filter(r => r.current.status === 'pass').length;
  const comparedPassed = comparisonResults.filter(r => r.compared.status === 'pass').length;
  const total = comparisonResults.length;

  const currentIsWinner = currentPassed >= comparedPassed;
  const comparedIsWinner = comparedPassed >= currentPassed;
  const isTie = currentPassed === comparedPassed;

  // Summary scorecards (2-column grid)
  const scorecardGrid = document.createElement('div');
  scorecardGrid.className = 'test-comparison-scorecards';

  const currentCard = document.createElement('div');
  currentCard.className = `test-comparison-scorecard${!isTie && currentIsWinner ? ' test-comparison-scorecard--winner' : ''}${!isTie && !currentIsWinner ? ' test-comparison-scorecard--loser' : ''}`;
  currentCard.innerHTML = `
    <div class="test-comparison-scorecard-label">${currentLabel}</div>
    <div class="test-comparison-scorecard-score">${currentPassed}/${total} pass</div>
  `;
  scorecardGrid.appendChild(currentCard);

  const comparedCard = document.createElement('div');
  comparedCard.className = `test-comparison-scorecard${!isTie && comparedIsWinner ? ' test-comparison-scorecard--winner' : ''}${!isTie && !comparedIsWinner ? ' test-comparison-scorecard--loser' : ''}`;
  comparedCard.innerHTML = `
    <div class="test-comparison-scorecard-label">${comparedLabel}</div>
    <div class="test-comparison-scorecard-score">${comparedPassed}/${total} pass</div>
  `;
  scorecardGrid.appendChild(comparedCard);

  container.appendChild(scorecardGrid);

  // Per-question comparison cards
  for (let i = 0; i < comparisonResults.length; i++) {
    const result = comparisonResults[i]!;
    const bothPass = result.current.status === 'pass' && result.compared.status === 'pass';
    const bothFail = result.current.status !== 'pass' && result.compared.status !== 'pass';
    const oneFails = !bothPass && !bothFail;

    let cardStatus: string;
    if (bothPass) cardStatus = 'both-pass';
    else if (bothFail) cardStatus = 'both-fail';
    else cardStatus = 'mixed';

    const card = document.createElement('div');
    card.className = `test-comparison-card test-comparison-card--${cardStatus}`;

    // Card header
    const icon = bothPass ? '\u2713' : oneFails ? '\u26a0' : '\u2717';
    const header = document.createElement('div');
    header.className = 'test-comparison-card-header';
    header.textContent = `${icon} Q${i + 1}: ${result.question.text}`;
    card.appendChild(header);

    // Two-column response area
    const columns = document.createElement('div');
    columns.className = 'test-comparison-columns';

    // Current version column
    const currentCol = document.createElement('div');
    currentCol.className = `test-comparison-column${result.current.status === 'pass' ? ' test-comparison-column--pass' : ' test-comparison-column--fail'}`;

    const currentColLabel = document.createElement('div');
    currentColLabel.className = 'test-comparison-column-label';
    currentColLabel.textContent = currentLabel;
    currentCol.appendChild(currentColLabel);

    const currentBadge = document.createElement('span');
    currentBadge.className = `test-result-badge test-result-badge--${result.current.status}`;
    currentBadge.textContent = formatBadgeText(result.current);
    currentCol.appendChild(currentBadge);

    if (result.current.response) {
      const currentResponse = document.createElement('div');
      currentResponse.className = 'test-result-response';
      currentResponse.textContent = result.current.response;
      currentCol.appendChild(currentResponse);
    }
    columns.appendChild(currentCol);

    // Compared version column
    const comparedCol = document.createElement('div');
    comparedCol.className = `test-comparison-column${result.compared.status === 'pass' ? ' test-comparison-column--pass' : ' test-comparison-column--fail'}`;

    const comparedColLabel = document.createElement('div');
    comparedColLabel.className = 'test-comparison-column-label';
    comparedColLabel.textContent = comparedLabel;
    comparedCol.appendChild(comparedColLabel);

    const comparedBadge = document.createElement('span');
    comparedBadge.className = `test-result-badge test-result-badge--${result.compared.status}`;
    comparedBadge.textContent = formatBadgeText(result.compared);
    comparedCol.appendChild(comparedBadge);

    if (result.compared.response) {
      const comparedResponse = document.createElement('div');
      comparedResponse.className = 'test-result-response';
      comparedResponse.textContent = result.compared.response;
      comparedCol.appendChild(comparedResponse);
    }
    columns.appendChild(comparedCol);

    card.appendChild(columns);
    container.appendChild(card);
  }

  // Summary footer
  const totalCurrentCost = comparisonResults.reduce((sum, r) => sum + r.current.cost, 0);
  const totalComparedCost = comparisonResults.reduce((sum, r) => sum + r.compared.cost, 0);
  const totalCost = totalCurrentCost + totalComparedCost;

  const summary = document.createElement('div');
  summary.className = 'test-summary-line';
  summary.textContent = `${currentLabel}: ${currentPassed}/${total} pass \u00b7 ${comparedLabel}: ${comparedPassed}/${total} pass \u00b7 Actual cost: $${totalCost.toFixed(3)}`;
  container.appendChild(summary);
}

function formatBadgeText(result: TestResult): string {
  if (result.status === 'pass') {
    return result.question.expectedBehavior === 'silent' ? '\u2713 Silent' : '\u2713 Pass';
  }
  if (result.status === 'fail' && result.failureReason) {
    const reasons: Record<string, string> = {
      'wrong-behavior': '\u2717 Wrong behavior',
      'should-have-responded': '\u2717 Should have responded',
      'off-topic': '\u2717 Off-topic response',
      'should-be-silent': '\u2717 Should be silent',
    };
    return reasons[result.failureReason] ?? '\u2717 Failed';
  }
  if (result.status === 'error') {
    return `\u26a0 Error: ${result.errorMessage ?? 'Unknown'}`;
  }
  return '\u2717 Failed';
}

// === HELPERS ===

function createQuestionCheckbox(question: TestQuestion, checked: boolean): HTMLElement {
  const item = document.createElement('label');
  item.className = 'test-question-item';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.className = 'test-question-checkbox';

  const text = document.createElement('span');
  text.className = 'test-question-text';
  text.textContent = question.text;

  const badge = document.createElement('span');
  badge.className = `test-behavior-badge test-behavior-badge--${question.expectedBehavior}`;
  badge.textContent = question.expectedBehavior === 'respond' ? 'should respond' : 'should stay silent';

  item.appendChild(checkbox);
  item.appendChild(text);
  item.appendChild(badge);

  return item;
}

async function handleRunTests(): Promise<void> {
  if (!options || isRunning) return;
  isRunning = true;

  // Show loading state immediately
  const body = getBody();
  if (body) {
    const loading = document.createElement('div');
    loading.className = 'test-question-group';
    loading.innerHTML = '<p class="test-empty-hint">Running tests... this may take 15-30 seconds.</p>';
    body.innerHTML = '';
    body.appendChild(loading);
  }

  // Collect checked questions
  const allQuestions = [...sampleQuestions, ...customQuestions];
  if (allQuestions.length === 0) {
    isRunning = false;
    renderBody();
    return;
  }

  // Get API key
  const storage = await chrome.storage.local.get(['geminiApiKey', 'llmProvider', 'openrouterApiKey', 'groqApiKey']);
  const provider = (storage['llmProvider'] as string) ?? 'gemini';
  let apiKey = '';
  switch (provider) {
    case 'gemini': apiKey = (storage['geminiApiKey'] as string) ?? ''; break;
    case 'openrouter': apiKey = (storage['openrouterApiKey'] as string) ?? ''; break;
    case 'groq': apiKey = (storage['groqApiKey'] as string) ?? ''; break;
  }

  if (!apiKey) {
    isRunning = false;
    renderBody();
    const errBody = getBody();
    if (errBody) {
      const errMsg = document.createElement('p');
      errMsg.className = 'test-error';
      errMsg.textContent = 'No API key found for the active provider. Check your API keys in the Setup tab.';
      errBody.appendChild(errMsg);
    }
    return;
  }

  try {
    if (comparisonPrompt !== null) {
      const { runComparisonTests } = await import('../../services/prompt-test-runner');
      comparisonResults = await runComparisonTests(
        options.modelId, apiKey, options.promptText, comparisonPrompt, allQuestions
      );
    } else {
      const { runTests } = await import('../../services/prompt-test-runner');
      results = await runTests(options.modelId, apiKey, options.promptText, allQuestions);
    }
  } catch (err) {
    console.error('[TestHarness] Run failed:', err);
  }

  isRunning = false;
  renderTitle();
  renderBody();
  renderFooter();
}

async function handleGenerateQuestions(): Promise<void> {
  if (!options || isGeneratingQuestions) return;
  isGeneratingQuestions = true;
  renderBody();

  try {
    console.log('[TestHarness] Generating sample questions from prompt...');
    const generated = await generateTestQuestionsFromPrompt(options.promptText);
    console.log('[TestHarness] Generated', generated.length, 'questions');
    sampleQuestions = generated.map(q => ({
      text: q.text,
      expectedBehavior: q.expectedBehavior,
      source: 'auto' as const,
    }));

    // Persist to the latest PromptVersion so they survive close/reopen
    if (sampleQuestions.length > 0) {
      try {
        const { getPersonas, savePersonas } = await import('../../shared/persona');
        const personas = await getPersonas();
        const persona = personas.find(p => p.id === options!.personaId);
        if (persona?.promptVersions && persona.promptVersions.length > 0) {
          const latest = persona.promptVersions.reduce((a, b) => a.version > b.version ? a : b);
          latest.testQuestions = sampleQuestions.map(q => ({
            text: q.text,
            expectedBehavior: q.expectedBehavior,
            source: 'auto' as const,
          }));
          await savePersonas(personas);
          console.log('[TestHarness] Saved test questions to version', latest.version);
        }
      } catch (saveErr) {
        console.warn('[TestHarness] Could not persist test questions:', saveErr);
      }
    }
  } catch (err) {
    console.error('[TestHarness] Generate questions failed:', err);
    isGeneratingQuestions = false;
    renderBody();
    const body = getBody();
    if (body) {
      const errMsg = document.createElement('p');
      errMsg.className = 'test-error';
      errMsg.textContent = `Failed to generate questions: ${err instanceof Error ? err.message : 'Unknown error'}`;
      body.appendChild(errMsg);
    }
    return;
  }

  isGeneratingQuestions = false;
  renderBody();
}

function handleClose(): void {
  closeTestHarness();
  options?.onClose?.();
}
