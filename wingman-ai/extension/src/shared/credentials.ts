/**
 * Shared credential management for the setup-folder-import feature (Task 4).
 *
 * Exports:
 *   - `CREDENTIAL_KEYS` — frozen allowlist of the 9 canonical storage keys.
 *   - `Credentials` — the full credential shape (all 9 fields required).
 *   - `writeCredentials(creds)` — the ONLY function in the codebase that
 *     writes credential keys to `chrome.storage.local`. Iterates over
 *     CREDENTIAL_KEYS, validates types/lengths/URLs, rejects unknown keys.
 *   - `readCredentials()` — reads all 9 keys, returns empty strings for
 *     unset keys. Never returns undefined.
 *   - `validateLangbuilderUrl(url)` — URL scheme/host/userinfo/search/hash
 *     validator. Defends against homograph, SSRF, query exfil.
 *   - `diffCredentials(previous, next)` — computes the write/clear delta
 *     for re-import scenarios where stale keys must be cleared.
 *
 * Security-critical. Every constant here is the single source of truth.
 * See Research/features/setup-folder-import/implementation_plan.md Task 4.
 */

/**
 * The 9 canonical credential storage keys. Frozen to prevent runtime tampering.
 * Single source of truth — any future credential must be added here AND to
 * the Credentials interface in lockstep, with a test to catch drift.
 */
export const CREDENTIAL_KEYS = Object.freeze([
  'deepgramApiKey',
  'geminiApiKey',
  'openrouterApiKey',
  'groqApiKey',
  'humeApiKey',
  'humeSecretKey',
  'langbuilderApiKey',
  'langbuilderUrl',
  'langbuilderFlowId',
] as const);

export type CredentialKey = (typeof CREDENTIAL_KEYS)[number];

/** Full credential shape. Empty string = unset. */
export interface Credentials {
  deepgramApiKey: string;
  geminiApiKey: string;
  openrouterApiKey: string;
  groqApiKey: string;
  humeApiKey: string;
  humeSecretKey: string;
  langbuilderApiKey: string;
  langbuilderUrl: string;
  langbuilderFlowId: string;
}

/** Closed enum of rejection reason codes. Never extend with user input. */
export type WriteCredentialsRejectReason =
  | 'unknown_key'
  | 'bad_type'
  | 'too_long'
  | 'bad_url_scheme'
  | 'bad_url_host'
  | 'bad_url_format'
  | 'bad_url_userinfo'
  | 'bad_url_search'
  | 'bad_url_hash'
  | 'control_char';

export interface WriteCredentialsRejection {
  key: string;
  reason: WriteCredentialsRejectReason;
}

export interface WriteCredentialsResult {
  /** Keys written to storage with non-empty values. */
  written: CredentialKey[];
  /** Keys cleared from storage (empty-string input). */
  cleared: CredentialKey[];
  /** Keys that failed validation — NOT written. Reason is a closed-enum code. */
  rejected: WriteCredentialsRejection[];
}

/** Max size of any credential value, in bytes. */
const MAX_CREDENTIAL_LENGTH = 4096;

/** ASCII control characters rejected in any credential value. */
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

/** IPv4 literal pattern for hostname rejection. */
const IPV4_LITERAL_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

/**
 * Writes credentials to `chrome.storage.local` with hard-allowlist enforcement.
 *
 * Rules:
 *   - Iterates CREDENTIAL_KEYS (not Object.keys(creds)) — unknown keys are
 *     NOT written and are reported as `unknown_key` rejections.
 *   - Non-string values are rejected as `bad_type`.
 *   - Values containing ASCII control chars rejected as `control_char`.
 *   - Values > 4096 bytes rejected as `too_long`.
 *   - Whitespace-only values trim to empty and CLEAR the stored key.
 *   - Empty-string values CLEAR the stored key.
 *   - `langbuilderUrl` runs through `validateLangbuilderUrl` — multiple
 *     possible URL rejection reasons.
 *   - Empty input object `{}` is a no-op (does NOT clear existing keys).
 *
 * @param creds Partial credentials object. Unknown keys are rejected.
 * @returns Write result with three arrays: written, cleared, rejected.
 */
export async function writeCredentials(
  creds: Partial<Credentials>
): Promise<WriteCredentialsResult> {
  const written: CredentialKey[] = [];
  const cleared: CredentialKey[] = [];
  const rejected: WriteCredentialsRejection[] = [];

  // Build two buckets: one to set, one to remove.
  // We iterate ONLY over the allowlist, never over Object.keys(creds) —
  // this is the defense against prototype pollution and injected keys.
  const toSet: Record<string, string> = {};
  const toRemove: string[] = [];

  for (const key of CREDENTIAL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(creds, key)) {
      continue; // key not in input — ignore, no change to storage
    }
    const rawValue = (creds as Record<string, unknown>)[key];

    // Type check FIRST — null/number/object all rejected.
    if (typeof rawValue !== 'string') {
      rejected.push({ key, reason: 'bad_type' });
      continue;
    }

    // Whitespace-only values trim to empty and become clear.
    const trimmed = rawValue.trim();
    if (trimmed.length === 0) {
      toRemove.push(key);
      cleared.push(key);
      continue;
    }

    // Length cap.
    if (rawValue.length > MAX_CREDENTIAL_LENGTH) {
      rejected.push({ key, reason: 'too_long' });
      continue;
    }

    // Control character check.
    if (CONTROL_CHAR_REGEX.test(rawValue)) {
      rejected.push({ key, reason: 'control_char' });
      continue;
    }

    // URL validation for langbuilderUrl.
    if (key === 'langbuilderUrl') {
      const urlResult = validateLangbuilderUrl(rawValue);
      if (!urlResult.valid) {
        rejected.push({ key, reason: urlResult.reason });
        continue;
      }
    }

    toSet[key] = rawValue;
    written.push(key);
  }

  // Report unknown keys present in the input but not in the allowlist.
  // We walk Object.keys(creds) for this report ONLY — never for storage writes.
  for (const inputKey of Object.keys(creds)) {
    if (!(CREDENTIAL_KEYS as readonly string[]).includes(inputKey)) {
      rejected.push({ key: inputKey, reason: 'unknown_key' });
    }
  }

  // Apply storage writes and removes.
  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
  }
  if (toRemove.length > 0) {
    await chrome.storage.local.remove(toRemove);
  }

  return { written, cleared, rejected };
}

