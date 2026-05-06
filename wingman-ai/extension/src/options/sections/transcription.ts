import type { OptionsContext } from './shared';
import { type LLMProvider, PROVIDER_COOLDOWNS } from '../../shared/llm-config';
import {
  type PromptTuningMode,
  DEFAULT_PROMPT_TUNING_MODE,
  PROMPT_TUNING_STORAGE_KEY,
} from '../../shared/model-tuning';

const DEFAULT_ENDPOINTING_MS = '700';

export class TranscriptionSection {
  private ctx!: OptionsContext;
  private slider: HTMLInputElement | null = null;
  private valueLabel: HTMLElement | null = null;
  private cooldownSlider: HTMLInputElement | null = null;
  private cooldownLabel: HTMLElement | null = null;
  private autoSuggestionsToggle: HTMLInputElement | null = null;
  private cooldownSliderGroup: HTMLElement | null = null;

  async init(ctx: OptionsContext): Promise<void> {
    this.ctx = ctx;
    this.slider = document.getElementById('endpointing-range') as HTMLInputElement;
    this.valueLabel = document.getElementById('endpointing-value');
    this.cooldownSlider = document.getElementById('cooldown-range') as HTMLInputElement;
    this.cooldownLabel = document.getElementById('cooldown-value');
    this.autoSuggestionsToggle = document.getElementById('auto-suggestions-toggle') as HTMLInputElement;
    this.cooldownSliderGroup = document.getElementById('cooldown-slider-group') as HTMLElement;

    this.slider?.addEventListener('input', () => this.updateLabel());
    this.slider?.addEventListener('change', () => this.saveEndpointing());
    this.cooldownSlider?.addEventListener('input', () => this.updateCooldownLabel());
    this.cooldownSlider?.addEventListener('change', () => this.saveCooldown());
    this.autoSuggestionsToggle?.addEventListener('change', () => this.saveAutoSuggestions());

    // Prompt tuning mode radios
    const tuningRadios = document.querySelectorAll<HTMLInputElement>('input[name="prompt-tuning-mode"]');
    tuningRadios.forEach((radio) => {
      radio.addEventListener('change', () => this.saveTuningMode(radio.value as PromptTuningMode));
    });

    await this.load();
  }

  private formatMs(ms: number): string {
    return `${(ms / 1000).toFixed(1)}s`;
  }

  private formatCooldown(ms: number): string {
    return `${Math.round(ms / 1000)}s`;
  }

  private updateLabel(): void {
    if (!this.slider || !this.valueLabel) return;
    this.valueLabel.textContent = this.formatMs(Number(this.slider.value));
  }

  private updateCooldownLabel(): void {
    if (!this.cooldownSlider || !this.cooldownLabel) return;
    this.cooldownLabel.textContent = this.formatCooldown(Number(this.cooldownSlider.value));
  }

  private async load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['endpointingMs', 'suggestionCooldownMs', 'llmProvider', 'autoSuggestionsEnabled', PROMPT_TUNING_STORAGE_KEY]);
      const provider = (result.llmProvider as LLMProvider) || 'gemini';
      const defaultCooldown = String(PROVIDER_COOLDOWNS[provider]);

      if (this.slider) {
        this.slider.value = result.endpointingMs ?? DEFAULT_ENDPOINTING_MS;
      }
      if (this.cooldownSlider) {
        this.cooldownSlider.value = result.suggestionCooldownMs ?? defaultCooldown;
      }
      this.updateLabel();
      this.updateCooldownLabel();

      // Auto-suggestions toggle (default: true / ON)
      const autoEnabled = result.autoSuggestionsEnabled ?? true;
      if (this.autoSuggestionsToggle) {
        this.autoSuggestionsToggle.checked = autoEnabled;
      }
      this.updateCooldownSliderState(autoEnabled);

      // Set tuning mode radio
      const tuningMode = (result[PROMPT_TUNING_STORAGE_KEY] as PromptTuningMode) || DEFAULT_PROMPT_TUNING_MODE;
      const tuningRadio = document.querySelector<HTMLInputElement>(
        `input[name="prompt-tuning-mode"][value="${tuningMode}"]`
      );
      if (tuningRadio) tuningRadio.checked = true;
    } catch (error) {
      console.error('Failed to load transcription settings:', error);
    }
  }

  private async saveEndpointing(): Promise<void> {
    if (!this.slider) return;

    try {
      await chrome.storage.local.set({ endpointingMs: this.slider.value });
      const value = this.formatMs(Number(this.slider.value));
      this.ctx.showToast(
        this.ctx.t?.('options.toasts.transcription_pause_threshold', { value })
          ?? `Pause threshold: ${value}`,
        'success',
      );
    } catch (error) {
      console.error('Failed to save transcription setting:', error);
      this.ctx.showToast(
        this.ctx.t?.('options.toasts.settings_save_failed') ?? 'Failed to save setting',
        'error',
      );
    }
  }

  private async saveCooldown(): Promise<void> {
    if (!this.cooldownSlider) return;

    try {
      await chrome.storage.local.set({ suggestionCooldownMs: this.cooldownSlider.value });
      const value = this.formatCooldown(Number(this.cooldownSlider.value));
      this.ctx.showToast(
        this.ctx.t?.('options.toasts.transcription_suggestion_cooldown', { value })
          ?? `Suggestion cooldown: ${value}`,
        'success',
      );
    } catch (error) {
      console.error('Failed to save cooldown setting:', error);
      this.ctx.showToast(
        this.ctx.t?.('options.toasts.settings_save_failed') ?? 'Failed to save setting',
        'error',
      );
    }
  }

  private updateCooldownSliderState(enabled: boolean): void {
    if (this.cooldownSliderGroup) {
      this.cooldownSliderGroup.style.opacity = enabled ? '' : '0.5';
    }
    if (this.cooldownSlider) {
      this.cooldownSlider.disabled = !enabled;
    }
  }

  private async saveAutoSuggestions(): Promise<void> {
    if (!this.autoSuggestionsToggle) return;
    const enabled = this.autoSuggestionsToggle.checked;

    try {
      await chrome.storage.local.set({ autoSuggestionsEnabled: enabled });
      this.updateCooldownSliderState(enabled);
      const key = enabled
        ? 'options.toasts.transcription_auto_suggestions_on'
        : 'options.toasts.transcription_auto_suggestions_off';
      this.ctx.showToast(
        this.ctx.t?.(key) ?? `Auto-suggestions: ${enabled ? 'On' : 'Off'}`,
        'success',
      );
    } catch (error) {
      console.error('Failed to save auto-suggestions setting:', error);
      this.ctx.showToast(
        this.ctx.t?.('options.toasts.settings_save_failed') ?? 'Failed to save setting',
        'error',
      );
    }
  }

  private async saveTuningMode(mode: PromptTuningMode): Promise<void> {
    try {
      await chrome.storage.local.set({ [PROMPT_TUNING_STORAGE_KEY]: mode });
      const label = mode === 'auto' ? 'Auto' : 'Off';
      this.ctx.showToast(
        this.ctx.t?.('options.toasts.transcription_prompt_tuning', { label })
          ?? `Prompt tuning: ${label}`,
        'success',
      );
    } catch (error) {
      console.error('Failed to save tuning mode:', error);
      this.ctx.showToast(
        this.ctx.t?.('options.toasts.settings_save_failed') ?? 'Failed to save setting',
        'error',
      );
    }
  }
}
