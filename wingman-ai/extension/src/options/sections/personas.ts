import type { OptionsContext } from './shared';
import {
  type Persona,
  PERSONA_COLORS,
  DEFAULT_PERSONA_COLOR,
  getPersonas,
  savePersonas,
  getActivePersonaId,
  setActivePersonaId,
  createPersona,
  migrateToPersonas,
} from '../../shared/persona';
import { DEFAULT_SYSTEM_PROMPT } from '../../shared/default-prompt';
import { kbDatabase, ingestDocument, isIngesting } from '../../services/kb/kb-database';
import { searchKB } from '../../services/kb/kb-search';
import { icon } from './icons';
import { openChatModal, closeChatModal, onUserSend, onQuickReply, onTemplateAction, addBotMessage, renderFooter, showTemplatePreview, setInputVisible } from './prompt-assistant-chat';
import { openTestHarness, closeTestHarness } from './prompt-test-harness';
import { openVersionHistory, closeVersionHistory } from './prompt-version-history';
import { openReviewModal, closeReviewModal } from './prompt-review-modal';
import { getPromptVersions } from '../../services/prompt-version';
import {
  generatePrompt,
  getActiveModelInfo,
  getDiscoveredParams,
  sendMessage,
  isDiscoveryComplete,
  startDiscovery,
  resetState as resetAssistantState,
  getGenerationCount,
  setKBStatus,
} from '../../services/prompt-assistant-engine';
import { adaptPromptForModel } from '../../services/prompt-adapter';
import { matchTemplate } from '../../services/prompt-template-matcher';

const MIN_PROMPT_LENGTH = 100;
const MAX_PROMPT_LENGTH = 10000;
const WARNING_THRESHOLD = 0.8;

export class PersonaSection {
  private ctx!: OptionsContext;
  private personas: Persona[] = [];
  private activeId: string | null = null;
  private editingPersona: Persona | null = null;
  private isDirty = false;
  private dragSourceId: string | null = null;

  // DOM references — persona list & editor
  private listEl: HTMLElement | null = null;
  private emptyEl: HTMLElement | null = null;
  private editorEl: HTMLElement | null = null;
  private editorTitle: HTMLElement | null = null;
  private nameInput: HTMLInputElement | null = null;
  private colorPicker: HTMLElement | null = null;
  private promptTextarea: HTMLTextAreaElement | null = null;
  private charCurrent: HTMLElement | null = null;
  private charCount: HTMLElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;
  private deleteBtn: HTMLButtonElement | null = null;
  private duplicateBtn: HTMLButtonElement | null = null;
  private exportBtn: HTMLButtonElement | null = null;
  private cancelBtn: HTMLButtonElement | null = null;
  private importInput: HTMLInputElement | null = null;
  private importProgress: HTMLElement | null = null;
  private importFill: HTMLElement | null = null;
  private importText: HTMLElement | null = null;

  // DOM references — prompt assistant actions
  private promptAssistantBtn: HTMLButtonElement | null = null;
  private testPromptBtn: HTMLButtonElement | null = null;
  private versionHistoryBtn: HTMLButtonElement | null = null;
  private versionBadge: HTMLElement | null = null;

  // DOM references — embedded KB section
  private kbDropZone: HTMLElement | null = null;
  private kbFileInput: HTMLInputElement | null = null;
  private kbProgress: HTMLElement | null = null;
  private kbProgressFill: HTMLElement | null = null;
  private kbProgressText: HTMLElement | null = null;
  private kbDocList: HTMLElement | null = null;
  private kbEmpty: HTMLElement | null = null;
  private kbStats: HTMLElement | null = null;
  private kbTestSection: HTMLElement | null = null;
  private kbTestInput: HTMLInputElement | null = null;
  private kbTestBtn: HTMLButtonElement | null = null;
  private kbTestResults: HTMLElement | null = null;

  get dirty(): boolean {
    return this.isDirty;
  }

