# Qwen Prompt Optimization

> Available via Groq and OpenRouter. Qwen's unique feature is `/think` and `/no_think` mode switching. Its biggest quirk is inconsistent silence token output.

## Model Selection for Wingman

| Model | Context | Notes |
|---|---|---|
| Qwen 3 32B | 32K native (131K YaRN) | Strong reasoning, fast on Groq |
| Qwen 3 8B | 32K native (131K YaRN) | Faster but less reliable |
| Qwen 2.5 Turbo | 1M | Legacy, best JSON of the Qwen family |

**Recommendation:** Qwen 3 32B — strong reasoning with manageable size. Wingman's payloads are well under 32K tokens.

## Temperature

**Critical:** Never use `temperature: 0` with Qwen 3. It causes infinite loops and repetition.

| Use Case | Temperature | top_p | Notes |
|---|---|---|---|
| Suggestions (non-thinking) | 0.7 | 0.8 | Alibaba's recommendation for chat |
| Suggestions (thinking mode) | 0.6 | 0.95 | Alibaba's recommendation for reasoning |
| Summaries (JSON) | 0.2 | 0.8 | Low for structure adherence |

**Minimum safe temperature: 0.2** for any Qwen 3 task.

## The /think and /no_think System

Qwen 3's most distinctive feature. Two control levels:

**Hard switch (API-level):** `enable_thinking=True/False` — controls inference config. When `False`, soft switches are ignored.

**Soft switch (in-message):** Append `/think` or `/no_think` to any user message. Model follows the most recent instruction in multi-turn conversations.

### When to Use Each

| Scenario | Mode | Why |
|---|---|---|
| Live suggestions | `/no_think` | Latency is everything. Thinking adds 1-3s of reasoning tokens. |
| Call summary | `/think` | Latency doesn't matter. Better reasoning = better summary. |
| Simple silence decision | `/no_think` | Don't waste tokens deliberating "should I speak?" |
| Complex objection handling | Default (thinking) | Nuanced objections benefit from reasoning. |

### How It Works via OpenRouter

Append to user message content:
```typescript
text: `[${currentSpeaker}]: ${currentText}\n\nShould I provide a suggestion, or stay silent (---)? /no_think`
```

### The Tradeoff

Thinking mode adds ~100-500 extra reasoning tokens before the response. Cost is negligible, but it adds **1-3 seconds of latency** — which matters enormously in a live call.

**Bottom line: Default to `/no_think` for all live suggestions. Use `/think` only for post-call summaries.**

### Empty Think Blocks

When thinking is enabled but `/no_think` is used, the response includes `<think>\n\n</think>`. Strip before processing:
```typescript
responseText.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
```

## Silence Enforcement

**Difficulty: Moderate.** Qwen follows silence instructions but sometimes produces variations of `---` instead of the exact token.

### What Works

**1. Few-shot examples (explicit format):**
```
SILENCE RULE:
If you have nothing valuable to add, respond with ONLY the three characters: ---
Do NOT add any explanation. Do NOT say "I'll stay silent." Just output: ---

Examples:
- "Hey, how's it going?" → ---
- "Okay, got it, thanks." → ---
- "Let me pull up that document." → ---
```

**2. Broader silence detection in code** — Qwen may produce `- - -`, `---\n`, or "I'll stay silent":
```typescript
const trimmed = responseText.trim();
if (trimmed === '---' || trimmed === '-' || trimmed === '--' ||
    trimmed.startsWith('---') || trimmed.length < 4) {
  return null; // treat as silence
}
```

**3. `/no_think` for silence decisions** — prevents the model from "talking itself into" generating a suggestion during its reasoning phase.

## Prompt Structure

