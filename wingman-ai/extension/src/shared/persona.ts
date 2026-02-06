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
  systemPrompt: string;
  kbDocumentIds: string[];
  createdAt: number;
  updatedAt: number;
  order: number;
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
