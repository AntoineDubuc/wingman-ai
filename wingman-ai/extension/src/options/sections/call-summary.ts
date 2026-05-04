import type { OptionsContext } from './shared';

export class CallSummarySection {
  private ctx!: OptionsContext;
  private enabledToggle: HTMLInputElement | null = null;
  private momentsToggle: HTMLInputElement | null = null;
  private momentsRow: HTMLElement | null = null;

  async init(ctx: OptionsContext): Promise<void> {
    this.ctx = ctx;
    this.enabledToggle = document.getElementById('summary-enabled-toggle') as HTMLInputElement;
    this.momentsToggle = document.getElementById('summary-moments-toggle') as HTMLInputElement;
    this.momentsRow = document.getElementById('summary-moments-row');

    this.enabledToggle?.addEventListener('change', () => {
      this.updateMomentsAvailability();
      this.save();
    });
    this.momentsToggle?.addEventListener('change', () => this.save());

    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([
        'summaryEnabled',
        'summaryKeyMomentsEnabled',
      ]);

      if (this.enabledToggle) {
        this.enabledToggle.checked = result.summaryEnabled ?? true;
      }
      if (this.momentsToggle) {
        this.momentsToggle.checked = result.summaryKeyMomentsEnabled ?? true;
      }

      this.updateMomentsAvailability();
    } catch (error) {
      console.error('Failed to load summary settings:', error);
    }
  }

  private async save(): Promise<void> {
    try {
      const summaryEnabled = this.enabledToggle?.checked ?? true;
      const keyMomentsEnabled = this.momentsToggle?.checked ?? true;

      await chrome.storage.local.set({
        summaryEnabled,
        summaryKeyMomentsEnabled: keyMomentsEnabled,
      });

      this.ctx.showToast(
        summaryEnabled ? 'Summary settings saved' : 'Call summary disabled',
        'success'
      );
    } catch (error) {
      console.error('Failed to save summary settings:', error);
      this.ctx.showToast('Failed to save settings', 'error');
    }
  }

  private updateMomentsAvailability(): void {
    const enabled = this.enabledToggle?.checked ?? true;

    if (this.momentsToggle) {
      this.momentsToggle.disabled = !enabled;
    }

    if (this.momentsRow) {
      if (enabled) {
        this.momentsRow.style.opacity = '';
        this.momentsRow.style.pointerEvents = '';
      } else {
        this.momentsRow.style.opacity = '0.5';
        this.momentsRow.style.pointerEvents = 'none';
      }
    }
  }
}
