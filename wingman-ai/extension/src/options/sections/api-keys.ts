import type { OptionsContext } from './shared';
import {
  type LLMProvider,
  OPENROUTER_MODELS,
  OPENROUTER_API_BASE,
  GROQ_MODELS,
  GROQ_API_BASE,
} from '../../shared/llm-config';
import { HumeClient } from '../../services/hume-client';
import { writeCredentials } from '../../shared/credentials';

const OPENROUTER_ORIGIN = 'https://openrouter.ai/*';
const GROQ_ORIGIN = 'https://api.groq.com/*';

export class ApiKeysSection {
  private ctx!: OptionsContext;
  private deepgramInput: HTMLInputElement | null = null;
  private geminiInput: HTMLInputElement | null = null;
  private openrouterInput: HTMLInputElement | null = null;
  private modelSelect: HTMLSelectElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;
  private testBtn: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private groqInput: HTMLInputElement | null = null;
  private groqModelSelect: HTMLSelectElement | null = null;
  private geminiSection: HTMLElement | null = null;
  private openrouterSection: HTMLElement | null = null;
  private groqSection: HTMLElement | null = null;
  private provider: LLMProvider = 'gemini';

  // Hume AI fields
  private humeApiKeyInput: HTMLInputElement | null = null;
  private humeSecretKeyInput: HTMLInputElement | null = null;
  private humeTestBtn: HTMLButtonElement | null = null;
  private humeTestStatus: HTMLElement | null = null;

