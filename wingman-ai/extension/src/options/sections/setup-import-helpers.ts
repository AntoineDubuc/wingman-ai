/**
 * Pure helpers for SetupImportSection. Extracted here so they can be
 * unit-tested without a DOM environment.
 *
 * Part of the setup-folder-import feature (Task 5).
 */

import { parseDotEnv } from '../../shared/dotenv';
import { validatePersonaImportEnvelope } from '../../shared/persona';
import { type Credentials } from '../../shared/credentials';
import type { ParsedPersonaFile } from '../../shared/persona-merge';

/**
 * Mapping from `.env` uppercase-snake-case key to `chrome.storage.local`
 * camelCase storage key. This is the contract between the user's `.env`
 * file and the extension's internal storage schema.
 *
 * Frozen — any new credential requires adding both the storage key (to
 * CREDENTIAL_KEYS in credentials.ts) AND the .env name here.
 */
export const ENV_KEY_TO_STORAGE_KEY: Readonly<Record<string, keyof Credentials>> = Object.freeze({
  DEEPGRAM_API_KEY: 'deepgramApiKey',
  GEMINI_API_KEY: 'geminiApiKey',
  OPENROUTER_API_KEY: 'openrouterApiKey',
  GROQ_API_KEY: 'groqApiKey',
  HUME_API_KEY: 'humeApiKey',
  HUME_SECRET_KEY: 'humeSecretKey',
  LANGBUILDER_API_KEY: 'langbuilderApiKey',
  LANGBUILDER_URL: 'langbuilderUrl',
  LANGBUILDER_FLOW_ID: 'langbuilderFlowId',
});

/** Max files to process from a folder picker. */
export const MAX_FOLDER_FILES = 500;
/** Max `.env` file size (64KB — 40x the longest legitimate credential). */
export const MAX_ENV_FILE_SIZE = 64 * 1024;
/** Max persona JSON file size (5MB — accommodates embedded KB docs). */
export const MAX_PERSONA_FILE_SIZE = 5 * 1024 * 1024;

/** Closed-enum file-processing error reasons. */
export type FileProcessingErrorReason =
  | 'file_too_large'
  | 'file_read_error'
  | 'json_parse_error'
  | 'bad_prototype_chain'
  | PersonaImportValidationReasonString;

/** Mirror of the persona validator's enum as strings (runtime-usable). */
type PersonaImportValidationReasonString =
  | 'bad_envelope'
  | 'unsupported_version'
  | 'missing_name'
  | 'name_too_long'
  | 'invisible_character'
  | 'bad_color_format'
  | 'bad_icon_format'
  | 'bad_systemPrompt_type'
  | 'systemPrompt_too_long'
  | 'bad_kbDocuments_type'
  | 'too_many_kbDocuments'
  | 'bad_kbDocument_shape'
  | 'bad_kbDocument_filename'
  | 'bad_kbDocument_fileType'
  | 'kbDocument_too_large'
  | 'kbDocuments_total_too_large';

export interface FileProcessingError {
  file: string;
  reason: FileProcessingErrorReason;
}

export interface WalkedFolder {
  /** The parsed `.env` file's credentials (allowlist-filtered), or null if absent. */
  envCredentials: Partial<Credentials> | null;
  /** Parsed and validated persona files. */
  personaFiles: ParsedPersonaFile[];
  /** All file-level errors (per-file, with closed-enum reasons). */
  errors: FileProcessingError[];
}

/**
 * Reviver for JSON.parse that strips prototype-pollution keys.
 * Does NOT strip `constructor` — that would break legitimate data that uses
 * `constructor` as a property name. Only `__proto__` and `prototype` are
 * direct prototype-chain vectors during parsing.
 */
export function protoReviver(key: string, value: unknown): unknown {
  if (key === '__proto__' || key === 'prototype') return undefined;
  return value;
}

/**
 * Assertion: the parsed object has a clean prototype chain.
 * Defense-in-depth against edge cases where the reviver alone misses.
 */
export function hasCleanPrototype(obj: unknown): boolean {
  if (obj === null || typeof obj !== 'object') return true;
  return Object.getPrototypeOf(obj) === Object.prototype;
}

