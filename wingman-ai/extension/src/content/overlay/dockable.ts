/**
 * Dockable behavior for overlay panel
 *
 * Manages dock mode state (floating / dock-left / dock-right),
 * persists preferences to chrome.storage, syncs live changes
 * from the options page, and handles inline style cleanup
 * to avoid CSS specificity conflicts.
 *
 * Follows the same pattern as draggable.ts and resizable.ts.
 */

import type { DockMode } from '../../shared/constants';
import { STORAGE_KEYS, UI } from '../../shared/constants';
import { Resizable } from './resizable';
import { injectDockMargin, removeDockMargin } from './margin-injector';

// ─────────────────────────────────────────────────────────────────────────────
// Pure functions (exported for unit testing)
// ─────────────────────────────────────────────────────────────────────────────

const VALID_DOCK_MODES: ReadonlySet<string> = new Set(['floating', 'dock-left', 'dock-right']);

/**
 * Validate an unknown storage value into a DockMode.
 * Returns 'floating' for any invalid/missing value.
 */
export function parseDockMode(value: unknown): DockMode {
  if (typeof value === 'string' && VALID_DOCK_MODES.has(value)) {
    return value as DockMode;
  }
  return 'floating';
}

/**
 * Clamp a docked width to valid bounds, accounting for viewport width.
 * Ensures the panel never takes more than (viewportWidth - 200)px.
 */
