/**
 * Options Page Controller
 *
 * Handles loading, editing, validating, and saving the custom system prompt
 * for the Tammy AI Chrome extension.
 */

import { DEFAULT_SYSTEM_PROMPT } from '../shared/default-prompt';

// Constants
const MIN_PROMPT_LENGTH = 100;
const MAX_PROMPT_LENGTH = 10000;
const WARNING_THRESHOLD = 0.8; // 80% of max length
const TOAST_DURATION_MS = 3000;

// Validation result interface
interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Controller class for the options page functionality
 */
class OptionsController {
  // DOM Elements
  private textarea: HTMLTextAreaElement | null = null;
  private charCountEl: HTMLElement | null = null;
  private charCurrentEl: HTMLElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;
  private resetBtn: HTMLButtonElement | null = null;
  private toastEl: HTMLElement | null = null;
  private toastIconEl: HTMLElement | null = null;
  private toastMessageEl: HTMLElement | null = null;
  private modalOverlay: HTMLElement | null = null;
  private modalCancelBtn: HTMLButtonElement | null = null;
  private modalConfirmBtn: HTMLButtonElement | null = null;

  // State
  private isDirty = false;
  private isLoading = false;
  private toastTimeout: number | null = null;
  private modalConfirmCallback: (() => void) | null = null;

  /**
   * Initialize the options page controller
   */
  async init(): Promise<void> {
    this.cacheElements();
    this.attachEventListeners();
    await this.loadPrompt();
  }

  /**
   * Cache DOM element references
   */
  private cacheElements(): void {
    this.textarea = document.getElementById('prompt-textarea') as HTMLTextAreaElement;
    this.charCountEl = document.getElementById('char-count');
    this.charCurrentEl = document.getElementById('char-current');
    this.saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
    this.resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
    this.toastEl = document.getElementById('toast');
    this.toastIconEl = document.getElementById('toast-icon');
    this.toastMessageEl = document.getElementById('toast-message');
    this.modalOverlay = document.getElementById('modal-overlay');
    this.modalCancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
    this.modalConfirmBtn = document.getElementById('modal-confirm') as HTMLButtonElement;
  }

