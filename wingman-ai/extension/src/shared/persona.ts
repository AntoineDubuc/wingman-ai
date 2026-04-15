/**
 * Persona data model and chrome.storage.local helpers.
 *
 * A persona bundles a system prompt with a set of KB document IDs.
 * Stored as a JSON array under the `personas` storage key.
 */

import { DEFAULT_SYSTEM_PROMPT } from './default-prompt';
import { DEFAULT_PERSONA_TEMPLATES } from './default-personas';

// === TYPES ===

export interface Persona {
  id: string;
  name: string;
  color: string;
  icon?: string; // OpenMoji hexcode, e.g. "1F600"
  systemPrompt: string;
  kbDocumentIds: string[];
  createdAt: number;
  updatedAt: number;
  order: number;
  modelPrompts?: Record<string, string>;
  promptVersions?: PromptVersion[];
  /**
   * Content hash stamped when the persona is imported from a setup folder.
   * Cleared by `PersonaSection.save()` on any manual edit.
   *
   * Used by `mergePersonasFromImport` for edit detection: if the current
   * content hash matches `importSignature`, the persona is unedited and
   * safe to overwrite on re-import. If they differ (or the field is
   * undefined), the persona has been edited locally and must be skipped.
   *
   * 64-character lowercase hex SHA-256 of a normalized canonical input.
   * See `computePersonaContentHash()` for the exact algorithm.
   */
  importSignature?: string;
}

// === PROMPT ASSISTANT TYPES (Phase 24) ===

export interface PromptVersion {
  version: number;
  timestamp: number;
  summary: string;
  source: 'assistant' | 'manual' | 'template' | 'restored' | 'imported';
  targetModel: string;
  prompt: string;
  testResults?: VersionTestResults;
  testQuestions?: TestQuestion[];
}

export interface VersionTestResults {
  passed: number;
  total: number;
  cost: number;
  timestamp: number;
  modelId?: string;
}

export interface TestQuestion {
  text: string;
  expectedBehavior: 'respond' | 'silent';
  category?: 'kb' | 'custom';
  source?: 'auto' | 'user';
  groupLabel?: string;
  behaviorHint?: string;
  tags?: string[];
}

export interface TestResult {
  question: TestQuestion;
  response: string;
  status: 'pass' | 'fail' | 'error';
  failureReason?: 'wrong-behavior' | 'should-have-responded' | 'off-topic' | 'should-be-silent';
  errorMessage?: string;
  cost: number;
  latencyMs: number;
}

export interface ComparisonTestResult {
  question: TestQuestion;
  current: TestResult;
  compared: TestResult;
}

// === KB TEST TYPES (Phase 24 — Task 10) ===

export interface KBTestQuestion extends TestQuestion {
  kbContext?: string;
  expectedCitation?: string;
  testType: 'real-citation' | 'impossible-knowledge' | 'missing-data';
}

export interface KBTestResult extends TestResult {
  kbChunkRetrieved: boolean;
  similarityScore: number | null;
  sourceFilename: string | null;
  citationCorrect: boolean | null;
}

// === COLOR PRESETS ===

export const PERSONA_COLORS = [
  '#4A90D9', // blue
  '#34A853', // green
  '#F5A623', // amber
  '#9B59B6', // purple
  '#E74C3C', // red
  '#1ABC9C', // teal
  '#E91E8F', // pink
  '#FF6F00', // orange
] as const;

export const DEFAULT_PERSONA_COLOR = PERSONA_COLORS[0]!;

// === STORAGE HELPERS ===

const STORAGE_KEY_PERSONAS = 'personas';
const STORAGE_KEY_ACTIVE_ID = 'activePersonaId';
const STORAGE_KEY_ACTIVE_IDS = 'activePersonaIds';
const STORAGE_KEY_CONCLAVE_LEADER = 'conclaveLeaderId';

/** Maximum number of active personas (UI constraint) */
export const MAX_ACTIVE_PERSONAS = 4;

