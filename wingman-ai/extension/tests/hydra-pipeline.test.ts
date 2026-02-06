/**
 * Tests for Hydra multi-persona pipeline deduplication logic.
 * Tests the exact-match grouping algorithm used in processTranscriptHydra().
 */

import { describe, it, expect } from 'vitest';

interface PersonaSuggestionResult {
  suggestion: string;
  type: 'answer' | 'question' | 'objection' | 'info';
  personaId: string;
  personaName: string;
  personaColor: string;
}

/**
 * Dedup algorithm extracted from service-worker.ts processTranscriptHydra().
 * Groups suggestions by exact (trimmed) text match and merges persona badges.
 */
function dedupSuggestions(
  suggestions: PersonaSuggestionResult[]
): Array<{
  text: string;
  type: PersonaSuggestionResult['type'];
  personas: Array<{ id: string; name: string; color: string }>;
}> {
  const grouped = new Map<string, PersonaSuggestionResult[]>();

  for (const s of suggestions) {
    const key = s.suggestion.trim(); // Case-sensitive, trimmed
    const group = grouped.get(key);
    if (group) {
      group.push(s);
    } else {
      grouped.set(key, [s]);
    }
  }

  const result: Array<{
    text: string;
    type: PersonaSuggestionResult['type'];
    personas: Array<{ id: string; name: string; color: string }>;
  }> = [];

  for (const [text, group] of grouped) {
    const first = group[0]!;
    const personas = group.map((s) => ({
      id: s.personaId,
      name: s.personaName,
      color: s.personaColor,
    }));
    result.push({
      text,
      type: first.type,
      personas,
    });
  }

  return result;
}

describe('Hydra dedup logic', () => {
  it('merges identical suggestions from two personas', () => {
    const suggestions: PersonaSuggestionResult[] = [
      {
        suggestion: 'Try our enterprise plan',
        type: 'answer',
        personaId: 'p1',
        personaName: 'Sales Pro',
        personaColor: '#3b82f6',
      },
      {
        suggestion: 'Try our enterprise plan',
        type: 'answer',
        personaId: 'p2',
        personaName: 'Tech Advisor',
        personaColor: '#22c55e',
      },
    ];

    const result = dedupSuggestions(suggestions);

    expect(result).toHaveLength(1);
    expect(result[0]!.text).toBe('Try our enterprise plan');
    expect(result[0]!.personas).toHaveLength(2);
    expect(result[0]!.personas.map((p) => p.name)).toEqual(['Sales Pro', 'Tech Advisor']);
  });

  it('keeps different suggestions separate', () => {
    const suggestions: PersonaSuggestionResult[] = [
      {
        suggestion: 'Focus on cost savings',
        type: 'answer',
        personaId: 'p1',
        personaName: 'Sales Pro',
        personaColor: '#3b82f6',
      },
      {
        suggestion: 'Emphasize security features',
        type: 'answer',
        personaId: 'p2',
        personaName: 'Tech Advisor',
        personaColor: '#22c55e',
      },
    ];

    const result = dedupSuggestions(suggestions);

    expect(result).toHaveLength(2);
    expect(result[0]!.personas).toHaveLength(1);
    expect(result[1]!.personas).toHaveLength(1);
  });

  it('trims whitespace for matching', () => {
    const suggestions: PersonaSuggestionResult[] = [
      {
        suggestion: 'Great question!',
        type: 'info',
        personaId: 'p1',
        personaName: 'A',
        personaColor: '#aaa',
      },
      {
        suggestion: '  Great question!  ',
        type: 'info',
        personaId: 'p2',
        personaName: 'B',
        personaColor: '#bbb',
      },
    ];

    const result = dedupSuggestions(suggestions);

    expect(result).toHaveLength(1);
    expect(result[0]!.personas).toHaveLength(2);
  });

  it('is case-sensitive (does NOT merge different case)', () => {
    const suggestions: PersonaSuggestionResult[] = [
      {
        suggestion: 'Hello',
        type: 'info',
        personaId: 'p1',
        personaName: 'A',
        personaColor: '#aaa',
      },
      {
        suggestion: 'hello',
        type: 'info',
        personaId: 'p2',
        personaName: 'B',
        personaColor: '#bbb',
      },
    ];

    const result = dedupSuggestions(suggestions);

    expect(result).toHaveLength(2);
  });

  it('handles single persona (passthrough, no dedup needed)', () => {
    const suggestions: PersonaSuggestionResult[] = [
      {
        suggestion: 'Only one persona here',
        type: 'answer',
        personaId: 'solo',
        personaName: 'Solo Persona',
        personaColor: '#ff0000',
      },
    ];

    const result = dedupSuggestions(suggestions);

    expect(result).toHaveLength(1);
    expect(result[0]!.personas).toHaveLength(1);
    expect(result[0]!.personas[0]!.name).toBe('Solo Persona');
  });

  it('handles empty input', () => {
    const result = dedupSuggestions([]);
    expect(result).toEqual([]);
  });

  it('merges three personas with identical text', () => {
    const suggestions: PersonaSuggestionResult[] = [
      { suggestion: 'Same idea', type: 'answer', personaId: 'p1', personaName: 'A', personaColor: '#a' },
      { suggestion: 'Same idea', type: 'answer', personaId: 'p2', personaName: 'B', personaColor: '#b' },
      { suggestion: 'Same idea', type: 'answer', personaId: 'p3', personaName: 'C', personaColor: '#c' },
    ];

    const result = dedupSuggestions(suggestions);

    expect(result).toHaveLength(1);
    expect(result[0]!.personas).toHaveLength(3);
  });

  it('preserves suggestion type from first match', () => {
    const suggestions: PersonaSuggestionResult[] = [
      { suggestion: 'Matched', type: 'objection', personaId: 'p1', personaName: 'A', personaColor: '#a' },
      { suggestion: 'Matched', type: 'answer', personaId: 'p2', personaName: 'B', personaColor: '#b' },
    ];

    const result = dedupSuggestions(suggestions);

    expect(result[0]!.type).toBe('objection'); // First one wins
  });
});