  /**
   * Attach all event listeners
   */
  private attachEventListeners(): void {
    // Textarea input event for character count and dirty state
    this.textarea?.addEventListener('input', () => {
      this.updateCharCount();
      this.setDirty(true);
      // Remove error state when user starts typing
      this.textarea?.classList.remove('error');
    });

    // Save button click
    this.saveBtn?.addEventListener('click', () => {
      this.savePrompt();
    });

    // Reset button click
    this.resetBtn?.addEventListener('click', () => {
      this.showConfirmModal(
        'Reset to Default?',
        'This will replace your custom prompt with the original Tammy prompt. This action cannot be undone.',
        () => this.resetToDefault()
      );
    });

    // Modal cancel button
    this.modalCancelBtn?.addEventListener('click', () => {
      this.hideModal();
    });

    // Modal confirm button
    this.modalConfirmBtn?.addEventListener('click', () => {
      if (this.modalConfirmCallback) {
        this.modalConfirmCallback();
      }
      this.hideModal();
    });

    // Modal backdrop click to close
    this.modalOverlay?.addEventListener('click', (e) => {
      if (e.target === this.modalOverlay) {
        this.hideModal();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl + S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        this.savePrompt();
      }

      // Escape to close modal
      if (e.key === 'Escape' && this.modalOverlay?.classList.contains('visible')) {
        this.hideModal();
      }
    });

    // Warn on page leave if dirty (optional enhancement)
    window.addEventListener('beforeunload', (e) => {
      if (this.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  /**
   * Load the system prompt from storage or use default
   */
  async loadPrompt(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['systemPrompt']);
      const prompt = result.systemPrompt || DEFAULT_SYSTEM_PROMPT;

      if (this.textarea) {
        this.textarea.value = prompt;
        this.updateCharCount();
      }
    } catch (error) {
      console.error('Failed to load prompt from storage:', error);
      // Fall back to default prompt
      if (this.textarea) {
        this.textarea.value = DEFAULT_SYSTEM_PROMPT;
        this.updateCharCount();
      }
      this.showToast('Failed to load saved prompt', 'error');
    }
  }

  /**
   * Save the current prompt to storage
   */
  async savePrompt(): Promise<void> {
    if (this.isLoading || !this.textarea) return;

    const prompt = this.textarea.value;
    const validation = this.validatePrompt(prompt);

    if (!validation.valid) {
      this.textarea.classList.add('error');
      this.showToast(validation.error || 'Invalid prompt', 'error');
      return;
    }

    // Remove error state if valid
    this.textarea.classList.remove('error');

    this.setLoading(true);

    try {
      await chrome.storage.local.set({ systemPrompt: prompt.trim() });
      this.setDirty(false);
      this.showToast('Settings saved', 'success');
    } catch (error) {
      console.error('Failed to save prompt:', error);
      this.showToast('Failed to save settings', 'error');
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Reset the prompt to the default value
   */
  async resetToDefault(): Promise<void> {
    if (!this.textarea) return;

    this.textarea.value = DEFAULT_SYSTEM_PROMPT;
    this.updateCharCount();
    this.textarea.classList.remove('error');

    // Auto-save the reset
    this.setLoading(true);

    try {
      await chrome.storage.local.set({ systemPrompt: DEFAULT_SYSTEM_PROMPT });
      this.setDirty(false);
      this.showToast('Reset to default', 'success');
    } catch (error) {
      console.error('Failed to save default prompt:', error);
      this.showToast('Failed to save settings', 'error');
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Validate the prompt text
   */
  validatePrompt(text: string): ValidationResult {
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

  /**
   * Update the character counter display
   */
  updateCharCount(): void {
    if (!this.textarea || !this.charCountEl || !this.charCurrentEl) return;

    const length = this.textarea.value.length;
    this.charCurrentEl.textContent = length.toLocaleString();

    // Remove existing state classes
    this.charCountEl.classList.remove('warning', 'error');

    // Apply state based on length
    if (length > MAX_PROMPT_LENGTH) {
      this.charCountEl.classList.add('error');
    } else if (length > MAX_PROMPT_LENGTH * WARNING_THRESHOLD) {
      this.charCountEl.classList.add('warning');
    }
  }

  /**
   * Show a toast notification
   */
  showToast(message: string, type: 'success' | 'error'): void {
    if (!this.toastEl || !this.toastIconEl || !this.toastMessageEl) return;

    // Clear any existing timeout
    if (this.toastTimeout !== null) {
      window.clearTimeout(this.toastTimeout);
    }

    // Set content
    this.toastMessageEl.textContent = message;
    this.toastIconEl.textContent = type === 'success' ? '\u2713' : '\u2715';

    // Set type class
    this.toastEl.classList.remove('success', 'error');
    this.toastEl.classList.add(type);

    // Show toast
    this.toastEl.classList.add('visible');

    // Auto-dismiss after duration
    this.toastTimeout = window.setTimeout(() => {
      this.toastEl?.classList.remove('visible');
      this.toastTimeout = null;
    }, TOAST_DURATION_MS);
  }

  /**
   * Show the confirmation modal
   */
  showConfirmModal(title: string, message: string, onConfirm: () => void): void {
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');

    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.textContent = message;

    this.modalConfirmCallback = onConfirm;
    this.modalOverlay?.classList.add('visible');

    // Focus the cancel button for better accessibility
    this.modalCancelBtn?.focus();
  }

  /**
   * Hide the confirmation modal
   */
  hideModal(): void {
    this.modalOverlay?.classList.remove('visible');
    this.modalConfirmCallback = null;
  }

  /**
   * Set the loading state
   */
  setLoading(loading: boolean): void {
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

  /**
   * Set the dirty state (unsaved changes)
   */
  setDirty(dirty: boolean): void {
    this.isDirty = dirty;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const controller = new OptionsController();
  controller.init().catch((error) => {
    console.error('Failed to initialize options page:', error);
  });
});
