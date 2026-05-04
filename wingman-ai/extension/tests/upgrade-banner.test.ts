/**
 * Tests for F4-T3: Upgrade Banner in Options Page
 *
 * Tests the maybeShowUpgradeBanner function which shows a one-time upgrade
 * banner when InstallationState === 'UPGRADE_PENDING'.
 *
 * @vitest-environment jsdom
 *
 * Acceptance Criteria:
 * AC1: Banner appears on first options page open for UPGRADE_PENDING state
 * AC2: Banner is dismissed permanently when "Got it" is clicked
 * AC3: Banner does NOT reappear after dismissal (STEADY_STATE → no banner)
 * AC4: Banner text is localized (renders in detected locale)
 * AC5: Banner uses textContent for all string insertion (not innerHTML)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { i18n as I18n } from 'i18next';

// Mock options-locale
vi.mock('../src/options/options-locale', () => ({
  initOptionsI18n: vi.fn().mockResolvedValue({
    i18n: { t: vi.fn((key: string) => key) },
    locale: 'en',
  }),
  renderLanguagePicker: vi.fn(),
  handleStorageChange: vi.fn(),
}));

// Mock installation-state service
vi.mock('../src/services/installation-state', () => ({
  installationStateService: {
    getState: vi.fn().mockResolvedValue('STEADY_STATE'),
    acknowledgeUpgrade: vi.fn().mockResolvedValue(undefined),
    recordInstall: vi.fn(),
  },
}));

// Import after mocks are defined
import { maybeShowUpgradeBanner } from '../src/options/options';
import { installationStateService } from '../src/services/installation-state';

const mockGetState = vi.mocked(installationStateService.getState);
const mockAcknowledge = vi.mocked(installationStateService.acknowledgeUpgrade);

function makeMockI18n(): I18n {
  return {
    t: vi.fn((key: string) => key),
  } as unknown as I18n;
}

beforeEach(() => {
  document.body.innerHTML = `
    <main class="options-content">
      <div id="content"></div>
    </main>
  `;
  vi.clearAllMocks();
});

describe('maybeShowUpgradeBanner', () => {
  it('AC1: shows banner when UPGRADE_PENDING', async () => {
    mockGetState.mockResolvedValue('UPGRADE_PENDING');
    const mockI18n = makeMockI18n();

    await maybeShowUpgradeBanner(mockI18n);

    expect(document.querySelector('#localization-upgrade-banner')).toBeTruthy();
  });

  it('AC3: does not show banner when STEADY_STATE', async () => {
    mockGetState.mockResolvedValue('STEADY_STATE');
    const mockI18n = makeMockI18n();

    await maybeShowUpgradeBanner(mockI18n);

    expect(document.querySelector('#localization-upgrade-banner')).toBeNull();
  });

  it('does not show banner when FRESH_INSTALL', async () => {
    mockGetState.mockResolvedValue('FRESH_INSTALL');
    const mockI18n = makeMockI18n();

    await maybeShowUpgradeBanner(mockI18n);

    expect(document.querySelector('#localization-upgrade-banner')).toBeNull();
  });

  it('AC5: banner uses textContent not innerHTML for title', async () => {
    mockGetState.mockResolvedValue('UPGRADE_PENDING');
    const mockI18n = makeMockI18n();

    await maybeShowUpgradeBanner(mockI18n);

    const title = document.querySelector('#localization-upgrade-banner h3');
    expect(title?.textContent).toBe('options.upgrade_banner.title');
  });

  it('AC5: banner uses textContent not innerHTML for body text', async () => {
    mockGetState.mockResolvedValue('UPGRADE_PENDING');
    const mockI18n = makeMockI18n();

    await maybeShowUpgradeBanner(mockI18n);

    const body = document.querySelector('#localization-upgrade-banner p');
    expect(body?.textContent).toBe('options.upgrade_banner.body');
  });

  it('AC2: dismiss button calls acknowledgeUpgrade and removes banner', async () => {
    mockGetState.mockResolvedValue('UPGRADE_PENDING');
    mockAcknowledge.mockResolvedValue(undefined);
    const mockI18n = makeMockI18n();

    await maybeShowUpgradeBanner(mockI18n);

    const button = document.querySelector('#localization-upgrade-banner button') as HTMLButtonElement;
    expect(button).not.toBeNull();

    button.click();

    // Wait for async handler to run
    await new Promise((r) => setTimeout(r, 10));

    expect(mockAcknowledge).toHaveBeenCalled();
    expect(document.querySelector('#localization-upgrade-banner')).toBeNull();
  });

  it('banner inserted at top of options-content', async () => {
    mockGetState.mockResolvedValue('UPGRADE_PENDING');
    const mockI18n = makeMockI18n();

    await maybeShowUpgradeBanner(mockI18n);

    const content = document.querySelector('.options-content');
    expect(content?.firstChild).toBe(document.querySelector('#localization-upgrade-banner'));
  });

  it('banner has correct CSS class', async () => {
    mockGetState.mockResolvedValue('UPGRADE_PENDING');
    const mockI18n = makeMockI18n();

    await maybeShowUpgradeBanner(mockI18n);

    const banner = document.querySelector('#localization-upgrade-banner');
    expect(banner?.classList.contains('upgrade-banner')).toBe(true);
  });

  it('AC4: calls i18n.t with correct keys for localization', async () => {
    mockGetState.mockResolvedValue('UPGRADE_PENDING');
    const mockI18n = makeMockI18n();
    const tSpy = vi.mocked(mockI18n.t as unknown as (key: string) => string);

    await maybeShowUpgradeBanner(mockI18n);

    expect(tSpy).toHaveBeenCalledWith('options.upgrade_banner.title');
    expect(tSpy).toHaveBeenCalledWith('options.upgrade_banner.body');
    expect(tSpy).toHaveBeenCalledWith('options.upgrade_banner.dismiss_button');
  });

  it('does not insert banner when .options-content does not exist in DOM', async () => {
    // Clear the DOM so there is no .options-content
    document.body.innerHTML = '<div id="other"></div>';
    mockGetState.mockResolvedValue('UPGRADE_PENDING');
    const mockI18n = makeMockI18n();

    // Should not throw even when container is missing
    await expect(maybeShowUpgradeBanner(mockI18n)).resolves.toBeUndefined();

    expect(document.querySelector('#localization-upgrade-banner')).toBeNull();
  });
});
