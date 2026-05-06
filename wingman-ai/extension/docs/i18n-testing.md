# i18n Testing Guide

Cross-cutting test infrastructure for the localization implementation gap.

## 1. Locale-parameterized vitest harness (Plans 4-11 use this)

### `describeEachLocale(name, body)`

Wraps a `describe` block in a per-locale loop, providing a real i18n instance bound to each of the 5 supported locales.

```ts
import { describeEachLocale } from './helpers/i18n-locales';

describeEachLocale('popup renders', (locale, i18n) => {
  it(`shows the start-session label in ${locale}`, () => {
    const label = i18n.t('popup.start_session');
    expect(label).toBeTruthy();
    // For locale-specific assertions:
    if (locale === 'fr') expect(label).toBe('Démarrer la session');
  });
});
```

The harness expands once per locale at vitest collection time. Each iteration receives:
- `locale: SupportedLocale` — one of `'en' | 'fr' | 'es' | 'ro' | 'ru'`.
- `i18n: I18n` — a real i18next instance bound to that locale (created via `createI18nInstance(locale)`, same as production).

### When to use it

- Surface-level tests that exercise i18n consumption: popup, options, overlay, summary, etc.
- Bundle smoke tests: presence/absence/non-emptiness of keys.
- Regression guards: ensure non-en bundles aren't accidentally English.

### When NOT to use it

- Function-level unit tests with mocked i18n. The mocks already control the i18n surface; running 5 times adds no signal.
- Tests for locale-detection logic itself (those test the OUTPUT — locale code — not the i18n instance).

## 2. Playwright visual regression (per locale per surface)

### Setup

Run once after fresh clone:
```bash
npm install -D @playwright/test  # required runner; not yet in devDependencies
npx playwright install chromium
```

### Scripts

```bash
npm run build            # produces dist/
npm run test:e2e         # runs e2e/visual-regression.spec.ts (diffs)
npm run test:e2e:update  # captures fresh baselines (commit them)
```

### Coverage

| Surface | Locales covered today | Localized today? |
|---|---|---|
| Options page | en/fr/es/ro/ru | YES (post-Plan 2 picker; sections still en pending Plan 5) |
| Popup | en/fr/es/ro/ru | NO (pending Plan 4) |
| Overlay | NOT YET | NO (pending Plan 6) |

Plans 4 and 6 are responsible for capturing initial baselines for popup and overlay respectively; the Plan 12 scaffold provides the harness pattern.

### Diff threshold

`maxDiffPixelRatio: 0.005` (0.5%) — accommodates font hinting differences across locale-specific rendering. Increase per-test if a surface has known acceptable variance (e.g., overlay's emotion badge).

## 3. Deferred components (Plan 12 hand-off)

| Component | Owner | Reason for deferral |
|---|---|---|
| Initial Playwright baseline capture (popup en) | Plan 4 | Popup is not yet localized; baseline now would freeze the broken-English-only state |
| Initial Playwright baseline capture (overlay × 5) | Plan 6 | Overlay needs an active session to render; capture pattern requires session orchestration |
| `@playwright/test` install | local-only until CI | Adding a devDependency is environment-affecting; deferred until CI lands |
| CI workflow (`.github/workflows/`) | follow-up plan | No `.github/` exists in extension repo; thread-5 NFR-R02 finding |
| GitHub Actions step that runs `npm run test:e2e` on PRs | follow-up | Requires the CI workflow first |

## 4. Authoring tests with the harness — checklist for Plans 4-11

- [ ] Use `describeEachLocale` for tests that exercise i18n.t() against real bundles.
- [ ] Hard-code a few locale-specific expected values (`'Langue'` in fr, `'Idioma'` in es) to catch silent-fallback regressions where a locale falls back to English.
- [ ] Don't loop over locales manually with `forEach` — use the harness so vitest's reporting separates per-locale failures.
- [ ] For tests that involve DOM: jsdom is the default (`@vitest-environment jsdom`).
- [ ] For tests that need `chrome.*` APIs: stub via `globalThis.chrome = { ... }` in `beforeEach`.

## 5. Files

| Path | Purpose |
|---|---|
| `tests/helpers/i18n-locales.ts` | The `describeEachLocale` helper |
| `tests/helpers/i18n-locales.test.ts` | Tests for the helper itself |
| `tests/locale-bundles-parametric.test.ts` | Reference example: parametric bundle invariants |
| `playwright.config.ts` | Playwright config (visual regression) |
| `e2e/visual-regression.spec.ts` | Per-locale per-surface screenshot capture |
| `docs/i18n-testing.md` | This document |
