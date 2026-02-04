# Implementation Plan: OpenRouter LLM Provider

---

## Executive Summary

Add OpenRouter.ai as an alternative LLM provider for Wingman AI's suggestion and call summary features. Currently, all AI calls go directly to Google Gemini. This phase adds a provider toggle so users can route suggestions through OpenRouter instead, giving them access to dozens of models (Claude, GPT-4o, Llama, etc.) through a single API key. KB embeddings stay on Gemini. The Gemini API key remains required for Knowledge Base functionality.

**Key Outcomes:**
- Users can choose between Gemini (direct) and OpenRouter as their LLM provider
- OpenRouter users can pick from a curated list of models or enter a custom model ID
- Suggestion cooldown becomes user-configurable (5–30 seconds)
- All existing functionality (KB, personas, Drive save, summaries) continues working regardless of provider choice

---

## Product Manager Review

### Feature Overview

This phase adds LLM provider choice to Wingman AI. Users who hit Gemini rate limits or want to use a different model (Claude, GPT-4o, etc.) can switch to OpenRouter with one toggle and an API key. The change is isolated to the suggestion and summary generation path — everything else stays the same.

### Features

#### Feature 1: LLM Provider Toggle

**What it is:** A setting in the Options page that lets users choose between "Gemini (Direct)" and "OpenRouter" as their LLM provider for suggestions and call summaries.

**Why it matters:** Removes the hard dependency on Gemini. Users who hit rate limits, want better model quality, or prefer a specific provider can switch without changing anything else in their setup.

**User perspective:** Open Options → API Keys section → pick your provider → enter the API key → pick a model → save. Next call uses the new provider automatically.

---

#### Feature 2: Model Selector

**What it is:** A dropdown in the Options page (visible when OpenRouter is selected) that lets users pick which model to use for suggestions and summaries.

**Why it matters:** Different models have different strengths. Claude is strong at instruction-following, GPT-4o is fast at structured output, Llama has no data retention. Users can match the model to their use case.

**User perspective:** Pick from a curated list (Gemini Flash, Gemini Pro, Claude Sonnet, GPT-4o, GPT-4o Mini, Llama 3.3 70B) or type any OpenRouter model ID for advanced users.

---

#### Feature 3: Configurable Suggestion Cooldown

**What it is:** A slider in the Options page that lets users control the minimum time between AI suggestions (5–30 seconds, default 15).

**Why it matters:** The current 15-second cooldown is hardcoded. Users on higher-tier API plans or using faster models may want more frequent suggestions. Users on free tiers may want to extend it to avoid rate limits.

**User perspective:** Drag the slider to your preferred interval. Lower = more suggestions (but more API usage). Higher = fewer suggestions (but safer on free tiers).

---

## Master Checklist

### Instructions for Claude Code

> **CRITICAL: You must follow these rules exactly.**
>
> 1. **Save after every cell write.** You cannot batch writes to this table. Each time you update a cell (start time, end time, estimate, etc.), you must save the file immediately before proceeding to other cells or other work.
>
> 2. **Check the checkbox** when you begin a task. This serves as a visual indicator of which task is currently in progress.
>
> 3. **Workflow for each task:**
>    - Check the checkbox `[x]` → Save
>    - Write start time → Save
>    - Complete the implementation work
>    - Write end time → Save
>    - Calculate and write total time → Save
>    - Write human time estimate → Save
>    - Calculate and write multiplier → Save
>    - Move to next task
>
> 4. **Time format:** Use `HH:MM` (24-hour format) for start/end times. Use minutes for total time and estimates.
>
> 5. **Multiplier calculation:** `Multiplier = Human Estimate ÷ Total Time`. Express as `Nx` (e.g., `10x` means 10 times faster than human estimate).
>
> 6. **If blocked:** Note the blocker in the task description section below and move to the next unblocked task.

### Progress Dashboard