Qwen 3 has **no default system prompt** (unlike Qwen 2.5's "You are Qwen, created by Alibaba Cloud..."). The model fully adopts whatever role you assign.

**Recommended structure:**
```
# Role Definition (1-2 lines)
You are WINGMAN, a real-time AI sales coach on a live Google Meet call.

# Output Format (explicit, up front)
RESPOND with 1-3 bullet points OR exactly "---" for silence. Never output anything else.

# Rules (numbered, clear)
1. Max 3 bullets. Each bullet is one sentence.
2. If nothing valuable to add: output exactly ---
3. Never fabricate data.
4. Never repeat a suggestion already given.

# Knowledge Base Context
[KB CONTEXT]

# When to Speak vs Stay Silent
SPEAK: [conditions]
SILENT: [conditions]
```

**Key differences from Gemini prompting:**
- Qwen responds better to **numbered rules** than prose
- Put output format constraint **early** (Qwen pays more attention to the beginning)
- Qwen 3 tends to be verbose — repeat brevity constraints multiple times
- Avoid heavy emoji in system prompts (Qwen reproduces them inconsistently)

### Persona Re-Anchoring

Qwen occasionally "breaks character" after 10+ turns. Reinforce persona in the user message:
```typescript
text: `[CONTEXT: You are coaching as "${personaName}" persona]\n[${currentSpeaker}]: ${currentText}\n\nProvide a suggestion or output --- for silence. /no_think`
```

## JSON Reliability

### Thinking Mode + JSON Mode Don't Mix

Alibaba's docs explicitly state: **models in thinking mode do not currently support structured output.** If you use Qwen 3 with thinking enabled, you may get `<think>...</think>` blocks mixed into JSON.

**For summaries:** Either disable thinking OR strip think blocks before JSON parsing.

### What Works

- `response_format: { type: 'json_object' }` works via OpenRouter for Qwen 2.5 and Qwen 3
- The prompt **must** contain the word "JSON" (case-insensitive) or the API errors
- Qwen 2.5 was specifically optimized for JSON and is one of the best open models for it
- `response_format: { type: 'json_schema', strict: true }` available on OpenRouter for strict schema enforcement
- Qwen sometimes wraps JSON in markdown fences — `stripMarkdownCodeBlock()` handles this

### Prompt Addition for JSON

```
Respond ONLY with valid raw JSON. No markdown, no explanation, no code fences.
```

## Known Quirks

| Quirk | Impact | Mitigation |
|---|---|---|
| Greedy decoding kills performance | `temperature: 0` causes infinite loops | Minimum temperature: 0.2 |
| Inconsistent silence token | May produce `- - -`, `--`, or explanations | Broaden silence detection in code |
| Verbose by default | Suggestions longer than needed | Repeat "MAX 2 SENTENCES" multiple times |
| Character breaks in long conversations | Drifts from persona after 10+ turns | Re-anchor persona in user messages |
| Empty `<think>` blocks with `/no_think` | Response includes `<think>\n\n</think>` | Strip before processing |
| `presence_penalty` causes language mixing | Multilingual leakage in output | Avoid `presence_penalty`; use temperature + top_p |
| Thinking + JSON don't mix | `<think>` blocks break JSON output | Disable thinking for JSON tasks |
| Excessive alignment/safety | May refuse competitive intelligence | Less of an issue with 32B vs smaller |

## Context Window

| Model | Native | Extended (YaRN) | Max Output |
|---|---|---|---|
| Qwen 3 32B | 32,768 | 131,072 | 40,960 |
| Qwen 3 8B | 32,768 | 131,072 | 32,768 |
| Qwen 2.5 Turbo | 1,000,000 | — | 8,192 |

Wingman's typical payload is well under 10K tokens — no concern for any model.

## Tuning Profile

```typescript
{
  suggestionTemperature: 0.6,
  silenceReinforcement: 'You are allowed to stay silent. If you have nothing useful to add, respond with exactly: ---\nDo not explain why you are staying silent. Just output --- and nothing else.',
  conversationSilenceHint: 'Should I provide a suggestion, or stay silent (---)? /no_think',
  promptPrefix: '/no_think\n',
  promptSuffix: null,
  summaryPromptPrefix: '/think\n',
  summaryJsonHint: 'Respond only in raw JSON. No extra text, no markdown fencing, no explanations.',
  jsonHint: 'Respond only in raw JSON. No extra text or explanations.',
}
```

**Note:** The `/no_think` in `promptPrefix` is appended to the system prompt. The `/no_think` in `conversationSilenceHint` goes in the user message. Both are needed — the model follows the most recent instruction.

## Sources

- [Qwen3-32B Model Card (Hugging Face)](https://huggingface.co/Qwen/Qwen3-32B)
- [Qwen3: Think Deeper, Act Faster (Official Blog)](https://qwenlm.github.io/blog/qwen3/)
- [Qwen3 Chat Template Deep Dive](https://huggingface.co/blog/qwen-3-chat-template-deep-dive)
- [Qwen3 Prompt Engineering for Structured Output](https://qwen3lm.com/qwen3-prompt-engineering-structured-output/)
- [Qwen3 32B on OpenRouter](https://openrouter.ai/qwen/qwen3-32b)
- [Alibaba Cloud JSON Mode Docs](https://www.alibabacloud.com/help/en/model-studio/json-mode)
- [Qwen Context Window Specifications](https://www.datastudios.org/post/qwen-context-window-token-limits-memory-policy-and-2025-rules)
