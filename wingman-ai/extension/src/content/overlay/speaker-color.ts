/**
 * speakerColor — deterministic HSL color from a speaker name.
 * Task 5 of Plan 2 (Overlay Shell + MeetingView).
 *
 * Hash: Array.from(name).reduce((a, c) => a * 31 + c.charCodeAt(0), 0) & 0x7fffffff
 * Result: hsl(hue, 65%, 50%) where hue = hash % 360.
 * Collisions acceptable for typical meeting sizes (3-5 speakers).
 */

export function speakerColor(name: string): string {
  const hash = Array.from(name).reduce((a, c) => a * 31 + c.charCodeAt(0), 0) & 0x7fffffff;
  const hue = hash % 360;
  return `hsl(${hue}, 65%, 50%)`;
}
