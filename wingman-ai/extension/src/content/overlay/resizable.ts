/**
 * Resizable behavior for overlay panel
 *
 * Encapsulates mouse-based resize functionality.
 * Can be attached to any element with a resize handle.
 */

export interface ResizableOptions {
  /** Element that triggers resizing (e.g., corner handle) */
  handle: HTMLElement;

  /** Element that gets resized (e.g., panel) */
  target: HTMLElement;

  /** Minimum width in pixels */
  minWidth?: number;

  /** Maximum width in pixels (can be dynamic) */
  maxWidth?: number | (() => number);

  /** Minimum height in pixels */
  minHeight?: number;

  /** Maximum height in pixels (can be dynamic) */
  maxHeight?: number | (() => number);

  /** Called when resize ends with final dimensions */
  onResizeEnd?: (size: { width: number; height: number }) => void;

  /** If true, resizing is disabled */
  isDisabled?: () => boolean;
}

const DEFAULTS = {
  minWidth: 280,
  maxWidth: 600,
  minHeight: 200,
  maxHeight: () => window.innerHeight * 0.8,
};

/**
 * Makes an element resizable by its handle
 */
export class Resizable {
  private isResizing = false;
  private startX = 0;
  private startY = 0;
  private startWidth = 0;
  private startHeight = 0;

  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseUp: () => void;

  constructor(private options: ResizableOptions) {
    // Bind methods to preserve `this` context
    this.boundMouseDown = this.onMouseDown.bind(this);
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundMouseUp = this.onMouseUp.bind(this);

    this.attach();
  }

  /**
   * Attach event listeners
   */
  private attach(): void {
    this.options.handle.addEventListener('mousedown', this.boundMouseDown);
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
  }

  /**
   * Remove event listeners (call when cleaning up)
   */
  destroy(): void {
    this.options.handle.removeEventListener('mousedown', this.boundMouseDown);
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);
  }

  /**
   * Check if currently resizing
   */
  get resizing(): boolean {
    return this.isResizing;
  }

  private getMaxWidth(): number {
    const mw = this.options.maxWidth ?? DEFAULTS.maxWidth;
    return typeof mw === 'function' ? mw() : mw;
  }

  private getMaxHeight(): number {
    const mh = this.options.maxHeight ?? DEFAULTS.maxHeight;
    return typeof mh === 'function' ? mh() : mh;
  }

  private onMouseDown(e: MouseEvent): void {
    // Check if resizing is disabled
    if (this.options.isDisabled?.()) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    this.isResizing = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startWidth = this.options.target.offsetWidth;
    this.startHeight = this.options.target.offsetHeight;

    this.options.handle.style.cursor = 'nwse-resize';
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isResizing) {
      return;
    }

    const deltaX = e.clientX - this.startX;
    const deltaY = e.clientY - this.startY;

    const minW = this.options.minWidth ?? DEFAULTS.minWidth;
    const maxW = this.getMaxWidth();
    const minH = this.options.minHeight ?? DEFAULTS.minHeight;
    const maxH = this.getMaxHeight();

    const newWidth = Math.max(minW, Math.min(maxW, this.startWidth + deltaX));
    const newHeight = Math.max(minH, Math.min(maxH, this.startHeight + deltaY));

    this.options.target.style.width = `${newWidth}px`;
    this.options.target.style.height = `${newHeight}px`;
  }

  private onMouseUp(): void {
    if (!this.isResizing) {
      return;
    }

    this.isResizing = false;
    this.options.handle.style.cursor = 'nwse-resize';

    // Notify with final dimensions
    this.options.onResizeEnd?.({
      width: this.options.target.offsetWidth,
      height: this.options.target.offsetHeight,
    });
  }
}
