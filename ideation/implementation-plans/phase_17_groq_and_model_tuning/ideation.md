# Phase 17 — Groq LLM Provider

## What Is This

Add Groq (groq.com) as a third LLM provider. Groq runs open-source models on custom LPU hardware, delivering 3-10x faster inference than Gemini or OpenAI. The API is OpenAI-compatible — same request/response format we already use for OpenRouter.

## Why It Matters

- **Speed**: Groq's LPU chips deliver 400-840 tokens/second. Suggestions arrive noticeably faster than any other provider.
- **Cost**: Cheaper than Gemini and OpenRouter for equivalent quality models. Llama 4 Scout costs $0.11/$0.34 per million tokens (vs Gemini Flash at ~$0.15/$0.60).
- **Free tier exists**: 30 RPM, no credit card required. Good enough for casual users.
- **BYOK stays intact**: Users bring their own Groq API key from console.groq.com.

## What Uses the LLM Today

| Feature | API Call | Can Move to Groq? |
|---------|----------|-------------------|
| **Suggestions** | Chat completion | Yes |
| **Call summaries** | Chat completion (JSON mode) | Yes |
| **KB embeddings** | Gemini Embedding API | **No** — Groq has no embedding models |

KB embeddings must stay on Gemini. The Gemini API key remains required whenever KB documents are uploaded. However, unlike OpenRouter, users without KB needs could use Groq as their only provider.

## Recommended Models

| Model | Speed | Context | Cost (in/out per 1M tok) | Best For |
|-------|-------|---------|--------------------------|----------|
| **Llama 4 Scout (17Bx16E)** | 594 tok/s | 128K | $0.11 / $0.34 | Default — best speed/quality/cost balance |
| **Qwen3 32B** | 662 tok/s | 131K | $0.29 / $0.59 | Stronger reasoning |
| **Llama 3.3 70B Versatile** | 394 tok/s | 128K | $0.59 / $0.79 | Highest quality |
| **Llama 3.1 8B Instant** | 840 tok/s | 128K | $0.05 / $0.08 | Ultra-fast, basic suggestions |
| **GPT-OSS 20B** | 1,000 tok/s | 128K | $0.075 / $0.30 | OpenAI's open model, fastest |

**Default recommendation**: Llama 4 Scout — fast, cheap, good quality for sales coaching.

## Rate Limits

| Tier | RPM | TPM | Cost |
|------|-----|-----|------|
| **Free** | 30 | 6,000-14,400 | $0 |
| **Developer** | ~300 | ~60,000 | Pay-as-you-go |
| **Enterprise** | Custom | Custom | Custom |

Free tier's 30 RPM is workable with our suggestion cooldown. Developer tier has no monthly fee — just token costs.

## API Details

- **Endpoint**: `https://api.groq.com/openai/v1/chat/completions`
- **Auth**: `Authorization: Bearer <GROQ_API_KEY>`
- **Format**: OpenAI-compatible (identical to OpenRouter)
- **JSON mode**: `response_format: { type: "json_object" }` (same as OpenRouter)
- **No CORS issues**: Service worker bypasses CORS with `host_permissions`

## Part 1: Options Page — Provider Selection

Extend the existing provider radio group with a third option.

### UI Changes

- Add "Groq" radio button alongside "Gemini (Direct)" and "OpenRouter"
- **Groq fields** (shown when selected):
  - API key input + test button
  - Model dropdown (curated list from table above)
- Gemini key section stays visible when KB is active (needed for embeddings)

### Storage Keys

| Key | Type | Default |
|-----|------|---------|
| `llmProvider` | `'gemini' \| 'openrouter' \| 'groq'` | `'gemini'` |
| `groqApiKey` | string | — |
| `groqModel` | string | `'meta-llama/llama-4-scout-17b-16e-instruct'` |

### Test Button

`GET https://api.groq.com/openai/v1/models` with Bearer auth. Show model count on success.

## Part 2: LLM Client — Add Groq Branch

Since Groq uses the exact same OpenAI-compatible format as OpenRouter, the implementation is minimal.

### What's Shared with OpenRouter

