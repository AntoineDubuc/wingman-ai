/**
 * Prompt Version History — Inline Panel
 *
 * Replaces persona editor content when "Version History" is clicked.
 * Shows all versions with actions: diff, test, restore, delete.
 * Not a modal — toggles visibility with the editor content.
 */

import type { PromptVersion } from '../../shared/persona';
import { getPromptVersions, restorePromptVersion, deletePromptVersion } from '../../services/prompt-version';
import { generateDiff, type DiffLine } from '../../services/prompt-diff';

// === TYPES ===

export interface VersionHistoryOptions {
  personaId: string;
  personaName: string;
  onBack?: () => void;
  onTest?: (version: PromptVersion) => void;
  onDiff?: (fromVersion: PromptVersion, toVersion: PromptVersion) => void;
  onRestore?: (restoredVersion: PromptVersion) => void;
  /** Plan 5: localized translation function from OptionsContext. */
  t?: (key: string, opts?: Record<string, unknown>) => string;
}

function tr(key: string, opts?: Record<string, unknown>): string | null {
  return options?.t?.(key, opts) ?? null;
}

// === STATE ===

let options: VersionHistoryOptions | null = null;
let versions: PromptVersion[] = [];
let diffView: { from: PromptVersion; to: PromptVersion } | null = null;

// === DOM REFERENCES ===

function getPanel(): HTMLElement | null {
  return document.getElementById('version-history-panel');
}

// === PUBLIC API ===

/**
 * Open the version history panel (replaces editor content).
 */
export async function openVersionHistory(opts: VersionHistoryOptions): Promise<void> {
  options = opts;
  diffView = null;

  // Load versions
  versions = await getPromptVersions(opts.personaId);

  const panel = getPanel();
  if (!panel) return;

  // Hide persona editor, show version history panel
  const editor = document.getElementById('persona-editor');
  if (editor) editor.hidden = true;

  panel.hidden = false;
  renderPanel();
}

/**
 * Close the version history panel.
 */
export function closeVersionHistory(): void {
  const panel = getPanel();
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
  }

  // Restore persona editor visibility
  const editor = document.getElementById('persona-editor');
  if (editor) editor.hidden = false;

  options = null;
  versions = [];
  diffView = null;
}

/**
 * Refresh the version list (after restore/delete).
 */
export async function refreshVersions(): Promise<void> {
  if (!options) return;
  versions = await getPromptVersions(options.personaId);
  renderPanel();
}

// === RENDERING ===

