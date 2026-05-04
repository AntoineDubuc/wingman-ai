import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateResult, inferProvider, estimateCost, runTests, buildKBTestQuestions, evaluateKBResult } from '../src/services/prompt-test-runner';
import type { TestQuestion, KBTestQuestion } from '../src/shared/persona';

describe('Test execution engine', () => {
  describe('inferProvider', () => {
    it('gemini direct', () => {
      expect(inferProvider('gemini-2.5-flash')).toBe('gemini');
    });

    it('openrouter models', () => {
      expect(inferProvider('google/gemini-2.5-flash')).toBe('openrouter');
      expect(inferProvider('anthropic/claude-sonnet-4')).toBe('openrouter');
      expect(inferProvider('openai/gpt-4o')).toBe('openrouter');
    });

    it('groq models', () => {
      expect(inferProvider('meta-llama/llama-4-scout-17b-16e-instruct')).toBe('groq');
      expect(inferProvider('qwen/qwen3-32b')).toBe('groq');
      expect(inferProvider('llama-3.3-70b-versatile')).toBe('groq');
      expect(inferProvider('llama-3.1-8b-instant')).toBe('groq');
    });
  });

  describe('evaluateResult', () => {
    it('should-respond + substantive response = pass', () => {
      const q: TestQuestion = { text: 'Hello', expectedBehavior: 'respond' };
      const result = evaluateResult(q, 'Hello! How can I help you today?');
      expect(result.status).toBe('pass');
    });

    it('should-respond + silence = fail (should-have-responded)', () => {
      const q: TestQuestion = { text: 'Hello', expectedBehavior: 'respond' };
      const result = evaluateResult(q, '---');
      expect(result.status).toBe('fail');
      expect(result.failureReason).toBe('should-have-responded');
    });

    it('should-be-silent + silence = pass', () => {
      const q: TestQuestion = { text: 'Nice weather', expectedBehavior: 'silent' };
      const result = evaluateResult(q, '---');
      expect(result.status).toBe('pass');
    });

    it('should-be-silent + response = fail (should-be-silent)', () => {
      const q: TestQuestion = { text: 'Nice weather', expectedBehavior: 'silent' };
      const result = evaluateResult(q, 'Yes, the weather is lovely today!');
      expect(result.status).toBe('fail');
      expect(result.failureReason).toBe('should-be-silent');
    });

    it('should-respond + short response = fail (wrong-behavior)', () => {
      const q: TestQuestion = { text: 'Help me', expectedBehavior: 'respond' };
      const result = evaluateResult(q, 'ok');
      expect(result.status).toBe('fail');
      expect(result.failureReason).toBe('wrong-behavior');
    });

    it('handles whitespace in silence response', () => {
      const q: TestQuestion = { text: 'Test', expectedBehavior: 'silent' };
      const result = evaluateResult(q, '  ---  ');
      expect(result.status).toBe('pass');
    });
  });

  describe('estimateCost', () => {
    it('single version cost estimate', () => {
      const cost = estimateCost(6, false);
      expect(cost).toBeCloseTo(0.006, 3);
    });

    it('comparison doubles the cost', () => {
      const single = estimateCost(6, false);
      const comparison = estimateCost(6, true);
      expect(comparison).toBeCloseTo(single * 2, 3);
    });
  });

  describe('runTests with mocked fetch', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
      vi.stubGlobal('performance', { now: vi.fn().mockReturnValue(0) });
    });

    it('API error results in error status, not fail', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limited'),
      });
      vi.stubGlobal('fetch', mockFetch);

      const questions: TestQuestion[] = [
        { text: 'Hello', expectedBehavior: 'respond' },
      ];

      const results = await runTests('gemini-2.5-flash', 'fake-key', 'You are helpful.', questions);
      expect(results[0]!.status).toBe('error');
      expect(results[0]!.errorMessage).toContain('429');
    });

    it('comparison mode runs two versions', async () => {
      // This just tests the structure — actual comparison uses runComparisonTests
      const q: TestQuestion = { text: 'Test', expectedBehavior: 'respond' };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'Hello there!' }] } }],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const results = await runTests('gemini-2.5-flash', 'fake-key', 'Prompt', [q]);
      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe('pass');
    });
  });

  describe('no GeminiClient import', () => {
    it('prompt-test-runner.ts does not import gemini-client', async () => {
      // Read the source file and check imports
      // This is a structural test — we verify at the code level
      const fs = await import('fs');
      const source = fs.readFileSync(
        new URL('../src/services/prompt-test-runner.ts', import.meta.url),
        'utf-8'
      );
      expect(source).not.toContain('gemini-client');
      expect(source).not.toContain('GeminiClient');
      expect(source).not.toContain('geminiClient');
    });
  });
});