/**
 * Closed allowlist of credential filenames (basename only, case-insensitive).
 *
 * Includes `.env` for users on platforms where dotfiles work (Linux, Windows),
 * and non-hidden alternates because:
 *   - macOS Finder hides files starting with `.` by default
 *   - Chrome's `webkitdirectory` picker on macOS inherits the OS filter and
 *     does NOT include hidden files in the resulting FileList
 *   - Users can't see the file in their own folder, can't pick it via Chrome
 *
 * Adding non-hidden alternates makes the feature work on all platforms without
 * forcing users to fight macOS Finder. When the user creates the folder, they
 * use one of these names; the import recognizes any of them.
 */
const CREDENTIAL_FILENAMES: ReadonlySet<string> = new Set([
  '.env',
  'wingman.env',
  'setup.env',
  'credentials.env',
  'env.txt',
]);

/**
 * Tests if a file's normalized webkitRelativePath points to a top-level
 * credential file (`.env`, `wingman.env`, `setup.env`, `credentials.env`, or `env.txt`).
 *
 * "Top-level" means at the root of the selected folder — the webkitRelativePath
 * has the form `<folder-name>/<credential-file>` with exactly one `/`.
 * Nested credential files (e.g., in `node_modules/.env`) are IGNORED.
 */
export function isTopLevelEnvFile(webkitRelativePath: string): boolean {
  const normalized = webkitRelativePath.normalize('NFKC');
  const segments = normalized.split('/');
  // Must be exactly 2 segments (folder + filename) — no nested files
  if (segments.length !== 2) return false;
  const basename = segments[1] ?? '';
  return CREDENTIAL_FILENAMES.has(basename.toLowerCase());
}

/**
 * Tests if a file matches the persona JSON pattern.
 *
 * Rules:
 *   - Normalized basename must match /(^|[_-])persona[^/]*\.json$/i
 *   - Must end in literal `.json` (after the regex match)
 *   - Must NOT contain additional dots after `persona` (e.g., `persona.json.bak` rejected)
 *   - Not inside a dot-prefixed folder or `__MACOSX/`
 */
export function isPersonaJsonFile(webkitRelativePath: string): boolean {
  const normalized = webkitRelativePath.normalize('NFKC');
  const segments = normalized.split('/');

  // Ignore anything inside a dot-prefixed folder or __MACOSX (at any depth).
  for (const segment of segments) {
    if (segment.startsWith('.') && segment !== '.env') return false;
    if (segment === '__MACOSX') return false;
  }

  const basename = segments[segments.length - 1] ?? '';
  // Basename must match persona*.json with `persona` at start or after _/-
  const match = /^(?:[^/]*[_-])?persona[^/]*\.json$/i.exec(basename);
  if (!match) return false;

  // Defense in depth: no additional dots after `persona` except the final `.json`
  // `persona.json.bak` — after regex match we'd still accept it since it ends in .json,
  // but the substring between `persona` and the final `.json` should contain no dot.
  const personaIdx = basename.toLowerCase().indexOf('persona');
  const lastDotIdx = basename.lastIndexOf('.');
  if (personaIdx < 0 || lastDotIdx < 0) return false;
  const midSection = basename.slice(personaIdx, lastDotIdx);
  if (midSection.includes('.')) return false;

  return true;
}

/**
 * Walks a FileList (from a `webkitdirectory` picker), categorizes files as
 * `.env` or persona JSON, reads and validates them, and returns a structured
 * result ready for merge.
 *
 * Size checks happen BEFORE reading — defeats OOM via 2GB persona JSON.
 * Unknown files (anything not `.env` or `*persona*.json`) are silently ignored.
 *
 * @param files Flat FileList from the folder picker
 * @returns Categorized and validated file contents
 */
