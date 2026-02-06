/**
 * Extension Popup - BYOK (Bring Your Own Keys) Architecture
 *
 * Shows API key configuration status and session controls.
 * Supports multi-persona selection (Hydra) with up to 4 active personas.
 */

import {
  getPersonas,
  getActivePersonaIds,
  setActivePersonaIds,
  getConclavePresets,
  activatePreset,
  MAX_ACTIVE_PERSONAS,
  type Persona,
  type ConclavePreset,
} from '../shared/persona';

class PopupController {
  private elements: {
    apiStatus: HTMLElement;
    sessionStatus: HTMLElement;
    sessionBtn: HTMLButtonElement;
    errorSection: HTMLElement;
    errorMessage: HTMLElement;
    controlsHint: HTMLElement;
    openOptions: HTMLElement;
    personaSection: HTMLElement;
    personaChips: HTMLElement;
    personaAddRow: HTMLElement;
    personaAddBtn: HTMLButtonElement;
    personaDropdown: HTMLElement;
    personaStatus: HTMLElement;
  };

  private isSessionActive = false;
  private hasApiKeys = false;
  private allPersonas: Persona[] = [];
  private activeIds: string[] = [];
  private presets: ConclavePreset[] = [];
  private dropdownOpen = false;
  private presetDropdownOpen = false;
  private hydraTooltipShown = false;
  private dropdownCloseTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.elements = {
      apiStatus: document.getElementById('api-status')!,
      sessionStatus: document.getElementById('session-status')!,
      sessionBtn: document.getElementById('session-btn') as HTMLButtonElement,
      errorSection: document.getElementById('error-section')!,
      errorMessage: document.getElementById('error-message')!,
      controlsHint: document.getElementById('controls-hint')!,
      openOptions: document.getElementById('open-options')!,
      personaSection: document.getElementById('persona-section')!,
      personaChips: document.getElementById('persona-chips')!,
      personaAddRow: document.getElementById('persona-add-row')!,
      personaAddBtn: document.getElementById('persona-add-btn') as HTMLButtonElement,
      personaDropdown: document.getElementById('persona-dropdown')!,
      personaStatus: document.getElementById('persona-status')!,
    };