export async function getPersonas(): Promise<Persona[]> {
  const result = await chrome.storage.local.get([STORAGE_KEY_PERSONAS]);
  return (result[STORAGE_KEY_PERSONAS] as Persona[] | undefined) ?? [];
}

export async function savePersonas(personas: Persona[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_PERSONAS]: personas });
}

export async function getActivePersonaId(): Promise<string | null> {
  const result = await chrome.storage.local.get([STORAGE_KEY_ACTIVE_ID]);
  return (result[STORAGE_KEY_ACTIVE_ID] as string | undefined) ?? null;
}

export async function setActivePersonaId(id: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_ACTIVE_ID]: id });
}

// === HYDRA: MULTI-PERSONA HELPERS ===

/**
 * Get all active persona IDs.
 * Falls back to [activePersonaId] if activePersonaIds doesn't exist (migration).
 */
export async function getActivePersonaIds(): Promise<string[]> {
  const result = await chrome.storage.local.get([STORAGE_KEY_ACTIVE_IDS, STORAGE_KEY_ACTIVE_ID]);
  const ids = result[STORAGE_KEY_ACTIVE_IDS] as string[] | undefined;

  if (ids && ids.length > 0) {
    return ids;
  }

  // Fallback to single activePersonaId for backward compat
  const singleId = result[STORAGE_KEY_ACTIVE_ID] as string | undefined;
  return singleId ? [singleId] : [];
}

/**
 * Set active persona IDs.
 * Also sets activePersonaId = first ID for backward compat.
 * Enforces max 4 and requires at least 1.
 */
export async function setActivePersonaIds(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    throw new Error('At least one active persona is required');
  }
  if (ids.length > MAX_ACTIVE_PERSONAS) {
    throw new Error(`Maximum ${MAX_ACTIVE_PERSONAS} active personas allowed`);
  }

  await chrome.storage.local.set({
    [STORAGE_KEY_ACTIVE_IDS]: ids,
    [STORAGE_KEY_ACTIVE_ID]: ids[0], // backward compat
  });
}

/**
 * Get full Persona objects for all active IDs.
 * Filters out stale IDs (deleted personas).
 */
export async function getActivePersonas(): Promise<Persona[]> {
  const [personas, activeIds] = await Promise.all([
    getPersonas(),
    getActivePersonaIds(),
  ]);

  if (personas.length === 0) return [];
  if (activeIds.length === 0) {
    // No active IDs set — return first persona as default
    return personas[0] ? [personas[0]] : [];
  }

  const personaMap = new Map(personas.map(p => [p.id, p]));
  const result: Persona[] = [];

  for (const id of activeIds) {
    const persona = personaMap.get(id);
    if (persona) {
      result.push(persona);
    }
  }

  // If all active IDs were stale, fall back to first persona
  if (result.length === 0 && personas[0]) {
    return [personas[0]];
  }

  return result;
}

/**
 * Get the conclave leader persona ID.
 * Falls back to first active persona if not set or stale.
 */
export async function getConclaveLeaderId(): Promise<string | null> {
  const [result, activeIds] = await Promise.all([
    chrome.storage.local.get([STORAGE_KEY_CONCLAVE_LEADER]),
    getActivePersonaIds(),
  ]);

  const leaderId = result[STORAGE_KEY_CONCLAVE_LEADER] as string | undefined;

  // If leader is set and is in active list, use it
  if (leaderId && activeIds.includes(leaderId)) {
    return leaderId;
  }

  // Fall back to first active persona
  return activeIds[0] ?? null;
}

/**
 * Set the conclave leader persona ID.
 */
export async function setConclaveLeaderId(id: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_CONCLAVE_LEADER]: id });
}

/**
 * Get the conclave leader persona (full object).
 * Falls back to first active persona if leader not set or stale.
 */
export async function getConclaveLeader(): Promise<Persona | null> {
  const [leaderId, personas] = await Promise.all([
    getConclaveLeaderId(),
    getPersonas(),
  ]);

  if (!leaderId) return null;

  return personas.find(p => p.id === leaderId) ?? null;
}

