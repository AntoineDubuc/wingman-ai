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
import { kbDatabase, ingestDocument } from '../../services/kb/kb-database';

const MIN_PROMPT_LENGTH = 100;
const MAX_PROMPT_LENGTH = 10000;
const WARNING_THRESHOLD = 0.8;

export class PersonaSection {
  private ctx!: OptionsContext;
  private personas: Persona[] = [];
  private activeId: string | null = null;
  private editingPersona: Persona | null = null;
  private isDirty = false;

  // DOM references
  private listEl: HTMLElement | null = null;
  private emptyEl: HTMLElement | null = null;
  private editorEl: HTMLElement | null = null;
  private editorTitle: HTMLElement | null = null;
  private nameInput: HTMLInputElement | null = null;
  private colorPicker: HTMLElement | null = null;
  private promptTextarea: HTMLTextAreaElement | null = null;
  private charCurrent: HTMLElement | null = null;
  private charCount: HTMLElement | null = null;
  private kbListEl: HTMLElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;
  private deleteBtn: HTMLButtonElement | null = null;
  private duplicateBtn: HTMLButtonElement | null = null;
  private exportBtn: HTMLButtonElement | null = null;
  private cancelBtn: HTMLButtonElement | null = null;
  private importInput: HTMLInputElement | null = null;
  private importProgress: HTMLElement | null = null;
  private importFill: HTMLElement | null = null;
  private importText: HTMLElement | null = null;

  get dirty(): boolean {
    return this.isDirty;
  }

  async init(ctx: OptionsContext): Promise<void> {
    this.ctx = ctx;

    // Ensure migration has run
    await migrateToPersonas();

    // Bind DOM
    this.listEl = document.getElementById('persona-list');
    this.emptyEl = document.getElementById('persona-empty');
    this.editorEl = document.getElementById('persona-editor');
    this.editorTitle = document.getElementById('persona-editor-title');
    this.nameInput = document.getElementById('persona-name-input') as HTMLInputElement;
    this.colorPicker = document.getElementById('persona-color-picker');
    this.promptTextarea = document.getElementById('persona-prompt-textarea') as HTMLTextAreaElement;
    this.charCurrent = document.getElementById('persona-char-current');
    this.charCount = document.getElementById('persona-char-count');
    this.kbListEl = document.getElementById('persona-kb-list');
    this.saveBtn = document.getElementById('persona-save-btn') as HTMLButtonElement;
    this.deleteBtn = document.getElementById('persona-delete-btn') as HTMLButtonElement;
    this.duplicateBtn = document.getElementById('persona-duplicate-btn') as HTMLButtonElement;
    this.exportBtn = document.getElementById('persona-export-btn') as HTMLButtonElement;
    this.cancelBtn = document.getElementById('persona-cancel-btn') as HTMLButtonElement;
    this.importInput = document.getElementById('persona-import-input') as HTMLInputElement;
    this.importProgress = document.getElementById('persona-import-progress');
    this.importFill = document.getElementById('persona-import-fill');
    this.importText = document.getElementById('persona-import-text');

    // Event listeners
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

    // Render color swatches
    this.renderColorPicker();

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

    // Gather selected KB doc IDs
    const kbDocumentIds = this.getSelectedKBDocIds();

    // Update persona
    this.editingPersona.name = name;
    this.editingPersona.systemPrompt = prompt;
    this.editingPersona.kbDocumentIds = kbDocumentIds;
    this.editingPersona.updatedAt = Date.now();

    // Save to storage
    const idx = this.personas.findIndex((p) => p.id === this.editingPersona!.id);
    if (idx >= 0) {
      this.personas[idx] = this.editingPersona;
    } else {
      this.personas.push(this.editingPersona);
    }

    await savePersonas(this.personas);
    this.isDirty = false;
    this.ctx.showToast('Persona saved', 'success');
    this.renderList();
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

    for (const persona of this.personas) {
      const isActive = persona.id === this.activeId;
      const card = document.createElement('div');
      card.className = `persona-card${isActive ? ' active' : ''}`;
      card.dataset.id = persona.id;

      const kbCount = persona.kbDocumentIds.length;
      const kbText = kbCount === 0
        ? 'No KB docs'
        : `${kbCount} KB doc${kbCount !== 1 ? 's' : ''}`;

      card.innerHTML = `
        <span class="persona-card-dot" style="background:${persona.color}"></span>
        <div class="persona-card-info">
          <div class="persona-card-name">${this.escapeHtml(persona.name)}</div>
          <div class="persona-card-meta">${kbText}</div>
        </div>
        ${isActive
          ? '<span class="persona-card-badge">Active</span>'
          : '<button class="persona-card-activate" type="button">Activate</button>'
        }
      `;

      // Click card → open editor
      card.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('persona-card-activate')) {
          e.stopPropagation();
          this.activatePersona(persona.id);
          return;
        }
        this.openEditor(persona);
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

    // Render KB doc checkboxes
    await this.renderKBPicker(persona.kbDocumentIds);

    this.editorEl.hidden = false;
    this.editorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.isDirty = false;
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
      DEFAULT_SYSTEM_PROMPT,
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
    this.ctx.showConfirmModal(
      'Delete persona?',
      `Delete "${name}"? KB documents will not be deleted.`,
      () => this.deletePersona()
    );
  }

