import type { OptionsContext } from './shared';
import { getActivePersona } from '../../shared/persona';

/**
 * SystemPromptSection — read-only display of the active persona's prompt.
 * Editing has moved to the Personas tab.
 */
export class SystemPromptSection {
  private textarea: HTMLTextAreaElement | null = null;
  private charCurrentEl: HTMLElement | null = null;

  get dirty(): boolean {
    return false; // No longer editable
  }

  async init(_ctx: OptionsContext): Promise<void> {
    this.textarea = document.getElementById('prompt-textarea') as HTMLTextAreaElement;
    this.charCurrentEl = document.getElementById('char-current');

    // Make textarea read-only
    if (this.textarea) {
      this.textarea.readOnly = true;
      this.textarea.style.opacity = '0.7';
      this.textarea.style.cursor = 'default';
    }

    // "Edit in Personas" buttons switch to the personas tab
    const gotoLink = document.getElementById('goto-personas-tab');
    const gotoBtn = document.getElementById('goto-personas-btn');
    const switchToPersonas = (e: Event) => {
      e.preventDefault();
      const personasTab = document.getElementById('tab-personas') as HTMLButtonElement | null;
      personasTab?.click();
    };
    gotoLink?.addEventListener('click', switchToPersonas);
    gotoBtn?.addEventListener('click', switchToPersonas);

    await this.load();

    // Listen for persona changes to refresh
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.activePersonaId || changes.personas) {
        this.load();
      }
    });
  }

  /** No-op — editing is in the Personas tab now */
  save = async (): Promise<void> => {};

  private async load(): Promise<void> {
    const persona = await getActivePersona();
    if (!persona) return;

    if (this.textarea) {
      this.textarea.value = persona.systemPrompt;
      this.updateCharCount();
    }
  }

  private updateCharCount(): void {
    if (!this.textarea || !this.charCurrentEl) return;
    const length = this.textarea.value.length;
    this.charCurrentEl.textContent = length.toLocaleString();
  }
}
