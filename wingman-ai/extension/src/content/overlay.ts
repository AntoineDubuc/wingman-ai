/**
 * AI Overlay Component — Unified Chat Timeline
 *
 * Floating panel that displays a chronological timeline of transcripts
 * and AI suggestions during Google Meet calls. Uses Shadow DOM for
 * style isolation from Google Meet's styles.
 */

import type { CallSummary } from '../services/call-summary';
import { formatSummaryAsMarkdown } from '../services/call-summary';

export interface Suggestion {
  type: 'answer' | 'objection' | 'info';
  question?: string;
  text: string;
  confidence?: number;
  timestamp: number;
  kbSource?: string;
}

export interface Transcript {
  text: string;
  speaker: string;
  is_final: boolean;
  is_self: boolean;
  timestamp: string;
}

interface TimelineEntry {
  kind: 'transcript' | 'suggestion';
  timestamp: number;
  speaker?: string;
  isSelf?: boolean;
  text?: string;
  suggestionType?: 'answer' | 'objection' | 'info';
  suggestionText?: string;
  question?: string;
  confidence?: number;
  kbSource?: string;
  element?: HTMLElement;
}

// Inline SVG icons
const ICON_MINIMIZE = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_CLOSE = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_WINGMAN = '<svg class="wingman-icon" width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M7 1l1.5 4.5L13 7l-4.5 1.5L7 13l-1.5-4.5L1 7l4.5-1.5z"/></svg>';

export class AIOverlay {
  public container: HTMLDivElement;
  private shadow: ShadowRoot;
  private panel: HTMLDivElement;
  private isMinimized = false;
  private isDragging = false;
  private onCloseCallback?: () => void;
  private fontSize = 13;
  private readonly MIN_FONT_SIZE = 10;
  private readonly MAX_FONT_SIZE = 20;
  private currentSummary: CallSummary | null = null;

  // Timeline state
  private timeline: TimelineEntry[] = [];
  private readonly MAX_TIMELINE_ENTRIES = 500;
  private timelineEl!: HTMLElement;

  // Interim bubble state
  private interimBubbleSelf: HTMLElement | null = null;
  private interimBubbleOther: HTMLElement | null = null;
  private pendingInterimText = new Map<string, string>();
  private interimRafId: number | null = null;

  // Auto-scroll
  private isNearBottom = true;
  private readonly SCROLL_THRESHOLD = 50;

  // Correction detection (500ms window)
  private lastFinalTimestamp = new Map<string, { time: number; entry: TimelineEntry }>();

  // Post-call state
  private activePostCallView: 'summary' | 'timeline' = 'summary';

  // LangBuilder nav state
  private overlayNav: HTMLElement | null = null;
  private langBuilderPanel: HTMLElement | null = null;
  private langBuilderFlowSelect: HTMLSelectElement | null = null;
  private langBuilderInput: HTMLTextAreaElement | null = null;
  private langBuilderResult: HTMLElement | null = null;
  private langBuilderGoBtn: HTMLButtonElement | null = null;
  private langBuilderCancelBtn: HTMLButtonElement | null = null;
  private activeNavTab: 'chat' | 'langbuilder' = 'chat';
  private layoutToggleBtn: HTMLButtonElement | null = null;
  private layoutMode: 'single' | 'side-by-side' = 'single';
  private singlePanelWidth: string | null = null;
  private langBuilderConfigured = false;

