import type { OptionsContext } from './shared';
import {
  getPersonas,
  getActivePersonaIds,
  getConclaveLeaderId,
  setConclaveLeaderId,
  getConclavePresets,
  saveConclavePreset,
  deleteConclavePreset,
  activatePreset,
  createConclavePreset,
  MAX_ACTIVE_PERSONAS,
  type Persona,
  type ConclavePreset,
} from '../../shared/persona';

/**
 * Conclave section for the Conclave tab.
 * Handles leader picker and preset management.
 */
export class ConclaveSection {
  private ctx!: OptionsContext;
  private leaderSelect: HTMLSelectElement | null = null;
  private presetsListEl: HTMLElement | null = null;
  private addPresetBtn: HTMLButtonElement | null = null;

  private allPersonas: Persona[] = [];
  private activeIds: string[] = [];
  private leaderId: string | null = null;
  private presets: ConclavePreset[] = [];

  async init(ctx: OptionsContext): Promise<void> {
    this.ctx = ctx;
    this.leaderSelect = document.getElementById('conclave-leader-select') as HTMLSelectElement;
    this.presetsListEl = document.getElementById('conclave-presets-list');
    this.addPresetBtn = document.getElementById('conclave-add-preset') as HTMLButtonElement;

    // Bind events
    this.leaderSelect?.addEventListener('change', () => this.handleLeaderChange());
    this.addPresetBtn?.addEventListener('click', () => this.showPresetEditor());

    // Listen for storage changes to refresh
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.activePersonaIds || changes.personas || changes.conclavePresets) {
        this.load();
      }
    });

    await this.load();
  }

  private async load(): Promise<void> {
    try {
      [this.allPersonas, this.activeIds, this.leaderId, this.presets] = await Promise.all([
        getPersonas(),
        getActivePersonaIds(),
        getConclaveLeaderId(),
        getConclavePresets(),
      ]);
      this.renderLeaderPicker();
      this.renderPresets();
    } catch (error) {
      console.error('Failed to load conclave data:', error);
    }
  }

  private renderLeaderPicker(): void {
    if (!this.leaderSelect) return;

    // Get active personas only
    const activePersonas = this.allPersonas.filter((p) => this.activeIds.includes(p.id));

    if (activePersonas.length === 0) {
      this.leaderSelect.innerHTML = '<option value="">No active personas</option>';
      this.leaderSelect.disabled = true;
      return;
    }

    this.leaderSelect.disabled = false;
    this.leaderSelect.innerHTML = activePersonas
      .map((p) => {
        const selected = p.id === this.leaderId ? 'selected' : '';
        return `<option value="${p.id}" ${selected}>${this.escapeHtml(p.name)}</option>`;
      })
      .join('');
  }

  private async handleLeaderChange(): Promise<void> {
    if (!this.leaderSelect) return;

    const newLeaderId = this.leaderSelect.value;
    if (!newLeaderId) return;

    try {
      await setConclaveLeaderId(newLeaderId);
      this.leaderId = newLeaderId;
      this.ctx.showToast('Conclave leader updated', 'success');
    } catch (error) {
      console.error('Failed to set conclave leader:', error);
      this.ctx.showToast('Failed to update leader', 'error');
    }
  }

  private renderPresets(): void {
    if (!this.presetsListEl) return;

    if (this.presets.length === 0) {
      this.presetsListEl.innerHTML = `
        <p class="conclave-presets-empty">
          No presets yet. Create a preset to quickly switch between persona combinations.
        </p>
      `;
      return;
    }

    this.presetsListEl.innerHTML = this.presets
      .map((preset) => {
        // Get persona details for this preset
        const presetPersonas = preset.personaIds
          .map((id) => this.allPersonas.find((p) => p.id === id))
          .filter((p): p is Persona => p !== undefined);

        const missingCount = preset.personaIds.length - presetPersonas.length;
        const dotsHtml = presetPersonas
          .map((p) => `<span class="preset-dot" style="background: ${p.color};" title="${this.escapeHtml(p.name)}"></span>`)
          .join('');
        const namesHtml = presetPersonas.map((p) => this.escapeHtml(p.name)).join(', ');
        const warningHtml = missingCount > 0
          ? `<span class="preset-warning" title="${missingCount} persona(s) deleted">(${missingCount} missing)</span>`
          : '';

        return `
          <div class="preset-card" data-id="${preset.id}">
            <div class="preset-header">
              <span class="preset-name">${this.escapeHtml(preset.name)}</span>
              <div class="preset-dots">${dotsHtml}</div>
            </div>
            <div class="preset-personas">${namesHtml} ${warningHtml}</div>
            <div class="preset-actions">
              <button type="button" class="btn btn-sm btn-primary preset-activate">Activate</button>
              <button type="button" class="btn btn-sm btn-secondary preset-edit">Edit</button>
              <button type="button" class="btn btn-sm btn-danger preset-delete">Delete</button>
            </div>
          </div>
        `;
      })
      .join('');

    // Bind events
    this.presetsListEl.querySelectorAll('.preset-card').forEach((card) => {
      const id = (card as HTMLElement).dataset.id!;
      card.querySelector('.preset-activate')?.addEventListener('click', () => this.handleActivate(id));
      card.querySelector('.preset-edit')?.addEventListener('click', () => this.showPresetEditor(id));
      card.querySelector('.preset-delete')?.addEventListener('click', () => this.handleDelete(id));
    });
  }

  private async handleActivate(id: string): Promise<void> {
    try {
      const result = await activatePreset(id);
      if (result.missingIds.length > 0) {
        this.ctx.showToast(`Activated (${result.missingIds.length} deleted persona(s) skipped)`, 'success');
      } else {
        this.ctx.showToast('Preset activated', 'success');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to activate preset';
      this.ctx.showToast(msg, 'error');
    }
  }

  private handleDelete(id: string): void {
    const preset = this.presets.find((p) => p.id === id);
    if (!preset) return;

    this.ctx.showConfirmModal(
      'Delete Preset',
      `Are you sure you want to delete "${preset.name}"?`,
      async () => {
        try {
          await deleteConclavePreset(id);
          this.presets = this.presets.filter((p) => p.id !== id);
          this.renderPresets();
          this.ctx.showToast('Preset deleted', 'success');
        } catch (error) {
          this.ctx.showToast('Failed to delete preset', 'error');
        }
      }
    );
  }

  private showPresetEditor(editId?: string): void {
    const existing = editId ? this.presets.find((p) => p.id === editId) : null;

    // Create modal content
    const modal = document.createElement('div');
    modal.className = 'preset-editor-overlay';
    modal.innerHTML = `
      <div class="preset-editor-modal">
        <h3>${existing ? 'Edit Preset' : 'New Preset'}</h3>
        <div class="preset-editor-field">
          <label for="preset-name-input">Name</label>
          <input type="text" id="preset-name-input" class="text-input" placeholder="e.g., Board Meeting" value="${existing ? this.escapeHtml(existing.name) : ''}">
        </div>
        <div class="preset-editor-field">
          <label>Personas (max ${MAX_ACTIVE_PERSONAS})</label>
          <div id="preset-persona-checkboxes" class="preset-persona-list">
            ${this.allPersonas
              .map((p) => {
                const checked = existing?.personaIds.includes(p.id) ? 'checked' : '';
                return `
                  <label class="preset-persona-item">
                    <input type="checkbox" value="${p.id}" ${checked}>
                    <span class="preset-dot" style="background: ${p.color};"></span>
                    <span>${this.escapeHtml(p.name)}</span>
                  </label>
                `;
              })
              .join('')}
          </div>
        </div>
        <div class="preset-editor-actions">
          <button type="button" class="btn btn-secondary" id="preset-cancel">Cancel</button>
          <button type="button" class="btn btn-primary" id="preset-save">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Bind events
    const nameInput = modal.querySelector('#preset-name-input') as HTMLInputElement;
    const checkboxes = modal.querySelectorAll('#preset-persona-checkboxes input[type="checkbox"]');
    const cancelBtn = modal.querySelector('#preset-cancel');
    const saveBtn = modal.querySelector('#preset-save');

    // Enforce max selection
    checkboxes.forEach((cb) => {
      cb.addEventListener('change', () => {
        const checkedCount = Array.from(checkboxes).filter((c) => (c as HTMLInputElement).checked).length;
        checkboxes.forEach((c) => {
          const checkbox = c as HTMLInputElement;
          if (!checkbox.checked && checkedCount >= MAX_ACTIVE_PERSONAS) {
            checkbox.disabled = true;
          } else {
            checkbox.disabled = false;
          }
        });
      });
    });

    cancelBtn?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    saveBtn?.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      const selectedIds = Array.from(checkboxes)
        .filter((c) => (c as HTMLInputElement).checked)
        .map((c) => (c as HTMLInputElement).value);

      if (!name) {
        this.ctx.showToast('Please enter a name', 'error');
        return;
      }
      if (selectedIds.length === 0) {
        this.ctx.showToast('Please select at least one persona', 'error');
        return;
      }

      try {
        const preset: ConclavePreset = existing
          ? { ...existing, name, personaIds: selectedIds, updatedAt: Date.now() }
          : createConclavePreset(name, selectedIds);

        await saveConclavePreset(preset);
        modal.remove();
        await this.load();
        this.ctx.showToast(existing ? 'Preset updated' : 'Preset created', 'success');
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to save preset';
        this.ctx.showToast(msg, 'error');
      }
    });

    nameInput.focus();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Refresh the section (called externally if needed).
   */
  async refresh(): Promise<void> {
    await this.load();
  }
}
