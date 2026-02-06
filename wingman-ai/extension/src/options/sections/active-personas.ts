import type { OptionsContext } from './shared';
import {
  getPersonas,
  getActivePersonaIds,
  setActivePersonaIds,
  MAX_ACTIVE_PERSONAS,
  type Persona,
} from '../../shared/persona';

/**
 * Active Personas section for the Setup tab.
 * Allows users to select up to 4 personas to be active during calls (Hydra multi-persona).
 */
export class ActivePersonasSection {
  private ctx!: OptionsContext;
  private listEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private allPersonas: Persona[] = [];
  private activeIds: string[] = [];

  async init(ctx: OptionsContext): Promise<void> {
    this.ctx = ctx;
    this.listEl = document.getElementById('active-personas-list');
    this.statusEl = document.getElementById('active-personas-status');

    await this.load();
  }

  private async load(): Promise<void> {
    try {
      this.allPersonas = await getPersonas();
      this.activeIds = await getActivePersonaIds();
      this.render();
    } catch (error) {
      console.error('Failed to load personas:', error);
    }
  }

  private render(): void {
    if (!this.listEl) return;

    // If no personas exist, show a message
    if (this.allPersonas.length === 0) {
      this.listEl.innerHTML = `
        <p class="active-personas-empty">
          No personas created yet. Create personas in the Personas tab first.
        </p>
      `;
      this.updateStatus();
      return;
    }

    // Render checkbox items for each persona
    this.listEl.innerHTML = this.allPersonas
      .map((persona) => {
        const isActive = this.activeIds.includes(persona.id);
        const canToggle = isActive || this.activeIds.length < MAX_ACTIVE_PERSONAS;
        const isOnlyActive = isActive && this.activeIds.length === 1;

        return `
          <label class="active-persona-item${isActive ? ' active' : ''}${!canToggle ? ' disabled' : ''}" data-id="${persona.id}">
            <input
              type="checkbox"
              class="active-persona-checkbox"
              ${isActive ? 'checked' : ''}
              ${!canToggle || isOnlyActive ? 'disabled' : ''}
            >
            <span class="active-persona-dot" style="background: ${persona.color}"></span>
            <span class="active-persona-name">${this.escapeHtml(persona.name)}</span>
            ${isOnlyActive ? '<span class="active-persona-hint">(At least one required)</span>' : ''}
          </label>
        `;
      })
      .join('');

    // Bind change events
    const items = this.listEl.querySelectorAll('.active-persona-item');
    items.forEach((item) => {
      const checkbox = item.querySelector('.active-persona-checkbox') as HTMLInputElement;
      checkbox?.addEventListener('change', () => {
        const id = (item as HTMLElement).dataset.id;
        if (id) this.togglePersona(id, checkbox.checked);
      });
    });

    this.updateStatus();
  }

  private async togglePersona(id: string, checked: boolean): Promise<void> {
    if (checked) {
      // Adding persona
      if (this.activeIds.length >= MAX_ACTIVE_PERSONAS) {
        this.ctx.showToast(`Maximum ${MAX_ACTIVE_PERSONAS} personas can be active`, 'error');
        this.render(); // Re-render to reset checkbox state
        return;
      }
      if (!this.activeIds.includes(id)) {
        this.activeIds = [...this.activeIds, id];
      }
    } else {
      // Removing persona
      if (this.activeIds.length <= 1) {
        this.ctx.showToast('At least one persona must be active', 'error');
        this.render();
        return;
      }
      this.activeIds = this.activeIds.filter((i) => i !== id);
    }

    try {
      await setActivePersonaIds(this.activeIds);
      this.render();
    } catch (error) {
      console.error('Failed to save active personas:', error);
      this.ctx.showToast('Failed to save active personas', 'error');
    }
  }

  private updateStatus(): void {
    if (!this.statusEl) return;

    const activeCount = this.activeIds.length;
    const totalCount = this.allPersonas.length;
    this.statusEl.textContent = `${activeCount} of ${totalCount} active · Max ${MAX_ACTIVE_PERSONAS} active personas.`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Refresh the list (called when personas change in the Personas tab).
   */
  async refresh(): Promise<void> {
    await this.load();
  }
}
