/**
 * Web Search Section — Options page tab
 *
 * Manages Brave Search API key, daily cap slider, provider dropdown,
 * "Test connection" button, and daily usage display.
 */

import type { OptionsContext } from './shared';
import {
  STORAGE_KEY_WEB_SEARCH_API_KEY,
  STORAGE_KEY_WEB_SEARCH_DAILY_CAP,
  STORAGE_KEY_WEB_SEARCH_COUNTER,
  DEFAULT_DAILY_CAP,
  webSearchTestCall,
  type DailyCounter,
} from '../../services/web-search';

const WARN_THRESHOLD = 0.8;

export class WebSearchSection {
  private ctx!: OptionsContext;

  private apiKeyInput: HTMLInputElement | null = null;
  private capSlider: HTMLInputElement | null = null;
  private capValueLabel: HTMLElement | null = null;
  private testBtn: HTMLButtonElement | null = null;
  private testStatus: HTMLElement | null = null;
  private usageLabel: HTMLElement | null = null;

  async init(ctx: OptionsContext): Promise<void> {
    this.ctx = ctx;

    this.apiKeyInput = document.getElementById('web-search-api-key') as HTMLInputElement;
    this.capSlider = document.getElementById('web-search-daily-cap') as HTMLInputElement;
    this.capValueLabel = document.getElementById('web-search-cap-value');
    this.testBtn = document.getElementById('web-search-test-btn') as HTMLButtonElement;
    this.testStatus = document.getElementById('web-search-test-status');
    this.usageLabel = document.getElementById('web-search-usage');

    // Event listeners
    this.apiKeyInput?.addEventListener('change', () => this.saveApiKey());
    this.capSlider?.addEventListener('input', () => this.updateCapLabel());
    this.capSlider?.addEventListener('change', () => this.saveCap());
    this.testBtn?.addEventListener('click', () => this.testConnection());

    // Visibility toggle
    const visBtn = document.querySelector<HTMLButtonElement>('[data-target="web-search-api-key"]');
    visBtn?.addEventListener('click', () => {
      if (this.apiKeyInput) {
        this.apiKeyInput.type = this.apiKeyInput.type === 'password' ? 'text' : 'password';
      }
    });

    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEY_WEB_SEARCH_API_KEY,
        STORAGE_KEY_WEB_SEARCH_DAILY_CAP,
        STORAGE_KEY_WEB_SEARCH_COUNTER,
      ]);

      if (this.apiKeyInput && result[STORAGE_KEY_WEB_SEARCH_API_KEY]) {
        this.apiKeyInput.value = result[STORAGE_KEY_WEB_SEARCH_API_KEY] as string;
      }

      const cap = typeof result[STORAGE_KEY_WEB_SEARCH_DAILY_CAP] === 'number'
        ? result[STORAGE_KEY_WEB_SEARCH_DAILY_CAP] as number
        : DEFAULT_DAILY_CAP;
      if (this.capSlider) {
        this.capSlider.value = String(cap);
      }
      this.updateCapLabel();

      // Update usage display
      this.updateUsageDisplay(result[STORAGE_KEY_WEB_SEARCH_COUNTER] as DailyCounter | undefined, cap);
    } catch (error) {
      console.error('Failed to load web search settings:', error);
    }
  }

  private updateCapLabel(): void {
    if (this.capValueLabel && this.capSlider) {
      this.capValueLabel.textContent = this.capSlider.value;
    }
  }

  private updateUsageDisplay(counter: DailyCounter | undefined, cap: number): void {
    if (!this.usageLabel) return;

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    let count = 0;
    if (counter && counter.date === today && typeof counter.count === 'number') {
      count = counter.count;
    }

    const pct = cap > 0 ? count / cap : 0;

    this.usageLabel.textContent = `Used today: ${count}/${cap}`;
    this.usageLabel.classList.remove('usage-normal', 'usage-warn', 'usage-critical');

    if (pct >= 1) {
      this.usageLabel.classList.add('usage-critical');
    } else if (pct >= WARN_THRESHOLD) {
      this.usageLabel.classList.add('usage-warn');
    } else {
      this.usageLabel.classList.add('usage-normal');
    }
  }

  private async saveApiKey(): Promise<void> {
    const key = this.apiKeyInput?.value?.trim() || '';
    try {
      await chrome.storage.local.set({ [STORAGE_KEY_WEB_SEARCH_API_KEY]: key });
    } catch (error) {
      console.error('Failed to save web search API key:', error);
      this.ctx.showToast('Failed to save API key', 'error');
    }
  }

  private async saveCap(): Promise<void> {
    const cap = parseInt(this.capSlider?.value || String(DEFAULT_DAILY_CAP), 10);
    try {
      await chrome.storage.local.set({ [STORAGE_KEY_WEB_SEARCH_DAILY_CAP]: cap });
      // Refresh usage display with new cap
      const result = await chrome.storage.local.get([STORAGE_KEY_WEB_SEARCH_COUNTER]);
      this.updateUsageDisplay(result[STORAGE_KEY_WEB_SEARCH_COUNTER] as DailyCounter | undefined, cap);
    } catch (error) {
      console.error('Failed to save daily cap:', error);
      this.ctx.showToast('Failed to save daily cap', 'error');
    }
  }

  private async testConnection(): Promise<void> {
    const apiKey = this.apiKeyInput?.value?.trim() || '';

    if (!apiKey) {
      this.showTestStatus('API key required', 'error');
      return;
    }

    if (this.testBtn) {
      this.testBtn.disabled = true;
      this.testBtn.textContent = 'Testing...';
    }

    try {
      const results = await webSearchTestCall(apiKey, 'wingman test');
      this.showTestStatus(`Connected — ${results.length} results`, 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.showTestStatus(msg, 'error');
    } finally {
      if (this.testBtn) {
        this.testBtn.disabled = false;
        this.testBtn.textContent = 'Test Connection';
      }
    }
  }

  private showTestStatus(message: string, type: 'success' | 'error'): void {
    if (!this.testStatus) return;
    const icon = type === 'success' ? '\u2713' : '\u2715';
    this.testStatus.textContent = `${icon} ${message}`;
    this.testStatus.className = `web-search-test-status ${type}`;
  }
}