- Request body shape (`messages`, `model`, `max_tokens`, `temperature`)
- Response shape (`choices[0].message.content`)
- JSON mode (`response_format: { type: "json_object" }`)
- Bearer token auth in `Authorization` header

### What's Different from OpenRouter

| | OpenRouter | Groq |
|---|---|---|
| **Base URL** | `openrouter.ai/api/v1` | `api.groq.com/openai/v1` |
| **Extra headers** | `HTTP-Referer`, `X-Title` | None needed |
| **Rate limit header** | `Retry-After` | `Retry-After` (same) |
| **API key storage** | `openrouterApiKey` | `groqApiKey` |
| **Model storage** | `openrouterModel` | `groqModel` |

### Implementation in `buildRequest()`

The existing `buildRequest()` already branches on `this.provider`. For Groq, reuse the OpenRouter body format with a different URL and simpler headers:

```
if provider is 'groq':
  url = https://api.groq.com/openai/v1/chat/completions
  headers = { Authorization: Bearer <groqApiKey>, Content-Type: application/json }
  body = same OpenAI-compatible format as OpenRouter
```

### Changes to `extractResponseText()`

No changes needed — Groq returns the same `choices[0].message.content` as OpenRouter. Can share the same extraction path.

## Part 3: Manifest & Permissions

Add to `host_permissions` in `manifest.json`:

```json
"https://api.groq.com/*"
```

## Part 4: Cooldown Configuration

| Provider | Default Cooldown | Rationale |
|----------|-----------------|-----------|
| Gemini | 15s | Free-tier 429 protection |
| OpenRouter | 2s | Paid tier, generous limits |
| **Groq** | **2s** | Fast inference, 30+ RPM even on free tier |

Add `groq: 2000` to `PROVIDER_COOLDOWNS` in `llm-config.ts`.

## Part 5: Gemini Key Requirement

Today, Gemini API key is always required because KB embeddings need it. With Groq:

- **If user has KB documents**: Gemini key still required for embeddings
- **If user has no KB documents**: Groq key alone is sufficient

### Proposed UX

- Gemini key field shows a note: "Required for Knowledge Base features"
- Session can start with just a Deepgram key + Groq key (no Gemini key), but KB features are disabled
- If user tries to upload KB documents without a Gemini key, show an error

This is a change from the current behavior where Gemini key is always mandatory. It makes the extension more accessible for users who just want fast suggestions without KB.

## Files to Change

| File | Change |
|------|--------|
| `src/shared/llm-config.ts` | Add `'groq'` to `LLMProvider`, add to `PROVIDER_COOLDOWNS` |
| `src/services/gemini-client.ts` | Add Groq branch in `buildRequest()`, `loadProviderConfig()` |
| `src/options/options.html` | Add Groq radio button, key input, model dropdown |
| `src/options/sections/api-keys.ts` | Add Groq key save/load/test, provider toggle logic |
| `src/popup/popup.ts` | Check `groqApiKey` in `checkApiKeys()` |
| `src/content/content-script.ts` | No changes |
| `src/content/overlay.ts` | No changes |
| `src/background/service-worker.ts` | No changes (provider routing is in gemini-client) |
| `manifest.json` | Add `https://api.groq.com/*` to `host_permissions` |

## What's NOT In Scope

- Streaming responses (future phase)
- Per-persona model selection
- Automatic failover between providers
- Embedding model switching (would require full KB re-index)
- Groq audio transcription (they have Whisper, but we use Deepgram)

## Risks & Open Questions

1. **Model quality variance**: Persona system prompts were tuned for Gemini. Llama/Qwen may interpret them differently. May need prompt adjustments per model family.
2. **Groq free tier daily limits**: Some models have as low as 1,000 requests/day on free tier. Heavy users could hit this. Developer tier resolves it.
3. **Groq availability**: Groq is newer and smaller than Google/OpenAI. Uptime track record is shorter. Not a blocker for a BYOK extension where the user accepts provider risk.
4. **JSON mode reliability**: Llama models may be less reliable at producing valid JSON for call summaries than Gemini. May need fallback parsing.
