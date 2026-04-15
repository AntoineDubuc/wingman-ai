/**
 * Boundary validator for `transcript` messages entering the content-script
 * from the service worker. Per CLAUDE.md "validate at system boundaries":
 * the buffer trusts its caller; this is the one chokepoint where a malformed
 * message gets rejected.
 *
 * Used by `transcript-handler.ts` (runtime) and exercised directly by unit
 * tests (pure function, no chrome.* dependency).
 */

import type { TranscriptEntry } from './transcript-buffer';

/**
 * Type guard for TranscriptEntry. Verifies all 5 required fields:
 *   - text: non-empty string
 *   - speaker: string
 *   - is_final: boolean
 *   - is_self: boolean
 *   - timestamp: non-empty string
 */
export function isValidTranscriptMessage(data: unknown): data is TranscriptEntry {
  if (data === null || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (typeof d.text !== 'string' || d.text.length === 0) return false;
  if (typeof d.speaker !== 'string') return false;
  if (typeof d.is_final !== 'boolean') return false;
  if (typeof d.is_self !== 'boolean') return false;
  if (typeof d.timestamp !== 'string' || d.timestamp.length === 0) return false;
  return true;
}
