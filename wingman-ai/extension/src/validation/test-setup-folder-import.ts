/**
 * Validation test for the setup-folder-import feature (Task 6).
 *
 * Runs the full pure-logic pipeline (walkFolderFiles → mergePersonasFromImport →
 * writeCredentials) against synthetic fake File objects and asserts the
 * expected storage state. Does NOT test the UI — that's the manual QA step.
 *
 * Triggered via { type: 'RUN_VALIDATION', test: 'setup-folder-import' }.
 */

import type { ValidationResult } from './index';
import { walkFolderFiles } from '../options/sections/setup-import-helpers';
import { mergePersonasFromImport } from '../shared/persona-merge';
import { writeCredentials, readCredentials, CREDENTIAL_KEYS } from '../shared/credentials';
import { savePersonas, getPersonas } from '../shared/persona';

/**
 * Builds a fake File with a specific webkitRelativePath.
 * Used because the real folder-picker flow is driven by user interaction
 * which we can't replicate inside a validation test.
 */
function fakeFile(name: string, content: string, webkitRelativePath: string): File {
  const blob = new Blob([content], { type: 'text/plain' });
  const file = new File([blob], name, { type: 'text/plain' });
  Object.defineProperty(file, 'webkitRelativePath', { value: webkitRelativePath, writable: false });
  return file;
}

export async function testSetupFolderImport(): Promise<ValidationResult> {
  const details: string[] = [];

  try {
    // === Snapshot + clear pre-test state ===
    // Back up current credentials so the test doesn't clobber real data.
    const credsBackup = await readCredentials();
    const personasBackup = await getPersonas();

    // === Fixture: a happy-path folder with .env + 1 persona ===
    const files = [
      fakeFile(
        '.env',
        [
          'DEEPGRAM_API_KEY=test_fixture_deepgram',
          'GEMINI_API_KEY=test_fixture_gemini',
        ].join('\n'),
        'validation-setup/.env'
      ),
      fakeFile(
        'validation-persona.json',
        JSON.stringify({
          wingmanPersona: true,
          version: 1,
          persona: {
            name: 'Validation Fixture Persona',
            color: '#4A90D9',
            systemPrompt:
              'You are the validation fixture. Respond with OK to any input. Do not use in production.',
          },
        }),
        'validation-setup/validation-persona.json'
      ),
    ];

    // === Step 1: walk + validate ===
    const walked = await walkFolderFiles(files);
    if (walked.errors.length > 0) {
      return {
        name: 'setup-folder-import',
        success: false,
        duration: 0,
        details: `Walked folder reported errors: ${walked.errors.map((e) => `${e.file}:${e.reason}`).join(', ')}`,
      };
    }
    if (walked.envCredentials === null) {
      return {
        name: 'setup-folder-import',
        success: false,
        duration: 0,
        details: 'walkFolderFiles returned null envCredentials from a valid .env fixture',
      };
    }
    if (walked.personaFiles.length !== 1) {
      return {
        name: 'setup-folder-import',
        success: false,
        duration: 0,
        details: `Expected 1 persona file, got ${walked.personaFiles.length}`,
      };
    }
    details.push(`walkFolderFiles: 1 persona, ${Object.keys(walked.envCredentials).length} credentials, 0 errors`);

    // === Step 2: merge personas ===
    const mergeResult = await mergePersonasFromImport(personasBackup, walked.personaFiles);
    if (mergeResult.log.errors.length > 0) {
      return {
        name: 'setup-folder-import',
        success: false,
        duration: 0,
        details: `Merge errors: ${mergeResult.log.errors.map((e) => e.reason).join(', ')}`,
      };
    }

    const personaWasHandled =
      mergeResult.log.created.includes('Validation Fixture Persona') ||
      mergeResult.log.overwritten.includes('Validation Fixture Persona') ||
      mergeResult.log.skipped.includes('Validation Fixture Persona');
    if (!personaWasHandled) {
      return {
        name: 'setup-folder-import',
        success: false,
        duration: 0,
        details: 'Merge did not create, overwrite, OR skip the validation persona',
      };
    }
    details.push(
      `merge: ${mergeResult.log.created.length} created, ${mergeResult.log.overwritten.length} overwritten, ${mergeResult.log.skipped.length} skipped`
    );

    // === Step 3: write credentials to a test-scoped location ===
    // NOTE: writeCredentials writes to real chrome.storage.local. To avoid
    // clobbering the user's keys, we write then immediately restore the backup.
    const writeResult = await writeCredentials(walked.envCredentials);
    if (writeResult.rejected.length > 0) {
      // Restore before returning error
      await writeCredentials(credsBackup);
      return {
        name: 'setup-folder-import',
        success: false,
        duration: 0,
        details: `writeCredentials rejected: ${writeResult.rejected.map((r) => `${r.key}:${r.reason}`).join(', ')}`,
      };
    }
    details.push(`writeCredentials: ${writeResult.written.length} written`);

    // === Step 4: verify storage state ===
    const afterWrite = await readCredentials();
    if (afterWrite.deepgramApiKey !== 'test_fixture_deepgram') {
      await writeCredentials(credsBackup);
      return {
        name: 'setup-folder-import',
        success: false,
        duration: 0,
        details: 'Storage state mismatch after write: deepgramApiKey not set to fixture value',
      };
    }

    // === Step 5: restore the user's real credentials ===
    // First clear the fixture keys (empty string triggers clear).
    const clearPayload: Record<string, string> = {};
    for (const key of CREDENTIAL_KEYS) clearPayload[key] = '';
    await writeCredentials(clearPayload);
    // Then restore the backup.
    await writeCredentials(credsBackup);

    // === Step 6: do NOT save merged personas to storage ===
    // The merge was tested against a COPY of the real personas. Writing the
    // merged array would add the fixture persona to the user's real storage.
    // Skipping savePersonas for this reason — merge logic correctness was
    // already verified in step 2 by inspecting mergeResult.log.
    // If we wanted full round-trip, we would snapshot personas first, call
    // savePersonas(mergeResult.merged), verify, then restore with
    // savePersonas(personasBackup). Doing the explicit restore here in case
    // a future edit accidentally calls savePersonas above.
    await savePersonas(personasBackup);

    return {
      name: 'setup-folder-import',
      success: true,
      duration: 0,
      details: details.join(' | '),
    };
  } catch (err) {
    return {
      name: 'setup-folder-import',
      success: false,
      duration: 0,
      details: 'Test threw an unexpected exception',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
