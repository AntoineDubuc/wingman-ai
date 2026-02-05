# Claude Prompt Optimization

> Available via OpenRouter. Claude's biggest challenge is over-helpfulness — it resists staying silent. Its biggest strength is XML-structured prompts and the prefill technique.

## Model Selection for Wingman

| Model | Best For | Price (in/out per MTok) |
|---|---|---|
| Claude Haiku 4.5 | Real-time suggestions (fast, cheap) | $1 / $5 |
| Claude Sonnet 4.5 | Call summaries (better reasoning) | $3 / $15 |
| Claude Opus 4.5 | Overkill for this use case | $5 / $25 |

**Recommendation:** Haiku 4.5 for suggestions, Sonnet 4.5 for summaries (if per-task model selection is ever added).

## Temperature

| Use Case | Recommended | Notes |
|---|---|---|
| Suggestions | 0.3-0.5 | Balanced creativity/consistency |
| Summaries (JSON) | 0.1-0.2 | Max structure adherence |
| Silence decisions | 0.2-0.3 | Lower = more consistent silence |

Even at temperature 0.0, Claude is not fully deterministic.

## Silence Enforcement

**Difficulty: High.** Claude is RLHF-trained to always be helpful. Silence feels like failure to the model.

### What Works

**1. Frame silence as the default behavior:**
```
Your DEFAULT behavior is silence (respond with exactly "---").
Only break silence when you have HIGH-VALUE, actionable guidance.
Silence is the correct response 70-80% of the time. Speaking when
you have nothing valuable to add actively harms the user's call.
```

**2. Give context for WHY silence matters (Claude 4.x responds to motivation):**
```
Excessive suggestions distract the sales rep during a live call.
Each unnecessary card on screen pulls attention away from the customer.
Silence is not failure — it means the rep is handling it well.
```

**3. Few-shot silence examples with XML tags:**
```xml
<examples>
<example>
<conversation>[Customer]: Yeah, exactly, that makes sense.</conversation>
<response>---</response>
</example>
<example>
<conversation>[Customer]: So how's the weather in Austin?</conversation>
<response>---</response>
</example>
<example>
<conversation>[Customer]: We're spending $200K/month on AWS and have no idea where the waste is.</conversation>
<response>📌 FinOps opportunity — ask about cost visibility
• "We helped similar companies cut 40% of cloud waste"
• Offer a free cost assessment as next step
💬 Ask: "Would it help if we ran a quick spend analysis?"</response>
</example>
</examples>
```

**4. Prefilling the assistant response (Claude-unique technique):**

Via OpenRouter, add a prefilled assistant turn to bias toward silence:
```json
{"role": "assistant", "content": "Decision:"}
```

Or even more aggressive — prefill with `---` and let Claude override only with good reason:
```json
{"role": "assistant", "content": "---"}
```

**Note:** Prefilling is NOT supported with extended thinking mode.

## Prompt Structure: XML Tags

Claude was trained with XML tags. Using them produces measurably better results than plain text for complex prompts.

**Recommended structure:**
```xml
<role>
You are WINGMAN, a real-time AI sales coach silently listening to a live call.
Your default behavior is silence (---). You only speak when you add clear value.
</role>

<silence_rules>
Respond with exactly "---" when:
- Small talk, greetings, pleasantries
- Rep is handling the conversation well
- Acknowledgments: "okay", "sure", "got it"
- You have nothing actionable to add
</silence_rules>

<speak_rules>
Only respond with a suggestion when:
- Customer asks a technical question the rep may not know
- A clear pain point surfaces that maps to your knowledge base
- There's a high-value discovery question opportunity
- You hear an objection that needs specific handling
</speak_rules>

<response_format>
📌 [One-line key point]
• Talking point 1
• Talking point 2
💬 Ask: "[suggested question]" (if relevant)
</response_format>

<knowledge_base>
{{KB_CONTEXT}}
</knowledge_base>

<rules>
1. Max 3-4 bullet points
2. Simple language the rep can say verbatim
3. Never fabricate data
4. Never repeat a point already made
5. Silence is correct 70-80% of the time
</rules>

<examples>
{{FEW_SHOT_EXAMPLES}}
</examples>
```

**Why XML beats plain text for Claude:** Claude parses boundaries between sections much more reliably. It won't confuse examples with instructions, or KB context with rules.

## JSON Reliability

### Prefill with `{` (Best for Claude via OpenRouter)

Prefill the assistant response with `{` and Claude completes valid JSON without markdown fencing:
```json
{"role": "assistant", "content": "{"}
```

### JSON Mode via OpenRouter

`response_format: { type: 'json_object' }` works for Claude through OpenRouter. Already implemented in Wingman's `buildRequest()`.

### Structured Outputs (Direct API only)

Available on Claude 4.5 models — 100% schema compliance via constrained decoding. Not available through OpenRouter. Future option if Claude is added as a direct provider.

### Defensive strip

Claude models through OpenRouter sometimes wrap JSON in triple backticks. The existing `stripMarkdownCodeBlock()` is necessary and correct.

## Known Quirks

| Quirk | Impact | Mitigation |
|---|---|---|
| Over-helpfulness | Generates suggestions when it should be silent | Few-shot silence examples + prefill + context for why silence matters |
| Verbosity | Responses longer than needed | "Exactly 1 headline and 2-3 bullets" + `max_tokens: 500` |
| "Think" sensitivity (Opus 4.5) | Word "think" in prompts causes odd behavior | Replace with "evaluate" or "consider" |
| Mirrors prompt style | Markdown prompt → markdown output | Use concise prompt style for concise output |
| Overengineering (Opus 4.5) | Adds unnecessary complexity/caveats | "Give exactly the suggestion the rep needs. Do not elaborate." |
| Claude 4.5 is more concise by default | May skip verbal summaries | Good for Wingman — less verbosity management needed |

## System Prompt vs User Message

Claude follows instructions in user messages slightly better than system messages. For Wingman's architecture (system prompt is primary):

- **System prompt:** Role, KB context, format, examples, rules
- **User message:** Current transcript + explicit silence decision prompt:
  ```
  Evaluate: Does this warrant breaking silence? If yes, provide a
  suggestion. If no, respond with exactly "---".
  ```

## Tuning Profile

```typescript
{
  suggestionTemperature: 0.3,
  silenceReinforcement: 'Silence is your default. You should output --- at least 70% of the time. Speaking when you have nothing valuable to add actively harms the user\'s call. Each unnecessary suggestion pulls the rep\'s attention away from the customer.',
  conversationSilenceHint: 'Evaluate: does this warrant breaking silence? If yes, provide a suggestion. If no, respond with exactly "---". Default to ---.',
  promptPrefix: null,
  promptSuffix: null,
  summaryPromptPrefix: null,
  summaryJsonHint: null,
  jsonHint: null,
}
```

**Note:** The XML restructuring of the system prompt is an "Optimize Once" transformation — Auto mode can't restructure the entire prompt into XML at runtime without risking intent changes. Auto mode adds `silenceReinforcement` and `conversationSilenceHint` only.

## Sources

- [Anthropic Prompt Engineering Overview](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/overview)
- [Use XML Tags to Structure Prompts](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/use-xml-tags)
- [Claude 4 Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)
- [Prefill Claude's Response](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prefill-claudes-response)
- [Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview)
