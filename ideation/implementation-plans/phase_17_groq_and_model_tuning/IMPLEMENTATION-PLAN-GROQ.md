# Implementation Plan: Groq LLM Provider (Phase 17)

---

## Executive Summary

Add Groq as a third LLM provider for Wingman AI. Groq runs open-source models on custom LPU hardware, delivering 3-10x faster inference than Gemini or OpenAI at lower cost. The API is OpenAI-compatible — the same format we already use for OpenRouter — so integration is lightweight. Users get a new "Groq" option in the provider selector, configure their API key, pick a model, and get significantly faster suggestions during calls.

**Key Outcomes:**
- Fastest suggestion delivery of any provider (400-840 tokens/second)
- Cheapest per-token cost (Llama 4 Scout: $0.11/$0.34 per 1M tokens)
- Free tier available (30 RPM, no credit card) for casual users
- Gemini key becomes optional for users who don't use Knowledge Base
- Model-aware prompt tuning ensures personas perform well across all model families

---

## Product Manager Review

### Feature Overview

This phase adds Groq as a third LLM provider alongside Gemini (Direct) and OpenRouter, plus a model-aware prompt tuning system that optimizes persona prompts for the active model. The provider integration reuses the existing OpenAI-compatible code path. The prompt tuning addresses a real problem: prompts written for Gemini lose up to 30% effectiveness when used on Llama or Qwen without adaptation.

### Features

#### Feature 1: Groq Provider Selection

**What it is:** A new "Groq" option in the Options page API Keys section, with its own API key input, test button, and model dropdown.

**Why it matters:** Groq's LPU hardware delivers the fastest inference available. Sales reps get suggestions faster, which matters in live calls where seconds count.

**User perspective:** User goes to Options > API Keys, selects "Groq", pastes their API key from console.groq.com, picks a model (default: Llama 4 Scout), and saves. Suggestions now come through Groq.

---

#### Feature 2: Groq Request Routing in LLM Client

**What it is:** A new branch in `buildRequest()` that sends chat completions to Groq's OpenAI-compatible endpoint instead of Gemini or OpenRouter.

**Why it matters:** Reuses the existing OpenAI-compatible format (same as OpenRouter), so no new response parsing or error handling patterns are needed.

**User perspective:** Invisible to the user. Suggestions and call summaries work identically regardless of provider — just faster with Groq.

---

#### Feature 3: Optional Gemini Key for Non-KB Users

**What it is:** When Groq (or OpenRouter) is the active provider and the user has no KB documents, the Gemini API key is no longer mandatory.

**Why it matters:** Lowers the barrier to entry. Users who just want fast suggestions don't need to create a Google AI Studio account and get a Gemini key.

**User perspective:** User configures Deepgram + Groq keys only. Session starts. If they later want KB features, the Options page prompts them to add a Gemini key.

---

#### Feature 4: Model-Aware Prompt Tuning

**What it is:** A system that adapts persona system prompts to work optimally with the active model. Users control it via a three-way toggle in the Transcription/AI settings: Off, Optimize Once, or Auto.

**Why it matters:** Different models handle prompts very differently. Llama models need few-shot examples and stronger silence enforcement. Qwen needs a `/no_think` flag for fast responses. Claude prefers XML tags. GPT-4o fights the "stay silent" instruction. A prompt written for Gemini can lose ~30% effectiveness on Llama without adaptation. This feature fixes that automatically.

**User perspective:** Three modes:
- **Off** — Prompts are sent exactly as written. For users who hand-craft their prompts and don't want interference.
- **Optimize Once** — User clicks a button in persona settings. The system applies model-specific tweaks to the prompt text and saves it. User can review and edit the result. One-time transformation.
- **Auto** (recommended) — At session start, the system silently injects model-specific tweaks around the user's prompt without modifying the saved version. The user's original prompt is never changed. Tweaks are applied in-memory only.

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
| [x] | 1 | Add Groq to LLM config types and constants | 14:52 | 14:55 | 3 | 20 | 6.7x |
| [x] | 2 | Verify Groq model IDs against live API | 14:52 | 15:14 | 22 | 15 | 0.7x |
| [x] | 3 | Add Groq permission to manifest | 14:55 | 14:56 | 1 | 10 | 10x |
| [x] | 4 | Add Groq branch to LLM client (all methods) | 14:56 | 15:06 | 10 | 60 | 6x |
| [x] | 5 | Update service worker session validation for Groq | 15:06 | 15:12 | 6 | 30 | 5x |
| [x] | 6 | Add Groq UI to Options page HTML | 15:12 | 15:18 | 6 | 25 | 4.2x |
| [x] | 7 | Add Groq logic to API keys section | 15:18 | | | | |
| [ ] | 8 | Update popup API key check and provider label | | | | | |
| [ ] | 9 | Make Gemini key optional for non-KB users | | | | | |
| [ ] | 10 | Define model tuning profiles | | | | | |
| [ ] | 11 | Implement prompt tuning engine and settings toggle | | | | | |
| [ ] | 12 | Build and verify TypeScript compiles | | | | | |

