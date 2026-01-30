/**
 * AI Overlay Component
 *
 * Floating panel that displays AI suggestions during Google Meet calls.
 * Uses Shadow DOM for style isolation from Google Meet's styles.
 */

export interface Suggestion {
  type: 'answer' | 'objection' | 'info';
  question?: string;
  text: string;
  confidence?: number;
  timestamp: number;
}

export interface Transcript {
  text: string;
  speaker: string;
  is_final: boolean;
}

export class AIOverlay {
  public container: HTMLDivElement;
  private shadow: ShadowRoot;
  private panel: HTMLDivElement;
  private isMinimized = false;
  private isDragging = false;
  private onCloseCallback?: () => void;
  private fontSize = 13; // Base font size in px
  private readonly MIN_FONT_SIZE = 10;
  private readonly MAX_FONT_SIZE = 20;

  constructor(onClose?: () => void) {
    this.onCloseCallback = onClose;
    this.container = document.createElement('div');
    this.container.id = 'presales-ai-overlay-container';
    this.shadow = this.container.attachShadow({ mode: 'closed' });

    this.loadStyles();
    this.panel = this.createOverlayStructure();
    this.shadow.appendChild(this.panel);

    this.initDrag();
    this.initResize();
    this.restorePosition();
    this.loadTheme();
  }

