/**
 * MeetingView — renders final transcript entries from TranscriptBuffer.
 *
 * Subscribes to the buffer's onAppend and renders entries into a container.
 * Does NOT store transcript data — the buffer is the single source of truth.
 * Tracks rendered DOM elements only for correction-window replacement.
 *
 * Task 4 of Plan 2 (Overlay Shell + MeetingView).
 */

import type { TranscriptEntry } from './transcript-buffer';
import type { transcriptBuffer as TranscriptBufferInstance } from './transcript-buffer';

/** The shape we need from the buffer (typeof the singleton). */
type Buffer = typeof TranscriptBufferInstance;

// Correction window: same speaker within this period replaces the last entry.
const CORRECTION_WINDOW_MS = 500;

// Auto-scroll threshold: if within this many px of the bottom, auto-scroll.
const SCROLL_THRESHOLD = 50;

export class MeetingView {
  private buffer: Buffer;
  private container: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;

  // DOM-only tracking for correction window. No transcript data stored.
  private lastRenderedElement: HTMLElement | null = null;
  private lastRenderedSpeaker: string | null = null;
  private lastRenderedTime: number | null = null;

  // Auto-scroll state
  private isNearBottom = true;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
  }

  /**
   * Mount the view into a container element.
   * Reads the buffer snapshot and renders all existing entries,
   * then subscribes to future appends.
   *
   * Throws if already mounted (call unmount first).
   */
  mount(container: HTMLElement): void {
    if (this.unsubscribe !== null) {
      throw new Error('MeetingView already mounted');
    }

    this.container = container;

    // Listen for scroll to detect if user scrolled up
    this.container.addEventListener('scroll', this.handleScroll);

    // Render existing entries from buffer snapshot
    const snapshot = this.buffer.getSnapshot();
    for (const entry of snapshot) {
      this.appendEntry(entry);
    }

    // Subscribe to future appends
    this.unsubscribe = this.buffer.onAppend(this.appendEntry.bind(this));
  }

  /**
   * Unmount the view — unsubscribes from buffer and cleans up.
   */
  unmount(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.container) {
      this.container.removeEventListener('scroll', this.handleScroll);
    }
    this.container = null;
    this.lastRenderedElement = null;
    this.lastRenderedSpeaker = null;
    this.lastRenderedTime = null;
  }

  /**
   * Append a single transcript entry to the container.
   * Handles correction window (same speaker within 500ms replaces last entry).
   */
  appendEntry(entry: TranscriptEntry): void {
    if (!this.container) return;

    const now = Date.now();
    const speakerKey = entry.is_self ? 'self' : entry.speaker;

    // Correction window: same speaker within 500ms → replace last entry
    if (
      this.lastRenderedElement &&
      this.lastRenderedSpeaker === speakerKey &&
      this.lastRenderedTime !== null &&
      now - this.lastRenderedTime < CORRECTION_WINDOW_MS
    ) {
      // Update the existing element's text in place
      const textEl = this.lastRenderedElement.querySelector('.bubble-text');
      if (textEl) {
        textEl.textContent = entry.text;
      }
      this.lastRenderedTime = now;
      this.scrollToBottom();
      return;
    }

    // Create new transcript entry element
    const el = document.createElement('div');
    el.className = 'transcript-entry';

    const textSpan = document.createElement('span');
    textSpan.className = 'bubble-text';
    textSpan.textContent = entry.text;
    el.appendChild(textSpan);

    this.container.appendChild(el);

    // Track for correction window (DOM element reference only, no data copy)
    this.lastRenderedElement = el;
    this.lastRenderedSpeaker = speakerKey;
    this.lastRenderedTime = now;

    this.scrollToBottom();
  }

  // ── Auto-Scroll ──

  private handleScroll = (): void => {
    if (!this.container) return;
    const { scrollTop, scrollHeight, clientHeight } = this.container;
    this.isNearBottom = scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
  };

  private scrollToBottom(): void {
    if (this.isNearBottom && this.container) {
      requestAnimationFrame(() => {
        if (this.container) {
          this.container.scrollTop = this.container.scrollHeight;
        }
      });
    }
  }
}
