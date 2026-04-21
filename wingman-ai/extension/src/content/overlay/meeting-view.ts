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
import { speakerColor } from './speaker-color';

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

  // Live speaking indicator (Task 6)
  private liveIndicator: HTMLElement | null = null;
  private liveIndicatorSpeakerText: HTMLElement | null = null;

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

    // Create live speaking indicator (Task 6) — always last child
    this.liveIndicator = createLiveIndicator();
    this.liveIndicatorSpeakerText = this.liveIndicator.querySelector('.speaker-text');
    this.container.appendChild(this.liveIndicator);

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
    this.liveIndicator = null;
    this.liveIndicatorSpeakerText = null;
    this.lastRenderedElement = null;
    this.lastRenderedSpeaker = null;
    this.lastRenderedTime = null;
  }

  /**
   * Append a single transcript entry to the container.
   * Handles correction window (same speaker within 500ms replaces last entry).
   *
   * DOM structure (Task 5 avatar-list design):
   *   .transcript-entry
   *     .transcript-speaker
   *       .speaker-avatar  (colored circle with initials)
   *       .speaker-name    (speaker name)
   *       .speaker-time    (HH:MM:SS)
   *     .transcript-text   (spoken text, 32px padding-left)
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
      const textEl = this.lastRenderedElement.querySelector('.transcript-text');
      if (textEl) {
        textEl.textContent = entry.text;
      }
      this.lastRenderedTime = now;
      this.scrollToBottom();
      return;
    }

    // Create new transcript entry element
    // Add .self class when this is the user's own line so CSS can chat-align it.
    // entry.is_self is a required boolean on TranscriptEntry, but `=== true` guards
    // against any upstream code path passing undefined (defensive — validator catches it).
    const el = document.createElement('div');
    el.className = entry.is_self === true ? 'transcript-entry self' : 'transcript-entry';

    // Speaker row: avatar + name + time
    const speakerRow = document.createElement('div');
    speakerRow.className = 'transcript-speaker';

    const avatar = document.createElement('div');
    avatar.className = 'speaker-avatar';
    avatar.style.background = speakerColor(entry.speaker);
    avatar.textContent = extractInitials(entry.speaker);

    const nameEl = document.createElement('div');
    nameEl.className = 'speaker-name';
    nameEl.textContent = entry.speaker;

    const timeEl = document.createElement('div');
    timeEl.className = 'speaker-time';
    timeEl.textContent = formatTimestamp(entry.timestamp);

    speakerRow.appendChild(avatar);
    speakerRow.appendChild(nameEl);
    speakerRow.appendChild(timeEl);

    // Transcript text
    const textDiv = document.createElement('div');
    textDiv.className = 'transcript-text';
    textDiv.textContent = entry.text;

    el.appendChild(speakerRow);
    el.appendChild(textDiv);

    // Insert before the live indicator so it stays last child
    if (this.liveIndicator) {
      this.container.insertBefore(el, this.liveIndicator);
    } else {
      this.container.appendChild(el);
    }

    // Track for correction window (DOM element reference only, no data copy)
    this.lastRenderedElement = el;
    this.lastRenderedSpeaker = speakerKey;
    this.lastRenderedTime = now;

    this.scrollToBottom();
  }

  // ── Live Indicator (Task 6) ──

  /**
   * Show the live speaking indicator with the given speaker name.
   * If speaker is empty, shows "Someone is speaking...".
   * For self ("You"), renders "You are speaking…" instead of "You is speaking…".
   */
  showLiveIndicator(speaker: string): void {
    if (!this.liveIndicator || !this.liveIndicatorSpeakerText) return;
    const displayName = speaker.trim() || 'Someone';
    const verbPhrase = displayName === 'You' ? 'are speaking' : 'is speaking';
    this.liveIndicatorSpeakerText.textContent = `${displayName} ${verbPhrase}\u2026`;
    this.liveIndicator.classList.add('active');
    this.scrollToBottom();
  }

  /**
   * Hide the live speaking indicator.
   */
  hideLiveIndicator(): void {
    if (!this.liveIndicator) return;
    this.liveIndicator.classList.remove('active');
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

// ── Helpers (module-private) ──

/**
 * Extract 2-letter initials from a speaker name.
 * - "Sarah K." → "SK" (first char of first + last word)
 * - "John Doe" → "JD"
 * - "Alice Bob Charlie" → "AC" (first + last word)
 * - "Madonna" → "MA" (mononym: first 2 chars)
 * - "" → "??"
 */
function extractInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '??';

  const words = trimmed.split(/\s+/);
  if (words.length === 1) {
    // Mononym: first 2 chars (codepoint-safe via spread)
    const chars = [...words[0]!];
    if (chars.length < 2) {
      return (chars[0] ?? '?').toUpperCase() + '?';
    }
    return (chars[0]! + chars[1]!).toUpperCase();
  }

  // Multi-word: first char of first word + first char of last word
  const first = [...words[0]!][0] ?? '?';
  const last = [...words[words.length - 1]!][0] ?? '?';
  return (first + last).toUpperCase();
}

/**
 * Format an ISO timestamp to HH:MM:SS.
 */
function formatTimestamp(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp);
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  } catch {
    return '00:00:00';
  }
}

/**
 * Create the live speaking indicator element (Task 6).
 *
 * DOM structure:
 *   .transcript-live-indicator
 *     .typing-dots > span span span
 *     span.speaker-text
 */
function createLiveIndicator(): HTMLElement {
  const indicator = document.createElement('div');
  indicator.className = 'transcript-live-indicator';

  const dots = document.createElement('div');
  dots.className = 'typing-dots';
  for (let i = 0; i < 3; i++) {
    dots.appendChild(document.createElement('span'));
  }

  const speakerText = document.createElement('span');
  speakerText.className = 'speaker-text';

  indicator.appendChild(dots);
  indicator.appendChild(speakerText);

  return indicator;
}