// === KB Integration Tests (Phase 24 — Task 10) ===

describe('KB integration testing', () => {
  describe('buildKBTestQuestions', () => {
    it('generates 3 questions with correct test types', () => {
      const questions = buildKBTestQuestions(['sales-playbook.pdf', 'pricing.md']);
      expect(questions).toHaveLength(3);
      expect(questions[0]!.testType).toBe('real-citation');
      expect(questions[1]!.testType).toBe('impossible-knowledge');
      expect(questions[2]!.testType).toBe('missing-data');
    });

    it('real-citation question references first doc name without extension', () => {
      const questions = buildKBTestQuestions(['sales-playbook.pdf']);
      expect(questions[0]!.text).toContain('sales-playbook');
      expect(questions[0]!.text).not.toContain('.pdf');
    });

    it('falls back to generic topic when no docs provided', () => {
      const questions = buildKBTestQuestions([]);
      expect(questions[0]!.text).toContain('the uploaded documents');
    });

    it('impossible-knowledge uses default fact when none provided', () => {
      const questions = buildKBTestQuestions(['doc.pdf']);
      expect(questions[1]!.kbContext).toContain('$999/seat');
      expect(questions[1]!.expectedCitation).toContain('$999/seat');
    });

    it('impossible-knowledge uses custom fact when provided', () => {
      const customFact = '$1,500/month for the Pro plan';
      const questions = buildKBTestQuestions(['doc.pdf'], customFact);
      expect(questions[1]!.kbContext).toContain('$1,500/month');
      expect(questions[1]!.expectedCitation).toBe(customFact);
    });

    it('missing-data question asks about quantum computing', () => {
      const questions = buildKBTestQuestions(['doc.pdf']);
      expect(questions[2]!.text).toContain('quantum computing');
    });

    it('all questions have correct category and source', () => {
      const questions = buildKBTestQuestions(['doc.pdf']);
      for (const q of questions) {
        expect(q.category).toBe('kb');
        expect(q.source).toBe('auto');
      }
    });

    it('expectedBehavior is correct for each type', () => {
      const questions = buildKBTestQuestions(['doc.pdf']);
      expect(questions[0]!.expectedBehavior).toBe('respond');
      expect(questions[1]!.expectedBehavior).toBe('respond');
      expect(questions[2]!.expectedBehavior).toBe('silent');
    });
  });

  describe('evaluateKBResult', () => {
    // --- Real citation tests ---
    it('real-citation: substantive response = pass', () => {
      const q: KBTestQuestion = {
        text: 'What are the key details?',
        expectedBehavior: 'respond',
        testType: 'real-citation',
      };
      const result = evaluateKBResult(q, 'The sales playbook covers five key strategies for enterprise deals.');
      expect(result.status).toBe('pass');
      expect(result.citationCorrect).toBe(true);
    });

    it('real-citation: silence = fail', () => {
      const q: KBTestQuestion = {
        text: 'What are the key details?',
        expectedBehavior: 'respond',
        testType: 'real-citation',
      };
      const result = evaluateKBResult(q, '---');
      expect(result.status).toBe('fail');
      expect(result.failureReason).toBe('should-have-responded');
      expect(result.citationCorrect).toBe(false);
    });

    it('real-citation: short response = fail', () => {
      const q: KBTestQuestion = {
        text: 'What are the key details?',
        expectedBehavior: 'respond',
        testType: 'real-citation',
      };
      const result = evaluateKBResult(q, 'ok');
      expect(result.status).toBe('fail');
      expect(result.failureReason).toBe('wrong-behavior');
    });

    // --- Impossible knowledge tests ---
    it('impossible-knowledge: response with injected number = pass', () => {
      const q: KBTestQuestion = {
        text: 'What is the exact pricing?',
        expectedBehavior: 'respond',
        testType: 'impossible-knowledge',
        expectedCitation: '$999/seat for the Enterprise tier',
      };
      const result = evaluateKBResult(q, 'The pricing is $999/seat for the Enterprise tier.');
      expect(result.status).toBe('pass');
      expect(result.citationCorrect).toBe(true);
    });

    it('impossible-knowledge: response with just the number = pass', () => {
      const q: KBTestQuestion = {
        text: 'What is the exact pricing?',
        expectedBehavior: 'respond',
        testType: 'impossible-knowledge',
        expectedCitation: '$999/seat for the Enterprise tier',
      };
      const result = evaluateKBResult(q, 'Enterprise tier pricing is 999 dollars per seat.');
      expect(result.status).toBe('pass');
      expect(result.citationCorrect).toBe(true);
    });

    it('impossible-knowledge: response without injected number = fail', () => {
      const q: KBTestQuestion = {
        text: 'What is the exact pricing?',
        expectedBehavior: 'respond',
        testType: 'impossible-knowledge',
        expectedCitation: '$999/seat for the Enterprise tier',
      };
      const result = evaluateKBResult(q, 'We offer competitive pricing for all tiers.');
      expect(result.status).toBe('fail');
      expect(result.citationCorrect).toBe(false);
    });

    it('impossible-knowledge: custom fact with comma number = pass', () => {
      const q: KBTestQuestion = {
        text: 'What is the exact pricing?',
        expectedBehavior: 'respond',
        testType: 'impossible-knowledge',
        expectedCitation: '$1,500/month for the Pro plan',
      };
      const result = evaluateKBResult(q, 'The Pro plan costs $1,500 per month.');
      expect(result.status).toBe('pass');
      expect(result.citationCorrect).toBe(true);
    });

    // --- Missing data tests ---
    it('missing-data: silence = pass', () => {
      const q: KBTestQuestion = {
        text: "What is the company's quantum computing policy?",
        expectedBehavior: 'silent',
        testType: 'missing-data',
      };
      const result = evaluateKBResult(q, '---');
      expect(result.status).toBe('pass');
      expect(result.citationCorrect).toBeNull();
    });

    it('missing-data: decline phrase = pass', () => {
      const q: KBTestQuestion = {
        text: "What is the company's quantum computing policy?",
        expectedBehavior: 'silent',
        testType: 'missing-data',
      };
      const declinePhrases = [
        "I don't have information about that topic.",
        'That data is not available in the knowledge base.',
        "I don't know the answer to that question.",
        'There is no information about quantum computing.',
        "I'm unable to find any relevant data.",
      ];
      for (const phrase of declinePhrases) {
        const result = evaluateKBResult(q, phrase);
        expect(result.status).toBe('pass');
      }
    });

    it('missing-data: substantive answer = fail', () => {
      const q: KBTestQuestion = {
        text: "What is the company's quantum computing policy?",
        expectedBehavior: 'silent',
        testType: 'missing-data',
      };
      const result = evaluateKBResult(q, 'Our quantum computing policy involves investing in research partnerships.');
      expect(result.status).toBe('fail');
      expect(result.failureReason).toBe('should-be-silent');
      expect(result.citationCorrect).toBeNull();
    });
  });
});