export async function walkFolderFiles(files: ArrayLike<File>): Promise<WalkedFolder> {
  const errors: FileProcessingError[] = [];
  const personaFiles: ParsedPersonaFile[] = [];
  let envCredentials: Partial<Credentials> | null = null;

  // First pass: find the first top-level .env (there should be at most one)
  let envFileFound: File | null = null;
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    if (isTopLevelEnvFile(file.webkitRelativePath)) {
      envFileFound = file;
      break;
    }
  }

  // Process the .env if found
  if (envFileFound) {
    if (envFileFound.size > MAX_ENV_FILE_SIZE) {
      errors.push({ file: envFileFound.name, reason: 'file_too_large' });
    } else {
      try {
        const text = await envFileFound.text();
        const parseResult = parseDotEnv(text);
        // Track parse errors (line-level) but don't abort
        if (parseResult.errors.length > 0) {
          // Report once with a generic reason — line details in the parse errors
          // are not propagated to avoid leaking raw content.
          errors.push({ file: envFileFound.name, reason: 'json_parse_error' });
        }
        // Map .env keys to storage keys via the allowlist. Unknown .env keys
        // (not in ENV_KEY_TO_STORAGE_KEY) are silently dropped — they never
        // reach storage.
        const allowed: Partial<Credentials> = {};
        for (const envKey of Object.keys(parseResult.result)) {
          const storageKey = ENV_KEY_TO_STORAGE_KEY[envKey];
          if (storageKey !== undefined) {
            (allowed as Record<string, string>)[storageKey] = parseResult.result[envKey]!;
          }
        }
        envCredentials = allowed;
      } catch {
        errors.push({ file: envFileFound.name, reason: 'file_read_error' });
      }
    }
  }

  // Second pass: process persona JSON files
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    if (!isPersonaJsonFile(file.webkitRelativePath)) continue;

    if (file.size > MAX_PERSONA_FILE_SIZE) {
      errors.push({ file: file.name, reason: 'file_too_large' });
      continue;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      errors.push({ file: file.name, reason: 'file_read_error' });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text, protoReviver);
    } catch {
      errors.push({ file: file.name, reason: 'json_parse_error' });
      continue;
    }

    if (!hasCleanPrototype(parsed)) {
      errors.push({ file: file.name, reason: 'bad_prototype_chain' });
      continue;
    }

    const validation = validatePersonaImportEnvelope(parsed);
    if (!validation.valid) {
      errors.push({ file: file.name, reason: validation.reason });
      continue;
    }

    personaFiles.push({
      fileName: file.name,
      persona: validation.persona,
    });
  }

  return { envCredentials, personaFiles, errors };
}

/** Origin pattern for OpenRouter host permission. */
export const OPENROUTER_ORIGIN = 'https://openrouter.ai/*';
/** Origin pattern for Groq host permission. */
export const GROQ_ORIGIN = 'https://api.groq.com/*';

export interface HostPermissionDiff {
  /** Origins to request because the credential is being written and permission is missing. */
  toRequest: string[];
  /** Origins to revoke because the credential is being cleared but permission exists. */
  toRevoke: string[];
}

/**
 * Computes host-permission changes based on credential write/clear intentions.
 *
 * @param toWrite Credentials that will be written (have non-empty values)
 * @param toClear Credentials that will be cleared
 * @param hasPermission Async callback: given an origin, returns true if already granted
 */
export async function computeHostPermissionDiff(
  toWrite: Partial<Credentials>,
  toClear: (keyof Credentials)[],
  hasPermission: (origin: string) => Promise<boolean>
): Promise<HostPermissionDiff> {
  const toRequest: string[] = [];
  const toRevoke: string[] = [];

  const willHaveOpenrouter = typeof toWrite.openrouterApiKey === 'string' && toWrite.openrouterApiKey.length > 0;
  const willClearOpenrouter = toClear.includes('openrouterApiKey');
  if (willHaveOpenrouter) {
    if (!(await hasPermission(OPENROUTER_ORIGIN))) {
      toRequest.push(OPENROUTER_ORIGIN);
    }
  } else if (willClearOpenrouter) {
    if (await hasPermission(OPENROUTER_ORIGIN)) {
      toRevoke.push(OPENROUTER_ORIGIN);
    }
  }

  const willHaveGroq = typeof toWrite.groqApiKey === 'string' && toWrite.groqApiKey.length > 0;
  const willClearGroq = toClear.includes('groqApiKey');
  if (willHaveGroq) {
    if (!(await hasPermission(GROQ_ORIGIN))) {
      toRequest.push(GROQ_ORIGIN);
    }
  } else if (willClearGroq) {
    if (await hasPermission(GROQ_ORIGIN)) {
      toRevoke.push(GROQ_ORIGIN);
    }
  }

  return { toRequest, toRevoke };
}

/** Pinned schema for the `lastSetupImport` storage entry. */
export interface LastSetupImport {
  timestamp: number;
  /** Persona names added. Plain strings (never HTML — rendered via textContent). */
  created: string[];
  /** Persona names updated. */
  overwritten: string[];
  /** Persona names skipped due to edit detection. */
  skipped: string[];
  /** Credential key names (not values). */
  credentialsWritten: (keyof Credentials)[];
  /** Credential key names cleared. */
  credentialsCleared: (keyof Credentials)[];
  /** Host permissions granted. */
  permissionsGranted: string[];
  /** Host permissions revoked. */
  permissionsRevoked: string[];
  /** Number of files that errored (count only — no filenames, no reasons). */
  errorCount: number;
}
