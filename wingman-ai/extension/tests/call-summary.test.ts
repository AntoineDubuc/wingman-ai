/**
 * Tests for call summary prompt building and tuning injection.
 */

import { describe, it, expect } from 'vitest';
import { buildSummaryPrompt, formatSummaryAsMarkdown } from '../src/services/call-summary';
import type { CollectedTranscript } from '../src/services/transcript-collector';
import type { SummaryMetadata, CallSummary } from '../src/services/call-summary';
import { MODEL_TUNING_PROFILES } from '../src/shared/model-tuning';

const mockTranscripts: CollectedTranscript[] = [
  { speaker: 'Speaker 1', text: 'Tell me about your product.', timestamp: new Date().toISOString(), speaker_id: 0, speaker_role: 'participant', is_self: false },
  { speaker: 'Speaker 2', text: 'We offer cloud security solutions.', timestamp: new Date().toISOString(), speaker_id: 1, speaker_role: 'self', is_self: true },
  { speaker: 'Speaker 1', text: 'What about pricing?', timestamp: new Date().toISOString(), speaker_id: 0, speaker_role: 'participant', is_self: false },
  { speaker: 'Speaker 2', text: 'Our starter plan is $99 per month.', timestamp: new Date().toISOString(), speaker_id: 1, speaker_role: 'self', is_self: true },
];

const mockMetadata: SummaryMetadata = {
  generatedAt: new Date().toISOString(),
  durationMinutes: 5,
  speakerCount: 2,
  transcriptCount: 4,
};

describe('buildSummaryPrompt', () => {
  it('returns a non-empty prompt string', () => {
    const prompt = buildSummaryPrompt(mockTranscripts, mockMetadata, { includeKeyMoments: true });
    expect(prompt).toBeTruthy();
    expect(typeof prompt).toBe('string');
  });

  it('includes transcript content', () => {
    const prompt = buildSummaryPrompt(mockTranscripts, mockMetadata, { includeKeyMoments: true });
    expect(prompt).toContain('Tell me about your product');
    expect(prompt).toContain('cloud security solutions');
  });

  it('includes JSON return instruction', () => {
    const prompt = buildSummaryPrompt(mockTranscripts, mockMetadata, { includeKeyMoments: true });
    expect(prompt).toContain('Return ONLY valid JSON');
  });

  it('includes metadata', () => {
    const prompt = buildSummaryPrompt(mockTranscripts, mockMetadata, { includeKeyMoments: true });
    expect(prompt).toContain('5');
    expect(prompt).toContain('Transcript entries: 4');
  });
});

describe('summary prompt tuning injection', () => {
  it('summaryPromptPrefix prepends to prompt', () => {
    const prompt = buildSummaryPrompt(mockTranscripts, mockMetadata, { includeKeyMoments: true });
    const qwenProfile = MODEL_TUNING_PROFILES.qwen;

    // Simulate auto tuning injection (same logic as gemini-client.ts)
    let tuned = prompt;
    if (qwenProfile.summaryPromptPrefix) {
      tuned = qwenProfile.summaryPromptPrefix + tuned;
    }

    expect(tuned.startsWith('/think\n')).toBe(true);
    expect(tuned).toContain('Return ONLY valid JSON'); // original content preserved
  });

  it('summaryJsonHint injects before "Return ONLY valid JSON"', () => {
    const prompt = buildSummaryPrompt(mockTranscripts, mockMetadata, { includeKeyMoments: true });
    const llamaProfile = MODEL_TUNING_PROFILES.llama;

    // Simulate injection (same logic as gemini-client.ts)
    let tuned = prompt;
    if (llamaProfile.summaryJsonHint) {
      const jsonLine = 'Return ONLY valid JSON.';
      const idx = tuned.lastIndexOf(jsonLine);
      expect(idx).toBeGreaterThan(0); // line exists
      tuned = tuned.slice(0, idx) + llamaProfile.summaryJsonHint + '\n\n' + tuned.slice(idx);
    }

    // Verify hint appears before the JSON line
    const hintIdx = tuned.indexOf('No markdown fencing');
    const jsonIdx = tuned.indexOf('Return ONLY valid JSON');
    expect(hintIdx).toBeGreaterThan(0);
    expect(hintIdx).toBeLessThan(jsonIdx);
  });

  it('Gemini profile injects nothing (no-op)', () => {
    const prompt = buildSummaryPrompt(mockTranscripts, mockMetadata, { includeKeyMoments: true });
    const geminiProfile = MODEL_TUNING_PROFILES.gemini;

    let tuned = prompt;
    if (geminiProfile.summaryPromptPrefix) {
      tuned = geminiProfile.summaryPromptPrefix + tuned;
    }
    if (geminiProfile.summaryJsonHint) {
      const jsonLine = 'Return ONLY valid JSON.';
      const idx = tuned.lastIndexOf(jsonLine);
      if (idx >= 0) {
        tuned = tuned.slice(0, idx) + geminiProfile.summaryJsonHint + '\n\n' + tuned.slice(idx);
      }
    }

    expect(tuned).toBe(prompt); // unchanged
  });
});

describe('formatSummaryAsMarkdown - Personas Used', () => {
  const baseSummary: CallSummary = {
    summary: ['Discussed product features.'],
    actionItems: [],
    keyMoments: [],
    metadata: {
      generatedAt: '2024-01-15T10:00:00Z',
      durationMinutes: 10,
      speakerCount: 2,
      transcriptCount: 20,
    },
  };

  it('omits Personas Used section when no personas', () => {
    const md = formatSummaryAsMarkdown(baseSummary);
    expect(md).not.toContain('### Personas Used');
  });

  it('includes Personas Used section for multi-persona session', () => {
    const summary: CallSummary = {
      ...baseSummary,
      metadata: {
        ...baseSummary.metadata,
        personas: [
          { id: 'p1', name: 'Sales Pro', color: '#3b82f6', suggestionCount: 4 },
          { id: 'p2', name: 'Tech Advisor', color: '#22c55e', suggestionCount: 2 },
        ],
      },
    };

    const md = formatSummaryAsMarkdown(summary);
    expect(md).toContain('### Personas Used');
    expect(md).toContain('- Sales Pro — 4 suggestions');
    expect(md).toContain('- Tech Advisor — 2 suggestions');
  });

  it('shows singular "suggestion" for count of 1', () => {
    const summary: CallSummary = {
      ...baseSummary,
      metadata: {
        ...baseSummary.metadata,
        personas: [
          { id: 'p1', name: 'Single Persona', color: '#f59e0b', suggestionCount: 1 },
        ],
      },
    };

    const md = formatSummaryAsMarkdown(summary);
    expect(md).toContain('- Single Persona — 1 suggestion');
  });

  it('includes Personas Used section even for single persona with suggestions', () => {
    const summary: CallSummary = {
      ...baseSummary,
      metadata: {
        ...baseSummary.metadata,
        personas: [
          { id: 'p1', name: 'Solo Expert', color: '#8b5cf6', suggestionCount: 5 },
        ],
      },
    };

    const md = formatSummaryAsMarkdown(summary);
    expect(md).toContain('### Personas Used');
    expect(md).toContain('Solo Expert — 5 suggestions');
  });

  it('omits section for single persona with 0 suggestions', () => {
    const summary: CallSummary = {
      ...baseSummary,
      metadata: {
        ...baseSummary.metadata,
        personas: [
          { id: 'p1', name: 'Silent Persona', color: '#ef4444', suggestionCount: 0 },
        ],
      },
    };

    const md = formatSummaryAsMarkdown(summary);
    expect(md).not.toContain('### Personas Used');
  });
});
