# Gemini Prompt Optimization

> Baseline provider. Wingman AI was built around Gemini 2.5 Flash. Current prompts are already optimized for this family. The tuning profile should be a **no-op**.

## Temperature

| Use Case | Recommended | Current | Action |
|---|---|---|---|
| Suggestions | 0.3-0.5 | 0.3 | No change (slight bump to 0.4 optional) |
| Summaries | 0.1-0.2 | 0.2 | No change |

**Future note:** Gemini 3 models require `temperature: 1.0` — anything lower causes looping and degraded reasoning. This does NOT apply to 2.5 Flash/Pro.

## Silence Enforcement

**Status: Works well.** The current `---` convention is effective with Gemini.

**Optimizations available (not required for v1):**
- Add 1-2 few-shot silence examples (Google recommends always including few-shot)
- Move silence rules to the top of the system prompt (Gemini weighs early instructions more heavily)
- Strengthen the model turn acknowledgment from "I'll provide suggestions when I have something valuable to add" to "I'll stay silent (---) unless I have something genuinely useful to add. Most of the time, I should stay silent."

## Prompt Structure

Gemini responds well to:
- Markdown headings for section separation
- Clear delimiters between instruction types (XML or markdown both work)
- KB context placed at the top (before behavioral rules)

**Current structure is good.** No changes needed.

## JSON Reliability

**Strong.** Gemini's native `responseMimeType: 'application/json'` handles this.

**Optimization available:** Add `responseSchema` for call summaries to get guaranteed schema compliance at the output level. This eliminates shape validation in code:

```typescript
responseMimeType: 'application/json',
responseSchema: {
  type: 'object',
  properties: {
    summary: { type: 'array', items: { type: 'string' } },
    actionItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          owner: { type: 'string', enum: ['you', 'them'] },
          text: { type: 'string' }
        },
        required: ['owner', 'text']
      }
    },
    keyMoments: { /* ... */ }
  },
  required: ['summary', 'actionItems', 'keyMoments']
}
```

## Key Optimization: Disable Thinking Mode

**This is the single biggest latency win available for Gemini.**

Gemini 2.5 Flash has thinking enabled by default. It adds internal reasoning tokens before the response — useful for complex problems, wasteful for quick coaching suggestions.

Add to `generationConfig`:
```typescript
thinkingConfig: { thinkingBudget: 0 }
```

For summaries, consider ENABLING thinking (`thinkingBudget: 1024`+) since latency doesn't matter and quality benefits from reasoning.

## Context Window

- **Gemini 2.5 Flash/Pro:** 1,048,576 input tokens, 65,536 output tokens
- Current usage is ~1-2% of capacity
- Could increase `maxHistoryTurns` from 20 to 50+ without concern
- Summary truncation (50 first + 400 last) is conservative — full transcript fits for most calls

## Tuning Profile (No-Op)

```typescript
{
  suggestionTemperature: 0.3,        // same as current default
  silenceReinforcement: '',          // no additional text
  conversationSilenceHint: null,     // keep hardcoded text as-is
  promptPrefix: null,
  promptSuffix: null,
  summaryPromptPrefix: null,
  summaryJsonHint: null,
  jsonHint: null,
}
```

Auto mode with Gemini active = zero changes to current behavior. This is intentional.

## Sources

- [Gemini Prompt Design Strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)
- [Gemini Thinking Configuration](https://ai.google.dev/gemini-api/docs/thinking)
- [Gemini Structured Output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini Models Reference](https://ai.google.dev/gemini-api/docs/models)
- [Gemini 2.5 Flash Latency Issues](https://discuss.ai.google.dev/t/increased-latency-in-the-gemini-2-5-flash-api/111714)
- [Content Generation Parameters](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/content-generation-parameters)
