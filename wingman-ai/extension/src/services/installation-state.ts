/**
 * InstallationStateService — tracks whether the user is a new installer
 * or an existing user upgrading to the localized version.
 *
 * State machine (Plan 1 Task 4 — installReason added to disambiguate FRESH_INSTALL vs UPGRADE_PENDING):
 *   installTimestamp absent                                                      → UPGRADE_PENDING (pre-localization install / legacy user)
 *   installTimestamp present, installReason='install', upgradeAcknowledged absent/false → FRESH_INSTALL  (brand-new installer)
 *   installTimestamp present, installReason='update',  upgradeAcknowledged absent/false → UPGRADE_PENDING (legacy user who upgraded)
 *   installTimestamp present, installReason absent (legacy/transient), upgradeAcknowledged absent/false → UPGRADE_PENDING (conservative default)
 *   installTimestamp present, upgradeAcknowledged true                           → STEADY_STATE  (banner already acknowledged)
 *
 * Fresh install path:  recordInstall('install') → FRESH_INSTALL → (no banner per Plan 1) → acknowledgeUpgrade() → STEADY_STATE
 * Upgrade path:        recordInstall('update')  → UPGRADE_PENDING → options page shows banner → acknowledgeUpgrade() → STEADY_STATE
 *
 * Task F4-T1 (FR-033, FR-034, FR-035) + Plan 1 Task 4 (FR-032 FRESH_INSTALL branch)
 */

export type InstallationReason = 'install' | 'update';
export type InstallationState = 'FRESH_INSTALL' | 'UPGRADE_PENDING' | 'STEADY_STATE';

class InstallationStateServiceImpl {
  /**
   * Returns the current installation state by reading chrome.storage.local.
   */
  async getState(): Promise<InstallationState> {
    const result = await chrome.storage.local.get([
      'installTimestamp',
      'installReason',
      'upgradeAcknowledged',
    ]);

    if (!result.installTimestamp) {
      // No install timestamp — existing user who installed before the localization feature
      return 'UPGRADE_PENDING';
    }

    if (result.upgradeAcknowledged) {
      return 'STEADY_STATE';
    }

    // installTimestamp present, not acknowledged — branch on reason
    if (result.installReason === 'install') {
      return 'FRESH_INSTALL';
    }

    // installReason === 'update' OR absent (legacy/transient) → conservative UPGRADE_PENDING
    return 'UPGRADE_PENDING';
  }

  /**
   * Records an install event by atomically setting installTimestamp and installReason.
   * Idempotent: does not overwrite either field once set (first call wins).
   *
   * @param reason — 'install' for a brand-new installer, 'update' for an upgrade.
   *   Defaults to 'install' for backward compat with any unparameterized callers
   *   (defensive — no production callers omit the arg today, but a future caller could).
   */
  async recordInstall(reason: InstallationReason = 'install'): Promise<void> {
    const existing = await chrome.storage.local.get(['installTimestamp', 'installReason']);
    if (!existing.installTimestamp) {
      // Atomic write: both fields set in a single chrome.storage.local.set call.
      // A two-call sequence creates a race where getState() reads installTimestamp
      // but not installReason and returns the wrong state.
      await chrome.storage.local.set({
        installTimestamp: Date.now(),
        installReason: reason,
      });
    }
  }

  /**
   * Marks the upgrade banner as acknowledged, transitioning state to STEADY_STATE
   * on the next getState() call (assuming installTimestamp is also set).
   */
  async acknowledgeUpgrade(): Promise<void> {
    await chrome.storage.local.set({ upgradeAcknowledged: true });
  }
}

export const installationStateService = new InstallationStateServiceImpl();