  constructor(onClose?: () => void) {
    this.onCloseCallback = onClose;
    this.container = document.createElement('div');
    this.container.id = 'presales-ai-overlay-container';

    this.container.style.cssText =
      'position:fixed!important;z-index:999999!important;top:0!important;left:0!important;' +
      'width:0!important;height:0!important;overflow:visible!important;' +
      'pointer-events:none!important;display:block!important;';

    this.shadow = this.container.attachShadow({ mode: 'closed' });

    this.loadStyles();
    this.panel = this.createOverlayStructure();
    this.panel.style.pointerEvents = 'auto';
    this.shadow.appendChild(this.panel);

    this.initDrag();
    this.initResize();
    this.initScrollDetection();
    this.restorePosition();
    this.loadTheme();
    this.loadPersonaLabel();
    this.loadLangBuilderVisibility();
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
          if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            this.container.classList.add('dark');
          }
        }
      });

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
   * Load active persona name into the overlay header
   */
  private loadPersonaLabel(): void {
    try {
      chrome.storage.local.get(['personas', 'activePersonaId'], (result) => {
        const personas = result.personas as { id: string; name: string; color: string }[] | undefined;
        const activeId = result.activePersonaId as string | undefined;
        if (!personas || !activeId) return;

        const active = personas.find((p) => p.id === activeId);
        if (!active || (active.name === 'Default' && personas.length <= 1)) return;

        const label = this.shadow.querySelector('.persona-label') as HTMLElement | null;
        if (label) {
          label.textContent = `\u00B7 ${active.name}`;
          label.style.color = active.color;
        }
      });

      // Live-update when persona changes
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.activePersonaId || changes.personas) {
          chrome.storage.local.get(['personas', 'activePersonaId'], (result) => {
            const personas = result.personas as { id: string; name: string; color: string }[] | undefined;
            const activeId = result.activePersonaId as string | undefined;
            const label = this.shadow.querySelector('.persona-label') as HTMLElement | null;
            if (!label) return;

            if (!personas || !activeId) {
              label.textContent = '';
              return;
            }

            const active = personas.find((p) => p.id === activeId);
            if (!active || (active.name === 'Default' && personas.length <= 1)) {
              label.textContent = '';
              return;
            }

            label.textContent = `\u00B7 ${active.name}`;
            label.style.color = active.color;
          });
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
      /* ── Variables ── */
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
        --overlay-text-muted: #9aa0a6;
        --overlay-border: #e8eaed;
        --overlay-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
        --overlay-panel-border: rgba(0, 0, 0, 0.08);
        --overlay-resize-color: #ccc;
        --bubble-self-bg: rgba(230, 126, 34, 0.1);
        --header-gradient: linear-gradient(135deg, #b34700 0%, #e67e22 100%);
      }

      :host(.dark) {
        --overlay-bg: #1f2937;
        --overlay-bg-secondary: #374151;
        --overlay-bg-tertiary: #4b5563;
        --overlay-text: #f3f4f6;
        --overlay-text-secondary: #9ca3af;
        --overlay-text-muted: #6b7280;
        --overlay-border: #4b5563;
        --overlay-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        --overlay-panel-border: rgba(255, 255, 255, 0.1);
        --overlay-resize-color: #6b7280;
        --bubble-self-bg: rgba(243, 156, 18, 0.15);
        --header-gradient: linear-gradient(135deg, #7c2d12 0%, #b45309 100%);
      }

      /* ── Panel ── */
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
        border: 1px solid var(--overlay-panel-border);
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
        background: radial-gradient(circle, var(--overlay-resize-color) 1px, transparent 1px);
        background-size: 4px 4px;
        background-position: 4px 4px;
        border-radius: 0 0 12px 0;
      }

      /* ── Minimized ── */
      .overlay-panel.minimized {
        width: 48px !important;
        height: 48px !important;
        min-width: 48px;
        min-height: 48px;
        border-radius: 50%;
        cursor: pointer;
        resize: none;
      }

      .overlay-panel.minimized .resize-handle,
      .overlay-panel.minimized .overlay-body,
      .overlay-panel.minimized .overlay-content,
      .overlay-panel.minimized .overlay-nav,
      .overlay-panel.minimized .post-call-toggle,
      .overlay-panel.minimized .summary-footer,
      .overlay-panel.minimized .title,
      .overlay-panel.minimized .controls,
      .overlay-panel.minimized .font-controls {
        display: none;
      }

      .overlay-panel.minimized .overlay-header {
        padding: 12px;
        justify-content: center;
      }

      /* ── Header ── */
      .overlay-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: var(--header-gradient);
        color: white;
        cursor: grab;
        flex-shrink: 0;
      }

      .drag-handle {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .title {
        font-weight: 500;
        font-size: 13px;
      }

      .status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #34a853;
        flex-shrink: 0;
        animation: statusPulse 2s ease-in-out infinite;
      }

      .controls {
        display: flex;
        gap: 4px;
        align-items: center;
      }

      .controls button {
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.8);
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s, background 0.15s;
      }

      .controls button:hover {
        background: rgba(255, 255, 255, 0.2);
        color: #fff;
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
        width: 24px;
        height: 22px;
        font-size: 11px;
        font-weight: 600;
      }


      /* ── Cost Ticker ── */
      .cost-ticker {
        font-size: 11px;
        font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
        font-variant-numeric: tabular-nums;
        opacity: 0.6;
        margin-left: auto;
        margin-right: 8px;
        cursor: default;
        position: relative;
        white-space: nowrap;
        transition: opacity 0.15s;
      }
      .cost-ticker:hover { opacity: 0.9; }
      .cost-ticker .cost-tooltip {
        display: none;
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        background: var(--overlay-bg-secondary, #2d2d2d);
        border: 1px solid var(--overlay-border, #444);
        border-radius: 6px;
        padding: 8px 10px;
        font-size: 11px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-variant-numeric: tabular-nums;
        color: var(--overlay-text, #e0e0e0);
        white-space: nowrap;
        z-index: 100;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        min-width: 180px;
      }
      .cost-ticker:hover .cost-tooltip { display: block; }
      .cost-tooltip .cost-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        line-height: 1.6;
      }
      .cost-tooltip .cost-row.total {
        border-top: 1px solid var(--overlay-border, #444);
        margin-top: 4px;
        padding-top: 4px;
        font-weight: 500;
      }
      .cost-tooltip .cost-hint {
        font-size: 10px;
        opacity: 0.5;
        margin-top: 6px;
      }

      /* ── Cost Summary Section (post-call) ── */
      .cost-summary {
        border-top: 1px solid var(--overlay-border, #333);
        margin-top: 12px;
        padding-top: 10px;
        font-size: 11px;
        color: var(--overlay-text-secondary, #9aa0a6);
      }
      .cost-summary h4 {
        margin: 0 0 6px;
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        opacity: 0.7;
      }
      .cost-summary .cost-line {
        display: flex;
        justify-content: space-between;
        line-height: 1.6;
        font-variant-numeric: tabular-nums;
      }
      .cost-summary .cost-line.cost-total-line {
        border-top: 1px solid var(--overlay-border, #333);
        margin-top: 4px;
        padding-top: 4px;
        font-weight: 500;
        color: var(--overlay-text, #e0e0e0);
      }

      /* ── Body wrapper (nav + content) ── */
      .overlay-body {
        display: flex;
        flex-direction: row;
        flex: 1;
        min-height: 0;
        overflow: hidden;
      }

      /* ── Vertical nav ── */
      .overlay-nav {
        width: 64px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 8px 0;
        border-right: 1px solid var(--overlay-border);
        background: var(--overlay-bg);
      }

      .overlay-nav button {
        width: 56px;
        border: none;
        background: transparent;
        color: var(--overlay-text-secondary);
        cursor: pointer;
        border-radius: 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        padding: 6px 4px;
        border-left: 3px solid transparent;
        transition: background 0.15s, color 0.15s;
        font-family: inherit;
      }

      .overlay-nav button span {
        font-size: 10px;
        font-weight: 500;
        line-height: 1;
      }

      .overlay-nav button:hover {
        background: var(--overlay-bg-secondary);
        color: var(--overlay-text);
      }

      .overlay-nav button.active {
        background: var(--overlay-bg-secondary);
        border-left-color: var(--overlay-text);
        color: var(--overlay-text);
      }

      /* ── LangBuilder panel ── */
      .langbuilder-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 10px;
        gap: 8px;
      }

      .lb-flow-select {
        width: 100%;
        box-sizing: border-box;
        padding: 6px 10px;
        font-size: 13px;
        font-family: inherit;
        color: var(--overlay-text);
        background: var(--overlay-bg);
        border: 1px solid var(--overlay-border);
        border-radius: 6px;
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 4l3 3 3-3' fill='none' stroke='%239aa0a6' stroke-width='1.2' stroke-linecap='round'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 8px center;
        padding-right: 24px;
        flex-shrink: 0;
      }

      .lb-flow-select:focus {
        outline: none;
        border-color: #e67e22;
      }

      .lb-textarea {
        width: 100%;
        box-sizing: border-box;
        min-height: 80px;
        resize: vertical;
        padding: 8px 10px;
        font-size: 13px;
        font-family: inherit;
        color: var(--overlay-text);
        background: var(--overlay-bg);
        border: 1px solid var(--overlay-border);
        border-radius: 6px;
        line-height: 1.5;
        flex-shrink: 0;
      }

      .lb-textarea::placeholder { color: var(--overlay-text-muted); }
      .lb-textarea:focus { outline: none; border-color: #e67e22; }

      .lb-actions {
        display: flex;
        gap: 8px;
        flex-shrink: 0;
      }

      .lb-go-btn {
        padding: 6px 16px;
        background: #e67e22;
        color: #fff;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s;
      }

      .lb-go-btn:hover:not(:disabled) { background: #d35400; }
      .lb-go-btn:disabled { opacity: 0.5; cursor: not-allowed; }

      .lb-cancel-btn {
        padding: 6px 16px;
        background: transparent;
        color: var(--overlay-text-secondary);
        border: 1px solid var(--overlay-border);
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
        transition: background 0.15s;
      }

      .lb-cancel-btn:hover:not(:disabled) { background: var(--overlay-bg-secondary); }
      .lb-cancel-btn:disabled { opacity: 0.4; cursor: not-allowed; }

      .lb-result {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
        border-radius: 6px;
        background: var(--overlay-bg-secondary);
        font-size: 13px;
        color: var(--overlay-text);
        white-space: pre-wrap;
        line-height: 1.5;
        min-height: 60px;
      }

      .lb-result.loading {
        color: var(--overlay-text-secondary);
        animation: lbFade 1.8s ease-in-out infinite;
      }

      .lb-result-error {
        color: var(--overlay-text-secondary);
      }

      /* ── Content area ── */
      .overlay-content {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      /* ── Timeline ── */
      .timeline {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.04);
      }

      /* ── Summary ── */
      .summary {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 12px;
      }

      /* ── Empty state ── */
      .empty-state {
        color: var(--overlay-text-secondary);
        font-size: 13px;
        text-align: center;
        padding: 24px;
        align-self: center;
        margin-top: auto;
        margin-bottom: auto;
      }

      /* ── Speaker labels ── */
      .speaker-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--overlay-text-secondary);
        margin-top: 10px;
        margin-bottom: 2px;
        padding: 0 4px;
      }

      .speaker-label.self {
        text-align: right;
      }

      /* ── Bubbles ── */
      .bubble {
        max-width: 85%;
        padding: 8px 12px;
        margin-bottom: 2px;
        position: relative;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }

      .bubble.participant {
        align-self: flex-start;
        background: var(--overlay-bg-secondary);
        border-radius: 12px 12px 12px 4px;
      }

      .bubble.self {
        align-self: flex-end;
        background: var(--bubble-self-bg);
        border-radius: 12px 12px 4px 12px;
      }

      .bubble.wingman {
        align-self: stretch;
        max-width: 100%;
        background: var(--overlay-bg-secondary);
        border-left: 3px solid;
        border-radius: 8px;
        padding: 10px 12px;
        margin: 6px 0;
      }

      .bubble.wingman.answer { border-left-color: #e67e22; }
      .bubble.wingman.objection { border-left-color: #ea4335; }
      .bubble.wingman.info { border-left-color: #fbbc05; }

      .bubble-text {
        font-size: 13px;
        line-height: 1.5;
        color: var(--overlay-text);
      }

      .bubble-time {
        display: block;
        font-size: 10px;
        color: var(--overlay-text-muted);
        text-align: right;
        margin-top: 2px;
      }

      /* ── Wingman bubble sub-elements ── */
      .bubble-header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
      }

      .wingman-icon {
        flex-shrink: 0;
        opacity: 0.85;
        color: var(--overlay-text-secondary);
      }

      .wingman-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--overlay-text-secondary);
      }

      .badge {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 4px;
        letter-spacing: 0.5px;
      }

      .badge.answer { background: rgba(230, 126, 34, 0.15); color: #e67e22; }
      .badge.objection { background: rgba(234, 67, 53, 0.15); color: #ea4335; }
      .badge.info { background: rgba(251, 188, 5, 0.15); color: #d69e2e; }

      :host(.dark) .badge.answer { background: rgba(230, 126, 34, 0.25); color: #f39c12; }
      :host(.dark) .badge.objection { background: rgba(234, 67, 53, 0.25); color: #f87171; }
      :host(.dark) .badge.info { background: rgba(251, 188, 5, 0.25); color: #fbbf24; }

      .bubble-source {
        font-size: 11px;
        color: var(--overlay-text-secondary);
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px solid var(--overlay-border);
        font-style: italic;
      }

      /* ── Interim bubble ── */
      .bubble.interim {
        opacity: 0.6;
        animation: interimPulse 1.5s ease-in-out infinite !important;
      }

      /* ── Post-call toggle ── */
      .post-call-toggle {
        display: flex;
        gap: 0;
        padding: 6px 10px;
        border-bottom: 1px solid var(--overlay-border);
        background: var(--overlay-bg);
        flex-shrink: 0;
      }

      .toggle-btn {
        flex: 1;
        padding: 5px 12px;
        border: 1px solid var(--overlay-border);
        background: var(--overlay-bg);
        color: var(--overlay-text-secondary);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
      }

      .toggle-btn:first-child { border-radius: 6px 0 0 6px; }
      .toggle-btn:last-child { border-radius: 0 6px 6px 0; border-left: none; }

      .toggle-btn.active {
        background: var(--overlay-bg-tertiary);
        color: var(--overlay-text);
        font-weight: 600;
      }

      /* ── Summary content ── */
      .summary-section { margin-bottom: 12px; }

      .summary-section h3 {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--overlay-text-secondary);
        margin: 0 0 8px 0;
      }

      .summary-bullets { list-style: none; padding: 0; margin: 0; }

      .summary-bullets li {
        color: var(--overlay-text);
        padding: 4px 0;
        line-height: 1.5;
      }

      .summary-bullets li::before {
        content: "\\2022";
        color: var(--overlay-text-secondary);
        margin-right: 8px;
      }

      .action-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 6px 0;
      }

      .owner-badge {
        display: inline-block;
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        white-space: nowrap;
        flex-shrink: 0;
        margin-top: 2px;
      }

      .owner-badge.you { background: #e67e22; color: #fff; }
      .owner-badge.them { background: #3b82f6; color: #fff; }

      .action-text { color: var(--overlay-text); line-height: 1.5; }

      .key-moments-toggle {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        user-select: none;
        padding: 4px 0;
      }

      .key-moments-toggle h3 { margin: 0; cursor: pointer; }

      .key-moments-arrow {
        font-size: 10px;
        transition: transform 0.2s ease;
        color: var(--overlay-text-secondary);
      }

      .key-moments-arrow.expanded { transform: rotate(90deg); }

      .key-moments-list { display: none; padding: 0; margin: 0; }
      .key-moments-list.expanded { display: block; }

      .key-moment {
        padding: 8px 12px;
        margin: 4px 0;
        border-radius: 6px;
        background: var(--overlay-bg-secondary);
        border-left: 3px solid #9ca3af;
        color: var(--overlay-text);
        font-style: italic;
        line-height: 1.5;
      }

      .key-moment.signal { border-left-color: #22c55e; }
      .key-moment.objection { border-left-color: #ef4444; }
      .key-moment.decision { border-left-color: #3b82f6; }
      .key-moment.quote { border-left-color: #9ca3af; }

      /* ── Footer ── */
      .summary-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-top: 1px solid var(--overlay-border);
        background: var(--overlay-bg);
        flex-shrink: 0;
      }

      .summary-footer .copy-btn {
        background: var(--overlay-bg-secondary);
        border: 1px solid var(--overlay-border);
        color: var(--overlay-text);
        padding: 5px 14px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: background 0.15s;
      }

      .summary-footer .copy-btn:hover { background: var(--overlay-bg-tertiary); }

      .summary-footer .drive-status {
        font-size: 11px;
        color: var(--overlay-text-secondary);
      }

      /* ── Loading / Error ── */
      .loading-pulse {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        color: var(--overlay-text-secondary);
        font-size: 14px;
      }

      .loading-pulse::after {
        content: "";
        display: inline-block;
        width: 8px;
        height: 8px;
        margin-left: 8px;
        border-radius: 50%;
        background: var(--overlay-text-secondary);
        animation: pulse 1.2s ease-in-out infinite;
      }

      .summary-error {
        color: var(--overlay-text-secondary);
        font-size: 13px;
        text-align: center;
        padding: 24px;
      }

      .view-timeline-btn {
        display: inline-block;
        margin-top: 12px;
        padding: 6px 16px;
        background: var(--overlay-bg-secondary);
        border: 1px solid var(--overlay-border);
        border-radius: 6px;
        color: var(--overlay-text);
        cursor: pointer;
        font-size: 12px;
      }

      .view-timeline-btn:hover { background: var(--overlay-bg-tertiary); }

      /* ── Animations ── */
      @keyframes bubbleIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes wingmanIn {
        from { opacity: 0; transform: translateY(8px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      @keyframes statusPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      @keyframes interimPulse {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 0.35; }
      }

      @keyframes pulse {
        0%, 100% { opacity: 0.3; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1.2); }
      }

      @keyframes lbFade {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }


      @media (prefers-reduced-motion: reduce) {
        @keyframes bubbleIn { from, to { opacity: 1; transform: none; } }
        @keyframes wingmanIn { from, to { opacity: 1; transform: none; } }
        @keyframes statusPulse { from, to { opacity: 1; } }
        @keyframes interimPulse { from, to { opacity: 0.5; } }
        @keyframes lbFade { from, to { opacity: 1; } }
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
          <span class="persona-label" style="font-size:11px;opacity:0.7;margin-left:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;"></span>
        </div>
        <span class="cost-ticker" style="display:none;">
          <span class="cost-value"></span>
          <div class="cost-tooltip">
            <div class="cost-row"><span class="cost-stt-label">Deepgram (STT)</span><span class="cost-stt-value"></span></div>
            <div class="cost-row"><span class="cost-llm-label">LLM</span><span class="cost-llm-value"></span></div>
            <div class="cost-row total"><span>Total</span><span class="cost-total-value"></span></div>
            <div class="cost-hint"></div>
          </div>
        </span>
        <div class="controls">
          <div class="font-controls">
            <button class="font-decrease-btn" title="Decrease font size">A\u2212</button>
            <button class="font-increase-btn" title="Increase font size">A+</button>
          </div>
          <button class="layout-toggle-btn" title="Toggle side-by-side" style="display:none;">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="5" height="10" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="8" y="2" width="5" height="10" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>
          </button>
          <button class="minimize-btn" title="Minimize">${ICON_MINIMIZE}</button>
          <button class="close-btn" title="Hide">${ICON_CLOSE}</button>
        </div>
      </div>
      <div class="overlay-body">
        <div class="overlay-nav" style="display:none;">
          <button class="nav-chat-btn active" title="Chat">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H5l-3 3V3z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span>Chat</span>
          </button>
          <button class="nav-lb-btn" title="Flows">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><circle cx="4" cy="4" r="1.5" stroke="currentColor" stroke-width="1.2"/><circle cx="12" cy="4" r="1.5" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="12" r="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M4 5.5v1a2.5 2.5 0 002.5 2.5h3A2.5 2.5 0 0012 6.5v-1" stroke="currentColor" stroke-width="1.2"/><line x1="8" y1="9" x2="8" y2="10.5" stroke="currentColor" stroke-width="1.2"/></svg>
            <span>Flows</span>
          </button>
        </div>
        <div class="overlay-content">
          <div class="timeline" role="log" aria-live="polite" aria-relevant="additions">
            <div class="empty-state">Listening for conversation...</div>
          </div>
        </div>
        <div class="langbuilder-panel" style="display:none;">
          <select class="lb-flow-select">
            <option disabled selected>Select a flow...</option>
          </select>
          <textarea class="lb-textarea" placeholder="Paste or type input for the flow..."></textarea>
          <div class="lb-actions">
            <button class="lb-cancel-btn" disabled>Cancel</button>
            <button class="lb-go-btn" disabled>Go</button>
          </div>
          <div class="lb-result" style="color:var(--overlay-text-muted);">Run a flow to see results here.</div>
        </div>
      </div>
      <div class="resize-handle" title="Resize"></div>
    `;

    // Store timeline reference
    this.timelineEl = panel.querySelector('.timeline') as HTMLElement;

    // Add event listeners
    const minimizeBtn = panel.querySelector('.minimize-btn');
    const closeBtn = panel.querySelector('.close-btn');
    const fontDecreaseBtn = panel.querySelector('.font-decrease-btn');
    const fontIncreaseBtn = panel.querySelector('.font-increase-btn');

    minimizeBtn?.addEventListener('click', () => this.toggleMinimize());
    closeBtn?.addEventListener('click', () => {
      this.hide();
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

    // Store nav/body references
    this.overlayNav = panel.querySelector('.overlay-nav') as HTMLElement;
    this.layoutToggleBtn = panel.querySelector('.layout-toggle-btn') as HTMLButtonElement;

    // LangBuilder panel references
    this.langBuilderPanel = panel.querySelector('.langbuilder-panel') as HTMLElement;
    this.langBuilderFlowSelect = panel.querySelector('.lb-flow-select') as HTMLSelectElement;
    this.langBuilderInput = panel.querySelector('.lb-textarea') as HTMLTextAreaElement;
    this.langBuilderResult = panel.querySelector('.lb-result') as HTMLElement;
    this.langBuilderGoBtn = panel.querySelector('.lb-go-btn') as HTMLButtonElement;
    this.langBuilderCancelBtn = panel.querySelector('.lb-cancel-btn') as HTMLButtonElement;

    // Enable/disable Go button on input changes
    this.langBuilderFlowSelect?.addEventListener('change', () => this.updateGoButtonState());
    this.langBuilderInput?.addEventListener('input', () => this.updateGoButtonState());

    // Go button — run flow via service worker
    this.langBuilderGoBtn?.addEventListener('click', () => this.runLangBuilderFlow());
    // Cancel button — abort in-flight flow
    this.langBuilderCancelBtn?.addEventListener('click', () => this.cancelLangBuilderFlow());

    // Nav tab switching
    const chatNavBtn = panel.querySelector('.nav-chat-btn') as HTMLButtonElement;
    const lbNavBtn = panel.querySelector('.nav-lb-btn') as HTMLButtonElement;
    chatNavBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.setActiveNavTab('chat'); });
    lbNavBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.setActiveNavTab('langbuilder'); });

    // Layout toggle
    this.layoutToggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setLayoutMode(this.layoutMode === 'single' ? 'side-by-side' : 'single');
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

  // ── Timeline Management ──

  /**
   * Clear timeline for a new session.
   */
  clearTimeline(): void {
    this.timeline = [];
    this.lastFinalTimestamp.clear();
    this.interimBubbleSelf = null;
    this.interimBubbleOther = null;
    this.pendingInterimText.clear();
    if (this.interimRafId !== null) {
      cancelAnimationFrame(this.interimRafId);
      this.interimRafId = null;
    }
    this.currentSummary = null;
    this.activePostCallView = 'summary';
    this.isNearBottom = true;

    // Clear timeline DOM
    if (this.timelineEl) {
      this.timelineEl.innerHTML = '<div class="empty-state">Listening for conversation...</div>';
      this.timelineEl.style.display = 'flex';
    }

    // Remove post-call elements
    this.panel.querySelector('.post-call-toggle')?.remove();
    this.panel.querySelector('.summary')?.remove();
    this.panel.querySelector('.summary-footer')?.remove();

    // Reset header
    const title = this.panel.querySelector('.title');
    if (title) title.textContent = 'Wingman';
    const status = this.panel.querySelector('.status-indicator') as HTMLElement;
    if (status) {
      status.style.background = '#34a853';
      status.style.animation = 'statusPulse 2s ease-in-out infinite';
    }

    // Reset cost ticker
    const ticker = this.panel.querySelector('.cost-ticker') as HTMLElement;
    if (ticker) ticker.style.display = 'none';
  }

  /**
   * Update the live cost ticker in the overlay header.
   */
  updateCost(data: {
    deepgramCost: number;
    llmCost: number;
    totalCost: number;
    audioMinutes: number;
    suggestionCount: number;
    providerLabel: string;
    isFreeTier: boolean;
  }): void {
    const ticker = this.panel.querySelector('.cost-ticker') as HTMLElement;
    if (!ticker) return;

    // Show the ticker on first update
    ticker.style.display = '';

    // Main value
    const valueEl = ticker.querySelector('.cost-value');
    if (valueEl) {
      if (data.isFreeTier && data.llmCost === 0) {
        valueEl.textContent = `~$${data.deepgramCost.toFixed(2)}`;
      } else {
        valueEl.textContent = `~$${data.totalCost.toFixed(2)}`;
      }
    }

    // Tooltip details
    const sttLabel = ticker.querySelector('.cost-stt-label');
    if (sttLabel) sttLabel.textContent = `Deepgram (${Math.round(data.audioMinutes)} min)`;
    const sttValue = ticker.querySelector('.cost-stt-value');
    if (sttValue) sttValue.textContent = `$${data.deepgramCost.toFixed(3)}`;

    const llmLabel = ticker.querySelector('.cost-llm-label');
    if (llmLabel) {
      llmLabel.textContent = data.isFreeTier
        ? `${data.providerLabel} (free tier)`
        : `${data.providerLabel} (${data.suggestionCount} calls)`;
    }
    const llmValue = ticker.querySelector('.cost-llm-value');
    if (llmValue) {
      llmValue.textContent = data.isFreeTier ? 'Free \u2713' : `$${data.llmCost.toFixed(3)}`;
    }

    const totalValue = ticker.querySelector('.cost-total-value');
    if (totalValue) totalValue.textContent = `~$${data.totalCost.toFixed(2)}`;

    const hint = ticker.querySelector('.cost-hint');
    if (hint) hint.textContent = 'Estimate \u00b7 actual bill may vary';
  }

  /**
   * Check if the timeline has entries (used by content script for HIDE_OVERLAY).
   */
  hasTimelineEntries(): boolean {
    return this.timeline.length > 0;
  }

  // ── Transcript Handling ──

  /**
   * Update transcript display — handles both interim and final transcripts.
   */
  updateTranscript(transcript: Transcript): void {
    if (!this.timelineEl) return;

    // Remove empty state on first content
    const emptyState = this.timelineEl.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const speakerKey = transcript.is_self ? 'self' : 'other';

    if (!transcript.is_final) {
      // Interim: store pending text and coalesce via rAF
      this.pendingInterimText.set(speakerKey, transcript.text);
      if (this.interimRafId === null) {
        this.interimRafId = requestAnimationFrame(() => this.flushInterimUpdates());
      }
      return;
    }

    // ── Final transcript ──

    // Remove interim bubble for this speaker
    if (speakerKey === 'self' && this.interimBubbleSelf) {
      this.interimBubbleSelf.remove();
      this.interimBubbleSelf = null;
    } else if (speakerKey === 'other' && this.interimBubbleOther) {
      this.interimBubbleOther.remove();
      this.interimBubbleOther = null;
    }
    this.pendingInterimText.delete(speakerKey);

    const now = Date.now();
    const entryTimestamp = transcript.timestamp
      ? new Date(transcript.timestamp).getTime()
      : now;

    // Check for correction (same speaker within 500ms) → replace, not append
    const lastFinal = this.lastFinalTimestamp.get(speakerKey);
    if (lastFinal && now - lastFinal.time < 500) {
      lastFinal.entry.text = transcript.text;
      lastFinal.entry.timestamp = entryTimestamp;
      lastFinal.time = now;
      if (lastFinal.entry.element) {
        const textEl = lastFinal.entry.element.querySelector('.bubble-text');
        if (textEl) textEl.textContent = transcript.text;
        const timeEl = lastFinal.entry.element.querySelector('.bubble-time');
        if (timeEl) timeEl.textContent = this.formatTime(entryTimestamp);
      }
      this.scrollToBottom();
      return;
    }

    // New timeline entry
    const entry: TimelineEntry = {
      kind: 'transcript',
      timestamp: entryTimestamp,
      speaker: transcript.speaker,
      isSelf: transcript.is_self,
      text: transcript.text,
    };

    this.timeline.push(entry);

    // Speaker label: show when speaker changes from previous entry
    const prevEntry = this.timeline.length >= 2
      ? this.timeline[this.timeline.length - 2]
      : null;
    const showLabel = !prevEntry
      || prevEntry.kind !== 'transcript'
      || prevEntry.isSelf !== entry.isSelf;

    const bubble = this.renderBubble(entry, showLabel);
    entry.element = bubble;

    // Re-append interim bubbles to keep them at bottom
    if (this.interimBubbleSelf) this.timelineEl.appendChild(this.interimBubbleSelf);
    if (this.interimBubbleOther) this.timelineEl.appendChild(this.interimBubbleOther);

    this.lastFinalTimestamp.set(speakerKey, { time: now, entry });
    this.trimTimeline();
    this.scrollToBottom();
  }

  /**
   * Flush pending interim text updates (called via requestAnimationFrame).
   */
  private flushInterimUpdates(): void {
    this.interimRafId = null;

    for (const [key, text] of this.pendingInterimText) {
      const isSelf = key === 'self';
      const interimRef = isSelf ? this.interimBubbleSelf : this.interimBubbleOther;

      if (interimRef) {
        // Update existing interim bubble
        const textEl = interimRef.querySelector('.bubble-text');
        if (textEl) textEl.textContent = text;
      } else {
        // Create new interim bubble
        const bubble = document.createElement('div');
        const alignClass = isSelf ? 'self' : 'participant';
        bubble.className = `bubble ${alignClass} interim`;
        bubble.innerHTML =
          `<div class="bubble-content">` +
          `<span class="bubble-text" style="font-size:${this.fontSize}px">${this.escapeHtml(text)}</span>` +
          `</div>`;
        this.timelineEl.appendChild(bubble);

        if (isSelf) {
          this.interimBubbleSelf = bubble;
        } else {
          this.interimBubbleOther = bubble;
        }
      }
    }

    this.scrollToBottom();
  }

  // ── Suggestion Handling ──

  /**
   * Add a suggestion to the timeline.
   */
  addSuggestion(suggestion: Suggestion): void {
    if (!this.timelineEl) return;

    // Remove empty state
    const emptyState = this.timelineEl.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const entry: TimelineEntry = {
      kind: 'suggestion',
      timestamp: suggestion.timestamp,
      suggestionType: suggestion.type,
      suggestionText: suggestion.text,
      question: suggestion.question,
      confidence: suggestion.confidence,
      kbSource: suggestion.kbSource,
    };

    this.timeline.push(entry);

    const bubble = this.renderBubble(entry, true);
    entry.element = bubble;

    // Re-append interim bubbles to keep them at bottom
    if (this.interimBubbleSelf) this.timelineEl.appendChild(this.interimBubbleSelf);
    if (this.interimBubbleOther) this.timelineEl.appendChild(this.interimBubbleOther);

    this.trimTimeline();
    this.scrollToBottom();
  }

  // ── Bubble Rendering ──

  /**
   * Render a timeline entry as a DOM bubble and append to the timeline.
   */
  private renderBubble(entry: TimelineEntry, showSpeakerLabel: boolean): HTMLElement {
    if (entry.kind === 'transcript') {
      // Speaker label (only when speaker changes)
      if (showSpeakerLabel && entry.speaker) {
        const label = document.createElement('div');
        label.className = `speaker-label${entry.isSelf ? ' self' : ''}`;
        label.textContent = entry.speaker;
        label.style.fontSize = `${this.fontSize - 2}px`;
        this.timelineEl.appendChild(label);
      }

      const bubble = document.createElement('div');
      const alignClass = entry.isSelf ? 'self' : 'participant';
      bubble.className = `bubble ${alignClass}`;
      bubble.setAttribute('role', 'article');
      bubble.setAttribute('aria-label', `${entry.speaker || 'Unknown'}: ${entry.text || ''}`);
      bubble.style.animation = 'bubbleIn 200ms ease-out forwards';
      bubble.innerHTML =
        `<div class="bubble-content">` +
        `<span class="bubble-text" style="font-size:${this.fontSize}px">${this.escapeHtml(entry.text || '')}</span>` +
        `</div>` +
        `<span class="bubble-time" style="font-size:${this.fontSize - 3}px">${this.formatTime(entry.timestamp)}</span>`;
      this.timelineEl.appendChild(bubble);
      return bubble;
    }

    // Suggestion bubble
    const bubble = document.createElement('div');
    const typeClass = entry.suggestionType || 'info';
    bubble.className = `bubble wingman ${typeClass}`;
    bubble.setAttribute('role', 'article');
    bubble.setAttribute('aria-label', `Wingman ${typeClass}: ${entry.suggestionText || ''}`);
    bubble.style.animation = 'wingmanIn 250ms ease-out forwards';

    const badgeLabel = (entry.suggestionType || 'info').toUpperCase();
    const sourceHtml = entry.kbSource
      ? `<div class="bubble-source" style="font-size:${this.fontSize - 2}px">\u{1F4DA} Based on: ${this.escapeHtml(entry.kbSource)}</div>`
      : '';

    bubble.innerHTML =
      `<div class="bubble-header">` +
      `${ICON_WINGMAN}` +
      `<span class="wingman-label" style="font-size:${this.fontSize - 2}px">Wingman</span>` +
      `<span class="badge ${typeClass}" style="font-size:${this.fontSize - 4}px">${badgeLabel}</span>` +
      `</div>` +
      `<div class="bubble-content">` +
      `<span class="bubble-text" style="font-size:${this.fontSize}px">${this.escapeHtml(entry.suggestionText || '')}</span>` +
      `</div>` +
      sourceHtml +
      `<span class="bubble-time" style="font-size:${this.fontSize - 3}px">${this.formatTime(entry.timestamp)}</span>`;
    this.timelineEl.appendChild(bubble);
    return bubble;
  }

  /**
   * Trim timeline to MAX_TIMELINE_ENTRIES (removes oldest from top).
   */
  private trimTimeline(): void {
    while (this.timeline.length > this.MAX_TIMELINE_ENTRIES) {
      const removed = this.timeline.shift();
      if (removed?.element) {
        // Remove preceding speaker label if present
        const prev = removed.element.previousElementSibling;
        if (prev?.classList.contains('speaker-label')) {
          prev.remove();
        }
        removed.element.remove();
      }
    }
  }

  // ── Auto-Scroll ──

  /**
   * Initialize scroll detection on the timeline container.
   */
  private initScrollDetection(): void {
    if (!this.timelineEl) return;
    this.timelineEl.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = this.timelineEl;
      this.isNearBottom = scrollHeight - scrollTop - clientHeight < this.SCROLL_THRESHOLD;
    });
  }

  /**
   * Scroll timeline to bottom if user hasn't scrolled up.
   */
  private scrollToBottom(): void {
    if (this.isNearBottom) {
      requestAnimationFrame(() => {
        if (this.timelineEl) {
          this.timelineEl.scrollTop = this.timelineEl.scrollHeight;
        }
      });
    }
  }

  // ── Post-Call Summary ──

  /**
   * Show loading state while summary is being generated.
   */
  showLoading(): void {
    if (this.isMinimized) this.toggleMinimize();

    // Ensure summary container exists
    let summaryEl = this.panel.querySelector('.summary') as HTMLElement;
    if (!summaryEl) {
      summaryEl = document.createElement('div');
      summaryEl.className = 'summary';
      const content = this.panel.querySelector('.overlay-content');
      content?.appendChild(summaryEl);
    }

    // Hide timeline, show summary with loading
    this.timelineEl.style.display = 'none';
    summaryEl.style.display = 'block';
    summaryEl.innerHTML = '<div class="loading-pulse">Generating Summary...</div>';

    // Remove any existing footer/toggle
    this.panel.querySelector('.summary-footer')?.remove();
    this.panel.querySelector('.post-call-toggle')?.remove();

    // Update header
    const title = this.panel.querySelector('.title');
    if (title) title.textContent = 'Generating Summary...';
    const status = this.panel.querySelector('.status-indicator') as HTMLElement;
    if (status) {
      status.style.background = '#f59e0b';
      status.style.animation = 'none';
    }

    this.panel.style.display = 'flex';
  }

  /**
   * Display the full summary card with post-call toggle.
   */
  showSummary(summary: CallSummary): void {
    this.currentSummary = summary;

    // Update header
    const title = this.panel.querySelector('.title');
    if (title) title.textContent = 'Call Summary';
    const status = this.panel.querySelector('.status-indicator') as HTMLElement;
    if (status) {
      status.style.background = '#8b5cf6';
      status.style.animation = 'none';
    }

    // Ensure summary container
    let summaryEl = this.panel.querySelector('.summary') as HTMLElement;
    if (!summaryEl) {
      summaryEl = document.createElement('div');
      summaryEl.className = 'summary';
      const content = this.panel.querySelector('.overlay-content');
      content?.appendChild(summaryEl);
    }

    // Build summary HTML
    let html = '';

    html += '<div class="summary-section"><h3>Summary</h3><ul class="summary-bullets">';
    if (summary.summary.length === 0) {
      html += '<li>No summary available</li>';
    } else {
      for (const bullet of summary.summary) {
        html += `<li>${this.escapeHtml(bullet)}</li>`;
      }
    }
    html += '</ul></div>';

    if (summary.actionItems.length > 0) {
      html += '<div class="summary-section"><h3>Action Items</h3>';
      for (const item of summary.actionItems) {
        const badgeClass = item.owner === 'you' ? 'you' : 'them';
        const badgeLabel = item.owner === 'you' ? 'YOU' : 'THEM';
        html += `<div class="action-item">
          <span class="owner-badge ${badgeClass}">${badgeLabel}</span>
          <span class="action-text">${this.escapeHtml(item.text)}</span>
        </div>`;
      }
      html += '</div>';
    }

    if (summary.keyMoments.length > 0) {
      html += `<div class="summary-section">
        <div class="key-moments-toggle">
          <span class="key-moments-arrow">&#9654;</span>
          <h3>Key Moments (${summary.keyMoments.length})</h3>
        </div>
        <div class="key-moments-list">`;
      for (const moment of summary.keyMoments) {
        html += `<div class="key-moment ${moment.type}">"${this.escapeHtml(moment.text)}"</div>`;
      }
      html += '</div></div>';
    }

    // Cost breakdown section (optional — only if data is present)
    if (summary.costEstimate) {
      const cost = summary.costEstimate;
      const minutes = Math.round(cost.audioMinutes);
      const llmLabel = cost.isFreeTier
        ? `${cost.providerLabel} (free tier)`
        : `${cost.providerLabel} (${cost.suggestionCount} calls)`;
      const llmValue = cost.isFreeTier ? 'Free \u2713' : `$${cost.llmCost.toFixed(3)}`;

      html += `<div class="cost-summary">
        <h4>Session Cost</h4>
        <div class="cost-line"><span>Deepgram STT (${minutes} min)</span><span>$${cost.deepgramCost.toFixed(3)}</span></div>
        <div class="cost-line"><span>${this.escapeHtml(llmLabel)}</span><span>${llmValue}</span></div>
        <div class="cost-line cost-total-line"><span>Total</span><span>~$${cost.totalCost.toFixed(2)}</span></div>
      </div>`;
    }

    summaryEl.innerHTML = html;
    summaryEl.style.display = 'block';

    // Wire key moments toggle
    const kmToggle = summaryEl.querySelector('.key-moments-toggle');
    const kmList = summaryEl.querySelector('.key-moments-list');
    const kmArrow = summaryEl.querySelector('.key-moments-arrow');
    if (kmToggle && kmList && kmArrow) {
      kmToggle.addEventListener('click', () => {
        kmList.classList.toggle('expanded');
        kmArrow.classList.toggle('expanded');
      });
    }

    // Hide timeline
    this.timelineEl.style.display = 'none';

    // Create post-call toggle and footer
    this.createPostCallToggle();
    this.createFooter();

    this.activePostCallView = 'summary';
    this.panel.style.display = 'flex';
  }

  /**
   * Create the post-call Summary/Timeline toggle.
   */
  private createPostCallToggle(): void {
    this.panel.querySelector('.post-call-toggle')?.remove();

    const toggle = document.createElement('div');
    toggle.className = 'post-call-toggle';
    toggle.innerHTML =
      `<button class="toggle-btn active" data-view="summary">Summary</button>` +
      `<button class="toggle-btn" data-view="timeline">Timeline</button>`;

    const header = this.panel.querySelector('.overlay-header');
    if (header?.nextSibling) {
      this.panel.insertBefore(toggle, header.nextSibling);
    } else {
      this.panel.appendChild(toggle);
    }

    toggle.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.toggle-btn');
      if (!btn) return;
      const view = btn.getAttribute('data-view') as 'summary' | 'timeline';
      if (view) this.setActivePostCallView(view);
    });
  }

  /**
   * Create the footer with Copy button and Drive status.
   */
  private createFooter(): void {
    this.panel.querySelector('.summary-footer')?.remove();

    const footer = document.createElement('div');
    footer.className = 'summary-footer';
    footer.innerHTML = `<button class="copy-btn">Copy</button><span class="drive-status"></span>`;

    const resizeHandle = this.panel.querySelector('.resize-handle');
    this.panel.insertBefore(footer, resizeHandle);

    const copyBtn = footer.querySelector('.copy-btn') as HTMLButtonElement;
    copyBtn.addEventListener('click', () => this.handleCopy(copyBtn));
  }

  /**
   * Switch between Summary and Timeline views post-call.
   */
  private setActivePostCallView(view: 'summary' | 'timeline'): void {
    this.activePostCallView = view;

    const summaryEl = this.panel.querySelector('.summary') as HTMLElement;

    if (view === 'summary') {
      this.timelineEl.style.display = 'none';
      if (summaryEl) summaryEl.style.display = 'block';
    } else {
      this.timelineEl.style.display = 'flex';
      if (summaryEl) summaryEl.style.display = 'none';
    }

    // Update toggle button active state
    const buttons = this.panel.querySelectorAll('.toggle-btn');
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === view);
    });
  }

  /**
   * Show error when summary generation fails. No auto-hide.
   */
  showSummaryError(message: string): void {
    // Ensure summary container
    let summaryEl = this.panel.querySelector('.summary') as HTMLElement;
    if (!summaryEl) {
      summaryEl = document.createElement('div');
      summaryEl.className = 'summary';
      const content = this.panel.querySelector('.overlay-content');
      content?.appendChild(summaryEl);
    }

    summaryEl.innerHTML =
      `<div class="summary-error">${this.escapeHtml(message)}<br>` +
      `<button class="view-timeline-btn">View Timeline</button></div>`;
    summaryEl.style.display = 'block';
    this.timelineEl.style.display = 'none';

    // Wire "View Timeline" button
    const viewTimelineBtn = summaryEl.querySelector('.view-timeline-btn');
    viewTimelineBtn?.addEventListener('click', () => this.setActivePostCallView('timeline'));

    // Update header
    const title = this.panel.querySelector('.title');
    if (title) title.textContent = 'Call Summary';
    const status = this.panel.querySelector('.status-indicator') as HTMLElement;
    if (status) {
      status.style.background = '#ea4335';
      status.style.animation = 'none';
    }

    // Create toggle and footer
    this.createPostCallToggle();
    this.createFooter();

    // NO auto-hide — let user decide
  }

  /**
   * Update the Drive save status indicator in the footer.
   */
  updateDriveStatus(result: { saved: boolean; fileUrl?: string }): void {
    const driveStatus = this.panel.querySelector('.drive-status');
    if (!driveStatus) return;
    if (result.saved) {
      driveStatus.textContent = 'Saved to Drive';
    }
  }

  /**
   * Handle copy-to-clipboard for summary or timeline.
   */
  private async handleCopy(btn: HTMLButtonElement): Promise<void> {
    try {
      let text: string;
      if (this.activePostCallView === 'summary' && this.currentSummary) {
        text = formatSummaryAsMarkdown(this.currentSummary);
      } else {
        text = this.formatTimelineAsText();
      }

      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied!';
    } catch {
      btn.textContent = 'Failed';
    }

    setTimeout(() => {
      btn.textContent = 'Copy';
    }, 2000);
  }

  /**
   * Serialize timeline entries as human-readable text for clipboard.
   */
  private formatTimelineAsText(): string {
    const lines: string[] = [];
    for (const entry of this.timeline) {
      const time = this.formatTime(entry.timestamp);
      if (entry.kind === 'transcript') {
        lines.push(`[${time}] ${entry.speaker || 'Unknown'}: ${entry.text || ''}`);
      } else {
        const type = (entry.suggestionType || 'info').toUpperCase();
        lines.push(`[${time}] Wingman [${type}]: ${entry.suggestionText || ''}`);
        if (entry.kbSource) {
          lines.push(`           Based on: ${entry.kbSource}`);
        }
      }
    }
    return lines.join('\n');
  }

  /**
   * Escape HTML to prevent XSS.
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Reset overlay to timeline view — clears loading/summary state.
   * Used when session ends without a summary but timeline has entries.
   */
  showTimelineView(): void {
    // Clear any loading or summary state
    const summaryEl = this.panel.querySelector('.summary') as HTMLElement;
    if (summaryEl) summaryEl.style.display = 'none';
    this.panel.querySelector('.summary-footer')?.remove();
    this.panel.querySelector('.post-call-toggle')?.remove();

    // Show timeline
    this.timelineEl.style.display = 'flex';

    // Reset header
    const title = this.panel.querySelector('.title');
    if (title) title.textContent = 'Wingman';
    const status = this.panel.querySelector('.status-indicator') as HTMLElement;
    if (status) {
      status.style.background = '#9aa0a6';
      status.style.animation = 'none';
    }

    this.panel.style.display = 'flex';
  }

  // ── LangBuilder Nav ──

  /**
   * Switch between Chat and LangBuilder tabs in the overlay nav.
   */
  private setActiveNavTab(tab: 'chat' | 'langbuilder'): void {
    this.activeNavTab = tab;
    const content = this.panel.querySelector('.overlay-content') as HTMLElement;
    const chatBtn = this.panel.querySelector('.nav-chat-btn') as HTMLElement;
    const lbBtn = this.panel.querySelector('.nav-lb-btn') as HTMLElement;

    if (tab === 'chat') {
      if (content) content.style.display = 'flex';
      if (this.langBuilderPanel) this.langBuilderPanel.style.display = 'none';
      chatBtn?.classList.add('active');
      lbBtn?.classList.remove('active');
    } else {
      if (content) content.style.display = 'none';
      if (this.langBuilderPanel) this.langBuilderPanel.style.display = 'flex';
      chatBtn?.classList.remove('active');
      lbBtn?.classList.add('active');
    }
  }

  /**
   * Check storage for LangBuilder config and show/hide the nav accordingly.
   */
  private loadLangBuilderVisibility(): void {
    try {
      chrome.storage.local.get(
        ['langbuilderUrl', 'langbuilderApiKey', 'langbuilderFlows', 'langbuilderLayoutMode'],
        (result) => {
          const configured = !!(result.langbuilderUrl && result.langbuilderApiKey);
          this.langBuilderConfigured = configured;

          if (this.overlayNav) {
            this.overlayNav.style.display = configured ? 'flex' : 'none';
          }
          if (this.layoutToggleBtn) {
            this.layoutToggleBtn.style.display = configured ? 'flex' : 'none';
          }

          // Load flows into the panel select
          if (configured && result.langbuilderFlows) {
            this.updateLangBuilderFlows(result.langbuilderFlows);
          }

          // Restore layout mode
          if (configured && result.langbuilderLayoutMode === 'side-by-side') {
            this.setLayoutMode('side-by-side');
          }
        },
      );

      // Live-update on storage changes
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.langbuilderUrl || changes.langbuilderApiKey) {
          chrome.storage.local.get(['langbuilderUrl', 'langbuilderApiKey'], (r) => {
            const configured = !!(r.langbuilderUrl && r.langbuilderApiKey);
            this.langBuilderConfigured = configured;
            if (this.overlayNav) {
              this.overlayNav.style.display = configured ? 'flex' : 'none';
            }
            if (this.layoutToggleBtn) {
              this.layoutToggleBtn.style.display = configured ? 'flex' : 'none';
            }
            if (!configured && this.layoutMode === 'side-by-side') {
              this.setLayoutMode('single');
            }
          });
        }
        if (changes.langbuilderFlows) {
          const flows = changes.langbuilderFlows.newValue;
          if (Array.isArray(flows)) {
            this.updateLangBuilderFlows(flows);
          }
        }
      });
    } catch {
      // Extension context may be invalid
    }
  }

  /**
   * Update the LangBuilder flow dropdown from a flows array.
   */
  private updateLangBuilderFlows(flows: { id: string; name: string }[]): void {
    if (!this.langBuilderFlowSelect) return;
    this.langBuilderFlowSelect.innerHTML = '';

    if (flows.length === 0) {
      const opt = document.createElement('option');
      opt.disabled = true;
      opt.selected = true;
      opt.textContent = 'No flows \u2014 configure in Settings';
      this.langBuilderFlowSelect.appendChild(opt);
      return;
    }

    const placeholder = document.createElement('option');
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = 'Select a flow...';
    this.langBuilderFlowSelect.appendChild(placeholder);

    for (const flow of flows) {
      const opt = document.createElement('option');
      opt.value = flow.id;
      opt.textContent = flow.name;
      this.langBuilderFlowSelect.appendChild(opt);
    }

    this.updateGoButtonState();
  }

  /**
   * Toggle layout between single-panel and side-by-side mode.
   */
  private setLayoutMode(mode: 'single' | 'side-by-side'): void {
    this.layoutMode = mode;
    const content = this.panel.querySelector('.overlay-content') as HTMLElement;

    if (mode === 'side-by-side') {
      // Save current width for restore
      this.singlePanelWidth = this.panel.style.width || null;

      // Show both panels
      if (content) content.style.display = 'flex';
      if (this.langBuilderPanel) {
        this.langBuilderPanel.style.display = 'flex';
        this.langBuilderPanel.style.order = '-1';
        this.langBuilderPanel.style.borderRight = `1px solid var(--overlay-border)`;
      }

      // Hide nav (both panels visible)
      if (this.overlayNav) this.overlayNav.style.display = 'none';

      // Widen panel
      this.panel.style.maxWidth = '900px';
      this.panel.style.width = `${Math.min(window.innerWidth - 40, 900)}px`;
    } else {
      // Restore single panel
      this.panel.style.maxWidth = '600px';
      if (this.singlePanelWidth) {
        this.panel.style.width = this.singlePanelWidth;
      }

      // Show nav, revert to active tab
      if (this.overlayNav && this.langBuilderConfigured) {
        this.overlayNav.style.display = 'flex';
      }

      if (this.langBuilderPanel) {
        this.langBuilderPanel.style.order = '';
        this.langBuilderPanel.style.borderRight = '';
      }

      this.setActiveNavTab(this.activeNavTab);
    }

    // Persist
    try {
      if (chrome.runtime?.id) {
        chrome.storage.local.set({ langbuilderLayoutMode: mode });
      }
    } catch {
      // ignore
    }
  }

  /**
   * Enable/disable Go button based on flow selection and input text.
   */
  private updateGoButtonState(): void {
    if (!this.langBuilderGoBtn || !this.langBuilderFlowSelect || !this.langBuilderInput) return;
    const hasFlow = this.langBuilderFlowSelect.selectedIndex > 0 ||
      (this.langBuilderFlowSelect.options.length > 0 && !this.langBuilderFlowSelect.options[0]?.disabled);
    const hasText = (this.langBuilderInput.value?.trim() || '').length > 0;
    this.langBuilderGoBtn.disabled = !hasFlow || !hasText;
  }

  /**
   * Run the selected LangBuilder flow via the service worker.
   */
  private async runLangBuilderFlow(): Promise<void> {
    if (!this.langBuilderFlowSelect || !this.langBuilderInput || !this.langBuilderResult) return;

    const flowId = this.langBuilderFlowSelect.value;
    const inputValue = this.langBuilderInput.value.trim();
    if (!flowId || !inputValue) return;

    // Disable Go, enable Cancel
    if (this.langBuilderGoBtn) this.langBuilderGoBtn.disabled = true;
    if (this.langBuilderCancelBtn) this.langBuilderCancelBtn.disabled = false;

    // Show loading state
    this.langBuilderResult.textContent = 'Running flow...';
    this.langBuilderResult.classList.add('loading');
    this.langBuilderResult.classList.remove('lb-result-error');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'RUN_LANGBUILDER_FLOW',
        flowId,
        inputValue,
      });

      this.langBuilderResult.classList.remove('loading');

      if (response?.success) {
        this.langBuilderResult.textContent = response.result || '(empty response)';
      } else {
        this.langBuilderResult.textContent = response?.error || 'Flow execution failed';
        this.langBuilderResult.classList.add('lb-result-error');
      }
    } catch (err) {
      this.langBuilderResult.classList.remove('loading');
      this.langBuilderResult.textContent = err instanceof Error ? err.message : 'Connection error';
      this.langBuilderResult.classList.add('lb-result-error');
    } finally {
      if (this.langBuilderCancelBtn) this.langBuilderCancelBtn.disabled = true;
      this.updateGoButtonState();
    }
  }

  /**
   * Cancel an in-flight LangBuilder flow execution.
   */
  private cancelLangBuilderFlow(): void {
    try {
      chrome.runtime.sendMessage({ type: 'CANCEL_LANGBUILDER_FLOW' });
    } catch {
      // Extension context may be invalid
    }

    if (this.langBuilderResult) {
      this.langBuilderResult.classList.remove('loading');
      this.langBuilderResult.textContent = 'Cancelled';
      this.langBuilderResult.classList.add('lb-result-error');
    }
    if (this.langBuilderCancelBtn) this.langBuilderCancelBtn.disabled = true;
    this.updateGoButtonState();
  }

  /**
   * Show the overlay
   */
  show(): void {
    this.panel.style.display = 'flex';
  }

  /**
   * Force-show the overlay: un-minimize, clear old session, ensure visibility.
   * Called at session start to guarantee a fresh timeline.
   */
  forceShow(): void {
    if (this.isMinimized) {
      this.isMinimized = false;
      this.panel.classList.remove('minimized');
    }
    this.clearTimeline();
    this.panel.style.display = 'flex';
  }

  /**
   * Hide the overlay. Preserves summary state for post-call toggle.
   */
  hide(): void {
    this.panel.style.display = 'none';
    // Do NOT clear currentSummary — preserves post-call toggle state
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

      const maxW = this.layoutMode === 'side-by-side' ? 900 : 600;
      const newWidth = Math.max(280, Math.min(maxW, startWidth + deltaX));
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
          const pos = result.overlayPosition;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const w = pos.width || 350;
          const h = pos.height || 450;

          const left = Math.max(0, Math.min(pos.left, vw - Math.min(w, 100)));
          const top = Math.max(0, Math.min(pos.top, vh - Math.min(h, 60)));

          this.panel.style.left = `${left}px`;
          this.panel.style.top = `${top}px`;
          this.panel.style.right = 'auto';
          if (pos.width) {
            this.panel.style.width = `${pos.width}px`;
          }
          if (pos.height) {
            this.panel.style.height = `${pos.height}px`;
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
    this.panel.style.fontSize = `${this.fontSize}px`;

    const title = this.panel.querySelector('.title') as HTMLElement;
    if (title) title.style.fontSize = `${this.fontSize + 1}px`;

    // Bubble text
    const bubbleTexts = this.panel.querySelectorAll('.bubble-text') as NodeListOf<HTMLElement>;
    bubbleTexts.forEach(el => { el.style.fontSize = `${this.fontSize}px`; });

    // Timestamps
    const bubbleTimes = this.panel.querySelectorAll('.bubble-time') as NodeListOf<HTMLElement>;
    bubbleTimes.forEach(el => { el.style.fontSize = `${this.fontSize - 3}px`; });

    // Wingman labels
    const wingmanLabels = this.panel.querySelectorAll('.wingman-label') as NodeListOf<HTMLElement>;
    wingmanLabels.forEach(el => { el.style.fontSize = `${this.fontSize - 2}px`; });

    // Badges
    const badges = this.panel.querySelectorAll('.badge') as NodeListOf<HTMLElement>;
    badges.forEach(el => { el.style.fontSize = `${this.fontSize - 4}px`; });

    // KB source
    const sources = this.panel.querySelectorAll('.bubble-source') as NodeListOf<HTMLElement>;
    sources.forEach(el => { el.style.fontSize = `${this.fontSize - 2}px`; });

    // Speaker labels
    const speakerLabels = this.panel.querySelectorAll('.speaker-label') as NodeListOf<HTMLElement>;
    speakerLabels.forEach(el => { el.style.fontSize = `${this.fontSize - 2}px`; });

    // Empty state
    const emptyState = this.panel.querySelector('.empty-state') as HTMLElement;
    if (emptyState) emptyState.style.fontSize = `${this.fontSize}px`;
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
