/**
 * TabManager handles tab navigation for the options page.
 * Manages click/keyboard handlers, animated indicator, panel visibility,
 * and persists the active tab to chrome.storage.local.
 */
export class TabManager {
  private tabs: HTMLButtonElement[] = [];
  private panels: HTMLElement[] = [];
  private indicator: HTMLElement | null = null;

  async init(): Promise<void> {
    this.tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-bar [role="tab"]'));
    this.panels = Array.from(document.querySelectorAll<HTMLElement>('.tab-panel[role="tabpanel"]'));
    this.indicator = document.querySelector('.tab-indicator');

    if (!this.tabs.length) return;

    // Click handlers
    for (const tab of this.tabs) {
      tab.addEventListener('click', () => this.activate(tab));
    }

    // Keyboard navigation (Arrow keys, Home, End)
    const tabBar = document.querySelector<HTMLElement>('.tab-bar');
    tabBar?.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // Reposition indicator on window resize
    window.addEventListener('resize', () => this.positionIndicator());

    // Restore persisted tab or default to first
    await this.restoreTab();
  }

  private activate(tab: HTMLButtonElement): void {
    const tabId = tab.dataset.tab;
    if (!tabId) return;

    // Update tab states
    for (const t of this.tabs) {
      const isActive = t === tab;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', String(isActive));
      t.tabIndex = isActive ? 0 : -1;
    }

    // Update panel visibility
    for (const panel of this.panels) {
      const isActive = panel.dataset.panel === tabId;
      panel.classList.toggle('active', isActive);
    }

    // Slide indicator
    this.positionIndicator();

    // Persist selection
    chrome.storage.local.set({ activeOptionsTab: tabId }).catch(() => {});
  }

  private positionIndicator(): void {
    if (!this.indicator) return;

    const activeTab = this.tabs.find((t) => t.classList.contains('active'));
    if (!activeTab) return;

    requestAnimationFrame(() => {
      this.indicator!.style.transform = `translateX(${activeTab.offsetLeft}px)`;
      this.indicator!.style.width = `${activeTab.offsetWidth}px`;
    });
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const currentIndex = this.tabs.findIndex((t) => t.classList.contains('active'));
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;

    switch (e.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % this.tabs.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + this.tabs.length) % this.tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = this.tabs.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    const nextTab = this.tabs[nextIndex];
    if (nextTab) {
      this.activate(nextTab);
      nextTab.focus();
    }
  }

  private async restoreTab(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['activeOptionsTab']);
      const savedTab = result.activeOptionsTab as string | undefined;
      if (savedTab) {
        const tab = this.tabs.find((t) => t.dataset.tab === savedTab);
        if (tab) {
          this.activate(tab);
          return;
        }
      }
    } catch {
      // Ignore storage errors
    }

    // Default: activate first tab
    const first = this.tabs[0];
    if (first) {
      this.activate(first);
    }
  }
}