export function clampDockedWidth(width: number, viewportWidth: number): number {
  if (!Number.isFinite(width) || width <= 0) {
    return UI.OVERLAY_DOCKED_DEFAULT_WIDTH;
  }
  const maxForViewport = Math.max(UI.OVERLAY_DOCKED_MIN_WIDTH, viewportWidth - 200);
  return Math.max(
    UI.OVERLAY_DOCKED_MIN_WIDTH,
    Math.min(UI.OVERLAY_DOCKED_MAX_WIDTH, Math.min(width, maxForViewport)),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DockableOptions
// ─────────────────────────────────────────────────────────────────────────────

export interface DockableOptions {
  /** The overlay panel element */
  panel: HTMLElement;

  /** Called when undocking to restore floating position from storage */
  onRestorePosition: () => void;

  /** Called when docking to revert side-by-side to single-panel */
  onLayoutModeReset: () => void;

  /** Called whenever dock mode changes */
  onDockChange?: (mode: DockMode) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dockable class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inline styles that must be cleared when docking.
 * These are set by Draggable, Resizable, restorePosition(), and setLayoutMode().
 * Inline styles beat [data-dock] attribute selectors in specificity.
 */
const INLINE_STYLES_TO_CLEAR = ['left', 'top', 'right', 'width', 'height', 'maxWidth'] as const;

export class Dockable {
  private mode: DockMode = 'floating';
  private dockedWidth: number = UI.OVERLAY_DOCKED_DEFAULT_WIDTH;
  private lastDockSide: 'dock-left' | 'dock-right' = 'dock-right';
  private dockResizable: Resizable | null = null;
  private dockResizeHandle: HTMLElement | null = null;
  private storageListener: ((changes: Record<string, chrome.storage.StorageChange>) => void) | null = null;

  constructor(private options: DockableOptions) {
    this.initStorageListener();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Apply initial dock mode from storage result.
   * Called from overlay's combined storage read (no separate async call).
   */
  applyInitialState(storedMode: unknown, storedWidth: unknown): void {
    this.mode = parseDockMode(storedMode);
    if (typeof storedWidth === 'number' && storedWidth > 0) {
      this.dockedWidth = clampDockedWidth(storedWidth, window.innerWidth);
    }
    if (this.mode !== 'floating') {
      this.lastDockSide = this.mode as 'dock-left' | 'dock-right';
      this.applyDockCSS();
    }
  }

  /**
   * Set dock mode. Handles style clearing, CSS application, and persistence.
   */
  setDockMode(mode: DockMode): void {
    const prev = this.mode;
    this.mode = mode;

    if (mode !== 'floating') {
      this.lastDockSide = mode as 'dock-left' | 'dock-right';
    }

    if (mode === 'floating') {
      this.removeDockCSS();
      // Restore floating position from storage
      this.options.onRestorePosition();
    } else {
      // Revert side-by-side layout before docking
      this.options.onLayoutModeReset();
      // Clear all conflicting inline styles
      this.clearInlineStyles();
      this.applyDockCSS();
    }

    this.persistDockMode();
    if (prev !== mode) {
      this.options.onDockChange?.(mode);
    }
  }

  /**
   * Toggle between floating and last-used dock side.
   */
  toggle(): void {
    if (this.mode === 'floating') {
      this.setDockMode(this.lastDockSide);
    } else {
      this.setDockMode('floating');
    }
  }

  /**
   * Check if currently docked (not floating).
   */
  isDocked(): boolean {
    return this.mode !== 'floating';
  }

  /**
   * Get current dock mode.
   */
  getMode(): DockMode {
    return this.mode;
  }

  /**
   * Get last used dock side (for toggle button tooltip).
   */
  getLastDockSide(): 'dock-left' | 'dock-right' {
    return this.lastDockSide;
  }

  /**
   * Get current docked width.
   */
  getDockedWidth(): number {
    return this.dockedWidth;
  }

  /**
   * Re-apply dock CSS and margin. Called by forceShow() after display:flex.
   */
  reapply(): void {
    if (this.isDocked()) {
      this.clearInlineStyles();
      this.applyDockCSS();
    }
  }

  /**
   * Clean up listeners, dock resize handle, and page margin.
   */
  destroy(): void {
    if (this.storageListener) {
      try {
        chrome.storage.onChanged.removeListener(this.storageListener);
      } catch {
        // Extension context invalidated
      }
      this.storageListener = null;
    }
    removeDockMargin();
    this.destroyDockResize();
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private clearInlineStyles(): void {
    const style = this.options.panel.style;
    for (const prop of INLINE_STYLES_TO_CLEAR) {
      style.removeProperty(prop === 'maxWidth' ? 'max-width' : prop);
    }
  }

  private applyDockCSS(): void {
    const side = this.mode === 'dock-left' ? 'left' : 'right';
    this.options.panel.dataset['dock'] = side;
    this.options.panel.style.width = `${this.dockedWidth}px`;
    injectDockMargin(side, this.dockedWidth);
    this.ensureDockResize();
  }

  private removeDockCSS(): void {
    delete this.options.panel.dataset['dock'];
    removeDockMargin();
    this.destroyDockResize();
  }

  private persistDockMode(): void {
    try {
      if (!chrome.runtime?.id) return;
      chrome.storage.local.set({
        [STORAGE_KEYS.OVERLAY_DOCK_MODE]: this.mode,
        [STORAGE_KEYS.OVERLAY_DOCKED_WIDTH]: this.dockedWidth,
      });
    } catch {
      // Extension context invalidated
    }
  }

  private persistDockedWidth(): void {
    try {
      if (!chrome.runtime?.id) return;
      chrome.storage.local.set({
        [STORAGE_KEYS.OVERLAY_DOCKED_WIDTH]: this.dockedWidth,
      });
    } catch {
      // Extension context invalidated
    }
  }

  /**
   * Listen for dock mode changes from the options page (live-sync).
   * Saves listener reference for cleanup in destroy().
   */
  private initStorageListener(): void {
    this.storageListener = (changes: Record<string, chrome.storage.StorageChange>) => {
      const dockChange = changes[STORAGE_KEYS.OVERLAY_DOCK_MODE];
      if (dockChange && dockChange.newValue !== undefined) {
        const newMode = parseDockMode(dockChange.newValue);
        if (newMode !== this.mode) {
          this.setDockMode(newMode);
        }
      }
    };
    try {
      chrome.storage.onChanged.addListener(this.storageListener);
    } catch {
      // Extension context invalidated
    }
  }

  // ── Dock resize handle ──────────────────────────────────────────────────

  private ensureDockResize(): void {
    if (this.dockResizeHandle) return;

    // Create the resize handle element
    this.dockResizeHandle = document.createElement('div');
    this.dockResizeHandle.className = 'dock-resize-handle';
    this.options.panel.appendChild(this.dockResizeHandle);

    // Determine which edge the handle sits on
    const edge = this.mode === 'dock-right' ? 'left' : 'right';

    this.dockResizable = new Resizable({
      handle: this.dockResizeHandle,
      target: this.options.panel,
      minWidth: UI.OVERLAY_DOCKED_MIN_WIDTH,
      maxWidth: () => Math.min(UI.OVERLAY_DOCKED_MAX_WIDTH, window.innerWidth - 200),
      widthOnly: true,
      edge,
      onResizeEnd: (size) => {
        this.dockedWidth = size.width;
        // Update margin to match new width
        const side = this.mode === 'dock-left' ? 'left' : 'right';
        injectDockMargin(side, this.dockedWidth);
        this.persistDockedWidth();
      },
    });
  }

  private destroyDockResize(): void {
    this.dockResizable?.destroy();
    this.dockResizable = null;
    if (this.dockResizeHandle) {
      this.dockResizeHandle.remove();
      this.dockResizeHandle = null;
    }
  }
}
