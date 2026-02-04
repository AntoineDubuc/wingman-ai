import type { OptionsContext } from './shared';

const DEFAULT_ENDPOINTING_MS = '700';

export class TranscriptionSection {
  private ctx!: OptionsContext;
  private slider: HTMLInputElement | null = null;
  private valueLabel: HTMLElement | null = null;

  async init(ctx: OptionsContext): Promise<void> {
    this.ctx = ctx;
    this.slider = document.getElementById('endpointing-range') as HTMLInputElement;
    this.valueLabel = document.getElementById('endpointing-value');

    this.slider?.addEventListener('input', () => this.updateLabel());
    this.slider?.addEventListener('change', () => this.save());
    await this.load();
  }

  private formatMs(ms: number): string {
    return `${(ms / 1000).toFixed(1)}s`;
  }

  private updateLabel(): void {
    if (!this.slider || !this.valueLabel) return;
    this.valueLabel.textContent = this.formatMs(Number(this.slider.value));
  }

  private async load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['endpointingMs']);
      if (this.slider) {
        this.slider.value = result.endpointingMs ?? DEFAULT_ENDPOINTING_MS;
      }
      this.updateLabel();
    } catch (error) {
      console.error('Failed to load transcription setting:', error);
    }
  }

  private async save(): Promise<void> {
    if (!this.slider) return;

    try {
      await chrome.storage.local.set({ endpointingMs: this.slider.value });
      this.ctx.showToast(`Pause threshold: ${this.formatMs(Number(this.slider.value))}`, 'success');
    } catch (error) {
      console.error('Failed to save transcription setting:', error);
      this.ctx.showToast('Failed to save setting', 'error');
    }
  }
}