  async init(ctx: OptionsContext): Promise<void> {
    this.ctx = ctx;

    // Ensure migration has run
    await migrateToPersonas();

    // Bind DOM — persona list & editor
    this.listEl = document.getElementById('persona-list');
    this.emptyEl = document.getElementById('persona-empty');
    this.editorEl = document.getElementById('persona-editor');
    this.editorTitle = document.getElementById('persona-editor-title');
    this.nameInput = document.getElementById('persona-name-input') as HTMLInputElement;
    this.colorPicker = document.getElementById('persona-color-picker');
    this.promptTextarea = document.getElementById('persona-prompt-textarea') as HTMLTextAreaElement;
    this.charCurrent = document.getElementById('persona-char-current');
    this.charCount = document.getElementById('persona-char-count');
    this.saveBtn = document.getElementById('persona-save-btn') as HTMLButtonElement;
    this.deleteBtn = document.getElementById('persona-delete-btn') as HTMLButtonElement;
    this.duplicateBtn = document.getElementById('persona-duplicate-btn') as HTMLButtonElement;
    this.exportBtn = document.getElementById('persona-export-btn') as HTMLButtonElement;
    this.cancelBtn = document.getElementById('persona-cancel-btn') as HTMLButtonElement;
    this.importInput = document.getElementById('persona-import-input') as HTMLInputElement;
    this.importProgress = document.getElementById('persona-import-progress');
    this.importFill = document.getElementById('persona-import-fill');
    this.importText = document.getElementById('persona-import-text');

    // Bind DOM — embedded KB section
    this.kbDropZone = document.getElementById('persona-kb-drop-zone');
    this.kbFileInput = document.getElementById('persona-kb-file-input') as HTMLInputElement;
    this.kbProgress = document.getElementById('persona-kb-progress');
    this.kbProgressFill = document.getElementById('persona-kb-progress-fill');
    this.kbProgressText = document.getElementById('persona-kb-progress-text');
    this.kbDocList = document.getElementById('persona-kb-doc-list');
    this.kbEmpty = document.getElementById('persona-kb-empty');
    this.kbStats = document.getElementById('persona-kb-stats');
    this.kbTestSection = document.getElementById('persona-kb-test-section');
    this.kbTestInput = document.getElementById('persona-kb-test-input') as HTMLInputElement;
    this.kbTestBtn = document.getElementById('persona-kb-test-btn') as HTMLButtonElement;
    this.kbTestResults = document.getElementById('persona-kb-test-results');

    // Bind DOM — prompt assistant actions
    this.promptAssistantBtn = document.getElementById('btn-prompt-assistant') as HTMLButtonElement;
    this.testPromptBtn = document.getElementById('btn-test-prompt') as HTMLButtonElement;
    this.versionHistoryBtn = document.getElementById('btn-version-history') as HTMLButtonElement;
    this.versionBadge = document.getElementById('version-history-badge');

    // Event listeners — persona actions
    document.getElementById('persona-new-btn')?.addEventListener('click', () => this.createNew());
    this.saveBtn?.addEventListener('click', () => this.save());
    this.deleteBtn?.addEventListener('click', () => this.confirmDelete());
    this.duplicateBtn?.addEventListener('click', () => this.duplicate());
    this.exportBtn?.addEventListener('click', () => this.exportPersona());
    this.cancelBtn?.addEventListener('click', () => this.closeEditor());
    this.promptTextarea?.addEventListener('input', () => {
      this.updateCharCount();
      this.isDirty = true;
    });
    this.nameInput?.addEventListener('input', () => {
      this.isDirty = true;
    });
    this.importInput?.addEventListener('change', () => {
      const file = this.importInput?.files?.[0];
      if (file) this.importPersona(file);
      if (this.importInput) this.importInput.value = '';
    });

    // Event listeners — KB drop zone
    this.kbDropZone?.addEventListener('click', () => this.kbFileInput?.click());
    this.kbDropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.kbDropZone?.classList.add('drag-over');
    });
    this.kbDropZone?.addEventListener('dragleave', () => {
      this.kbDropZone?.classList.remove('drag-over', 'drag-invalid');
    });
    this.kbDropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      this.kbDropZone?.classList.remove('drag-over', 'drag-invalid');
      const files = (e as DragEvent).dataTransfer?.files;
      if (files) this.handleKBFiles(Array.from(files));
    });
    this.kbFileInput?.addEventListener('change', async () => {
      const files = this.kbFileInput?.files;
      if (files && files.length > 0) {
        // Snapshot files before clearing the input (FileList is live)
        const fileArray = Array.from(files);
        if (this.kbFileInput) this.kbFileInput.value = '';
        await this.handleKBFiles(fileArray);
      }
    });

    // Event listeners — KB test query
    this.kbTestBtn?.addEventListener('click', () => this.testPersonaQuery());
    this.kbTestInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.testPersonaQuery();
    });

    // Render color swatches
    this.renderColorPicker();

    // Bind prompt assistant action buttons
    this.bindPromptActions();

    // Load and render
    await this.load();
  }

  /** Called externally by Cmd+S shortcut */
  save = async (): Promise<void> => {
    if (!this.editingPersona || !this.promptTextarea || !this.nameInput) return;

    const name = this.nameInput.value.trim();
    if (!name) {
      this.ctx.showToast('Persona name is required', 'error');
      return;
    }

    const prompt = this.promptTextarea.value.trim();
    if (prompt.length < MIN_PROMPT_LENGTH) {
      this.ctx.showToast(`Prompt must be at least ${MIN_PROMPT_LENGTH} characters`, 'error');
      this.promptTextarea.classList.add('error');
      return;
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      this.ctx.showToast(`Prompt cannot exceed ${MAX_PROMPT_LENGTH.toLocaleString()} characters`, 'error');
      this.promptTextarea.classList.add('error');
      return;
    }

    this.promptTextarea.classList.remove('error');

    // Check if prompt actually changed from last version
    const lastVersion = this.editingPersona.promptVersions?.length
      ? this.editingPersona.promptVersions[this.editingPersona.promptVersions.length - 1]
      : undefined;
    const promptChanged = !lastVersion || lastVersion.prompt !== prompt;

    // Update persona — kbDocumentIds is already kept up-to-date by upload/delete
    this.editingPersona.name = name;
    this.editingPersona.systemPrompt = prompt;
    this.editingPersona.updatedAt = Date.now();

    // Create a new version if the prompt text changed
    if (promptChanged) {
      if (!this.editingPersona.promptVersions) {
        this.editingPersona.promptVersions = [];
      }
      const maxVersion = this.editingPersona.promptVersions.reduce(
        (max, v) => Math.max(max, v.version), 0
      );
      const summary = this.generateVersionSummary(prompt, 'manual');
      const modelInfo = await getActiveModelInfo();
      this.editingPersona.promptVersions.push({
        version: maxVersion + 1,
        timestamp: Date.now(),
        summary,
        source: 'manual',
        targetModel: modelInfo.modelId,
        prompt,
      });
    }

    // Save to storage
    const idx = this.personas.findIndex((p) => p.id === this.editingPersona!.id);
    if (idx >= 0) {
      this.personas[idx] = this.editingPersona;
    } else {
      this.personas.push(this.editingPersona);
    }

    await savePersonas(this.personas);
    this.isDirty = false;

    if (promptChanged) {
      const latestVersion = this.editingPersona.promptVersions!.length;
      const latest = this.editingPersona.promptVersions![latestVersion - 1];
      const modelLabel = latest?.targetModel?.split('/').pop() ?? 'manual edit';
      this.ctx.showToast(`Prompt saved as v${latestVersion} (${modelLabel})`, 'success');
      await this.updateVersionBadge();
    } else {
      this.ctx.showToast('Persona saved', 'success');
    }
    this.renderList();
    this.notifyPersonasChanged();
    await this.updateButtonStates();
  };

  // === PRIVATE METHODS ===

  private async load(): Promise<void> {
    this.personas = await getPersonas();
    this.activeId = await getActivePersonaId();
    this.renderList();
  }

  private renderList(): void {
    if (!this.listEl || !this.emptyEl) return;

    this.listEl.innerHTML = '';

    if (this.personas.length === 0) {
      this.emptyEl.style.display = 'block';
      return;
    }

    this.emptyEl.style.display = 'none';

    // Sort by order field for user-defined ordering
    const sorted = [...this.personas].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const persona of sorted) {
      const isActive = persona.id === this.activeId;
      const card = document.createElement('div');
      card.className = `persona-card${isActive ? ' active' : ''}`;
      card.dataset.id = persona.id;
      card.draggable = true;

      const kbCount = persona.kbDocumentIds.length;
      const kbText = kbCount === 0
        ? 'No KB docs'
        : `${kbCount} KB doc${kbCount !== 1 ? 's' : ''}`;
      const lastEdited = this.timeAgo(persona.updatedAt);

      card.innerHTML = `
        <span class="persona-drag-handle">${icon('grip', 16)}</span>
        <span class="persona-card-dot" style="background:${persona.color}"></span>
        <div class="persona-card-info">
          <div class="persona-card-name">${this.escapeHtml(persona.name)}</div>
          <div class="persona-card-meta">${kbText} · Edited ${lastEdited}</div>
        </div>
        ${isActive ? '<span class="persona-card-badge">Active</span>' : ''}
        <div class="persona-card-actions">
          <button class="persona-icon-btn" data-action="edit" title="Edit" aria-label="Edit ${this.escapeHtml(persona.name)}">${icon('edit', 16)}</button>
          <button class="persona-icon-btn" data-action="export" title="Export" aria-label="Export ${this.escapeHtml(persona.name)}">${icon('download', 16)}</button>
          <button class="persona-icon-btn persona-icon-btn--danger" data-action="delete" title="Delete" aria-label="Delete ${this.escapeHtml(persona.name)}">${icon('trash', 16)}</button>
        </div>
      `;

      // Click handlers for card and action buttons
      card.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const actionBtn = target.closest('[data-action]') as HTMLElement | null;

        if (actionBtn) {
          e.stopPropagation();
          const action = actionBtn.dataset.action;
          if (action === 'edit') this.openEditor(persona);
          if (action === 'export') this.exportPersonaFromCard(persona);
          if (action === 'delete') this.confirmDeleteFromCard(persona);
          return;
        }

        // Click on drag handle - do nothing (let drag handle it)
        if (target.closest('.persona-drag-handle')) {
          return;
        }

        // Click on card body = activate if not active, or open editor if active
        if (!isActive) {
          this.activatePersona(persona.id);
        } else {
          this.openEditor(persona);
        }
      });

      // Drag and drop handlers
      card.addEventListener('dragstart', (e) => {
        // Close editor if open to avoid stale state
        if (this.editingPersona) {
          this.isDirty = false;
          this.closeEditor();
        }
        this.dragSourceId = persona.id;
        card.classList.add('dragging');
        e.dataTransfer?.setData('text/plain', persona.id);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        this.dragSourceId = null;
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (this.dragSourceId && this.dragSourceId !== persona.id) {
          card.classList.add('drag-over');
        }
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        if (this.dragSourceId && this.dragSourceId !== persona.id) {
          this.reorderPersonas(this.dragSourceId, persona.id);
        }
      });

      this.listEl.appendChild(card);
    }
  }

  private async activatePersona(id: string): Promise<void> {
    this.activeId = id;
    await setActivePersonaId(id);
    const persona = this.personas.find((p) => p.id === id);
    this.ctx.showToast(`Switched to ${persona?.name ?? 'persona'}`, 'success');
    this.renderList();
  }

  /** Reorder personas by moving source before target */
  private async reorderPersonas(sourceId: string, targetId: string): Promise<void> {
    const sourceIdx = this.personas.findIndex((p) => p.id === sourceId);
    const targetIdx = this.personas.findIndex((p) => p.id === targetId);
    if (sourceIdx < 0 || targetIdx < 0 || sourceIdx === targetIdx) return;

    // Remove source and insert before target
    const [moved] = this.personas.splice(sourceIdx, 1);
    if (!moved) return;

    const newTargetIdx = this.personas.findIndex((p) => p.id === targetId);
    this.personas.splice(newTargetIdx, 0, moved);

    // Update order fields based on new positions
    this.personas.forEach((p, i) => {
      p.order = i;
    });

    await savePersonas(this.personas);
    this.renderList();
  }

  private async openEditor(persona: Persona): Promise<void> {
    if (this.isDirty) {
      this.ctx.showConfirmModal(
        'Unsaved changes',
        'You have unsaved changes. Discard them?',
        () => {
          this.isDirty = false;
          this.openEditor(persona);
        }
      );
      return;
    }

    this.editingPersona = { ...persona };

    if (!this.editorEl || !this.nameInput || !this.promptTextarea || !this.editorTitle) return;

    this.editorTitle.textContent = 'Edit Persona';
    this.nameInput.value = persona.name;
    this.promptTextarea.value = persona.systemPrompt;
    this.updateCharCount();
    this.promptTextarea.classList.remove('error');

    // Select color
    this.selectColor(persona.color);

    // Init KB and render persona's documents
    await this.initKB();
    await this.renderPersonaDocList();

    this.editorEl.hidden = false;
    this.editorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.isDirty = false;

    // Update prompt assistant button states and version badge
    await this.updateButtonStates();
    await this.updateVersionBadge();
  }

  private closeEditor(): void {
    if (this.isDirty) {
      this.ctx.showConfirmModal(
        'Unsaved changes',
        'You have unsaved changes. Discard them?',
        () => {
          this.isDirty = false;
          this.closeEditor();
        }
      );
      return;
    }

    this.editingPersona = null;
    if (this.editorEl) this.editorEl.hidden = true;
  }

  private createNew(): void {
    const persona = createPersona(
      'New Persona',
      '',
      this.nextAvailableColor(),
      []
    );
    this.personas.push(persona);
    // Don't save yet — let the user edit first
    this.openEditor(persona);
  }

  private confirmDelete(): void {
    if (!this.editingPersona) return;

    const name = this.editingPersona.name;
    const kbCount = this.editingPersona.kbDocumentIds.length;
    const kbWarning = kbCount > 0
      ? ` This will also delete ${kbCount} Knowledge Base document${kbCount !== 1 ? 's' : ''}. This cannot be undone.`
      : '';

    this.ctx.showConfirmModal(
      'Delete persona?',
      `Delete "${name}"?${kbWarning}`,
      () => this.deletePersona()
    );
  }

  private async deletePersona(): Promise<void> {
    if (!this.editingPersona) return;

    const id = this.editingPersona.id;

    // Cascade-delete KB documents from IndexedDB
    if (this.editingPersona.kbDocumentIds.length > 0) {
      try {
        await kbDatabase.init();
        for (const docId of this.editingPersona.kbDocumentIds) {
          try {
            await kbDatabase.deleteDocument(docId);
          } catch (err) {
            console.warn(`[Persona] Failed to delete KB doc ${docId}:`, err);
          }
        }
      } catch (err) {
        console.warn('[Persona] Failed to init KB for cascade delete:', err);
      }
    }

    this.personas = this.personas.filter((p) => p.id !== id);

    // If we deleted the active persona, activate another
    if (this.activeId === id) {
      if (this.personas.length > 0) {
        this.activeId = this.personas[0]!.id;
      } else {
        // Recreate default
        const def = createPersona('Default', DEFAULT_SYSTEM_PROMPT, DEFAULT_PERSONA_COLOR, []);
        this.personas = [def];
        this.activeId = def.id;
      }
      await setActivePersonaId(this.activeId);
    }

    await savePersonas(this.personas);
    this.isDirty = false;
    this.editingPersona = null;
    if (this.editorEl) this.editorEl.hidden = true;
    this.ctx.showToast('Persona deleted', 'success');
    this.renderList();
    this.notifyPersonasChanged();
  }

  private async duplicate(): Promise<void> {
    if (!this.editingPersona) return;

    // Generate unique copy name
    let copyName = `${this.editingPersona.name} (copy)`;
    let counter = 2;
    while (this.personas.some((p) => p.name === copyName)) {
      copyName = `${this.editingPersona.name} (copy ${counter})`;
      counter++;
    }

    const copy = createPersona(
      copyName,
      this.editingPersona.systemPrompt,
      this.editingPersona.color,
      [...this.editingPersona.kbDocumentIds]
    );

    this.personas.push(copy);
    await savePersonas(this.personas);
    this.isDirty = false;
    this.ctx.showToast('Persona duplicated', 'success');
    this.renderList();
    this.notifyPersonasChanged();
    this.openEditor(copy);
  }

  // === EXPORT ===

  private async exportPersona(): Promise<void> {
    if (!this.editingPersona) return;

    if (this.exportBtn) {
      this.exportBtn.disabled = true;
      this.exportBtn.textContent = 'Exporting...';
    }

    try {
      await kbDatabase.init();
      const kbDocuments: { filename: string; fileType: string; textContent: string }[] = [];

      for (const docId of this.editingPersona.kbDocumentIds) {
        const docs = await kbDatabase.getDocuments();
        const doc = docs.find((d) => d.id === docId);
        if (!doc || doc.status !== 'complete') continue;

        const chunks = await kbDatabase.getChunksByDocumentId(docId);
        chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
        const textContent = chunks.map((c) => c.text).join('\n\n');

        kbDocuments.push({
          filename: doc.filename,
          fileType: doc.fileType,
          textContent,
        });
      }

      const exportData = {
        wingmanPersona: true,
        version: 1,
        exportedAt: Date.now(),
        persona: {
          name: this.editingPersona.name,
          color: this.editingPersona.color,
          systemPrompt: this.editingPersona.systemPrompt,
          kbDocuments,
        },
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const slug = this.editingPersona.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'persona';
      const filename = `wingman-persona-${slug}.json`;
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.ctx.showToast('Persona exported', 'success');
    } catch (error) {
      console.error('[Persona] Export failed:', error);
      this.ctx.showToast('Export failed', 'error');
    } finally {
      if (this.exportBtn) {
        this.exportBtn.disabled = false;
        this.exportBtn.textContent = 'Export';
      }
    }
  }

  /** Export persona directly from card (without opening editor) */
  private async exportPersonaFromCard(persona: Persona): Promise<void> {
    const prev = this.editingPersona;
    this.editingPersona = persona;
    await this.exportPersona();
    this.editingPersona = prev;
  }

  /** Confirm delete from card (without opening editor) */
  private confirmDeleteFromCard(persona: Persona): void {
    const name = persona.name;
    const kbCount = persona.kbDocumentIds.length;
    const kbWarning = kbCount > 0
      ? ` This will also delete ${kbCount} Knowledge Base document${kbCount !== 1 ? 's' : ''}.`
      : '';

    // Block deleting last persona
    if (this.personas.length <= 1) {
      this.ctx.showToast('Cannot delete your only persona', 'error');
      return;
    }

    this.ctx.showConfirmModal(
      'Delete persona?',
      `Delete "${name}"?${kbWarning}`,
      () => this.deletePersonaFromCard(persona)
    );
  }

  /** Delete persona directly from card (without opening editor) */
  private async deletePersonaFromCard(persona: Persona): Promise<void> {
    const prev = this.editingPersona;
    this.editingPersona = persona;
    await this.deletePersona();
    this.editingPersona = prev;
  }

  // === IMPORT ===

  private async importPersona(file: File): Promise<void> {
    try {
      const text = await file.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        this.ctx.showToast('Invalid JSON file', 'error');
        return;
      }

      // Validate structure with detailed checks
      const obj = data as Record<string, unknown>;
      if (obj.wingmanPersona !== true || obj.version !== 1 || !obj.persona) {
        console.error('[Persona] Import validation failed:', {
          wingmanPersona: obj.wingmanPersona,
          version: obj.version,
          hasPersona: !!obj.persona,
        });
        this.ctx.showToast('Not a valid Wingman persona file', 'error');
        return;
      }

      const imported = obj.persona as {
        name: string;
        color: string;
        systemPrompt: string;
        kbDocuments?: { filename: string; fileType: string; textContent: string }[];
      };

      // Check for Gemini key if there are KB docs
      if (imported.kbDocuments && imported.kbDocuments.length > 0) {
        const storage = await chrome.storage.local.get(['geminiApiKey']);
        if (!storage.geminiApiKey) {
          this.ctx.showToast('Gemini API key required to process KB documents', 'error');
          return;
        }
      }

      // Name conflict handling
      let name = imported.name;
      if (this.personas.some((p) => p.name === name)) {
        name = `${name} (imported)`;
      }

      // Ingest KB documents
      const kbDocIds: string[] = [];
      if (imported.kbDocuments && imported.kbDocuments.length > 0) {
        if (this.importProgress) this.importProgress.hidden = false;

        await kbDatabase.init();

        for (let i = 0; i < imported.kbDocuments.length; i++) {
          const kbDoc = imported.kbDocuments[i]!;
          const progress = Math.round(((i) / imported.kbDocuments.length) * 100);
          if (this.importFill) this.importFill.style.width = `${progress}%`;
          if (this.importText) this.importText.textContent = `Processing: ${kbDoc.filename}...`;

          try {
            const blob = new File([kbDoc.textContent], kbDoc.filename, { type: 'text/plain' });
            const result = await ingestDocument(blob, (_stage, percent) => {
              const overall = Math.round((i / imported.kbDocuments!.length) * 100 + percent / imported.kbDocuments!.length);
              if (this.importFill) this.importFill.style.width = `${overall}%`;
            });

            if (result.success && result.documentId) {
              kbDocIds.push(result.documentId);
            } else {
              console.warn(`[Persona] Failed to import KB doc: ${kbDoc.filename}`, result.error);
            }
          } catch (err) {
            console.warn(`[Persona] Failed to import KB doc: ${kbDoc.filename}`, err);
          }
        }

        if (this.importProgress) this.importProgress.hidden = true;
        if (this.importFill) this.importFill.style.width = '0%';
      }

      // Create persona
      const persona = createPersona(
        name,
        imported.systemPrompt,
        imported.color || DEFAULT_PERSONA_COLOR,
        kbDocIds
      );

      this.personas.push(persona);
      await savePersonas(this.personas);
      this.renderList();
      this.notifyPersonasChanged();

      const skipped = (imported.kbDocuments?.length ?? 0) - kbDocIds.length;
      if (skipped > 0) {
        this.ctx.showToast(`Persona imported (${skipped} KB doc(s) failed)`, 'success');
      } else {
        this.ctx.showToast('Persona imported successfully', 'success');
      }
    } catch (error) {
      console.error('[Persona] Import failed:', error);
      this.ctx.showToast('Failed to import persona file', 'error');
      if (this.importProgress) this.importProgress.hidden = true;
    }
  }

  // === COLOR PICKER ===

  private renderColorPicker(): void {
    if (!this.colorPicker) return;
    this.colorPicker.innerHTML = '';

    for (const color of PERSONA_COLORS) {
      const swatch = document.createElement('div');
      swatch.className = 'persona-color-swatch';
      swatch.style.background = color;
      swatch.dataset.color = color;
      swatch.addEventListener('click', () => {
        this.selectColor(color);
        this.isDirty = true;
      });
      this.colorPicker.appendChild(swatch);
    }
  }

  private selectColor(color: string): void {
    if (!this.colorPicker || !this.editingPersona) return;

    this.editingPersona.color = color;
    const swatches = this.colorPicker.querySelectorAll('.persona-color-swatch');
    for (const s of swatches) {
      s.classList.toggle('selected', (s as HTMLElement).dataset.color === color);
    }
  }

  // === EMBEDDED KB MANAGEMENT ===

  /** Initialize IndexedDB and clean up incomplete documents */
  private async initKB(): Promise<void> {
    try {
      await kbDatabase.init();

      const incomplete = await kbDatabase.getIncompleteDocuments();
      for (const doc of incomplete) {
        await kbDatabase.deleteDocument(doc.id);
        console.log(`[KB] Cleaned up incomplete: ${doc.filename}`);
      }
      if (incomplete.length > 0) {
        this.ctx.showToast(
          `Cleaned up ${incomplete.length} incomplete upload(s)`,
          'success'
        );
      }
    } catch (error) {
      console.error('Failed to init KB:', error);
    }
  }

  /** Handle file drop or selection — process sequentially */
  private async handleKBFiles(files: File[]): Promise<void> {
    if (isIngesting()) {
      this.ctx.showToast('Processing in progress. Please wait.', 'error');
      return;
    }

    // KB embeddings always use Gemini — require the key regardless of active provider
    const storage = await chrome.storage.local.get(['geminiApiKey']);
    if (!storage.geminiApiKey) {
      this.ctx.showToast('Gemini API key required for Knowledge Base (embeddings use Gemini)', 'error');
      return;
    }

    for (const file of files) {
      await this.processKBFile(file);
    }
  }

  /** Ingest a single file and auto-associate with the current persona */
  private async processKBFile(file: File): Promise<void> {
    if (!this.editingPersona) return;

    if (this.kbProgress) this.kbProgress.hidden = false;
    this.kbDropZone?.classList.add('disabled');

    const result = await ingestDocument(file, (_stage, percent) => {
      if (this.kbProgressFill) this.kbProgressFill.style.width = `${percent}%`;
      if (this.kbProgressText)
        this.kbProgressText.textContent = `Processing: ${file.name}...`;
    });

    if (this.kbProgress) this.kbProgress.hidden = true;
    if (this.kbProgressFill) this.kbProgressFill.style.width = '0%';
    this.kbDropZone?.classList.remove('disabled');

    if (result.success && result.documentId) {
      // Auto-associate with editing persona
      this.editingPersona.kbDocumentIds.push(result.documentId);

      // Save persona to storage immediately
      const idx = this.personas.findIndex((p) => p.id === this.editingPersona!.id);
      if (idx >= 0) {
        this.personas[idx] = this.editingPersona;
      } else {
        this.personas.push(this.editingPersona);
      }
      await savePersonas(this.personas);

      this.ctx.showToast(
        `${file.name} added (${result.chunkCount} sections)`,
        'success'
      );
    } else {
      this.ctx.showToast(result.error ?? 'Failed to process file', 'error');
    }

    await this.renderPersonaDocList();
    this.renderList();
  }

  /** Render the persona's own KB documents (not all docs in IndexedDB) */
  private async renderPersonaDocList(): Promise<void> {
    if (!this.editingPersona) return;

    try {
      const docs = await kbDatabase.getDocuments();
      const personaDocIds = new Set(this.editingPersona.kbDocumentIds);
      const personaDocs = docs.filter(
        (d) => personaDocIds.has(d.id) && d.status === 'complete'
      );

      // Empty state
      if (this.kbEmpty) {
        this.kbEmpty.style.display = personaDocs.length === 0 ? 'block' : 'none';
      }

      // Test section visibility
      if (this.kbTestSection) {
        this.kbTestSection.hidden = personaDocs.length === 0;
      }

      // Document list
      if (this.kbDocList) {
        this.kbDocList.innerHTML = '';
        for (const doc of personaDocs) {
          const item = document.createElement('div');
          item.className = 'kb-doc-item';
          item.dataset.id = doc.id;

          const ago = this.timeAgo(doc.uploadedAt);
          const size = this.formatFileSize(doc.fileSize);

          item.innerHTML = `
            <span class="kb-doc-icon">${icon('document', 24)}</span>
            <div class="kb-doc-info">
              <span class="kb-doc-name" title="${this.escapeHtml(doc.filename)}">${this.escapeHtml(doc.filename)}</span>
              <span class="kb-doc-meta">${doc.chunkCount} sections \u00B7 ${size} \u00B7 Added ${ago}</span>
            </div>
            <button class="kb-doc-delete" title="Delete">${icon('trash', 18)}</button>
          `;

          const deleteBtn = item.querySelector('.kb-doc-delete') as HTMLButtonElement;
          deleteBtn.addEventListener('click', () => {
            this.ctx.showConfirmModal(
              'Delete document?',
              `Delete "${doc.filename}"? This removes the file permanently.`,
              () => this.deletePersonaDoc(doc.id, doc.filename)
            );
          });

          this.kbDocList.appendChild(item);
        }
      }

      // Stats
      await this.updateKBStats();
    } catch (error) {
      console.error('[Persona] Failed to render doc list:', error);
      if (this.kbDocList) {
        this.kbDocList.innerHTML = '';
      }
      if (this.kbEmpty) {
        this.kbEmpty.style.display = 'block';
        this.kbEmpty.textContent = 'Failed to load documents.';
      }
    }
  }

  /** Delete a KB document from IndexedDB and remove from persona */
  private async deletePersonaDoc(docId: string, filename: string): Promise<void> {
    if (!this.editingPersona) return;

    try {
      await kbDatabase.deleteDocument(docId);

      // Remove from persona's kbDocumentIds
      const idx = this.editingPersona.kbDocumentIds.indexOf(docId);
      if (idx >= 0) {
        this.editingPersona.kbDocumentIds.splice(idx, 1);
      }

      // Save persona to storage
      const pIdx = this.personas.findIndex((p) => p.id === this.editingPersona!.id);
      if (pIdx >= 0) {
        this.personas[pIdx] = this.editingPersona;
      }
      await savePersonas(this.personas);

      this.ctx.showToast(`Deleted ${filename}`, 'success');
      await this.renderPersonaDocList();
      this.renderList();
    } catch (error) {
      console.error('[Persona] Failed to delete KB doc:', error);
      this.ctx.showToast('Failed to delete document', 'error');
    }
  }

  /** Update KB stats for the persona's documents */
  private async updateKBStats(): Promise<void> {
    if (!this.kbStats || !this.editingPersona) return;

    if (this.editingPersona.kbDocumentIds.length === 0) {
      this.kbStats.textContent = '';
      return;
    }

    try {
      const docs = await kbDatabase.getDocuments();
      const personaDocIds = new Set(this.editingPersona.kbDocumentIds);
      const personaDocs = docs.filter(
        (d) => personaDocIds.has(d.id) && d.status === 'complete'
      );

      const docCount = personaDocs.length;
      const chunkCount = personaDocs.reduce((sum, d) => sum + d.chunkCount, 0);
      const storageUsed = personaDocs.reduce((sum, d) => sum + d.fileSize, 0);
      const storageStr = this.formatFileSize(storageUsed);

      this.kbStats.textContent = `${docCount} document${docCount !== 1 ? 's' : ''} \u00B7 ${chunkCount} sections \u00B7 ${storageStr}`;
    } catch {
      this.kbStats.textContent = '';
    }
  }

  /** Test KB query scoped to the persona's documents */
  private async testPersonaQuery(): Promise<void> {
    if (!this.editingPersona) return;

    const query = this.kbTestInput?.value?.trim();
    if (!query) {
      this.ctx.showToast('Enter a test query', 'error');
      return;
    }

    if (this.kbTestBtn) {
      this.kbTestBtn.disabled = true;
      this.kbTestBtn.textContent = 'Searching...';
    }

    try {
      const results = await searchKB(
        query,
        undefined,
        undefined,
        this.editingPersona.kbDocumentIds
      );

      if (this.kbTestResults) {
        if (results.length === 0) {
          this.kbTestResults.innerHTML =
            '<p class="kb-empty">No matching sections found. Try a different query.</p>';
        } else {
          this.kbTestResults.innerHTML = results
            .map(
              (r) => `
              <div class="kb-test-result">
                <div class="kb-test-result-source">${icon('document', 14)} ${this.escapeHtml(r.documentName)}</div>
                <div class="kb-test-result-text">${this.escapeHtml(r.chunk.text.slice(0, 300))}${r.chunk.text.length > 300 ? '...' : ''}</div>
              </div>
            `
            )
            .join('');
          this.kbTestResults.innerHTML +=
            '<p class="kb-stats">This is what Wingman will use to answer similar questions.</p>';
        }
      }
    } catch (error) {
      console.error('[Persona] KB test query failed:', error);
      this.ctx.showToast('Test query failed. Check your API key.', 'error');
    } finally {
      if (this.kbTestBtn) {
        this.kbTestBtn.disabled = false;
        this.kbTestBtn.textContent = 'Test';
      }
    }
  }

  // === PROMPT ASSISTANT WIRING ===

  private bindPromptActions(): void {
    // Prompt Setup Assistant button
    this.promptAssistantBtn?.addEventListener('click', () => {
      if (!this.editingPersona) return;
      startDiscovery();
      // Populate KB status so the engine knows about attached documents
      void this.getKBDocNames().then(names => setKBStatus(names));
      openChatModal({
        personaId: this.editingPersona.id,
        personaName: this.editingPersona.name,
        onGenerate: async () => {
          await this.handleGenerate();
        },
        onClose: () => {
          resetAssistantState();
        },
        showConfirmModal: this.ctx.showConfirmModal,
      });

      // Wire quick-reply button actions
      let discoveryTurns = 0;
      let matchedTemplate: { name: string; prompt: string } | null = null;

      onQuickReply((action) => {
        if (action === 'generate') {
          void this.handleGenerate();
        } else if (action === 'continue') {
          document.getElementById('chat-input')?.focus();
        } else if (action === 'use-template') {
          // User chose to use matched template as-is
          if (matchedTemplate) {
            void this.applyTemplatePrompt(matchedTemplate.prompt, matchedTemplate.name);
          }
        } else if (action === 'customize-template') {
          // User wants to customize — continue discovery with template context
          renderFooter('discovery');
          addBotMessage(
            `Great, let's customize the "${matchedTemplate?.name}" template. What would you like to change or add?`,
          );
          document.getElementById('chat-input')?.focus();
        }
      });

      // Wire template footer actions (Back / Use as-is / Customize)
      onTemplateAction((action) => {
        if (action === 'use-asis' && matchedTemplate) {
          void this.applyTemplatePrompt(matchedTemplate.prompt, matchedTemplate.name);
        } else if (action === 'customize') {
          renderFooter('discovery');
          addBotMessage(
            `Let's customize the "${matchedTemplate?.name}" template. What would you like to change?`,
          );
          document.getElementById('chat-input')?.focus();
        } else if (action === 'back') {
          renderFooter('discovery');
        }
      });

      // Wire user input → discovery engine → bot reply
      onUserSend(async (text) => {
        try {
          discoveryTurns++;

          // On first message, run template matching in parallel with discovery
          const [botReply, templateMatch] = await Promise.all([
            sendMessage(text),
            discoveryTurns === 1 ? matchTemplate(text).catch(() => null) : Promise.resolve(null),
          ]);

          // Strip any JSON block from the display text
          const displayText = botReply.replace(/```json[\s\S]*?```/g, '').trim();

          // If we got a template match on first turn, offer it with a preview
          if (templateMatch && discoveryTurns === 1) {
            matchedTemplate = {
              name: templateMatch.templateName,
              prompt: templateMatch.template.systemPrompt,
            };
            addBotMessage(displayText);
            addBotMessage(
              `I found a built-in template that matches: "${templateMatch.templateName}" (${Math.round(templateMatch.similarity * 100)}% match). You can use it as-is or customize it.`,
              {
                quickReplies: [
                  { label: 'Use this template', action: 'use-template', primary: true },
                  { label: 'Customize it', action: 'customize-template' },
                  { label: 'Skip, build from scratch', action: 'continue' },
                ],
              },
            );
            showTemplatePreview(templateMatch.templateName, templateMatch.template.systemPrompt);
            renderFooter('template');
            return;
          }

          if (isDiscoveryComplete()) {
            // Build a human-readable summary from discovered params
            const params = getDiscoveredParams();
            const summaryItems: string[] = [];
            if (params.useCase) summaryItems.push(`Use case: ${params.useCase}`);
            if (params.tone) summaryItems.push(`Tone: ${params.tone}`);
            if (params.silenceRules) summaryItems.push(`Silence: ${params.silenceRules}`);
            if (params.competitors && params.competitors.length > 0) {
              summaryItems.push(`Competitors: ${params.competitors.join(', ')}`);
            }
            if (params.templateMatch) summaryItems.push(`Template match: ${params.templateMatch}`);

            // Show the bot's text (minus JSON) + summary box
            const cleanText = displayText.replace(/here'?s.*summary.*:?\s*$/i, '').trim();
            addBotMessage(
              cleanText || "Got it! Here's what I'll build your prompt around:",
              {
                summaryBox: summaryItems.length > 0
                  ? { header: 'Prompt Summary', items: summaryItems }
                  : undefined,
                quickReplies: [
                  { label: 'Generate Prompt', action: 'generate', primary: true },
                  { label: 'Add more details', action: 'continue' },
                ],
              },
            );
            renderFooter('discovery');
          } else {
            // After 2+ turns, offer quick-reply shortcuts
            addBotMessage(displayText, discoveryTurns >= 2 ? {
              quickReplies: [
                { label: 'Generate Prompt', action: 'generate', primary: true },
                { label: 'Tell me more', action: 'continue' },
              ],
            } : undefined);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Something went wrong';
          addBotMessage(msg, { isError: true });
          renderFooter('error');
        }
      });
    });

    // Test Current Prompts button
    this.testPromptBtn?.addEventListener('click', () => {
      if (!this.editingPersona || !this.promptTextarea?.value) return;
      this.openTestHarnessFromEditor();
    });

    // Version History button
    this.versionHistoryBtn?.addEventListener('click', () => {
      if (!this.editingPersona) return;
      this.openVersionHistoryPanel();
    });
  }

  private async handleGenerate(): Promise<void> {
    if (!this.editingPersona) return;

    // Show spinner immediately
    renderFooter('generating');
    setInputVisible(false);

    const params = getDiscoveredParams();
    const kbDocNames = await this.getKBDocNames();

    try {
      const { promptText, testQuestions } = await generatePrompt(params, kbDocNames);
      const modelInfo = await getActiveModelInfo();
      const { prompt: adaptedPrompt } = adaptPromptForModel(promptText, modelInfo.modelId);

      openReviewModal({
        promptText: adaptedPrompt,
        testQuestions,
        modelId: modelInfo.modelId,
        generationNumber: getGenerationCount(),
        onSave: async (text, modelId, selectedQuestions) => {
          await this.saveGeneratedPrompt(text, modelId, 'assistant', selectedQuestions);
        },
        onTest: (text, modelId, questions) => {
          this.openTestHarnessWithPrompt(text, modelId, questions);
        },
        onRefine: () => {
          closeReviewModal();
          setInputVisible(true);
          renderFooter('discovery');
        },
        onClose: () => {
          closeReviewModal();
          closeChatModal();
        },
      });
    } catch (err) {
      console.error('[PersonaEditor] Generation failed:', err);
      const msg = err instanceof Error ? err.message : 'Generation failed';
      addBotMessage(msg, { isError: true });
      renderFooter('error');
      setInputVisible(true);
    }
  }

  private async saveGeneratedPrompt(
    promptText: string,
    modelId: string,
    source: 'manual' | 'assistant',
    testQuestions?: Array<{ text: string; expectedBehavior: 'respond' | 'silent' }>,
  ): Promise<void> {
    if (!this.editingPersona) return;

    // Update persona in memory
    this.editingPersona.systemPrompt = promptText;
    if (!this.editingPersona.modelPrompts) {
      this.editingPersona.modelPrompts = {};
    }
    this.editingPersona.modelPrompts[modelId] = promptText;
    this.editingPersona.updatedAt = Date.now();

    // Build version inline to avoid reading from storage (persona may not be saved yet)
    const summary = this.generateVersionSummary(promptText, source);
    if (!this.editingPersona.promptVersions) {
      this.editingPersona.promptVersions = [];
    }
    const maxVersion = this.editingPersona.promptVersions.reduce(
      (max, v) => Math.max(max, v.version), 0
    );
    this.editingPersona.promptVersions.push({
      version: maxVersion + 1,
      timestamp: Date.now(),
      summary,
      source,
      targetModel: modelId,
      prompt: promptText,
      testQuestions: testQuestions?.map(q => ({
        text: q.text,
        expectedBehavior: q.expectedBehavior,
        source: 'auto' as const,
      })),
    });

    // Ensure persona is in the array (may be new and not yet saved)
    const idx = this.personas.findIndex((p) => p.id === this.editingPersona!.id);
    if (idx >= 0) {
      this.personas[idx] = this.editingPersona;
    } else {
      this.personas.push(this.editingPersona);
    }

    // Single write to storage
    await savePersonas(this.personas);

    // Update editor UI
    if (this.promptTextarea) {
      this.promptTextarea.value = promptText;
      this.updateCharCount();
    }

    // Update version badge
    await this.updateVersionBadge();

    // Close modals
    closeReviewModal();
    closeChatModal();

    // Show success toast with model info
    const latestVersion = maxVersion + 1;
    const modelLabel = modelId.split('/').pop() ?? modelId;
    this.ctx.showToast(`Prompt saved as v${latestVersion} (${modelLabel})`, 'success');

    this.isDirty = false;

    // Re-render persona list to show the new/updated persona
    this.renderList();

    // Re-check button states (prompt now exists → enable Test/Version History)
    await this.updateButtonStates();
  }

  private generateVersionSummary(promptText: string, source: 'manual' | 'assistant'): string {
    // Extract a meaningful summary from the prompt text
    // Try to find the first markdown heading
    const headingMatch = /^#+\s+(.+)/m.exec(promptText);
    if (headingMatch?.[1]) {
      const heading = headingMatch[1].replace(/\s*[-—]+\s*System Prompt$/i, '').trim();
      if (heading.length > 0 && heading.length < 80) {
        return source === 'assistant' ? `Assistant: ${heading}` : heading;
      }
    }
    // Fall back to first non-empty line, truncated
    const firstLine = promptText.split('\n').find(l => l.trim().length > 0)?.trim() ?? '';
    if (firstLine.length > 60) {
      return firstLine.slice(0, 57) + '...';
    }
    return source === 'assistant' ? 'Generated by Setup Assistant' : 'Manual edit';
  }

  private async applyTemplatePrompt(promptText: string, templateName: string): Promise<void> {
    if (!this.editingPersona) return;

    const modelInfo = await getActiveModelInfo();
    const { prompt: adapted } = adaptPromptForModel(promptText, modelInfo.modelId);
    await this.saveGeneratedPrompt(adapted, modelInfo.modelId, 'assistant');
    this.ctx.showToast(`Applied "${templateName}" template`, 'success');
  }

  private async getKBDocNames(): Promise<string[]> {
    if (!this.editingPersona?.kbDocumentIds?.length) return [];
    try {
      const docs = await kbDatabase.getDocuments();
      return docs
        .filter((d) => this.editingPersona!.kbDocumentIds.includes(d.id))
        .map((d) => d.filename);
    } catch {
      return [];
    }
  }

  private async openTestHarnessFromEditor(): Promise<void> {
    if (!this.editingPersona || !this.promptTextarea) return;
    const modelInfo = await getActiveModelInfo();

    // Always read fresh from storage to get stored test questions
    const { getPromptVersions } = await import('../../services/prompt-version');
    const storedVersions = await getPromptVersions(this.editingPersona.id);
    const latestVersion = storedVersions.length > 0 ? storedVersions[0] : null; // sorted newest-first
    const sampleQuestions = latestVersion?.testQuestions;

    openTestHarness({
      promptText: this.promptTextarea.value,
      modelId: modelInfo.modelId,
      personaId: this.editingPersona.id,
      personaName: this.editingPersona.name,
      context: 'editor',
      sampleQuestions,
      onClose: () => {
        closeTestHarness();
      },
      onEditFix: () => {
        closeTestHarness();
        this.promptTextarea?.focus();
      },
    });
  }

  private async openTestHarnessWithPrompt(
    promptText: string,
    modelId: string,
    testQuestions?: Array<{ text: string; expectedBehavior: 'respond' | 'silent'; groupLabel?: string; behaviorHint?: string }>,
  ): Promise<void> {
    if (!this.editingPersona) return;
    // Convert GeneratedTestQuestion[] to TestQuestion[] for the harness
    const sampleQuestions = testQuestions?.map(q => ({
      text: q.text,
      expectedBehavior: q.expectedBehavior,
      groupLabel: q.groupLabel,
      behaviorHint: q.behaviorHint,
      source: 'auto' as const,
    }));
    openTestHarness({
      promptText,
      modelId,
      personaId: this.editingPersona.id,
      personaName: this.editingPersona.name,
      context: 'review',
      sampleQuestions,
      onClose: () => {
        closeTestHarness();
      },
      onSave: async () => {
        await this.saveGeneratedPrompt(promptText, modelId, 'assistant', testQuestions);
        closeTestHarness();
      },
      onEditFix: () => {
        closeTestHarness();
        this.promptTextarea?.focus();
      },
    });
  }

  private openVersionHistoryPanel(): void {
    if (!this.editingPersona) return;
    openVersionHistory({
      personaId: this.editingPersona.id,
      personaName: this.editingPersona.name,
      onBack: () => {
        closeVersionHistory();
      },
      onTest: (version) => {
        if (!this.editingPersona) return;
        openTestHarness({
          promptText: version.prompt,
          modelId: version.targetModel || 'gemini-2.5-flash',
          personaId: this.editingPersona.id,
          personaName: this.editingPersona.name,
          versionNumber: version.version,
          context: 'history',
          onClose: () => {
            closeTestHarness();
          },
          onRestore: async () => {
            if (this.promptTextarea) {
              this.promptTextarea.value = version.prompt;
              this.updateCharCount();
              this.isDirty = true;
            }
            closeTestHarness();
            closeVersionHistory();
          },
        });
      },
      onRestore: async (restoredVersion) => {
        if (!this.editingPersona || !this.promptTextarea) return;
        // Update in-memory persona and editor textarea
        this.editingPersona.systemPrompt = restoredVersion.prompt;
        this.promptTextarea.value = restoredVersion.prompt;
        this.updateCharCount();
        await this.updateVersionBadge();
        // Reload persona from storage to sync promptVersions
        const stored = await chrome.storage.local.get('personas');
        const personas = (stored['personas'] as typeof this.personas) ?? [];
        const fresh = personas.find(p => p.id === this.editingPersona!.id);
        if (fresh) {
          this.editingPersona.promptVersions = fresh.promptVersions;
        }
        this.isDirty = false;
      },
    });
  }

  private async updateVersionBadge(): Promise<void> {
    if (!this.editingPersona || !this.versionBadge) return;
    const versions = await getPromptVersions(this.editingPersona.id);
    if (versions.length > 0) {
      this.versionBadge.textContent = `v${versions.length}`;
      this.versionBadge.hidden = false;
    } else {
      this.versionBadge.hidden = true;
    }
  }

  private async updateButtonStates(): Promise<void> {
    const storage = await chrome.storage.local.get(['geminiApiKey', 'llmProvider', 'openrouterApiKey', 'groqApiKey']);
    const hasGeminiKey = !!(storage.geminiApiKey as string);
    const hasPrompt = !!(this.promptTextarea?.value?.trim());

    // Check active provider's key for test functionality
    const provider = (storage.llmProvider as string) ?? 'gemini';
    let hasProviderKey = hasGeminiKey;
    if (provider === 'openrouter') hasProviderKey = !!(storage.openrouterApiKey as string);
    else if (provider === 'groq') hasProviderKey = !!(storage.groqApiKey as string);

    // Prompt Assistant: always uses Gemini key
    if (this.promptAssistantBtn) {
      this.promptAssistantBtn.disabled = !hasGeminiKey;
    }

    // Test: needs prompt + active provider's key
    if (this.testPromptBtn) {
      this.testPromptBtn.disabled = !hasPrompt || !hasProviderKey;
    }

    // Version History: needs prompt
    if (this.versionHistoryBtn) {
      this.versionHistoryBtn.disabled = !hasPrompt;
    }
  }

  // === CHAR COUNT ===

  private updateCharCount(): void {
    if (!this.promptTextarea || !this.charCurrent || !this.charCount) return;
    const length = this.promptTextarea.value.length;
    this.charCurrent.textContent = length.toLocaleString();

    this.charCount.classList.remove('warning', 'error');
    if (length > MAX_PROMPT_LENGTH) {
      this.charCount.classList.add('error');
    } else if (length > MAX_PROMPT_LENGTH * WARNING_THRESHOLD) {
      this.charCount.classList.add('warning');
    }
  }

  // === HELPERS ===

  private nextAvailableColor(): string {
    const usedColors = new Set(this.personas.map((p) => p.color));
    for (const color of PERSONA_COLORS) {
      if (!usedColors.has(color)) return color;
    }
    return PERSONA_COLORS[this.personas.length % PERSONA_COLORS.length]!;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private timeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'yesterday';
    return `${days} days ago`;
  }

  /** Notify other sections that personas have changed (for Active Personas refresh). */
  private notifyPersonasChanged(): void {
    window.dispatchEvent(new CustomEvent('personas-changed'));
  }
}
