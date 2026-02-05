# GPT Prompt Optimization

> Available via OpenRouter. GPT-4o's biggest challenge is fighting silence instructions. GPT-4.1 is significantly better at instruction following.

## Model Selection for Wingman

| Model | Context | Best For | Notes |
|---|---|---|---|
| GPT-4o | 128K | General-purpose coaching | Fights silence, verbose |
| GPT-4o-mini | 128K | High-volume silence/suggest decisions | Less nuanced but cheaper |
| GPT-4.1 | 1M | Structured, instruction-heavy tasks | Best silence compliance of the three |
| GPT-4.1-mini | 1M | Cost-effective alternative to 4.1 | Similar compliance at lower cost |

**Recommendation:** GPT-4.1-mini for best price/instruction-following balance. GPT-4o requires aggressive prompt engineering to reliably stay silent.

## Temperature

| Use Case | GPT-4o | GPT-4.1 | Notes |
|---|---|---|---|
| Suggestions | 0.3 | 0 | OpenAI recommends temp 0 as default for 4.1 |
| Summaries (JSON) | 0 | 0 | Required for consistent JSON |

GPT-4.1 is specifically tuned for better instruction-following at low temperatures. Only increase for creative tasks.

## Silence Enforcement

**Difficulty: High (4o) / Moderate (4.1).** GPT-4o has strong RLHF pressure to always be "helpful" — it invents low-value suggestions rather than staying silent.

### What Works

**1. Affirmative framing (tell it what TO do, not what NOT to do):**
```
When the conversation is routine small talk, greetings, or the speaker
is mid-thought, respond with exactly: ---

You MUST output --- in these situations:
- Greetings and pleasantries
- The speaker is still mid-sentence
- Filler words ("um", "let me think")
- No new sales-relevant information
- Fewer than 15 seconds since your last suggestion

Output --- more often than you output suggestions.
A good ratio is 4:1 silence to suggestions.
```

**2. Few-shot examples (single most effective technique):**
```
User: "Hey, good morning everyone, thanks for hopping on."
Assistant: ---

User: "Yeah we've been looking at Competitor X but their pricing is really aggressive."
Assistant: They mentioned Competitor X's pricing — ask what specific capabilities
they're comparing and whether total cost of ownership matters more.

User: "So yeah, I'll send that over after the call."
Assistant: ---

User: "Our contract renews in 6 weeks and we need to make a decision by then."
Assistant: Anchor the urgency — confirm the 6-week timeline and propose
next steps with specific dates.
```

**3. Role-based reinforcement:**
```
You are a senior sales coach who only speaks when there's a genuine tactical
opportunity. Elite coaches know that silence is a tool. Most of the conversation
does NOT need coaching. Default to ---.
```

**4. GPT-4.1: Use `#` section headers (it's specifically tuned for this):**
```
# CRITICAL: Response Rules
## When to Stay Silent
You MUST respond with exactly --- when:
...

## When to Provide a Suggestion
ONLY provide a suggestion when:
...
```

### What Does NOT Work
- "Only respond when necessary" — too vague, GPT interprets "necessary" broadly
- Negative instructions alone ("do not respond to small talk")
- Relying on temperature alone

### Silence Compliance by Model

| Model | Compliance | Notes |
|---|---|---|
| GPT-4o | Poor without few-shot | Strongly fights silence |
| GPT-4o-mini | Moderate | Less opinionated, follows instructions better |
| GPT-4.1 | Good | Best of the three, especially with markdown headers |
| GPT-4.1-mini | Good | Similar to 4.1 at lower cost |

## Prompt Structure

### GPT-4o / GPT-4o-mini
- No strong preferences for format
- Numbered lists work well for sequential rules
- Keep system prompt under ~1500 tokens for best compliance
- Bold text recognized but not as impactful as with Claude

### GPT-4.1 (Significant Difference)
OpenAI designed GPT-4.1 to follow **markdown `#` headers**:

```
# Role and Objective
You are a real-time sales coach...

# Instructions
## Core Behavior
- ...

## Response Format
- ...

## Silence Rules
- ...

# Examples
## Stay Silent
...

## Provide Suggestion
...

# Remember
Default to ---. Silence is your most common output.
```

**Key insight:** Put critical rules at the **beginning AND end** of the system prompt. Rules in the middle get less attention ("lost in the middle" applies to instructions too).

## JSON Reliability

### Structured Outputs (Best — GPT-4o/4.1)
```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "call_summary",
      "strict": true,
      "schema": { /* your schema */ }
    }
  }
}
```
100% schema compliance via constrained decoding. Best option for call summaries.

### JSON Mode (Good)
`response_format: { type: 'json_object' }` — always valid JSON but schema not enforced. Must mention "JSON" in the system prompt.

### Prompt-Only (Fragile)
GPT-4o sometimes wraps JSON in triple backticks even when told not to. Always have `stripMarkdownCodeBlock()` as fallback.

## Response Length Control

- **Hard cap:** `max_tokens: 150` for suggestions, `max_tokens: 2000` for summaries
- **Prompt-level:**
  ```
  Suggestions: 1-2 sentences maximum. Never exceed 40 words.
  The salesperson is in a LIVE CALL — they need to glance at your advice,
  not read an essay.
  ```
- GPT-4o is verbose by default — both constraints needed

## Known Quirks

| Quirk | Impact | Mitigation |
|---|---|---|
| Resists silence (4o) | Invents low-value suggestions | Few-shot + ratio guidance + role framing |
| Verbose (4o) | Responses longer than needed | `max_tokens` + explicit word limits |
| Less nuanced (4o-mini) | Misses subtle contextual cues | Better for silence/suggest decision than coaching content |
| Literal instruction-following (4.1) | May not improvise beyond instructions | Be precise — good for format compliance |
| Streaming `---` | Silence is a single token — fast | No issue |

## Tuning Profile

```typescript
{
  suggestionTemperature: 0.3,
  silenceReinforcement: 'Output --- more often than you output suggestions. A good ratio is 4:1 silence to suggestions. You MUST output --- for greetings, small talk, filler words, mid-sentence utterances, and any situation where no new sales-relevant information has been introduced. Do NOT explain why you are staying silent — just output ---.',
  conversationSilenceHint: 'Should I provide a suggestion, or stay silent (---)? Remember: silence is correct most of the time. Only speak for genuine tactical opportunities.',
  promptPrefix: null,
  promptSuffix: '\n\nRemember: default to ---. Silence is your most common output.',
  summaryPromptPrefix: null,
  summaryJsonHint: 'You MUST respond with valid JSON matching the schema above. No markdown fencing. No text outside the JSON object.',
  jsonHint: 'Respond in JSON format.',
}
```

## Sources

- [OpenAI GPT-4.1 Prompting Guide](https://platform.openai.com/docs/guides/prompt-engineering)
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
- [OpenAI JSON Mode](https://platform.openai.com/docs/guides/json-mode)
- [GPT-4.1 Model Card](https://platform.openai.com/docs/models/gpt-4.1)