/**
 * Load the currently active persona.
 * Returns null if no personas exist or the active ID is stale.
 */
export async function getActivePersona(): Promise<Persona | null> {
  const [personas, activeId] = await Promise.all([
    getPersonas(),
    getActivePersonaId(),
  ]);

  if (personas.length === 0) return null;

  if (activeId) {
    const match = personas.find((p) => p.id === activeId);
    if (match) return match;
  }

  // Fallback: first persona in the list
  return personas[0] ?? null;
}

// === FACTORY ===

export function createPersona(
  name: string,
  systemPrompt: string,
  color: string = DEFAULT_PERSONA_COLOR,
  kbDocumentIds: string[] = [],
  order?: number
): Persona {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    color,
    systemPrompt,
    kbDocumentIds,
    createdAt: now,
    updatedAt: now,
    order: order ?? now,
  };
}

// === MIGRATION ===

const STORAGE_KEY_BUILTINS_SEEDED = 'builtInPersonasSeeded';

/**
 * One-time migration: creates a "Default" persona from the existing
 * systemPrompt storage key and all KB document IDs.
 * Also seeds built-in persona templates if not already done.
 *
 * Safe to call multiple times — each step is idempotent.
 */
export async function migrateToPersonas(): Promise<void> {
  const existing = await getPersonas();

  // Migrate: add order field to personas that don't have it
  const needsOrderMigration = existing.some((p) => p.order === undefined);
  if (needsOrderMigration && existing.length > 0) {
    const migrated = existing.map((p, i) => ({
      ...p,
      order: p.order ?? i,
    }));
    await savePersonas(migrated);
    console.log(`[Persona] Added order field to ${existing.length} personas`);
  }

  if (existing.length === 0) {
    // Fresh install — create Default persona + all built-ins
    const storage = await chrome.storage.local.get(['systemPrompt']);
    const prompt = (storage.systemPrompt as string) || DEFAULT_SYSTEM_PROMPT;

    let kbDocIds: string[] = [];
    try {
      const { kbDatabase } = await import('../services/kb/kb-database');
      await kbDatabase.init();
      const docs = await kbDatabase.getDocuments();
      kbDocIds = docs
        .filter((d) => d.status === 'complete')
        .map((d) => d.id);
    } catch {
      // IndexedDB may not be available
    }

    const defaultPersona = createPersona('Default', prompt, DEFAULT_PERSONA_COLOR, kbDocIds, 0);
    const builtIns = DEFAULT_PERSONA_TEMPLATES.map((t, i) =>
      createPersona(t.name, t.systemPrompt, t.color, [], i + 1)
    );

    await savePersonas([defaultPersona, ...builtIns]);
    await setActivePersonaId(defaultPersona.id);
    await chrome.storage.local.set({ [STORAGE_KEY_BUILTINS_SEEDED]: true });

    console.log(`[Persona] Migration complete — created Default + ${builtIns.length} built-in personas`);
    return;
  }

  // Existing user — seed built-in templates if not already done
  const flags = await chrome.storage.local.get([STORAGE_KEY_BUILTINS_SEEDED]);
  if (flags[STORAGE_KEY_BUILTINS_SEEDED]) return;

  const existingNames = new Set(existing.map((p) => p.name));
  const maxOrder = Math.max(...existing.map((p) => p.order ?? 0), -1);
  const newPersonas = DEFAULT_PERSONA_TEMPLATES
    .filter((t) => !existingNames.has(t.name))
    .map((t, i) => createPersona(t.name, t.systemPrompt, t.color, [], maxOrder + 1 + i));

  if (newPersonas.length > 0) {
    await savePersonas([...existing, ...newPersonas]);
    console.log(`[Persona] Seeded ${newPersonas.length} built-in personas`);
  }

  await chrome.storage.local.set({ [STORAGE_KEY_BUILTINS_SEEDED]: true });
}

