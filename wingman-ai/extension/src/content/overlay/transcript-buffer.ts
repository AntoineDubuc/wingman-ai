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

class TranscriptBuffer {
  private entries: TranscriptEntry[] = [];
  private subscribers: Subscriber[] = [];

  append(entry: TranscriptEntry): void {
    this.entries.push(entry);
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