  /**
   * Load theme preference and apply dark mode if needed
   */
  private loadTheme(): void {
    try {
      chrome.storage.local.get(['theme'], (result) => {
        if (result.theme === 'dark') {
          this.container.classList.add('dark');
        } else if (result.theme === 'light') {
          this.container.classList.remove('dark');
        } else {
          // Auto-detect from system preference
          if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            this.container.classList.add('dark');
          }
        }
      });

      // Listen for theme changes
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.theme) {
          if (changes.theme.newValue === 'dark') {
            this.container.classList.add('dark');
          } else {
            this.container.classList.remove('dark');
          }
        }
      });
    } catch {
      // Extension context may be invalid
    }
  }

  /**
   * Load styles into shadow DOM
   */
  private loadStyles(): void {
    const styles = document.createElement('style');
    styles.textContent = `
      :host {
        all: initial;
        position: fixed;
        z-index: 999999;
        font-family: 'Google Sans', Roboto, -apple-system, sans-serif;
        --overlay-bg: #ffffff;
        --overlay-bg-secondary: #f8f9fa;
        --overlay-bg-tertiary: #f1f3f4;
        --overlay-text: #202124;
        --overlay-text-secondary: #5f6368;
        --overlay-border: #e8eaed;
        --overlay-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        --overlay-resize-color: #ccc;
      }

      :host(.dark) {
        --overlay-bg: #1f2937;
        --overlay-bg-secondary: #374151;
        --overlay-bg-tertiary: #4b5563;
        --overlay-text: #f3f4f6;
        --overlay-text-secondary: #9ca3af;
        --overlay-border: #4b5563;
        --overlay-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
        --overlay-resize-color: #6b7280;
      }

      .overlay-panel {
        position: fixed;
        right: 20px;
        top: 100px;
        width: 350px;
        height: 450px;
        min-width: 280px;
        min-height: 200px;
        max-width: 600px;
        max-height: 80vh;
        background: var(--overlay-bg);
        border-radius: 12px;
        box-shadow: var(--overlay-shadow);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: box-shadow 0.2s ease, background 0.2s ease;
        resize: both;
      }

      .resize-handle {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 16px;
        height: 16px;
        cursor: nwse-resize;
        background: linear-gradient(135deg, transparent 50%, var(--overlay-resize-color) 50%, var(--overlay-resize-color) 60%, transparent 60%, transparent 70%, var(--overlay-resize-color) 70%, var(--overlay-resize-color) 80%, transparent 80%);
        border-radius: 0 0 12px 0;
      }

      .overlay-panel.minimized {
        width: 48px !important;
        height: 48px !important;
        min-width: 48px;
        min-height: 48px;
        border-radius: 50%;
        cursor: pointer;
        resize: none;
      }

      .overlay-panel.minimized .resize-handle {
        display: none;
      }

      .overlay-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: linear-gradient(135deg, #d35400 0%, #e67e22 100%);
        color: white;
        cursor: grab;
      }

      .overlay-panel.minimized .overlay-header {
        padding: 12px;
        justify-content: center;
      }

      .drag-handle {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .title {
        font-weight: 500;
        font-size: 14px;
      }

      .overlay-panel.minimized .title,
      .overlay-panel.minimized .controls {
        display: none;
      }

      .status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #34a853;
      }

      .controls {
        display: flex;
        gap: 8px;
      }

      .controls button {
        background: transparent;
        border: none;
        color: white;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 16px;
        line-height: 1;
      }

      .controls button:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      .font-controls {
        display: flex;
        align-items: center;
        gap: 2px;
        margin-right: 4px;
        border-right: 1px solid rgba(255, 255, 255, 0.3);
        padding-right: 8px;
      }

      .font-controls button {
        width: 20px;
        height: 20px;
        padding: 0;
        font-size: 14px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .overlay-panel.minimized .font-controls {
        display: none;
      }

      .overlay-content {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 12px;
        min-height: 0;
      }

      .overlay-panel.minimized .overlay-content {
        display: none;
      }

      .empty-state {
        color: var(--overlay-text-secondary);
        font-size: 13px;
        text-align: center;
        padding: 24px;
      }

      .suggestion-card {
        background: var(--overlay-bg-secondary);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 8px;
        border-left: 3px solid #e67e22;
      }

      .suggestion-card.objection {
        border-left-color: #ea4335;
      }

      .suggestion-card.info {
        border-left-color: #fbbc05;
      }

      .suggestion-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
        font-size: 11px;
        color: var(--overlay-text-secondary);
      }

      .suggestion-type {
        text-transform: uppercase;
        font-weight: 500;
      }

      .suggestion-content {
        font-size: 13px;
        line-height: 1.5;
        color: var(--overlay-text);
      }

      .transcript-section {
        padding: 8px 12px;
        background: var(--overlay-bg-tertiary);
        font-size: 12px;
        color: var(--overlay-text-secondary);
        border-top: 1px solid var(--overlay-border);
      }

      .transcript-section .speaker {
        font-weight: 500;
        color: #e67e22;
      }
    `;
    this.shadow.appendChild(styles);
  }

  /**
   * Create the overlay HTML structure
   */
  private createOverlayStructure(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'overlay-panel';
    panel.innerHTML = `
      <div class="overlay-header">
        <div class="drag-handle">
          <span class="status-indicator"></span>
          <span class="title">Wingman</span>
        </div>
        <div class="controls">
          <div class="font-controls">
            <button class="font-decrease-btn" title="Decrease font size">−</button>
            <button class="font-increase-btn" title="Increase font size">+</button>
          </div>
          <button class="minimize-btn" title="Minimize">_</button>
          <button class="close-btn" title="Hide">×</button>
        </div>
      </div>
      <div class="overlay-content">
        <div class="suggestions-container">
          <div class="empty-state">
            Listening for conversation...
          </div>
        </div>
      </div>
      <div class="transcript-section">
        <span class="speaker">Waiting...</span>
      </div>
      <div class="resize-handle" title="Resize"></div>
    `;

    // Add event listeners
    const minimizeBtn = panel.querySelector('.minimize-btn');
    const closeBtn = panel.querySelector('.close-btn');
    const fontDecreaseBtn = panel.querySelector('.font-decrease-btn');
    const fontIncreaseBtn = panel.querySelector('.font-increase-btn');

    minimizeBtn?.addEventListener('click', () => this.toggleMinimize());
    closeBtn?.addEventListener('click', () => {
      this.hide();
      // Notify that user closed the overlay (stops session)
      if (this.onCloseCallback) {
        this.onCloseCallback();
      }
    });
    fontDecreaseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.adjustFontSize(-1);
    });
    fontIncreaseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.adjustFontSize(1);
    });
    panel.addEventListener('click', () => {
      if (this.isMinimized) this.toggleMinimize();
    });

    return panel;
  }

  /**
   * Initialize drag functionality
   */
  private initDrag(): void {
    const header = this.panel.querySelector('.overlay-header') as HTMLElement;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    header.addEventListener('mousedown', (e) => {
      if (this.isMinimized) return;
      this.isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.panel.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      header.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const newLeft = Math.max(0, Math.min(window.innerWidth - this.panel.offsetWidth, startLeft + deltaX));
      const newTop = Math.max(0, Math.min(window.innerHeight - this.panel.offsetHeight, startTop + deltaY));

      this.panel.style.left = `${newLeft}px`;
      this.panel.style.top = `${newTop}px`;
      this.panel.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        header.style.cursor = 'grab';
        this.savePosition();
      }
    });
  }

  /**
   * Toggle minimized state
   */
  toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;
    this.panel.classList.toggle('minimized', this.isMinimized);
    try {
      if (chrome.runtime?.id) {
        chrome.storage.local.set({ overlayMinimized: this.isMinimized });
      }
    } catch {
      // Extension context invalidated, ignore
    }
  }

  /**
   * Add a suggestion to the overlay
   */
  addSuggestion(suggestion: Suggestion): void {
    const container = this.panel.querySelector('.suggestions-container');
    if (!container) return;

    // Remove empty state
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const card = document.createElement('div');
    card.className = `suggestion-card ${suggestion.type}`;
    card.innerHTML = `
      <div class="suggestion-header" style="font-size: ${this.fontSize - 2}px">
        <span class="suggestion-type">${suggestion.type}</span>
        <span class="suggestion-time">${this.formatTime(suggestion.timestamp)}</span>
      </div>
      <div class="suggestion-content" style="font-size: ${this.fontSize}px">${suggestion.text}</div>
    `;

    container.insertBefore(card, container.firstChild);

    // Limit visible suggestions
    while (container.children.length > 10) {
      container.removeChild(container.lastChild!);
    }
  }

  /**
   * Update transcript display
   */
  updateTranscript(transcript: Transcript): void {
    const section = this.panel.querySelector('.transcript-section');
    if (!section) return;

    section.innerHTML = `
      <span class="speaker">${transcript.speaker}:</span> ${transcript.text}
    `;
  }

  /**
   * Show the overlay
   */
  show(): void {
    this.panel.style.display = 'flex';
  }

  /**
   * Hide the overlay
   */
  hide(): void {
    this.panel.style.display = 'none';
  }

  /**
   * Initialize resize functionality
   */
  private initResize(): void {
    const handle = this.panel.querySelector('.resize-handle') as HTMLElement;
    if (!handle) return;

    let isResizing = false;
    let startX = 0, startY = 0, startWidth = 0, startHeight = 0;

    handle.addEventListener('mousedown', (e) => {
      if (this.isMinimized) return;
      e.preventDefault();
      e.stopPropagation();

      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = this.panel.offsetWidth;
      startHeight = this.panel.offsetHeight;

      handle.style.cursor = 'nwse-resize';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const newWidth = Math.max(280, Math.min(600, startWidth + deltaX));
      const newHeight = Math.max(200, Math.min(window.innerHeight * 0.8, startHeight + deltaY));

      this.panel.style.width = `${newWidth}px`;
      this.panel.style.height = `${newHeight}px`;
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        handle.style.cursor = 'nwse-resize';
        this.savePosition();
      }
    });
  }

  /**
   * Save position and size to storage
   */
  private savePosition(): void {
    try {
      if (!chrome.runtime?.id) return;
      const rect = this.panel.getBoundingClientRect();
      chrome.storage.local.set({
        overlayPosition: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
      });
    } catch {
      // Extension context invalidated, ignore
    }
  }

  /**
   * Restore position and size from storage
   */
  private restorePosition(): void {
    try {
      if (!chrome.runtime?.id) return;
      chrome.storage.local.get(['overlayPosition', 'overlayMinimized', 'overlayFontSize'], (result) => {
        if (result.overlayPosition) {
          this.panel.style.left = `${result.overlayPosition.left}px`;
          this.panel.style.top = `${result.overlayPosition.top}px`;
          this.panel.style.right = 'auto';
          if (result.overlayPosition.width) {
            this.panel.style.width = `${result.overlayPosition.width}px`;
          }
          if (result.overlayPosition.height) {
            this.panel.style.height = `${result.overlayPosition.height}px`;
          }
        }
        if (result.overlayMinimized) {
          this.isMinimized = result.overlayMinimized;
          this.panel.classList.toggle('minimized', this.isMinimized);
        }
        if (result.overlayFontSize) {
          this.fontSize = result.overlayFontSize;
          this.applyFontSize();
        }
      });
    } catch {
      // Extension context invalidated, ignore
    }
  }

  /**
   * Adjust font size
   */
  private adjustFontSize(delta: number): void {
    this.fontSize = Math.max(this.MIN_FONT_SIZE, Math.min(this.MAX_FONT_SIZE, this.fontSize + delta));
    this.applyFontSize();
    this.saveFontSize();
  }

  /**
   * Apply current font size to all text in overlay
   */
  private applyFontSize(): void {
    // Set base font size on the panel itself
    this.panel.style.fontSize = `${this.fontSize}px`;

    // Scale title (slightly larger)
    const title = this.panel.querySelector('.title') as HTMLElement;
    if (title) {
      title.style.fontSize = `${this.fontSize + 1}px`;
    }

    // Scale content area
    const content = this.panel.querySelector('.overlay-content') as HTMLElement;
    if (content) {
      content.style.fontSize = `${this.fontSize}px`;
    }

    // Scale suggestion cards
    const suggestionContents = this.panel.querySelectorAll('.suggestion-content') as NodeListOf<HTMLElement>;
    suggestionContents.forEach(el => {
      el.style.fontSize = `${this.fontSize}px`;
    });

    // Scale suggestion headers (smaller)
    const suggestionHeaders = this.panel.querySelectorAll('.suggestion-header') as NodeListOf<HTMLElement>;
    suggestionHeaders.forEach(el => {
      el.style.fontSize = `${this.fontSize - 2}px`;
    });

    // Scale empty state
    const emptyState = this.panel.querySelector('.empty-state') as HTMLElement;
    if (emptyState) {
      emptyState.style.fontSize = `${this.fontSize}px`;
    }

    // Scale transcript section (slightly smaller)
    const transcript = this.panel.querySelector('.transcript-section') as HTMLElement;
    if (transcript) {
      transcript.style.fontSize = `${this.fontSize - 1}px`;
    }
  }

  /**
   * Save font size to storage
   */
  private saveFontSize(): void {
    try {
      if (chrome.runtime?.id) {
        chrome.storage.local.set({ overlayFontSize: this.fontSize });
      }
    } catch {
      // Extension context invalidated, ignore
    }
  }

  /**
   * Format timestamp
   */
  private formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
