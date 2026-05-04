import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Must import after mocking timers for Deepgram cost calculations
import { costTracker } from '../src/services/cost-tracker';

describe('CostTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-05T10:00:00Z'));
    // Suppress staleness check console.warn
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    costTracker.reset();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Session lifecycle', () => {
    it('isActive is false before startSession', () => {
      expect(costTracker.isActive).toBe(false);
    });

    it('isActive is true after startSession', () => {
      costTracker.startSession('gemini', 'gemini-2.5-flash');
      expect(costTracker.isActive).toBe(true);
    });

    it('isActive is false after endSession', () => {
      costTracker.startSession('gemini', 'gemini-2.5-flash');
      costTracker.endSession();
      expect(costTracker.isActive).toBe(false);
    });

    it('isActive is false after reset', () => {
      costTracker.startSession('gemini', 'gemini-2.5-flash');
      costTracker.reset();
      expect(costTracker.isActive).toBe(false);
    });
  });

  describe('getCostSnapshot', () => {
    it('returns null when no session', () => {
      expect(costTracker.getCostSnapshot()).toBeNull();
    });

    it('returns zero costs at session start', () => {
      costTracker.startSession('gemini', 'gemini-2.5-flash');
      const snap = costTracker.getCostSnapshot()!;
      expect(snap.llmCost).toBe(0);
      expect(snap.totalInputTokens).toBe(0);
      expect(snap.totalOutputTokens).toBe(0);
      expect(snap.suggestionCount).toBe(0);
      // Deepgram cost is ~0 at time 0
      expect(snap.deepgramCost).toBeCloseTo(0, 5);
    });

    it('computes Deepgram cost from elapsed time', () => {
      costTracker.startSession('gemini', 'gemini-2.5-flash');
      // Advance 10 minutes
      vi.advanceTimersByTime(10 * 60_000);
      const snap = costTracker.getCostSnapshot()!;
      // 10 min × $0.0077/min = $0.077
      expect(snap.audioMinutes).toBeCloseTo(10, 1);
      expect(snap.deepgramCost).toBeCloseTo(0.077, 3);
    });

    it('includes provider metadata', () => {
      costTracker.startSession('groq', 'llama-3.1-8b-instant');
      const snap = costTracker.getCostSnapshot()!;
      expect(snap.provider).toBe('groq');
      expect(snap.providerLabel).toBe('Groq');
      expect(snap.isFreeTier).toBe(true);
    });

    it('OpenRouter is not free tier', () => {
      costTracker.startSession('openrouter', 'openai/gpt-4o');
      const snap = costTracker.getCostSnapshot()!;
      expect(snap.isFreeTier).toBe(false);
    });
  });

  describe('addLLMUsage', () => {
    it('accumulates token counts', () => {
      costTracker.startSession('gemini', 'gemini-2.5-flash');
      costTracker.addLLMUsage(100, 50);
      costTracker.addLLMUsage(200, 80);

      const snap = costTracker.getCostSnapshot()!;
      expect(snap.totalInputTokens).toBe(300);
      expect(snap.totalOutputTokens).toBe(130);
      expect(snap.suggestionCount).toBe(2);
    });

    it('computes LLM cost correctly', () => {
      costTracker.startSession('gemini', 'gemini-2.5-flash');
      // Gemini Flash: $0.15/M input, $0.60/M output
      costTracker.addLLMUsage(1_000_000, 100_000);

      const snap = costTracker.getCostSnapshot()!;
      // 1M × $0.15/M + 100K × $0.60/M = $0.15 + $0.06 = $0.21
      expect(snap.llmCost).toBeCloseTo(0.21, 4);
    });

    it('is a no-op when no session', () => {
      // Should not throw
      costTracker.addLLMUsage(100, 50);
      expect(costTracker.getCostSnapshot()).toBeNull();
    });
  });

  describe('getFinalCost', () => {
    it('returns null when no session', () => {
      expect(costTracker.getFinalCost()).toBeNull();
    });

    it('uses frozen end time for Deepgram cost', () => {
      costTracker.startSession('gemini', 'gemini-2.5-flash');
      vi.advanceTimersByTime(5 * 60_000); // 5 min
      costTracker.endSession();

      // Advance another 5 minutes — should NOT affect final cost
      vi.advanceTimersByTime(5 * 60_000);

      const final = costTracker.getFinalCost()!;
      expect(final.audioMinutes).toBeCloseTo(5, 1);
      // 5 min × $0.0077/min = $0.0385
      expect(final.deepgramCost).toBeCloseTo(0.0385, 3);
    });

    it('includes LLM cost in total', () => {
      costTracker.startSession('gemini', 'gemini-2.5-flash');
      costTracker.addLLMUsage(500_000, 50_000);
      vi.advanceTimersByTime(1 * 60_000);
      costTracker.endSession();

      const final = costTracker.getFinalCost()!;
      // LLM: 500K × $0.15/M + 50K × $0.60/M = $0.075 + $0.030 = $0.105
      // Deepgram: 1 min × $0.0077 = $0.0077
      expect(final.llmCost).toBeCloseTo(0.105, 4);
      expect(final.totalCost).toBeCloseTo(0.105 + 0.0077, 3);
    });
  });

  describe('Edge cases', () => {
    it('zero-duration session has near-zero cost', () => {
      costTracker.startSession('gemini', 'gemini-2.5-flash');
      costTracker.endSession();

      const final = costTracker.getFinalCost()!;
      expect(final.deepgramCost).toBeCloseTo(0, 5);
      expect(final.llmCost).toBe(0);
      expect(final.totalCost).toBeCloseTo(0, 5);
    });

    it('session with no LLM calls only has Deepgram cost', () => {
      costTracker.startSession('gemini', 'gemini-2.5-flash');
      vi.advanceTimersByTime(30 * 60_000); // 30 min
      costTracker.endSession();

      const final = costTracker.getFinalCost()!;
      expect(final.llmCost).toBe(0);
      expect(final.suggestionCount).toBe(0);
      expect(final.deepgramCost).toBeCloseTo(0.231, 3);
      expect(final.totalCost).toBeCloseTo(0.231, 3);
    });

    it('unknown model uses fallback pricing', () => {
      costTracker.startSession('openrouter', 'some/unknown-model');
      costTracker.addLLMUsage(1_000_000, 1_000_000);

      const snap = costTracker.getCostSnapshot()!;
      // Fallback = Gemini Flash: 1M × $0.15/M + 1M × $0.60/M = $0.75
      expect(snap.llmCost).toBeCloseTo(0.75, 4);
    });
  });
});
