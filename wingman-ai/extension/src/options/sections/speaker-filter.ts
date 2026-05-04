import type { OptionsContext } from './shared';

export class SpeakerFilterSection {
  private ctx!: OptionsContext;
  private toggle: HTMLInputElement | null = null;

  async init(ctx: OptionsContext): Promise<void> {
    this.ctx = ctx;
    this.toggle = document.getElementById('speaker-filter-toggle') as HTMLInputElement;
    this.toggle?.addEventListener('change', () => this.save());
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['speakerFilterEnabled']);
      if (this.toggle) {
        this.toggle.checked = result.speakerFilterEnabled ?? false;
      }
    } catch (error) {
      console.error('Failed to load speaker filter setting:', error);
    }
  }

  private async save(): Promise<void> {
    if (!this.toggle) return;

    try {
      const enabled = this.toggle.checked;
      await chrome.storage.local.set({ speakerFilterEnabled: enabled });
      this.ctx.showToast(
        enabled ? 'Speaker filter enabled' : 'Speaker filter disabled',
        'success'
      );
    } catch (error) {
      console.error('Failed to save speaker filter setting:', error);
      this.ctx.showToast('Failed to save setting', 'error');
    }
  }
}
