const TOAST_DURATION_MS = 3000;

export interface OptionsContext {
  showToast(message: string, type: 'success' | 'error'): void;
  showConfirmModal(title: string, message: string, onConfirm: () => void): void;
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

  private hide(): void {
    this.overlay?.classList.remove('visible');
    this.callback = null;
  }
}
