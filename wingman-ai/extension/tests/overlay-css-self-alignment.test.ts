/**
 * overlay.css invariant tests for self-entry alignment.
 *
 * The self-entry chat-aligned layout MUST use CSS logical properties only
 * (margin-inline-start, border-start-start-radius, padding-inline, etc.) —
 * not physical (margin-left, border-top-left-radius, padding-left). Physical
 * properties do not flip under `dir="rtl"`, so using them breaks Arabic /
 * Hebrew layouts and violates WCAG 1.3.2 (meaningful sequence).
 *
 * Source: Research/features/transcript-alignment-fix/research.md#Finding-8,
 * UX+A11y persona review #4 (BLOCKER), MDN guidance on flex-direction
 * row-reverse. This test guards against silent regression to physical
 * properties in the self-entry rule block.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('overlay.css — self-entry alignment invariants', () => {
  const cssSourceRaw = readFileSync(
    resolve(import.meta.dirname, '../src/content/overlay/overlay.css'),
    'utf8',
  );
  // Strip /* ... */ comments so documentation mentions of banned patterns don't
  // trigger the grep. Keeps rule syntax intact.
  const cssSource = cssSourceRaw.replace(/\/\*[\s\S]*?\*\//g, '');

  // Isolate the .transcript-entry.self block — everything from "\.transcript-entry\.self {"
  // to the matching "}". Use a non-greedy capture that stops at the next opening
  // `.transcript-entry.self .<something>` rule.
  function extractSelfRuleBlock(): string {
    const match = cssSource.match(/\.transcript-entry\.self\s*\{[^}]+\}/);
    return match ? match[0] : '';
  }

  it('.transcript-entry.self rule exists', () => {
    expect(extractSelfRuleBlock()).not.toBe('');
  });

  it('.transcript-entry.self uses margin-inline-start (not margin-left)', () => {
    const block = extractSelfRuleBlock();
    expect(block).toMatch(/margin-inline-start:\s*auto/);
    expect(block).not.toMatch(/margin-left:/);
    expect(block).not.toMatch(/margin-right:/);
  });

  it('.transcript-entry.self uses logical border-radius properties', () => {
    const block = extractSelfRuleBlock();
    expect(block).toMatch(/border-start-start-radius/);
    expect(block).toMatch(/border-end-end-radius/);
    // Physical forms must NOT appear — these would not flip under dir="rtl"
    expect(block).not.toMatch(/border-top-left-radius/);
    expect(block).not.toMatch(/border-top-right-radius/);
    expect(block).not.toMatch(/border-bottom-left-radius/);
    expect(block).not.toMatch(/border-bottom-right-radius/);
  });

  it('.transcript-entry.self uses padding-block / padding-inline (not padding-left/right/top/bottom)', () => {
    const block = extractSelfRuleBlock();
    expect(block).toMatch(/padding-(?:block|inline)/);
    expect(block).not.toMatch(/padding-left:/);
    expect(block).not.toMatch(/padding-right:/);
  });

  it('.transcript-entry.self .transcript-speaker rule hides the speaker row', () => {
    expect(cssSource).toMatch(
      /\.transcript-entry\.self\s+\.transcript-speaker\s*\{\s*[^}]*display:\s*none[^}]*\}/,
    );
  });

  it('.transcript-entry.self .transcript-text resets padding-inline-start (not padding-left)', () => {
    const match = cssSource.match(
      /\.transcript-entry\.self\s+\.transcript-text\s*\{[^}]+\}/,
    );
    expect(match).not.toBeNull();
    expect(match![0]).toMatch(/padding-inline-start:\s*0/);
    expect(match![0]).not.toMatch(/padding-left:\s*0/);
  });

  it('no flex-direction: row-reverse introduced anywhere in overlay.css', () => {
    // WCAG 1.3.2 / MDN explicit — row-reverse desyncs DOM order from visual
    // order, breaking screen-reader sequence.
    expect(cssSource).not.toMatch(/flex-direction:\s*row-reverse/);
  });

  it('.sr-only utility class exists with standard visually-hidden declarations', () => {
    const match = cssSource.match(/\.sr-only\s*\{[^}]+\}/);
    expect(match, '.sr-only rule not found').not.toBeNull();
    const block = match![0];
    expect(block).toMatch(/position:\s*absolute/);
    expect(block).toMatch(/width:\s*1px/);
    expect(block).toMatch(/height:\s*1px/);
    expect(block).toMatch(/overflow:\s*hidden/);
    expect(block).toMatch(/clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
  });

  it('@media (prefers-reduced-motion: reduce) suppresses .transcript-entry animation', () => {
    // overlay.css may have multiple prefers-reduced-motion blocks (existing +
    // ours). Find ALL such blocks and assert that at least one contains the
    // .transcript-entry animation override. The non-greedy .*? can't span
    // nested braces, so match with a manual brace-balanced scan: capture from
    // "@media (prefers-reduced-motion: reduce) {" through the matching "}"
    // at the outer level.
    const blocks: string[] = [];
    const regex = /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(cssSource)) !== null) {
      const startIdx = match.index + match[0].length;
      let depth = 1;
      let i = startIdx;
      while (i < cssSource.length && depth > 0) {
        if (cssSource[i] === '{') depth++;
        else if (cssSource[i] === '}') depth--;
        i++;
      }
      blocks.push(cssSource.slice(startIdx, i - 1));
    }
    expect(blocks.length, 'no prefers-reduced-motion media query found').toBeGreaterThan(0);
    // At least one media block must zero the .transcript-entry animation.
    const transcriptOverride = blocks.some((b) =>
      /\.transcript-entry\s*\{[^}]*animation:\s*none/.test(b),
    );
    expect(
      transcriptOverride,
      `Found ${blocks.length} prefers-reduced-motion block(s), none override .transcript-entry animation`,
    ).toBe(true);
  });
});