// === CONCLAVE PRESETS ===

export interface ConclavePreset {
  id: string;
  name: string;
  personaIds: string[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY_PRESETS = 'conclavePresets';

/**
 * Get all conclave presets.
 */
export async function getConclavePresets(): Promise<ConclavePreset[]> {
  const result = await chrome.storage.local.get([STORAGE_KEY_PRESETS]);
  return (result[STORAGE_KEY_PRESETS] as ConclavePreset[] | undefined) ?? [];
}

/**
 * Save a conclave preset (create or update).
 * Validates unique name (case-insensitive) and max 4 personas.
 */
export async function saveConclavePreset(preset: ConclavePreset): Promise<void> {
  if (preset.personaIds.length === 0) {
    throw new Error('Preset must have at least one persona');
  }
  if (preset.personaIds.length > MAX_ACTIVE_PERSONAS) {
    throw new Error(`Preset can have at most ${MAX_ACTIVE_PERSONAS} personas`);
  }

  const presets = await getConclavePresets();

  // Check for duplicate name (case-insensitive, excluding self)
  const duplicate = presets.find(
    (p) => p.id !== preset.id && p.name.toLowerCase() === preset.name.toLowerCase()
  );
  if (duplicate) {
    throw new Error(`A preset named "${preset.name}" already exists`);
  }

  const existingIndex = presets.findIndex((p) => p.id === preset.id);
  if (existingIndex >= 0) {
    presets[existingIndex] = preset;
  } else {
    presets.push(preset);
  }

  await chrome.storage.local.set({ [STORAGE_KEY_PRESETS]: presets });
}

/**
 * Delete a conclave preset by ID.
 */
export async function deleteConclavePreset(id: string): Promise<void> {
  const presets = await getConclavePresets();
  const filtered = presets.filter((p) => p.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY_PRESETS]: filtered });
}

/**
 * Activate a preset — sets activePersonaIds to the preset's personas.
 * Returns list of missing persona IDs if any referenced personas were deleted.
 */
export async function activatePreset(id: string): Promise<{ missingIds: string[] }> {
  const [presets, allPersonas] = await Promise.all([
    getConclavePresets(),
    getPersonas(),
  ]);

  const preset = presets.find((p) => p.id === id);
  if (!preset) {
    throw new Error('Preset not found');
  }

  const personaMap = new Map(allPersonas.map((p) => [p.id, p]));
  const validIds: string[] = [];
  const missingIds: string[] = [];

  for (const pid of preset.personaIds) {
    if (personaMap.has(pid)) {
      validIds.push(pid);
    } else {
      missingIds.push(pid);
    }
  }

  if (validIds.length === 0) {
    throw new Error('All personas in this preset have been deleted');
  }

  await setActivePersonaIds(validIds);

  return { missingIds };
}

/**
 * Create a new preset object (factory function).
 */
export function createConclavePreset(name: string, personaIds: string[]): ConclavePreset {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    personaIds,
    createdAt: now,
    updatedAt: now,
  };
}

// =============================================================================
// SETUP FOLDER IMPORT — Task 2: envelope validator + content hash
// =============================================================================
//
// The following exports support the setup-folder-import feature:
//   - `validatePersonaImportEnvelope` — parses a JSON envelope, validates every
//     field including embedded KB docs, and returns a fresh-object-copied
//     `PersonaImportPayload` with no prototype pollution and no unknown fields.
//   - `computePersonaContentHash` — SHA-256 of a normalized canonical input
//     used for edit detection during re-import.
//   - `normalizePersonaName` (internal) — the trim/NFKC/strip/reject pipeline.
//
// Security-critical. See:
//   Research/features/setup-folder-import/implementation_plan.md (Task 2)
//   Research/features/setup-folder-import/review_security_round*.md

/** Allowlist of KB document fileTypes. Closed enum — never extend at runtime. */
const ALLOWED_KB_FILETYPES: ReadonlySet<string> = new Set([
  'text/plain',
  'text/markdown',
  'application/pdf',
]);

