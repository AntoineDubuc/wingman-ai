/**
 * Prompt version CRUD operations.
 *
 * Versions are stored inline on the Persona object in chrome.storage.local.
 * Each persona can have up to MAX_VERSIONS versions (auto-prunes oldest).
 */

import { getPersonas, savePersonas } from '../shared/persona';
import type { Persona, PromptVersion, VersionTestResults } from '../shared/persona';

const MAX_VERSIONS = 20;

// Re-export for consumers that need the type
export type { Persona, PromptVersion, VersionTestResults };

/**
 * Get all prompt versions for a persona, sorted newest-first.
 * If the persona has a systemPrompt but no promptVersions, auto-creates v1 (lazy migration).
 */
export async function getPromptVersions(personaId: string): Promise<PromptVersion[]> {
  const personas = await getPersonas();
  const persona = personas.find(p => p.id === personaId);
  if (!persona) return [];

  // Lazy auto-v1 migration: persona has systemPrompt but no versions
  if (!persona.promptVersions || persona.promptVersions.length === 0) {
    if (persona.systemPrompt) {
      const v1: PromptVersion = {
        version: 1,
        timestamp: persona.createdAt || Date.now(),
        summary: 'Initial prompt',
        source: 'manual',
        targetModel: '',
        prompt: persona.systemPrompt,
      };
      persona.promptVersions = [v1];
      await savePersonas(personas);
      return [v1];
    }
    return [];
  }

  // Return sorted newest-first
  return [...persona.promptVersions].sort((a, b) => b.version - a.version);
}

/**
 * Add a new prompt version to a persona.
 * Auto-increments version number. Auto-prunes oldest if over MAX_VERSIONS.
 * Updates persona's systemPrompt and modelPrompts.
 */
export async function addPromptVersion(
  personaId: string,
  params: {
    prompt: string;
    summary: string;
    source: PromptVersion['source'];
    targetModel: string;
    testResults?: VersionTestResults;
  }
): Promise<PromptVersion> {
  const personas = await getPersonas();
  const persona = personas.find(p => p.id === personaId);
  if (!persona) throw new Error(`Persona not found: ${personaId}`);

  // Ensure versions array exists (trigger lazy migration if needed)
  if (!persona.promptVersions) {
    persona.promptVersions = [];
    // If there's an existing systemPrompt, create v1 first
    if (persona.systemPrompt) {
      persona.promptVersions.push({
        version: 1,
        timestamp: persona.createdAt || Date.now(),
        summary: 'Initial prompt',
        source: 'manual',
        targetModel: '',
        prompt: persona.systemPrompt,
      });
    }
  }

  // Determine next version number
  const maxVersion = persona.promptVersions.reduce(
    (max, v) => Math.max(max, v.version), 0
  );
  const nextVersion = maxVersion + 1;

  const newVersion: PromptVersion = {
    version: nextVersion,
    timestamp: Date.now(),
    summary: params.summary,
    source: params.source,
    targetModel: params.targetModel,
    prompt: params.prompt,
    testResults: params.testResults,
  };

  persona.promptVersions.push(newVersion);

  // Auto-prune oldest if over cap
  if (persona.promptVersions.length > MAX_VERSIONS) {
    // Sort by version ascending, remove oldest
    persona.promptVersions.sort((a, b) => a.version - b.version);
    persona.promptVersions = persona.promptVersions.slice(-MAX_VERSIONS);
  }

  // Update persona's current prompt
  persona.systemPrompt = params.prompt;
  if (params.targetModel) {
    if (!persona.modelPrompts) persona.modelPrompts = {};
    persona.modelPrompts[params.targetModel] = params.prompt;
  }
  persona.updatedAt = Date.now();

  await savePersonas(personas);
  return newVersion;
}

/**
 * Restore a previous version as the current prompt.
 * Creates a new version with the old content (non-destructive).
 */
export async function restorePromptVersion(
  personaId: string,
  versionNumber: number
): Promise<PromptVersion> {
  const personas = await getPersonas();
  const persona = personas.find(p => p.id === personaId);
  if (!persona) throw new Error(`Persona not found: ${personaId}`);
  if (!persona.promptVersions) throw new Error('No versions to restore');

  const target = persona.promptVersions.find(v => v.version === versionNumber);
  if (!target) throw new Error(`Version ${versionNumber} not found`);

  return addPromptVersion(personaId, {
    prompt: target.prompt,
    summary: `Restored from v${versionNumber}`,
    source: 'restored',
    targetModel: target.targetModel,
  });
}

/**
 * Delete a prompt version. The current (latest) version cannot be deleted.
 */
export async function deletePromptVersion(
  personaId: string,
  versionNumber: number
): Promise<void> {
  const personas = await getPersonas();
  const persona = personas.find(p => p.id === personaId);
  if (!persona) throw new Error(`Persona not found: ${personaId}`);
  if (!persona.promptVersions || persona.promptVersions.length === 0) {
    throw new Error('No versions to delete');
  }

  // Find current (highest version number)
  const currentVersion = Math.max(...persona.promptVersions.map(v => v.version));
  if (versionNumber === currentVersion) {
    throw new Error('Cannot delete the current version');
  }

  persona.promptVersions = persona.promptVersions.filter(
    v => v.version !== versionNumber
  );
  persona.updatedAt = Date.now();

  await savePersonas(personas);
}

/**
 * Update test results on an existing version.
 */
export async function updateVersionTestResults(
  personaId: string,
  versionNumber: number,
  testResults: VersionTestResults
): Promise<void> {
  const personas = await getPersonas();
  const persona = personas.find(p => p.id === personaId);
  if (!persona?.promptVersions) throw new Error('No versions found');

  const version = persona.promptVersions.find(v => v.version === versionNumber);
  if (!version) throw new Error(`Version ${versionNumber} not found`);

  version.testResults = testResults;
  persona.updatedAt = Date.now();
  await savePersonas(personas);
}