function renderPanel(): void {
  const panel = getPanel();
  if (!panel || !options) return;

  panel.innerHTML = '';

  // Header — Plan 5 NFR-SEC04: build via createElement+textContent
  // (personaName is user-controlled). Localized via options.t.
  const header = document.createElement('div');
  header.className = 'version-history-header';
  const headerInner = document.createElement('div');
  const titleEl = document.createElement('h2');
  titleEl.className = 'form-section-title';
  titleEl.textContent = tr('options.prompt_modals.version_history.title', { personaName: options.personaName })
    ?? `Prompt History — ${options.personaName}`;
  const descEl = document.createElement('p');
  descEl.className = 'form-section-description';
  descEl.textContent = tr('options.prompt_modals.version_history.description')
    ?? 'Every prompt version with test results and costs.';
  headerInner.appendChild(titleEl);
  headerInner.appendChild(descEl);
  const backBtn = document.createElement('button');
  backBtn.className = 'btn-secondary btn-small';
  backBtn.id = 'version-back-btn';
  backBtn.textContent = tr('options.prompt_modals.version_history.btn_back') ?? 'Back';
  header.appendChild(headerInner);
  header.appendChild(backBtn);
  panel.appendChild(header);

  header.querySelector('#version-back-btn')?.addEventListener('click', () => {
    closeVersionHistory();
    options?.onBack?.();
  });

  // Diff view (if active)
  if (diffView) {
    renderDiffView(panel);
    return;
  }

  // Version list
  if (versions.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'version-empty';
    empty.textContent = tr('options.prompt_modals.version_history.empty_state') ?? 'No versions yet.';
    panel.appendChild(empty);
    return;
  }

  const currentVersion = Math.max(...versions.map(v => v.version));

  const list = document.createElement('div');
  list.className = 'version-list';

  for (const version of versions) {
    const isCurrent = version.version === currentVersion;
    const item = document.createElement('div');
    item.className = `version-item${isCurrent ? ' version-item--current' : ''}`;

    // Meta section
    const meta = document.createElement('div');
    meta.className = 'version-meta';

    // Version label + badges
    const labelRow = document.createElement('div');
    labelRow.className = 'version-label-row';

    const vLabel = document.createElement('strong');
    vLabel.textContent = `v${version.version}`;
    labelRow.appendChild(vLabel);

    if (isCurrent) {
      const badge = document.createElement('span');
      badge.className = 'version-badge version-badge--current';
      badge.textContent = tr('options.prompt_modals.version_history.badge_current') ?? 'current';
      labelRow.appendChild(badge);
    }

    // Source badge — Plan 5: localized
    const sourceBadge = document.createElement('span');
    sourceBadge.className = `version-badge version-badge--${version.source}`;
    switch (version.source) {
      case 'manual': sourceBadge.textContent = tr('options.prompt_modals.version_history.badge_manual') ?? 'manual edit'; break;
      case 'assistant': sourceBadge.textContent = tr('options.prompt_modals.version_history.badge_assistant') ?? 'setup assistant'; break;
      case 'restored': sourceBadge.textContent = tr('options.prompt_modals.version_history.badge_restored') ?? 'restored'; break;
      case 'template': sourceBadge.textContent = tr('options.prompt_modals.version_history.badge_template') ?? 'from template'; break;
      case 'imported': sourceBadge.textContent = tr('options.prompt_modals.version_history.badge_imported') ?? 'imported'; break;
    }
    labelRow.appendChild(sourceBadge);
    meta.appendChild(labelRow);

    // Summary
    const summary = document.createElement('div');
    summary.className = 'version-summary';
    summary.textContent = version.summary;
    meta.appendChild(summary);

    // Stats line
    const stats = document.createElement('div');
    stats.className = 'version-stats';
    const parts: string[] = [];
    if (version.testResults) {
      parts.push(`Test: ${version.testResults.passed}/${version.testResults.total} pass`);
      if (version.testResults.modelId) parts.push(version.testResults.modelId);
      parts.push(`Cost: $${version.testResults.cost.toFixed(3)}`);
    } else {
      parts.push('No tests yet');
    }
    if (version.targetModel) parts.push(version.targetModel);
    parts.push(formatDate(version.timestamp));
    stats.textContent = parts.join(' · ');
    meta.appendChild(stats);

    item.appendChild(meta);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'version-actions';

    // Diff button (always)
    const diffBtn = document.createElement('button');
    diffBtn.className = 'btn-secondary btn-small';
    diffBtn.textContent = tr('options.prompt_modals.version_history.btn_diff') ?? 'Diff';
    diffBtn.addEventListener('click', () => handleDiff(version));
    actions.appendChild(diffBtn);

    // Test button (always)
    const testBtn = document.createElement('button');
    testBtn.className = 'btn-secondary btn-small';
    testBtn.textContent = tr('options.prompt_modals.version_history.btn_test') ?? 'Test';
    testBtn.addEventListener('click', () => options?.onTest?.(version));
    actions.appendChild(testBtn);

    if (!isCurrent) {
      // Restore button
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'btn-secondary btn-small';
      restoreBtn.textContent = tr('options.prompt_modals.version_history.btn_restore') ?? 'Restore';
      restoreBtn.addEventListener('click', () => handleRestore(version));
      actions.appendChild(restoreBtn);

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-secondary btn-small version-delete-btn';
      deleteBtn.textContent = tr('options.prompt_modals.version_history.btn_delete') ?? 'Delete';
      deleteBtn.addEventListener('click', () => handleDelete(version));
      actions.appendChild(deleteBtn);
    }

    item.appendChild(actions);
    list.appendChild(item);
  }

  panel.appendChild(list);
}