**Summary:**
- Total tasks: 12
- Completed: 0
- Total time spent: 0 minutes
- Total human estimate: 0 minutes
- Overall multiplier: —

---

## Task Descriptions

This section provides context for each task. Read the relevant description before starting implementation.

---

### Task 1: Add Groq to LLM Config Types and Constants

**Intent:** Extend the shared LLM config to recognize Groq as a valid provider with all necessary types and constants.

**Context:** `llm-config.ts` defines the `LLMProvider` type union, `PROVIDER_COOLDOWNS` map, `ProviderConfig` interface, and `PROVIDER_STORAGE_KEYS` array. All of these need Groq entries. This is the foundation — everything else depends on it.

**Expected behavior:**
- `LLMProvider` union includes `'groq'`
- `PROVIDER_COOLDOWNS` maps `groq` to `2000`
- `ProviderConfig` interface gains `groqApiKey?: string` and `groqModel: string`
- `DEFAULT_PROVIDER_CONFIG` gains `groqModel: 'llama-4-scout-17b-16e-instruct'` (pending Task 2 verification)
- `PROVIDER_STORAGE_KEYS` includes `'groqApiKey'` and `'groqModel'`
- New `GROQ_MODELS` array (same shape as `OPENROUTER_MODELS`) with curated model list
- New `GROQ_API_BASE` constant: `'https://api.groq.com/openai/v1'`

**Key components:**
- `src/shared/llm-config.ts`

**Notes:** TypeScript will flag every file that switches on `LLMProvider` — that's expected and helps find all the spots that need updating. Model labels should be user-friendly: "Llama 4 Scout — Fast & Balanced (recommended)", "Llama 3.3 70B — Highest Quality", etc.

---

### Task 2: Verify Groq Model IDs Against Live API

**Intent:** Confirm the exact model ID strings Groq's API expects.

**Context:** The ideation doc lists model IDs in OpenRouter format (e.g., `meta-llama/llama-4-scout-17b-16e-instruct`). Groq uses its own ID format (e.g., `llama-3.3-70b-versatile`). Using wrong IDs will silently fail.

**Expected behavior:** Call `GET https://api.groq.com/openai/v1/models` (or check docs) and record the exact IDs for:
- Llama 4 Scout
- Qwen3 32B
- Llama 3.3 70B Versatile
- Llama 3.1 8B Instant

Update the `GROQ_MODELS` array in Task 1 with the verified IDs.

**Key components:**
- `src/shared/llm-config.ts` (update model IDs if needed)

**Notes:** This can be done via a quick `curl` to the Groq models endpoint or by checking console.groq.com/docs/models. Do this before Task 4 (Options HTML) to avoid hardcoding wrong IDs in the dropdown.

---

### Task 3: Add Groq Permission to Manifest

**Intent:** Allow the service worker to make fetch requests to Groq's API.

**Context:** OpenRouter uses runtime permission requests via `chrome.permissions.request()` with the wildcard `optional_host_permissions`. For consistency, Groq should follow the same pattern rather than being added to static `host_permissions`. This avoids triggering a Chrome permission prompt on extension update for users who don't use Groq.

**Expected behavior:**
- Do NOT add `https://api.groq.com/*` to static `host_permissions`
- Groq permission is requested at runtime in `api-keys.ts` (Task 7) via `chrome.permissions.request()`, same as OpenRouter
- The existing `optional_host_permissions: ["*://*/*"]` already covers this

**Key components:**
- `manifest.json` — verify no changes needed (wildcard optional permission already exists)
- `src/options/sections/api-keys.ts` — add `ensureGroqPermission()` (covered in Task 7)

**Notes:** This is a departure from the original plan which said to add static `host_permissions`. The runtime approach is better because: (a) no update prompt for non-Groq users, (b) consistent with the OpenRouter pattern.

---

### Task 4: Add Groq Branch to LLM Client (All Methods)

**Intent:** Route suggestion and summary requests through Groq's API when it's the active provider.

**Context:** `gemini-client.ts` has multiple methods that branch on `this.provider`. The original plan only mentioned `buildRequest()` and `loadProviderConfig()`, but the code review found **8 locations** that need Groq handling:

