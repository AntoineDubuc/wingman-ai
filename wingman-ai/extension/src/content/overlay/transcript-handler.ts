/**
 * Pure handler for the content-script `transcript` message case.
 * Extracted as a standalone function so it can be unit-tested without
 * spinning up the full content-script (which registers chrome.runtime
 * listeners at module load and is therefore awkward to import in tests).
 *
 * Wiring contract (Task 2 AC):
 *   1. Validate the full 5-field TranscriptEntry shape at the boundary.
 *   2. Call overlay.updateTranscript(entry) FIRST so any throw from the
 *      buffer append does NOT block the existing rendering pipeline.
 *   3. Then call transcriptBuffer.append(entry); swallow any throw so
 *      buffer failures never crash the content script.
 */

import { isValidTranscriptMessage } from './transcript-validator';
import type { TranscriptEntry } from './transcript-buffer';

interface OverlayLike {
  updateTranscript: (entry: TranscriptEntry) => void;
}

interface BufferLike {
  append: (entry: TranscriptEntry) => void;
}

export function handleTranscriptMessage(
  data: unknown,
  overlay: OverlayLike,
  buffer: BufferLike,
): void {
  if (!isValidTranscriptMessage(data)) {
    console.warn('[ContentScript] skipping malformed transcript', data);
    return;
  }

  // Order matters: overlay render FIRST so a buffer throw cannot block it.
  overlay.updateTranscript(data);

  try {
    buffer.append(data);
  } catch (err) {
    // Buffer failures must never propagate — rendering has already happened.
    console.debug('[ContentScript] transcriptBuffer.append threw', err);
  }
}