| Done | # | Task Name | Start | End | Total (min) | Human Est. (min) | Multiplier |
|:----:|:-:|-----------|:-----:|:---:|:-----------:|:----------------:|:----------:|
| [ ] | 1 | Types, storage keys, and host permissions | | | | | |
| [ ] | 2 | Provider config loading in GeminiClient | | | | | |
| [ ] | 3 | Unified request/response adapter | | | | | |
| [ ] | 4 | Call summary — provider-aware JSON mode | | | | | |
| [ ] | 5 | Service worker — session start validation | | | | | |
| [ ] | 6 | Options page — provider toggle UI | | | | | |
| [ ] | 7 | Options page — OpenRouter key, test, and model selector | | | | | |
| [ ] | 8 | Options page — cooldown slider | | | | | |
| [ ] | 9 | End-to-end testing | | | | | |

**Summary:**
- Total tasks: 9
- Completed: 0
- Total time spent: 0 minutes
- Total human estimate: 0 minutes
- Overall multiplier: —

---

## Task Descriptions

This section provides context for each task. Read the relevant description before starting implementation.

Tasks are ordered by dependency: foundation first (1), then client internals (2–5), then UI (6–8), then validation (9). Tasks within a group can be done in listed order.

---

### Task 1: Types, Storage Keys, and Host Permissions

**Intent:** Define the types, storage keys, and runtime permission infrastructure needed for provider selection.

**Context:** Foundation task. Everything else depends on this.

**Expected behavior:** New types are importable. New storage keys are accessible with sensible defaults. `chrome.permissions.request()` can grant OpenRouter access at runtime. Zero change for existing users.

**Key components:**
- `src/shared/llm-config.ts` (new file) — exports:
  - `type LLMProvider = 'gemini' | 'openrouter'`
  - `interface ProviderConfig { provider: LLMProvider; openrouterApiKey?: string; openrouterModel: string; suggestionCooldownMs: number; }`
  - `OPENROUTER_MODELS` — curated model list as `Array<{ id: string; label: string }>`:
    - `google/gemini-2.5-flash` — Gemini 2.5 Flash
    - `google/gemini-2.5-pro` — Gemini 2.5 Pro
    - `anthropic/claude-sonnet-4` — Claude Sonnet 4
    - `openai/gpt-4o` — GPT-4o
    - `openai/gpt-4o-mini` — GPT-4o Mini
    - `meta-llama/llama-3.3-70b-instruct` — Llama 3.3 70B
  - `DEFAULT_PROVIDER_CONFIG` — `{ provider: 'gemini', openrouterModel: 'google/gemini-2.5-flash', suggestionCooldownMs: 15000 }`
- `chrome.storage.local` — new keys: `llmProvider`, `openrouterApiKey`, `openrouterModel`, `suggestionCooldownMs`

**Notes:**
- `manifest.json` already has `optional_host_permissions: ["*://*/*"]`. No manifest changes needed. The options page will call `chrome.permissions.request({ origins: ['https://openrouter.ai/*'] })` at runtime — same pattern as `langbuilder.ts` line 123.
- Permission granted from the options page applies extension-wide, including the service worker. Verified: LangBuilder uses this exact approach — options page grants, service worker fetches.
- Types live in a new file, not `persona.ts`. Persona system is unrelated.

---

### Task 2: Provider Config Loading in GeminiClient

**Intent:** Add instance properties and a config loader so the client knows which provider to use during a session.

**Context:** Must come before Tasks 3–4. The adapter methods (next tasks) branch on `this.provider` — these properties must exist first.