  private async deletePersona(): Promise<void> {
    if (!this.editingPersona) return;

    const id = this.editingPersona.id;
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
      const slug = this.editingPersona.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const a = document.createElement('a');
      a.href = url;
      a.download = `wingman-persona-${slug}.json`;
      a.click();
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

  // === IMPORT ===

  private async importPersona(file: File): Promise<void> {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.wingmanPersona || data.version !== 1 || !data.persona) {
        this.ctx.showToast('Not a valid Wingman persona file', 'error');
        return;
      }

      const imported = data.persona as {
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

  // === KB PICKER ===

  private async renderKBPicker(selectedIds: string[]): Promise<void> {
    if (!this.kbListEl) return;

    try {
      await kbDatabase.init();
      const docs = await kbDatabase.getDocuments();
      const completeDocs = docs.filter((d) => d.status === 'complete');

      if (completeDocs.length === 0) {
        this.kbListEl.innerHTML = '<p class="persona-kb-empty">No documents uploaded yet. Go to the Knowledge Base tab to add documents.</p>';
        return;
      }

      const selectedSet = new Set(selectedIds);
      this.kbListEl.innerHTML = '';

      for (const doc of completeDocs) {
        const item = document.createElement('div');
        item.className = 'persona-kb-item';

        const size = this.formatFileSize(doc.fileSize);
        const checked = selectedSet.has(doc.id) ? 'checked' : '';

        item.innerHTML = `
          <input type="checkbox" data-doc-id="${doc.id}" ${checked}>
          <span class="persona-kb-item-name" title="${this.escapeHtml(doc.filename)}">${this.escapeHtml(doc.filename)}</span>
          <span class="persona-kb-item-meta">${size}</span>
        `;

        const checkbox = item.querySelector('input') as HTMLInputElement;
        checkbox.addEventListener('change', () => {
          this.isDirty = true;
        });

        this.kbListEl.appendChild(item);
      }
    } catch {
      this.kbListEl.innerHTML = '<p class="persona-kb-empty">Failed to load documents.</p>';
    }
  }

  private getSelectedKBDocIds(): string[] {
    if (!this.kbListEl) return this.editingPersona?.kbDocumentIds ?? [];

    const checkboxes = this.kbListEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const ids: string[] = [];
    for (const cb of checkboxes) {
      if (cb.checked && cb.dataset.docId) {
        ids.push(cb.dataset.docId);
      }
    }
    return ids;
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
}
