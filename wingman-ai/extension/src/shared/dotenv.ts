/**
 * Minimal, dependency-free `.env` parser for the setup-folder-import feature.
 *
 * Security rules (enforced by tests in tests/dotenv.test.ts):
 *   - Strips UTF-8 BOM before parsing (Windows Notepad compatibility).
 *   - Processes input line by line; no greedy regex over the full text.
 *   - Per-line max 8192 bytes; longer lines rejected with `line_too_long`.
 *   - Values containing ASCII control characters (except tab/LF/CR) rejected
 *     with `control_char` — defeats header injection via \x00.
 *   - Keys must match /^[A-Z_][A-Z0-9_]*$/ (upper-snake-case, underscore/digit).
 *   - Closed-enum reason codes only: never raw line text, never values.
 *   - Never calls console.* — no credential leakage to DevTools.
 *   - Does not retain the raw input after the call returns.
 */

/** Closed enum of reason codes. Never extend with user-supplied strings. */
export type DotEnvParseErrorReason =
  | 'malformed'
  | 'control_char'
  | 'line_too_long'
  | 'bad_key_format';

export interface DotEnvParseError {
  /** 1-indexed line number. 0 means "input was null/undefined or pre-line failure." */
  line: number;
  /** Closed-enum reason — see DotEnvParseErrorReason. Never raw text. */
  reason: DotEnvParseErrorReason;
}

export interface DotEnvParseResult {
  result: Record<string, string>;
  errors: DotEnvParseError[];
}

/** Maximum byte length per line. 8KB is 40x the longest legitimate API key. */
const MAX_LINE_LENGTH = 8192;

/**
 * ASCII control characters that MUST NOT appear in any value.
 * Allows tab (\x09), LF (\x0a), CR (\x0d) — though LF/CR are split before
 * this check runs, so they cannot appear in a per-line value.
 * Rejects: NUL, SOH..BS, VT, FF, SO..US, DEL.
 */
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

/**
 * Per-line regex. Anchored, bounded-time on any line up to MAX_LINE_LENGTH.
 * Captures: [1] = key, [2] = value (before quote stripping).
 */
const LINE_REGEX = /^(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/;

/**
 * Parses a `.env` file string into a key/value map plus a structured error list.
 *
 * Does NOT throw. Does NOT log. Does NOT retain the raw input after returning.
 * Unknown keys (lowercase, digits-first, etc.) are reported as `bad_key_format`
 * in the errors list but never written to `result`.
 *
 * @param raw The raw file contents. Accepts any input defensively.
 * @returns Parse result with `result` map and `errors` array.
 */
export function parseDotEnv(raw: string): DotEnvParseResult {
  // Defensive boundary: non-string input produces a single 'malformed' error.
  if (typeof raw !== 'string') {
    return { result: {}, errors: [{ line: 0, reason: 'malformed' }] };
  }

  // Strip UTF-8 BOM. Windows Notepad writes this by default; without stripping,
  // the first line's KEY won't match the anchored regex.
  const text = raw.replace(/^\uFEFF/, '');

  // Wrap the main loop in try/catch to ensure no parser exception propagates
  // with raw input in the error message.
  try {
    const result: Record<string, string> = {};
    const errors: DotEnvParseError[] = [];

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i]!;
      const lineNumber = i + 1;

      // Max length check FIRST — prevents ReDoS-adjacent greedy matching.
      if (rawLine.length > MAX_LINE_LENGTH) {
        errors.push({ line: lineNumber, reason: 'line_too_long' });
        continue;
      }

      const line = rawLine.trim();

      // Skip blank lines and comment lines — not errors, not values.
      if (line.length === 0 || line.startsWith('#')) {
        continue;
      }

      const match = LINE_REGEX.exec(line);
      if (!match) {
        // Differentiate "has `=` but bad key format" from "no `=` at all".
        // Both are rejected; different reason codes help debugging.
        if (line.includes('=')) {
          errors.push({ line: lineNumber, reason: 'bad_key_format' });
        } else {
          errors.push({ line: lineNumber, reason: 'malformed' });
        }
        continue;
      }

      const key = match[1]!;
      let value = match[2]!.trim();

      // Strip surrounding quotes (single OR double, must match).
      if (value.length >= 2) {
        const first = value[0]!;
        const last = value[value.length - 1]!;
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
          value = value.slice(1, -1);
        }
      }

      // Reject control characters in the final value. This is the null-byte
      // header-injection defense — see review_security.md#Finding-9.
      if (CONTROL_CHAR_REGEX.test(value)) {
        errors.push({ line: lineNumber, reason: 'control_char' });
        continue;
      }

      result[key] = value;
    }

    return { result, errors };
  } catch {
    // Defensive: any unexpected parser exception returns a generic error.
    // The original error message (which might contain raw input) is discarded.
    return { result: {}, errors: [{ line: 0, reason: 'malformed' }] };
  }
}
