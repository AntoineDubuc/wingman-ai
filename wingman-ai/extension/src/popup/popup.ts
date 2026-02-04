/**
 * Extension Popup - BYOK (Bring Your Own Keys) Architecture
 *
 * Shows API key configuration status and session controls.
 * Users must configure Deepgram and Gemini API keys in Options before starting a session.
 */

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
    personaSelect: HTMLSelectElement;
    personaDot: HTMLElement;
  };

  private isSessionActive = false;
  private hasApiKeys = false;

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
      personaSelect: document.getElementById('persona-select') as HTMLSelectElement,
      personaDot: document.getElementById('persona-dot')!,
    };

    this.init();
  }

  private async init(): Promise<void> {
    await this.loadTheme();
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

  /**
   * Check if API keys are configured
   */
  private async checkApiKeys(): Promise<void> {
    try {
      const storage = await chrome.storage.local.get(['deepgramApiKey', 'geminiApiKey']);
      this.hasApiKeys = !!(storage.deepgramApiKey && storage.geminiApiKey);
      this.updateApiKeyStatus();
    } catch (error) {
      console.error('Failed to check API keys:', error);
      this.hasApiKeys = false;
    }
  }

  /**
   * Update the API key status indicator
   */
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

    // Enable/disable button based on API key status
    if (!this.isSessionActive) {
      this.elements.sessionBtn.disabled = !this.hasApiKeys;
    }
  }

  private async updateStatus(): Promise<void> {
    // Get status from background
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });

    // Update session status
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

    // Update button state
    this.elements.sessionBtn.textContent = this.isSessionActive ? 'Stop Session' : 'Start Session';
    this.elements.sessionBtn.classList.toggle('active', this.isSessionActive);

    // Enable button if session is active (to allow stopping) or if we have API keys
    this.elements.sessionBtn.disabled = !this.isSessionActive && !this.hasApiKeys;

    // Hide controls hint when session is active
    if (this.isSessionActive) {
      this.elements.controlsHint.style.display = 'none';
    } else if (!this.hasApiKeys) {
      this.elements.controlsHint.style.display = 'block';
    }
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

    this.elements.personaSelect.addEventListener('change', () => this.switchPersona());
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

    // Update status after action
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

  /**
   * Load personas and populate the dropdown
   */
  private async loadPersonas(): Promise<void> {
    try {
      const storage = await chrome.storage.local.get(['personas', 'activePersonaId']);
      const personas = (storage.personas as { id: string; name: string; color: string }[] | undefined) ?? [];
      const activeId = storage.activePersonaId as string | undefined;

      if (personas.length === 0) {
        this.elements.personaSection.style.display = 'none';
        return;
      }

      this.elements.personaSection.style.display = 'block';
      this.elements.personaSelect.innerHTML = '';

      for (const persona of personas) {
        const option = document.createElement('option');
        option.value = persona.id;
        option.textContent = persona.name;
        option.dataset.color = persona.color;
        if (persona.id === activeId) option.selected = true;
        this.elements.personaSelect.appendChild(option);
      }

      // Update the color dot to match active persona
      this.updatePersonaDot();
    } catch (error) {
      console.error('Failed to load personas:', error);
      this.elements.personaSection.style.display = 'none';
    }
  }

  /**
   * Handle persona selection change
   */
  private async switchPersona(): Promise<void> {
    const selectedId = this.elements.personaSelect.value;
    if (!selectedId) return;

    await chrome.storage.local.set({ activePersonaId: selectedId });
    this.updatePersonaDot();
  }

  private updatePersonaDot(): void {
    const selected = this.elements.personaSelect.selectedOptions[0];
    const color = selected?.dataset.color;
    if (color) {
      this.elements.personaDot.style.background = color;
    }
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
