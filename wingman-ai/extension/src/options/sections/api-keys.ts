import type { OptionsContext } from './shared';
import {
  type LLMProvider,
  OPENROUTER_MODELS,
  OPENROUTER_API_BASE,
  GROQ_MODELS,
  GROQ_API_BASE,
} from '../../shared/llm-config';

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
        this.ctx.showToast('Permission required to connect to OpenRouter', 'error');
        return false;
      }
      return true;
    } catch (error) {
      console.error('Permission request failed:', error);
      this.ctx.showToast('Failed to request OpenRouter permission', 'error');
      return false;
    }
  }

  private async ensureGroqPermission(): Promise<boolean> {
    try {
      const has = await chrome.permissions.contains({ origins: [GROQ_ORIGIN] });
      if (has) return true;

      const granted = await chrome.permissions.request({ origins: [GROQ_ORIGIN] });
      if (!granted) {
        this.ctx.showToast('Permission required to connect to Groq', 'error');
        return false;
      }
      return true;
    } catch (error) {
      console.error('Permission request failed:', error);
      this.ctx.showToast('Failed to request Groq permission', 'error');
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

    if (!deepgramKey) {
      this.ctx.showToast('Deepgram API key is required', 'error');
      return;
    }

    if (this.provider === 'gemini' && !geminiKey) {
      this.ctx.showToast('Gemini API key is required', 'error');
      return;
    }

    if (this.provider === 'openrouter' && !openrouterKey) {
      this.ctx.showToast('OpenRouter API key is required', 'error');
      return;
    }

    if (this.provider === 'groq' && !groqKey) {
      this.ctx.showToast('Groq API key is required', 'error');
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
      await chrome.storage.local.set({
        deepgramApiKey: deepgramKey,
        geminiApiKey: geminiKey,
        openrouterApiKey: openrouterKey,
        openrouterModel: openrouterModel,
        groqApiKey: groqKey,
        groqModel: groqModel,
        llmProvider: this.provider,
      });
      this.updateStatus();
      this.ctx.showToast('Settings saved', 'success');
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.ctx.showToast('Failed to save settings', 'error');
    }
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
}
