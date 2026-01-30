/**
 * Extension Popup - Settings and Controls
 */

class PopupController {
  private elements: {
    backendStatus: HTMLElement;
    sessionStatus: HTMLElement;
    sessionBtn: HTMLButtonElement;
    backendUrl: HTMLInputElement;
    saveSettings: HTMLButtonElement;
  };

  private isSessionActive = false;

  constructor() {
    this.elements = {
      backendStatus: document.getElementById('backend-status')!,
      sessionStatus: document.getElementById('session-status')!,
      sessionBtn: document.getElementById('session-btn') as HTMLButtonElement,
      backendUrl: document.getElementById('backend-url') as HTMLInputElement,
      saveSettings: document.getElementById('save-settings') as HTMLButtonElement,
    };

    this.init();
  }

  private async init(): Promise<void> {
    await this.loadTheme();
    await this.loadSettings();
    await this.updateStatus();
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

  private async loadSettings(): Promise<void> {
    const settings = await chrome.storage.local.get(['backendUrl']);

    if (settings.backendUrl) {
      this.elements.backendUrl.value = settings.backendUrl;
    } else {
      this.elements.backendUrl.value = 'ws://localhost:8000/ws/session';
    }
  }

  private async updateStatus(): Promise<void> {
    // Get status from background
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });

    // Update backend status
    const backendDot = this.elements.backendStatus.querySelector('.status-dot') as HTMLElement;
    const backendText = this.elements.backendStatus.querySelector('.status-text') as HTMLElement;

    if (response?.isConnected) {
      backendDot.className = 'status-dot connected';
      backendText.textContent = 'Connected';
    } else {
      backendDot.className = 'status-dot';
      backendText.textContent = 'Disconnected';
    }

    // Update session status
    const sessionDot = this.elements.sessionStatus.querySelector('.status-dot') as HTMLElement;
    const sessionText = this.elements.sessionStatus.querySelector('.status-text') as HTMLElement;

    if (response?.isCapturing) {
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

    // Enable button if we have a URL
    this.elements.sessionBtn.disabled = !this.elements.backendUrl.value.trim();
  }

  private attachEventListeners(): void {
    this.elements.sessionBtn.addEventListener('click', () => this.toggleSession());
    this.elements.saveSettings.addEventListener('click', () => this.saveSettings());

    this.elements.backendUrl.addEventListener('input', () => {
      this.elements.sessionBtn.disabled = !this.elements.backendUrl.value.trim();
    });
  }

  private async toggleSession(): Promise<void> {
    this.elements.sessionBtn.disabled = true;

    try {
      if (this.isSessionActive) {
        await chrome.runtime.sendMessage({ type: 'STOP_SESSION' });
      } else {
        const response = await chrome.runtime.sendMessage({
          type: 'START_SESSION',
          backendUrl: this.elements.backendUrl.value.trim(),
        });

        if (!response.success) {
          this.showError(response.error || 'Failed to start session');
        }
      }
    } catch (error) {
      this.showError(String(error));
    }

    // Update status after action
    setTimeout(() => this.updateStatus(), 500);
  }

  private async saveSettings(): Promise<void> {
    const backendUrl = this.elements.backendUrl.value.trim();

    if (!backendUrl) {
      this.showError('Please enter a backend URL');
      return;
    }

    try {
      new URL(backendUrl);
    } catch {
      this.showError('Please enter a valid URL');
      return;
    }

    await chrome.storage.local.set({ backendUrl });
    this.showSuccess('Settings saved!');
  }

  private showError(message: string): void {
    // Simple error display - could be enhanced with toast
    alert(message);
  }

  private showSuccess(message: string): void {
    const btn = this.elements.saveSettings;
    const originalText = btn.textContent;
    btn.textContent = message;
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  }

  private startStatusPolling(): void {
    setInterval(() => this.updateStatus(), 2000);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
