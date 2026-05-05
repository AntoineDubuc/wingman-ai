/**
 * Tests for installation-state.ts — InstallationStateService
 *
 * Covers all 6 acceptance criteria for the state machine:
 * 1. getState() returns UPGRADE_PENDING when installTimestamp absent
 * 2. getState() returns UPGRADE_PENDING when installTimestamp present but upgradeAcknowledged absent
 * 3. getState() returns STEADY_STATE when both present and upgradeAcknowledged=true
 * 4. recordInstall() sets installTimestamp to a number
 * 5. recordInstall() is idempotent — second call does not change timestamp
 * 6. acknowledgeUpgrade() sets upgradeAcknowledged=true
 *
 * Also tests v1-storage-snapshot fixture (pre-localization user → UPGRADE_PENDING).
 *
 * Task F4-T1
 */

import { describe, it, expect } from 'vitest';
import { installationStateService } from '../src/services/installation-state';
import v1StorageSnapshot from './fixtures/v1-storage-snapshot.json';

describe('InstallationStateService — getState()', () => {
  it('AC1: returns UPGRADE_PENDING when storage is empty (no installTimestamp)', async () => {
    const state = await installationStateService.getState();
    expect(state).toBe('UPGRADE_PENDING');
  });

  it('AC2: returns UPGRADE_PENDING when installTimestamp is present but upgradeAcknowledged is absent', async () => {
    await chrome.storage.local.set({ installTimestamp: Date.now() });
    const state = await installationStateService.getState();
    expect(state).toBe('UPGRADE_PENDING');
  });

  it('AC3: returns STEADY_STATE when installTimestamp present and upgradeAcknowledged=true', async () => {
    await chrome.storage.local.set({ installTimestamp: Date.now(), upgradeAcknowledged: true });
    const state = await installationStateService.getState();
    expect(state).toBe('STEADY_STATE');
  });

  it('returns UPGRADE_PENDING when installTimestamp present and upgradeAcknowledged=false', async () => {
    await chrome.storage.local.set({ installTimestamp: Date.now(), upgradeAcknowledged: false });
    const state = await installationStateService.getState();
    expect(state).toBe('UPGRADE_PENDING');
  });
});

describe('InstallationStateService — recordInstall()', () => {
  it('AC4: sets installTimestamp to a number in local storage', async () => {
    const before = Date.now();
    await installationStateService.recordInstall();
    const after = Date.now();

    const result = await chrome.storage.local.get('installTimestamp');
    expect(typeof result.installTimestamp).toBe('number');
    expect(result.installTimestamp as number).toBeGreaterThanOrEqual(before);
    expect(result.installTimestamp as number).toBeLessThanOrEqual(after);
  });

  it('AC5: is idempotent — second call does not overwrite existing timestamp', async () => {
    await installationStateService.recordInstall();
    const result1 = await chrome.storage.local.get('installTimestamp');
    const firstTimestamp = result1.installTimestamp;

    // Small delay to ensure Date.now() would differ if re-written
    await new Promise(resolve => setTimeout(resolve, 5));

    await installationStateService.recordInstall();
    const result2 = await chrome.storage.local.get('installTimestamp');
    expect(result2.installTimestamp).toBe(firstTimestamp);
  });
});

describe('InstallationStateService — acknowledgeUpgrade()', () => {
  it('AC6: sets upgradeAcknowledged to true in local storage', async () => {
    await installationStateService.acknowledgeUpgrade();
    const result = await chrome.storage.local.get('upgradeAcknowledged');
    expect(result.upgradeAcknowledged).toBe(true);
  });

  it('transitions state to STEADY_STATE after recordInstall + acknowledgeUpgrade', async () => {
    await installationStateService.recordInstall();
    await installationStateService.acknowledgeUpgrade();
    const state = await installationStateService.getState();
    expect(state).toBe('STEADY_STATE');
  });
});

describe('InstallationStateService — v1 storage fixture (pre-localization user)', () => {
  it('returns UPGRADE_PENDING for a user who installed before localization shipped', async () => {
    // Populate storage with the v1 snapshot (has apiKey/groqApiKey but no installTimestamp/upgradeAcknowledged)
    const snapshotEntries = v1StorageSnapshot as Record<string, string>;
    const storableEntries: Record<string, string> = {};
    for (const [key, value] of Object.entries(snapshotEntries)) {
      if (!key.startsWith('_')) {
        storableEntries[key] = value;
      }
    }
    await chrome.storage.local.set(storableEntries);

    const state = await installationStateService.getState();
    expect(state).toBe('UPGRADE_PENDING');
  });
});

describe('InstallationStateService — FRESH_INSTALL branch (Plan 1 Task 4)', () => {
  it("AC-FI-1: returns FRESH_INSTALL after recordInstall('install') without acknowledge", async () => {
    await installationStateService.recordInstall('install');
    const state = await installationStateService.getState();
    expect(state).toBe('FRESH_INSTALL');
  });
});
