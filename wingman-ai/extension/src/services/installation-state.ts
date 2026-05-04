/**
 * InstallationStateService — tracks whether the user is a new installer
 * or an existing user upgrading to the localized version.
 *
 * State machine:
 *   installTimestamp absent                         → UPGRADE_PENDING (pre-localization install)
 *   installTimestamp present, upgradeAcknowledged absent/false → UPGRADE_PENDING
 *   installTimestamp present, upgradeAcknowledged true         → STEADY_STATE
 *
 * Fresh install path: recordInstall() sets installTimestamp → UPGRADE_PENDING
 *   → options page shows one-time banner → acknowledgeUpgrade() → STEADY_STATE
 *
 * Task F4-T1 (FR-033, FR-034, FR-035)
 */

export type InstallationState = 'FRESH_INSTALL' | 'UPGRADE_PENDING' | 'STEADY_STATE';

class InstallationStateServiceImpl {
  /**
   * Returns the current installation state by reading chrome.storage.local.
   */
  async getState(): Promise<InstallationState> {
    const result = await chrome.storage.local.get(['installTimestamp', 'upgradeAcknowledged']);

    if (!result.installTimestamp) {
      // No install timestamp — existing user who installed before the localization feature
      return 'UPGRADE_PENDING';
    }

    if (!result.upgradeAcknowledged) {
      return 'UPGRADE_PENDING';
    }

    return 'STEADY_STATE';
  }

  /**
   * Records a fresh install by setting installTimestamp to the current epoch ms.
   * Idempotent: does not overwrite an existing timestamp.
   */
  async recordInstall(): Promise<void> {
    const existing = await chrome.storage.local.get('installTimestamp');
    if (!existing.installTimestamp) {
      await chrome.storage.local.set({ installTimestamp: Date.now() });
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
