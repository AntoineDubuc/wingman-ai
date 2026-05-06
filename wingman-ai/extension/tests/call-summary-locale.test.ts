/**
 * Tests for F2-T4: CallSummary Language Injection
 *
 * Verifies that buildSummaryPrompt() appends the correct language instruction
 * for non-English locales, and is a no-op for English.
 */

import { describe, it, expect } from 'vitest';
import { buildSummaryPrompt } from '../src/services/call-summary';
import type { CollectedTranscript } from '../src/services/transcript-collector';
import type { SummaryMetadata } from '../src/services/call-summary';

const mockTranscripts: CollectedTranscript[] = [
  {
    speaker: 'You',
    text: 'Hello, can you hear me?',
    timestamp: '00:00',
    speaker_id: 1,
    speaker_role: 'self',
    is_self: true,
  },
  {
    speaker: 'Participant',
    text: 'Yes, loud and clear.',
    timestamp: '00:05',
    speaker_id: 0,
    speaker_role: 'participant',
    is_self: false,
  },
];

const mockMetadata: SummaryMetadata = {
  generatedAt: '2026-05-03T00:00:00Z',
  durationMinutes: 5,
  speakerCount: 2,
  transcriptCount: 2,
};

describe('buildSummaryPrompt locale injection (F2-T4)', () => {
  it('includes language instruction for Romanian locale', () => {
    const prompt = buildSummaryPrompt(mockTranscripts, mockMetadata, { includeKeyMoments: true }, 'ro');
    expect(prompt).toContain('Respond in Romanian only.');
  });

  it('does not add language instruction for English locale', () => {
    const prompt = buildSummaryPrompt(mockTranscripts, mockMetadata, { includeKeyMoments: true }, 'en');
    expect(prompt).not.toContain('Respond in');
  });

  it('defaults to English (no-op) when locale omitted', () => {
    const prompt = buildSummaryPrompt(mockTranscripts, mockMetadata, { includeKeyMoments: true });
    expect(prompt).not.toContain('Respond in');
  });

  it('French locale adds correct instruction', () => {
    const prompt = buildSummaryPrompt(mockTranscripts, mockMetadata, { includeKeyMoments: true }, 'fr');
    expect(prompt).toContain('Respond in French only.');
  });

  it('prompt still contains base content when non-English locale used', () => {
    const prompt = buildSummaryPrompt(mockTranscripts, mockMetadata, { includeKeyMoments: true }, 'ru');
    expect(prompt).toContain('You are analyzing a sales call transcript');
  });
});