/**
 * Reads all 9 credential keys from storage. Missing keys return empty string.
 */
export async function readCredentials(): Promise<Credentials> {
  const stored = await chrome.storage.local.get(CREDENTIAL_KEYS as unknown as string[]);
  const result: Partial<Credentials> = {};
  for (const key of CREDENTIAL_KEYS) {
    const v = stored[key];
    (result as Record<string, string>)[key] = typeof v === 'string' ? v : '';
  }
  return result as Credentials;
}

// =============================================================================
// LangBuilder URL validator
// =============================================================================

export type LangbuilderUrlRejectReason =
  | 'bad_url_scheme'
  | 'bad_url_host'
  | 'bad_url_format'
  | 'bad_url_userinfo'
  | 'bad_url_search'
  | 'bad_url_hash';

export type ValidateLangbuilderUrlResult =
  | { valid: true; parsed: URL }
  | { valid: false; reason: LangbuilderUrlRejectReason };

/**
 * Validates that a string is a safe LangBuilder base URL.
 *
 * Six checks, in order:
 *   1. Parseable by `new URL(...)`.
 *   2. Protocol is `https:`. HTTP, javascript:, data:, file:, etc. all rejected.
 *   3. Userinfo is empty (no `user@host` or `user:pass@host`).
 *   4. Hostname is not a literal IPv4 or IPv6 address (SSRF defense).
 *   5. Search (query string) is empty.
 *   6. Hash (fragment) is empty.
 *
 * Returns `{ valid: true, parsed }` with the parsed URL object on success,
 * or `{ valid: false, reason }` with a closed-enum reason code on failure.
 */
export function validateLangbuilderUrl(url: string): ValidateLangbuilderUrlResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: 'bad_url_format' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: 'bad_url_scheme' };
  }

  // Userinfo rejection — defeats `https://attacker.example@trusted.example`
  // where the real hostname is `trusted.example` but a human reader sees
  // `attacker.example`. Round 4 critical finding.
  if (parsed.username !== '' || parsed.password !== '') {
    return { valid: false, reason: 'bad_url_userinfo' };
  }

  // Hostname must not be a literal IPv4 or IPv6 address.
  // IPv6 in a URL is wrapped in brackets: https://[::1]/
  // IPv4 is raw dotted-decimal: https://127.0.0.1/
  if (parsed.hostname.startsWith('[')) {
    return { valid: false, reason: 'bad_url_host' };
  }
  if (IPV4_LITERAL_REGEX.test(parsed.hostname)) {
    return { valid: false, reason: 'bad_url_host' };
  }

  // Search and hash must be empty — the LangBuilder client appends its own
  // query params, so a base URL with `?...` would prepend attacker-controlled
  // params to every request.
  if (parsed.search !== '') {
    return { valid: false, reason: 'bad_url_search' };
  }
  if (parsed.hash !== '') {
    return { valid: false, reason: 'bad_url_hash' };
  }

  return { valid: true, parsed };
}

// =============================================================================
// diffCredentials
// =============================================================================

export interface CredentialsDiff {
  /** Keys whose value changed OR is newly set. */
  toWrite: Partial<Credentials>;
  /** Keys that exist in previous but are absent/empty in next (stale). */
  toClear: CredentialKey[];
}

/**
 * Computes the write/clear delta between the current stored credentials and
 * a new credential set. Used by the import flow to handle stale keys —
 * when a user re-imports a `.env` that no longer contains a previously-set
 * credential, the stale key must be cleared.
 *
 * Rules:
 *   - Key present in `next` with different value → toWrite
 *   - Key present in `previous` (non-empty) but absent from `next` → toClear
 *   - Key present in both with same value → neither (no-op)
 *
 * @param previous Current credentials (from `readCredentials()`)
 * @param next Partial incoming credentials (from `parseDotEnv()` output)
 */
export function diffCredentials(
  previous: Credentials,
  next: Partial<Credentials>
): CredentialsDiff {
  const toWrite: Partial<Credentials> = {};
  const toClear: CredentialKey[] = [];

  for (const key of CREDENTIAL_KEYS) {
    const prevValue = previous[key] ?? '';
    const nextValue = next[key];

    if (nextValue === undefined) {
      // Key is absent from `next`. If it was set in previous, it's now stale → clear.
      if (prevValue !== '') {
        toClear.push(key);
      }
      continue;
    }

    if (nextValue !== prevValue) {
      (toWrite as Record<string, string>)[key] = nextValue;
    }
    // If nextValue === prevValue, no-op (neither write nor clear).
  }

  return { toWrite, toClear };
}