/** Max persona name length (post-normalization). */
const MAX_PERSONA_NAME_LENGTH = 200;
/** Max system prompt length. */
const MAX_SYSTEM_PROMPT_LENGTH = 50_000;
/** Max number of KB documents per persona. */
const MAX_KB_DOCUMENTS = 20;
/** Max size of a single KB document's text content (bytes). */
const MAX_KB_DOC_SIZE = 5_000_000;
/** Max aggregate size of all KB documents in a single persona. */
const MAX_KB_TOTAL_SIZE = 20_000_000;
/** Max KB filename length. */
const MAX_KB_FILENAME_LENGTH = 255;

/**
 * Strip set: zero-width characters commonly introduced by copy-paste from rich
 * text editors. These have no semantic meaning in any script.
 *   U+200B ZERO WIDTH SPACE
 *   U+200C ZERO WIDTH NON-JOINER
 *   U+200D ZERO WIDTH JOINER
 *   U+FEFF BYTE ORDER MARK (as interior char)
 */
const ZERO_WIDTH_STRIP_REGEX = /[\u200B\u200C\u200D\uFEFF]/g;

/**
 * KB document filename format: 1-255 printable ASCII characters, no path
 * separators, no control chars, no leading dot (blocks `.env`/`.htaccess`).
 */
const KB_FILENAME_REGEX = /^(?!\.)[A-Za-z0-9 ._-]+$/;

/**
 * Color format: 6-digit hex with leading `#`. Rejects named colors, 3-digit
 * short form, and CSS functions like `url(...)` or `expression(...)`.
 */
const COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Icon format: OpenMoji hexcode — one or more 4-5 digit uppercase hex groups
 * separated by hyphens. Matches persona.ts:17 `icon?: string; // OpenMoji hexcode`.
 */
const ICON_REGEX = /^[0-9A-F]{4,5}(-[0-9A-F]{4,5})*$/;

/**
 * Closed enum of reason codes returned by `validatePersonaImportEnvelope`.
 * Never extend with user-supplied strings. Every reason is safe to render
 * in a preview modal (contains no raw user input).
 */
export type PersonaImportValidationReason =
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

/** A fresh, validated persona payload. Never inherits from the input object. */
export interface PersonaImportPayload {
  name: string;
  color: string;
  icon?: string;
  systemPrompt: string;
  kbDocuments?: PersonaImportKbDoc[];
  importSignature?: string;
}

export interface PersonaImportKbDoc {
  filename: string;
  fileType: string;
  textContent: string;
}

export type ValidatePersonaImportEnvelopeResult =
  | { valid: true; persona: PersonaImportPayload }
  | { valid: false; reason: PersonaImportValidationReason };

/**
 * Validates a persona import envelope and returns a FRESH-COPIED payload
 * containing only known fields. Never passes the input object through by
 * reference (defense-in-depth against prototype pollution).
 *
 * Rejection reasons are closed-enum codes — never raw user input.
 *
 * @param obj The parsed JSON envelope (from `JSON.parse(fileText, protoReviver)`)
 * @returns Either a valid payload or a rejection reason
 */
