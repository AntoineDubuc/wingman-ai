import { describe, test, expect } from 'vitest';
import { checkFileContent } from '../scripts/sanitize-locale-files';

describe('checkFileContent', () => {
  test('returns no violations for clean content', () => {
    const violations = checkFileContent('test.json', '{"key": "Clean string"}');
    expect(violations).toHaveLength(0);
  });

  test('detects bidi override character U+202E', () => {
    const bidiContent = '{"key": "evil‮string"}';
    const violations = checkFileContent('test.json', bidiContent);
    expect(violations.some(v => v.type === 'bidi_override')).toBe(true);
  });

  test('detects zero-width character U+200B', () => {
    const zwContent = '{"key": "hidden​char"}';
    const violations = checkFileContent('test.json', zwContent);
    expect(violations.some(v => v.type === 'zero_width')).toBe(true);
  });

  test('detects non-NFC content', () => {
    // U+0065 + U+0301 = 'é' (NFD form), vs U+00E9 = 'é' (NFC form)
    const nfdString = 'é'; // e + combining acute accent (NFD)
    const nfcContent = `{"key": "${nfdString}"}`;
    expect(nfcContent).not.toBe(nfcContent.normalize('NFC'));
    const violations = checkFileContent('test.json', nfcContent);
    expect(violations.some(v => v.type === 'non_nfc')).toBe(true);
  });

  test('NFC content is accepted', () => {
    const nfcContent = '{"key": "é"}'; // é in NFC (U+00E9)
    const violations = checkFileContent('test.json', nfcContent);
    expect(violations.filter(v => v.type === 'non_nfc')).toHaveLength(0);
  });
});