  async init(ctx: OptionsContext): Promise<void> {
    this.ctx = ctx;
    this.deepgramInput = document.getElementById('deepgram-api-key') as HTMLInputElement;
    this.geminiInput = document.getElementById('gemini-api-key') as HTMLInputElement;
    this.openrouterInput = document.getElementById('openrouter-api-key') as HTMLInputElement;
    this.modelSelect = document.getElementById('openrouter-model-select') as HTMLSelectElement;
    this.groqInput = document.getElementById('groq-api-key') as HTMLInputElement;
    this.groqModelSelect = document.getElementById('groq-model-select') as HTMLSelectElement;
    this.saveBtn = document.getElementById('save-keys-btn') as HTMLButtonElement;
    this.testBtn = document.getElementById('test-keys-btn') as HTMLButtonElement;
    this.statusEl = document.getElementById('api-status');
    this.geminiSection = document.getElementById('gemini-key-section');
    this.openrouterSection = document.getElementById('openrouter-section');
    this.groqSection = document.getElementById('groq-section');

    this.saveBtn?.addEventListener('click', () => this.save());
    this.testBtn?.addEventListener('click', () => this.test());

    // Hume AI fields
    this.humeApiKeyInput = document.getElementById('hume-api-key') as HTMLInputElement;
    this.humeSecretKeyInput = document.getElementById('hume-secret-key') as HTMLInputElement;
    this.humeTestBtn = document.getElementById('hume-test-btn') as HTMLButtonElement;
    this.humeTestStatus = document.getElementById('hume-test-status');

    this.humeTestBtn?.addEventListener('click', () => this.testHume());

    // Provider radio toggle
    const radios = document.querySelectorAll<HTMLInputElement>('input[name="llm-provider"]');
    radios.forEach((radio) => {
      radio.addEventListener('change', () => {
        this.provider = radio.value as LLMProvider;
        this.updateProviderUI();
        this.updateStatus();
      });
    });

    // Populate model dropdowns
    if (this.modelSelect) {
      for (const model of OPENROUTER_MODELS) {
        const opt = document.createElement('option');
        opt.value = model.id;
        opt.textContent = model.label;
        this.modelSelect.appendChild(opt);
      }
    }
    if (this.groqModelSelect) {
      for (const model of GROQ_MODELS) {
        const opt = document.createElement('option');
        opt.value = model.id;
        opt.textContent = model.label;
        this.groqModelSelect.appendChild(opt);
      }
    }

    // Visibility toggle buttons (works for all password fields including OpenRouter)
    const visibilityBtns = document.querySelectorAll('.toggle-visibility-btn') as NodeListOf<HTMLButtonElement>;
    visibilityBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        if (targetId) this.toggleVisibility(targetId);
      });
    });

    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([
        'deepgramApiKey',
        'geminiApiKey',
        'openrouterApiKey',
        'openrouterModel',
        'groqApiKey',
        'groqModel',
        'llmProvider',
        'humeApiKey',
        'humeSecretKey',
      ]);

      if (this.deepgramInput && result.deepgramApiKey) {
        this.deepgramInput.value = result.deepgramApiKey;
      }
      if (this.geminiInput && result.geminiApiKey) {
        this.geminiInput.value = result.geminiApiKey;
      }
      if (this.openrouterInput && result.openrouterApiKey) {
        this.openrouterInput.value = result.openrouterApiKey;
      }
      if (this.modelSelect && result.openrouterModel) {
        this.modelSelect.value = result.openrouterModel;
      }
      if (this.groqInput && result.groqApiKey) {
        this.groqInput.value = result.groqApiKey;
      }
      if (this.groqModelSelect && result.groqModel) {
        this.groqModelSelect.value = result.groqModel;
      }

      // Hume keys
      if (this.humeApiKeyInput && result.humeApiKey) {
        this.humeApiKeyInput.value = result.humeApiKey;
      }
      if (this.humeSecretKeyInput && result.humeSecretKey) {
        this.humeSecretKeyInput.value = result.humeSecretKey;
      }

      // Set provider radio
      this.provider = (result.llmProvider as LLMProvider) || 'gemini';
      const radio = document.querySelector<HTMLInputElement>(
        `input[name="llm-provider"][value="${this.provider}"]`
      );
      if (radio) radio.checked = true;

      this.updateProviderUI();
      this.updateStatus();
    } catch (error) {
      console.error('Failed to load API keys:', error);
    }
  }

  private updateProviderUI(): void {
    const isGemini = this.provider === 'gemini';
    if (this.geminiSection) {
      this.geminiSection.style.display = isGemini ? '' : 'none';
    }
    if (this.openrouterSection) {
      this.openrouterSection.style.display = this.provider === 'openrouter' ? '' : 'none';
    }
    if (this.groqSection) {
      this.groqSection.style.display = this.provider === 'groq' ? '' : 'none';
    }
    // Update Gemini hint — optional when not the active provider
    const geminiHint = document.getElementById('gemini-hint');
    if (geminiHint) {
      geminiHint.textContent = isGemini
        ? 'Used for AI-powered suggestions and responses'
        : 'Optional — only needed for Knowledge Base embeddings';
    }
  }

  private async ensureOpenRouterPermission(): Promise<boolean> {
    try {
      const has = await chrome.permissions.contains({ origins: [OPENROUTER_ORIGIN] });
      if (has) return true;

      const granted = await chrome.permissions.request({ origins: [OPENROUTER_ORIGIN] });
      if (!granted) {
        this.ctx.showToast(
          this.ctx.t?.('options.toasts.permission_required', { provider: 'OpenRouter' }) ?? 'Permission required to connect to OpenRouter',
          'error',
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error('Permission request failed:', error);
      this.ctx.showToast(
        this.ctx.t?.('options.toasts.permission_request_failed', { provider: 'OpenRouter' }) ?? 'Failed to request OpenRouter permission',
        'error',
      );
      return false;
    }
  }

  private async ensureGroqPermission(): Promise<boolean> {
    try {
      const has = await chrome.permissions.contains({ origins: [GROQ_ORIGIN] });
      if (has) return true;

      const granted = await chrome.permissions.request({ origins: [GROQ_ORIGIN] });
      if (!granted) {
        this.ctx.showToast(
          this.ctx.t?.('options.toasts.permission_required', { provider: 'Groq' }) ?? 'Permission required to connect to Groq',
          'error',
        );
        return false;
      }
      return true;
    } catch (error) {
      console.error('Permission request failed:', error);
      this.ctx.showToast(
        this.ctx.t?.('options.toasts.permission_request_failed', { provider: 'Groq' }) ?? 'Failed to request Groq permission',
        'error',
      );
      return false;
    }
  }

  private async save(): Promise<void> {
    const deepgramKey = this.deepgramInput?.value?.trim() || '';
    const geminiKey = this.geminiInput?.value?.trim() || '';
    const openrouterKey = this.openrouterInput?.value?.trim() || '';
    const openrouterModel = this.modelSelect?.value || '';
    const groqKey = this.groqInput?.value?.trim() || '';
    const groqModel = this.groqModelSelect?.value || '';
    const humeApiKey = this.humeApiKeyInput?.value?.trim() || '';
    const humeSecretKey = this.humeSecretKeyInput?.value?.trim() || '';

    const apiKeyRequired = (provider: string): string =>
      this.ctx.t?.('options.toasts.api_key_required', { provider }) ?? `${provider} API key is required`;

    if (!deepgramKey) {
      this.ctx.showToast(apiKeyRequired('Deepgram'), 'error');
      return;
    }

    if (this.provider === 'gemini' && !geminiKey) {
      this.ctx.showToast(apiKeyRequired('Gemini'), 'error');
      return;
    }

    if (this.provider === 'openrouter' && !openrouterKey) {
      this.ctx.showToast(apiKeyRequired('OpenRouter'), 'error');
      return;
    }

    if (this.provider === 'groq' && !groqKey) {
      this.ctx.showToast(apiKeyRequired('Groq'), 'error');
      return;
    }

    // Request host permission for OpenRouter/Groq if needed
    if (this.provider === 'openrouter') {
      const granted = await this.ensureOpenRouterPermission();
      if (!granted) return;
    }
    if (this.provider === 'groq') {
      const granted = await this.ensureGroqPermission();
      if (!granted) return;
    }

    try {
      // Credential keys go through the hardened writeCredentials path.
      // Non-credential settings (llmProvider, openrouterModel, groqModel)
      // still use direct chrome.storage.local.set — they're not in the
      // CREDENTIAL_KEYS allowlist.
      await writeCredentials({
        deepgramApiKey: deepgramKey,
        geminiApiKey: geminiKey,
        openrouterApiKey: openrouterKey,
        groqApiKey: groqKey,
        humeApiKey: humeApiKey,
        humeSecretKey: humeSecretKey,
      });
      await chrome.storage.local.set({
        openrouterModel: openrouterModel,
        groqModel: groqModel,
        llmProvider: this.provider,
      });
      this.updateStatus();
      this.ctx.showToast(
        this.ctx.t?.('options.toasts.settings_saved') ?? 'Settings saved',
        'success',
      );
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.ctx.showToast(
        this.ctx.t?.('options.toasts.settings_save_failed') ?? 'Failed to save settings',
        'error',
      );
    }
  }

  /**
   * @internal — only `SetupImportSection.handleFolderPicked()` is permitted
   * to call this outside the save() flow. Re-reads credentials from storage
   * and updates the DOM inputs. Used for in-place refresh after a setup-
   * folder import so the user sees the new values without a page reload.
   *
   * Threat model: TypeScript lacks module-level access control, so any file
   * in the options page bundle can call this. The `@internal` tag is a
   * convention signal, not an enforced boundary. Accepted risk: a future
   * refactor exposes the options page to content-script messaging and lets
   * a hostile page trigger refresh remotely. Mitigation: refresh is
   * idempotent — it only re-reads storage, worst case is a UI flicker.
   */
  async refresh(): Promise<void> {
    await this.load();
  }

  private async test(): Promise<void> {
    const deepgramKey = this.deepgramInput?.value?.trim() || '';

    if (this.testBtn) {
      this.testBtn.disabled = true;
      this.testBtn.textContent = 'Testing...';
    }

    const results: string[] = [];
    let hasError = false;

    // Always test Deepgram
    if (deepgramKey) {
      try {
        const response = await fetch('https://api.deepgram.com/v1/projects', {
          method: 'GET',
          headers: { Authorization: `Token ${deepgramKey}` },
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
      } catch {
        results.push('Deepgram: Network error');
        hasError = true;
      }
    }

    // Test the active provider's key
    if (this.provider === 'gemini') {
      const geminiKey = this.geminiInput?.value?.trim() || '';
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
        } catch {
          results.push('Gemini: Network error');
          hasError = true;
        }
      }
    } else if (this.provider === 'openrouter') {
      const openrouterKey = this.openrouterInput?.value?.trim() || '';
      if (openrouterKey) {
        const granted = await this.ensureOpenRouterPermission();
        if (!granted) {
          results.push('OpenRouter: Permission denied');
          hasError = true;
        } else {
          try {
            const response = await fetch(`${OPENROUTER_API_BASE}/models`, {
              method: 'GET',
              headers: { Authorization: `Bearer ${openrouterKey}` },
            });

            if (response.ok) {
              results.push('OpenRouter: Valid');
            } else if (response.status === 401 || response.status === 403) {
              results.push('OpenRouter: Invalid key');
              hasError = true;
            } else {
              results.push('OpenRouter: Error');
              hasError = true;
            }
          } catch {
            results.push('OpenRouter: Network error');
            hasError = true;
          }
        }
      }
    } else {
      // Groq
      const groqKey = this.groqInput?.value?.trim() || '';
      if (groqKey) {
        const granted = await this.ensureGroqPermission();
        if (!granted) {
          results.push('Groq: Permission denied');
          hasError = true;
        } else {
          try {
            const response = await fetch(`${GROQ_API_BASE}/models`, {
              method: 'GET',
              headers: { Authorization: `Bearer ${groqKey}` },
            });

            if (response.ok) {
              results.push('Groq: Valid');
            } else if (response.status === 401 || response.status === 403) {
              results.push('Groq: Invalid key');
              hasError = true;
            } else {
              results.push('Groq: Error');
              hasError = true;
            }
          } catch {
            results.push('Groq: Network error');
            hasError = true;
          }
        }
      }
    }

    if (results.length === 0) {
      this.ctx.showToast('Please enter API keys first', 'error');
    } else {
      this.ctx.showToast(results.join(' | '), hasError ? 'error' : 'success');
    }

    if (this.testBtn) {
      this.testBtn.disabled = false;
      this.testBtn.textContent = 'Test Keys';
    }
  }

  private updateStatus(): void {
    const deepgramKey = this.deepgramInput?.value?.trim() || '';
    const statusDot = this.statusEl?.querySelector('.status-dot');
    const statusText = this.statusEl?.querySelector('.status-text');

    if (!statusDot || !statusText) return;

    statusDot.classList.remove('status-unconfigured', 'status-configured', 'status-error');

    const providerKeyMap: Record<LLMProvider, string> = {
      gemini: this.geminiInput?.value?.trim() || '',
      openrouter: this.openrouterInput?.value?.trim() || '',
      groq: this.groqInput?.value?.trim() || '',
    };
    const providerLabelMap: Record<LLMProvider, string> = {
      gemini: 'Gemini',
      openrouter: 'OpenRouter',
      groq: 'Groq',
    };
    const providerKey = providerKeyMap[this.provider];
    const providerLabel = providerLabelMap[this.provider];

    if (deepgramKey && providerKey) {
      statusDot.classList.add('status-configured');
      statusText.textContent = 'All keys configured';
    } else if (deepgramKey) {
      statusDot.classList.add('status-error');
      statusText.textContent = `Missing ${providerLabel} key`;
    } else if (providerKey) {
      statusDot.classList.add('status-error');
      statusText.textContent = 'Missing Deepgram key';
    } else {
      statusDot.classList.add('status-unconfigured');
      statusText.textContent = 'Keys not configured';
    }
  }

  private toggleVisibility(inputId: string): void {
    const input = document.getElementById(inputId) as HTMLInputElement;
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
    }
  }

  private async testHume(): Promise<void> {
    const apiKey = this.humeApiKeyInput?.value?.trim() || '';
    const secretKey = this.humeSecretKeyInput?.value?.trim() || '';

    if (!apiKey || !secretKey) {
      this.updateHumeStatus('Enter both API Key and Secret Key', 'error');
      return;
    }

    if (this.humeTestBtn) {
      this.humeTestBtn.disabled = true;
      this.humeTestBtn.textContent = 'Testing...';
    }

    try {
      const result = await HumeClient.testCredentials(apiKey, secretKey);

      if (result.valid) {
        this.updateHumeStatus('✓ Valid', 'success');
      } else {
        this.updateHumeStatus(result.error || 'Invalid credentials', 'error');
      }
    } catch (error) {
      this.updateHumeStatus('Network error', 'error');
      console.error('Hume test error:', error);
    } finally {
      if (this.humeTestBtn) {
        this.humeTestBtn.disabled = false;
        this.humeTestBtn.textContent = 'Test Hume';
      }
    }
  }

  private updateHumeStatus(message: string, type: 'success' | 'error'): void {
    if (this.humeTestStatus) {
      this.humeTestStatus.textContent = message;
      this.humeTestStatus.className = `hume-test-status ${type}`;
    }
  }
}