export function validatePersonaImportEnvelope(
  obj: unknown
): ValidatePersonaImportEnvelopeResult {
  // Top-level envelope shape
  if (obj === null || typeof obj !== 'object') {
    return { valid: false, reason: 'bad_envelope' };
  }
  const envelope = obj as Record<string, unknown>;
  if (envelope.wingmanPersona !== true) {
    return { valid: false, reason: 'bad_envelope' };
  }
  if (envelope.version !== 1) {
    return { valid: false, reason: 'unsupported_version' };
  }
  if (envelope.persona === null || typeof envelope.persona !== 'object') {
    return { valid: false, reason: 'bad_envelope' };
  }

  const raw = envelope.persona as Record<string, unknown>;

  // Name: must be string, not empty after trim, not too long after normalize,
  // no invisible/format characters in the reject set.
  if (typeof raw.name !== 'string') {
    return { valid: false, reason: 'missing_name' };
  }
  const normalizedName = normalizePersonaName(raw.name);
  if (normalizedName === null) {
    // normalizePersonaName returns null for either empty-after-trim OR invisible-char reject.
    // Distinguish: check the raw trimmed input.
    const trimmed = raw.name.trim();
    if (trimmed.length === 0) {
      return { valid: false, reason: 'missing_name' };
    }
    return { valid: false, reason: 'invisible_character' };
  }
  if (normalizedName.length > MAX_PERSONA_NAME_LENGTH) {
    return { valid: false, reason: 'name_too_long' };
  }

  // systemPrompt: must be string, length capped
  if (typeof raw.systemPrompt !== 'string') {
    return { valid: false, reason: 'bad_systemPrompt_type' };
  }
  if (raw.systemPrompt.length > MAX_SYSTEM_PROMPT_LENGTH) {
    return { valid: false, reason: 'systemPrompt_too_long' };
  }

  // color: must match strict hex regex
  if (typeof raw.color !== 'string' || !COLOR_REGEX.test(raw.color)) {
    return { valid: false, reason: 'bad_color_format' };
  }

  // icon: optional; if present, must match OpenMoji hexcode format
  if (raw.icon !== undefined) {
    if (typeof raw.icon !== 'string' || !ICON_REGEX.test(raw.icon)) {
      return { valid: false, reason: 'bad_icon_format' };
    }
  }

  // kbDocuments: optional array, bounded size, each doc validated
  let kbDocumentsOut: PersonaImportKbDoc[] | undefined;
  if (raw.kbDocuments !== undefined) {
    if (!Array.isArray(raw.kbDocuments)) {
      return { valid: false, reason: 'bad_kbDocuments_type' };
    }
    if (raw.kbDocuments.length > MAX_KB_DOCUMENTS) {
      return { valid: false, reason: 'too_many_kbDocuments' };
    }

    let totalSize = 0;
    const docsOut: PersonaImportKbDoc[] = [];
    for (const entry of raw.kbDocuments) {
      if (entry === null || typeof entry !== 'object') {
        return { valid: false, reason: 'bad_kbDocument_shape' };
      }
      const doc = entry as Record<string, unknown>;

      if (
        typeof doc.filename !== 'string' ||
        doc.filename.length === 0 ||
        doc.filename.length > MAX_KB_FILENAME_LENGTH ||
        !KB_FILENAME_REGEX.test(doc.filename)
      ) {
        return { valid: false, reason: 'bad_kbDocument_filename' };
      }

      if (typeof doc.fileType !== 'string' || !ALLOWED_KB_FILETYPES.has(doc.fileType)) {
        return { valid: false, reason: 'bad_kbDocument_fileType' };
      }

      if (typeof doc.textContent !== 'string') {
        return { valid: false, reason: 'bad_kbDocument_shape' };
      }
      if (doc.textContent.length > MAX_KB_DOC_SIZE) {
        return { valid: false, reason: 'kbDocument_too_large' };
      }
      totalSize += doc.textContent.length;
      if (totalSize > MAX_KB_TOTAL_SIZE) {
        return { valid: false, reason: 'kbDocuments_total_too_large' };
      }

      // Fresh object with only known fields — no __proto__ inheritance, no unknown keys
      docsOut.push({
        filename: doc.filename,
        fileType: doc.fileType,
        textContent: doc.textContent,
      });
    }
    kbDocumentsOut = docsOut;
  }

  // Build a FRESH object literal — no Object.assign, no spread from raw.
  // Only known fields are copied over. Unknown fields are silently dropped.
  const safe: PersonaImportPayload = {
    name: normalizedName,
    color: raw.color,
    systemPrompt: raw.systemPrompt,
  };
  if (typeof raw.icon === 'string') {
    safe.icon = raw.icon;
  }
  if (kbDocumentsOut !== undefined) {
    safe.kbDocuments = kbDocumentsOut;
  }
  if (typeof raw.importSignature === 'string') {
    safe.importSignature = raw.importSignature;
  }

  return { valid: true, persona: safe };
}

