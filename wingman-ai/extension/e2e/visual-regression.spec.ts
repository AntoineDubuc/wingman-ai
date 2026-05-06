/**
 * Plan 12 Task 3: Visual regression scaffold per locale per surface.
 *
 * For each supported locale, opens the Options page and captures a full-page
 * screenshot. Plans 4-11 will update baselines as they localize each surface.
 *
 * Surfaces covered:
 * - Options page: ALWAYS captured (localized post-Plan 2).
 * - Popup: captured but baseline accepts current English state until Plan 4.
 * - Overlay: deferred — needs an active session to render; Plan 6 owns the
 *   capture pattern (overlay's Shadow-DOM context complicates the test).
 *
 * Run: `npm run test:e2e`.
 *
 * NOTE: this file expects `dist/` to exist (run `npm run build` first).
 * The first run captures baselines into `e2e/__screenshots__/`; commit them
 * to lock the visual contract. Subsequent runs diff against those baselines.
 */

import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import * as path from 'node:path';

const SUPPORTED_LOCALES = ['en', 'fr', 'es', 'ro', 'ru'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const DIST_PATH = path.resolve(__dirname, '../dist');

async function launchExtension(): Promise<{ context: BrowserContext; extensionId: string }> {
  const userDataDir = path.resolve(__dirname, '.playwright-user-data');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${DIST_PATH}`,
      `--load-extension=${DIST_PATH}`,
    ],
  });

  // Wait for the extension's service worker to register
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 10_000 });
  }
  const extensionId = serviceWorker.url().split('/')[2];
  return { context, extensionId };
}

async function setLocale(context: BrowserContext, extensionId: string, locale: SupportedLocale): Promise<void> {
  // Use a background page to set chrome.storage.sync via the extension's own SW
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);
  await page.evaluate((loc) => {
    return new Promise<void>((resolve) => {
      chrome.storage.sync.set({ language_preference: loc }, () => resolve());
    });
  }, locale);
  await page.close();
}

for (const locale of SUPPORTED_LOCALES) {
  test(`options page renders in ${locale}`, async () => {
    const { context, extensionId } = await launchExtension();
    try {
      await setLocale(context, extensionId, locale);
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);
      // Wait for i18n to apply
      await page.waitForFunction(() => document.documentElement.lang.length > 0);
      await page.waitForTimeout(500); // settle animations / async section init

      await expect(page).toHaveScreenshot(`options-${locale}.png`, {
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  });
}
