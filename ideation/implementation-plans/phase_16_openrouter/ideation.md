# Phase 16 — OpenRouter LLM Provider

## What Is This

Add OpenRouter.ai as an alternative LLM provider for suggestions and call summaries. Users can choose between direct Gemini API (current default) or OpenRouter, which gives access to dozens of models (Claude, GPT-4o, Gemini, Llama, Mistral, etc.) through one API key.

## Why It Matters

- **Model flexibility**: Users aren't locked into Gemini. Some personas may work better with Claude or GPT-4o.
- **Rate limit relief**: OpenRouter's per-account limits are generally more generous than Gemini's free tier. Reduces 429 errors.
- **Future-proofing**: New models become available through OpenRouter without code changes.
- **BYOK stays intact**: Users still bring their own key — just to OpenRouter instead of (or in addition to) Gemini.

## What Uses the LLM Today

| Feature | API Call | Can Move to OpenRouter? |
|---------|----------|------------------------|
| **Suggestions** | `generateContent` (chat completion) | Yes |
| **Call summaries** | `generateContent` (JSON mode) | Yes |
| **KB embeddings** | `embedContent` / `batchEmbedContents` | No — stays on Gemini |

KB embeddings must stay on Gemini because switching embedding models would require re-embedding every uploaded document. The Gemini API key remains required for KB functionality.

## Part 1: Options Page — Provider Selection

Add a new "LLM Provider" section in the API Keys area.

### UI

- **Provider toggle**: Radio buttons — "Gemini (Direct)" or "OpenRouter"
- **Gemini fields** (existing): API key input + test button — always visible since embeddings need it
- **OpenRouter fields** (shown when selected):
  - API key input + test button
  - Model dropdown (curated list, not the full 200+ catalog)

### Curated Model List

| Model ID | Display Name | Notes |
|----------|-------------|-------|
| `google/gemini-2.5-flash` | Gemini 2.5 Flash | Same model, routed through OpenRouter |
| `google/gemini-2.5-pro` | Gemini 2.5 Pro | Higher quality, slower |
| `anthropic/claude-sonnet-4` | Claude Sonnet 4 | Strong instruction following |
| `openai/gpt-4o` | GPT-4o | Fast, good at structured output |
| `openai/gpt-4o-mini` | GPT-4o Mini | Cheapest OpenAI option |
| `meta-llama/llama-3.3-70b-instruct` | Llama 3.3 70B | Open-source, no data retention |

Users can also type a custom model ID for anything else on OpenRouter.

### Storage Keys

| Key | Type | Default |
|-----|------|---------|
| `llmProvider` | `'gemini' \| 'openrouter'` | `'gemini'` |
| `openrouterApiKey` | string | — |
| `openrouterModel` | string | `'google/gemini-2.5-flash'` |

### Test Button Behavior

- **Gemini**: Existing test (list models endpoint)
- **OpenRouter**: `GET https://openrouter.ai/api/v1/models` with Bearer auth. Show model count on success.

## Part 2: Gemini Client — Dual Format Support

The `GeminiClient` class currently makes 3 types of API calls. Suggestions and summaries need to support both formats.

### Request Format Translation

**Gemini format (current):**
```
POST /models/{model}:generateContent?key={key}
{
  contents: [{ role: "user", parts: [{ text: "..." }] }],
  systemInstruction: { parts: [{ text: "..." }] },
  generationConfig: { maxOutputTokens: 500, temperature: 0.3 }
}
```

**OpenRouter format (OpenAI-compatible):**
```
POST /api/v1/chat/completions
Authorization: Bearer {key}
{
  model: "google/gemini-2.5-flash",
  messages: [
    { role: "system", content: "..." },
    { role: "user", content: "..." }
  ],
  max_tokens: 500,
  temperature: 0.3
}
```

### Response Format Translation

**Gemini**: `data.candidates[0].content.parts[0].text`
**OpenRouter**: `data.choices[0].message.content`

### JSON Mode (Call Summaries)

**Gemini**: `generationConfig.responseMimeType: "application/json"`
**OpenRouter**: `response_format: { type: "json_object" }`

### What Doesn't Change

- Embeddings always use Gemini directly (same endpoint, same key)
- KB search pipeline untouched
- Persona system untouched
- Cooldown and rate-limit backoff logic stays the same
- Session lifecycle stays the same

## Part 3: Implementation Approach

### Option A: Adapter Layer Inside GeminiClient

Add private methods that translate request/response based on `llmProvider` setting. Keep one class.

- `buildRequest()` — returns `{ url, headers, body }` in the right format
- `extractResponse()` — pulls text from either format
- Provider config loaded once on `startSession()`

**Pros**: Minimal file changes, single class to maintain.
**Cons**: GeminiClient name becomes misleading.

### Option B: Abstract LLM Client + Two Implementations

Create `LLMClient` interface with `GeminiProvider` and `OpenRouterProvider`. Service worker picks the right one on session start.

**Pros**: Clean separation, easy to add more providers later.
**Cons**: More files, more refactoring, over-engineered if we only ever have two providers.

### Recommendation: Option A

This is a BYOK Chrome extension, not a multi-tenant platform. Option A keeps it simple. Rename the class to `LLMClient` if the naming bothers us, but the adapter approach is sufficient.

## Part 4: Cooldown & Rate Limits

Current 15-second cooldown (`suggestionCooldownMs = 15000`) is self-imposed. With OpenRouter, we could:

1. **Lower the default to 8–10 seconds** — OpenRouter's limits are more generous
2. **Add a cooldown slider to the Options page** — Let users tune it (5s–30s range)
3. **Keep the existing 429 backoff logic** — OpenRouter returns standard `Retry-After` headers

Recommendation: Add the slider. Different models and tiers have different limits. Let the user control it.

## What's NOT In Scope

- Streaming responses (future phase — would enable real-time token display)
- Per-persona model selection (possible future — each persona could specify its preferred model)
- Automatic failover (if OpenRouter is down, fall back to Gemini)
- Embedding model switching (would require full KB re-index)

## Risk & Open Questions

- **Embedding model lock-in**: If a user sets up KB with Gemini embeddings, then wants to drop the Gemini key entirely, they can't. The Gemini key must stay required. Is this UX acceptable?
- **Model quality variance**: Different models respond differently to the same system prompt. The persona prompts were tuned for Gemini. Some may need adjustment for Claude or GPT-4o.
- **Cost transparency**: OpenRouter charges per token with a markup. Should we show estimated cost per suggestion? Probably not for v1.
