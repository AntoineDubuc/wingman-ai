/**
 * Panel Layout Section — Call Settings tab
 *
 * Manages the "Panel Layout" dropdown (Floating / Sidebar Left / Sidebar Right)
 * and the "Display Mode" dropdown (Full / Suggestions only).
 */

import { STORAGE_KEYS } from '../../shared/constants';

export class PanelLayoutSection {
  private layoutSelect: HTMLSelectElement | null = null;
  private displayModeSelect: HTMLSelectElement | null = null;

  async init(): Promise<void> {
    this.layoutSelect = document.getElementById('panel-layout-select') as HTMLSelectElement;
    this.displayModeSelect = document.getElementById('display-mode-select') as HTMLSelectElement;

    this.layoutSelect?.addEventListener('change', () => this.saveLayout());
    this.displayModeSelect?.addEventListener('change', () => this.saveDisplayMode());

    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEYS.OVERLAY_DOCK_MODE,
        STORAGE_KEYS.OVERLAY_DISPLAY_MODE,
      ]);
      const dockMode = result[STORAGE_KEYS.OVERLAY_DOCK_MODE];
      if (this.layoutSelect && typeof dockMode === 'string') {
        this.layoutSelect.value = dockMode;
      }
      const displayMode = result[STORAGE_KEYS.OVERLAY_DISPLAY_MODE];
      if (this.displayModeSelect && typeof displayMode === 'string') {
        this.displayModeSelect.value = displayMode;
      }
    } catch {
      // Defaults to first option in each select
    }
  }

  private async saveLayout(): Promise<void> {
    if (!this.layoutSelect) return;
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.OVERLAY_DOCK_MODE]: this.layoutSelect.value,
      });
    } catch (error) {
      console.error('Failed to save panel layout:', error);
    }
  }

  private async saveDisplayMode(): Promise<void> {
    if (!this.displayModeSelect) return;
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.OVERLAY_DISPLAY_MODE]: this.displayModeSelect.value,
      });
    } catch (error) {
      console.error('Failed to save display mode:', error);
    }
  }
}