1. **`loadProviderConfig()`** — read `groqApiKey` and `groqModel` from storage
2. **`startSession()` / `clearSession()`** — reset `groqApiKey` and `groqModel` to defaults (prevent stale key leaks between sessions)
3. **`generateResponse()` line 290** — API key guard uses a two-way ternary (`openrouter ? openrouterKey : geminiKey`). Groq falls through to geminiKey (wrong).
4. **`getApiKey()` line 630** — only handles `gemini` and falls through to `openrouterApiKey`. Groq falls through to openrouterApiKey (wrong).
5. **`buildRequest()` line 450** — ANOTHER key lookup ternary for URL construction (Gemini puts key in URL query param, OpenRouter uses Bearer header). Groq falls through to Gemini URL format (wrong).
6. **`buildRequest()`** — add Groq branch (reuse OpenRouter body format, different URL and headers)
7. **`extractResponseText()` line 527** — checks `provider === 'openrouter'` specifically. Groq falls through to Gemini response parsing (wrong — Groq returns OpenAI format). Must change to `provider !== 'gemini'` or add explicit Groq case.
8. **`parseRetrySeconds()` line 425** — only branches on `openrouter`, falls through to Gemini body parsing for everything else. Groq uses `Retry-After` header (same as OpenRouter).

**Expected behavior:**
- `loadProviderConfig()` reads `groqApiKey` and `groqModel` from storage
- `startSession()` and `clearSession()` reset `this.groqApiKey = null` and `this.groqModel` to default
- `generateResponse()` picks the correct API key for all 3 providers
- `getApiKey()` returns `this.groqApiKey` when provider is `'groq'`
- `buildRequest()` line 450 key lookup returns Groq key (not Gemini key)
- `buildRequest()` produces requests to `https://api.groq.com/openai/v1/chat/completions` with `Authorization: Bearer <key>` (no `HTTP-Referer` / `X-Title` headers — those are OpenRouter-specific)
- **`extractResponseText()` handles Groq** — uses the OpenAI path (`choices[0].message.content`), NOT the Gemini path. Easiest fix: change `=== 'openrouter'` to `!== 'gemini'` so both OpenRouter and Groq share the OpenAI extraction.
- `parseRetrySeconds()` uses header-based parsing for both `openrouter` and `groq`
- Debug log in `loadProviderConfig()` shows groq model when active

**Refactoring suggestion:** The key lookup pattern (`provider === 'openrouter' ? openrouterKey : geminiKey`) appears in **3 separate places** (lines 290, 450, 638). Extract a single `getProviderApiKey()` method that returns the right cached key for the active provider. This prevents the bug where adding a new provider requires finding and updating 3 ternaries. The same "is this an OpenAI-compatible provider?" check appears in `extractResponseText()`, `parseRetrySeconds()`, and `buildRequest()` — consider a helper `isOpenAICompatible()` that returns true for both OpenRouter and Groq.

**Key components:**
- `src/services/gemini-client.ts`

**Notes:** The `extractResponseText()` bug is subtle and would cause silent failures — Groq responses would be parsed as Gemini format, find no `candidates[0].content.parts[0].text`, and return null. Suggestions would silently stop working with no error logged (just "Empty response from LLM").

---

### Task 5: Update Service Worker Session Validation for Groq

**Intent:** Allow sessions to start with a Groq API key and generate summaries without a Gemini key.

**Context:** The original plan said "No service worker changes." This is wrong. The service worker has two hardcoded Gemini key gates:

1. **Session start (line 207-222):** Checks `provider === 'openrouter'` and falls through to require Gemini key. A Groq user would be blocked: "Gemini API key not configured."
2. **Session start storage.get (line 192-198):** Only reads `'groqApiKey'` is missing from the storage.get keys — need to add it so it's available for validation.
3. **Summary generation (line 489):** `if (!storage.geminiApiKey)` skips summaries entirely. A Groq-only user would never get call summaries.
4. **Summary storage.get (line 474-482):** Only reads `'geminiApiKey'`. Needs to also read `'groqApiKey'`, `'openrouterApiKey'`, and `'llmProvider'` so it can check the active provider's key.

**Expected behavior:**
- Session start reads `groqApiKey` from storage and validates it when provider is `'groq'`
- Summary generation checks the active provider's key, not hardcoded `geminiApiKey`
- KB search gracefully skips if no Gemini key is present (already works — verified in code: `generateEmbedding()` → `getApiKey('gemini')` → throws ENOKEY → caught at kb-search.ts line 55 → returns empty results → `getKBContext()` returns `matched: false` → suggestion proceeds without KB)

**Key components:**
- `src/background/service-worker.ts`

