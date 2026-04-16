/**
 * AssistantView — the Assistant tab UI inside the overlay Shadow DOM.
 *
 * Mounts into `.assistant-view-mount` created by Plan 2. Renders:
 * - Context bar (Transcript / Personas / Web Search toggles)
 * - Persona dropdown (Task 2)
 * - Chat empty state / messages (Task 3+)
 * - Chat input (Task 6)
 *
 * All state lives here — nothing bleeds into overlay.ts.
 *
 * Plan 3 of 5 — In-Meeting Assistant.
 */

import { getActivePersonas } from '../../shared/persona';
import type { Persona } from '../../shared/persona';

/** Shape returned by getContextState(). */
export interface ContextState {
  transcript: boolean;
  personaIds: string[];
  web: boolean;
}

export class AssistantView {
  private mounted = false;
  private container: HTMLElement | null = null;
  private root: HTMLElement | null = null;

  // Context bar state
  private transcriptActive = true;
  private webActive = false;
  private personas: Persona[] = [];
  private personaLoadFailed = false;

  /**
   * Mount the AssistantView into the given container element.
   * Throws if already mounted (call unmount first).
   */
  async mount(container: HTMLElement): Promise<void> {
    if (this.mounted) {
      throw new Error('AssistantView already mounted');
    }

    this.mounted = true;
    this.container = container;

    // Load personas (async — handle rejection)
    try {
      this.personas = await getActivePersonas();
    } catch (err) {
      console.error('[AssistantView] getActivePersonas failed', err);
      this.personas = [];
      this.personaLoadFailed = true;
    }

    // Build the root
    this.root = document.createElement('div');
    this.root.className = 'assistant-view';

    // Context bar
    const contextBar = this.buildContextBar();
    this.root.appendChild(contextBar);

    container.appendChild(this.root);
  }

  /**
   * Unmount the view — removes DOM and resets state.
   */
  unmount(): void {
    if (this.root && this.container) {
      this.container.removeChild(this.root);
    }
    this.root = null;
    this.container = null;
    this.mounted = false;
  }

  /**
   * Returns current context toggle state.
   */
  getContextState(): ContextState {
    return {
      transcript: this.transcriptActive,
      personaIds: this.personas.map(p => p.id),
      web: this.webActive,
    };
  }

  // ── Private: Context Bar ──

  private buildContextBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'context-bar';

    // 1. Transcript toggle (default active)
    const transcriptToggle = this.createContextToggle('transcript', 'Transcript', this.transcriptActive);
    transcriptToggle.addEventListener('click', () => {
      this.transcriptActive = !this.transcriptActive;
      transcriptToggle.classList.toggle('active', this.transcriptActive);
    });

    // 2. Separator
    const sep1 = document.createElement('div');
    sep1.className = 'context-separator';

    // 3. Personas expand button
    const personaBtn = document.createElement('div');
    personaBtn.className = 'persona-expand-btn';
    if (this.personas.length > 0) {
      personaBtn.classList.add('has-active');
    }

    const countText = this.personaLoadFailed ? '(?)' : `(${this.personas.length})`;
    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.textContent = '\u25BE'; // down-pointing small triangle

    const btnText = document.createElement('span');
    btnText.textContent = `Personas ${countText}`;

    personaBtn.appendChild(btnText);
    personaBtn.appendChild(chevron);

    personaBtn.addEventListener('click', () => {
      console.debug('[AssistantView] persona chip click — Task 2 pending');
    });

    // 4. Separator
    const sep2 = document.createElement('div');
    sep2.className = 'context-separator';

    // 5. Web Search toggle (default inactive)
    const webToggle = this.createContextToggle('web', 'Web Search', this.webActive);
    webToggle.addEventListener('click', () => {
      this.webActive = !this.webActive;
      webToggle.classList.toggle('active', this.webActive);
    });

    bar.appendChild(transcriptToggle);
    bar.appendChild(sep1);
    bar.appendChild(personaBtn);
    bar.appendChild(sep2);
    bar.appendChild(webToggle);

    return bar;
  }

  private createContextToggle(ctx: string, label: string, active: boolean): HTMLElement {
    const toggle = document.createElement('div');
    toggle.className = 'context-toggle';
    if (active) toggle.classList.add('active');
    toggle.dataset.ctx = ctx;

    const dot = document.createElement('span');
    dot.className = 'ctx-dot';

    const text = document.createElement('span');
    text.textContent = label;

    toggle.appendChild(dot);
    toggle.appendChild(text);

    return toggle;
  }
}
