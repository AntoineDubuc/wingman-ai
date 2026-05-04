/**
 * Draggable behavior for overlay panel
 *
 * Encapsulates mouse-based drag-and-drop functionality.
 * Can be attached to any element with a handle.
 */

export interface DraggableOptions {
  /** Element that triggers dragging (e.g., header) */
  handle: HTMLElement;

  /** Element that moves when dragged (e.g., panel) */
  target: HTMLElement;

  /** Called when drag starts */
  onDragStart?: () => void;

  /** Called when drag ends with final position */
  onDragEnd?: (position: { left: number; top: number }) => void;

  /** If true, dragging is disabled */
  isDisabled?: () => boolean;
}

/**
 * Makes an element draggable by its handle
 */
export class Draggable {
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private startLeft = 0;
  private startTop = 0;

  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseUp: () => void;

  constructor(private options: DraggableOptions) {
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
   * Check if currently dragging
   */
  get dragging(): boolean {
    return this.isDragging;
  }

  private onMouseDown(e: MouseEvent): void {
    // Check if dragging is disabled
    if (this.options.isDisabled?.()) {
      return;
    }

    this.isDragging = true;
    this.startX = e.clientX;
    this.startY = e.clientY;

    const rect = this.options.target.getBoundingClientRect();
    this.startLeft = rect.left;
    this.startTop = rect.top;

    this.options.handle.style.cursor = 'grabbing';
    this.options.onDragStart?.();
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isDragging) {
      return;
    }

    const deltaX = e.clientX - this.startX;
    const deltaY = e.clientY - this.startY;

    const target = this.options.target;

    // Constrain to viewport
    const maxLeft = window.innerWidth - target.offsetWidth;
    const maxTop = window.innerHeight - target.offsetHeight;

    const newLeft = Math.max(0, Math.min(maxLeft, this.startLeft + deltaX));
    const newTop = Math.max(0, Math.min(maxTop, this.startTop + deltaY));

    target.style.left = `${newLeft}px`;
    target.style.top = `${newTop}px`;
    target.style.right = 'auto';
  }

  private onMouseUp(): void {
    if (!this.isDragging) {
      return;
    }

    this.isDragging = false;
    this.options.handle.style.cursor = 'grab';

    // Notify with final position
    const rect = this.options.target.getBoundingClientRect();
    this.options.onDragEnd?.({
      left: rect.left,
      top: rect.top,
    });
  }
}