**Current behavior (what we're changing):**
- `startSession()` only resets state (chat history, cooldown, rate limit flag). No storage reads.
- The Gemini API key is fetched from `chrome.storage.local` on **every** `generateResponse()` call — not cached.
- The `getApiKey()` method (used by summaries) also reads from storage each time, and throws `'ENOKEY'` if missing.
- `this.model` (`'gemini-2.5-flash'`) is used in the Gemini URL. Embeddings use a separate `EMBEDDING_MODEL` constant.

**New behavior:**
- Add new instance properties: `private provider: LLMProvider = 'gemini'`, `private openrouterApiKey: string | null = null`, `private openrouterModel: string = 'google/gemini-2.5-flash'`
- Add `async loadProviderConfig(): Promise<void>` — reads all 4 keys from storage, sets instance properties
- The existing `this.model` (`'gemini-2.5-flash'`) stays untouched — it's only used in Gemini URLs. `this.openrouterModel` is separate and goes in the OpenRouter request body.
- Both `generateResponse()` and `generateCallSummary()` use the cached API key (Gemini or OpenRouter depending on `this.provider`) instead of reading storage per-call.

**Key components:**
- `src/services/gemini-client.ts` — new properties + `loadProviderConfig()` method
- `src/background/service-worker.ts` — call `loadProviderConfig()` in `handleStartSession()` after `geminiClient.startSession()` but before persona loading

**Notes:**
- `startSession()` resets the new properties to defaults. `loadProviderConfig()` populates them from storage. This two-step keeps the reset/load separation clean.
- The Gemini API key (`geminiApiKey`) is also loaded and cached — it's needed regardless of provider (embeddings always use Gemini).
- Settings changed mid-session take effect on the next session. Same as persona/KB changes.

---

### Task 3: Unified Request/Response Adapter

**Intent:** Add a single `buildRequest()` method and a single `extractResponseText()` method that handle both Gemini and OpenRouter formats for suggestions AND summaries.

**Context:** Core technical change. Depends on Task 2 (provider properties must exist). Both `generateResponse()` and `generateCallSummary()` will use these methods.

**Design: One `buildRequest()` with options, not two separate builders.**

Suggestions and summaries differ in 4 parameters but share all format translation logic. One method with options is cleaner:

```
buildRequest(options: {
  messages: GeminiMessage[];        // from buildConversationMessages() or raw prompt
  systemPrompt?: string;            // present for suggestions, absent for summaries
  maxTokens: number;                // 500 for suggestions, 2000 for summaries
  temperature: number;              // 0.3 for suggestions, 0.2 for summaries
  jsonMode?: boolean;               // false for suggestions, true for summaries
}) → { url: string; headers: Record<string,string>; body: string }
```

**Format translation (Gemini → OpenRouter):**

| Aspect | Gemini | OpenRouter |
|--------|--------|------------|
| URL | `${GEMINI_API_BASE}/${this.model}:generateContent?key=${geminiKey}` | `https://openrouter.ai/api/v1/chat/completions` |
| Auth | Query param `?key=` | `Authorization: Bearer ${openrouterKey}` |
| System prompt | `systemInstruction: { parts: [{ text }] }` | `messages[0]: { role: 'system', content: text }` |
| Roles | `'user'` / `'model'` | `'user'` / `'assistant'` |
| Message shape | `{ role, parts: [{ text }] }` | `{ role, content: string }` |
| Model | In URL path | `model: "google/gemini-2.5-flash"` in body |
| Token limit | `generationConfig.maxOutputTokens` | `max_tokens` |
| JSON mode | `generationConfig.responseMimeType: 'application/json'` | `response_format: { type: 'json_object' }` |

**Response extraction: One `extractResponseText()` method:**
- Gemini: `data.candidates?.[0]?.content?.parts?.[0]?.text`
- OpenRouter: `data.choices?.[0]?.message?.content`

**Rate limit handling: provider-aware 429 branch:**
- Gemini: existing `parseRetryDelay(bodyText)` — reads `error.details[].retryDelay` from response body
- OpenRouter: new `parseRetryAfterHeader(response)` — reads `response.headers.get('Retry-After')` (integer seconds or HTTP-date)
- The 429 handler in `generateResponse()` branches on `this.provider` before calling the right parser
- `fetchWithRetry()` (used by summaries and embeddings) works for both providers — its retry logic is HTTP-status-based and provider-agnostic

**Key components:**
- `src/services/gemini-client.ts`:
  - `private buildRequest(options)` — returns `{ url, headers, body }`
  - `private extractResponseText(data)` — returns `string | null`
  - `private parseRetryAfterHeader(response: Response)` — returns seconds (number)
  - Update `generateResponse()` to call `buildRequest()` + `extractResponseText()`
  - Keep `fetchWithRetry()` unchanged (it's already generic)

**Notes:**
- OpenRouter requests include `HTTP-Referer: https://wingman-ai.com` and `X-Title: Wingman AI` headers for app identification.
- The existing `buildConversationMessages()` method stays unchanged — it returns Gemini format. The `buildRequest()` method translates when provider is OpenRouter.
- The `Suggestion.source` field is currently `'gemini'` but never consumed anywhere downstream (not by overlay, content script, or Drive save). Set it to `this.provider` for correctness, but nothing will break either way.
- `fetchWithRetry()` throws `new Error('Gemini API error ...')` on non-429 failures. Update the error message to say `'LLM API error'` since it's now provider-agnostic.

---

### Task 4: Call Summary — Provider-Aware JSON Mode

**Intent:** Make `generateCallSummary()` use the shared `buildRequest()` adapter from Task 3.

**Context:** Depends on Task 3. The summary method has its own code path but shares the format translation.

**Current summary code path (differs from suggestions):**

| Aspect | How it works today |
|--------|--------------------|
| API key | `this.getApiKey()` — throws `'ENOKEY'` if missing |
| Fetch | `fetchWithRetry()` — exponential backoff (2s, 4s, 8s) |
| Body | `contents: [{ parts: [{ text: prompt }] }]` — no systemInstruction |
| JSON mode | `generationConfig.responseMimeType: 'application/json'` |
| Tokens | `maxOutputTokens: 2000`, `temperature: 0.2` |

**Changes:**
- Replace the inline body construction with `buildRequest({ messages, maxTokens: 2000, temperature: 0.2, jsonMode: true })`
- Replace the inline response extraction with `extractResponseText(data)`
- Update `getApiKey()` to return the correct key for the active provider (Gemini key when `provider === 'gemini'`, OpenRouter key when `provider === 'openrouter'`)

**Key components:**
- `src/services/gemini-client.ts` — update `generateCallSummary()` to use `buildRequest()` and `extractResponseText()`
- `src/services/call-summary.ts` — no changes (pure prompt builder)

**Notes:**
- Some models may return markdown-wrapped JSON (` ```json ... ``` `). Add a `stripMarkdownCodeBlock()` helper before `JSON.parse()`: strip leading ` ```json\n ` and trailing ` ``` ` if present.
- The existing summary prompt already says "Return ONLY valid JSON" — this serves as a fallback for models that don't support `response_format`.
- `fetchWithRetry()` retries on 429 for any provider. Error messages should be provider-agnostic (fixed in Task 3).

---

### Task 5: Service Worker — Session Start Validation

**Intent:** Update the session start flow so it validates the correct API key for the selected provider.

**Context:** Depends on Task 2. Currently `handleStartSession()` requires `geminiApiKey` and aborts if missing. With OpenRouter selected, the user might not have a Gemini key (or might have one only for KB). The validation logic must change.

**Current validation in `handleStartSession()`:**
```
Reads: deepgramApiKey, geminiApiKey
If either is missing → return error, session doesn't start
```

**New validation:**
```
Reads: deepgramApiKey, geminiApiKey, llmProvider, openrouterApiKey
deepgramApiKey required always (STT)
If llmProvider === 'gemini': geminiApiKey required
If llmProvider === 'openrouter': openrouterApiKey required, geminiApiKey optional (warn if missing — KB won't work)
```

**Key components:**
- `src/background/service-worker.ts` — update the key validation block in `handleStartSession()`

**Notes:**
- If OpenRouter is selected and Gemini key is missing, session should still START (suggestions work). Log a warning: "Gemini API key not configured — Knowledge Base will be unavailable." KB search will silently fail (existing graceful degradation).
- The Deepgram key is always required — no transcription without it.
- Error messages sent back to the popup should be specific: "OpenRouter API key required" or "Gemini API key required" depending on the selected provider.

---

### Task 6: Options Page — Provider Toggle UI

**Intent:** Add radio buttons to the API Keys section for choosing between Gemini and OpenRouter.

**Context:** UI entry point for the feature. When the user selects OpenRouter, the OpenRouter fields (Task 7) become visible. The Gemini API key field stays visible regardless.

**Expected behavior:** Two radio buttons in the API Keys card. "Gemini (Direct)" selected by default. Selecting "OpenRouter" reveals the OpenRouter fields below (key input, model selector). Selection persists to `llmProvider` on save.

**Key components:**
- `src/options/options.html` — new radio group in the API Keys `options-card`, plus a container div for OpenRouter fields (hidden by default)
- `src/options/sections/api-keys.ts` — toggle logic (show/hide OpenRouter container), save `llmProvider` to storage, load on init

**Notes:**
- The Gemini API key input stays visible with a note: "Required for Knowledge Base embeddings" (always true regardless of provider).
- The status indicator logic changes: if OpenRouter is selected, status should reflect whether the OpenRouter key is configured (not just Gemini).
- Match existing UI patterns: radio group uses `.radio-group` / `.radio-option` classes (already used by the transcript format selector in Drive settings).

---

### Task 7: Options Page — OpenRouter Key, Test, and Model Selector

**Intent:** Add the OpenRouter API key input, test button, and model dropdown — all within the OpenRouter container that Task 6 shows/hides.

**Context:** Depends on Task 6. These are one logical unit — all three fields appear together when OpenRouter is selected, and disappear together when Gemini is selected.

**Expected behavior:**
- Password input for OpenRouter API key (same `.password-input-wrapper` + `.toggle-visibility-btn` pattern as existing keys)
- "Test" button: calls `GET https://openrouter.ai/api/v1/models` with `Authorization: Bearer {key}`. Shows toast with model count on success, error on failure.
- Model dropdown: `<select>` with 6 curated options from `OPENROUTER_MODELS` + an "Other" option that reveals a text input for custom model IDs
- All three persist to storage on save: `openrouterApiKey`, `openrouterModel`

**Key components:**
- `src/options/options.html` — input + button + select inside the OpenRouter container div
- `src/options/sections/api-keys.ts` — permission request, test endpoint, model selection, save/load

**Permission pattern (from `langbuilder.ts`):**
```
1. User clicks "Test" or "Save"
2. Check: chrome.permissions.contains({ origins: ['https://openrouter.ai/*'] })
3. If not granted: chrome.permissions.request({ origins: ['https://openrouter.ai/*'] })
4. If denied: show toast error, abort
5. If granted: proceed with fetch
```
This grants the permission extension-wide — the service worker can then fetch from `openrouter.ai` without additional permission logic.

**Notes:**
- The curated model list is defined in `src/shared/llm-config.ts` (Task 1). Import it here.
- When "Other" is selected, the custom model ID input appears. Persist the custom ID as `openrouterModel`.
- Verify model IDs against OpenRouter's actual catalog at implementation time (IDs may have changed).

---

### Task 8: Options Page — Cooldown Slider

**Intent:** Add a slider that lets users configure the minimum time between AI suggestions.

**Context:** Independent of the provider toggle — useful for both providers. Currently hardcoded as `private suggestionCooldownMs = 15000` in GeminiClient.

**Expected behavior:** Range slider from 5 to 30 seconds, default 15. Value displayed next to the slider (e.g., "15s"). Persists to `suggestionCooldownMs` in milliseconds.

**Key components:**
- `src/options/options.html` — range input in the Call Settings tab, near the existing endpointing slider
- `src/options/sections/transcription.ts` — slider logic, save to storage (follow exact pattern of endpointing slider)

**Implementation pattern (copy from endpointing slider):**
- HTML: `<input type="range" id="cooldown-range" min="5000" max="30000" step="1000" value="15000">`
- Label: `<span id="cooldown-value">15s</span>`
- Format: `(value / 1000).toFixed(0)` + "s"
- Save on `change` event to `suggestionCooldownMs`
- Load from storage on init, default to `15000`

**Notes:**
- Place after the endpointing slider with label: "Suggestion frequency" and description: "Minimum time between AI suggestions. Lower = more suggestions but higher API usage."
- The client reads this value via `loadProviderConfig()` (Task 2) at session start.

---

### Task 9: End-to-End Testing

**Intent:** Verify the full flow with both providers.

**Context:** Final task. All previous tasks must be complete.

**Test matrix:**

| # | Test | Expected |
|:-:|------|----------|
| 1 | Gemini provider — full flow | Suggestions work, KB context injected, call summary generates, Drive save works |
| 2 | OpenRouter + Gemini model | Same behavior routed through OpenRouter |
| 3 | OpenRouter + non-Gemini model (e.g., Claude) | Suggestions work, verify response quality and format |
| 4 | OpenRouter without Gemini key | Session starts, suggestions work, KB gracefully fails with warning |
| 5 | Provider switch between sessions | New session uses new provider |
| 6 | Cooldown slider | Changing value affects suggestion frequency on next session |
| 7 | Missing/invalid API key | Appropriate error messages in popup |
| 8 | Permission flow | First OpenRouter test triggers permission dialog; subsequent tests skip it |

**Key things to verify in service worker console:**
- KB logs still appear (with Gemini key present)
- `[GeminiClient] KB context injected` log shows regardless of provider
- Suggestion logs show correct provider
- No `document is not defined` or permission errors
- 429 handling works (rate limit backoff activates cleanly)
- `kbSource` attribution still appears on suggestion cards in the overlay

**Notes:** Test with at least two different OpenRouter models. The Gemini-via-OpenRouter test (test #2) is the best regression check — same model, different wire format.

---

## Appendix

### Architecture: Adapter Interface

The adapter is internal to `GeminiClient`. No new classes or files needed for the runtime path.

```
GeminiClient
├── loadProviderConfig()           ← reads storage, sets this.provider/keys
├── buildRequest(options)          ← returns { url, headers, body } for either provider
├── extractResponseText(data)      ← reads response from either format
├── parseRetryDelay(body)          ← existing, Gemini-specific
├── parseRetryAfterHeader(resp)    ← new, OpenRouter-specific
│
├── generateResponse()             ← uses buildRequest + extractResponseText
│   └── buildConversationMessages()  ← unchanged, Gemini format (translated by buildRequest)
├── generateCallSummary()          ← uses buildRequest + extractResponseText
│
├── generateEmbedding()            ← always Gemini (unchanged)
└── generateEmbeddings()           ← always Gemini (unchanged)
```

Embeddings are untouched. The `EMBEDDING_MODEL` constant and Gemini embedding URLs are completely separate from the adapter path.

### Technical Decisions

- **One adapter method, not two**: `buildRequest(options)` handles both suggestions and summaries. The parameters that vary (tokens, temperature, system prompt, JSON mode) are passed as options. This avoids code duplication.
- **`this.model` stays Gemini-only**: The existing `model` property (`'gemini-2.5-flash'`) is only used in Gemini URLs. OpenRouter model ID is a separate `openrouterModel` property, used in the request body. No conflict.
- **Adapter pattern over abstraction**: Format translation inside the existing class, not an abstract interface with multiple implementations. Sufficient for two providers.
- **Gemini key always required for KB**: KB embeddings use Gemini's embedding API directly. If OpenRouter is selected but Gemini key is missing, session starts with a warning and KB is unavailable.
- **Curated model list over dynamic fetch**: 6 popular models hardcoded, plus custom model ID input. No extra API call.
- **Session-scoped config**: `loadProviderConfig()` caches config at session start. Per-call storage reads removed. Settings take effect on next session.
- **Dynamic host permissions**: `chrome.permissions.request()` at runtime, not static `host_permissions`. Follows LangBuilder pattern. Grants extension-wide (service worker included).

### Dependencies

- **OpenRouter API**: `https://openrouter.ai/api/v1/chat/completions` — OpenAI-compatible chat completions
- **OpenRouter auth**: `Authorization: Bearer {key}` header + `HTTP-Referer` and `X-Title` for app identification
- **OpenRouter models endpoint**: `GET https://openrouter.ai/api/v1/models` — for API key validation
- **Runtime host permission**: `chrome.permissions.request({ origins: ['https://openrouter.ai/*'] })` via `optional_host_permissions` wildcard
- No new npm packages — all calls use native `fetch()`

### Out of Scope

- Streaming responses (token-by-token display)
- Per-persona model selection
- Automatic failover between providers
- Embedding model switching (would require KB re-index)
- Cost tracking or token usage display
- OpenRouter OAuth (API key auth only)
- Class rename from `GeminiClient` to `LLMClient` (cosmetic, can be done anytime)