**Notes:** This is the task the original plan missed entirely. Without it, Groq users can't start sessions or get summaries. The fix is straightforward — replace the two-way provider check with a three-way check (or a key lookup map keyed by provider). For summaries, refactor the hardcoded `!storage.geminiApiKey` to check the active provider's key instead.

---

### Task 6: Add Groq UI to Options Page HTML

**Intent:** Add the Groq provider option, API key input, model dropdown, and test button to the Options page.

**Context:** The Options page already has radio buttons for Gemini and OpenRouter with show/hide sections. Groq follows the same pattern.

**Expected behavior:**
- New radio button: `<input type="radio" name="llm-provider" value="groq">` with label "Groq"
- Helper text under the radio label: "Ultra-fast open-source AI — free tier at groq.com"
- Groq section (hidden by default) containing:
  - API key input (`id="groq-api-key"`) with paste-friendly styling and visibility toggle
  - Model dropdown (`id="groq-model"`) with curated options using user-friendly labels:
    - Llama 4 Scout — Fast & Balanced (recommended) [default]
    - Qwen3 32B — Strong Reasoning
    - Llama 3.3 70B — Highest Quality
    - Llama 3.1 8B — Ultra Fast, Basic
  - Test button (`id="test-groq"`)
- When Gemini key section is visible for non-Gemini providers, show helper: "Required for Knowledge Base features"

**Key components:**
- `src/options/options.html`

**Notes:** Follow the existing OpenRouter section as a template for HTML structure and CSS classes. Model IDs come from Task 2 verification. Model labels should help non-technical users pick the right one — avoid jargon like "17Bx16E" or "MoE."

---

### Task 7: Add Groq Logic to API Keys Section

**Intent:** Wire up the Groq UI elements — save/load keys, toggle visibility, test connection, runtime permissions.

**Context:** `api-keys.ts` handles provider radio toggle, key persistence, and test button logic. Groq follows the same patterns as OpenRouter.

**Expected behavior:**
- Add `groqInput`, `groqModelSelect`, `groqSection` element references
- Selecting "Groq" radio shows the Groq section, hides OpenRouter and Gemini-as-provider sections
- Gemini key input stays visible (relabeled as "For Knowledge Base") when a non-Gemini provider is active — this requires splitting the current `geminiSection` into "Gemini as provider" vs "Gemini for embeddings" OR always showing the Gemini key input with contextual labeling
- Add `ensureGroqPermission()` method (same pattern as `ensureOpenRouterPermission()` — requests `https://api.groq.com/*` at runtime)
- API key and model saved to `groqApiKey` and `groqModel` in `chrome.storage.local`
- `save()` includes Groq fields in the storage payload
- `load()` populates Groq fields from storage on page init
- Test button calls `GET https://api.groq.com/openai/v1/models` with Bearer auth
- `updateStatus()` handles all 3 providers for status dot and label
- `updateProviderUI()` handles all 3 providers for section show/hide

**Key components:**
- `src/options/sections/api-keys.ts`

**Notes:** The current `updateProviderUI()` uses a simple two-way show/hide. With 3 providers, consider a loop or map pattern instead of nested if/else. The Gemini section visibility is the trickiest part — it needs to be visible as a "provider section" when Gemini is active, and as an "embeddings key" section when another provider is active.

---

### Task 8: Update Popup API Key Check and Provider Label

**Intent:** The popup's status indicators should recognize Groq and show which provider is active.

**Context:** `popup.ts` checks `chrome.storage.local` for the active provider's API key. Currently it only checks `geminiApiKey` or `openrouterApiKey`. Also, the popup currently shows "Configured" / "Not Configured" without indicating which provider is active.

**Expected behavior:**
- `checkApiKeys()`: when `llmProvider` is `'groq'`, check for `groqApiKey`
- Read `groqApiKey` from storage in the `chrome.storage.local.get()` call
- Status dot turns green when Deepgram + active provider's key are present
- Show active provider name in status text: "Configured (Groq)" instead of just "Configured"

**Key components:**
- `src/popup/popup.ts`

**Notes:** The provider label in the status text is a UX improvement surfaced by the review — without it, users can't tell which provider is running without opening Options.

---

### Task 9: Make Gemini Key Optional for Non-KB Users

**Intent:** Allow sessions to start without a Gemini API key when the user doesn't use Knowledge Base features.

**Context:** Currently, Gemini key is always required. Multiple places enforce this:
- `popup.ts` `checkApiKeys()` — requires Gemini key for all providers
- `service-worker.ts` session start — requires Gemini key when provider is not OpenRouter
- `service-worker.ts` summary generation — skips if no Gemini key
- `api-keys.ts` `save()` validation — requires Gemini key when provider is Gemini