    this.init();
  }

  private async init(): Promise<void> {
    await this.loadTheme();
    await this.checkHydraTooltip();
    await this.checkApiKeys();
    await this.updateStatus();
    await this.loadPersonas();
    this.attachEventListeners();
    this.startStatusPolling();
  }

  private async loadTheme(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['theme']);
      if (result.theme) {
        document.documentElement.setAttribute('data-theme', result.theme);
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
    }
  }

  private async checkHydraTooltip(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['hydraTooltipShown']);
      this.hydraTooltipShown = !!result.hydraTooltipShown;
    } catch {
      this.hydraTooltipShown = false;
    }
  }

  private async checkApiKeys(): Promise<void> {
    try {
      const storage = await chrome.storage.local.get(['deepgramApiKey', 'geminiApiKey', 'openrouterApiKey', 'groqApiKey', 'llmProvider']);
      const provider = (storage.llmProvider as string) || 'gemini';
      const providerKeyMap: Record<string, unknown> = {
        gemini: storage.geminiApiKey,
        openrouter: storage.openrouterApiKey,
        groq: storage.groqApiKey,
      };
      this.hasApiKeys = !!(storage.deepgramApiKey && providerKeyMap[provider]);
      this.updateApiKeyStatus();
    } catch (error) {
      console.error('Failed to check API keys:', error);
      this.hasApiKeys = false;
    }
  }

  private updateApiKeyStatus(): void {
    const apiDot = this.elements.apiStatus.querySelector('.status-dot') as HTMLElement;
    const apiText = this.elements.apiStatus.querySelector('.status-text') as HTMLElement;

    if (this.hasApiKeys) {
      apiDot.className = 'status-dot connected';
      apiText.textContent = 'Configured';
      this.elements.controlsHint.style.display = 'none';
    } else {
      apiDot.className = 'status-dot';
      apiText.textContent = 'Not Configured';
      this.elements.controlsHint.style.display = 'block';
    }

    if (!this.isSessionActive) {
      this.elements.sessionBtn.disabled = !this.hasApiKeys;
    }
  }

  private async updateStatus(): Promise<void> {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });

    const sessionDot = this.elements.sessionStatus.querySelector('.status-dot') as HTMLElement;
    const sessionText = this.elements.sessionStatus.querySelector('.status-text') as HTMLElement;

    if (response?.isSessionActive || response?.isCapturing) {
      sessionDot.className = 'status-dot connected';
      sessionText.textContent = 'Active';
      this.isSessionActive = true;
    } else {
      sessionDot.className = 'status-dot';
      sessionText.textContent = 'Inactive';
      this.isSessionActive = false;
    }

    this.elements.sessionBtn.textContent = this.isSessionActive ? 'Stop Session' : 'Start Session';
    this.elements.sessionBtn.classList.toggle('active', this.isSessionActive);
    this.elements.sessionBtn.disabled = !this.isSessionActive && !this.hasApiKeys;

    if (this.isSessionActive) {
      this.elements.controlsHint.style.display = 'none';
    } else if (!this.hasApiKeys) {
      this.elements.controlsHint.style.display = 'block';
    }

    // Update persona UI lock state
    this.renderPersonaChips();
  }

  private attachEventListeners(): void {
    this.elements.sessionBtn.addEventListener('click', () => this.toggleSession());
    this.elements.openOptions.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    document.getElementById('open-options-footer')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    document.getElementById('open-tutorials')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('src/tutorials/index.html') });
    });

    this.elements.personaAddBtn.addEventListener('click', () => this.toggleDropdown());

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (this.dropdownOpen && !this.elements.personaAddRow.contains(e.target as Node)) {
        this.closeDropdown();
      }
    });

    // Close dropdown when mouse leaves the add row area (with delay)
    this.elements.personaAddRow.addEventListener('mouseleave', () => {
      this.scheduleDropdownClose();
    });

    this.elements.personaAddRow.addEventListener('mouseenter', () => {
      this.cancelDropdownClose();
    });
  }

  private scheduleDropdownClose(): void {
    if (this.dropdownOpen && !this.dropdownCloseTimeout) {
      this.dropdownCloseTimeout = setTimeout(() => {
        this.closeDropdown();
        this.dropdownCloseTimeout = null;
      }, 150);
    }
  }

  private cancelDropdownClose(): void {
    if (this.dropdownCloseTimeout) {
      clearTimeout(this.dropdownCloseTimeout);
      this.dropdownCloseTimeout = null;
    }
  }

  private async toggleSession(): Promise<void> {
    this.elements.sessionBtn.disabled = true;
    this.hideError();

    try {
      if (this.isSessionActive) {
        await chrome.runtime.sendMessage({ type: 'STOP_SESSION' });
      } else {
        const response = await chrome.runtime.sendMessage({ type: 'START_SESSION' });

        if (!response.success) {
          this.showError(response.error || 'Failed to start session');
        }
      }
    } catch (error) {
      this.showError(String(error));
    }

    setTimeout(() => {
      this.checkApiKeys();
      this.updateStatus();
    }, 500);
  }

  private showError(message: string): void {
    this.elements.errorMessage.textContent = message;
    this.elements.errorSection.style.display = 'block';
  }

  private hideError(): void {
    this.elements.errorSection.style.display = 'none';
  }

  // === PERSONA MULTI-SELECT (HYDRA) ===

  private async loadPersonas(): Promise<void> {
    try {
      [this.allPersonas, this.activeIds, this.presets] = await Promise.all([
        getPersonas(),
        getActivePersonaIds(),
        getConclavePresets(),
      ]);

      if (this.allPersonas.length === 0) {
        this.elements.personaSection.style.display = 'none';
        return;
      }

      this.elements.personaSection.style.display = 'block';
      this.renderPresetButtons();
      this.renderPersonaChips();
      this.showHydraTooltipIfNeeded();
    } catch (error) {
      console.error('Failed to load personas:', error);
      this.elements.personaSection.style.display = 'none';
    }
  }

  private renderPresetButtons(): void {
    // Don't re-render while dropdown is open - it destroys event listeners
    if (this.presetDropdownOpen) return;

    // Find or create the presets container
    let presetsContainer = document.getElementById('persona-presets');
    if (!presetsContainer) {
      presetsContainer = document.createElement('div');
      presetsContainer.id = 'persona-presets';
      presetsContainer.className = 'persona-presets';
      // Insert before the chips
      this.elements.personaChips.parentNode?.insertBefore(presetsContainer, this.elements.personaChips);
    }

    // Hide if no presets
    if (this.presets.length === 0) {
      presetsContainer.style.display = 'none';
      return;
    }

    presetsContainer.style.display = 'block';

    // Build options with persona dots preview
    const optionsHtml = this.presets
      .map((preset) => {
        const presetPersonas = preset.personaIds
          .map((id) => this.allPersonas.find((p) => p.id === id))
          .filter((p): p is Persona => !!p);
        const dotsHtml = presetPersonas
          .map((p) => `<span class="preset-option-dot" style="background: ${p.color};"></span>`)
          .join('');
        const personaCount = presetPersonas.length;

        return `
          <div class="preset-option" data-id="${preset.id}">
            <span class="preset-option-dots">${dotsHtml}</span>
            <span class="preset-option-name">${this.escapeHtml(preset.name)}</span>
            <span class="preset-option-count">${personaCount} persona${personaCount !== 1 ? 's' : ''}</span>
          </div>
        `;
      })
      .join('');

    presetsContainer.innerHTML = `
      <div class="preset-dropdown-wrapper">
        <button class="preset-dropdown-trigger${this.isSessionActive ? ' disabled' : ''}" id="preset-trigger"${this.isSessionActive ? ' disabled title="Stop session to change presets"' : ''}>
          <span class="preset-dropdown-label">Conclave presets</span>
          <svg class="preset-dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
        <div class="preset-dropdown-menu" id="preset-menu" style="display: none;">
          ${optionsHtml}
        </div>
      </div>
    `;

    // Bind dropdown toggle
    const trigger = presetsContainer.querySelector('#preset-trigger') as HTMLButtonElement;
    const menu = presetsContainer.querySelector('#preset-menu') as HTMLElement;
    const wrapper = presetsContainer.querySelector('.preset-dropdown-wrapper') as HTMLElement;

    trigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.isSessionActive) return;
      const isOpen = menu.style.display !== 'none';
      menu.style.display = isOpen ? 'none' : 'block';
      this.presetDropdownOpen = !isOpen;
    });

    // Bind option clicks
    presetsContainer.querySelectorAll('.preset-option').forEach((option) => {
      option.addEventListener('click', async () => {
        if (this.isSessionActive) return;
        const id = (option as HTMLElement).dataset.id;
        menu.style.display = 'none';
        this.presetDropdownOpen = false;
        if (id) await this.handlePresetActivate(id);
      });
    });

    // Close dropdown when mouse leaves the entire wrapper/menu area
    let closeTimeout: ReturnType<typeof setTimeout> | null = null;

    const scheduleClose = () => {
      if (!closeTimeout) {
        closeTimeout = setTimeout(() => {
          menu.style.display = 'none';
          this.presetDropdownOpen = false;
          closeTimeout = null;
        }, 150);
      }
    };

    const cancelClose = () => {
      if (closeTimeout) {
        clearTimeout(closeTimeout);
        closeTimeout = null;
      }
    };

    wrapper?.addEventListener('mouseleave', scheduleClose);
    wrapper?.addEventListener('mouseenter', cancelClose);
    menu?.addEventListener('mouseleave', scheduleClose);
    menu?.addEventListener('mouseenter', cancelClose);

    // Also close on click outside
    document.addEventListener('click', (e) => {
      if (!presetsContainer?.contains(e.target as Node)) {
        menu.style.display = 'none';
        this.presetDropdownOpen = false;
      }
    });
  }

  private async handlePresetActivate(id: string): Promise<void> {
    try {
      const result = await activatePreset(id);
      this.activeIds = await getActivePersonaIds();
      this.renderPersonaChips();

      if (result.missingIds.length > 0) {
        console.log(`Preset activated with ${result.missingIds.length} missing persona(s)`);
      }
    } catch (error) {
      console.error('Failed to activate preset:', error);
    }
  }

  private renderPersonaChips(): void {
    // Don't re-render while dropdown is open - it destroys event listeners
    if (this.dropdownOpen) return;

    const chipsContainer = this.elements.personaChips;
    chipsContainer.innerHTML = '';

    const activePersonas = this.activeIds
      .map(id => this.allPersonas.find(p => p.id === id))
      .filter((p): p is Persona => !!p);

    for (const persona of activePersonas) {
      const chip = document.createElement('div');
      chip.className = 'persona-chip';
      chip.innerHTML = `
        <span class="persona-chip-dot" style="background: ${persona.color}"></span>
        <span class="persona-chip-name">${this.escapeHtml(persona.name)}</span>
        <button class="persona-chip-remove" data-id="${persona.id}" title="${this.isSessionActive ? 'Stop session to change personas' : 'Remove'}"${this.isSessionActive || activePersonas.length <= 1 ? ' disabled' : ''}>×</button>
      `;

      const removeBtn = chip.querySelector('.persona-chip-remove') as HTMLButtonElement;
      removeBtn.addEventListener('click', () => this.removePersona(persona.id));

      chipsContainer.appendChild(chip);
    }

    // Update add button and status
    const atMax = this.activeIds.length >= MAX_ACTIVE_PERSONAS;
    const hasInactive = this.allPersonas.length > this.activeIds.length;

    if (atMax) {
      this.elements.personaAddRow.innerHTML = '<div class="persona-max-message">Max 4 personas reached</div>';
    } else if (!hasInactive) {
      this.elements.personaAddRow.style.display = 'none';
    } else {
      this.elements.personaAddRow.style.display = 'block';
      this.elements.personaAddRow.innerHTML = `
        <button class="persona-add-btn" id="persona-add-btn"${this.isSessionActive ? ' disabled title="Stop session to change personas"' : ''}>+ Add persona</button>
        <div class="persona-dropdown" id="persona-dropdown" style="display: none;"></div>
      `;
      // Re-bind references
      this.elements.personaAddBtn = document.getElementById('persona-add-btn') as HTMLButtonElement;
      this.elements.personaDropdown = document.getElementById('persona-dropdown')!;
      this.elements.personaAddBtn.addEventListener('click', () => this.toggleDropdown());
    }

    // Status text
    const count = this.activeIds.length;
    this.elements.personaStatus.textContent = `${count} active`;
  }

  private toggleDropdown(): void {
    if (this.isSessionActive) return;

    if (this.dropdownOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  private openDropdown(): void {
    const inactivePersonas = this.allPersonas.filter(p => !this.activeIds.includes(p.id));

    if (inactivePersonas.length === 0) {
      this.closeDropdown();
      return;
    }

    this.elements.personaDropdown.innerHTML = inactivePersonas
      .map(p => `
        <div class="persona-dropdown-item" data-id="${p.id}">
          <span class="persona-dropdown-item-dot" style="background: ${p.color}"></span>
          <span class="persona-dropdown-item-name">${this.escapeHtml(p.name)}</span>
        </div>
      `)
      .join('');

    // Bind click events
    for (const item of this.elements.personaDropdown.querySelectorAll('.persona-dropdown-item')) {
      item.addEventListener('click', () => {
        const id = (item as HTMLElement).dataset.id;
        if (id) this.addPersona(id);
      });
    }

    // Cancel close when mouse is over dropdown
    this.elements.personaDropdown.addEventListener('mouseenter', () => {
      this.cancelDropdownClose();
    });

    this.elements.personaDropdown.addEventListener('mouseleave', () => {
      this.scheduleDropdownClose();
    });

    this.elements.personaDropdown.style.display = 'block';
    this.dropdownOpen = true;
  }

  private closeDropdown(): void {
    this.elements.personaDropdown.style.display = 'none';
    this.dropdownOpen = false;
  }

  private async addPersona(id: string): Promise<void> {
    if (this.isSessionActive) return;
    if (this.activeIds.length >= MAX_ACTIVE_PERSONAS) return;
    if (this.activeIds.includes(id)) return;

    const newIds = [...this.activeIds, id];
    await setActivePersonaIds(newIds);
    this.activeIds = newIds;
    this.closeDropdown();
    this.renderPersonaChips();
  }

  private async removePersona(id: string): Promise<void> {
    if (this.isSessionActive) return;
    if (this.activeIds.length <= 1) return; // Must keep at least one

    const newIds = this.activeIds.filter(i => i !== id);
    await setActivePersonaIds(newIds);
    this.activeIds = newIds;
    this.renderPersonaChips();
  }

  private async showHydraTooltipIfNeeded(): Promise<void> {
    if (this.hydraTooltipShown) return;
    if (this.allPersonas.length < 2) return; // Need at least 2 personas to use multi-select

    // Show tooltip after a brief delay
    setTimeout(() => {
      const addBtn = this.elements.personaAddBtn;
      if (!addBtn) return;

      const tooltip = document.createElement('div');
      tooltip.className = 'hydra-tooltip';
      tooltip.innerHTML = `
        <div style="position: absolute; bottom: calc(100% + 8px); left: 0; right: 0; background: var(--color-text); color: var(--color-bg); padding: 8px 12px; border-radius: 6px; font-size: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 200;">
          <strong>New:</strong> Activate multiple personas for expert-panel mode.
          <div style="position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid var(--color-text);"></div>
        </div>
      `;
      this.elements.personaAddRow.style.position = 'relative';
      this.elements.personaAddRow.appendChild(tooltip);

      // Auto-dismiss after 5 seconds or on click
      const dismiss = async () => {
        tooltip.remove();
        this.hydraTooltipShown = true;
        await chrome.storage.local.set({ hydraTooltipShown: true });
      };

      setTimeout(dismiss, 5000);
      tooltip.addEventListener('click', dismiss);
    }, 500);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private startStatusPolling(): void {
    setInterval(() => {
      this.checkApiKeys();
      this.updateStatus();
      this.loadPersonas();
    }, 2000);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
