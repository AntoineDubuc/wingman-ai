import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const LOCALES_DIR = join(process.cwd(), 'src', 'locales');

// Unicode bidi override characters (OWASP Unicode security)
// Note: no 'g' flag to avoid stateful lastIndex issue with .test()
const BIDI_OVERRIDE_REGEX = /[‪-‮⁦-⁩‏]/;
// Zero-width characters
const ZERO_WIDTH_REGEX = /[​‌‍﻿]/;

export interface Violation {
  file: string;
  type: 'bidi_override' | 'zero_width' | 'non_nfc';
  detail: string;
}

export function checkFileContent(filePath: string, content: string): Violation[] {
  const violations: Violation[] = [];

  if (BIDI_OVERRIDE_REGEX.test(content)) {
    violations.push({ file: filePath, type: 'bidi_override', detail: 'Unicode bidi override characters detected' });
  }

  if (ZERO_WIDTH_REGEX.test(content)) {
    violations.push({ file: filePath, type: 'zero_width', detail: 'Zero-width characters detected' });
  }

  if (content.normalize('NFC') !== content) {
    violations.push({ file: filePath, type: 'non_nfc', detail: 'Non-NFC normalized Unicode detected' });
  }

  return violations;
}

function findJsonFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        files.push(...findJsonFiles(fullPath));
      } else if (extname(entry) === '.json') {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory may not exist yet (e.g., src/locales not yet created)
  }
  return files;
}

function main() {
  let jsonFiles: string[];
  try {
    jsonFiles = findJsonFiles(LOCALES_DIR);
  } catch {
    console.error(`Error reading locales directory: ${LOCALES_DIR}`);
    process.exit(1);
  }

  let allViolations: Violation[] = [];

  for (const filePath of jsonFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      allViolations = allViolations.concat(checkFileContent(filePath, content));
    } catch {
      console.error(`Error reading file: ${filePath}`);
      process.exit(1);
    }
  }

  if (allViolations.length > 0) {
    console.error('\nBUILD-03 FAILED: Unicode violations in locale files\n');
    for (const v of allViolations) {
      console.error(`  [${v.type}] ${v.file}: ${v.detail}`);
    }
    console.error('\nFix: Remove the flagged characters from the locale files.\n');
    process.exit(1);
  }

  console.log(`BUILD-03 PASSED: ${jsonFiles.length} locale files have no Unicode violations`);
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  main();
}