function renderDiffView(container: HTMLElement): void {
  if (!diffView) return;

  const _diffLines: DiffLine[] = generateDiff(diffView.from.prompt, diffView.to.prompt);

  const diffSection = document.createElement('div');
  diffSection.className = 'version-diff-view';

  // Diff header
  const diffHeader = document.createElement('div');
  diffHeader.className = 'version-diff-header';
  const fromModel = diffView.from.targetModel ? ` (${diffView.from.targetModel.split('/').pop()})` : '';
  const toModel = diffView.to.targetModel ? ` (${diffView.to.targetModel.split('/').pop()})` : '';
  diffHeader.textContent = tr('options.prompt_modals.version_history.diff_header', {
    from: diffView.from.version,
    fromModel,
    to: diffView.to.version,
    toModel,
  }) ?? `Diff: v${diffView.from.version}${fromModel} → v${diffView.to.version}${toModel}`;
  diffSection.appendChild(diffHeader);

  // Version selectors
  const selectors = document.createElement('div');
  selectors.className = 'version-diff-selectors';

  const fromSelect = createVersionSelect(
    tr('options.prompt_modals.version_history.select_from') ?? 'From',
    diffView.from.version, (v) => {
    if (diffView) {
      const newFrom = versions.find(ver => ver.version === v);
      if (newFrom) {
        diffView.from = newFrom;
        renderPanel();
      }
    }
  });

  const arrow = document.createElement('span');
  arrow.className = 'version-diff-arrow';
  arrow.textContent = '\u2192';

  const toSelect = createVersionSelect(
    tr('options.prompt_modals.version_history.select_to') ?? 'To',
    diffView.to.version, (v) => {
    if (diffView) {
      const newTo = versions.find(ver => ver.version === v);
      if (newTo) {
        diffView.to = newTo;
        renderPanel();
      }
    }
  });

  selectors.appendChild(fromSelect);
  selectors.appendChild(arrow);
  selectors.appendChild(toSelect);
  diffSection.appendChild(selectors);

  // Diff block
  const diffBlock = document.createElement('div');
  diffBlock.className = 'diff-block';

  for (const line of _diffLines) {
    const lineEl = document.createElement('div');
    lineEl.className = `diff-line diff-${line.type}`;

    const prefix = line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  ';
    lineEl.textContent = `${prefix}${line.text}`;
    diffBlock.appendChild(lineEl);
  }

  diffSection.appendChild(diffBlock);

  // Close diff button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-secondary btn-small';
  closeBtn.textContent = tr('options.prompt_modals.version_history.btn_close_diff') ?? 'Close Diff';
  closeBtn.addEventListener('click', () => {
    diffView = null;
    renderPanel();
  });
  diffSection.appendChild(closeBtn);

  container.appendChild(diffSection);
}

function createVersionSelect(
  label: string,
  selectedVersion: number,
  onChange: (version: number) => void
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'version-select-wrapper';

  const selectLabel = document.createElement('label');
  selectLabel.className = 'version-select-label';
  selectLabel.textContent = label;
  wrapper.appendChild(selectLabel);

  const select = document.createElement('select');
  select.className = 'select-input version-select';
  for (const v of versions) {
    const opt = document.createElement('option');
    opt.value = String(v.version);
    const currentLabel = v.version === Math.max(...versions.map(ver => ver.version)) ? ' (current)' : '';
    opt.textContent = `v${v.version} — ${v.summary}${currentLabel}`;
    if (v.version === selectedVersion) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => {
    onChange(parseInt(select.value, 10));
  });
  wrapper.appendChild(select);

  return wrapper;
}

// === ACTION HANDLERS ===

function handleDiff(version: PromptVersion): void {
  const currentVersion = Math.max(...versions.map(v => v.version));
  const current = versions.find(v => v.version === currentVersion);
  if (!current) return;

  // If clicking diff on current, compare with previous
  if (version.version === currentVersion) {
    const previous = versions.find(v => v.version === currentVersion - 1) ?? versions[1];
    if (previous) {
      diffView = { from: previous, to: version };
    }
  } else {
    diffView = { from: version, to: current };
  }

  renderPanel();
}

async function handleRestore(version: PromptVersion): Promise<void> {
  if (!options) return;

  // Simple confirmation
  const restorePrompt = tr('options.prompt_modals.version_history.restore_confirm', { version: version.version })
    ?? `Restore v${version.version}? This will create a new version with v${version.version}'s content.`;
  if (!confirm(restorePrompt)) {
    return;
  }

  try {
    await restorePromptVersion(options.personaId, version.version);
    await refreshVersions();
    // Notify editor to update textarea and in-memory persona
    const latest = versions[0]; // refreshVersions sorts newest-first
    if (latest) {
      options.onRestore?.(latest);
    }
  } catch (err) {
    console.error('[VersionHistory] Restore failed:', err);
  }
}

async function handleDelete(version: PromptVersion): Promise<void> {
  if (!options) return;

  const deletePrompt = tr('options.prompt_modals.version_history.delete_confirm', {
    version: version.version,
    summary: version.summary,
  }) ?? `Delete v${version.version} (${version.summary})? This cannot be undone.`;
  if (!confirm(deletePrompt)) {
    return;
  }

  try {
    await deletePromptVersion(options.personaId, version.version);
    await refreshVersions();
  } catch (err) {
    console.error('[VersionHistory] Delete failed:', err);
  }
}

// === UTILITIES ===

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Plan 5: escapeHtml removed — no longer needed after innerHTML→createElement
// migration in renderPanel(). All user-controlled strings now flow through
// .textContent which is safe by default.
