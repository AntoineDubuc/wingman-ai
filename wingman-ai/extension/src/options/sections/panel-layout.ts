/**
 * Panel Layout Section — Call Settings tab
 *
 * Manages the "Panel Layout" dropdown (Floating / Sidebar Left / Sidebar Right).
 * Follows the ThemeSection pattern: init + load.
 */

import { STORAGE_KEYS } from '../../shared/constants';

export class PanelLayoutSection {
  private select: HTMLSelectElement | null = null;

  async init(): Promise<void> {
    this.select = document.getElementById('panel-layout-select') as HTMLSelectElement;
    this.select?.addEventListener('change', () => this.save());
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.OVERLAY_DOCK_MODE]);
      const mode = result[STORAGE_KEYS.OVERLAY_DOCK_MODE];
      if (this.select && typeof mode === 'string') {
        this.select.value = mode;
      }
    } catch {
      // Defaults to "floating" (first option)
    }
  }

  private async save(): Promise<void> {
    if (!this.select) return;
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.OVERLAY_DOCK_MODE]: this.select.value,
      });
    } catch (error) {
      console.error('Failed to save panel layout:', error);
    }
  }
}
