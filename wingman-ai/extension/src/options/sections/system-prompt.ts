import type { OptionsContext } from './shared';
import { DEFAULT_SYSTEM_PROMPT } from '../../shared/default-prompt';

const MIN_PROMPT_LENGTH = 100;
const MAX_PROMPT_LENGTH = 10000;
const WARNING_THRESHOLD = 0.8;

interface ValidationResult {
  valid: boolean;
  error?: string;
}

export class SystemPromptSection {
  private ctx!: OptionsContext;
  private textarea: HTMLTextAreaElement | null = null;
  private charCountEl: HTMLElement | null = null;
  private charCurrentEl: HTMLElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;
  private resetBtn: HTMLButtonElement | null = null;
  private isDirty = false;
  private isLoading = false;

  get dirty(): boolean {
    return this.isDirty;
  }

  async init(ctx: OptionsContext): Promise<void> {
    this.ctx = ctx;

    this.textarea = document.getElementById('prompt-textarea') as HTMLTextAreaElement;
    this.charCountEl = document.getElementById('char-count');
    this.charCurrentEl = document.getElementById('char-current');
    this.saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
    this.resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;

    this.textarea?.addEventListener('input', () => {
      this.updateCharCount();
      this.setDirty(true);
      this.textarea?.classList.remove('error');
    });

    this.saveBtn?.addEventListener('click', () => this.save());
    this.resetBtn?.addEventListener('click', () => {
      this.ctx.showConfirmModal(
        'Reset to Default?',
        'This will replace your custom prompt with the original Wingman prompt. This action cannot be undone.',
        () => this.resetToDefault()
      );
    });

    await this.load();
  }

  /** Called externally by Cmd+S keyboard shortcut */
  save = async (): Promise<void> => {
    if (this.isLoading || !this.textarea) return;

    const prompt = this.textarea.value;
    const validation = this.validate(prompt);

    if (!validation.valid) {
      this.textarea.classList.add('error');
      this.ctx.showToast(validation.error || 'Invalid prompt', 'error');
      return;
    }

    this.textarea.classList.remove('error');
    this.setLoading(true);

    try {
      await chrome.storage.local.set({ systemPrompt: prompt.trim() });
      this.setDirty(false);
      this.ctx.showToast('Settings saved', 'success');
    } catch (error) {
      console.error('Failed to save prompt:', error);
      this.ctx.showToast('Failed to save settings', 'error');
    } finally {
      this.setLoading(false);
    }
  };

  private async load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['systemPrompt']);
      const prompt = result.systemPrompt || DEFAULT_SYSTEM_PROMPT;

      if (this.textarea) {
        this.textarea.value = prompt;
        this.updateCharCount();
      }
    } catch (error) {
      console.error('Failed to load prompt from storage:', error);
      if (this.textarea) {
        this.textarea.value = DEFAULT_SYSTEM_PROMPT;
        this.updateCharCount();
      }
      this.ctx.showToast('Failed to load saved prompt', 'error');
    }
  }

  private async resetToDefault(): Promise<void> {
    if (!this.textarea) return;

    this.textarea.value = DEFAULT_SYSTEM_PROMPT;
    this.updateCharCount();
    this.textarea.classList.remove('error');

    this.setLoading(true);

    try {
      await chrome.storage.local.set({ systemPrompt: DEFAULT_SYSTEM_PROMPT });
      this.setDirty(false);
      this.ctx.showToast('Reset to default', 'success');
    } catch (error) {
      console.error('Failed to save default prompt:', error);
      this.ctx.showToast('Failed to save settings', 'error');
    } finally {
      this.setLoading(false);
    }
  }

  private validate(text: string): ValidationResult {
    const trimmed = text.trim();

    if (!trimmed) {
      return { valid: false, error: 'Prompt cannot be empty' };
    }
    if (trimmed.length < MIN_PROMPT_LENGTH) {
      return {
        valid: false,
        error: `Prompt must be at least ${MIN_PROMPT_LENGTH} characters`,
      };
    }
    if (trimmed.length > MAX_PROMPT_LENGTH) {
      return {
        valid: false,
        error: `Prompt cannot exceed ${MAX_PROMPT_LENGTH.toLocaleString()} characters`,
      };
    }
    return { valid: true };
  }

  private updateCharCount(): void {
    if (!this.textarea || !this.charCountEl || !this.charCurrentEl) return;

    const length = this.textarea.value.length;
    this.charCurrentEl.textContent = length.toLocaleString();

    this.charCountEl.classList.remove('warning', 'error');

    if (length > MAX_PROMPT_LENGTH) {
      this.charCountEl.classList.add('error');
    } else if (length > MAX_PROMPT_LENGTH * WARNING_THRESHOLD) {
      this.charCountEl.classList.add('warning');
    }
  }

  private setLoading(loading: boolean): void {
    this.isLoading = loading;

    if (this.saveBtn) {
      this.saveBtn.disabled = loading;
      if (loading) {
        this.saveBtn.classList.add('loading');
        this.saveBtn.textContent = 'Saving...';
      } else {
        this.saveBtn.classList.remove('loading');
        this.saveBtn.textContent = 'Save Changes';
      }
    }

    if (this.resetBtn) {
      this.resetBtn.disabled = loading;
    }
  }

  private setDirty(dirty: boolean): void {
    this.isDirty = dirty;
  }
}
