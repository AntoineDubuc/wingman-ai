import type { OptionsContext } from './shared';

export class TranscriptionSection {
  private ctx!: OptionsContext;
  private select: HTMLSelectElement | null = null;

  async init(ctx: OptionsContext): Promise<void> {
    this.ctx = ctx;
    this.select = document.getElementById('endpointing-select') as HTMLSelectElement;
    this.select?.addEventListener('change', () => this.save());
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['endpointingMs']);
      if (this.select) {
        this.select.value = result.endpointingMs ?? '5000';
      }
    } catch (error) {
      console.error('Failed to load transcription setting:', error);
    }
  }

  private async save(): Promise<void> {
    if (!this.select) return;

    try {
      await chrome.storage.local.set({ endpointingMs: this.select.value });
      const label = this.select.options[this.select.selectedIndex]?.text ?? '';
      this.ctx.showToast(`Transcription sensitivity: ${label}`, 'success');
    } catch (error) {
      console.error('Failed to save transcription setting:', error);
      this.ctx.showToast('Failed to save setting', 'error');
    }
  }
}