The service worker gates are handled in Task 5. This task handles the remaining UI and KB guardrails.

**Expected behavior:**
- Popup: requires Deepgram key + active provider key only. Gemini key not mandatory.
- Options `save()`: only require Gemini key when Gemini is the active provider
- KB upload: if no Gemini key is set, show error "Gemini API key required for Knowledge Base" and block the upload
- KB search in gemini-client: if `getApiKey('gemini')` throws `ENOKEY`, catch and skip KB silently (already partially handled, verify)
- Options: Gemini key helper text says "Required for Knowledge Base features" when another provider is active

**Key components:**
- `src/popup/popup.ts`
- `src/options/options.html`
- `src/options/sections/api-keys.ts`
- `src/options/sections/personas.ts` (KB upload guard)
- `src/services/gemini-client.ts` (verify KB graceful degradation)

**Notes:** This is the most cross-cutting task. The critical test: configure only Deepgram + Groq, start a session, verify suggestions work AND KB search doesn't crash. Then verify summaries generate correctly through Groq (not skipped due to missing Gemini key).

---

### Task 10: Define Model Tuning Profiles

**Intent:** Create a data structure that captures the known prompt-handling differences between model families, so the tuning engine (Task 11) has something to work with.

**Context:** Research found these concrete differences across model families:

| Aspect | Gemini | Claude | GPT-4o | Llama | Qwen |
|---|---|---|---|---|---|
| Ideal temperature | 0.3 | 0.3 | 0.3 | 0.5+ | 0.5-0.7 |
| Silence enforcement | Default `---` works | Add "why" context | Needs strong "do not explain" | Needs few-shot example + explicit permission | Needs explicit permission |
| Prompt structure | Markdown | XML tags preferred | Markdown | Few-shot + delimiters | Explicit format constraints |
| Special flags | None | None | None | None | `/no_think` for speed, `/think` for summaries |
| JSON reliability | High | Medium (fencing) | High (needs "JSON" in prompt) | Mixed (Llama 4 issues) | Medium |

Each model available in the extension (across all providers) maps to one of these families.

**Expected behavior:**
- New file `src/shared/model-tuning.ts` containing:
  - `ModelFamily` type: `'gemini' | 'claude' | 'gpt' | 'llama' | 'qwen'`
  - `MODEL_FAMILY_MAP`: maps each model ID (from all providers) to its `ModelFamily`
  - `ModelTuningProfile` interface with fields:
    - `suggestionTemperature: number` — optimal temperature for suggestion calls only
    - `silenceReinforcement: string` — extra text to append about the `---` convention
    - `conversationSilenceHint?: string` — adapted text for the hardcoded silence lines in `buildConversationMessages()` (see Notes)
    - `promptPrefix?: string` — text prepended to system prompt (e.g., Qwen `/no_think`)
    - `promptSuffix?: string` — text appended to system prompt
    - `summaryPromptPrefix?: string` — text prepended to the standalone summary prompt string (e.g., Qwen `/think`)
    - `summaryJsonHint?: string` — extra text injected before the "Return ONLY valid JSON" line in `buildSummaryPrompt()` output
    - `jsonHint?: string` — extra text to ensure JSON compliance for non-summary calls
  - `MODEL_TUNING_PROFILES: Record<ModelFamily, ModelTuningProfile>` — the actual profiles
- Storage key: `promptTuningMode` with values `'off' | 'once' | 'auto'`, default `'auto'`

**Key components:**
- `src/shared/model-tuning.ts` (new file)

**Notes:** The profiles are static data — no API calls, no AI. They encode what the research found about each model family's quirks. The `MODEL_FAMILY_MAP` needs to cover every model ID in `OPENROUTER_MODELS` and `GROQ_MODELS`, plus the default Gemini model. Unknown models default to a neutral profile (no tweaks).

**Critical design decisions from code review:**

1. **Temperature is split between suggestions and summaries.** The profile defines `suggestionTemperature` only. Summary generation uses a hardcoded `temperature: 0.2` (gemini-client.ts line 754) that must NOT be overridden — low temperature is critical for consistent JSON output. The old field name `temperature` was misleading because it implied global override.

2. **Summary prompt is standalone — not a system prompt.** `buildSummaryPrompt()` (call-summary.ts) returns a single self-contained prompt string, not a system prompt + messages pattern. The old `summaryPrefix` field implied prepending to a system prompt, but the tuning actually needs to inject into the standalone prompt. Renamed to `summaryPromptPrefix` (prepended to the whole prompt string) and `summaryJsonHint` (injected before the "Return ONLY valid JSON" closing line).

