/**
 * Line-level diff engine for prompt version comparison.
 *
 * Uses Longest Common Subsequence (LCS) to produce a line-by-line diff.
 * Consecutive unchanged lines are collapsed to "..." with 1 context line
 * above and below each change for readability.
 */

export type DiffLineType = 'same' | 'add' | 'remove' | 'ellipsis';

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

/**
 * Generate a line-by-line diff between two texts.
 * Returns an array of DiffLine entries with same/add/remove markers.
 */
export function generateDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  // Backtrack to build diff
  const rawDiff: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      rawDiff.push({ type: 'same', text: oldLines[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      rawDiff.push({ type: 'add', text: newLines[j - 1]! });
      j--;
    } else {
      rawDiff.push({ type: 'remove', text: oldLines[i - 1]! });
      i--;
    }
  }

  rawDiff.reverse();
  return collapseUnchanged(rawDiff);
}

/**
 * Collapse consecutive unchanged lines into "..." ellipsis entries.
 * Keeps 1 context line before and after each change block.
 * Runs of 3+ consecutive "same" lines are collapsed.
 */
function collapseUnchanged(diff: DiffLine[]): DiffLine[] {
  if (diff.length === 0) return [];

  // Mark which "same" lines are within 1 line of a change
  const keepFlags = new Array<boolean>(diff.length).fill(false);

  for (let i = 0; i < diff.length; i++) {
    if (diff[i]!.type !== 'same') {
      keepFlags[i] = true;
      // Mark 1 line before
      if (i > 0 && diff[i - 1]!.type === 'same') keepFlags[i - 1] = true;
      // Mark 1 line after
      if (i < diff.length - 1 && diff[i + 1]!.type === 'same') keepFlags[i + 1] = true;
    }
  }

  // Also keep first and last lines if they're "same" (for context)
  if (diff.length > 0 && diff[0]!.type === 'same') keepFlags[0] = true;
  if (diff.length > 0 && diff[diff.length - 1]!.type === 'same') keepFlags[diff.length - 1] = true;

  // Build result with ellipsis for collapsed sections
  const result: DiffLine[] = [];
  let inEllipsis = false;

  for (let i = 0; i < diff.length; i++) {
    const line = diff[i]!;

    if (line.type !== 'same' || keepFlags[i]) {
      if (inEllipsis) {
        result.push({ type: 'ellipsis', text: '...' });
        inEllipsis = false;
      }
      result.push(line);
    } else {
      inEllipsis = true;
    }
  }

  // If file ends with collapsed unchanged lines
  if (inEllipsis) {
    result.push({ type: 'ellipsis', text: '...' });
  }

  return result;
}

/**
 * Render a diff to a simple text representation (for debugging/testing).
 * Prefixes: "  " for same, "+ " for add, "- " for remove, "  ..." for ellipsis.
 */
export function renderDiffText(diff: DiffLine[]): string {
  return diff
    .map((line) => {
      switch (line.type) {
        case 'same': return `  ${line.text}`;
        case 'add': return `+ ${line.text}`;
        case 'remove': return `- ${line.text}`;
        case 'ellipsis': return '  ...';
      }
    })
    .join('\n');
}
