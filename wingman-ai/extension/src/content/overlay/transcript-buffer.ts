// INVARIANT: never clear this buffer during an active meeting. The Assistant
// view reads it at chat-send time and relies on full-meeting history. SW
// `transcript-collector.ts` has a different lifecycle — it is unrelated.

/**
 * TranscriptBuffer — append-only, read-only transcript store for the
 * in-meeting assistant content script. Shape-compatible with the existing
 * `Transcript` interface at `src/content/overlay.ts:23-29` so the live
 * transcript pipeline can hand entries to `append` without a mapping layer.
 *
 * Public contract:
 *   - append(entry): push onto internal array + notify subscribers
 *   - getSnapshot(): return a defensive copy of the internal array
 *   - onAppend(cb): register a subscriber, returns an unsubscribe function
 *
 * The buffer is intentionally missing any public clear/reset/delete method.
 */

export interface TranscriptEntry {
  text: string;
  speaker: string;
  is_final: boolean;
  is_self: boolean;
  timestamp: string;
}

type Subscriber = (entry: TranscriptEntry) => void;

// Observability threshold: emits a one-shot warn on the append where the
// internal array first reaches this size. Does NOT truncate — future plans
// can add a cursor API if this fires in real meetings.
const SOFT_LIMIT_ENTRIES = 20_000;

// Subscriber cap: v1 expects ≤ 2 (MeetingView, AssistantView). 8 gives
// headroom; throwing beyond it makes subscription leaks loud not silent.
const MAX_SUBSCRIBERS = 8;

class TranscriptBuffer {
  private entries: TranscriptEntry[] = [];
  private subscribers: Subscriber[] = [];
  private hasWarnedSoftLimit = false;

  append(entry: TranscriptEntry): void {
    this.entries.push(entry);
    const length = this.entries.length;
    if (!this.hasWarnedSoftLimit && length >= SOFT_LIMIT_ENTRIES) {
      this.hasWarnedSoftLimit = true;
      console.warn('[TranscriptBuffer] soft limit reached: ' + length + ' entries');
    }
    // Copy subscriber list so unsubscribes during iteration don't shift indices.
    const snapshot = this.subscribers.slice();
    for (const cb of snapshot) {
      try {
        cb(entry);
      } catch (err) {
        console.debug('[TranscriptBuffer] subscriber threw', err);
      }
    }
  }

  getSnapshot(): TranscriptEntry[] {
    return this.entries.slice();
  }

  onAppend(callback: Subscriber): () => void {
    if (this.subscribers.length >= MAX_SUBSCRIBERS) {
      throw new Error('TranscriptBuffer: exceeded MAX_SUBSCRIBERS (8)');
    }
    this.subscribers.push(callback);
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      const idx = this.subscribers.indexOf(callback);
      if (idx !== -1) {
        this.subscribers.splice(idx, 1);
      }
    };
  }
}

// Export singleton instance (pattern matches `transcriptCollector` at
// src/services/transcript-collector.ts:157).
export const transcriptBuffer = new TranscriptBuffer();