3. **`buildConversationMessages()` has hardcoded silence text** that `silenceReinforcement` (system prompt only) doesn't touch:
   - Line 583: model turn says `"...respond with --- if I should stay silent."`
   - Line 594: user turn says `"Should I provide a suggestion, or stay silent (---)?"`
   These are in user/model message turns, not the system prompt. The `conversationSilenceHint` field provides model-adapted versions of these hardcoded strings. For Gemini, this is null (keep as-is). For Llama, it would include the few-shot silence example inline.

Example profiles:

**Llama profile:**
```
suggestionTemperature: 0.5
silenceReinforcement: "If you have nothing valuable to add, you MUST respond with exactly three hyphens: ---. This is not optional. Do NOT add explanations or caveats when staying silent. Here is an example of correct silence:\nUser: [Speaker 1]: Sounds good, let me check my calendar.\nAssistant: ---"
conversationSilenceHint: "Should I provide a suggestion, or stay silent (---)? Remember: if you stay silent, respond with ONLY --- and nothing else."
promptPrefix: null
promptSuffix: null
summaryPromptPrefix: null
summaryJsonHint: "You MUST respond with raw JSON only. No markdown fencing. No text before or after the JSON object."
jsonHint: "You MUST respond with raw JSON only. No markdown fencing. No text before or after the JSON object."
```

**Qwen profile:**
```
suggestionTemperature: 0.6
silenceReinforcement: "You are allowed to stay silent. If you have nothing useful to add, respond with exactly: ---"
conversationSilenceHint: null
promptPrefix: "/no_think\n"
promptSuffix: null
summaryPromptPrefix: "/think\n"
summaryJsonHint: "Respond only in raw JSON. No extra text or explanations."
jsonHint: "Respond only in raw JSON. No extra text or explanations."
```

---

### Task 11: Implement Prompt Tuning Engine and Settings Toggle

**Intent:** Build the runtime that applies tuning profiles to prompts, and add the user-facing toggle.

**Context:** The tuning engine sits between the user's saved persona prompt and what gets sent to the API. It has three modes controlled by a setting in Options:

- **Off**: prompt sent as-is, default temperature used
- **Once**: user clicks "Optimize for [Model]" in persona editor, system rewrites the saved prompt with model-specific adaptations (destructive — modifies the saved prompt)
- **Auto** (default): at session start, tuning is applied in-memory. The saved prompt is never modified. Tweaks wrap around the user's original text.

**Expected behavior:**

*Settings UI:*
- New toggle in Options page (Transcription/AI section or its own "AI Tuning" subsection)
- Three-option radio or segmented control: Off | Optimize Once | Auto (recommended)
- Helper text: "Adapts your persona prompts to work best with your selected AI model"
- Stored in `chrome.storage.local` as `promptTuningMode`

*Auto mode (runtime injection):*
- In `gemini-client.ts`, tuning is applied at two distinct injection points:

  **Injection Point A — Suggestions (system prompt + conversation messages):**
  1. Look up the active model's family via `MODEL_FAMILY_MAP`
  2. Get the `ModelTuningProfile` for that family
  3. If tuning is `'auto'`:
     - Override `this.temperature` with `profile.suggestionTemperature` (NOT for summaries — see below)
     - Prepend `promptPrefix` to the system prompt (if set)
     - Append `silenceReinforcement` to the system prompt
     - Append `promptSuffix` to the system prompt (if set)
     - In `buildConversationMessages()`: if `conversationSilenceHint` is set, replace the hardcoded silence text at line 583 (model turn) and line 594 (user turn) with the profile's adapted versions
  4. If tuning is `'off'`: send as-is

  **Injection Point B — Summary generation (`generateCallSummary()`):**
  1. Get the same profile
  2. If tuning is `'auto'`:
     - Prepend `summaryPromptPrefix` to the prompt string returned by `buildSummaryPrompt()` (e.g., Qwen `/think`)
     - Inject `summaryJsonHint` before the closing "Return ONLY valid JSON" line in the prompt
     - **Do NOT override temperature** — summary always uses 0.2 for consistent JSON output
  3. If tuning is `'off'`: send as-is

- The user's saved `systemPrompt` in storage is never modified
- Applied fresh each session in `loadProviderConfig()` or at prompt-send time

*Optimize Once mode (persona editor):*
- In the persona editor (Options > Personas), when tuning mode is `'once'`:
  - Show a button: "Optimize for [Model Name]" below the system prompt textarea
  - On click: apply the profile's transformations to the prompt text and write it into the textarea
  - User can review, edit, then save
  - This is a one-time rewrite — it modifies the saved prompt permanently
  - Show a confirmation toast: "Prompt optimized for Llama 4 Scout"

