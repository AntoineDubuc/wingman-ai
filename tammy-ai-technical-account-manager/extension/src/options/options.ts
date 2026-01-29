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
  private themeToggle: HTMLButtonElement | null = null;
  private speakerFilterToggle: HTMLInputElement | null = null;

  // Google Drive elements
  private driveAutosaveToggle: HTMLInputElement | null = null;
  private driveConnectBtn: HTMLButtonElement | null = null;
  private driveDisconnectBtn: HTMLButtonElement | null = null;
  private driveNotConnectedEl: HTMLElement | null = null;
  private driveConnectedEl: HTMLElement | null = null;
  private driveAccountEmailEl: HTMLElement | null = null;
  private driveFolderNameInput: HTMLInputElement | null = null;
  private transcriptFormatRadios: NodeListOf<HTMLInputElement> | null = null;

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
    await this.loadTheme();
    await this.loadSpeakerFilter();
    await this.loadDriveSettings();
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
    this.themeToggle = document.getElementById('theme-toggle') as HTMLButtonElement;
    this.speakerFilterToggle = document.getElementById('speaker-filter-toggle') as HTMLInputElement;

    // Google Drive elements
    this.driveAutosaveToggle = document.getElementById('drive-autosave-toggle') as HTMLInputElement;
    this.driveConnectBtn = document.getElementById('drive-connect-btn') as HTMLButtonElement;
    this.driveDisconnectBtn = document.getElementById('drive-disconnect-btn') as HTMLButtonElement;
    this.driveNotConnectedEl = document.getElementById('drive-not-connected');
    this.driveConnectedEl = document.getElementById('drive-connected');
    this.driveAccountEmailEl = document.getElementById('drive-account-email');
    this.driveFolderNameInput = document.getElementById('drive-folder-name') as HTMLInputElement;
    this.transcriptFormatRadios = document.querySelectorAll('input[name="transcript-format"]') as NodeListOf<HTMLInputElement>;
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

    // Theme toggle click
    this.themeToggle?.addEventListener('click', () => {
      this.toggleTheme();
    });

    // Speaker filter toggle change
    this.speakerFilterToggle?.addEventListener('change', () => {
      this.saveSpeakerFilter();
    });

    // Google Drive event listeners
    this.driveAutosaveToggle?.addEventListener('change', () => {
      this.saveDriveSettings();
    });

    this.driveConnectBtn?.addEventListener('click', () => {
      this.connectGoogleDrive();
    });

    this.driveDisconnectBtn?.addEventListener('click', () => {
      this.showConfirmModal(
        'Disconnect Google Drive?',
        'Transcripts will no longer be automatically saved. You can reconnect at any time.',
        () => this.disconnectGoogleDrive()
      );
    });

    this.driveFolderNameInput?.addEventListener('change', () => {
      this.saveDriveSettings();
    });

    this.transcriptFormatRadios?.forEach((radio) => {
      radio.addEventListener('change', () => {
        this.saveDriveSettings();
      });
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

  /**
   * Load speaker filter setting from storage
   */
  async loadSpeakerFilter(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['speakerFilterEnabled']);
      if (this.speakerFilterToggle) {
        this.speakerFilterToggle.checked = result.speakerFilterEnabled ?? false;
      }
    } catch (error) {
      console.error('Failed to load speaker filter setting:', error);
    }
  }

  /**
   * Save speaker filter setting to storage
   */
  async saveSpeakerFilter(): Promise<void> {
    if (!this.speakerFilterToggle) return;

    try {
      const enabled = this.speakerFilterToggle.checked;
      await chrome.storage.local.set({ speakerFilterEnabled: enabled });
      this.showToast(
        enabled ? 'Speaker filter enabled' : 'Speaker filter disabled',
        'success'
      );
    } catch (error) {
      console.error('Failed to save speaker filter setting:', error);
      this.showToast('Failed to save setting', 'error');
    }
  }

  /**
   * Load theme preference from storage
   */
  async loadTheme(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['theme']);
      if (result.theme) {
        document.documentElement.setAttribute('data-theme', result.theme);
      }
      // If no stored preference, let CSS handle system preference detection
    } catch (error) {
      console.error('Failed to load theme:', error);
    }
  }

  /**
   * Toggle between light and dark themes
   */
  async toggleTheme(): Promise<void> {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Determine the new theme
    let newTheme: string;
    if (currentTheme === 'dark') {
      newTheme = 'light';
    } else if (currentTheme === 'light') {
      newTheme = 'dark';
    } else {
      // No explicit theme set, toggle from system preference
      newTheme = prefersDark ? 'light' : 'dark';
    }

    // Apply the theme
    document.documentElement.setAttribute('data-theme', newTheme);

    // Save preference
    try {
      await chrome.storage.local.set({ theme: newTheme });
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  }

  /**
   * Load Google Drive settings from storage
   */
  async loadDriveSettings(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([
        'driveAutosaveEnabled',
        'driveConnected',
        'driveAccountEmail',
        'driveFolderName',
        'transcriptFormat',
      ]);

      // Auto-save toggle (default: true)
      if (this.driveAutosaveToggle) {
        this.driveAutosaveToggle.checked = result.driveAutosaveEnabled ?? true;
      }

      // Folder name (default: "Tammy Transcripts")
      if (this.driveFolderNameInput) {
        this.driveFolderNameInput.value = result.driveFolderName || 'Tammy Transcripts';
      }

      // Transcript format (default: markdown)
      const format = result.transcriptFormat || 'markdown';
      this.transcriptFormatRadios?.forEach((radio) => {
        radio.checked = radio.value === format;
      });

      // Connection status
      this.updateDriveConnectionUI(
        result.driveConnected ?? false,
        result.driveAccountEmail
      );
    } catch (error) {
      console.error('Failed to load Drive settings:', error);
    }
  }

  /**
   * Save Google Drive settings to storage
   */
  async saveDriveSettings(): Promise<void> {
    try {
      const autosaveEnabled = this.driveAutosaveToggle?.checked ?? true;
      const folderName = this.driveFolderNameInput?.value?.trim() || 'Tammy Transcripts';

      // Get selected format
      let transcriptFormat = 'markdown';
      this.transcriptFormatRadios?.forEach((radio) => {
        if (radio.checked) {
          transcriptFormat = radio.value;
        }
      });

      await chrome.storage.local.set({
        driveAutosaveEnabled: autosaveEnabled,
        driveFolderName: folderName,
        transcriptFormat: transcriptFormat,
      });

      this.showToast('Drive settings saved', 'success');
    } catch (error) {
      console.error('Failed to save Drive settings:', error);
      this.showToast('Failed to save settings', 'error');
    }
  }

  /**
   * Update the Drive connection UI based on connection state
   */
  private updateDriveConnectionUI(connected: boolean, email?: string): void {
    if (connected && email) {
      // Show connected state
      if (this.driveNotConnectedEl) {
        this.driveNotConnectedEl.style.display = 'none';
      }
      if (this.driveConnectedEl) {
        this.driveConnectedEl.style.display = 'flex';
      }
      if (this.driveAccountEmailEl) {
        this.driveAccountEmailEl.textContent = `Connected as ${email}`;
      }
    } else {
      // Show not connected state
      if (this.driveNotConnectedEl) {
        this.driveNotConnectedEl.style.display = 'flex';
      }
      if (this.driveConnectedEl) {
        this.driveConnectedEl.style.display = 'none';
      }
    }
  }

  /**
   * Initiate Google Drive OAuth connection
   */
  async connectGoogleDrive(): Promise<void> {
    if (this.driveConnectBtn) {
      this.driveConnectBtn.disabled = true;
      this.driveConnectBtn.textContent = 'Connecting...';
    }

    try {
      // Get backend URL from storage
      const storage = await chrome.storage.local.get(['backendUrl']);
      const backendUrl = storage.backendUrl || 'http://localhost:8000';

      // Open OAuth flow in new tab
      // Backend will handle OAuth and redirect back
      const authUrl = `${backendUrl.replace('ws://', 'http://').replace('/ws/session', '')}/auth/google/login`;

      // Open in popup window for better UX
      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const authWindow = window.open(
        authUrl,
        'google-auth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // Poll for completion
      const pollInterval = setInterval(async () => {
        try {
          // Check if window was closed
          if (authWindow?.closed) {
            clearInterval(pollInterval);

            // Check if we got connected
            const result = await chrome.storage.local.get(['driveConnected', 'driveAccountEmail']);
            if (result.driveConnected) {
              this.updateDriveConnectionUI(true, result.driveAccountEmail);
              this.showToast('Google Drive connected!', 'success');
            } else {
              this.showToast('Connection cancelled', 'error');
            }

            // Reset button
            if (this.driveConnectBtn) {
              this.driveConnectBtn.disabled = false;
              this.driveConnectBtn.innerHTML = '<span class="drive-icon">📁</span> Connect Google Account';
            }
          }
        } catch (e) {
          // Window might be cross-origin, ignore
        }
      }, 500);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (this.driveConnectBtn) {
          this.driveConnectBtn.disabled = false;
          this.driveConnectBtn.innerHTML = '<span class="drive-icon">📁</span> Connect Google Account';
        }
      }, 300000);
    } catch (error) {
      console.error('Failed to connect Google Drive:', error);
      this.showToast('Failed to connect', 'error');

      if (this.driveConnectBtn) {
        this.driveConnectBtn.disabled = false;
        this.driveConnectBtn.innerHTML = '<span class="drive-icon">📁</span> Connect Google Account';
      }
    }
  }

  /**
   * Disconnect Google Drive
   */
  async disconnectGoogleDrive(): Promise<void> {
    try {
      await chrome.storage.local.set({
        driveConnected: false,
        driveAccountEmail: null,
        driveAccessToken: null,
        driveRefreshToken: null,
      });

      this.updateDriveConnectionUI(false);
      this.showToast('Google Drive disconnected', 'success');
    } catch (error) {
      console.error('Failed to disconnect Google Drive:', error);
      this.showToast('Failed to disconnect', 'error');
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const controller = new OptionsController();
  controller.init().catch((error) => {
    console.error('Failed to initialize options page:', error);
  });
});
