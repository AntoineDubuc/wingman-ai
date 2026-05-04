import { describe, it, expect } from 'vitest';
import { adaptPromptForModel } from '../src/services/prompt-adapter';
import { MODEL_TUNING_PROFILES } from '../src/shared/model-tuning';

// A realistic ~1500 char sample prompt (shorter to keep test manageable)
const SAMPLE_PROMPT = `# Sales Assistant -- System Prompt

## Your Role

You are a real-time sales coach helping a salesperson during a live Google Meet call. You observe the conversation and provide short, actionable suggestions.

## Core Focus

- Cloud infrastructure pricing and positioning
- Competitive differentiation against AWS and Azure
- Handling pricing objections

## Response Rules

- Keep suggestions to 1-3 sentences maximum
- Stay silent when the conversation is flowing naturally
- Only suggest when there's an opportunity to close or overcome an objection
- Never fabricate pricing or feature data

## Knowledge Base Instructions

When you have access to KB documents, cite specific data points. Always reference the source document name.

## Example Formats

**For pricing objections:**
> Reframe to value: "Our platform saves an average of 40% on cloud spend..."

**For competitive questions:**
> Differentiate on: "Unlike AWS, we offer unified billing across all services..."`;

describe('Prompt adapter', () => {
  it('Claude uses XML tags', () => {
    const result = adaptPromptForModel(SAMPLE_PROMPT, 'anthropic/claude-sonnet-4');
    expect(result.prompt).toContain('<role>');
    expect(result.prompt).toContain('</role>');
    expect(result.prompt).toContain('<response-rules>');
    expect(result.changesSummary).toBeTruthy();
  });

  it('Gemini uses markdown bullets', () => {
    const result = adaptPromptForModel(SAMPLE_PROMPT, 'gemini-2.5-flash');
    expect(result.prompt).toContain('-');
    expect(result.prompt).not.toContain('<role>');
    expect(result.prompt).not.toContain('<response-rules>');
  });

  it('Llama uses numbered lists', () => {
    const result = adaptPromptForModel(SAMPLE_PROMPT, 'meta-llama/llama-3.3-70b-instruct');
    expect(result.prompt).toMatch(/\d+\.\s/);
    expect(result.prompt).toContain('RESPONSE LENGTH');
  });

  it('Qwen uses structured headers', () => {
    const result = adaptPromptForModel(SAMPLE_PROMPT, 'qwen/qwen3-32b');
    expect(result.prompt).toContain('===');
  });

  it('GPT uses bookend rules', () => {
    const result = adaptPromptForModel(SAMPLE_PROMPT, 'openai/gpt-4o');
    // Critical rules should appear at start AND end
    expect(result.prompt).toContain('CRITICAL RULES');
    expect(result.prompt).toContain('REMINDER');
  });

  it('does NOT contain runtime tuning strings', () => {
    const families = [
      'gemini-2.5-flash',
      'anthropic/claude-sonnet-4',
      'openai/gpt-4o',
      'meta-llama/llama-3.3-70b-instruct',
      'qwen/qwen3-32b',
    ];

    // Collect all silenceReinforcement strings
    const runtimeStrings = Object.values(MODEL_TUNING_PROFILES)
      .map(p => p.silenceReinforcement)
      .filter(s => s.length > 0);

    // Also check for /no_think and JSON hints
    const forbiddenPatterns = [
      ...runtimeStrings,
      '/no_think',
      'Respond with valid JSON',
      'No markdown fencing',
    ];

    for (const modelId of families) {
      const result = adaptPromptForModel(SAMPLE_PROMPT, modelId);
      for (const pattern of forbiddenPatterns) {
        expect(result.prompt).not.toContain(pattern);
      }
    }
  });

  it('does not double-wrap existing XML tags', () => {
    const promptWithXml = `<role>You are a sales coach</role>

## Response Rules

- Stay silent when appropriate
- Keep responses brief`;

    const result = adaptPromptForModel(promptWithXml, 'anthropic/claude-sonnet-4');
    // Should not have <role><role>
    const roleCount = (result.prompt.match(/<role>/g) || []).length;
    expect(roleCount).toBe(1);
  });

  it('all 5 families produce different outputs', () => {
    const models = [
      'gemini-2.5-flash',
      'anthropic/claude-sonnet-4',
      'openai/gpt-4o',
      'meta-llama/llama-3.3-70b-instruct',
      'qwen/qwen3-32b',
    ];

    const outputs = models.map(m => adaptPromptForModel(SAMPLE_PROMPT, m).prompt);
    const unique = new Set(outputs);
    expect(unique.size).toBe(5);
  });

  it('outputs stay under 10K chars', () => {
    // Use the sample prompt (~1500 chars) — all outputs should be well under 10K
    const models = [
      'gemini-2.5-flash',
      'anthropic/claude-sonnet-4',
      'openai/gpt-4o',
      'meta-llama/llama-3.3-70b-instruct',
      'qwen/qwen3-32b',
    ];

    for (const modelId of models) {
      const result = adaptPromptForModel(SAMPLE_PROMPT, modelId);
      expect(result.prompt.length).toBeLessThan(10000);
    }
  });

  it('changesSummary is returned for all families', () => {
    const models = [
      'gemini-2.5-flash',
      'anthropic/claude-sonnet-4',
      'openai/gpt-4o',
      'meta-llama/llama-3.3-70b-instruct',
      'qwen/qwen3-32b',
    ];

    for (const modelId of models) {
      const result = adaptPromptForModel(SAMPLE_PROMPT, modelId);
      expect(result.changesSummary).toBeTruthy();
      expect(result.changesSummary.length).toBeGreaterThan(0);
    }
  });

  it('unknown model falls back to Gemini formatting', () => {
    const result = adaptPromptForModel(SAMPLE_PROMPT, 'unknown/model-xyz');
    // Should use Gemini format (markdown, no XML)
    expect(result.prompt).not.toContain('<role>');
    expect(result.prompt).toContain('##');
  });
});
