/**
 * Persona merge logic for the setup-folder-import feature (Task 3).
 *
 * Pure function — no I/O, no DOM, no chrome.*. Given the existing storage
 * personas and a list of parsed incoming persona files, decides what to
 * add, overwrite, skip (edit-preserved), or error on.
 *
 * Critical rules (from research.md#Decision-1 and research.md#Finding-9):
 *   - Match by name only (no id matching across installs).
 *   - Their edits win: if importSignature doesn't match current content hash,
 *     skip the overwrite. The persona is unchanged.
 *   - Preserve id, createdAt, order, kbDocumentIds, modelPrompts, promptVersions
 *     on overwrite. Only update name/color/icon/systemPrompt + bump updatedAt.
 *   - Duplicate incoming names: reject the whole import with a per-file error.
 *   - Salesperson personas not in the incoming list are left alone.
 *
 * See tests/persona-merge.test.ts for exhaustive collision coverage.
 */

import {
  type Persona,
  type PersonaImportPayload,
  computePersonaContentHash,
  DEFAULT_PERSONA_COLOR,
} from './persona';

/** One parsed persona file from the import folder. */
export interface ParsedPersonaFile {
  /** Original filename (used in error reporting). */
  fileName: string;
  /** Validated persona payload (output of `validatePersonaImportEnvelope`). */
  persona: PersonaImportPayload;
}

/** Closed enum of merge-level rejection reasons. */
export type MergeErrorReason =
  | 'duplicate_persona_name'
  | 'merge_internal_error';

export interface MergeError {
  file: string;
  reason: MergeErrorReason;
}

export interface MergeLog {
  /** Names of personas created (not matched in existing). */
  created: string[];
  /** Names of personas overwritten (name match + unedited). */
  overwritten: string[];
  /** Names of personas skipped due to edit detection (their edits win). */
  skipped: string[];
  /** Per-file errors. When non-empty, the caller should reject the import. */
  errors: MergeError[];
}

export interface MergeResult {
  /** Final persona array to pass to `savePersonas()`. */
  merged: Persona[];
  /** Human-readable log for the preview modal. */
  log: MergeLog;
}

/**
 * Dependencies injected for deterministic testing.
 * Default implementations use `Date.now()` and `crypto.randomUUID()`.
 */
export interface MergeDeps {
  now: () => number;
  uuid: () => string;
}

const defaultDeps: MergeDeps = {
  now: () => Date.now(),
  uuid: () => crypto.randomUUID(),
};

/**
 * Merges a list of parsed incoming persona files into the existing persona
 * array, returning a new array (existing is NOT mutated) plus a log.
 *
 * @param existing Current personas from storage
 * @param incoming Parsed persona files (output of `validatePersonaImportEnvelope` × N)
 * @param deps Injected deps for testing (optional; defaults to real `Date.now`/`crypto.randomUUID`)
 */