/**
 * Persona name normalization pipeline (order matters):
 *
 *   1. trim leading/trailing ASCII whitespace
 *   2. normalize('NFKC') — canonical decomposition
 *   3. strip the 4 zero-width joiners (U+200B/C/D, U+FEFF)
 *   4. reject any remaining default-ignorable codepoint EXCEPT LRM/RLM
 *      (U+200E/F are preserved because they are legitimate bidirectional
 *      text controls used in Arabic/Hebrew/Persian scripts)
 *   5. return the cleaned name, or null if invalid
 *
 * Returns null on:
 *   - empty string (after trim + strip)
 *   - any default-ignorable codepoint that is NOT LRM/RLM (spoofing defense)
 *
 * The caller distinguishes "empty" from "invisible char" by re-checking the
 * trimmed raw input.
 */
function normalizePersonaName(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const normalized = trimmed.normalize('NFKC');
  const stripped = normalized.replace(ZERO_WIDTH_STRIP_REGEX, '');
  if (stripped.length === 0) return null;

  // Reject any default-ignorable codepoint except LRM (U+200E) and RLM (U+200F).
  // Using the Unicode property class is forward-compatible with future versions.
  //
  // Supplemental reject set: U+FFF9/A/B (INTERLINEAR ANNOTATION ANCHOR/
  // SEPARATOR/TERMINATOR). These are General_Category=Cf but NOT in
  // Default_Ignorable_Code_Point, so the property class doesn't catch them.
  // They are rare format characters with no use in persona names and are a
  // known spoofing / invisible-prompt-injection vector. See
  // review_security_round7.md#Minor-interlinear-annotation.
  for (const char of stripped) {
    const cp = char.codePointAt(0);
    if (cp === 0x200e || cp === 0x200f) continue;
    if (cp === 0xfff9 || cp === 0xfffa || cp === 0xfffb) return null;
    if (/\p{Default_Ignorable_Code_Point}/u.test(char)) {
      return null;
    }
  }

  return stripped;
}

/**
 * Computes a stable SHA-256 content hash for a persona, used as an
 * `importSignature` for edit detection.
 *
 * Hash input is `JSON.stringify({ name, color, systemPrompt })` with keys in
 * that exact insertion order (ES2020 §9.1.12 guarantees stable iteration).
 * The `name` is normalized via the same pipeline as the validator.
 *
 * Fields explicitly NOT in the hash and WHY:
 *   - id:              instance identity, varies per install
 *   - kbDocumentIds:   additive-only per Decision 4 (KB changes don't count as edits)
 *   - modelPrompts:    per-model derived state
 *   - promptVersions:  derived state
 *   - createdAt:       instance-specific
 *   - updatedAt:       changes on every save (would always invalidate)
 *   - order:           UI-specific, not behavioral
 *   - icon:            cosmetic, not behavioral
 *
 * A new behavior-affecting field added in a future schema version MUST be
 * included in this hash with a test asserting that changing the field
 * produces a different hash.
 *
 * @param persona The persona to hash
 * @returns 64-character lowercase hex string (SHA-256)
 */
export async function computePersonaContentHash(persona: Persona): Promise<string> {
  // Normalize name the same way the validator does. If the current name has
  // invisible chars (e.g., user pasted one into the editor), normalizePersonaName
  // returns null — fall back to the trimmed raw name so the hash still works.
  // The mergePersonasFromImport layer is responsible for rejecting invisibles.
  const normalizedName = normalizePersonaName(persona.name) ?? persona.name.trim();

  const canonical = JSON.stringify({
    name: normalizedName,
    color: persona.color,
    systemPrompt: persona.systemPrompt,
  });

  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  // Convert ArrayBuffer to 64-char lowercase hex
  const view = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < view.length; i++) {
    const b = view[i]!;
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}
