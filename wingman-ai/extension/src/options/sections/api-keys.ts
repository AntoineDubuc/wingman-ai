import type { OptionsContext } from './shared';

export class ApiKeysSection {
  private ctx!: OptionsContext;
  private deepgramInput: HTMLInputElement | null = null;
  private geminiInput: HTMLInputElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;
  private testBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;

  async init(ctx: OptionsContext): Promise<void> {
    this.ctx = ctx;
    this.deepgramInput = document.getElementById('deepgram-api-key') as HTMLInputElement;
    this.geminiInput = document.getElementById('gemini-api-key') as HTMLInputElement;
    this.saveBtn = document.getElementById('save-keys-btn') as HTMLButtonElement;
    this.testBtn = document.getElementById('test-keys-btn') as HTMLButtonElement;
    this.statusEl = document.getElementById('api-status');

    this.saveBtn?.addEventListener('click', () => this.save());
    this.testBtn?.addEventListener('click', () => this.test());

    const visibilityBtns = document.querySelectorAll('.toggle-visibility-btn') as NodeListOf<HTMLButtonElement>;
    visibilityBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        if (targetId) this.toggleVisibility(targetId);
      });
    });

    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['deepgramApiKey', 'geminiApiKey']);

      if (this.deepgramInput && result.deepgramApiKey) {
        this.deepgramInput.value = result.deepgramApiKey;
      }
      if (this.geminiInput && result.geminiApiKey) {
        this.geminiInput.value = result.geminiApiKey;
      }

      this.updateStatus();
    } catch (error) {
      console.error('Failed to load API keys:', error);
    }
  }

  private async save(): Promise<void> {
    const deepgramKey = this.deepgramInput?.value?.trim() || '';
    const geminiKey = this.geminiInput?.value?.trim() || '';

    if (!deepgramKey && !geminiKey) {
      this.ctx.showToast('Please enter at least one API key', 'error');
      return;
    }

    try {
      await chrome.storage.local.set({
        deepgramApiKey: deepgramKey,
        geminiApiKey: geminiKey,
      });
      this.updateStatus();
      this.ctx.showToast('API keys saved securely', 'success');
    } catch (error) {
      console.error('Failed to save API keys:', error);
      this.ctx.showToast('Failed to save API keys', 'error');
    }
  }

  private async test(): Promise<void> {
    const deepgramKey = this.deepgramInput?.value?.trim() || '';
    const geminiKey = this.geminiInput?.value?.trim() || '';

    if (!deepgramKey && !geminiKey) {
      this.ctx.showToast('Please enter API keys first', 'error');
      return;
    }

    if (this.testBtn) {
      this.testBtn.disabled = true;
      this.testBtn.textContent = 'Testing...';
    }

    const results: string[] = [];
    let hasError = false;

    if (deepgramKey) {
      try {
        const response = await fetch('https://api.deepgram.com/v1/projects', {
          method: 'GET',
          headers: { Authorization: `Token ${deepgramKey}` },
        });

        if (response.ok) {
          results.push('Deepgram: Valid');
        } else if (response.status === 401 || response.status === 403) {
          results.push('Deepgram: Invalid key');
          hasError = true;
        } else {
          results.push('Deepgram: Error');
          hasError = true;
        }
      } catch {
        results.push('Deepgram: Network error');
        hasError = true;
      }
    }

    if (geminiKey) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`,
          { method: 'GET' }
        );

        if (response.ok) {
          results.push('Gemini: Valid');
        } else if (response.status === 400 || response.status === 401 || response.status === 403) {
          results.push('Gemini: Invalid key');
          hasError = true;
        } else {
          results.push('Gemini: Error');
          hasError = true;
        }
      } catch {
        results.push('Gemini: Network error');
        hasError = true;
      }
    }

    this.ctx.showToast(results.join(' | '), hasError ? 'error' : 'success');

    if (this.testBtn) {
      this.testBtn.disabled = false;
      this.testBtn.textContent = 'Test Keys';
    }
  }

  private updateStatus(): void {
    const deepgramKey = this.deepgramInput?.value?.trim() || '';
    const geminiKey = this.geminiInput?.value?.trim() || '';

    const statusDot = this.statusEl?.querySelector('.status-dot');
    const statusText = this.statusEl?.querySelector('.status-text');

    if (statusDot && statusText) {
      statusDot.classList.remove('status-unconfigured', 'status-configured', 'status-error');

      if (deepgramKey && geminiKey) {
        statusDot.classList.add('status-configured');
        statusText.textContent = 'Both keys configured';
      } else if (deepgramKey || geminiKey) {
        statusDot.classList.add('status-error');
        statusText.textContent = deepgramKey ? 'Missing Gemini key' : 'Missing Deepgram key';
      } else {
        statusDot.classList.add('status-unconfigured');
        statusText.textContent = 'Keys not configured';
      }
    }
  }

  private toggleVisibility(inputId: string): void {
    const input = document.getElementById(inputId) as HTMLInputElement;
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
    }
  }
}