*What gets applied (Auto mode example for Llama):*
```
Original saved prompt:
  "You are a sales assistant. Help the rep close deals. Stay silent (---) if nothing to add."

What gets sent to API:
  "/no_think                          ← promptPrefix (if Qwen)
   You are a sales assistant. Help the rep close deals. Stay silent (---) if nothing to add.
                                       ← original prompt unchanged
   If you have nothing valuable to add, you MUST respond with exactly three hyphens: ---.
   This is not optional. [few-shot example...]
                                       ← silenceReinforcement
  "
Temperature: 0.5 (from profile, overriding default 0.3)
```

**Key components:**
- `src/shared/model-tuning.ts` (read profiles from Task 10)
- `src/services/gemini-client.ts` (apply tuning at send time)
- `src/options/options.html` (toggle UI)
- `src/options/sections/transcription.ts` or new `src/options/sections/ai-tuning.ts` (toggle logic)
- `src/options/sections/personas.ts` ("Optimize Once" button in persona editor)

**Notes:**
- Auto mode must never persist changes to the user's prompt — all modifications are in-memory only
- The "Optimize Once" button should be grayed out when tuning is set to "Auto" (redundant) or "Off" (user doesn't want tuning)
- If the user switches models after running "Optimize Once", the prompt won't re-adapt — that's expected and acceptable. A subtle warning "Prompt was optimized for Llama 4 Scout, you're now using Qwen3 32B" would be a nice touch but not required for v1
- The Gemini profile should be a no-op (empty strings, same temperature) so Auto mode does nothing when Gemini is active — preserving current behavior exactly

**Critical implementation details from code review:**
- **Summary temperature must be protected.** `generateCallSummary()` hardcodes `temperature: 0.2` (line 754). Auto mode must NOT override this — high temperature causes inconsistent JSON. Only `suggestionTemperature` from the profile is applied, and only to suggestion calls.
- **Summary prompt injection requires string surgery.** `buildSummaryPrompt()` returns a self-contained string ending with `"Return ONLY valid JSON..."`. The `summaryPromptPrefix` goes at the top. The `summaryJsonHint` gets injected just before the closing JSON instruction line. Consider adding a parameter to `buildSummaryPrompt()` for this, or doing a string replace in `generateCallSummary()`.
- **Conversation silence text lives in TWO places.** The system prompt gets `silenceReinforcement`, but `buildConversationMessages()` also has hardcoded silence text in the model acknowledgment (line 583) and user prompt (line 594). The `conversationSilenceHint` field handles this — inject it by parameterizing those strings instead of hardcoding them.
- **"Optimize Once" can only handle system prompt tweaks.** It cannot rewrite the hardcoded conversation messages or the summary prompt — those are code, not user data. This is fine: "Optimize Once" rewrites the persona's `systemPrompt` field only. The conversation message and summary tweaks are only available in Auto mode (runtime injection).

---

### Task 12: Build and Verify TypeScript Compiles

**Intent:** Ensure the full build passes with no TypeScript errors.

**Context:** Final validation step. Run `npm run build` and fix any type errors or missing branches.

**Expected behavior:** `npm run build` exits cleanly. No TypeScript errors. Extension loads in Chrome without errors.

**Key components:**
- All modified files

**Notes:** Pay attention to exhaustive switch/case checks on `LLMProvider` — TypeScript's `noFallthroughCasesInSwitch` and strict mode will catch any missed branches. Also verify the `transcription.ts` section still loads the correct provider-aware cooldown default for Groq. Verify that Auto tuning mode produces no visible change when Gemini is the active provider (backwards-compatible).

---

## Appendix

### Technical Decisions

1. **Adapter approach (not separate class):** Groq reuses the existing `buildRequest()` branching in `GeminiClient` rather than introducing a new client class. Since Groq's format is identical to OpenRouter, a new class would be over-engineering. However, the shared OpenAI-compatible body construction should be extracted into a helper to avoid duplication.

2. **Curated model list (not full catalog):** Groq hosts ~20 models. We pick 4 that make sense for real-time sales coaching. Users can't enter custom model IDs (unlike OpenRouter) because Groq's catalog is small and stable enough to curate. Model labels are user-friendly, not technical.

3. **2-second cooldown default:** Groq's free tier allows 30 RPM. Even with 2s cooldown (max 30 req/min), we stay within limits. Developer tier is more generous.

4. **Runtime permission (not static):** Groq host permission is requested at runtime like OpenRouter, using the existing wildcard `optional_host_permissions`. This avoids Chrome's update permission prompt for users who don't use Groq.

5. **Key lookup refactoring:** Replace scattered ternary expressions (`provider === 'openrouter' ? openrouterKey : geminiKey`) with a centralized `getProviderApiKey()` method. This prevents the pattern from becoming a three-way ternary that will break when a fourth provider is added.

6. **Model tuning is data-driven, not AI-powered:** The tuning profiles are static config objects — not LLM-generated rewrites. This means they're predictable, instant, and free. The "Optimize Once" mode does a deterministic text transformation, not a creative AI rewrite. This avoids the risk of an LLM changing the prompt's intent.

7. **Auto mode never modifies saved prompts:** The tuning is applied in-memory at send time. If the user exports a persona, they get their original untouched prompt. If they turn off tuning, the prompt reverts to exactly what they wrote. No data loss risk.

8. **Gemini profile is a no-op:** When Gemini is the active provider, Auto tuning produces zero changes — same temperature, no prefix/suffix. This guarantees backwards-compatible behavior for existing users.

### Review Findings — Addressed in Plan

These gaps were found during senior engineer + user review and are now covered:

| Finding | Original Plan | Updated Plan |
|---------|--------------|--------------|
| `getApiKey()` doesn't handle Groq | Not mentioned | Task 4 |
| `generateResponse()` hardcodes two-way key ternary | Not mentioned | Task 4 |
| `parseRetrySeconds()` falls through to Gemini for non-OpenRouter | Not mentioned | Task 4 |
| `startSession()`/`clearSession()` don't reset Groq state | Not mentioned | Task 4 |
| `ProviderConfig` and `PROVIDER_STORAGE_KEYS` incomplete | Not mentioned | Task 1 |
| Service worker session start blocks Groq users | "No service worker changes" | Task 5 (new) |
| Summary generation skips for non-Gemini users | Not mentioned | Task 5 (new) |
| Groq model IDs use OpenRouter format (wrong) | Wrong IDs in Task 4 | Task 2 (new) |
| Permission pattern inconsistent with OpenRouter | Static `host_permissions` | Task 3 (runtime) |
| `updateProviderUI()` hides Gemini for non-Gemini providers | Not mentioned | Task 7 |
| Users don't know what Groq is | No help text | Task 6 |
| No provider indicator in popup | Not mentioned | Task 8 |
| Model labels are meaningless to non-technical users | Technical labels | Task 6 |
| Summary temperature (0.2) would be overridden by model tuning | `temperature` field applied globally | Split into `suggestionTemperature` only; summary keeps 0.2 |
| Summary prompt is standalone string, not system prompt | `summaryPrefix` implies system prompt injection | Renamed to `summaryPromptPrefix` + `summaryJsonHint` with string injection |
| `buildConversationMessages()` has hardcoded silence text | `silenceReinforcement` only in system prompt | Added `conversationSilenceHint` for conversation turn injection |
| "Optimize Once" can't touch conversation messages or summary | Not mentioned | Documented: Only Auto mode handles runtime injection points |
| Cooldown slider doesn't warn on provider switch | Out of scope | Out of scope (noted below) |

### Known Limitations (Not Addressed)

- **Cooldown slider doesn't auto-adapt on provider switch:** If a user sets 2s cooldown with Groq, then switches to Gemini, the 2s value persists. The minimum floor in `loadProviderConfig()` will override it at session start, but the Options slider still shows the old value. Acceptable for v1.
- **Provider switch mid-session has no warning:** Config is cached at session start. Options page doesn't warn that changes take effect on next session. Acceptable for v1 — power users will figure this out.
- **Three provider sections add visual complexity to Options page:** A dropdown would be cleaner than radio buttons, but radios match the existing pattern. Revisit if a fourth provider is added.

### Dependencies

- Groq API key from [console.groq.com](https://console.groq.com) (free account, no credit card for free tier)
- Deepgram API key (unchanged)
- Gemini API key (optional — only needed for KB features)

### Out of Scope

- Streaming responses (would enable real-time token display — future phase)
- Per-persona model selection (each persona could specify its preferred model/provider)
- Automatic failover between providers
- Embedding model switching (would require full KB re-index)
- Groq audio transcription (they offer Whisper, but we use Deepgram)
- Custom model ID input (Groq's catalog is small enough to curate)
- Auto-adapting cooldown slider on provider switch
- Mid-session provider switch warning
- AI-powered prompt rewriting (using the LLM to rewrite prompts — too risky for v1)
- Per-persona tuning mode (global setting applies to all personas)
- "Prompt was optimized for X, you're now using Y" warning on model switch
