/**
 * Playwright config for Plan 12 visual regression scaffold.
 *
 * The e2e suite loads the built extension as unpacked, opens each surface
 * (popup, options, overlay), and captures full-page screenshots in each of
 * the 5 supported locales. Diffs run via Playwright's native toHaveScreenshot.
 *
 * Run: `npm run test:e2e` (requires `npm run build` first).
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    toHaveScreenshot: {
      // Allow 0.5% pixel difference per locale (font hinting varies slightly)
      maxDiffPixelRatio: 0.005,
    },
  },
  fullyParallel: false, // extension contexts are heavy; run serially
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    headless: false, // chromium extensions require headed mode
    viewport: { width: 1280, height: 800 },
  },
  outputDir: 'e2e/test-results',
});
