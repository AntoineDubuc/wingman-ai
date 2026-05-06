const TOAST_DURATION_MS = 3000;

export interface OptionsContext {
  showToast(message: string, type: 'success' | 'error'): void;
  showConfirmModal(title: string, message: string, onConfirm: () => void): void;
  /**
   * Plan 10 / Plan 5: localized translation function for section-level
   * toast and modal text. Sections receive this from OptionsController.init().
   * Optional for backward compat with sections not yet refactored — those
   * sections will still pass English literals to showToast and they'll
   * render verbatim until they migrate to ctx.t().
   */
  t?: (key: string, opts?: Record<string, unknown>) => string;
  /**
   * Show a confirm modal with a pre-built DOM node body (for rich content).
   * Unlike `showConfirmModal`, which uses `textContent = message`, this
   * method uses `appendChild(bodyNode)` so the caller can build element
   * structures (lists, sections) programmatically WITHOUT using innerHTML.
   *
   * The caller is responsible for building `bodyNode` via `createElement`
   * + `textContent` — NEVER via innerHTML or template-literal HTML.
   *
   * Used by the setup-folder-import preview modal.
   */
  showConfirmModalNode(title: string, bodyNode: HTMLElement, onConfirm: () => void): void;
}

export class ToastManager {
  private el: HTMLElement | null;
  private iconEl: HTMLElement | null;
  private messageEl: HTMLElement | null;
  private timeout: number | null = null;

  constructor() {
    this.el = document.getElementById('toast');
    this.iconEl = document.getElementById('toast-icon');
    this.messageEl = document.getElementById('toast-message');
  }

  show = (message: string, type: 'success' | 'error'): void => {
    if (!this.el || !this.iconEl || !this.messageEl) return;

    if (this.timeout !== null) {
      window.clearTimeout(this.timeout);
    }

    this.messageEl.textContent = message;
    this.iconEl.textContent = type === 'success' ? '\u2713' : '\u2715';

    this.el.classList.remove('success', 'error');
    this.el.classList.add(type);
    this.el.classList.add('visible');

    this.timeout = window.setTimeout(() => {
      this.el?.classList.remove('visible');
      this.timeout = null;
    }, TOAST_DURATION_MS);
  };
}

export class ModalManager {
  private overlay: HTMLElement | null;
  private cancelBtn: HTMLButtonElement | null;
  private confirmBtn: HTMLButtonElement | null;
  private callback: (() => void) | null = null;

  constructor() {
    this.overlay = document.getElementById('modal-overlay');
    this.cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
    this.confirmBtn = document.getElementById('modal-confirm') as HTMLButtonElement;

    this.cancelBtn?.addEventListener('click', () => this.hide());
    this.confirmBtn?.addEventListener('click', () => {
      if (this.callback) this.callback();
      this.hide();
    });
    this.overlay?.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlay?.classList.contains('visible')) {
        this.hide();
      }
    });
  }

  show = (title: string, message: string, onConfirm: () => void): void => {
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.textContent = message;

    this.callback = onConfirm;
    this.overlay?.classList.add('visible');
    this.cancelBtn?.focus();
  };

  /**
   * Shows the modal with a pre-built DOM body node instead of a plain string.
   * The body node is built by the caller via `document.createElement` +
   * `textContent` — NEVER via innerHTML. This method uses `appendChild`.
   *
   * See OptionsContext.showConfirmModalNode for rationale.
   */
  showNode = (title: string, bodyNode: HTMLElement, onConfirm: () => void): void => {
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) {
      // Clear existing content via textContent (not innerHTML) then append.
      modalBody.textContent = '';
      modalBody.appendChild(bodyNode);
    }

    this.callback = onConfirm;
    this.overlay?.classList.add('visible');
    this.cancelBtn?.focus();
  };

  private hide(): void {
    this.overlay?.classList.remove('visible');
    this.callback = null;
  }
}
