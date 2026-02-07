# Per-Model Prompting Research

> How each of Wingman's 11 supported LLMs handles system prompts, silence behavior, format control, and what makes their prompting requirements unique.

---

## Table of Contents

1. [Gemini 2.5 Flash (Direct)](#1-gemini-25-flash-direct)
2. [Gemini 2.5 Flash (OpenRouter)](#2-gemini-25-flash-openrouter)
3. [Gemini 2.5 Pro (OpenRouter)](#3-gemini-25-pro-openrouter)
4. [Claude Sonnet 4 (OpenRouter)](#4-claude-sonnet-4-openrouter)
5. [GPT-4o (OpenRouter)](#5-gpt-4o-openrouter)
6. [GPT-4o Mini (OpenRouter)](#6-gpt-4o-mini-openrouter)
7. [Llama 3.3 70B (OpenRouter)](#7-llama-33-70b-openrouter)
8. [Llama 4 Scout 17B (Groq)](#8-llama-4-scout-17b-groq)
9. [Qwen 3 32B (Groq)](#9-qwen-3-32b-groq)
10. [Llama 3.3 70B Versatile (Groq)](#10-llama-33-70b-versatile-groq)
11. [Llama 3.1 8B Instant (Groq)](#11-llama-31-8b-instant-groq)
12. [Cross-Model Comparison Matrix](#cross-model-comparison-matrix)
13. [Wingman-Specific Prompt Adaptation Rules](#wingman-specific-prompt-adaptation-rules)

---

## 1. Gemini 2.5 Flash (Direct)

**Model ID:** `gemini-2.5-flash` (via `generativelanguage.googleapis.com`)
**Context:** 1M tokens | **Max Output:** 65,536 tokens | **Default Temp:** 1.0

### System Prompt Format
- Uses `systemInstruction` field (separate from `contents`)
- Supports `response_mime_type: 'application/json'` for strict JSON output
- System instructions count toward total token budget
- Instructions at the **top** of system prompt carry more weight (unlike GPT)

### Silence Behavior (`---`)
- **Already working well** in Wingman — Gemini respects the `---` sentinel token reliably
- Few-shot priming in conversation history reinforces the pattern
- The `conversationSilenceHint` ("Should I provide a suggestion, or stay silent (---)?") works effectively

### Key Prompting Techniques
- **Concise over verbose**: Gemini performs better with tight, structured prompts
- **Bullet points > paragraphs**: List-based instructions are followed more reliably
- **`response_mime_type`**: When set to `application/json`, every response is correctly formatted — without it, Gemini often wraps JSON in backtick fences
- **`stop_sequences`**: Supported in `GenerateContentConfig` for controlling where generation halts
- **Few-shot for format control**: 1-2 examples showing desired output format significantly improve consistency

### Known Quirks
- **Thinking mode** (2.5 Flash/Pro): Can be toggled. Extended thinking adds latency but improves reasoning quality. For real-time suggestions, keep thinking mode OFF
- **Temperature at 1.0** is the default — too high for structured tasks. Use 0.3-0.5 for suggestions
- **Free-tier rate limits**: 15 RPM, hence the 15-second cooldown in Wingman

### Prompt Adaptation for Wingman
- Keep system prompt under 1,500 tokens for fast responses
- Place critical rules (silence behavior, output format) at the TOP
- Use structured markdown (headers, bullets) — Gemini parses these well
- No XML tags needed (unlike Claude)

---

## 2. Gemini 2.5 Flash (OpenRouter)

**Model ID:** `google/gemini-2.5-flash` (via OpenRouter)
**Context:** 1M tokens | **Max Output:** 65,536 tokens

### Differences from Direct API
- System prompt is sent via OpenAI-compatible `messages` format with `role: "system"` instead of `systemInstruction`
- `response_mime_type` is NOT available through OpenRouter — format control must be prompt-based only
- Cost is per-token via OpenRouter pricing (no free tier)
- No `stop_sequences` support through OpenRouter

### Prompt Adaptation
- Same prompt content as direct Gemini, but:
  - Must rely on prompt instructions alone for JSON format (add "Respond only in this exact format:")
  - Can be slightly more verbose since there's no free-tier rate limit concern
  - Add explicit format examples since `response_mime_type` isn't available

---

## 3. Gemini 2.5 Pro (OpenRouter)

**Model ID:** `google/gemini-2.5-pro` (via OpenRouter)
**Context:** 1M tokens | **Max Output:** 65,536 tokens

### Key Differences from Flash
- **Stronger reasoning** but **slower** — adds ~500ms+ latency per request
- Better at complex multi-step instructions
- More reliable at following nuanced persona instructions
- Higher cost per token

### Prompt Adaptation
- Can handle more complex system prompts (up to 2,500 tokens)
- Better at inferring intent from natural language instructions
- Still needs explicit silence (`---`) instructions — not significantly better than Flash at this
- **Temperature 0.3-0.5** recommended — Pro at high temperature generates overly creative responses

---

## 4. Claude Sonnet 4 (OpenRouter)

**Model ID:** `anthropic/claude-sonnet-4` (via OpenRouter)
**Context:** 200K tokens (1M with beta header) | **Max Output:** 64K tokens

### System Prompt Format
- Sent via `role: "system"` through OpenRouter's OpenAI-compatible API
- Claude excels with **XML tags** for structural organization:
  ```
  <rules>
  - When to respond
  - When to stay silent
  </rules>
  <format>
  Output template here
  </format>
  ```
- **Positive framing works better than negative**: Instead of "Do NOT explain," say "Respond only with the suggestion format"
- Tags and structural hierarchy determine instruction priority (not position)

### Silence Behavior (`---`)
- **More naturally compliant** with "stay silent" instructions than GPT or Gemini
- Responds well to decision-rule framing: "IF nothing valuable to add, THEN output exactly `---`"
- Claude Sonnet 4 shifted from literal compliance to **contextual reasoning** — it evaluates whether silence actually serves the user's goal
- Counter: Use explicit routing logic ("When the conversation is small talk, output `---` without exception")

### Key Prompting Techniques
- **XML tags are preferred delimiters** (`<context>`, `<instructions>`, `<examples>`)
- **Prefilling**: Can pre-populate the assistant response start to force specific output format
- **Negative instructions backfire**: Telling Claude what NOT to do can paradoxically encourage that behavior. Use positive alternatives instead
- **Verbosity control**: Claude is moderately verbose — word/sentence limits work well ("Maximum 3 bullet points, max 15 words each")
- **Decision rules over prohibition lists**: "IF condition THEN action" > "NEVER do X"

### Known Quirks
- **Contextual override**: Claude may skip explicit instructions if it infers doing so better serves the user. Fix: make instructions conditional, not absolute
- **Instruction conflicts**: Tags and structural hierarchy win, not position (unlike GPT where later = higher priority)
- **Helpful assistant** reflex is moderate — less aggressive than GPT but still present
- **Structured outputs**: No native JSON mode via API — must be prompt-enforced. Claude respects schema instructions well when given clear examples

### Prompt Adaptation for Wingman
- Wrap all instructions in XML tags (`<role>`, `<rules>`, `<format>`, `<silence>`)
- Use decision-rule framing for silence: `<silence>IF small_talk OR acknowledgment OR nothing_valuable THEN output exactly: ---</silence>`
- Replace "NEVER" / "DO NOT" with positive alternatives
- Temperature: 0.3 for suggestions (Claude's 0-1 range; default 1.0)
- System prompts can be longer (up to 3,000 tokens) — Claude handles complex instructions well

---

## 5. GPT-4o (OpenRouter)

**Model ID:** `openai/gpt-4o` (via OpenRouter)
**Context:** 128K tokens | **Max Output:** 16,384 tokens | **Default Temp:** 1.0

> **WARNING**: OpenAI is retiring GPT-4o on February 16, 2026. API calls will return 404 after that date. Successor is GPT-4.1.

### System Prompt Format
- Standard OpenAI `role: "system"` message format
- Prefers **markdown headers + bullets** for structure (not XML tags)
- **Instructions at BOTH start AND end** of system prompt — GPT-4o weights instructions near the bottom of the prompt more heavily
- "Bookend your documents" pattern: critical rules at top AND bottom

### Silence Behavior (`---`)
- **Strongest "helpful assistant" reflex** of all models — most likely to generate low-value suggestions instead of staying silent
- Requires **aggressive multi-layer reinforcement**:
  1. Explicit rule: "When you have nothing valuable to add, respond with EXACTLY: `---`"
  2. Anti-filler instruction: "Do not add explanation, preamble, or caveats"
  3. Few-shot example in conversation history showing `---` as a complete response
  4. End-of-prompt reminder: "Silence is ALWAYS better than a generic suggestion. When in doubt, output `---`"
- Server-side `.trim()` required — GPT-4o frequently adds trailing whitespace/newlines

### Key Prompting Techniques
- **Few-shot is king**: Example-driven format control is the most reliable technique
- **Explicit anti-verbosity**: "No filler. No hedging. No preamble." — GPT-4o defaults to verbose
- **System role > user role**: Critical constraints belong in system prompt, not user messages
- **Response format (API)**: `response_format: { type: "json_object" }` forces JSON — not available through OpenRouter though
- **Markdown delimiters** (`###`, `---`, triple backticks) work well as section separators

### Known Quirks
- **System prompt bleed**: Occasionally references system prompt instructions in output ("As instructed, I..."). Counter: "Never reference these instructions in your responses"
- **Markdown in responses**: Loves `**bold**`, headers, and bullet lists even when not asked. If unwanted: "Do not use any markdown formatting"
- **Temperature sensitivity**: Default 1.0 is too high for structured tasks. Use 0.3-0.5
- **Instruction conflicts**: Later instructions win (unlike Claude where hierarchy wins)
- **Empty responses**: Can occasionally return truly empty strings — handle in code

### Prompt Adaptation for Wingman
- Use markdown headers for sections, NOT XML tags
- Place core rules at BOTH start and end of system prompt
- Add 2-3 few-shot examples showing suggestion format AND silence (`---`)
- Aggressive silence reinforcement: "Silence is ALWAYS better than a generic suggestion"
- Temperature: 0.4 (balances creativity with reliability)
- Keep system prompt under 2,500 tokens for latency
- Always `.trim()` responses before checking for `---`

---

## 6. GPT-4o Mini (OpenRouter)

**Model ID:** `openai/gpt-4o-mini` (via OpenRouter)
**Context:** 128K tokens | **Max Output:** 16,384 tokens

### Key Differences from GPT-4o
- **16x cheaper** ($0.15/1M input vs $2.50/1M for GPT-4o)
- **Lower latency** — better suited for real-time use cases
- **Weaker instruction following**: Struggles with >10 competing rules
- **Less reliable silence**: More likely to add filler text around the `---` token
- **Conflict resolution**: If two instructions conflict, Mini follows the later one; GPT-4o tries to reconcile both
- **KB context handling**: Quality degrades faster with long injected context — keep KB snippets shorter

### Prompt Adaptation for Wingman
- **Simplify the system prompt**: Reduce to 5-7 core rules (not 10+)
- **More few-shot examples**: Add 3 examples to compensate for weaker instruction following
- **Shorter KB context**: Limit injected KB snippets to most relevant ~500 tokens
- **Direct instructions**: "Output only the suggestion. Nothing else." works better than nuanced rules
- **Temperature: 0.3** (tighter than GPT-4o to compensate for less reliable output)

---

## 7. Llama 3.3 70B (OpenRouter)

**Model ID:** `meta-llama/llama-3.3-70b-instruct` (via OpenRouter)
**Context:** 131K tokens | **Max Output:** ~4,096 tokens (varies by provider)

### System Prompt Format
- Standard OpenAI-compatible `role: "system"` format through OpenRouter
- Llama responds best to **role-based framing**: "You are [specific expert role]"
- **Lead with must-do instructions** — Llama weights earlier tokens more heavily
- Uses `[INST] [/INST]` tags internally but OpenRouter handles this automatically

### Silence Behavior
- **Moderate compliance** — better than GPT at staying silent, worse than Claude
- Llama's default safety prompt can cause excessive refusal behavior — OpenRouter typically strips this
- Explicit instruction works: "If you have nothing to add, output only: ---"
- **More wordy and imaginative** than GPT by default — needs explicit brevity constraints

### Key Prompting Techniques
- **Numbered instructions**: Multi-step tasks as numbered lists reduce rambling
- **Explicit constraints**: "Return ONLY [format]" — be more explicit than you would with GPT
- **Temperature**: Use 0.2-0.4 for factual/structured tasks (lower than GPT default)
- **Stop sequences**: Define `###` or similar to prevent continuation beyond desired content
- **Concise system prompts**: Keep under 1,500 tokens — Llama's 4K output limit means prompt token budget matters more
- **Ghost Attention (GAtt)**: Instruction following can degrade beyond ~20 dialogue turns

### Known Quirks
- **Instruction drift**: Tends to forget instructions after many conversation turns
- **Verbose by default**: "More wordy and imaginative" responses — always add brevity constraints
- **Safety over-filtering**: Can refuse benign requests if default safety prompt is too aggressive
- **Token counting**: Different tokenizer than GPT — plan token budgets accordingly

### Prompt Adaptation for Wingman
- Lead with role definition: "You are WINGMAN, a real-time AI assistant..."
- Numbered rules (not bullet points) for better adherence
- Explicit output format with example
- "Do not add greetings, apologies, or explanations" — Llama adds these frequently
- Temperature: 0.3
- Short conversation history (limit to 5 turns to avoid instruction drift)

---

## 8. Llama 4 Scout 17B (Groq)

**Model ID:** `meta-llama/llama-4-scout-17b-16e-instruct` (via Groq)
**Context:** 128K tokens (supports up to 10M) | **Max Output:** ~8,192 tokens

### Architecture
- **Mixture of Experts (MoE)**: 17B total params, 16 experts — only a subset activates per token
- **Multimodal**: Supports text + image inputs (text-only for Wingman)
- **Benchmarks**: MMLU Pro 74.3, MMLU ~83% — competitive with many 70B dense models

### System Prompt Format
- Standard OpenAI-compatible format through Groq API
- Benefits from same Llama-family prompting patterns but with better instruction following
- **Faster inference** on Groq's LPU hardware — lowest latency of all Llama models

### Key Differences from Llama 3.3 70B
- Better instruction following due to newer training
- Lower latency on Groq (50ms stagger vs 75ms for Llama 3.3 70B)
- MoE architecture means more consistent performance
- Still needs explicit format instructions but follows them more reliably

### Prompt Adaptation for Wingman
- Same Llama-family prompting patterns
- Can handle slightly more complex system prompts than Llama 3.1 8B
- Temperature: 0.3
- Groq's 30 RPM free tier → 2-second cooldown is sufficient
- Recommended as default Groq model for balance of speed + quality

---

## 9. Qwen 3 32B (Groq)

**Model ID:** `qwen/qwen3-32b` (via Groq)
**Context:** 128K tokens | **Max Output:** ~8,192 tokens

### System Prompt Format
- Uses **ChatML format** internally: `<|im_start|>system\n{content}<|im_end|>`
- Through Groq API, uses standard OpenAI-compatible format (Groq handles ChatML conversion)
- **No default system message** in Qwen3 — you must provide everything explicitly
- Supports `/think` and `/no_think` mode switching

### Thinking Mode
- **Must use `/no_think` for real-time suggestions** — thinking mode adds significant latency with `<think>` blocks
- Add to system prompt: "Do not use thinking mode. Respond directly."
- Or append `/no_think` to user messages

### Silence Behavior
- Moderate compliance — Qwen defaults to providing responses
- Explicit JSON/format constraints help: "Respond only in this format or output exactly `---`"
- More reliable with **schema-based output** instructions than free-form

### Key Prompting Techniques
- **Explicit format constraints**: "Respond only in raw [format]. No extra text or explanations."
- **Template schemas**: Provide exact output template for best results
- **Role-based prompts** lock behavior patterns effectively
- **Token limits**: Set in system prompt to keep responses concise
- **Visual delimiters**: Triple backticks or angle brackets create clear content boundaries

### Known Quirks
- **Language mixing**: Qwen frequently defaults to English when prompts contain English elements, even if asked to respond in another language
- **No default system message**: Everything must be explicitly stated
- **Thinking mode auto-activation**: Can unexpectedly engage thinking mode. Always enforce `/no_think` for real-time use
- **JSON structured output**: Works well with explicit schema but thinking mode models don't support `response_format: json_object`
- **Strong reasoning at 32B**: Competitive with larger models on complex tasks

### Prompt Adaptation for Wingman
- Begin system prompt with `/no_think` directive
- Use explicit role definition + numbered rules
- Provide output template with example
- "Do not use thinking mode. Do not include `<think>` blocks."
- Temperature: 0.3
- Keep system prompt under 2,000 tokens
- Strongest reasoning of the Groq models — good for complex persona instructions

---

## 10. Llama 3.3 70B Versatile (Groq)

**Model ID:** `llama-3.3-70b-versatile` (via Groq)
**Context:** 128K tokens | **Max Output:** ~32,768 tokens

### Key Characteristics
- Same model as OpenRouter's Llama 3.3 70B but served on Groq's LPU hardware
- **Fastest 70B inference** available — Groq's LPU provides dramatically lower latency than GPU-based providers
- Highest quality of the Groq-hosted models

### Differences from OpenRouter Version
- Significantly lower latency (75ms stagger vs 240ms on OpenRouter)
- Same prompting requirements and quirks as Llama 3.3 70B
- Groq's free tier limits apply (30 RPM)

### Prompt Adaptation
- Same as [Llama 3.3 70B (OpenRouter)](#7-llama-33-70b-openrouter) — identical model
- Benefit from Groq's speed: can afford slightly more complex system prompts since inference is faster
- Recommended for users who want highest quality on Groq's free tier

---

## 11. Llama 3.1 8B Instant (Groq)

**Model ID:** `llama-3.1-8b-instant` (via Groq)
**Context:** 128K tokens | **Max Output:** ~8,192 tokens

### Key Characteristics
- **Smallest model** in Wingman's roster — ultra-fast but limited capability
- Good for simple suggestions, categorization, summarization
- **Cannot handle complex multi-rule system prompts reliably**

### Prompt Adaptation for Wingman
- **Radically simplified system prompt** — max 5 rules:
  1. Role definition (1 sentence)
  2. Output format (with example)
  3. Silence rule
  4. Brevity rule
  5. No-repeat rule
- **More few-shot examples** (3-4) to compensate for weaker instruction following
- **Shorter KB context** — max 300 tokens of injected KB data
- **No complex persona instructions** — 8B models struggle with nuanced persona behavior
- **Temperature: 0.2** — needs tighter control
- **No tool calling support** — custom functions only via prompt instructions
- **Expect lower quality** — useful only for ultra-fast, basic suggestions

---

## Cross-Model Comparison Matrix

| Aspect | Gemini Flash | Claude Sonnet 4 | GPT-4o | Llama 3.3 70B | Llama 4 Scout | Qwen 3 32B | Llama 3.1 8B |
|--------|-------------|-----------------|--------|---------------|---------------|------------|-------------|
| **Silence reliability** | High | Highest | Low | Medium | Medium-High | Medium | Low |
| **Instruction following** | High | High (contextual) | High (literal) | Medium | Medium-High | High | Low |
| **Verbosity** | Medium | Medium | High (verbose) | High (wordy) | Medium | Medium | Low |
| **Preferred delimiters** | Markdown | XML tags | Markdown | Numbered lists | Numbered lists | Templates | Simple text |
| **Instruction priority** | Top-first | Hierarchy-based | End-first | Start-first | Start-first | Start-first | Start-first |
| **System prompt max** | 1,500 tok | 3,000 tok | 2,500 tok | 1,500 tok | 1,800 tok | 2,000 tok | 800 tok |
| **Ideal temperature** | 0.3-0.5 | 0.3 | 0.4 | 0.3 | 0.3 | 0.3 | 0.2 |
| **KB context max** | 1,000 tok | 2,000 tok | 1,500 tok | 800 tok | 1,000 tok | 1,200 tok | 300 tok |
| **Few-shot needed** | 1-2 | 0-1 | 2-3 | 2-3 | 1-2 | 1-2 | 3-4 |
| **Latency (Wingman)** | Low | Medium | Medium | Medium (OR) / Low (Groq) | Low (Groq) | Medium (Groq) | Very Low |

---

## Wingman-Specific Prompt Adaptation Rules

These are the concrete transformations the Setup Assistant must apply when generating a prompt for a specific model:

### Universal Structure (all models)
```
[ROLE]: Who the AI is, what it's doing
[RULES]: When to respond, when to stay silent
[FORMAT]: Exact output template
[EXAMPLES]: 1-3 few-shot demonstrations (model-dependent count)
[KB CONTEXT]: (injected at runtime, not in the generated prompt)
```

### Model-Specific Transformations

| Transformation | Gemini | Claude | GPT | Llama | Qwen |
|---------------|--------|--------|-----|-------|------|
| **Wrap in XML tags** | No | Yes | No | No | No |
| **Bookend rules (start + end)** | No | No | Yes | No | No |
| **Add `/no_think`** | No | No | No | No | Yes |
| **Silence reinforcement layers** | 1 | 1 | 3+ | 2 | 2 |
| **Anti-verbosity instruction** | Optional | Optional | Required | Required | Optional |
| **Numbered vs bullet rules** | Bullets | Tags | Bullets | Numbered | Numbered |
| **"Never" → positive framing** | Optional | Required | Optional | Optional | Optional |
| **Max system prompt tokens** | 1,500 | 3,000 | 2,500 | 1,500 | 2,000 |
| **Few-shot examples count** | 1-2 | 0-1 | 2-3 | 2-3 | 1-2 |
| **Add explicit format example** | Recommended | Recommended | Required | Required | Required |

### Silence Behavior Strategy by Model

**Tier 1 — Reliable silence** (minimal reinforcement needed):
- Gemini 2.5 Flash/Pro
- Claude Sonnet 4

**Tier 2 — Needs reinforcement** (2 layers):
- Llama 4 Scout 17B
- Llama 3.3 70B
- Qwen 3 32B

**Tier 3 — Aggressive reinforcement** (3+ layers):
- GPT-4o / GPT-4o Mini
- Llama 3.1 8B

### Temperature Recommendations by Model

| Model | Suggestion Generation | Summary Generation |
|-------|----------------------|-------------------|
| Gemini 2.5 Flash | 0.3 | 0.5 |
| Gemini 2.5 Pro | 0.4 | 0.5 |
| Claude Sonnet 4 | 0.3 | 0.5 |
| GPT-4o | 0.4 | 0.6 |
| GPT-4o Mini | 0.3 | 0.5 |
| Llama 3.3 70B | 0.3 | 0.5 |
| Llama 4 Scout | 0.3 | 0.5 |
| Qwen 3 32B | 0.3 | 0.5 |
| Llama 3.1 8B | 0.2 | 0.4 |

---

## Sources

### Gemini
- [Google Gemini API Prompting Strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)
- [Gemini 2.5 Pro Best Practices](https://medium.com/google-cloud/best-practices-for-prompt-engineering-with-gemini-2-5-pro-755cb473de70)
- [Gemini Output Format Control](https://ai.google.dev/gemini-api/docs/tokens)

### Claude
- [Anthropic Claude 4 Best Practices](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices)
- [Claude Structured Outputs](https://console.anthropic.com/docs/en/build-with-claude/structured-outputs)
- [Claude Sonnet 4.5 Prompt Behavior Changes](https://theagentarchitect.substack.com/p/claude-sonnet-4-prompts-stopped-working)
- [Claude System Prompts Analysis](https://simonwillison.net/2025/May/25/claude-4-system-prompt/)
- [Negative Instructions in LLMs](https://eval.16x.engineer/blog/the-pink-elephant-negative-instructions-llms-effectiveness-analysis)

### GPT
- [OpenAI Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering)
- [GPT-4.1 Prompting Guide](https://cookbook.openai.com/examples/gpt4-1_prompting_guide)
- [OpenAI Realtime Prompting Guide](https://cookbook.openai.com/examples/realtime_prompting_guide)
- [GPT-4o Retirement Notice (Feb 16, 2026)](https://www.remio.ai/post/openai-retiring-gpt-4o-gpt-4-1-and-o4-mini-the-2026-transition-guide)

### Llama
- [Meta Llama 4 Official](https://www.llama.com/models/llama-4/)
- [Groq Prompting Best Practices](https://console.groq.com/docs/prompting)
- [Groq Model Migration Guide](https://console.groq.com/docs/prompting/model-migration)
- [How to Prompt Llama (Replicate)](https://replicate.com/blog/how-to-prompt-llama)
- [Llama 4 Scout Benchmarks](https://llm-stats.com/models/llama-4-scout)

### Qwen
- [Qwen3 Official GitHub](https://github.com/QwenLM/Qwen3)
- [Qwen3 Structured Output Guide](https://qwen3lm.com/qwen3-prompt-engineering-structured-output/)
- [Qwen Concepts & Chat Format](https://qwen.readthedocs.io/en/latest/getting_started/concepts.html)
- [Alibaba Cloud Qwen JSON Mode](https://www.alibabacloud.com/help/en/model-studio/json-mode)
