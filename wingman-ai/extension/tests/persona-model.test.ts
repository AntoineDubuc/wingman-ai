import { describe, it, expect } from 'vitest';
import type {
  Persona,
  PromptVersion,

  TestQuestion,
  TestResult,
  ComparisonTestResult,
} from '../src/shared/persona';

describe('Phase 24: Persona data model extensions', () => {
  it('accepts a full persona with all new fields', () => {
    const persona: Persona = {
      id: 'test-id',
      name: 'Test Persona',
      color: '#4A90D9',
      systemPrompt: 'You are a helpful assistant.',
      kbDocumentIds: ['doc-1'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: 0,
      modelPrompts: {
        'gemini-2.5-flash': 'Gemini-optimized prompt',
        'anthropic/claude-sonnet-4': 'Claude-optimized prompt with XML tags',
        'openai/gpt-4o': 'GPT-optimized prompt',
        'meta-llama/llama-4-scout-17b-16e-instruct': 'Llama-optimized prompt',
        'qwen/qwen3-32b': 'Qwen-optimized prompt',
      },
      promptVersions: [
        {
          version: 1,
          timestamp: Date.now(),
          summary: 'Initial prompt',
          source: 'manual',
          targetModel: 'gemini-2.5-flash',
          prompt: 'You are a helpful assistant.',
        },
      ],
    };

    expect(persona.modelPrompts).toBeDefined();
    expect(persona.promptVersions).toHaveLength(1);
    expect(persona.promptVersions![0]!.version).toBe(1);
  });

  it('accepts a legacy persona without new fields (backward compat)', () => {
    const legacy: Persona = {
      id: 'legacy-id',
      name: 'Legacy Persona',
      color: '#34A853',
      systemPrompt: 'You are an old persona.',
      kbDocumentIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: 1,
    };

    expect(legacy.modelPrompts).toBeUndefined();
    expect(legacy.promptVersions).toBeUndefined();
  });

  it('PromptVersion has all required fields', () => {
    const version: PromptVersion = {
      version: 3,
      timestamp: Date.now(),
      summary: 'Added silence rules and KB instructions',
      source: 'assistant',
      targetModel: 'anthropic/claude-sonnet-4',
      prompt: '<role>You are a sales assistant</role>',
    };

    expect(version.version).toBe(3);
    expect(version.source).toBe('assistant');
    expect(version.testResults).toBeUndefined();
  });

  it('PromptVersion with test results', () => {
    const version: PromptVersion = {
      version: 2,
      timestamp: Date.now(),
      summary: 'Improved silence behavior',
      source: 'assistant',
      targetModel: 'openai/gpt-4o',
      prompt: 'You are a sales assistant.',
      testResults: {
        passed: 4,
        total: 5,
        cost: 0.02,
        timestamp: Date.now(),
        modelId: 'openai/gpt-4o',
      },
    };

    expect(version.testResults?.passed).toBe(4);
    expect(version.testResults?.modelId).toBe('openai/gpt-4o');
  });

  it('modelPrompts keys accept all MODEL_FAMILY_MAP model IDs', () => {
    const modelIds = [
      'gemini-2.5-flash',
      'google/gemini-2.5-flash',
      'google/gemini-2.5-pro',
      'anthropic/claude-sonnet-4',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'meta-llama/llama-3.3-70b-instruct',
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'qwen/qwen3-32b',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
    ];

    const prompts: Record<string, string> = {};
    for (const id of modelIds) {
      prompts[id] = `Prompt for ${id}`;
    }

    const persona: Persona = {
      id: 'model-test',
      name: 'Model Test',
      color: '#F5A623',
      systemPrompt: 'default',
      kbDocumentIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      order: 0,
      modelPrompts: prompts,
    };

    expect(Object.keys(persona.modelPrompts!)).toHaveLength(11);
  });

  it('TestQuestion covers all expected fields', () => {
    const question: TestQuestion = {
      text: 'Can you give us a discount?',
      expectedBehavior: 'respond',
      category: 'custom',
      source: 'user',
      groupLabel: 'SHOULD NOT OFFER A DISCOUNT',
      behaviorHint: 'reframe to value',
      tags: ['new', 'must redirect to value'],
    };

    expect(question.expectedBehavior).toBe('respond');
    expect(question.tags).toHaveLength(2);
  });

  it('TestResult covers pass/fail/error states', () => {
    const pass: TestResult = {
      question: { text: 'Hello', expectedBehavior: 'respond' },
      response: 'Hi there!',
      status: 'pass',
      cost: 0.001,
      latencyMs: 250,
    };

    const fail: TestResult = {
      question: { text: 'Nice weather', expectedBehavior: 'silent' },
      response: 'Yes, the weather is nice!',
      status: 'fail',
      failureReason: 'should-be-silent',
      cost: 0.001,
      latencyMs: 300,
    };

    const error: TestResult = {
      question: { text: 'Hello', expectedBehavior: 'respond' },
      response: '',
      status: 'error',
      errorMessage: 'Rate limited (429)',
      cost: 0,
      latencyMs: 0,
    };

    expect(pass.status).toBe('pass');
    expect(fail.failureReason).toBe('should-be-silent');
    expect(error.errorMessage).toContain('429');
  });

  it('ComparisonTestResult has current and compared results', () => {
    const question: TestQuestion = { text: 'What is the price?', expectedBehavior: 'respond' };

    const comparison: ComparisonTestResult = {
      question,
      current: {
        question,
        response: 'The price is $99/month.',
        status: 'pass',
        cost: 0.001,
        latencyMs: 200,
      },
      compared: {
        question,
        response: '---',
        status: 'fail',
        failureReason: 'should-have-responded',
        cost: 0.001,
        latencyMs: 180,
      },
    };

    expect(comparison.current.status).toBe('pass');
    expect(comparison.compared.status).toBe('fail');
  });
});
