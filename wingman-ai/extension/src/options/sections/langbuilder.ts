import type { OptionsContext } from './shared';
import { langBuilderClient, type LangBuilderFlow } from '../../services/langbuilder-client';

export class LangBuilderSection {
  private ctx!: OptionsContext;
  private urlInput: HTMLInputElement | null = null;
  private apiKeyInput: HTMLInputElement | null = null;
  private testBtn: HTMLButtonElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private flowsCard: HTMLElement | null = null;
  private flowSelect: HTMLSelectElement | null = null;

  async init(ctx: OptionsContext): Promise<void> {
    this.ctx = ctx;
    this.urlInput = document.getElementById('langbuilder-url') as HTMLInputElement;
    this.apiKeyInput = document.getElementById('langbuilder-api-key') as HTMLInputElement;
    this.testBtn = document.getElementById('langbuilder-test-btn') as HTMLButtonElement;
    this.saveBtn = document.getElementById('langbuilder-save-btn') as HTMLButtonElement;
    this.statusEl = document.getElementById('langbuilder-status');
    this.flowsCard = document.getElementById('langbuilder-flows-card');
    this.flowSelect = document.getElementById('langbuilder-flow-preview') as HTMLSelectElement;

    this.testBtn?.addEventListener('click', () => this.test());
    this.saveBtn?.addEventListener('click', () => this.save());

    // Note: visibility toggle for API key is handled globally by ApiKeysSection

    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([
        'langbuilderUrl',
        'langbuilderApiKey',
        'langbuilderFlows',
      ]);

      if (this.urlInput && result.langbuilderUrl) {
        this.urlInput.value = result.langbuilderUrl;
      }
      if (this.apiKeyInput && result.langbuilderApiKey) {
        this.apiKeyInput.value = result.langbuilderApiKey;
      }

      if (result.langbuilderFlows && Array.isArray(result.langbuilderFlows) && result.langbuilderFlows.length > 0) {
        this.populateFlows(result.langbuilderFlows as LangBuilderFlow[]);
      }

      this.updateStatus();
    } catch (error) {
      console.error('Failed to load LangBuilder settings:', error);
    }
  }

  private async save(): Promise<void> {
    const url = this.urlInput?.value?.trim() || '';
    const apiKey = this.apiKeyInput?.value?.trim() || '';

    if (!url || !apiKey) {
      this.ctx.showToast('Please enter both URL and API key', 'error');
      return;
    }

    // Request host permission if needed
    const granted = await this.ensurePermission(url);
    if (!granted) return;

    try {
      await chrome.storage.local.set({
        langbuilderUrl: url,
        langbuilderApiKey: apiKey,
      });
      this.updateStatus();
      this.ctx.showToast('LangBuilder settings saved', 'success');
    } catch (error) {
      console.error('Failed to save LangBuilder settings:', error);
      this.ctx.showToast('Failed to save settings', 'error');
    }
  }

  private async test(): Promise<void> {
    const url = this.urlInput?.value?.trim() || '';
    const apiKey = this.apiKeyInput?.value?.trim() || '';

    if (!url || !apiKey) {
      this.ctx.showToast('Please enter both URL and API key', 'error');
      return;
    }

    // Request host permission first
    const granted = await this.ensurePermission(url);
    if (!granted) return;

    if (this.testBtn) {
      this.testBtn.disabled = true;
      this.testBtn.textContent = 'Testing...';
    }

    try {
      const flows = await langBuilderClient.listFlows(url, apiKey);

      // Cache flows (including detected inputType for correct API calls)
      const cached = flows.map((f) => ({ id: f.id, name: f.name, inputType: f.inputType }));
      await chrome.storage.local.set({ langbuilderFlows: cached });

      this.populateFlows(cached);
      this.setStatusDot('status-configured', `Connected (${flows.length} flows)`);
      this.ctx.showToast(`Connected! Found ${flows.length} flow${flows.length === 1 ? '' : 's'}`, 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Connection failed';
      this.setStatusDot('status-error', msg);
      this.ctx.showToast(`Test failed: ${msg}`, 'error');
    } finally {
      if (this.testBtn) {
        this.testBtn.disabled = false;
        this.testBtn.textContent = 'Test Connection';
      }
    }
  }

  private async ensurePermission(url: string): Promise<boolean> {
    try {
      const origin = new URL(url).origin + '/*';

      // Check if already granted
      const has = await chrome.permissions.contains({ origins: [origin] });
      if (has) return true;

      // Request permission (must be in user-gesture handler)
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) {
        this.ctx.showToast('Permission required to connect to this server', 'error');
        return false;
      }
      return true;
    } catch (error) {
      console.error('Permission request failed:', error);
      this.ctx.showToast('Invalid URL format', 'error');
      return false;
    }
  }

  private populateFlows(flows: LangBuilderFlow[]): void {
    if (!this.flowSelect || !this.flowsCard) return;

    this.flowSelect.innerHTML = '';
    for (const flow of flows) {
      const opt = document.createElement('option');
      opt.value = flow.id;
      opt.textContent = flow.name;
      this.flowSelect.appendChild(opt);
    }

    this.flowsCard.style.display = '';
  }

  private updateStatus(): void {
    const url = this.urlInput?.value?.trim() || '';
    const apiKey = this.apiKeyInput?.value?.trim() || '';

    if (url && apiKey) {
      this.setStatusDot('status-configured', 'Configured');
    } else if (url || apiKey) {
      this.setStatusDot('status-unconfigured', 'Incomplete — enter both URL and API key');
    } else {
      this.setStatusDot('status-unconfigured', 'Not configured');
    }
  }

  private setStatusDot(className: string, text: string): void {
    const dot = this.statusEl?.querySelector('.status-dot');
    const textEl = this.statusEl?.querySelector('.status-text');
    if (dot) {
      dot.classList.remove('status-unconfigured', 'status-configured', 'status-error');
      dot.classList.add(className);
    }
    if (textEl) {
      textEl.textContent = text;
    }
  }
}
