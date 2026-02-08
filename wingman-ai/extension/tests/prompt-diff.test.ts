import { describe, it, expect } from 'vitest';
import { generateDiff, renderDiffText, type DiffLine } from '../src/services/prompt-diff';

describe('Diff engine', () => {
  it('detects single line change', () => {
    const diff = generateDiff('A\nB\nC', 'A\nX\nC');
    const types = diff.map((d) => d.type);

    // Should have: A=same, B=remove, X=add, C=same
    expect(types).toContain('same');
    expect(types).toContain('remove');
    expect(types).toContain('add');

    const removed = diff.find((d) => d.type === 'remove');
    expect(removed?.text).toBe('B');

    const added = diff.find((d) => d.type === 'add');
    expect(added?.text).toBe('X');
  });

  it('marks identical texts as all same', () => {
    const text = 'Line 1\nLine 2\nLine 3';
    const diff = generateDiff(text, text);

    // All lines should be same (possibly with ellipsis collapse)
    const nonEllipsis = diff.filter((d) => d.type !== 'ellipsis');
    for (const line of nonEllipsis) {
      expect(line.type).toBe('same');
    }
  });

  it('marks completely different texts', () => {
    const diff = generateDiff('A\nB\nC', 'X\nY\nZ');
    const types = diff.map((d) => d.type);

    // All old lines removed, all new lines added
    expect(types.filter((t) => t === 'remove')).toHaveLength(3);
    expect(types.filter((t) => t === 'add')).toHaveLength(3);
    expect(types.filter((t) => t === 'same')).toHaveLength(0);
  });

  it('handles empty old text (all adds)', () => {
    const diff = generateDiff('', 'A\nB\nC');
    const nonEllipsis = diff.filter((d) => d.type !== 'ellipsis');

    // Empty string splits to [''] — the empty line may be marked as remove
    // Then A, B, C are all adds
    const adds = nonEllipsis.filter((d) => d.type === 'add');
    expect(adds.length).toBeGreaterThanOrEqual(3);
  });

  it('handles empty new text (all removes)', () => {
    const diff = generateDiff('A\nB\nC', '');
    const nonEllipsis = diff.filter((d) => d.type !== 'ellipsis');

    const removes = nonEllipsis.filter((d) => d.type === 'remove');
    expect(removes.length).toBeGreaterThanOrEqual(3);
  });

  it('collapses unchanged sections with ellipsis', () => {
    // 10 lines with a change in the middle (line 5)
    const oldLines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`);
    const newLines = [...oldLines];
    newLines[4] = 'CHANGED LINE 5';

    const diff = generateDiff(oldLines.join('\n'), newLines.join('\n'));

    // Should have ellipsis entries where unchanged lines are collapsed
    const hasEllipsis = diff.some((d) => d.type === 'ellipsis');
    expect(hasEllipsis).toBe(true);

    // The change should still be visible
    const hasRemove = diff.some((d) => d.type === 'remove' && d.text === 'Line 5');
    const hasAdd = diff.some((d) => d.type === 'add' && d.text === 'CHANGED LINE 5');
    expect(hasRemove).toBe(true);
    expect(hasAdd).toBe(true);

    // Context lines around the change should be preserved
    const sameTexts = diff.filter((d) => d.type === 'same').map((d) => d.text);
    expect(sameTexts).toContain('Line 4'); // 1 before change
    expect(sameTexts).toContain('Line 6'); // 1 after change
  });

  it('renderDiffText produces correct prefixes', () => {
    const diff: DiffLine[] = [
      { type: 'same', text: 'unchanged' },
      { type: 'remove', text: 'old line' },
      { type: 'add', text: 'new line' },
      { type: 'ellipsis', text: '...' },
    ];

    const output = renderDiffText(diff);
    expect(output).toContain('  unchanged');
    expect(output).toContain('- old line');
    expect(output).toContain('+ new line');
    expect(output).toContain('  ...');
  });

  it('handles both texts empty', () => {
    const diff = generateDiff('', '');
    // Should be a single "same" line for the empty string
    const nonEllipsis = diff.filter((d) => d.type !== 'ellipsis');
    expect(nonEllipsis.length).toBeLessThanOrEqual(1);
  });

  it('handles multiline additions at the end', () => {
    const diff = generateDiff('A\nB', 'A\nB\nC\nD');
    const adds = diff.filter((d) => d.type === 'add');
    expect(adds).toHaveLength(2);
    expect(adds.map((a) => a.text)).toEqual(['C', 'D']);
  });

  it('handles multiline removals at the start', () => {
    const diff = generateDiff('X\nY\nA\nB', 'A\nB');
    const removes = diff.filter((d) => d.type === 'remove');
    expect(removes).toHaveLength(2);
    expect(removes.map((r) => r.text)).toEqual(['X', 'Y']);
  });

  it('preserves context lines at file boundaries', () => {
    // Change at line 1, rest unchanged (8 lines)
    const oldLines = ['ORIGINAL', ...Array.from({ length: 7 }, (_, i) => `Line ${i + 2}`)];
    const newLines = ['CHANGED', ...Array.from({ length: 7 }, (_, i) => `Line ${i + 2}`)];

    const diff = generateDiff(oldLines.join('\n'), newLines.join('\n'));

    // First line should be the change (remove + add)
    const firstNonEllipsis = diff.filter((d) => d.type !== 'ellipsis');
    expect(firstNonEllipsis[0]?.type).toBe('remove');
    expect(firstNonEllipsis[0]?.text).toBe('ORIGINAL');
  });
});
