import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Repo paths
const EXTENSION_ROOT = join(__dirname, '..');
const PACKAGE_JSON_PATH = join(EXTENSION_ROOT, 'package.json');
// .git lives at the repo root, two levels above extension/
const REPO_ROOT = join(EXTENSION_ROOT, '..', '..');
const HUSKY_PRECOMMIT_PATH = join(REPO_ROOT, '.husky', 'pre-commit');

interface PackageJson {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as PackageJson;
}

describe('Plan 1 Task 3 — sanitization pipeline wiring', () => {
  test('AC1: package.json devDependencies contains husky pinned to ^9', () => {
    const pkg = readPackageJson();
    expect(pkg.devDependencies, 'devDependencies must exist').toBeDefined();
    expect(pkg.devDependencies?.husky, 'husky must be in devDependencies').toBeDefined();
    // ^9 caret-pin: allows minor/patch updates within v9 but blocks v10+
    expect(pkg.devDependencies?.husky).toMatch(/^\^9(\.|$)/);
  });

  test('AC2: package.json scripts.prepare equals "husky"', () => {
    const pkg = readPackageJson();
    expect(pkg.scripts?.prepare).toBe('husky');
  });

  test('AC3: package.json scripts.build starts with sanitize-locale-files', () => {
    const pkg = readPackageJson();
    const buildScript = pkg.scripts?.build ?? '';
    // Sanitizer must be the FIRST step in the chain (before check-i18n-keys.ts)
    expect(buildScript).toMatch(/^npx tsx scripts\/sanitize-locale-files\.ts\s+&&/);
    // and must still run the rest of the chain
    expect(buildScript).toContain('check-i18n-keys.ts');
    expect(buildScript).toContain('tsc');
    expect(buildScript).toContain('vite build');
  });

  test('AC4: .husky/pre-commit exists at repo root and runs npm run unicode-check', () => {
    expect(existsSync(HUSKY_PRECOMMIT_PATH), `.husky/pre-commit must exist at ${HUSKY_PRECOMMIT_PATH}`).toBe(true);
    const hookContents = readFileSync(HUSKY_PRECOMMIT_PATH, 'utf-8');
    // Hook script must invoke unicode-check via portable npm (no .cmd, must work on Linux CI)
    expect(hookContents).toMatch(/npm run unicode-check/);
    // Defensive: must not hardcode npm.cmd which breaks on Linux runners
    expect(hookContents).not.toMatch(/npm\.cmd/);
  });

  test('AC5: existing precommit and unicode-check scripts are still present (not removed)', () => {
    const pkg = readPackageJson();
    expect(pkg.scripts?.['unicode-check']).toBe('npx tsx scripts/sanitize-locale-files.ts');
    expect(pkg.scripts?.precommit).toBe('npx tsx scripts/sanitize-locale-files.ts');
  });
});
