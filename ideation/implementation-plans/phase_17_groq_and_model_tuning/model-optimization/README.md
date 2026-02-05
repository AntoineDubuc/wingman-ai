# Model Prompt Optimization — Reference Guide

Research on how to optimize Wingman AI's prompts for each model family. These findings feed directly into the **Model-Aware Prompt Tuning** feature (Phase 17, Tasks 10-11).

## Quick Comparison

| Aspect | Gemini | Claude | GPT-4o | Llama | Qwen |
|---|---|---|---|---|---|
| Suggestion temp | 0.3-0.5 | 0.3-0.5 | 0.3 | 0.3-0.5 | 0.7 |
| Summary temp | 0.2 | 0.2 | 0 | 0.1 | 0.2 |
| Silence compliance | Good | Poor (over-helpful) | Poor (fights silence) | Moderate (needs few-shot) | Moderate (inconsistent token) |
| Best prompt structure | Markdown headings | XML tags | Markdown `#` headings (4.1) | Uppercase headers + few-shot | Numbered rules |
| JSON reliability | High (native mode) | High (prefill `{`) | High (structured outputs) | Medium (markdown fencing) | Medium (thinking mode conflicts) |
| Special flags | `thinkingBudget: 0` | Prefill technique | Structured Outputs | — | `/no_think` / `/think` |
| Context window | 1M tokens | 200K tokens | 128K (4o) / 1M (4.1) | 128K tokens | 32K native (Qwen3-32B) |

## Key Insight: Silence Is the Hardest Problem

Every model family struggles with the "stay silent" (`---`) instruction to varying degrees. The core tension: models are RLHF-trained to be helpful, and silence feels like not helping.

**What works across all families:**
- Few-shot silence examples in the system prompt (biggest single lever)
- Framing silence as the DEFAULT, not the exception
- Explicit ratio guidance ("output --- at least 70% of the time")
- Role framing ("elite coaches speak rarely")

**What doesn't work:**
- Negative-only instructions ("don't respond to small talk")
- Relying on temperature alone
- Vague instructions ("only respond when necessary")

## Per-Model Files

- [gemini.md](./gemini.md) — Google Gemini 2.5 Flash/Pro (baseline provider)
- [claude.md](./claude.md) — Anthropic Claude (via OpenRouter)
- [gpt.md](./gpt.md) — OpenAI GPT-4o / GPT-4.1 (via OpenRouter)
- [llama.md](./llama.md) — Meta Llama 3.3 70B / Llama 4 Scout (via Groq + OpenRouter)
- [qwen.md](./qwen.md) — Alibaba Qwen 3 32B (via Groq + OpenRouter)

## How This Maps to Code

The tuning profiles in `src/shared/model-tuning.ts` (Task 10) encode these findings as static config:

```
ModelFamily → ModelTuningProfile
  ├── suggestionTemperature
  ├── silenceReinforcement (system prompt addition)
  ├── conversationSilenceHint (conversation turn injection)
  ├── promptPrefix / promptSuffix
  ├── summaryPromptPrefix
  ├── summaryJsonHint
  └── jsonHint
```

The tuning engine (Task 11) applies these profiles at runtime in Auto mode, or as a one-time rewrite in Optimize Once mode.
