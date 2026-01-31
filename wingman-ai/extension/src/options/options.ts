/**
 * Options Page Controller
 *
 * Handles loading, editing, validating, and saving the custom system prompt
 * for the Wingman AI Chrome extension.
 */

import { DEFAULT_SYSTEM_PROMPT } from '../shared/default-prompt';
import { driveService } from '../services/drive-service';
import { kbDatabase, ingestDocument, isIngesting } from '../services/kb/kb-database';
import { searchKB } from '../services/kb/kb-search';

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

  // API Keys elements
  private deepgramApiKeyInput: HTMLInputElement | null = null;
  private geminiApiKeyInput: HTMLInputElement | null = null;
  private saveKeysBtn: HTMLButtonElement | null = null;
  private testKeysBtn: HTMLButtonElement | null = null;
  private apiStatusEl: HTMLElement | null = null;
  private visibilityToggleBtns: NodeListOf<HTMLButtonElement> | null = null;

  // Google Drive elements
  private driveAutosaveToggle: HTMLInputElement | null = null;
  private driveConnectBtn: HTMLButtonElement | null = null;
  private driveDisconnectBtn: HTMLButtonElement | null = null;
  private driveNotConnectedEl: HTMLElement | null = null;
  private driveConnectedEl: HTMLElement | null = null;
  private driveAccountEmailEl: HTMLElement | null = null;
  private driveFolderNameInput: HTMLInputElement | null = null;
  private transcriptFormatRadios: NodeListOf<HTMLInputElement> | null = null;

  // Knowledge Base elements
  private kbDropZone: HTMLElement | null = null;
  private kbFileInput: HTMLInputElement | null = null;
  private kbProgress: HTMLElement | null = null;
  private kbProgressFill: HTMLElement | null = null;
  private kbProgressText: HTMLElement | null = null;
  private kbDocList: HTMLElement | null = null;
  private kbEmpty: HTMLElement | null = null;
  private kbTestSection: HTMLElement | null = null;
  private kbTestInput: HTMLInputElement | null = null;
  private kbTestBtn: HTMLButtonElement | null = null;
  private kbTestResults: HTMLElement | null = null;
  private kbStats: HTMLElement | null = null;

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
    await this.loadApiKeys();
    await this.loadSpeakerFilter();
    await this.loadDriveSettings();
    await this.loadPrompt();
    await this.initKB();
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

    // API Keys elements
    this.deepgramApiKeyInput = document.getElementById('deepgram-api-key') as HTMLInputElement;
    this.geminiApiKeyInput = document.getElementById('gemini-api-key') as HTMLInputElement;
    this.saveKeysBtn = document.getElementById('save-keys-btn') as HTMLButtonElement;
    this.testKeysBtn = document.getElementById('test-keys-btn') as HTMLButtonElement;
    this.apiStatusEl = document.getElementById('api-status');
    this.visibilityToggleBtns = document.querySelectorAll('.toggle-visibility-btn') as NodeListOf<HTMLButtonElement>;

    // Knowledge Base elements
    this.kbDropZone = document.getElementById('kb-drop-zone');
    this.kbFileInput = document.getElementById('kb-file-input') as HTMLInputElement;
    this.kbProgress = document.getElementById('kb-progress');
    this.kbProgressFill = document.getElementById('kb-progress-fill');
    this.kbProgressText = document.getElementById('kb-progress-text');
    this.kbDocList = document.getElementById('kb-doc-list');
    this.kbEmpty = document.getElementById('kb-empty');
    this.kbTestSection = document.getElementById('kb-test-section');
    this.kbTestInput = document.getElementById('kb-test-input') as HTMLInputElement;
    this.kbTestBtn = document.getElementById('kb-test-btn') as HTMLButtonElement;
    this.kbTestResults = document.getElementById('kb-test-results');
    this.kbStats = document.getElementById('kb-stats');

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
        'This will replace your custom prompt with the original Wingman prompt. This action cannot be undone.',
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

    // API Keys event listeners
    this.saveKeysBtn?.addEventListener('click', () => {
      this.saveApiKeys();
    });

    this.testKeysBtn?.addEventListener('click', () => {
      this.testApiKeys();
    });

    this.visibilityToggleBtns?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        if (targetId) {
          this.toggleKeyVisibility(targetId);
        }
      });
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

    // Knowledge Base event listeners
    this.kbDropZone?.addEventListener('click', () => {
      this.kbFileInput?.click();
    });

    this.kbDropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.kbDropZone?.classList.add('drag-over');
    });

    this.kbDropZone?.addEventListener('dragleave', () => {
      this.kbDropZone?.classList.remove('drag-over', 'drag-invalid');
    });

    this.kbDropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      this.kbDropZone?.classList.remove('drag-over', 'drag-invalid');
      const files = (e as DragEvent).dataTransfer?.files;
      if (files) this.handleKBFiles(files);
    });

    this.kbFileInput?.addEventListener('change', () => {
      const files = this.kbFileInput?.files;
      if (files) this.handleKBFiles(files);
      if (this.kbFileInput) this.kbFileInput.value = '';
    });

    this.kbTestBtn?.addEventListener('click', () => {
      this.testKBQuery();
    });

    this.kbTestInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.testKBQuery();
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
   * Load API keys from storage
   */
  async loadApiKeys(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['deepgramApiKey', 'geminiApiKey']);

      if (this.deepgramApiKeyInput && result.deepgramApiKey) {
        this.deepgramApiKeyInput.value = result.deepgramApiKey;
      }

      if (this.geminiApiKeyInput && result.geminiApiKey) {
        this.geminiApiKeyInput.value = result.geminiApiKey;
      }

      this.updateApiKeyStatus();
    } catch (error) {
      console.error('Failed to load API keys:', error);
    }
  }

  /**
   * Save API keys to storage
   */
  async saveApiKeys(): Promise<void> {
    const deepgramKey = this.deepgramApiKeyInput?.value?.trim() || '';
    const geminiKey = this.geminiApiKeyInput?.value?.trim() || '';

    if (!deepgramKey && !geminiKey) {
      this.showToast('Please enter at least one API key', 'error');
      return;
    }

    try {
      await chrome.storage.local.set({
        deepgramApiKey: deepgramKey,
        geminiApiKey: geminiKey,
      });

      this.updateApiKeyStatus();
      this.showToast('API keys saved securely', 'success');
    } catch (error) {
      console.error('Failed to save API keys:', error);
      this.showToast('Failed to save API keys', 'error');
    }
  }

  /**
   * Test API keys by making validation requests
   */
  async testApiKeys(): Promise<void> {
    const deepgramKey = this.deepgramApiKeyInput?.value?.trim() || '';
    const geminiKey = this.geminiApiKeyInput?.value?.trim() || '';

    if (!deepgramKey && !geminiKey) {
      this.showToast('Please enter API keys first', 'error');
      return;
    }

    if (this.testKeysBtn) {
      this.testKeysBtn.disabled = true;
      this.testKeysBtn.textContent = 'Testing...';
    }

    const results: string[] = [];
    let hasError = false;

    // Test Deepgram key
    if (deepgramKey) {
      try {
        const response = await fetch('https://api.deepgram.com/v1/projects', {
          method: 'GET',
          headers: {
            Authorization: `Token ${deepgramKey}`,
          },
        });

        if (response.ok) {
          results.push('Deepgram: Valid');
        } else if (response.status === 401 || response.status === 403) {
          results.push('Deepgram: Invalid key');
          hasError = true;
        } else {
          results.push('Deepgram: Error');
          hasError = true;
        }
      } catch (error) {
        results.push('Deepgram: Network error');
        hasError = true;
      }
    }

    // Test Gemini key
    if (geminiKey) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`,
          { method: 'GET' }
        );

        if (response.ok) {
          results.push('Gemini: Valid');
        } else if (response.status === 400 || response.status === 401 || response.status === 403) {
          results.push('Gemini: Invalid key');
          hasError = true;
        } else {
          results.push('Gemini: Error');
          hasError = true;
        }
      } catch (error) {
        results.push('Gemini: Network error');
        hasError = true;
      }
    }

    // Show results
    this.showToast(results.join(' | '), hasError ? 'error' : 'success');

    if (this.testKeysBtn) {
      this.testKeysBtn.disabled = false;
      this.testKeysBtn.textContent = 'Test Keys';
    }
  }

  /**
   * Update the API key status indicator
   */
  private updateApiKeyStatus(): void {
    const deepgramKey = this.deepgramApiKeyInput?.value?.trim() || '';
    const geminiKey = this.geminiApiKeyInput?.value?.trim() || '';

    const statusDot = this.apiStatusEl?.querySelector('.status-dot');
    const statusText = this.apiStatusEl?.querySelector('.status-text');

    if (statusDot && statusText) {
      statusDot.classList.remove('status-unconfigured', 'status-configured', 'status-error');

      if (deepgramKey && geminiKey) {
        statusDot.classList.add('status-configured');
        statusText.textContent = 'Both keys configured';
      } else if (deepgramKey || geminiKey) {
        statusDot.classList.add('status-error');
        statusText.textContent = deepgramKey ? 'Missing Gemini key' : 'Missing Deepgram key';
      } else {
        statusDot.classList.add('status-unconfigured');
        statusText.textContent = 'Keys not configured';
      }
    }
  }

  /**
   * Toggle visibility of an API key input
   */
  private toggleKeyVisibility(inputId: string): void {
    const input = document.getElementById(inputId) as HTMLInputElement;
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
    }
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

      // Folder name (default: "Wingman Transcripts")
      if (this.driveFolderNameInput) {
        this.driveFolderNameInput.value = result.driveFolderName || 'Wingman Transcripts';
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
      const folderName = this.driveFolderNameInput?.value?.trim() || 'Wingman Transcripts';

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
   * Initiate Google Drive connection using Chrome Identity API
   */
  async connectGoogleDrive(): Promise<void> {
    if (this.driveConnectBtn) {
      this.driveConnectBtn.disabled = true;
      this.driveConnectBtn.textContent = 'Connecting...';
    }

    try {
      // Use Chrome Identity API - no backend needed
      const result = await driveService.connect();

      if (result.success && result.email) {
        this.updateDriveConnectionUI(true, result.email);
        this.showToast('Google Drive connected!', 'success');
      } else {
        this.showToast(result.error || 'Connection failed', 'error');
      }
    } catch (error) {
      console.error('Failed to connect Google Drive:', error);
      this.showToast('Failed to connect', 'error');
    } finally {
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
      await driveService.disconnect();
      this.updateDriveConnectionUI(false);
      this.showToast('Google Drive disconnected', 'success');
    } catch (error) {
      console.error('Failed to disconnect Google Drive:', error);
      this.showToast('Failed to disconnect', 'error');
    }
  }

  // =========================================================================
  // Knowledge Base
  // =========================================================================

  /**
   * Initialize KB: open database, cleanup incomplete docs, render list
   */
  async initKB(): Promise<void> {
    try {
      await kbDatabase.init();

      // Crash recovery: cleanup incomplete uploads
      const incomplete = await kbDatabase.getIncompleteDocuments();
      for (const doc of incomplete) {
        await kbDatabase.deleteDocument(doc.id);
        console.log(`[KB] Cleaned up incomplete: ${doc.filename}`);
      }
      if (incomplete.length > 0) {
        this.showToast(`Cleaned up ${incomplete.length} incomplete upload(s)`, 'success');
      }

      await this.renderKBDocList();
    } catch (error) {
      console.error('Failed to init KB:', error);
    }
  }

  /**
   * Handle files from drop or browse
   */
  async handleKBFiles(files: FileList): Promise<void> {
    if (isIngesting()) {
      this.showToast('Processing in progress. Please wait.', 'error');
      return;
    }

    for (const file of Array.from(files)) {
      await this.processKBFile(file);
    }
  }

  /**
   * Process a single KB file through ingestion pipeline
   */
  private async processKBFile(file: File): Promise<void> {
    // Show progress
    if (this.kbProgress) this.kbProgress.hidden = false;
    this.kbDropZone?.classList.add('disabled');

    const result = await ingestDocument(file, (_stage, percent) => {
      if (this.kbProgressFill) this.kbProgressFill.style.width = `${percent}%`;
      if (this.kbProgressText) this.kbProgressText.textContent = `Processing: ${file.name}...`;
    });

    // Hide progress
    if (this.kbProgress) this.kbProgress.hidden = true;
    if (this.kbProgressFill) this.kbProgressFill.style.width = '0%';
    this.kbDropZone?.classList.remove('disabled');

    if (result.success) {
      this.showToast(`${file.name} added (${result.chunkCount} sections)`, 'success');
    } else {
      this.showToast(result.error ?? 'Failed to process file', 'error');
    }

    await this.renderKBDocList();
  }

  /**
   * Render the KB document list
   */
  async renderKBDocList(): Promise<void> {
    const docs = await kbDatabase.getDocuments();
    const completeDocs = docs.filter((d) => d.status === 'complete');

    // Toggle empty state
    if (this.kbEmpty) {
      this.kbEmpty.style.display = completeDocs.length === 0 ? 'block' : 'none';
    }

    // Toggle test section
    if (this.kbTestSection) {
      this.kbTestSection.hidden = completeDocs.length === 0;
    }

    // Render list
    if (this.kbDocList) {
      this.kbDocList.innerHTML = '';
      for (const doc of completeDocs) {
        const item = document.createElement('div');
        item.className = 'kb-doc-item';
        item.dataset.id = doc.id;

        const ago = this.timeAgo(doc.uploadedAt);
        const size = this.formatFileSize(doc.fileSize);

        item.innerHTML = `
          <span class="kb-doc-icon">📄</span>
          <div class="kb-doc-info">
            <span class="kb-doc-name" title="${doc.filename}">${doc.filename}</span>
            <span class="kb-doc-meta">${doc.chunkCount} sections · ${size} · Added ${ago}</span>
          </div>
          <button class="kb-doc-delete" title="Delete">🗑️</button>
        `;

        const deleteBtn = item.querySelector('.kb-doc-delete') as HTMLButtonElement;
        deleteBtn.addEventListener('click', () => {
          this.showConfirmModal(
            'Delete document?',
            `Remove "${doc.filename}" from your knowledge base? This cannot be undone.`,
            () => this.deleteKBDocument(doc.id, doc.filename)
          );
        });

        this.kbDocList.appendChild(item);
      }
    }

    // Update stats
    await this.updateKBStats();
  }

  /**
   * Delete a KB document
   */
  async deleteKBDocument(docId: string, filename: string): Promise<void> {
    try {
      await kbDatabase.deleteDocument(docId);
      this.showToast(`Deleted ${filename}`, 'success');
      await this.renderKBDocList();
    } catch (error) {
      console.error('Failed to delete KB document:', error);
      this.showToast('Failed to delete document', 'error');
    }
  }

  /**
   * Update KB stats display
   */
  async updateKBStats(): Promise<void> {
    if (!this.kbStats) return;

    const stats = await kbDatabase.getStats();
    if (stats.docCount === 0) {
      this.kbStats.textContent = '';
      return;
    }

    const storageStr = this.formatFileSize(stats.storageUsed);
    this.kbStats.textContent = `${stats.docCount} document${stats.docCount !== 1 ? 's' : ''} · ${stats.chunkCount} sections · ${storageStr} used`;
  }

  /**
   * Test a KB query and show results
   */
  async testKBQuery(): Promise<void> {
    const query = this.kbTestInput?.value?.trim();
    if (!query) {
      this.showToast('Enter a test query', 'error');
      return;
    }

    if (this.kbTestBtn) {
      this.kbTestBtn.disabled = true;
      this.kbTestBtn.textContent = 'Searching...';
    }

    try {
      const results = await searchKB(query);

      if (this.kbTestResults) {
        if (results.length === 0) {
          this.kbTestResults.innerHTML = '<p class="kb-empty">No matching sections found. Try a different query.</p>';
        } else {
          this.kbTestResults.innerHTML = results
            .map(
              (r) => `
              <div class="kb-test-result">
                <div class="kb-test-result-source">📄 ${r.documentName}</div>
                <div class="kb-test-result-text">${r.chunk.text.slice(0, 300)}${r.chunk.text.length > 300 ? '...' : ''}</div>
              </div>
            `
            )
            .join('');
          this.kbTestResults.innerHTML += `<p class="kb-stats">This is what Wingman will use to answer similar questions.</p>`;
        }
      }
    } catch (error) {
      console.error('KB test query failed:', error);
      this.showToast('Test query failed. Check your API key.', 'error');
    } finally {
      if (this.kbTestBtn) {
        this.kbTestBtn.disabled = false;
        this.kbTestBtn.textContent = 'Test';
      }
    }
  }

  /**
   * Format bytes to human-readable size
   */
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Format timestamp to relative time
   */
  private timeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'yesterday';
    return `${days} days ago`;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const controller = new OptionsController();
  controller.init().catch((error) => {
    console.error('Failed to initialize options page:', error);
  });
});
