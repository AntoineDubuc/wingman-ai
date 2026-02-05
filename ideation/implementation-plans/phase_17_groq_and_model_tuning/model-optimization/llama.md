# Llama Prompt Optimization

> Available via Groq (primary) and OpenRouter. Llama's biggest lever is few-shot examples. Its biggest weakness is JSON reliability (markdown fencing).

## Model Selection for Wingman

| Model | Active Params | Context | Groq Speed | Best For |
|---|---|---|---|---|
| Llama 4 Scout | 17B (109B total MoE) | 128K+ | ~840 tok/s | Fast & balanced (recommended) |
| Llama 3.3 70B | 70B | 128K | ~400 tok/s | Highest quality instruction following |
| Llama 3.1 8B | 8B | 128K | ~1200 tok/s | Ultra fast, basic tasks only |

**Recommendation:** Llama 3.3 70B for best silence compliance and quality. Llama 4 Scout for speed. Avoid 3.1 8B — too small for nuanced "when to speak" decisions.

## Temperature

| Use Case | Recommended | Notes |
|---|---|---|
| Suggestions | 0.3-0.5 | Meta's default is 0.6 — too high for coaching |
| Summaries (JSON) | 0.0-0.1 | Deterministic = less malformed JSON |

**Model-specific:**
- Llama 3.1 8B needs lower temp (0.2-0.3) to stay focused
- Llama 3.3 70B and Llama 4 Scout handle higher temps without drifting
- Use `top_p: 0.9` (Meta's recommendation) for all models

## Silence Enforcement

**Difficulty: Moderate.** Llama follows silence instructions better than GPT-4o but worse than Gemini. Few-shot examples are the critical lever.

### What Works

**1. Few-shot examples in the system prompt (highest impact):**
```
SILENCE EXAMPLES (respond with exactly ---):
[Speaker A]: "Hi, thanks for joining" → ---
[Speaker B]: "Sounds good, let me check" → ---
[Speaker A]: "Sure, that makes sense" → ---

SUGGESTION EXAMPLES:
[Speaker B]: "What's your uptime guarantee?" → 📌 SLA: 99.95% uptime...
[Speaker B]: "How does that compare to AWS?" → 📌 Key differentiator...
```

**2. Place silence rules at the TOP AND BOTTOM of the system prompt** — Llama remembers beginnings and endings best ("lost in the middle" effect).

**3. Binary output constraint (eliminates ambiguity):**
```
Your response must be EITHER:
1. Exactly --- (nothing else, no explanation)
2. A suggestion following the format below (max 4 bullets)
There is no third option. Never explain why you're staying silent.
```

**4. Give an "explanation outlet"** — Llama tends to explain its reasoning. If it can't explain, it sometimes generates a suggestion instead of staying silent just to have something to say. If you ever add structured JSON for suggestions, include a `reasoning` field the model can fill silently.

### Model Comparison

| Model | Silence Compliance | Notes |
|---|---|---|
| Llama 3.1 8B | Poor | Over-helps, struggles with silence |
| Llama 3.3 70B | Good | Best Llama option for silence |
| Llama 4 Scout | Good | Comparable to 3.3 70B |

## Prompt Structure

Llama responds best to:

- **Uppercase headers:** `WHEN TO RESPOND:`, `WHEN TO STAY SILENT:`, `RESPONSE FORMAT:`
- **Numbered rules** (followed more reliably than bullet points)
- **Few-shot examples** (biggest single lever — cannot overstate this)
- **Critical rules first AND last** (lost-in-the-middle mitigation)

**What to avoid:**
- XML tags — Llama has no special XML training (unlike Claude). They work but offer no advantage.
- System prompts over 4K tokens for Llama 3.3 70B (accuracy drifts)
- System prompts over 2K tokens for Llama 3.1 8B
- Phrases like "it's important to", "it's crucial" — Llama 4 Scout was trained to avoid these and may interpret them oddly

**Recommended structure:**
```
ROLE: You are WINGMAN, a real-time AI sales coach on a live call.

CRITICAL RULE: If nothing valuable to add, respond with exactly: ---
This is your default. Only speak when you add clear value.

RESPONSE FORMAT:
📌 [Key point]
• Talking point 1
• Talking point 2
💬 Ask: "[question]"

SILENCE EXAMPLES:
[Speaker]: "Hi, how's it going?" → ---
[Speaker]: "Okay, got it, thanks" → ---
[Speaker]: "Let me pull that up" → ---

SUGGESTION EXAMPLES:
[Speaker]: "What's your pricing?" → 📌 Custom quote based on usage...
[Speaker]: "How do you compare to X?" → 📌 Key differentiator...

RULES:
1. Max 3-4 bullet points
2. Simple language the rep can say verbatim
3. Never fabricate data
4. Silence is correct 70-80% of the time

REMEMBER: Default to ---. Silence is your most common output.
```

## JSON Reliability

**Known pain point.** Llama frequently wraps JSON in markdown code fences even with `response_format: { type: 'json_object' }`.

### Mitigations

1. **Always use `response_format: { type: 'json_object' }`** — helps but isn't bulletproof
2. **Explicit prompt instruction:**
   ```
   Return ONLY valid JSON. No markdown code fences. No text before or after the JSON object.
   ```
3. **`stripMarkdownCodeBlock()`** — already in Wingman's code, essential for Llama
4. **OpenRouter Response Healing plugin** — auto-fixes malformed JSON. Add `plugins: [{ id: 'response-healing' }]` to request body. Only works for non-streaming requests.
5. **Include the exact JSON schema in the prompt** — Llama generates more reliable JSON when it can see the target structure

**Model-specific:**
- Llama 3.3 70B: more reliable JSON than 3.1 8B
- Llama 4 Scout: had early quality issues (repetitive output loops) but is now comparable to 3.3 70B through major providers
- Quantized variants (int4) can degrade JSON reliability — prefer int8+ for structured output tasks

## Context Window

| Model | Max Context | Practical Max | Max System Prompt |
|---|---|---|---|
| Llama 3.1 8B | 128K | ~32K (accuracy drifts) | ~2K tokens |
| Llama 3.3 70B | 128K | ~64K | ~4K tokens |
| Llama 4 Scout | 10M (theoretical) | 128K-328K (provider) | ~4K tokens |

Wingman's typical payload (system prompt + KB + 20 turns) is well under 10K tokens — no concern.

## Special Tokens (Reference Only)

When using OpenRouter/Groq's OpenAI-compatible API, tokenization is handled automatically. For reference:

| Token | Llama 3.x | Llama 4 Scout |
|---|---|---|
| Role header open | `<\|start_header_id\|>` | `<\|header_start\|>` |
| Role header close | `<\|end_header_id\|>` | `<\|header_end\|>` |
| End of turn | `<\|eot_id\|>` | `<\|eot\|>` |

Emoji markers (`📌`, `💬`) work well as output anchors — Llama uses them consistently.

## Known Quirks

| Quirk | Impact | Mitigation |
|---|---|---|
| Markdown-fenced JSON | Breaks JSON parsing | `stripMarkdownCodeBlock()` + prompt instruction |
| Lost in the middle | Rules in the middle of long prompts get ignored | Put critical rules first AND last |
| Over-helps (8B) | Generates suggestions when it should be silent | Use 70B or Scout; add few-shot silence examples |
| Llama 4 Scout quantization | int4 degrades quality | Prefer int8+ providers (Groq uses high precision) |
| Explains its reasoning | Adds "I'll stay silent because..." instead of just `---` | "Never explain why you're staying silent" + binary output constraint |

## Tuning Profile

```typescript
{
  suggestionTemperature: 0.5,
  silenceReinforcement: 'If you have nothing valuable to add, you MUST respond with exactly three hyphens: ---\nThis is not optional. Do NOT add explanations or caveats when staying silent.\n\nHere is an example of correct silence:\nUser: [Speaker 1]: Sounds good, let me check my calendar.\nAssistant: ---\n\nHere is an example of correct silence:\nUser: [Speaker 1]: Okay, thanks for that.\nAssistant: ---',
  conversationSilenceHint: 'Should I provide a suggestion, or stay silent (---)? Remember: if you stay silent, respond with ONLY --- and nothing else. No explanations.',
  promptPrefix: null,
  promptSuffix: '\n\nREMEMBER: Default to ---. Silence is your most common output. Never explain why you are silent.',
  summaryPromptPrefix: null,
  summaryJsonHint: 'You MUST respond with raw JSON only. No markdown fencing (no ```). No text before or after the JSON object.',
  jsonHint: 'You MUST respond with raw JSON only. No markdown fencing. No text before or after the JSON object.',
}
```

## Sources

- [Meta Llama Prompt Engineering Guide](https://www.llama.com/docs/how-to-guides/prompting/)
- [Llama 4 Model Cards](https://www.llama.com/docs/model-cards-and-prompt-formats/llama4/)
- [Llama 3.3 Prompt Format (GitHub)](https://github.com/meta-llama/llama-models/blob/main/models/llama3_3/prompt_format.md)
- [Llama 4 Multimodal Intelligence (Meta Blog)](https://ai.meta.com/blog/llama-4-multimodal-intelligence/)
- [Llama 3.3 70B on OpenRouter](https://openrouter.ai/meta-llama/llama-3.3-70b-instruct)
- [Llama 4 Scout on OpenRouter](https://openrouter.ai/meta-llama/llama-4-scout)
- [OpenRouter Response Healing Plugin](https://openrouter.ai/docs/guides/features/plugins/response-healing)
- [AWS Bedrock Llama 3.3 JSON/Markdown Issue](https://repost.aws/questions/QUMI7G8p4jTUelsOaCEqwPxg)
- [Meta Llama 3 Generation Defaults (GitHub)](https://github.com/meta-llama/llama3/blob/main/llama/generation.py)