export async function mergePersonasFromImport(
  existing: Persona[],
  incoming: ParsedPersonaFile[],
  deps: MergeDeps = defaultDeps
): Promise<MergeResult> {
  if (!Array.isArray(existing)) {
    throw new TypeError('mergePersonasFromImport: existing must be an array');
  }
  if (!Array.isArray(incoming)) {
    throw new TypeError('mergePersonasFromImport: incoming must be an array');
  }

  const log: MergeLog = {
    created: [],
    overwritten: [],
    skipped: [],
    errors: [],
  };

  // === Step 1: Detect duplicate names in incoming ===
  // If the same name appears twice, reject the whole import — we cannot
  // decide which one "wins" and silently dropping one is worse than failing.
  const nameCount = new Map<string, number>();
  for (const file of incoming) {
    const name = file.persona.name;
    nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  }
  const duplicateNames = new Set<string>();
  for (const [name, count] of nameCount) {
    if (count > 1) duplicateNames.add(name);
  }
  if (duplicateNames.size > 0) {
    for (const file of incoming) {
      if (duplicateNames.has(file.persona.name)) {
        log.errors.push({ file: file.fileName, reason: 'duplicate_persona_name' });
      }
    }
    // Return existing unchanged — nothing gets applied if there are duplicates.
    return { merged: [...existing], log };
  }

  // === Step 2: Build an index of existing personas by name ===
  const existingByName = new Map<string, Persona>();
  for (const p of existing) {
    existingByName.set(p.name, p);
  }

  // === Step 3: Pre-compute current content hashes for edit detection ===
  // Hash each existing persona and compare against its importSignature.
  // If they match, the persona is unedited (safe to overwrite). If they
  // differ (or importSignature is missing), the persona has been edited
  // and must be preserved.
  const unedited = new Set<string>(); // names of unedited personas
  for (const p of existing) {
    if (typeof p.importSignature === 'string') {
      const currentHash = await computePersonaContentHash(p);
      if (currentHash === p.importSignature) {
        unedited.add(p.name);
      }
    }
  }

  // === Step 4: Compute max order for new persona placement ===
  let maxOrder = -1;
  for (const p of existing) {
    if (p.order > maxOrder) maxOrder = p.order;
  }

  // === Step 5: Process each incoming file ===
  // We'll build a new merged array preserving the order of existing personas.
  // Overwrite in place. Create-new appends to the end.
  const merged: Persona[] = [];
  const processedNames = new Set<string>();

  for (const existingP of existing) {
    const incomingFile = incoming.find((f) => f.persona.name === existingP.name);
    if (!incomingFile) {
      // Not in incoming — preserve as-is.
      merged.push(existingP);
      continue;
    }

    processedNames.add(existingP.name);

    if (!unedited.has(existingP.name)) {
      // Edited OR never imported. Their edits win: skip the overwrite.
      log.skipped.push(existingP.name);
      merged.push(existingP);
      continue;
    }

    // Safe to overwrite. Preserve identity/kb/timestamps fields,
    // update content fields.
    const overwritten: Persona = {
      id: existingP.id,
      name: incomingFile.persona.name,
      color: incomingFile.persona.color || DEFAULT_PERSONA_COLOR,
      systemPrompt: incomingFile.persona.systemPrompt,
      kbDocumentIds: existingP.kbDocumentIds,
      createdAt: existingP.createdAt,
      updatedAt: deps.now(),
      order: existingP.order,
    };
    // Icon: update if incoming has one, preserve otherwise
    if (incomingFile.persona.icon !== undefined) {
      overwritten.icon = incomingFile.persona.icon;
    } else if (existingP.icon !== undefined) {
      overwritten.icon = existingP.icon;
    }
    // Preserve optional fields
    if (existingP.modelPrompts !== undefined) {
      overwritten.modelPrompts = existingP.modelPrompts;
    }
    if (existingP.promptVersions !== undefined) {
      overwritten.promptVersions = existingP.promptVersions;
    }
    // Re-stamp importSignature with the NEW content hash
    overwritten.importSignature = await computePersonaContentHash(overwritten);

    merged.push(overwritten);
    log.overwritten.push(existingP.name);
  }

  // === Step 6: Process incoming files with no existing name match ===
  for (const file of incoming) {
    if (processedNames.has(file.persona.name)) continue;

    maxOrder += 1;
    const created: Persona = {
      id: deps.uuid(),
      name: file.persona.name,
      color: file.persona.color || DEFAULT_PERSONA_COLOR,
      systemPrompt: file.persona.systemPrompt,
      kbDocumentIds: [],
      createdAt: deps.now(),
      updatedAt: deps.now(),
      order: maxOrder,
    };
    if (file.persona.icon !== undefined) {
      created.icon = file.persona.icon;
    }
    // Stamp importSignature so future imports know this came from a folder
    created.importSignature = await computePersonaContentHash(created);

    merged.push(created);
    log.created.push(file.persona.name);
  }

  return { merged, log };
}
