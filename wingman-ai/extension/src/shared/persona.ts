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
  kbDocumentIds: string[] = []
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

    const defaultPersona = createPersona('Default', prompt, DEFAULT_PERSONA_COLOR, kbDocIds);
    const builtIns = DEFAULT_PERSONA_TEMPLATES.map((t) =>
      createPersona(t.name, t.systemPrompt, t.color)
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
  const newPersonas = DEFAULT_PERSONA_TEMPLATES
    .filter((t) => !existingNames.has(t.name))
    .map((t) => createPersona(t.name, t.systemPrompt, t.color));

  if (newPersonas.length > 0) {
    await savePersonas([...existing, ...newPersonas]);
    console.log(`[Persona] Seeded ${newPersonas.length} built-in personas`);
  }

  await chrome.storage.local.set({ [STORAGE_KEY_BUILTINS_SEEDED]: true });
}
