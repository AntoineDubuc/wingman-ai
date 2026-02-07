# Implementation Plan: Persona Prompt Setup Assistant (Phase 24)

---

## Executive Summary

Add an AI-powered Prompt Setup Assistant to the persona editor that helps users create, test, and iterate on system prompts — tailored per-model for all 11 supported LLMs. A guided chat discovers intent, generates model-optimized prompts, and an optional test harness validates silence behavior and KB integration via real API calls. Full version history with diffs, restore, and delete. Everything runs client-side using the user's existing API keys (BYOK).

**Key Outcomes:**
- Guided chatbot generates per-model system prompts from user requirements
- Test harness validates prompts (silence, responses, KB citation) before saving
- Per-model prompt optimization: XML tags for Claude, numbered lists for Llama, `/no_think` for Qwen, etc.
- Full version history with diffs, restore, and delete
- Template-aware: recognizes when user needs match a built-in persona template
- KB-aware: detects attached documents and generates KB usage instructions
- A/B comparison between prompt versions

**Cost Impact:** ~$0.001 per discovery chat, ~$0.01-0.05 per test run (depends on question count and model)

---

## Styling Mandate

> **All UI must follow the existing options page design system — NOT the mockup's inline styles.**
>
> The mockup HTML (`mock-prompt-setup-assistant.html`) is the source of truth for **layout, components, and functionality**. But its styling is ad-hoc inline CSS. All implementation styling must:
>
> 1. Use CSS custom properties from `options.css` (e.g., `var(--color-primary)`, `var(--color-bg-surface)`, `var(--radius-md)`)
> 2. Follow the existing dark mode token system (`[data-theme="dark"]` overrides)
> 3. Reuse existing component classes: `.options-card`, `.btn-primary`, `.btn-secondary`, `.btn-small`, `.modal-overlay`, `.modal`, `.toast`, `.text-input`, `.select-input`, `.form-section-title`, `.form-section-description`
> 4. Use the design system spacing tokens: `--spacing-xs` (4px) through `--spacing-xl` (32px)
> 5. Use glassmorphism card pattern: `background: var(--color-bg-surface-glass); backdrop-filter: blur(var(--glass-blur)); border: 1px solid var(--glass-border);`
> 6. New CSS classes go in `options.css` following existing naming conventions

---

## Mockup Screenshots Reference

All 41 screens from the mockup are captured in `./mockup-screenshots/`. Each task below references specific screenshots by filename.

| Screenshot | Screen | Description |
|-----------|--------|-------------|
| `a1.png` | A1 | Persona editor — empty prompt, 3 action buttons |
| `a2.png` | A2 | Discovery chat — full conversation flow |
| `a2b.png` | A2b | Template preview — Sales Closer match |
| `a3.png` | A3 | Review generated prompts — model selector, v1 |
| `a3b.png` | A3b | Template adopted — "Use as-is" verbatim |
| `a3c.png` | A3c | Model switch — Claude Sonnet 4 with XML tags |
| `a4.png` | A4 | Edit inline — editable textarea, warning border |
| `a4b.png` | A4b | Inline diff from editor — live diff panel |
| `a5.png` | A5 | Test harness — Sample Qs tab with results |
| `a5b.png` | A5b | Test harness — Custom Q tab |
| `a5c.png` | A5c | Test harness — KB + Query tab with impossible knowledge |
| `a6.png` | A6 | Fix failure, re-test loop |
| `a7.png` | A7 | Diff vs generated, save as v1 |
| `a7b.png` | A7b | Post-save confirmation toast |
| `b1.png` | B1 | Re-enter chat with previous context |
| `b2.png` | B2 | New prompts generated — generation #2 |
| `b3.png` | B3 | Compare generation #1 vs #2 diff |
| `c1.png` | C1 | Persona editor — existing prompt, all buttons enabled |
| `c2.png` | C2 | Re-enter assistant with context |
| `c2b.png` | C2b | Auto-generated test questions |
| `c3.png` | C3 | Generate v4, diff vs v3 |
| `d1.png` | D1 | Test current prompts — setup |
| `d2.png` | D2 | Test results with failures |
| `d2b.png` | D2b | A/B comparison results — v3 vs v2 side by side |
| `e1.png` | E1 | Version history — list of all versions |
| `e2.png` | E2 | Diff any two versions — dropdown selectors |
| `e3.png` | E3 | Restore creates new version — non-destructive |
| `e4.png` | E4 | Test old version from history |
| `e5.png` | E5 | Delete version confirmation dialog |
| `f1.png` | F1 | Manual edit — direct textarea editing |
| `f2.png` | F2 | Test → iterate → save (manual edit) |
| `g1.png` | G1 | Model mismatch warning |
| `g2.png` | G2 | Adapt prompt for new model — diff view |
| `g3.png` | G3 | Model version saved — success toast |
| `h1.png` | H1 | Legacy prompt auto-imported as v1 |
| `i1.png` | I1 | Discard/close warning dialog |
| `i2.png` | I2 | All-pass success state |
| `i3.png` | I3 | No API key for model — disabled state |
| `i4.png` | I4 | Chat error state — inline error |
| `i5.png` | I5 | All tests fail — re-generation suggestion |
| `i6.png` | I6 | Test run error — interrupted mid-run |

---

## Technical Verification Notes

> These findings were verified against the actual codebase on 2026-02-07.

### Relationship with Existing Model Tuning (`model-tuning.ts`)

> **CRITICAL — Read this before starting Task 3.**
>
> `src/shared/model-tuning.ts` already implements **runtime** per-model adaptations. It is applied by `processTranscriptForPersona()` in the service worker every time a suggestion is generated (when `promptTuningMode === 'auto'`). It handles:
>
> - `promptPrefix`: Qwen `/no_think` prefix
> - `silenceReinforcement`: per-family silence wording appended to system prompt
> - `conversationSilenceHint`: Llama-specific hint in conversation messages
> - `suggestionTemperature`: per-family temperature override
> - `jsonHint`: GPT/Llama/Qwen JSON compliance instructions
>
> **The Phase 24 `prompt-adapter.ts` (Task 3) must NOT duplicate these runtime adaptations.** If it did, prompts would get silence instructions applied twice, Qwen would get `/no_think` twice, etc.
>
> **Division of responsibility:**
>
> | Concern | Owner | When Applied |
> |---------|-------|-------------|
> | **Structural formatting** (XML tags for Claude, numbered lists for Llama, section ordering) | `prompt-adapter.ts` (Phase 24) | At generation time — baked into the saved prompt text |
> | **Runtime silence reinforcement** (silence wording, silence hints) | `model-tuning.ts` (existing) | At call time — prepended/appended dynamically |
> | **Runtime temperature** | `model-tuning.ts` (existing) | At call time |
> | **Runtime `/no_think` prefix** | `model-tuning.ts` (existing) | At call time |
> | **Runtime JSON hints** | `model-tuning.ts` (existing) | At call time |
>
> In short: `prompt-adapter.ts` handles **how the prompt is structured** (formatting, section organization, tag syntax). `model-tuning.ts` handles **what gets injected at runtime** (silence instructions, temperature, prefixes). They do not overlap.

### Model ID Normalization Strategy

> Model IDs differ across providers:
> - Gemini direct: `gemini-2.5-flash` (no prefix)
> - OpenRouter: `google/gemini-2.5-flash`, `anthropic/claude-sonnet-4`, etc.
> - Groq: `meta-llama/llama-4-scout-17b-16e-instruct`, `llama-3.3-70b-versatile` (mixed formats)
>
> **Use `MODEL_FAMILY_MAP` from `model-tuning.ts` as the canonical model ID registry.** It already maps all 11 model IDs to 5 families. The `modelPrompts` keys on the Persona must use the exact IDs from this map. The `getModelFamily()` function resolves any model ID to its family for prompt adaptation.
>
> `getActiveModel()` in `gemini-client.ts` returns the correct model ID per provider. This is the value used as the key into `modelPrompts`.

### Current Persona Model

| Component | Current State |
|-----------|--------------|
| **Persona interface** | `{ id, name, color, systemPrompt, kbDocumentIds, createdAt, updatedAt, order }` — single `systemPrompt` string |
| **Storage** | `chrome.storage.local` under `personas` key — JSON array |
| **System prompt usage** | `geminiClient.setSystemPrompt(persona.systemPrompt)` in service worker on session start |
| **Per-model support** | None — same prompt sent to all providers |
| **Prompt history** | None — overwrites on save |
| **Prompt testing** | None |

### Provider Routing (from `service-worker.ts` and `gemini-client.ts`)

| Provider | API Base | Model Selection |
|----------|----------|----------------|
| **Gemini (Direct)** | `generativelanguage.googleapis.com` | Fixed: `gemini-2.5-flash` |
| **OpenRouter** | `openrouter.ai/api/v1` | User-selected from 6 models |
| **Groq** | `api.groq.com/openai/v1` | User-selected from 4 models |

### 11 Supported Models (from `llm-config.ts`)

| # | Model | Provider | Stagger (ms) |
|---|-------|----------|-------------|
| 1 | Gemini 2.5 Flash | Direct | 200 |
| 2 | Gemini 2.5 Flash | OpenRouter | 225 |
| 3 | Gemini 2.5 Pro | OpenRouter | 775 |
| 4 | Claude Sonnet 4 | OpenRouter | 290 |
| 5 | GPT-4o | OpenRouter | 135 |
| 6 | GPT-4o Mini | OpenRouter | 400 |
| 7 | Llama 3.3 70B | OpenRouter | 240 |
| 8 | Llama 4 Scout 17B | Groq | 50 |
| 9 | Qwen 3 32B | Groq | 120 |
| 10 | Llama 3.3 70B Versatile | Groq | 75 |
| 11 | Llama 3.1 8B Instant | Groq | 50 |

### Critical Design Decisions

1. **Per-model prompts stored on Persona**: Extend the `Persona` interface with a `modelPrompts` map (`Record<string, string>`) alongside the existing `systemPrompt` field. The service worker reads `persona.modelPrompts[activeModelId]` when available, falling back to `persona.systemPrompt`.

2. **Version history stored per persona**: Add `promptVersions: PromptVersion[]` to the persona object. Stored in `chrome.storage.local` with the persona data. Version entries are compact (timestamp, summary, source, model target, test results reference).

3. **Assistant chat runs on Gemini**: The discovery chat always uses the user's Gemini API key (direct), even if they use OpenRouter/Groq for live calls. Gemini is the default provider and always available.

4. **Test harness calls the actual target model**: When testing a prompt for "GPT-4o via OpenRouter", the test makes real OpenRouter API calls with the user's key. This validates the prompt against the actual model it will be used with.

5. **Backward compatibility**: Existing `systemPrompt` field remains. Personas without `modelPrompts` work exactly as before. Migration is lazy — no bulk migration needed.

---

## Product Manager Review

### Feature Overview

Phase 24 adds a "Prompt Setup Assistant" button to the persona editor. Non-technical users can describe what they need in plain English, and an AI chatbot generates optimized system prompts tailored for their specific LLM model. An optional test harness runs real API calls to validate the prompt works before saving. Every save is versioned, and users can compare, diff, restore, or delete any version.

### Features

#### Feature 1: Discovery Chat (AI-Guided Prompt Generation)

**What it is:** A chatbot modal that asks what the persona should do, discovers tone/style/language preferences, recognizes matching templates, detects attached KB docs, and generates a model-optimized system prompt.

**Why it matters:** Most users don't know how to write effective system prompts. The assistant turns "I need help with pricing objections" into a complete, model-optimized prompt with silence rules, KB instructions, and the right formatting for their chosen model.

**User perspective:** Click "Prompt Setup Assistant" → answer 2-3 questions → get a ready-to-use prompt. Total time: ~30 seconds.

---

#### Feature 2: Per-Model Prompt Optimization

**What it is:** The same user intent produces different prompt text for each model. Claude gets XML tags. GPT gets bookend rules. Llama gets numbered lists. Qwen gets `/no_think`. Silence reinforcement layers vary by model.

**Why it matters:** A prompt that works on Gemini may fail on GPT-4o (especially silence behavior). Per-model optimization means the user doesn't need to know about model quirks — the assistant handles it.

**User perspective:** User selects their target model from a dropdown. The generated prompt automatically uses the right formatting for that model. Switching models regenerates the prompt.

---

#### Feature 3: Prompt Test Harness

**What it is:** An in-app testing tool that runs real API calls to validate prompt behavior. Tests "should respond" and "should stay silent" scenarios. Optional KB integration testing with "impossible knowledge" validation.

**Why it matters:** Users can verify their prompt actually works before going into a live call. The silence test is critical — a persona that talks when it should be silent is disruptive.

**User perspective:** Click "Test" → see auto-generated test questions → click "Run Tests" → see pass/fail for each question with the model's actual response. Cost estimate shown before running.

---

#### Feature 4: Version History with Diffs

**What it is:** Every prompt save creates a versioned snapshot. Users can diff any two versions, restore old ones (non-destructive — creates a new version), test old versions, and delete unneeded ones.

**Why it matters:** Prompt iteration is trial-and-error. Version history lets users experiment freely knowing they can always roll back.

**User perspective:** Click "Version History" → see all versions with test scores → click "Diff" to compare → click "Restore" to roll back.

---

#### Feature 5: A/B Comparison Testing

**What it is:** Run the same test questions against two prompt versions side by side. Shows per-question results for both versions so users can see which performs better.

**Why it matters:** Quantifies improvement. Instead of guessing if v3 is better than v2, users see "v3: 5/5 pass, v2: 3/5 pass" with specific failure details.

**User perspective:** In the test setup, select "Compare against: Previous version" → run tests → see side-by-side results.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       PROMPT SETUP ASSISTANT                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Options Page (Persona Editor)                                           │
│  ┌────────────────────────────────────────────────────────────┐          │
│  │  [✨ Prompt Setup Assistant]  [🧪 Test]  [📋 History]     │          │
│  └──────────┬───────────────────────┬──────────────┬─────────┘          │
│             │                       │              │                     │
│             ▼                       ▼              ▼                     │
│  ┌──────────────────┐  ┌───────────────────┐  ┌────────────────┐       │
│  │  Assistant Chat   │  │  Test Harness     │  │ Version History │       │
│  │  (Modal)          │  │  (Modal)          │  │ (Panel)         │       │
│  │                   │  │                   │  │                 │       │
│  │  Discovery Q&A    │  │  Sample Qs Tab    │  │  v3 (current)   │       │
│  │  Template Match   │  │  Custom Q Tab     │  │  v2              │       │
│  │  KB Detection     │  │  KB + Query Tab   │  │  v1              │       │
│  │  Model Selector   │  │                   │  │                 │       │
│  │  Generate →       │  │  Run Tests →      │  │  Diff / Restore │       │
│  └────────┬─────────┘  └────────┬──────────┘  └────────────────┘       │
│           │                     │                                        │
│           ▼                     ▼                                        │
│  ┌──────────────────────────────────────────┐                           │
│  │           prompt-assistant.ts             │  ← NEW                    │
│  │                                           │                           │
│  │  • Chat state management                  │                           │
│  │  • Template matching                      │                           │
│  │  • Model-specific prompt generation       │                           │
│  │  • Test execution + result formatting     │                           │
│  │  • Version CRUD + diff generation         │                           │
│  │  • Cost estimation                        │                           │
│  └───────────────┬──────────────────────────┘                           │
│                  │                                                        │
│                  ▼                                                        │
│  ┌──────────────────────────────────────────┐                           │
│  │         Gemini / OpenRouter / Groq APIs   │                           │
│  │                                           │                           │
│  │  Chat generation → always Gemini direct   │                           │
│  │  Test execution → target model's API      │                           │
│  │  KB embeddings → Gemini Embedding API     │                           │
│  └──────────────────────────────────────────┘                           │
│                                                                          │
│  ┌──────────────────────────────────────────┐                           │
│  │              Persona Storage              │                           │
│  │                                           │                           │
│  │  Extended Persona {                       │                           │
│  │    systemPrompt: string      (existing)   │                           │
│  │    modelPrompts?: Record<string, string>  │  ← NEW                   │
│  │    promptVersions?: PromptVersion[]       │  ← NEW                   │
│  │  }                                        │                           │
│  └──────────────────────────────────────────┘                           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model Additions

```typescript
// Extends existing Persona interface (src/shared/persona.ts)
interface Persona {
  // ... existing fields ...
  modelPrompts?: Record<string, string>;     // model ID → system prompt
  promptVersions?: PromptVersion[];          // version history
}

interface PromptVersion {
  version: number;
  timestamp: number;
  summary: string;                            // auto-generated one-liner
  source: 'assistant' | 'manual' | 'template' | 'restored' | 'imported';
  targetModel: string;                        // model ID this was optimized for
  prompt: string;                             // the prompt text
  testResults?: VersionTestResults;           // optional test snapshot
}

interface VersionTestResults {
  passed: number;
  total: number;
  cost: number;
  timestamp: number;
  modelId?: string;                           // which model was tested against
}

interface TestQuestion {
  text: string;
  expectedBehavior: 'respond' | 'silent';
  category?: 'kb' | 'custom';                // for KB-specific tests
  source?: 'auto' | 'user';                  // auto-generated vs user-written
  groupLabel?: string;                        // custom group label (e.g., "SHOULD NOT OFFER A DISCOUNT")
  behaviorHint?: string;                      // parenthetical context (e.g., "reframe to value")
  tags?: string[];                            // compound badge items (e.g., ["new", "must redirect to value"])
}

interface TestResult {
  question: TestQuestion;
  response: string;
  status: 'pass' | 'fail' | 'error';         // error = API failure, not a content failure
  failureReason?: 'wrong-behavior' | 'should-have-responded' | 'off-topic' | 'should-be-silent';
  errorMessage?: string;                      // API error details (429, timeout, etc.)
  cost: number;
  latencyMs: number;
}

interface ComparisonTestResult {
  question: TestQuestion;
  current: TestResult;
  compared: TestResult;                       // the version being compared against (any version, not just "previous")
}
```

**In-memory types (defined by tasks during implementation, not stored):**
- `ChatMessage` (Task 4) — role, content, quick-replies, summary box, error flag
- `DiscoveryParams` (Task 5) — use case, tone, style, language, silence rules, KB status, competitors
- `GenerationSnapshot` (Task 5/7) — generation number, prompt text, model ID, test questions — tracks `lastGeneratedPrompt` for B-flow comparison
- `TemplateMatchResult` (Task 6) — template name, similarity score, template reference
- `KBTestResult` (Task 10) — extends `TestResult` with KB chunk retrieved, similarity score, source filename, citation correctness

---

## Master Checklist

### Instructions for Claude Code

> **CRITICAL: You must follow these rules exactly.**
>
> 1. **Save after every cell write.** Each time you update a cell (start time, end time, estimate, etc.), save the file immediately before proceeding.
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
>
> 7. **Evidence screenshots:** After completing any UI task, take a screenshot of the implemented result. Compare it side-by-side with the mockup screenshot referenced in the task. Verify all components, labels, states, and interactions match. Note any deviations.

### Progress Dashboard

| Done | # | Task Name | Start | End | Total (min) | Human Est. (min) | Multiplier |
|:----:|:-:|-----------|:-----:|:---:|:-----------:|:----------------:|:----------:|
| [ ] | 1 | Extend Persona data model | | | | 30 | |
| [ ] | 1T | **VERIFY:** Persona data model | | | | 10 | |
| [ ] | 2 | Create prompt version storage helpers | | | | 45 | |
| [ ] | 2T | **VERIFY:** Version storage helpers | | | | 20 | |
| [ ] | 3 | Build model-specific prompt templates | | | | 120 | |
| [ ] | 3T | **VERIFY:** Prompt adapter | | | | 20 | |
| [ ] | 4 | Create Assistant Chat UI (modal) | | | | 90 | |
| [ ] | 4T | **VERIFY:** Chat modal UI | | | | 15 | |
| [ ] | 5 | Implement discovery chat logic | | | | 120 | |
| [ ] | 5T | **VERIFY:** Discovery chat logic | | | | 20 | |
| [ ] | 6 | Implement template matching | | | | 45 | |
| [ ] | 6T | **VERIFY:** Template matching | | | | 20 | |
| [ ] | 7 | Build prompt generation engine | | | | 90 | |
| [ ] | 7T | **VERIFY:** Prompt generation engine | | | | 20 | |
| [ ] | 8 | Create Test Harness UI (modal) | | | | 90 | |
| [ ] | 8T | **VERIFY:** Test harness UI | | | | 15 | |
| [ ] | 9 | Implement test execution engine | | | | 90 | |
| [ ] | 9T | **VERIFY:** Test execution engine | | | | 20 | |
| [ ] | 10 | Add KB integration testing | | | | 60 | |
| [ ] | 10T | **VERIFY:** KB integration testing | | | | 20 | |
| [ ] | 11 | Build Version History UI (panel) | | | | 60 | |
| [ ] | 11T | **VERIFY:** Version history UI | | | | 15 | |
| [ ] | 12 | Implement diff engine | | | | 45 | |
| [ ] | 12T | **VERIFY:** Diff engine | | | | 15 | |
| [ ] | 13 | Add A/B comparison to test harness | | | | 60 | |
| [ ] | 13T | **VERIFY:** A/B comparison | | | | 15 | |
| [ ] | 14 | Wire persona editor buttons + integration orchestration | | | | 60 | |
| [ ] | 14T | **VERIFY:** Integration orchestration (end-to-end flows) | | | | 30 | |
| [ ] | 15 | Update service worker for per-model prompts | | | | 30 | |
| [ ] | 15T | **VERIFY:** Service worker per-model prompts | | | | 15 | |
| [ ] | 16 | Add CSS for all new components | | | | 45 | |
| [ ] | 16T | **VERIFY:** CSS styling compliance | | | | 10 | |
| [ ] | 17 | Final build, typecheck, and full verification | | | | 30 | |

**Summary:**
- Implementation tasks: 17
- Verification tasks: 16 (Task 17 IS the final verification)
- Total tasks: 33
- Total human estimate: 1,390 minutes (~23 hours)

---

## User Flows (End-to-End Integration)

> These flows describe the **complete user journey**. Every task must contribute to at least one flow. Task 14 owns the orchestration that connects all pieces.

### Flow A: New persona, first prompt (screens A1 → A2 → A2b → A3/A3b → A3c → A4 → A4b → A5 → A6 → A7 → A7b)

> Mockup sidebar: "Flow A". This is the complete happy path with all branches.

1. User opens persona editor with empty prompt → sees 3 action buttons (Task 14), "Test" and "History" disabled (a1)
2. Clicks "✨ Prompt Setup Assistant" → chat modal opens (Task 4)
3. Bot asks questions → discovery conversation (Task 5)
4. **Branch — template match detected** (Task 6):
   - Bot offers quick-replies: "Use [template]" / "Start fresh"
   - If "Use [template]" → template preview sub-view (a2b): shows readonly prompt, customization buttons
     - "Use as-is" → review shows template verbatim (a3b), footer: "← Back to Chat" / "Edit" / "Test..." / "Save as v1"
     - "Customize this →" → returns to chat with template context → continues to step 5
     - "← Back to Chat" → returns to discovery conversation
   - If "Start fresh" → continues to step 5
5. User clicks "Generate Prompts" → generation engine runs (Task 7) → prompt adapted for model (Task 3)
6. **Review view** appears (Task 7) (a3): model selector dropdown, readonly prompt textarea, footer: "Refine..." / "Edit" / "🧪 Test..." / "Save All (v1)"
7. **Branch — model switch** (a3c): User changes model dropdown → prompt re-adapts (Task 3) → notice box ("Prompt adapted for Claude — uses XML tags...") → version badge updates
8. User clicks "Edit" → **inline editing state** (Task 7) (a4): textarea becomes editable, warning dashed border, footer: "Discard edits" / "Test this version" / "Show diff"
9. **Optional — show diff** (a4b): User clicks "Show diff" → inline diff panel appears below textarea (Task 12), footer: "Hide diff" / "Test this version" / "Save"
10. User clicks "Test this version" → test harness modal opens (Task 8) with 3 tabs: Sample Qs (a5) / Custom Q (a5b) / KB + Query (a5c, Task 10) → runs tests (Task 9) → back to editor footer: "← Back to Edit" / "Save as v1"
11. **If failures** → user clicks "Edit Prompt to Fix →" → returns to editor with fix context (Task 7) (a6), footer: "Re-test" (Task 9) / "Show diff". This is the **fix → re-test loop** — user edits, clicks "Re-test" to run tests again without leaving the editor.
12. When satisfied → **pre-save diff review** (a7): full-screen diff "generated → edited" (Task 12), footer: "Back to Edit" / "Save as v1"
13. **Save orchestration** (Task 14): creates version (Task 2) → updates persona `systemPrompt` + `modelPrompts` → saves to storage → inline success banner (a7b) → refreshes editor textarea → updates version badge
14. User returns to persona editor (C1 state) with all 3 buttons now enabled

### Flow B: Refine unsaved generation (screens A3 → B1 → B2 → B3 → A4)

> Mockup sidebar: "Flow B". User was NOT happy with first generation and clicks "Refine..." BEFORE saving.

1. From review view (a3), user clicks "Refine..." → chat re-opens with previous context (b1, Task 4)
2. Bot: "Welcome back. Here's what I generated last time:" + summary. User describes changes (Task 5).
3. Clicks "✨ Regenerate Prompts" → new generation (Task 7) + model adaptation (Task 3) → (b2), badge: "Generation: #2"
4. **Diff view** shows generation #1 vs #2 (b3) — "Use #1" / "Use #2" buttons (Task 12)
5. User picks one → **continues into the A4 edit/test/save loop** (NOT a direct save). Goes to A4 → A5 → A6 → A7 → A7b as in Flow A steps 8–14.

### Flow C: Return to improve existing prompt (screens C1 → C2 → C2b → C3)

> Mockup sidebar: "Flow C". User previously saved a prompt and comes back to iterate.

1. User opens persona editor with existing prompt → sees all 3 buttons enabled (c1, Task 14)
2. Clicks "✨ Prompt Setup Assistant" → chat re-opens with saved context (c2, Task 5 re-enter)
3. Bot: "Welcome back to **[Persona Name]**. Your current prompt is on **v[N]** (last tested X/Y pass)." + summary of current prompt focus
4. User describes desired changes → bot confirms + offers test question generation (c2b, Task 5)
5. Quick replies (Task 4/5): "Yes, add test Q too" / "Just the prompt"
6. Clicks "✨ Generate v[N]" → new version generated (Task 7) + model adaptation (Task 3) → (c3) — diff shown automatically vs previous version: "DIFF: V3 → V4" (Task 12)
7. Footer: "Edit" / "🧪 Test..." / "Save as v[N]" — continues into edit/test/save loop or saves directly

### Flow D: Test current prompt directly (screens D1 → D2 → D2b)

> Mockup sidebar: "Flow D". User tests existing prompt without re-generating.

1. User clicks "🧪 Test Current Prompts" (Task 14) → test harness opens with current `systemPrompt` + version info (d1)
2. **Single version path** (d2): Runs tests (Task 8/9) → sees failures → "Close" / "Edit Prompt to Fix →"
3. **Comparison path** (d2b): User selects "Compare against: v2" → cost doubles → runs tests (Task 9) → side-by-side comparison results (Task 13): "Comparison: v3 (current) vs v2"
4. After reviewing → can navigate to "Version History (E1) →" from results footer

### Flow E: Version management (screens E1 → E2 → E3 → E4 → E5)

> Mockup sidebar: "Flow E". User manages prompt version history.

1. User clicks "📋 Version History" (Task 14) → editor content replaced by history panel (Task 11) (e1)
2. Clicks "Diff" on v2 → version selector dropdowns → diff rendered (Task 12) (e2)
3. Clicks "Restore" on v1 → creates v4 with v1's content (Task 2) → list refreshes (e3)
4. Clicks "Test" on v2 → test harness opens with v2's prompt + version warning banner (Task 9 with `versionNumber`) (e4) → can "Restore v2" directly from test results or "← Back to History"
5. Clicks "Delete" on v2 → confirmation dialog (e5) → deletes (Task 2) → list refreshes
6. "← Back" returns to persona editor

### Flow F: Model mismatch (screens G1 → G2 → G3)

> Mockup sidebar: "Flow G". Active model differs from prompt's target model.

1. User's active model changed since last save → warning banner on editor load (Task 14) (g1)
2. Clicks "✨ Adapt Prompt for [Model]" → adapter transforms prompt (Task 3) → adaptation result modal opens showing diff (Task 12) + "Changes:" summary line (g2)
3. User can: "Keep [Old Model]" (dismiss), "🧪 Test [New Model]" (opens test harness, Task 8/9), or "Save [New Model]" (saves, Task 2/14)
4. On save → version created (Task 2) → alternate success banner (Task 14) → user can navigate to version history (E1) to see the new entry (g3)

### Flow G: Manual edit (screens F1 → F2)

> Mockup sidebar: "Flow F". User edits prompt directly without the assistant.

1. User edits prompt directly in textarea → unsaved changes indicators appear: orange dot + "modified" label (f1, Task 14)
2. "🧪 Test" button label changes to "🧪 Test Before Saving"
3. User tests (Task 8/9) → fixes failures → saves → version created (Task 2) with source `'manual'` (f2)

### Flow H: Legacy import (screen H1)

> Mockup sidebar: "Flow H". Existing persona opens for the first time after Phase 24 deployment.

1. User opens persona that has `systemPrompt` but no `promptVersions` → lazy auto-v1 migration runs (Task 2)
2. Info banner: "Your existing prompt has been imported as v1" (h1, Task 14)
3. Version history shown inline (Task 11) below buttons with single "v1" entry
4. All 3 buttons enabled — user continues into any other flow

### Edge case transitions (screens I1–I6)

> Mockup sidebar: "Flow I". Error states and their escape routes.

| Screen | Trigger | User exits to |
|--------|---------|---------------|
| I1 — Discard warning | Close modal with unsaved changes | "Discard" → closes, "Keep Editing" → back to editor (a4), "Save & Close" → saves + closes |
| I2 — All-pass success | All test questions pass | "View Details" (stays), "← Edit More" → back to editor, "✓ Save as v[N]" → save → post-save (a7b) |
| I3 — No API key | Editor loads without required key | "Configure in Settings" → Setup tab. "📋 Version History" still works. |
| I4 — Chat error | API failure during discovery | Error appears below existing messages (preserved). "🔄 Retry" re-sends, "Close" exits chat. |
| I5 — All tests fail | Every test question fails | "✨ Re-run Assistant" → re-enters chat (b1), "Edit Prompt Manually" → back to editor |
| I6 — Test interrupted | API error mid-run | Partial results preserved. "🔄 Retry Failed Tests" re-runs only failed/skipped. |

### Data Passing Between Components

| From | To | Data Passed | Mechanism |
|------|----|-------------|-----------|
| Chat modal (Task 4) | Review view | Generated prompt + test questions + discovery params | In-memory state in `prompt-assistant-chat.ts` |
| Review view | Test harness (Task 8) | Prompt text + model ID + version number | Function call with params |
| Test harness | Review view | Test results (pass/total/cost) | Callback or return value |
| Any modal "Save" | Persona storage (Task 2) | Prompt text + version metadata | `addPromptVersion()` + `savePersonas()` |
| Save completion | Editor UI (Task 14) | Updated persona object | Re-render from storage read |
| Version history "Test" | Test harness | Prompt text from specific version + version number | Function call with `versionNumber` param |
| Version history "Diff" | Diff engine (Task 12) | Two prompt texts + version labels | Direct function call |

---

## Task Descriptions

---

### Task 1: Extend Persona Data Model

**Intent:** Add per-model prompt support and version history fields to the Persona interface.

**Expected behavior:**
- Add `modelPrompts?: Record<string, string>` to `Persona` interface
- Add `promptVersions?: PromptVersion[]` to `Persona` interface
- Define `PromptVersion`, `VersionTestResults`, `TestQuestion`, `TestResult`, `ComparisonTestResult` types
- Ensure backward compatibility — all new fields are optional

**Key components:**
- `src/shared/persona.ts` — extend interface, add new types

**Notes:** The `modelPrompts` key must be the exact model ID as listed in `MODEL_FAMILY_MAP` (from `src/shared/model-tuning.ts`). Examples: `google/gemini-2.5-flash` (OpenRouter), `gemini-2.5-flash` (direct), `anthropic/claude-sonnet-4`, `qwen/qwen3-32b`. Use `getActiveModel()` from `gemini-client.ts` to get the runtime model ID — it already returns the correct format per provider. The existing `systemPrompt` field is the fallback when no model-specific prompt exists.

**No UI — no screenshot reference.**

---

### Task 1T: Verify Persona Data Model

**Intent:** Prove the new types compile correctly and maintain backward compatibility.

**Evidence checklist:**

| # | Check | Method | Evidence File | Pass If |
|---|-------|--------|---------------|---------|
| 1 | TypeScript compiles with new fields | `npm run typecheck` | Console output screenshot | Zero errors |
| 2 | Full persona with all new fields | Vitest unit test | `tests/persona-model.test.ts` | Compiles and test passes |
| 3 | Legacy persona without new fields | Vitest unit test | Same test file | Compiles and test passes (backward compat) |
| 4 | `PromptVersion` has all required fields | Vitest unit test | Same test file | Missing any required field → compile error |
| 5 | `modelPrompts` key accepts model IDs | Vitest unit test | Same test file | Keys from `MODEL_FAMILY_MAP` are valid |

**Procedure:**
1. Run `npm run typecheck` → capture console output
2. Create `tests/persona-model.test.ts` with these test cases:
   - Construct a `Persona` object with `modelPrompts` and `promptVersions` populated → assert it compiles
   - Construct a `Persona` object with ONLY the original fields (no `modelPrompts`, no `promptVersions`) → assert it compiles
   - Construct a `PromptVersion` with all required fields → assert it compiles
   - Verify `modelPrompts` record can use keys like `'gemini-2.5-flash'`, `'anthropic/claude-sonnet-4'`, `'qwen/qwen3-32b'`
3. Run `npm test -- tests/persona-model.test.ts` → capture output
4. Save all output as evidence

**Pass gate:** All 5 checks green. If any fail, do NOT proceed to Task 2.

---

### Task 2: Create Prompt Version Storage Helpers

**Intent:** CRUD operations for prompt versions — create, list, diff, restore, delete.

**Expected behavior:**
- `addPromptVersion(personaId, version)` — appends to `promptVersions`, increments version number
- `getPromptVersions(personaId)` — returns sorted versions (newest first)
- `restorePromptVersion(personaId, versionNumber)` — creates new version with old content, updates `systemPrompt` and `modelPrompts`
- `deletePromptVersion(personaId, versionNumber)` — removes version (current version cannot be deleted)
- Auto-generate `summary` from a Gemini call: "Strengthened silence instructions, added KB citation rules"
- Cap versions at 20 per persona (auto-prune oldest when exceeded)

**Lazy auto-v1 migration:** When `getPromptVersions()` is called on a persona that has `systemPrompt` but no `promptVersions`, auto-create a v1 entry from the existing `systemPrompt` (source: `'manual'`, summary: `'Initial prompt'`). This preserves backward compatibility — the user sees their existing prompt as v1 in the history without any bulk migration. See mockup screenshot `h1.png` for the auto-import UI.

**Key components:**
- `src/services/prompt-version.ts` — **NEW FILE**

**Notes:** Versions are stored inline on the persona object in `chrome.storage.local`. Keep entries compact — store the prompt text but not full test result details (just pass/total/cost summary). **Storage budget:** Each version is ~2–5 KB (prompt text + metadata). At 20 versions × 12 personas = ~1.2 MB worst case. `chrome.storage.local` has a 10 MB limit — this is safe but worth monitoring. The 20-version cap per persona is the primary size control.

**No UI — no screenshot reference. (Tested via Task 11 UI.)**

---

### Task 2T: Verify Version Storage Helpers

**Intent:** Prove all CRUD operations work correctly through automated tests.

**Evidence checklist:**

| # | Check | Method | Evidence File | Pass If |
|---|-------|--------|---------------|---------|
| 1 | `addPromptVersion()` auto-increments | Vitest | `tests/prompt-version.test.ts` | v1 → v2 → v3 |
| 2 | `getPromptVersions()` sorts newest-first | Vitest | Same file | v3 first, v1 last |
| 3 | Lazy auto-v1 migration | Vitest | Same file | Persona with `systemPrompt` but no versions → returns 1 entry (v1) |
| 4 | `restorePromptVersion()` creates new version | Vitest | Same file | Restoring v1 with v3 current → v4 created with v1 content, source: `'restored'` |
| 5 | `deletePromptVersion()` blocks current | Vitest | Same file | Deleting current version throws; deleting non-current succeeds |
| 6 | 20-version cap auto-prunes | Vitest | Same file | Adding v21 removes v1 (oldest) |
| 7 | Summary auto-generation | Vitest (mock Gemini) | Same file | `summary` field is non-empty string |
| 8 | Typecheck passes | `npm run typecheck` | Console output | Zero errors |

**Procedure:**
1. Create `tests/prompt-version.test.ts` with mocked `chrome.storage.local` (existing test setup provides this)
2. Test each function in isolation with prepared persona data
3. For lazy auto-v1: create a persona with `systemPrompt: "Test prompt"` and `promptVersions: undefined` → call `getPromptVersions()` → verify returns `[{version: 1, source: 'manual', prompt: 'Test prompt', summary: 'Initial prompt'}]`
4. For the 20-cap test: programmatically add 20 versions, then add 1 more → verify array length is 20 and v1 is gone
5. Run full test suite → capture output
6. Run `npm run typecheck` → capture output

**Pass gate:** All 8 checks green. This is critical because Tasks 11 and 14 depend on these helpers.

---

### Task 3: Build Model-Specific Prompt Templates

**Intent:** Create the **structural formatting** rules that convert a generic prompt into model-optimized formats. This handles **prompt structure only** — NOT runtime tuning (silence reinforcement, `/no_think`, temperature). See "Relationship with Existing Model Tuning" section above.

**Expected behavior:**
- `adaptPromptForModel(basePrompt, modelId)` — applies structural transformations. Returns `{ prompt: string, changesSummary: string }` where `changesSummary` is a one-line description of what changed (e.g., "XML tags → markdown bullets, silence reinforcement adjusted, section reordering"). This summary is displayed in the adaptation result modal (g2.png).
- Uses `getModelFamily(modelId)` from `model-tuning.ts` to resolve model family — do NOT duplicate the model→family mapping
- Transformations based on `llm-prompting-research.md`:
  - **Claude Sonnet 4**: Wrap sections in XML tags (`<role>`, `<focus>`, `<response-rules>`), positive framing, bookend structure
  - **GPT-4o / GPT-4o Mini**: Bookend rules (repeat critical rules at start and end), explicit format example, numbered priority lists
  - **Llama models**: Use numbered lists instead of bullets, anti-verbosity instruction, explicit examples for expected behavior
  - **Qwen 3 32B**: Structured template format with clear section headers
  - **Gemini**: Keep markdown format, concise bullet points, natural tone
- Each transformation preserves the semantic content while changing formatting
- **DO NOT include in the adapted prompt:** silence reinforcement wording, `/no_think` prefix, JSON hints, or temperature settings. These are handled by `model-tuning.ts` at runtime and would be duplicated.

**Key components:**
- `src/services/prompt-adapter.ts` — **NEW FILE**
- `src/shared/model-tuning.ts` — import `getModelFamily()` and `MODEL_FAMILY_MAP` for family detection
- References `llm-prompting-research.md` for transformation rules

**Mockup reference:** See `a3c.png` — shows Claude Sonnet 4 prompt with XML tags (`<role>`, `<focus>`, `<kb-instructions>`, `<response-rules>`). Compare against `a3.png` (Gemini version with plain markdown bullets) to see how the same intent produces different formatting.

**Prompt length note:** The generated prompts must stay within the 10,000-character editor limit (enforced in `personas.ts` save validation: 100–10,000 chars). If a structurally adapted prompt exceeds this, truncate non-critical sections (examples, KB instructions) before saving. The runtime `setSystemPrompt()` in `gemini-client.ts` has a separate 20,000-char hard cap, but the editor limit is the practical constraint.

**Notes:** This is the core intellectual property of Phase 24. The adapter must handle edge cases: prompts with existing XML tags (don't double-wrap), prompts that already have silence sections (don't duplicate). The adapter imports `getModelFamily()` from `model-tuning.ts` — it does not maintain its own model→family mapping.

---

### Task 3T: Verify Prompt Adapter

**Intent:** Prove per-model transformations are correct and do NOT overlap with `model-tuning.ts`.

**Evidence checklist:**

| # | Check | Method | Evidence File | Pass If |
|---|-------|--------|---------------|---------|
| 1 | Claude → XML tags | Vitest | `tests/prompt-adapter.test.ts` | Output contains `<role>`, `<focus>`, `<response-rules>` |
| 2 | Gemini → markdown bullets | Vitest | Same file | Output has `-` bullets, no XML tags |
| 3 | Llama → numbered lists | Vitest | Same file | Output has `1.`, `2.`, etc. instead of bullets |
| 4 | Qwen → structured headers | Vitest | Same file | Output has clear section headers |
| 5 | GPT → bookend rules | Vitest | Same file | Critical rules appear at start AND end |
| 6 | No runtime tuning leakage | Vitest | Same file | Output does NOT contain `/no_think`, silence reinforcement text from `MODEL_TUNING_PROFILES`, or JSON hints |
| 7 | No double-wrap | Vitest | Same file | Input with existing `<role>` tags → output doesn't have `<role><role>` |
| 8 | All 5 families differ | Vitest | Same file | Hash/length differs for all 5 outputs from same input |
| 9 | Under 10K chars | Vitest | Same file | 3,000-char input → all 5 outputs under 10,000 chars |
| 10 | Uses `getModelFamily()` | Code review | N/A | Imports from `model-tuning.ts`, not its own mapping |
| 11 | `changesSummary` returned | Vitest | Same file | Return value includes non-empty `changesSummary` string describing transformations (for g2.png adaptation modal) |

**Procedure:**
1. Create `tests/prompt-adapter.test.ts` with a realistic 3,000-char sample prompt (copy from a built-in template)
2. Call `adaptPromptForModel()` with one model ID from each of the 5 families
3. For check #6: collect all `silenceReinforcement` strings from `MODEL_TUNING_PROFILES` and assert NONE appear in any adapted output
4. For check #7: create input with `<role>My role</role>` already present → verify output has exactly 1 `<role>` tag, not 2
5. Run tests → capture output
6. Code review: verify `import { getModelFamily } from '../shared/model-tuning'` exists in `prompt-adapter.ts`

**Pass gate:** All 11 checks green. This is the core IP of Phase 24 — failures here cascade to Tasks 5, 7, and 14.

---

### Task 4: Create Assistant Chat UI (Modal)

**Intent:** Build the chat modal that houses the discovery conversation.

**Mockup screenshots:** `a2.png`, `a2b.png`, `b1.png`, `c2.png`, `i4.png`

**UI Component Inventory:**

**Modal Frame** (reuse existing `.modal-overlay` + `.modal` patterns, max-width 600px):
- **Header:**
  - Title: "✨ Prompt Setup Assistant"
  - Cost hint: "Powered by Gemini · ~$0.001" — muted color, inline after title
  - Close button: "×" (top-right, triggers discard warning if unsaved — see `i1.png`)

- **Body — Chat Message List** (scrollable, flex column, gap 12px):
  - **Bot message:** Left-aligned. Avatar circle (28px, gradient background, "🤖" emoji). Chat bubble (background: `var(--color-bg-page)`, border: `1px solid var(--color-border)`, border-radius: `var(--radius-lg)`, padding: 12px 14px, `font-size: var(--font-size-sm)`, `line-height: 1.5`).
  - **User message:** Right-aligned (flex-direction: row-reverse). Chat bubble (background: `var(--color-primary)`, color: white, same border-radius and padding).
  - **Quick-reply buttons:** Appear below a bot message. Row of small buttons (`.btn-small` + `.btn-secondary` or `.btn-primary`). Wrap on overflow.
  - **Summary box:** Inside a bot bubble. Bordered inset box with bold header and **dot-separated single line** (not bullet list). Example from `c2.png`: "Enterprise cloud pricing · Direct tone · AWS/Azure positioning · KB-aware". Background slightly different from bubble (subtle contrast, orange-tinted).

- **Footer (varies by state):**
  - **During discovery** (a2.png): "Refine..." (secondary) + "✨ Generate Prompts" (primary) — both appear once discovery has enough context (bot asked questions). "Refine..." lets user add more details before generating.
  - **Re-enter state** (c2.png): "Cancel" (secondary) + "✨ Generate v[N]" (primary) — version number reflects next version. No "Refine..." button.
  - **Generating**: "✨ Generate Prompts" shows spinner, disabled state

**Template Preview Sub-view** (`a2b.png`):
- Replaces chat body when user clicks "Use Sales Closer" (or any template match)
- Template info: template name (bold, 15px), meta line "Built-in · Used by 340+ personas"
- Readonly textarea showing template prompt text (`.prompt-textarea`, reduced height ~180px)
- Customization quick-reply buttons: "Add competitors", "Change tone", "Add KB instructions", "Change language", "Adjust silence rules"
- Footer: "← Back to Chat" (secondary), "Use as-is" (secondary), "Customize this →" (primary)

**Chat Error State** (`i4.png`):
- Error message uses bot message layout but with red avatar ("!") and red-tinted bubble
- Content: bold error headline + description text + suggestion
- **Prior messages are preserved:** The error appears as a new message at the bottom of the chat — all previous conversation messages remain visible above it (scroll up to see them). The error does NOT replace the conversation.
- Footer shows "Close" (secondary) + "🔄 Retry" (primary)

**Re-enter Chat State — two variants:**

- **B1: Refine unsaved generation** (`b1.png`) — user clicked "Refine..." from review before saving:
  - Bot: "Welcome back. Here's what I generated last time:"
  - Summary box header: "**Previous generation:**" with dot-separated items
  - Bot: "What would you like to change?"
  - User describes changes → bot confirms with bulleted change list + "Everything else stays the same"
  - Orange readiness banner: "Ready to regenerate with changes"
  - Footer: "Refine more..." (secondary) + "✨ Regenerate Prompts" (primary)

- **C2: Iterate on saved version** (`c2.png`) — user returns after saving:
  - Bot: "Welcome back to **[Persona Name]**. Your current prompt is on **v[N]** (last tested X/Y pass)."
  - Summary box header: "**Current prompt focuses on:**" with dot-separated items
  - Bot: "What would you like to improve?"
  - User describes changes → bot confirms + offers test question generation
  - Quick replies: "Yes, add test Q too" / "Just the prompt"
  - Footer: "Cancel" (secondary) + "✨ Generate v[N]" (primary)

**States to handle:**
1. Fresh start — empty chat, first bot message asks "What will this persona help you with?"
2. Template match detected — quick-reply buttons "Use [template]" / "Start fresh"
3. Discovery complete — summary box + "Generate Prompts" button active
4. Re-enter — previous context loaded, "Regenerate" button
5. Error — inline error message, retry button
6. Generating — loading spinner on generate button, disabled state

**Key components:**
- `src/options/sections/prompt-assistant-chat.ts` — **NEW FILE**
- `src/options/options.html` — **ADD** new modal container for the chat (see HTML note below)

**HTML note:** The existing `#modal-overlay` in `options.html` is a simple confirm/cancel dialog managed by `ModalManager` (shows title + message + confirm/cancel buttons). It **cannot** be reused for the complex chat UI. Add a **new** overlay container: `#assistant-chat-overlay` with its own structure (header, scrollable body, footer). The chat modal manages its own show/hide. The existing `ModalManager` confirm dialog is still used for the discard warning (`i1.png`) — that's a simple confirm/cancel flow.

**⚠️ CSS Mandate (sub-agent must read):** All styling must use existing `options.css` classes and CSS custom properties — do NOT invent new styles or use hardcoded values. Reuse: `.modal-overlay`, `.modal`, `.btn-primary`, `.btn-secondary`, `.btn-small`, `.text-input`, `var(--color-*)`, `var(--spacing-*)`, `var(--radius-*)`, `var(--font-size-*)`. Chat bubbles and avatars are new components — add classes to `options.css` following existing naming conventions. No inline styles. See **Styling Mandate** at top of plan.

**Notes:** Chat messages are stored in memory only — not persisted across page loads. Discard warning (`i1.png`) triggers on close with unsaved state — use existing `ModalManager.showConfirmModal()` for that.

---

### Task 4T: Verify Chat Modal UI

**Intent:** Prove the chat modal renders correctly in all states and matches mockup layouts.

**Evidence checklist:**

| # | Check | Method | Evidence File | Pass If |
|---|-------|--------|---------------|---------|
| 1 | Modal opens centered | Screenshot | `evidence/4t-modal-open.png` | Matches layout of `a2.png` — header with title + cost hint, scrollable body, footer |
| 2 | Bot message layout | Screenshot | `evidence/4t-bot-msg.png` | Left-aligned, avatar circle, chat bubble with correct background |
| 3 | User message layout | Screenshot | `evidence/4t-user-msg.png` | Right-aligned, primary-colored bubble, white text |
| 4 | Quick-reply buttons | Screenshot | `evidence/4t-quick-replies.png` | Row of small buttons below bot message, wraps on overflow |
| 5 | Template preview sub-view | Screenshot | `evidence/4t-template-preview.png` | Matches `a2b.png` — template name, readonly textarea, 5 customization buttons, 3 footer buttons |
| 6 | Error state | Screenshot | `evidence/4t-error-state.png` | Matches `i4.png` — red avatar "!", red-tinted bubble, "Retry" button |
| 7 | Re-enter state | Screenshot | `evidence/4t-reenter.png` | Matches `b1.png` — summary box with previous context, "Regenerate" button |
| 8 | Close triggers discard warning | Functional | `evidence/4t-discard-warning.png` | Warning dialog appears when closing with unsaved state |
| 9 | No console errors | Console check | `evidence/4t-console.png` | Zero errors during open → interact → close cycle |
| 10 | Design system compliance | Code review | N/A | No hardcoded hex colors, all use `var(--*)` tokens |

**Procedure:**
1. Build extension (`npm run build`), load in Chrome, navigate to Options → Personas
2. Create a test persona, open it in the editor
3. Click "Prompt Setup Assistant" → screenshot the modal (check #1)
4. Type a test message → screenshot user + bot messages (checks #2, #3)
5. Trigger a state with quick-reply buttons → screenshot (check #4)
6. To test template preview: mock a template match response or hardcode one temporarily → screenshot (check #5)
7. To test error state: disconnect network or use invalid API key → screenshot (check #6)
8. To test re-enter: first generate a prompt, close, reopen → screenshot (check #7)
9. Close with unsaved state → screenshot the discard warning (check #8)
10. Open DevTools console → screenshot showing zero errors (check #9)
11. Review CSS in `prompt-assistant-chat.ts` — verify all colors/spacing use tokens (check #10)

**Pass gate:** All 10 checks green. Screenshots saved to `evidence/` folder.

---

### Task 5: Implement Discovery Chat Logic

**Intent:** The AI-powered conversation that discovers user intent and generates prompts.

**Mockup screenshots:** `a2.png` (full conversation flow), `c2.png` (re-enter with context)

**Expected behavior:**
- System prompt for the discovery chat itself (meta-prompt):
  - "You are a prompt engineering assistant for Wingman AI..."
  - Knows about the 12 built-in templates
  - Asks about: use case, tone, response style, language, silence rules, competitors
  - Detects attached KB documents and mentions them
  - Generates structured output (JSON) with discovered parameters
- Multi-turn conversation using Gemini's chat API
- Quick-reply buttons for common answers (template suggestions, tone choices)
- KB detection: reads persona's `kbDocumentIds`, resolves to document names
- Final summary card before generation

**Discovery conversation flow** (from `a2.png`):
1. Bot: "What will this persona help you with?" (open-ended)
2. User provides use case (e.g., "Handling pricing objections")
3. Bot detects template match → offers quick replies: "Use Sales Closer" / "Start fresh"
4. If "Start fresh": Bot asks multi-question list (deal size, competitors, tone, style, language)
5. User answers (can be a single message answering all)
6. Bot detects KB docs → mentions them ("I see you have 2 KB docs attached")
7. Bot shows summary card: "Ready to generate prompts for: [bullets]" — last bullet is "Tailored for: [active model name] (your active model)" (auto-detected from provider config)
8. User clicks "Generate Prompts"

**Re-enter conversation flow** (from `c2.png`):
1. Bot: "Welcome back to **[Persona Name]**. Your current prompt is on **v[N]** (last tested X/Y pass)."
2. Bot shows summary of current prompt focus
3. Bot: "What would you like to improve?"
4. User describes changes
5. Bot confirms changes + offers to generate test questions too
6. Quick replies: "Yes, add test Q too" / "Just the prompt"

**In-memory "last generated" state:** After the generation engine produces a prompt (Task 7), store the result in memory as `lastGeneratedPrompt`. This is needed for screen B3 (compare generations) — the diff view compares the new generation against the previous one, even if neither has been saved yet. This state is cleared when the modal closes.

**Key components:**
- `src/services/prompt-assistant-engine.ts` — **NEW FILE**
- Uses `geminiClient` for API calls (always Gemini direct, regardless of user's provider choice)

**Multi-turn format note:** The discovery chat uses direct Gemini API calls (not the main `geminiClient`). Gemini's native multi-turn format uses `contents: [{role: "user", parts: [...]}, {role: "model", parts: [...]}]` — this differs from the existing `buildConversationMessages()` in `gemini-client.ts` which packs history into a single "CONVERSATION SO FAR" block. Use Gemini's native multi-turn format for the discovery chat — it's a fresh conversation, not a packed transcript.

**Notes:** The discovery chat is cheap (~$0.001). Use `gemini-2.5-flash` with temperature 0.5 for creative but controlled responses. The meta-prompt must be carefully crafted — it's the prompt that writes prompts.

---

### Task 5T: Verify Discovery Chat Logic

**Intent:** Prove the AI chat produces useful, contextual responses and handles all conversation states.

> **Requires:** Gemini API key configured in extension settings.

**Evidence checklist:**

| # | Check | Method | Evidence File | Pass If |
|---|-------|--------|---------------|---------|
| 1 | Relevant follow-up questions | Live test + screenshot | `evidence/5t-discovery-conv.png` | Type "pricing objections in B2B SaaS" → bot asks about deal size, competitors, tone (not generic) |
| 2 | Template detection | Live test + screenshot | `evidence/5t-template-match.png` | Sales-related input → bot offers "Use Sales Closer" quick-reply |
| 3 | Summary card | Live test + screenshot | `evidence/5t-summary-card.png` | After 2-3 exchanges → summary box with bullet list of discovered params |
| 4 | Re-enter with context | Live test + screenshot | `evidence/5t-reenter.png` | Persona with v2 → open assistant → bot says "Your current prompt is on v2" with summary |
| 5 | KB document detection | Live test + screenshot | `evidence/5t-kb-detection.png` | Persona with KB docs → bot mentions doc names ("I see you have 2 KB docs attached") |
| 6 | `lastGeneratedPrompt` lifecycle | Functional test | Console log screenshot | Set after generation, cleared on modal close |
| 7 | Multi-turn coherence | Live test + screenshot | `evidence/5t-multi-turn.png` | Bot remembers earlier answers in later questions |
| 8 | No console errors | Console check | `evidence/5t-console.png` | Zero errors during full conversation |

**Procedure:**
1. **Test conversation quality:** Open assistant on empty persona → type "I need help handling pricing objections in B2B SaaS sales" → screenshot the bot's response → verify it asks specific questions (not "What do you need?")
2. **Test template detection:** Type "job interview preparation" → verify bot offers "Job Interview" template match → screenshot
3. **Test summary:** Answer 2-3 bot questions → verify summary card appears → screenshot
4. **Test re-enter:** Save a v2 prompt on a persona → close → reopen assistant → verify greeting includes v2 context → screenshot
5. **Test KB awareness:** Attach 2 KB documents to a persona → open assistant → verify bot mentions them → screenshot
6. **Test memory lifecycle:** After generation, check `console.log` for `lastGeneratedPrompt` being set → close modal → check it's cleared
7. **Test multi-turn:** Have a 4-message conversation → verify bot references earlier answers
8. Check DevTools console → screenshot

**Pass gate:** All 8 checks green. The quality of the bot's responses is subjective — pass if responses are contextually relevant and specific to the user's input (not boilerplate).

---

### Task 6: Implement Template Matching

**Intent:** Recognize when user input matches a built-in persona template and offer it.

**Mockup screenshots:** `a2b.png` (template preview), `a3b.png` (template adopted)

**Expected behavior:**
- Compare user's description against 12 built-in templates from `default-personas.ts`
- Use keyword matching + Gemini embedding similarity
- Threshold: > 0.7 similarity → suggest template
- Show template preview with customization quick-replies (A2b screen)
- "Use as-is" loads template verbatim into review
- "Customize this" returns to chat with template context

**Template preview UI components** (from `a2b.png`):
- **Header:** "📋 Sales Closer Template" (template name + "Template")
- **Template info block:**
  - "Template" label (uppercase, xs font, muted)
  - Template name: "**Sales Closer**" (bold, 15px)
  - Meta: "Built-in · Used by 340+ personas" (xs font, muted)
- **"Template Prompt Preview"** label (bold, sm font) above textarea
- Readonly textarea with template prompt text (`.prompt-textarea`, reduced height ~180px)
- **Customization box** (orange-tinted background, bordered):
  - Header: "What would you like to customize?" (bold, sm font)
  - 5 quick-reply buttons below: "Add competitors", "Change tone", "Add KB instructions", "Change language", "Adjust silence rules"
- Footer: "← Back to Chat" (secondary), "Use as-is" (secondary), "Customize this →" (primary)

**Template adopted state** (from `a3b.png`):
- Review modal header: "📋 Review Template Prompt" (not "✨ Generated Prompts")
- Model selector: "TARGET MODEL" label + dropdown + "DIRECT" provider badge (same as `a3.png`)
- Purple-tinted source badge: "📋 From template: **Sales Closer**"
- Info text: "This is the raw template — not yet optimized for your target model. Save as-is, or click Edit to customize."
- Prompt loaded verbatim (not AI-modified)
- Character count: "398 / 10,000 chars"
- Footer: "← Back to Chat" (secondary), "Edit" (secondary), "🧪 Test..." (secondary), "Save as v1" (primary)

**Key components:**
- `src/services/prompt-assistant-engine.ts` — template matching logic
- `src/shared/default-personas.ts` — reference for template content

**Embedding caching:** The 12 built-in templates need embeddings for similarity comparison. Generating 12 embeddings = 12 API calls. **Cache these in `chrome.storage.local`** under a `templateEmbeddings` key (keyed by template name + hash of prompt text). Only regenerate if a template's prompt text changes. This avoids 12 API calls every time the user opens the assistant.

**Template data model note:** `PersonaTemplate` (from `default-personas.ts`) is `{name, color, systemPrompt}` — it has **no `id` field**. Template matching must use the `name` field as the identifier. When the user adopts a template, create a new persona with a generated ID (existing `crypto.randomUUID()` pattern), not a template ID.

**⚠️ CSS Mandate (sub-agent must read):** All styling must use existing `options.css` classes and CSS custom properties. Reuse: `.modal`, `.btn-primary`, `.btn-secondary`, `.btn-small`, `.select-input`, `.prompt-textarea`, `var(--color-*)`, `var(--spacing-*)`. The template preview is a sub-view inside the chat modal — no new overlay needed. See **Styling Mandate** at top of plan.

**Notes:** Template matching should happen early in the conversation (after the first user message). Embeddings are already available via Gemini — reuse the same embedding endpoint used for KB search.

---

### Task 6T: Verify Template Matching

**Intent:** Prove template matching is accurate, caching works, and the "Use as-is" / "Customize" flows function correctly.

> **Requires:** Gemini API key configured.

**Evidence checklist:**

| # | Check | Method | Evidence File | Pass If |
|---|-------|--------|---------------|---------|
| 1 | Correct match for related input | Live test + screenshot | `evidence/6t-match-found.png` | "job interview prep" → suggests "Job Interview" template |
| 2 | No match for unrelated input | Live test + screenshot | `evidence/6t-no-match.png` | "quantum physics research" → no template suggested |
| 3 | "Use as-is" flow | Live test + screenshot | `evidence/6t-use-as-is.png` | Review view shows template verbatim, source badge: "From template: Job Interview" |
| 4 | "Customize this" flow | Live test + screenshot | `evidence/6t-customize.png` | Returns to chat with template context loaded in bot message |
| 5 | Embedding cache created | Vitest or console | `evidence/6t-cache-created.png` | After first match: `chrome.storage.local` has `templateEmbeddings` with 12 entries |
| 6 | Cache hit on second call | Console log screenshot | `evidence/6t-cache-hit.png` | Second match call: console shows cache hit, no new API calls |
| 7 | Template name as identifier | Code review | N/A | Matching uses `name` field (not an `id` field, which doesn't exist on `PersonaTemplate`) |

**Procedure:**
1. Open assistant on empty persona → type "job interview preparation" → verify template match → screenshot
2. Close → open again → type "quantum physics research paper review" → verify NO template match → screenshot
3. On a match: click "Use as-is" → verify review view shows raw template prompt verbatim → screenshot
4. On a match: click "Customize this" → verify chat resumes with template context → screenshot
5. After first match: inspect `chrome.storage.local` via DevTools → verify `templateEmbeddings` key exists with 12 entries → screenshot
6. Close and reopen assistant → trigger another match → check console for "cache hit" log (no embedding API calls) → screenshot console
7. Code review: verify `default-personas.ts` templates are matched by `name`, not by a nonexistent `id`

**Pass gate:** All 7 checks green. Template matching accuracy is validated by checks #1 and #2.

---

### Task 7: Build Prompt Generation Engine

**Intent:** Take discovered parameters and generate a model-optimized system prompt.

**Mockup screenshots:** `a3.png` (review generated), `a3c.png` (model-switched), `b2.png` (regeneration #2), `c3.png` (diff vs previous), `c2b.png` (auto-generated test questions)

**Expected behavior:**
- Input: discovery parameters (use case, tone, style, language, silence rules, KB status, competitors)
- Input: target model ID
- Output: complete system prompt optimized for the target model
- Generation flow:
  1. Build a "generation prompt" containing all discovered parameters
  2. Send to Gemini with instructions to generate a Wingman system prompt
  3. Apply model-specific transformations from Task 3 (`adaptPromptForModel`)
  4. Return the final prompt
- The generation prompt includes the universal structure: ROLE → RULES → FORMAT → EXAMPLES → KB CONTEXT
- Generates relevant test questions alongside the prompt (3 "should respond" + 3 "should stay silent")

**Review modal UI components** (from `a3.png`):
- **Header:** "✨ Generated Prompts"
- **Model selector:** Label "TARGET MODEL" (uppercase, xs font). `<select>` dropdown (`.select-input`) with 3 `<optgroup>`s: "Gemini (Direct)", "OpenRouter" (6 models), "Groq" (4 models). Provider badge next to dropdown showing "DIRECT" (blue), "OPENROUTER" (purple), or "GROQ" (green) — uppercase.
- **Version badge:** "Version: **v1**" + context text "· first generation" (muted)
- **Prompt textarea:** Readonly, monospace font, 240px min-height. Shows the generated prompt.
- **Character count:** "412 / 10,000 chars" — right-aligned, xs font, muted color
- **Footer buttons (first generation — `a3.png`):** "Refine..." (secondary), "Edit" (secondary), "🧪 Test..." (secondary), "Save All (v1)" (primary)
- **Footer buttons (regeneration — `b2.png`):** "Edit" (secondary), "🧪 Test..." (secondary), "Save All" (primary, no version number) — "Refine..." button is NOT shown on regeneration since user just came from chat

**Model-switch behavior** (from `a3c.png`):
- When user changes model dropdown, the prompt text changes
- Notice box appears: "✨ Prompt adapted for Claude — uses XML tags, bookend rules, and Claude-optimized silence format"
- Notice uses purple-tinted background with purple text
- Version badge updates: "· optimized for Claude Sonnet 4"

**Regeneration state** (from `b2.png`):
- Version badge: "Generation: **#2**"
- "Compare vs generation #1" button (secondary, small) appears next to version badge
- Clicking it opens diff view (B3 — see Task 12)

**Auto-generated test questions** (from `c2b.png`):
- **Header:** "✨ Generated Prompt + Test Questions"
- Tab interface: "Prompt (v4)" (active, primary background) / "Test Questions" tabs
- Test questions grouped with **"AUTO-GENERATED —" prefix** on group labels:
  - "AUTO-GENERATED — SHOULD RESPOND" (uppercase, xs font, muted)
  - "AUTO-GENERATED — SHOULD NOT OFFER A DISCOUNT" (context-specific label, not generic "Should Stay Silent")
- Each question has checkbox (checked by default) + question text in quotes + badges:
  - Simple badge: "new" (primary/orange background, white text)
  - **Compound badge**: "new · must redirect to value" (multiple conditions separated by "·")
- Number of questions varies based on context (mockup shows 3: 2 respond + 1 redirect)
- Info text at bottom: "These questions were generated based on the new '[feature]' feature you requested. They'll be added to your existing test suite (6 sample + 2 custom = 11 total)."
- Footer: "Remove test Qs" (secondary), "🧪 Test now" (secondary), "Save prompt + test Qs" (primary)

**Editing sub-states within the review modal** (from `a4.png`, `a4b.png`, `a6.png`, `a7.png`):

> The review modal has **4 distinct footer configurations** as the user progresses through editing. Sub-agents must implement all 4.

1. **Review state** (a3.png) — readonly textarea, footer: "Refine..." / "Edit" / "🧪 Test..." / "Save All (v1)"
2. **Editing state** (a4.png) — textarea becomes editable with warning dashed border. Pulsing indicator: "Editing — unsaved changes". Character count appends "· modified". Footer changes to: "Discard edits" (secondary) / "Test this version" (secondary) / "Show diff" (secondary)
3. **Editing + diff visible** (a4b.png) — diff panel appears below textarea (connected, no gap, dashed top border). Label: "LIVE DIFF VS GENERATED" (uppercase). Indicator changes to: "Editing — showing diff vs generated". Footer changes to: "Hide diff" (secondary) / "Test this version" (secondary) / "Save" (primary)
4. **Post-test-fix editing** (a6.png) — after a test failure, user returns to editor with context-specific indicator (e.g., "Editing — fixing silence behavior"). Footer changes to: "Re-test" (primary) / "Show diff" (secondary). The "Re-test" button runs the test directly from the editor without reopening the full test harness modal.

**Pre-save diff review** (a7.png) — a **separate full-screen view** within the modal (not the inline diff panel):
- Header: "Diff: generated → edited (Gemini 2.5 Flash)"
- Full diff view with colored lines and "..." ellipsis collapse
- Footer: "Back to Edit" (secondary) / "Save as v1" (primary)
- This is the final confirmation step before saving manual edits

**Auto-diff on regeneration when versions exist** (c3.png):
- When generating a new version and previous versions exist, the diff is shown **automatically** in the review view (no button click required)
- Label: "DIFF: V3 → V4" above the diff block
- Version badge context: "· generated from assistant"
- Footer: "Edit" / "🧪 Test..." / "Save as v4"

**Last-generated tracking:** After generation, update the in-memory `lastGeneratedPrompt` (see Task 5 notes). When the user re-enters the chat and generates again (B1→B2→B3 flow), the diff view compares the new output against the previous `lastGeneratedPrompt`.

**Key components:**
- `src/services/prompt-assistant-engine.ts` — generation logic
- `src/services/prompt-adapter.ts` — model-specific transformations

**⚠️ CSS Mandate (sub-agent must read):** The review modal and test questions tab reuse the same modal container as the chat. All styling must use existing `options.css` classes: `.modal`, `.select-input`, `.btn-primary`, `.btn-secondary`, `.btn-small`, `var(--color-*)`, `var(--spacing-*)`. The prompt textarea uses `.prompt-textarea`. Provider badges and version badges are new small components — add classes to `options.css`. No inline styles. See **Styling Mandate** at top of plan.

**Notes:** The generation step is a single Gemini call (~$0.002). The adapter (Task 3) runs locally after generation. Test question generation can be a second Gemini call or part of the same prompt. The generation meta-prompt must instruct Gemini to keep output under ~8,000 chars to leave room for structural formatting overhead from the adapter (Task 3) within the 10,000-char editor limit.

---

### Task 7T: Verify Prompt Generation Engine

**Intent:** Prove end-to-end generation works: discovery → generation → model adaptation → review UI → test questions.

> **Requires:** Gemini API key configured.

**Evidence checklist:**

| # | Check | Method | Evidence File | Pass If |
|---|-------|--------|---------------|---------|
| 1 | Generation produces prompt | Live test + screenshot | `evidence/7t-generated.png` | Review view shows prompt text, model selector defaults to active model |
| 2 | Review view layout | Screenshot | Same file | Matches `a3.png` — model selector, version badge "v1", readonly textarea, char count, footer |
| 3 | Model switch to Claude | Live test + screenshot | `evidence/7t-claude-switch.png` | Prompt changes to XML tags. Notice box: "Prompt adapted for Claude." Matches `a3c.png` |
| 4 | Model switch to Llama | Live test + screenshot | `evidence/7t-llama-switch.png` | Prompt uses numbered lists instead of bullets |
| 5 | Test questions generated | Live test + screenshot | `evidence/7t-test-questions.png` | 6 questions visible (3 "Should Respond" + 3 "Should Stay Silent") |
| 6 | Char count under 10K | Functional | Console or screenshot | Generated prompt for all 5 families is under 10,000 chars |
| 7 | Regeneration tracking | Functional + screenshot | `evidence/7t-regen.png` | After 2nd generation: "Generation: #2" badge + "Compare vs #1" button visible |
| 8 | `lastGeneratedPrompt` updated | Console check | Console screenshot | Value set after generation, differs between generation #1 and #2 |

**Procedure:**
1. Complete a discovery conversation → click "Generate Prompts" → screenshot review view (checks #1, #2)
2. Change model dropdown to Claude Sonnet 4 → verify prompt text changes and notice box appears → screenshot (check #3)
3. Change to Llama 3.3 70B → verify numbered lists → screenshot (check #4)
4. Click "Test Questions" tab → verify 6 questions with expected behavior labels → screenshot (check #5)
5. For each of 5 model families: switch dropdown, check char count display → verify all under 10,000 (check #6)
6. Click "Refine..." → make a change → "Regenerate" → verify generation #2 badge + compare button → screenshot (check #7)
7. Check console for `lastGeneratedPrompt` log entries (check #8)

**Pass gate:** All 8 checks green. The generated prompt must be **substantive and relevant** to the discovery conversation (not boilerplate).

---

### Task 8: Create Test Harness UI (Modal)

**Intent:** Build the test modal with three tabs: Sample Qs, Custom Q, KB + Query.

**Mockup screenshots:** `a5.png` (Sample Qs + results), `a5b.png` (Custom Q), `a5c.png` (KB + Query), `d1.png` (test setup from editor), `i2.png` (all-pass success), `i5.png` (all-fail), `i6.png` (mid-run error)

**UI Component Inventory:**

**Modal Frame** (reuse `.modal-overlay` + `.modal`, max-width 650px):
- **Header (before running):** "🧪 Prompt Tester" or "🧪 Prompt Tester — [Persona Name] (v[N])". When testing a non-current version: append "(not current)" in warning color.
- **Header (after running — dynamic):** "🧪 Test Results — X/Y pass" (e.g., "Test Results — 4/5 pass" from `d2.png`, "Test Results — 0/6 pass" from `i5.png`). Header updates with results count.
- **Header (interrupted — `i6.png`):** "🧪 Test Results — Interrupted" when an API error stops the run mid-way.
- **Header (all-pass — `i2.png`):** "🧪 Test Results" (no count suffix — the success banner below provides the detail).
- **Close button:** "×"

**Tab Bar** — 3 tabs (follow existing `.tab` pattern from options page):
- "Sample Qs" (default active)
- "Custom Q"
- "KB + Query"

**Sample Qs Tab** (from `a5.png`):
- **Test Question Group 1 — "Should Respond":**
  - Group label: "Should Respond" (uppercase, xs font, muted)
  - List of checkboxes: each is a checkbox (checked by default) + question text (sm font)
  - 3 auto-generated questions about the persona's topic
- **Test Question Group 2 — "Should Stay Silent":**
  - Group label: "Should Stay Silent"
  - 3 auto-generated questions testing silence behavior
- **Compare Against section:**
  - Label: "Compare against:" (xs font)
  - Radio buttons — one per available version (not just "previous"):
    - "None" (default) — with contextual text "(no saved version yet)" if no versions exist
    - One radio per non-current version: "v1 — [summary]", "v2 — [summary]", etc.
    - If testing from history (E4): additional radio for "Current version (v[N])"
  - This matches `e4.png` where all versions appear as individual selectable options
- **Cost Estimate box:**
  - Background: subtle primary-tinted (`rgba(243, 156, 18, 0.08)` in dark, use `var(--color-primary-ring)`)
  - Text: "💰 6 questions × 1 model = ~$0.01"
  - Updates dynamically when questions are checked/unchecked or comparison toggled
- **Run Tests button:** "▶ Run Tests" (`.btn-primary`, 200px min-width)
- **Test Result Cards** (appear after running):
  - **Question numbering:** Cards use "Q1:", "Q2:", "Q3:" prefix on headers (from `i5.png`)
  - **Pass result:** "✓ Q1: [question text]" header + model name label (e.g., "GEMINI 2.5 FLASH" uppercase) + response text + "✓ Pass" or "✓ Silent" badge (green background, xs font)
  - **Fail result:** "✗ Q1: [question text]" red-tinted header + model response in quotes + specific failure badge:
    - "✗ Wrong behavior" — responded but incorrectly
    - "✗ Should have responded" — was silent when should respond
    - "✗ Off-topic response" — responded but off-topic
    - "✗ Should be silent" — responded when should be silent
  - **Behavioral context on questions** (from `d2b.png` and `a5.png`): Questions can include parenthetical context describing expected behavior, e.g., "Can you give us a discount? *(reframe to value)*" or "So how's the weather over there? *(should stay silent)*". This context is muted text after the question, helping the user understand why this question tests what it tests. Shown on both single-version and comparison result cards.
  - **Actual cost line:** "X/Y passed · Z failure · Actual cost: $0.028" (footer summary line)

**Custom Q Tab** (from `a5b.png`):
- **Existing custom questions list:** Each item has checkbox + text + expected behavior badge ("should respond" green / "should stay silent" red) + "×" remove button
- **Add new question section:**
  - Dashed border container
  - Label: "Add a question"
  - Text input (`.text-input`, full width)
  - Radio buttons: "Should respond" (green accent) / "Should stay silent" (red accent)
  - "+ Add" button (`.btn-primary .btn-small`)
- **Cost estimate:** Combined count: "2 custom + 6 sample = 8 questions × 1 model = ~$0.02"
- **Footer:** "← Back to Sample Qs" (secondary), "▶ Run All Tests" (primary)

**KB + Query Tab** (from `a5c.png`) — when this tab is active, the modal header changes to "🧪 KB Validation" (not "Prompt Tester"):
- **Run button label:** "▶ Run KB Tests" (specific to KB context, from `a5c.png`)
- **KB Documents section:**
  - Label: "Knowledge Base Documents"
  - List of KB docs: icon "📄" + name + meta (sections · size) + checkbox (default checked)
  - Reuse existing `.kb-doc-item` pattern
- **KB-Dependent Questions:**
  - Label: "KB-Dependent Questions"
  - Checkbox list of KB-specific test questions
- **Impossible Knowledge Test box:**
  - Special bordered container with primary-tinted background
  - Icon "🔬" + label "Impossible Knowledge Test" (primary color)
  - Description explaining what it does
  - Input for fake fact (e.g., "$847/seat/month for the Quantum tier")
  - "Enable" checkbox
  - Generated question with special badge: "must cite $847"
- **Cost estimate:** "💰 3 KB questions × 1 model = ~$0.01 (includes embedding lookup)"
- **KB Test Results:**
  - Title: "KB Test Results" (bold)
  - Result cards for: real citation, impossible knowledge, missing data
  - Each shows response text + pass/fail badge with explanation
  - Success banner: "3/3 KB tests passed" + contextual subtext

**Test harness footer variations by context:**

1. **From review/generation** (`a5.png`): "← Back to Edit" (secondary) + "Save as v1" (primary) — allows saving directly from test results
2. **From editor "Test Current Prompts"** (`d1.png`): "Close" (secondary) + "Edit Prompt to Fix →" (primary)
3. **From version history** (`e4.png`): "← Back to History" (secondary) + "Restore v[N]" (secondary, appears only for non-current versions) — allows restoring directly from test results
4. **All-pass** (`i2.png`): "View Details" (secondary) + "← Edit More" (secondary) + "✓ Save as v[N]" (primary)
5. **All-fail** (`i5.png`): "Close" only in the footer bar — no save/edit buttons in footer. Note: the banner body above has inline action buttons ("Re-run Assistant", "Edit Prompt Manually") — these are distinct from footer buttons.
6. **Interrupted** (`i6.png`): "Close" (secondary) + "🔄 Retry Failed Tests" (primary)

**Version-specific button labels** (`e4.png`): When testing a specific version, the "Run Tests" button reads "▶ Run Tests on v[N]" to make the target clear.

**"Use the model selector to test other models"** hint text (`i2.png`): Shown below the success banner in the all-pass state as muted helper text encouraging multi-model testing.

**Version Warning Banner** (from `e4.png`, when testing non-current version):
- Warning-tinted background
- Text: "⚠️ Testing **v[N]** ([summary]) — not the current version (v[M])"

**All-Pass Success State** (from `i2.png`):
- Large centered success: "🎉" (36px) + "All Tests Passed" (18px bold, green) + "6/6 questions · Gemini 2.5 Flash · v2"
- Per-model score card
- Improvement comparison: "↑ **Improved from v1:** Silence compliance went from 2/3 → 3/3. Cost per test run: $0.052."
- Footer: "View Details" (secondary), "← Edit More" (secondary), "✓ Save as v2" (primary)

**Partial-Pass State** (from `d2.png`):
- Header: "🧪 Test Results — 4/5 pass" (dynamic count)
- **Only failing question(s) shown** — passing questions are hidden in this view
- Fail card: "✗ Q: [question text]" with red-tinted header showing model name + "offered a discount instead of redirecting to value" context
- Model response shown in quotes with italics
- Summary line: "4/5 passed · 1 failure · Actual cost: $0.048"
- Footer: "Close" (secondary), "Edit Prompt to Fix →" (primary)

**All-Fail State** (from `i5.png`):
- Header: "🧪 Test Results — 0/6 pass"
- Red-tinted banner: "**All tests failed**" (bold, danger color)
- Suggestion text: "This prompt may need significant revision. Consider re-running the Setup Assistant with different inputs, or try a different target model."
- Buttons inside banner: "✨ Re-run Assistant" (primary), "Edit Prompt Manually" (secondary)
- Individual failure cards with Q numbering: "✗ Q1:", "✗ Q2:", "✗ Q3:" — each showing question, model response, and specific failure badge
- **Collapse for overflow:** "**+ N more failures (silence tests)**" link when more than 3 failures displayed (from `i5.png`) — clicking expands the remaining cards
- Footer: "Close" only (no save/edit buttons when all tests fail)

**Mid-Run Error State** (from `i6.png`):
- Warning banner: "⚠️ Test run interrupted" + "2 of 6 tests completed before an API error."
- Passed results preserved (Q1, Q2)
- Error result: yellow-tinted header, italic error text ("API error: model returned 429")
- Skipped results: muted text listing skipped questions (e.g., "Q4: [text] — Skipped")
- Summary line: "2/6 completed · 1 error · 3 skipped" (uses "completed" not "passed" for interrupted runs)
- Footer: "Close" (secondary), "🔄 Retry Failed Tests" (primary)

**Key components:**
- `src/options/sections/prompt-test-harness.ts` — **NEW FILE**
- `src/options/options.html` — **ADD** new overlay container `#test-harness-overlay` (cannot reuse `#modal-overlay` — that's a simple confirm/cancel dialog)

**HTML note:** Same as the chat modal — the existing `ModalManager` is too simple for this UI. Create a dedicated `#test-harness-overlay` with its own header/body/footer structure. The test harness manages its own show/hide. Use existing `ModalManager` only for simple confirmations (e.g., "Retry failed tests?" prompts).

**⚠️ CSS Mandate (sub-agent must read):** All styling must use existing `options.css` classes and CSS custom properties. Reuse: `.modal-overlay`, `.modal`, `.btn-primary`, `.btn-secondary`, `.btn-small`, `.text-input`, `.select-input`, `.tab` pattern, `var(--color-*)`, `var(--spacing-*)`, `var(--radius-*)`, `var(--color-danger)`, `var(--color-success)`. Test result cards, pass/fail badges, cost estimate boxes, and tab content are new components — add classes to `options.css` following existing naming conventions. No inline styles, no hardcoded colors. See **Styling Mandate** at top of plan.

**Notes:** Reuse existing `.modal-overlay` and `.modal` CSS classes for base styling, but the HTML container must be separate. Test results appear inline (no separate results page). The "KB + Query" tab needs access to `kbDatabase` and `searchKB` for retrieval testing.

---

### Task 8T: Verify Test Harness UI

**Intent:** Prove all 3 tabs render correctly, all states display properly, and interactions work.

**Evidence checklist:**

| # | Check | Method | Evidence File | Pass If |
|---|-------|--------|---------------|---------|
| 1 | Sample Qs tab layout | Screenshot | `evidence/8t-sample-qs.png` | Matches `a5.png` — 2 question groups, checkboxes, cost estimate, "Run Tests" button |
| 2 | Custom Q tab layout | Screenshot | `evidence/8t-custom-q.png` | Matches `a5b.png` — question list, add form, radio buttons, combined cost |
| 3 | KB + Query tab layout | Screenshot | `evidence/8t-kb-query.png` | Matches `a5c.png` — KB doc list, impossible knowledge box |
| 4 | All-pass success state | Screenshot | `evidence/8t-all-pass.png` | Matches `i2.png` — success banner, score card, improvement comparison |
| 5 | All-fail state | Screenshot | `evidence/8t-all-fail.png` | Matches `i5.png` — red banner, "Re-run Assistant" button |
| 6 | Mid-run error state | Screenshot | `evidence/8t-error.png` | Matches `i6.png` — warning banner, partial results, "Retry Failed" button |
| 7 | Tab switching preserves state | Functional | Video or screenshots | Check questions on Sample Qs → switch to Custom Q → switch back → checkboxes still checked |
| 8 | Cost estimate updates | Functional | Screenshot sequence | Uncheck 2 questions → cost drops; toggle comparison → cost doubles |
| 9 | No console errors | Console check | `evidence/8t-console.png` | Zero errors during open → tab switch → close |
| 10 | Version warning banner | Screenshot | `evidence/8t-version-warning.png` | When testing non-current version: warning banner matches `e4.png` |
| 11 | Footer varies by context | Screenshots | `evidence/8t-footer-variants.png` | From review: "Back to Edit" + "Save as v1"; From editor: "Close" + "Edit Prompt to Fix →"; From history: "Back to History" + "Restore v[N]" |
| 12 | KB tab header change | Screenshot | `evidence/8t-kb-header.png` | Switching to KB + Query tab → header changes to "KB Validation" |
| 13 | Comparison radio per version | Screenshot | `evidence/8t-compare-radios.png` | All available versions listed as individual radio options (not just "Previous version") |

**Procedure:**
1. Open test harness from a persona with generated prompt + KB docs attached
2. Screenshot each tab: Sample Qs, Custom Q, KB + Query (checks #1–3)
3. To test success/fail/error states: either run real tests (if API key available) or temporarily hardcode mock results to capture screenshots (checks #4–6)
4. Check questions → switch tabs → switch back → verify preserved (check #7)
5. Uncheck questions → verify cost updates; enable comparison → verify cost doubles (check #8)
6. Check console → screenshot (check #9)
7. Open test harness from version history on a non-current version → verify warning banner (check #10)

**Pass gate:** All 13 checks green. Screenshots saved to `evidence/` folder.

---

### Task 9: Implement Test Execution Engine

**Intent:** Run actual API calls to test prompt behavior and judge pass/fail.

**Mockup screenshots:** `d2.png` (failure results), `d2b.png` (comparison results), `i6.png` (mid-run error handling)

**Expected behavior:**
- For each test question:
  1. Build a minimal conversation: system prompt + single user utterance (the test question)
  2. Call the target model's API (Gemini direct / OpenRouter / Groq)
  3. Check response and set `status` + `failureReason`:
     - "Should respond" + substantive response (>10 chars, not `---`) → `status: 'pass'`
     - "Should respond" + response is `---` → `status: 'fail'`, `failureReason: 'should-have-responded'`
     - "Should respond" + response is off-topic → `status: 'fail'`, `failureReason: 'off-topic'`
     - "Should stay silent" + response is `---` (trimmed) → `status: 'pass'`
     - "Should stay silent" + substantive response → `status: 'fail'`, `failureReason: 'should-be-silent'`
     - API error (429, 500, timeout) → `status: 'error'`, `errorMessage: [details]`
  4. Record response text, status, failureReason, cost, latency
- Support for comparison mode: run same questions against two prompt versions
- Accept optional `versionNumber` parameter: when provided, loads the prompt from that version instead of the current `systemPrompt`. This powers the "Test" button on old versions in the history panel (E4 screen — `e4.png`)
- Rate limiting: respect `PROVIDER_COOLDOWNS` between calls
- Error handling: API errors (429, 500) → mark as "error" not "fail", offer retry
- Partial failure: preserve passed results, allow retrying only failed/skipped questions (from `i6.png`)

**Key components:**
- `src/services/prompt-test-runner.ts` — **NEW FILE**
- Uses provider-specific API endpoints from `llm-config.ts`

**Test runner architecture — lightweight API caller (~50 lines):**

The test runner must **NOT** instantiate full `GeminiClient` instances. `GeminiClient` is a complex singleton (~1,060 lines) with session state, cooldowns, transcript history, KB integration, and model tuning — all of which would interfere with clean test calls.

Instead, build a minimal `testApiCall(provider, modelId, apiKey, systemPrompt, userMessage)` function that:
1. Reads the target provider from model ID (use `MODEL_FAMILY_MAP` → infer provider, or accept provider param)
2. Builds a minimal request body:
   - **Gemini direct**: `POST /v1beta/models/{model}:generateContent` with `systemInstruction` + single user `contents` entry
   - **OpenRouter**: `POST /chat/completions` with `[{role: "system", content: systemPrompt}, {role: "user", content: userMessage}]`
   - **Groq**: Same OpenAI format as OpenRouter, different base URL
3. Makes a single `fetch()` call
4. Extracts the response text
5. Returns `{ response, latencyMs, cost }` (cost estimated from token count)

This keeps tests isolated — no session state, no cooldowns, no KB injection, no model-tuning runtime. The test validates the **raw prompt** as written, which is the point.

**Rate limiting:** Space test calls by the provider's cooldown from `PROVIDER_COOLDOWNS` (Gemini: 15s, OpenRouter: 2s, Groq: 2s) to avoid 429s.

---

### Task 9T: Verify Test Execution Engine

**Intent:** Prove the lightweight API caller works for all 3 providers and pass/fail logic is correct.

> **Requires:** At least Gemini API key. OpenRouter/Groq keys for full coverage.

**Evidence checklist:**

| # | Check | Method | Evidence File | Pass If |
|---|-------|--------|---------------|---------|
| 1 | Gemini direct API call | Live test | `evidence/9t-gemini-call.png` | `testApiCall()` with Gemini returns non-empty response |
| 2 | OpenRouter API call | Live test (if key available) | `evidence/9t-openrouter-call.png` | Same function with OpenRouter model returns response |
| 3 | Groq API call | Live test (if key available) | `evidence/9t-groq-call.png` | Same function with Groq model returns response |
| 4 | "Should respond" → pass | Vitest | `tests/prompt-test-runner.test.ts` | Substantive response (>10 chars, not `---`) → `passed: true` |
| 5 | "Should stay silent" → pass | Vitest | Same file | Response is `---` (trimmed) → `passed: true` |
| 6 | "Should stay silent" → fail | Vitest | Same file | Response is "I can help" → `passed: false` |
| 7 | API error → "error" not "fail" | Vitest (mock 429) | Same file | Result status is `'error'`, not `'fail'` |
| 8 | Comparison mode | Vitest | Same file | Same questions against 2 prompts → returns `ComparisonTestResult[]` |
| 9 | No GeminiClient import | Code review | N/A | `prompt-test-runner.ts` does NOT import `GeminiClient` or `geminiClient` |
| 10 | Rate limiting | Vitest (timing) | Same file | Calls are spaced by provider cooldown (verify with timestamps) |

**Procedure:**
1. **Vitest tests (checks #4–8, #10):** Create `tests/prompt-test-runner.test.ts`. Mock `fetch()` to return controlled responses. Test all pass/fail/error scenarios.
2. **Live Gemini test (check #1):** Call `testApiCall('gemini', 'gemini-2.5-flash', GEMINI_KEY, "You are a helpful assistant.", "Hello")` → capture response in console → screenshot
3. **Live OpenRouter/Groq tests (checks #2, #3):** If keys available, repeat with OpenRouter and Groq models → screenshot responses
4. **Code review (check #9):** Open `prompt-test-runner.ts` → verify it imports only `fetch`, `PROVIDER_COOLDOWNS`, `MODEL_FAMILY_MAP` — NOT `GeminiClient`
5. Run `npm run typecheck` to confirm clean compile

**Pass gate:** Checks #1, #4–9 must be green. Checks #2 and #3 are conditional on API key availability (note if skipped).

---

### Task 10: Add KB Integration Testing

**Intent:** Validate that the prompt correctly instructs the model to use KB data.

**Mockup screenshots:** `a5c.png` (KB + Query tab with results)

**Expected behavior:**
- **Real KB test**: Query against persona's actual KB docs, verify response cites KB data
- **Impossible knowledge test**: Inject synthetic fact (e.g., "$999/seat"), query for it, verify model returns the injected number (not a hallucinated one)
- **Missing data test**: Query for something NOT in KB, verify model declines gracefully
- Results show: KB chunk retrieved (yes/no), similarity score, source filename, correct citation (yes/no)
- 3 KB test results displayed together: real citation, impossible knowledge, missing data

**KB test result cards** (from `a5c.png`):
- **Real citation result:** Question + response text + "✓ Pass — correctly cited KB data" badge (green)
- **Impossible knowledge result:** Question + "with $999 injected into KB" label + response + "✓ Pass — used injected data, not hallucinated" badge (green)
- **Missing data result:** Question "(not in KB)" label + response + "✓ Pass — correctly declined to answer" badge (green)
- **Success banner:** Green-tinted background, "3/3 KB tests passed" (bold, 15px, green) + contextual subtext

**Key components:**
- `src/services/prompt-test-runner.ts` — KB test logic
- `src/services/kb/kb-search.ts` — reuse existing search
- `src/services/kb/kb-database.ts` — reuse existing database

**Notes:** The impossible knowledge test is the strongest validation. If the model returns "$999/seat" from injected data, KB integration is proven working. If it returns a different number, the prompt's KB instructions need strengthening.

---

### Task 10T: Verify KB Integration Testing

**Intent:** Prove the KB test suite correctly validates citation, impossible knowledge, and missing data.

> **Requires:** Gemini API key + persona with at least 1 KB document uploaded.

**Evidence checklist:**

| # | Check | Method | Evidence File | Pass If |
|---|-------|--------|---------------|---------|
| 1 | Real KB citation test | Live test + screenshot | `evidence/10t-kb-citation.png` | Ask about topic in KB → response cites KB data → pass badge |
| 2 | Impossible knowledge test | Live test + screenshot | `evidence/10t-impossible.png` | Inject "$999/seat" → ask about pricing → response contains "$999" → pass badge |
| 3 | Missing data test | Live test + screenshot | `evidence/10t-missing.png` | Ask about topic NOT in KB → response declines → pass badge |
| 4 | KB test results layout | Screenshot | `evidence/10t-results.png` | 3 result cards with badges + success banner. Matches `a5c.png` results section |
| 5 | KB doc list accuracy | Screenshot | `evidence/10t-doc-list.png` | KB + Query tab shows correct number of docs with correct names |
| 6 | Impossible knowledge input | Functional | Screenshot | Custom text input accepts "$847/seat/month for Quantum tier" → generates question containing "$847" |

**Procedure:**
1. **Setup:** Create a persona, upload a KB document (e.g., a pricing PDF or sales doc), configure Gemini API key
2. Open test harness → KB + Query tab → verify doc list shows uploaded document(s) (check #5) → screenshot
3. Run the 3 KB tests (real citation, impossible knowledge, missing data) → screenshot results (checks #1–4)
4. Change the impossible knowledge input to a custom fact → verify the generated question contains the injected fact (check #6) → screenshot

**Pass gate:** All 6 checks green. If no KB docs are available, note which checks were skipped and create a test doc first.

---

### Task 11: Build Version History UI (Panel)

**Intent:** Display prompt version history with actions: diff, test, restore, delete.

**Mockup screenshots:** `e1.png` (history list), `e3.png` (after restore), `e5.png` (delete confirmation), `f2.png` (manual edit version)

**UI Component Inventory:**

**History Panel** (replaces persona editor content when opened, not a separate modal):
- **Panel Header:**
  - Title: "Prompt History — [Persona Name]" (`.form-section-title`)
  - Description: "Every prompt version with test results and costs." (`.form-section-description`)

**Version List** (scrollable, flex column, gap based on `--spacing-sm`):
- **Current Version Item** (from `e1.png`, first item):
  - Left section — meta:
    - Version label: "v3" (bold) + "current" badge (border: `2px solid var(--color-primary)`, rounded pill, primary color text, xs font, uppercase)
    - Summary text: "Strengthened silence instructions, added KB citation rules" (sm font, secondary color)
    - Stats line: "Test: 6/6 pass · Gemini 2.5 Flash · Cost: $0.052 · Feb 8, 2025" (xs font, muted) — includes target model name
  - Right section — actions:
    - "Diff" button (`.btn-secondary .btn-small`)
    - "🧪 Test" button (`.btn-secondary .btn-small`)
    - **No** "Restore" or "Delete" buttons on current version

- **Non-Current Version Item** (from `e1.png`, v2 and v1):
  - Same meta layout as current version (without "current" badge)
  - **Model name attribution** (from `g3.png`): Each version entry shows the target model name in the stats line, e.g., "Test: 6/6 pass · Gemini 2.5 Flash · Feb 8, 2025". This tells the user which model each version was optimized for.
  - 4 action buttons: "Diff", "Restore", "🧪 Test", "Delete"
  - Delete button: `.btn-secondary .btn-small` with `color: var(--color-danger)` and `border-color: var(--color-danger)`

**After Restore State** (from `e3.png`):
- New version (v4) at top: highlighted with primary border + subtle primary background
- Badge: "current" + "Restored from v1" summary
- Stats: "No tests yet · Feb 10, 2025"
- Source version (v1) highlighted with warning border + "← source" label (warning color, xs font)
- All intermediate versions (v3, v2) still present with full action buttons

**Manual Edit Version** (from `f2.png`):
- Source badge: "manual edit" (**orange/primary-tinted** background, xs font) — NOT blue
- Distinguishes from "Setup Assistant" and "restored from v[N]" sources

**Imported Version** (from `h1.png`):
- Two badges side by side: "current" (primary ring) + "imported" (blue-tinted background `rgba(96, 165, 250, 0.15)` with `#60a5fa` text, xs font)
- Summary: "Imported from existing persona prompt"
- Stats: "No tests yet"
- Only "🧪 Test" button (no Diff/Restore/Delete since it's the only version and current)

**Delete Confirmation Dialog** (from `e5.png`):
- History list dims to opacity 0.3 behind the dialog
- Deleted version highlighted with red border
- **Confirmation dialog** (centered overlay, 380px width, use existing `.modal` pattern):
  - Title: "Delete v[N]?" (bold, 15px)
  - Message: "This will permanently delete **v[N]** ([summary]) and its test results. This action cannot be undone."
  - Warning box: red-tinted background with note about restored versions being unaffected
  - Buttons: "Cancel" (secondary), "Delete v[N]" (danger — `background: var(--color-danger)`, white text)

**Test from History** (from `e4.png`):
- "Test" button on a version entry opens the test harness pre-loaded with that version's prompt
- Passes `versionNumber` to the test runner from Task 9
- Results are saved back to the version's `testResults` field

**Key components:**
- `src/options/sections/prompt-version-history.ts` — **NEW FILE**
- `src/options/options.html` — **ADD** a `#version-history-panel` container inside the persona editor area (not a modal — this is an inline panel that replaces the editor content)

**HTML note:** Unlike the chat and test modals, the version history is **not** a modal overlay. It's a panel that toggles visibility with the persona editor content. When "Version History" is clicked, hide the editor fields (name, color, prompt textarea, KB section) and show the history panel. "Back" reverses the toggle. The delete confirmation (`e5.png`) uses existing `ModalManager.showConfirmModal()` — that's a simple confirm/cancel flow.

**⚠️ CSS Mandate (sub-agent must read):** All styling must use existing `options.css` classes and CSS custom properties. Reuse: `.form-section-title`, `.form-section-description`, `.btn-primary`, `.btn-secondary`, `.btn-small`, `.options-card` pattern, `var(--color-*)`, `var(--spacing-*)`, `var(--radius-*)`, `var(--color-danger)`, `var(--color-primary)`. Version items, badges, and action buttons are new components — add classes to `options.css` following existing naming. No inline styles. See **Styling Mandate** at top of plan.

**Notes:** History lives inside the persona editor (not a separate page). Opening history replaces the editor content temporarily. "Back" returns to the editor. Max 20 versions displayed.

---

### Task 11T: Verify Version History UI

**Intent:** Prove the history panel renders all states correctly and all actions (diff, restore, test, delete) work.

**Evidence checklist:**

| # | Check | Method | Evidence File | Pass If |
|---|-------|--------|---------------|---------|
| 1 | History list with 3+ versions | Screenshot | `evidence/11t-history-list.png` | Matches `e1.png` — version labels, badges, summaries, stats, action buttons |
| 2 | Current version badge | Screenshot | Same or cropped | "current" badge visible; NO "Restore" or "Delete" buttons on current |
| 3 | Non-current version actions | Screenshot | Same or cropped | All 4 buttons: Diff, Restore, Test, Delete |
| 4 | After restore | Screenshot | `evidence/11t-after-restore.png` | Matches `e3.png` — new version at top, "Restored from v1" summary, source highlighted |
| 5 | Delete confirmation dialog | Screenshot | `evidence/11t-delete-confirm.png` | Matches `e5.png` — dimmed list, centered dialog, red delete button |
| 6 | Editor ↔ History toggle | Functional + screenshot | `evidence/11t-toggle.png` | Click "Version History" → editor hidden, panel shown; click "Back" → reversed |
| 7 | Diff button opens diff | Functional | Screenshot | Click "Diff" on v2 → diff view appears with version selector dropdowns |
| 8 | Test button opens harness | Functional | Screenshot | Click "Test" on v1 → test harness opens with v1's prompt + version warning banner |
| 9 | Delete removes version | Functional | Screenshot sequence | Click "Delete" on v2 → confirm → v2 gone from list, list refreshes |
| 10 | Manual edit source badge | Screenshot | `evidence/11t-manual-badge.png` | Version from manual edit shows "manual edit" badge (orange/primary-tinted) |

**Procedure:**
1. **Setup:** Create a persona with at least 3 prompt versions (use the assistant or manually save 3 times with different text)
2. Open version history → screenshot the full list (checks #1–3)
3. Click "Restore" on v1 → verify v4 created at top with "Restored from v1" → screenshot (check #4)
4. Click "Delete" on v2 → screenshot the confirmation dialog (check #5) → confirm → verify list updates (check #9)
5. Click "Back" → verify editor reappears → click "Version History" again → verify panel reappears (check #6)
6. Click "Diff" on any version → verify diff view renders (check #7)
7. Click "Test" on a non-current version → verify test harness opens with warning banner (check #8)
8. Manually edit the prompt in the textarea and save → open history → verify "manual edit" badge on latest version (check #10)

**Pass gate:** All 10 checks green.

---

### Task 12: Implement Diff Engine

**Intent:** Generate line-by-line diffs between two prompt versions.

**Mockup screenshots:** `a4b.png` (inline diff from editor), `a7.png` (diff vs generated before save), `b3.png` (compare two generations), `e2.png` (diff two versions from history), `g2.png` (model adaptation diff), `c3.png` (diff vs previous version)

**Expected behavior:**
- `generateDiff(oldText, newText)` → array of diff lines (same/add/remove)
- Renders in the UI with color coding:
  - Added lines: green background, "+" prefix
  - Removed lines: red background, "-" prefix
  - Same lines: gray/muted text, " " prefix
- Used by multiple screens:
  - **A4b** — inline diff below editor (live updates as user types)
  - **A7** — diff vs generated version before save
  - **B3** — diff between generation #1 and #2 (in-memory comparison)
  - **C3** — diff of v4 vs v3 after regeneration
  - **E2** — diff any two history versions (with dropdown selectors)
  - **G2** — diff showing model adaptation changes
- Word-level precision not needed — line-level is sufficient
- **Ellipsis collapse for unchanged sections:** When consecutive unchanged lines appear between changes, collapse them to a single "..." line (from `e2.png`). Show only ~1 context line above and below each change. This is critical for readability — without it, long prompts produce walls of muted text with tiny green/red patches buried inside.

**Diff view UI components** (from `e2.png`):
- **Version selector dropdowns:** Two `.select-input` dropdowns: "From" (left) + "→" arrow + "To" (right)
- Each dropdown shows all versions: "v1 — [summary]", "v2 — [summary]", "v3 — [summary] (current)"
- **Model selector:** Target model dropdown (same as in review modal)
- **Diff block:** Monospace font (`var(--font-mono)`), 12px, 1.7 line-height. No border. Background transparent. Each line colored by type.
- **Footer:** "Close" (secondary) — only button in the version history diff view (no "Use" buttons unlike generation comparison)

**Inline diff from editor** (from `a4b.png`):
- Diff panel sits directly below the textarea (connected — textarea bottom border-radius: 0, diff top border-radius: 0)
- Top dashed border separating textarea from diff
- Label: "Live diff vs generated" (10px uppercase, muted)
- "Hide diff" button in footer toggles visibility
- Updates as user types (debounced)

**Generation comparison** (from `b3.png`):
- Header: "Diff: Generation #1 → #2 (Gemini 2.5 Flash)"
- Diff block showing removed (old generation) and added (new generation) lines
- Footer: "Use #1" (secondary), "Use #2" (primary)

**Key components:**
- `src/services/prompt-diff.ts` — **NEW FILE**

**⚠️ CSS Mandate (sub-agent must read):** Diff view styling must use existing `options.css` CSS custom properties: `var(--font-mono)` for monospace, `var(--color-*)` for diff tinting (use success/danger token-based tints, not raw green/red). `.select-input` for version dropdowns. `.btn-secondary .btn-small` for action buttons. Add new diff classes (`.diff-block`, `.diff-add`, `.diff-remove`, `.diff-same`, `.diff-ellipsis`) to `options.css`. No inline styles. See **Styling Mandate** at top of plan.

**Notes:** Implement a simple LCS (longest common subsequence) diff algorithm. No npm dependency needed — the prompt texts are short (< 2KB typically). The algorithm should split on newlines, compare lines, and mark each as same/added/removed. **After generating the diff, apply ellipsis collapsing:** any run of 3+ consecutive "same" lines is replaced with a single "..." ellipsis line, keeping 1 context line before and after each changed section. This matches the `e2.png` mockup.

---

### Task 12T: Verify Diff Engine

**Intent:** Prove the diff algorithm is correct and all diff UI contexts render properly.

**Evidence checklist:**

| # | Check | Method | Evidence File | Pass If |
|---|-------|--------|---------------|---------|
| 1 | Basic diff correctness | Vitest | `tests/prompt-diff.test.ts` | `"A\nB\nC"` vs `"A\nX\nC"` → A=same, B=remove, X=add, C=same |
| 2 | Identical texts | Vitest | Same file | All lines marked "same" |
| 3 | Completely different texts | Vitest | Same file | All old=remove, all new=add |
| 4 | Empty old text | Vitest | Same file | All new lines are "add" |
| 5 | Empty new text | Vitest | Same file | All old lines are "remove" |
| 5b | Ellipsis collapse | Vitest | Same file | 10-line text with 1 change in middle → unchanged lines replaced by "..." with 1 context line on each side |
| 6 | Version history diff view | Screenshot | `evidence/12t-history-diff.png` | Matches `e2.png` — 2 version selector dropdowns, model selector, colored diff lines, "..." between change blocks |
| 7 | Inline editor diff | Screenshot | `evidence/12t-inline-diff.png` | Matches `a4b.png` — diff below textarea, dashed border, "Live diff vs generated" label |
| 8 | Live typing updates diff | Functional + video/screenshots | `evidence/12t-live-diff.png` | Type in editor → diff updates after debounce (~300ms) |
| 9 | Generation comparison diff | Screenshot | `evidence/12t-gen-compare.png` | Matches `b3.png` — header "Diff: Generation #1 → #2", "Use #1" / "Use #2" buttons |
| 10 | Color coding correct | Screenshot (any diff) | Cropped from above | Green background on "+" lines, red background on "-" lines, muted on unchanged |

**Procedure:**
1. Create `tests/prompt-diff.test.ts` with test cases for checks #1–5. Run `npm test -- tests/prompt-diff.test.ts` → capture output
2. Open version history → click "Diff" → select two different versions → screenshot (check #6)
3. Edit a generated prompt in the editor → verify inline diff appears below textarea → screenshot (check #7)
4. Continue typing → observe diff updates with debounce → screenshot or describe timing (check #8)
5. Generate prompt twice → click "Compare vs generation #1" → screenshot the generation comparison diff (check #9)
6. Inspect color coding in any diff view → verify green/red/muted colors (check #10)

**Pass gate:** All 11 checks green. Algorithm correctness (checks #1–5b) is mandatory before UI checks.

---

### Task 13: Add A/B Comparison to Test Harness

**Intent:** Run tests against two prompt versions and show side-by-side results.

**Mockup screenshots:** `d2b.png` (comparison results), `d1.png` (comparison setup)

**UI Component Inventory:**

**Comparison Setup** (from `d1.png`, `e4.png`):
- "Compare against:" label with radio buttons — one per available version:
  - "None" (default)
  - Individual radio per non-current version: "v1 — [summary]", "v2 — [summary]", etc.
  - When testing from history on a non-current version: additional "Current version (v[N])" radio
- Cost estimate updates: "5 questions × 1 model × 2 versions = ~$0.02"

**Comparison Results** (from `d2b.png`):
- **Comparison header** (from `d2b.png`): "Comparison: v3 (current) vs v2" — explicitly labeling which version is current
- **Summary scorecards** (top, 2-column grid):
  - Left card: Score "5/5" (18px bold, green) + "v3 (current)" label (xs muted)
  - Right card: Score "3/5" (18px bold, warning color) + "v2 (previous)" label
  - Green-tinted background on winner, yellow-tinted on loser

- **Per-question result cards:**
  - **Both pass:** Green checkmark + question text. Two columns: v3 response + "✓" badge | v2 response + "✓" badge
  - **One fails:** Warning triangle icon (⚠️) + question text (warning-tinted header, from `d2b.png`). Two columns: passing side shows response + "✓ Pass" green badge | failing side shows response + "✗ [reason]" red badge
  - **Both fail:** Red header with "✗" icon. Both columns show failing badges.
  - **Silence tests:** Same 2-column layout. Passing side: "---" + "✓ Silent" badge. Failing side: actual response text + "✗ Should be silent" badge.
  - **Behavioral context** (from `d2b.png`): Questions include parenthetical expected behavior hints, e.g., "Can you give us a discount? *(reframe to value)*" — muted italic text

- **Summary footer:** "v3: 5/5 pass · v2: 3/5 pass · Actual cost: $0.048"

- **Modal footer:** "Close" (secondary), "Edit Prompt to Fix →" (primary)

**Key components:**
- `src/options/sections/prompt-test-harness.ts` — comparison mode
- `src/services/prompt-test-runner.ts` — dual execution

**⚠️ CSS Mandate (sub-agent must read):** Comparison results reuse the test harness modal (Task 8). Score cards and side-by-side result grids are new components — add classes to `options.css`. Use `var(--color-success)` and `var(--color-warning)` for winner/loser tinting. All colors, spacing, and radii must use CSS custom properties. No inline styles. See **Styling Mandate** at top of plan.

**Notes:** Comparison mode is optional — default is "None" (single version). Cost estimate must update when comparison is toggled. The comparison version's prompt is loaded from `promptVersions`.

---

### Task 13T: Verify A/B Comparison

**Intent:** Prove the comparison mode runs two versions, displays side-by-side, and scoring is correct.

> **Requires:** API key for the target model. Persona with at least 2 prompt versions.

**Evidence checklist:**

| # | Check | Method | Evidence File | Pass If |
|---|-------|--------|---------------|---------|
| 1 | Comparison results layout | Screenshot | `evidence/13t-comparison.png` | Matches `d2b.png` — 2-column score cards, per-question side-by-side results |
| 2 | Cost estimate doubles | Functional + screenshot | `evidence/13t-cost-double.png` | Select "Compare against: v2" → cost shows "× 2 versions" |
| 3 | Side-by-side responses | Live test + screenshot | `evidence/13t-side-by-side.png` | Both versions' responses visible with independent pass/fail badges |
| 4 | Winner/loser tinting | Screenshot | Cropped from #1 | Better score card has green tint, worse has yellow/orange tint |
| 5 | "None" mode is single-version | Functional | Screenshot | With "None" selected → results show single column, no comparison |
| 6 | Both-pass question | Screenshot | Cropped from #1 | Question where both pass → both show green "✓" badge |
| 7 | One-fails question | Screenshot | Cropped from #1 | Question where one fails → failing side shows red "✗" badge |

**Procedure:**
1. Create a persona with v1 (weak prompt) and v2 (improved prompt)
2. Open test harness → Sample Qs tab → select "Compare against: v1" → screenshot cost update (check #2)
3. Click "Run Tests" → wait for results → screenshot full results page (checks #1, #3, #4, #6, #7)
4. Toggle back to "None" → verify single-column results (check #5) → screenshot

**Pass gate:** All 7 checks green. If only one API key is available, test with the default model.

---

### Task 14: Wire Persona Editor Buttons + Integration Orchestration

**Intent:** Connect the three new buttons to their modals/panels AND implement the full save/refresh orchestration that ties all components together. This is the integration task — see "User Flows" section above.

**Mockup screenshots:** `a1.png` (empty state), `c1.png` (existing prompt), `a7b.png` (post-save toast), `g1.png` (model mismatch), `h1.png` (legacy auto-v1), `i1.png` (discard warning), `i3.png` (no API key)

**UI Component Inventory:**

**Three action buttons** (below system prompt textarea, from `a1.png` and `c1.png`):
- "✨ Prompt Setup Assistant" — `.btn-primary .btn-small`
  - Always enabled when Gemini API key exists
  - Disabled with opacity 0.4 when no Gemini key (from `i3.png`)
  - Opens assistant chat modal (Task 4)
- "🧪 Test Current Prompts" — `.btn-secondary .btn-small`
  - Disabled when no prompt exists (opacity 0.4) — from `a1.png`
  - Disabled when no API key for current provider — from `i3.png`
  - Opens test harness modal (Task 8)
- "📋 Version History" — `.btn-secondary .btn-small`
  - Disabled when no versions exist — from `a1.png`
  - Shows version count badge: "v3" (uses existing `.persona-card-badge` pattern)
  - Opens version history panel (Task 11)
  - Always enabled even without API key (no API calls needed)

**Empty textarea placeholder text** (from `a1.png`):
- When system prompt is empty: `"No prompt configured yet. Use the Setup Assistant below to generate one."`

**Unsaved changes indicators** (from `f1.png`):
- **Orange dot indicator**: Small orange dot (6px circle, `var(--color-primary)`) + "Unsaved changes" text (xs font, primary color) — appears next to the System Prompt label when textarea content differs from last saved value
- **"modified" label**: Small muted text "modified" shown at the bottom-right corner of the textarea (inside the textarea container, absolute-positioned)
- **Dynamic button label**: When unsaved changes exist, the "🧪 Test Current Prompts" button label changes to "🧪 Test Before Saving" to encourage testing before saving manual edits

**Post-save confirmation** (from `a7b.png`):
- **Inline success banner** at top of editor card (NOT a floating toast) — green-tinted background with green checkmark icon
- Title: "**Prompt saved as v[N]**" (bold, white text)
- Subtext: "Model-optimized prompt (Gemini 2.5 Flash) · Test results: 6/6 pass · Cost: $0.052" (muted text, single line)
- Auto-dismisses after 5 seconds (fade out)
- After save: textarea updates to show new prompt, all 3 buttons enabled, version history badge updates

**Model mismatch warning** (from `g1.png`):
- Warning banner above the prompt textarea
- Background: warning-tinted (`rgba(var(--color-warning), 0.08)`)
- Text: "⚠️ Your active model changed to **[Model] ([Provider])**. This prompt was optimized for [Other Model]." — model name includes provider in parentheses (e.g., "Qwen 3 32B (Groq)")
- **System Prompt label annotation:** When a model-specific prompt exists, the "System Prompt" label shows an inline pill badge: "Optimized for: [Model Name]" (colored pill — provider-tinted background, e.g., orange-tinted for Groq/Qwen, blue-tinted for OpenRouter/Claude)
- Replaces normal action buttons with: "✨ Adapt Prompt for [Model]" (primary), "🧪 Test on [Model]" (secondary), "Keep as-is" (secondary)

**Adaptation result modal** (from `g2.png`) — triggered by clicking "Adapt Prompt for [Model]":
- **This is a modal showing the adaptation diff and action buttons.**
- Header: "Adapt Prompt: [Old Model] → [New Model]"
- **"Changes:" summary line** (from `g2.png`): One-line description of what the adaptation changed, e.g., "Changes: XML tags → markdown bullets, silence reinforcement adjusted, section reordering"
- Full diff view (reuses Task 12 diff engine): shows removed (old model format) and added (new model format) lines
- Footer: "Keep [Old Model]" (secondary) + "🧪 Test [New Model]" (secondary) + "Save [New Model]" (primary)
- Clicking "Test [New Model]" opens the test harness pre-loaded with the adapted prompt
- Clicking "Save [New Model]" triggers the save orchestration (creates new version, source: `'assistant'`, summary: "Adapted from [Old Model] to [New Model]")

**After adaptation save** (from `g3.png`):
- **Alternate success banner format**: "**Prompt adapted and saved as v[N]** — optimized for [New Model] ([Provider])" (different wording from normal save)
- **Inline version history auto-shown**: After saving an adaptation, the version history panel is shown inline below the buttons (same as h1.png auto-v1 behavior) to highlight the new version. This helps the user see the version was created. **Reduced button set in inline mode:** Non-current versions show only "Restore" button (no Diff/Test/Delete). Current version shows no action buttons. This is more compact than the full history panel (E1).

**Legacy auto-v1 state** (from `h1.png`):
- Info banner above textarea: blue-tinted background
- Text: "ℹ️ Your existing prompt has been imported as **v1**. You can now use the Setup Assistant, test it, or view its history."
- All three buttons enabled, version history shows "v1" badge
- **Version History panel visible below buttons** (not hidden — shown inline to highlight the import):
  - "Version History" section header
  - Single item: "v1" with "current" + "imported" (blue) badges
  - Summary: "Imported from existing persona prompt"
  - Stats: "No tests yet"
  - Only "🧪 Test" button (no Diff/Restore/Delete — only version and current)
- Shown once on first visit after Phase 24 deployment (for personas with existing prompts)

**No API key state** (from `i3.png`) — two distinct cases:
- **No Gemini API key**: Warning banner with "⚠️ No Gemini API key configured". Both "Prompt Setup Assistant" (needs Gemini for chat) and "🧪 Test" (needs API for test calls) are disabled. "📋 Version History" stays enabled.
- **Gemini key exists, but no key for target model's provider**: Warning banner with "⚠️ No [Provider] API key configured — [Model] requires a [Provider] key." Only "🧪 Test" is disabled (it needs the target model's API). "✨ Prompt Setup Assistant" stays enabled (uses Gemini for chat). "📋 Version History" stays enabled.
- In both cases: "Configure in Settings → Setup tab" link button (secondary, small, primary color text)
- Disabled buttons: opacity 0.4, cursor not-allowed, no hover effect

**Discard warning** (from `i1.png`):
- Triggered when closing any modal with unsaved changes
- Background: dimmed modal (opacity 0.3)
- Centered dialog (380px, use `.modal` pattern):
  - Large warning emoji: "⚠️" (32px, centered)
  - Title: "Unsaved Changes" (bold, centered)
  - Message: "You have edited prompts that haven't been saved. If you close now, your changes will be lost."
  - 3 buttons: "Discard" (secondary, danger text), "← Keep Editing" (secondary), "Save & Close" (primary)

**Saving behavior:**
- Saving from any modal updates the persona's `systemPrompt`, `modelPrompts`, and `promptVersions`
- Cmd/Ctrl+S shortcut works from within modals (saves current state)

**Key components:**
- `src/options/sections/personas.ts` — add button handlers, enable/disable logic, save-with-version logic
- `src/options/options.html` — **ADD** the 3 button elements (they do NOT exist yet)

**HTML additions required in `options.html`:**
1. Add a `<div class="prompt-actions">` container below the system prompt textarea inside `#persona-editor`
2. Inside it, add 3 buttons:
   - `<button id="btn-prompt-assistant" class="btn-primary btn-small">✨ Prompt Setup Assistant</button>`
   - `<button id="btn-test-prompt" class="btn-secondary btn-small">🧪 Test Current Prompts</button>`
   - `<button id="btn-version-history" class="btn-secondary btn-small">📋 Version History</button>`
3. Add the `#assistant-chat-overlay` modal container (for Task 4)
4. Add the `#test-harness-overlay` modal container (for Task 8)
5. Add the `#version-history-panel` panel container (for Task 11)

**Save orchestration (the integration glue):**

This task owns the full save flow that connects all components. When the user clicks "Save" from any context (review view, test results, manual edit), this code runs:

1. **Determine what changed:**
   - Which model was the prompt optimized for? (from model selector dropdown)
   - Is this a new version or overwriting current?
   - Were test results attached?

2. **Update persona storage:**
   - `persona.systemPrompt` ← new prompt text (always, for backward compat)
   - `persona.modelPrompts[modelId]` ← new prompt text (for per-model support)
   - Call `addPromptVersion()` (Task 2) with: prompt text, source, target model, test results summary
   - Call `savePersonas()` to persist

3. **Refresh editor UI:**
   - Update system prompt textarea with new text
   - Update version history badge count ("v3" → "v4")
   - Update character count display
   - If version history panel was open, refresh the version list

4. **Show confirmation:**
   - Inline success banner at top of editor card: "Prompt saved as v[N]" with subtext showing model + test results + cost (auto-dismiss after 5s)

5. **Clear transient state:**
   - Clear `lastGeneratedPrompt` from memory
   - Mark modal as "no unsaved changes" (discard warning no longer triggers)

**Button enable/disable orchestration on editor load:**
1. Read active persona from storage
2. Read active provider + API keys from storage (Gemini key + target model's provider key)
3. "✨ Prompt Setup Assistant": enabled if Gemini API key exists (uses Gemini for chat regardless of target model); disabled otherwise
4. "🧪 Test Current Prompts": enabled if prompt exists AND target model's provider API key exists; disabled otherwise. Label changes to "🧪 Test Before Saving" when textarea has unsaved edits (f1.png)
5. "📋 Version History": enabled if `promptVersions` exists and length > 0 (or lazy auto-v1 will create one); disabled only if no prompt at all. Always enabled regardless of API keys (no API calls needed)
6. Model mismatch check: compare last saved `targetModel` with current active model → show warning banner if different
7. Unsaved changes detection: compare textarea value against last saved `systemPrompt` — show orange dot indicator + "modified" label when different (f1.png)

**⚠️ CSS Mandate (sub-agent must read):** All buttons use existing `.btn-primary`, `.btn-secondary`, `.btn-small` classes from `options.css`. Warning banners and info banners use CSS custom properties (`var(--color-warning)`, `var(--color-primary)`) with tinted backgrounds. The inline success banner is a new component — add to `options.css`. The discard warning dialog uses existing `ModalManager.showConfirmModal()`. No inline styles, no hardcoded colors. See **Styling Mandate** at top of plan.

**Notes:** These buttons do NOT exist in the current HTML. They must be added. The persona editor currently has: name input, color picker, system prompt textarea, KB section, and save/cancel buttons. The 3 new buttons go between the prompt textarea and the KB section.

---

### Task 14T: Verify Integration Orchestration (End-to-End Flows)

**Intent:** Prove all user flows work end-to-end: the full journey from button click to saved version, across all components.

> **Requires:** Gemini API key. Persona with KB docs for Flow A. This is the most comprehensive test task.

**Evidence checklist:**

| # | Check | Method | Evidence File | Pass If |
|---|-------|--------|---------------|---------|
| 1 | **Flow A:** New persona, first prompt | End-to-end live test | `evidence/14t-flow-a-*.png` (series) | Empty persona → assistant → discovery → generate → save → textarea updated, toast, v1 in history, `chrome.storage.local` has `promptVersions` |
| 2 | **Flow B:** Re-enter and iterate | End-to-end live test | `evidence/14t-flow-b-*.png` (series) | Reopen assistant → context loaded → regenerate → diff shown → save as v2 → badge updates |
| 3 | **Flow C:** Direct test | End-to-end live test | `evidence/14t-flow-c-*.png` (series) | "Test Current Prompts" → test harness → run → close → editor unchanged, no state corruption |
| 4 | **Flow D:** Version management | End-to-end live test | `evidence/14t-flow-d-*.png` (series) | Open history → restore v1 → v3 created → textarea shows v1 content |
| 5 | Empty state buttons | Screenshot | `evidence/14t-empty-state.png` | Matches `a1.png` — "Test" and "History" disabled |
| 6 | Existing prompt buttons | Screenshot | `evidence/14t-existing-prompt.png` | Matches `c1.png` — all 3 buttons enabled |
| 7 | No Gemini key state | Screenshot | `evidence/14t-no-key.png` | Matches `i3.png` — warning banner, "Assistant" and "Test" disabled, "History" enabled |
| 7b | Partial key state | Screenshot | `evidence/14t-partial-key.png` | Gemini key present but target provider key missing → "Assistant" enabled, "Test" disabled, "History" enabled |
| 8 | Post-save toast | Screenshot | `evidence/14t-toast.png` | Matches `a7b.png` — toast with version + model + test results |
| 9 | Model mismatch warning | Screenshot | `evidence/14t-mismatch.png` | Matches `g1.png` — warning banner with "Adapt" button |
| 9b | Adaptation result modal | Screenshot | `evidence/14t-adapt-result.png` | Matches `g2.png` — diff view with "Changes:" summary, 3 footer buttons |
| 9c | After-adaptation inline history | Screenshot | `evidence/14t-adapt-history.png` | Matches `g3.png` — success banner + version history shown inline |
| 9d | Unsaved changes indicators | Screenshot | `evidence/14t-unsaved.png` | Matches `f1.png` — orange dot, "modified" label, "Test Before Saving" button |
| 10 | Legacy auto-v1 banner | Screenshot | `evidence/14t-legacy-v1.png` | Matches `h1.png` — info banner on persona with existing prompt but no versions |
| 11 | Discard warning | Screenshot | `evidence/14t-discard.png` | Matches `i1.png` — 3 buttons: Discard, Keep Editing, Save & Close |
| 12 | Cmd/Ctrl+S saves from modal | Functional | Screenshot | Press Cmd+S inside assistant modal → prompt saved, toast appears |
| 13 | Storage verification | DevTools inspection | `evidence/14t-storage.png` | `chrome.storage.local` shows persona with `modelPrompts`, `promptVersions`, and updated `systemPrompt` |

**Procedure:**

**Flow A (check #1):**
1. Create a new persona with empty prompt
2. Screenshot empty state (check #5)
3. Click "Prompt Setup Assistant" → complete discovery (2-3 exchanges)
4. Click "Generate" → review view appears
5. Click "Save as v1" → screenshot: toast (check #8), updated textarea, "v1" badge
6. Open DevTools → Application → chrome.storage.local → find persona → screenshot `promptVersions` (check #13)

**Flow B (check #2):**
7. Reopen assistant on same persona → verify context loaded
8. Describe a change → "Regenerate" → verify diff available
9. Save as v2 → verify badge updates to "v2"

**Flow C (check #3):**
10. Click "Test Current Prompts" → run 3 questions → screenshot results
11. Close test harness → verify editor textarea unchanged

**Flow D (check #4):**
12. Click "Version History" → verify list shows v1 and v2
13. Click "Restore" on v1 → verify v3 created → textarea shows v1's content

**Edge cases:**
14. Remove Gemini API key → reload page → open persona editor → screenshot (check #7)
14b. Add Gemini key back but remove OpenRouter/Groq key → reload → open persona editor → screenshot (check #7b) — verify "Assistant" enabled, "Test" disabled
15. Create persona with existing `systemPrompt` but no versions → open editor → screenshot auto-v1 banner (check #10)
16. Start editing in assistant modal → click close → screenshot discard warning (check #11) → test all 3 buttons
17. Open assistant modal → press Cmd/Ctrl+S → verify save triggers (check #12)
18. Change active model to one that differs from saved prompt's target → open editor → screenshot mismatch warning (check #9)

**Pass gate:** All 17 checks green. This is the final integration gate before service worker changes.

---

### Task 15: Update Service Worker for Per-Model Prompts

**Intent:** Make the service worker use model-specific prompts when available.

**Expected behavior:**
- On `START_SESSION`:
  1. Load active persona (existing)
  2. Determine active model from provider config
  3. Check `persona.modelPrompts[activeModelId]`
  4. If exists → use model-specific prompt
  5. If not → fall back to `persona.systemPrompt` (existing behavior)
- Log which prompt source was used: "Using model-optimized prompt for Claude Sonnet 4" or "Using generic prompt (no model-specific version)"
- For Hydra (multi-persona): each persona can have different model-specific prompts

**Session snapshot update (CRITICAL):** The service worker snapshots active personas at session start (lines 289–295 in `service-worker.ts`). The current snapshot copies only `{id, name, color, systemPrompt, kbDocumentIds}`. **You must add `modelPrompts` to the snapshot**, otherwise per-model prompts won't be available during the session:

```typescript
// BEFORE (current):
sessionPersonas = personas.map(p => ({
  id: p.id,
  name: p.name,
  color: p.color,
  systemPrompt: p.systemPrompt,
  kbDocumentIds: p.kbDocumentIds,
}));

// AFTER (Phase 24):
sessionPersonas = personas.map(p => ({
  id: p.id,
  name: p.name,
  color: p.color,
  systemPrompt: p.systemPrompt,
  kbDocumentIds: p.kbDocumentIds,
  modelPrompts: p.modelPrompts,  // ← ADD THIS
}));
```

Then change the prompt selection logic (line 303):

```typescript
// BEFORE:
geminiClient.setSystemPrompt(primary.systemPrompt);

// AFTER:
const activeModelId = geminiClient.getActiveModel();
const modelPrompt = primary.modelPrompts?.[activeModelId];
geminiClient.setSystemPrompt(modelPrompt ?? primary.systemPrompt);
console.log(modelPrompt
  ? `[ServiceWorker] Using model-optimized prompt for ${activeModelId}`
  : `[ServiceWorker] Using generic prompt (no model-specific version)`
);
```

**Key components:**
- `src/background/service-worker.ts` — modify persona snapshot + prompt selection

**Notes:** Two changes in one file: (1) extend the snapshot to include `modelPrompts`, (2) add model-specific lookup before `setSystemPrompt()`. The model ID comes from `geminiClient.getActiveModel()`.

**No UI — no screenshot reference.**

---

### Task 15T: Verify Service Worker Per-Model Prompts

**Intent:** Prove the service worker correctly selects model-specific prompts at session start.

> **Requires:** Gemini API key + a Google Meet tab (or test via manual `START_SESSION` message).

**Evidence checklist:**

| # | Check | Method | Evidence File | Pass If |
|---|-------|--------|---------------|---------|
| 1 | Model-specific prompt used | Live session + SW console | `evidence/15t-model-prompt.png` | Log: "Using model-optimized prompt for gemini-2.5-flash" |
| 2 | Fallback to generic prompt | Live session + SW console | `evidence/15t-fallback.png` | Switch to model without `modelPrompts` entry → log: "Using generic prompt" |
| 3 | Backward compat — no `modelPrompts` | Live session + SW console | `evidence/15t-backward-compat.png` | Persona without `modelPrompts` field → session starts, uses `systemPrompt`, no errors |
| 4 | Snapshot includes `modelPrompts` | Code review | N/A | `sessionPersonas` map includes `modelPrompts: p.modelPrompts` |
| 5 | Typecheck passes | `npm run typecheck` | Console output | Zero errors |

**Procedure:**
1. **Setup model-specific prompt:** Via DevTools or the Phase 24 UI, set `persona.modelPrompts['gemini-2.5-flash'] = "Model-specific prompt for Gemini"` on a persona
2. Set that persona as active → start a session → open service worker console (`chrome://extensions/` → SW link) → screenshot log (check #1)
3. Switch provider to OpenRouter with a model that has no `modelPrompts` entry → start session → screenshot log showing fallback (check #2)
4. Use a different persona that has NO `modelPrompts` field at all → start session → screenshot log showing no errors (check #3)
5. Review `service-worker.ts` → verify the snapshot map includes `modelPrompts` (check #4)
6. Run `npm run typecheck` (check #5)

**Pass gate:** All 5 checks green. Backward compatibility (check #3) is critical — existing users must not be affected.

---

### Task 16: Add CSS for All New Components

**Intent:** Style the chat modal, test harness, version history, and all sub-components.

**Mockup screenshots:** ALL screenshots are reference for layout/components. Styling must follow `options.css` design system tokens — not the mockup's inline styles.

**New CSS classes needed:**

**Chat Modal:**
- `.assistant-chat-modal` — modal extending `.modal` with max-width 600px
- `.chat-messages` — scrollable message list (flex column, gap `var(--spacing-sm)`)
- `.chat-msg` — message row (flex, gap `var(--spacing-sm)`)
- `.chat-msg--bot` — left-aligned
- `.chat-msg--user` — right-aligned (flex-direction: row-reverse)
- `.chat-avatar` — 28px circle, gradient background, flex-shrink 0
- `.chat-bubble` — message bubble (background: `var(--color-bg-page)`, border: `1px solid var(--color-border)`, border-radius: `var(--radius-lg)`, padding: `var(--spacing-sm) var(--spacing-md)`)
- `.chat-bubble--user` — override with primary background, white text
- `.chat-bubble--error` — danger-tinted background and border
- `.chat-quick-reply` — inline button row (flex, wrap, gap `var(--spacing-xs)`)
- `.chat-summary` — inset summary box within bubble (different background, border, padding)
- `.chat-cost-hint` — muted xs text in header

**Test Harness:**
- `.test-tabs` — tab bar (reuse existing `.tab` pattern)
- `.test-question-group` — section with label + checkbox list
- `.test-question-group-label` — uppercase xs muted label
- `.test-question-item` — flex row: checkbox + text + badge + optional remove button
- `.test-expected-badge` — small pill badge ("should respond" green, "should stay silent" red)
- `.test-cost-estimate` — primary-tinted background box with cost text
- `.test-result-card` — card with question header + response content
- `.test-result-header` — grid header row (1 or 2 columns for comparison)
- `.test-result-cell` — response cell with provider label + text + pass/fail badge
- `.test-pass-badge` — green background pill: "✓ Pass" or "✓ Silent"
- `.test-fail-badge` — red background pill: "✗ [reason]"
- `.test-error-badge` — warning background pill: "⚠ Error"
- `.test-success-banner` — green-tinted full-width banner for all-pass
- `.test-fail-banner` — red-tinted full-width banner for all-fail
- `.test-interrupted-banner` — warning-tinted banner for mid-run errors
- `.test-comparison-summary` — 2-column grid with score cards

**Version History:**
- `.history-panel` — panel replacing editor content
- `.history-item` — version card (flex, align items center, padding, border, border-radius)
- `.history-item--current` — primary border highlight
- `.history-item--source` — warning border highlight (after restore)
- `.history-meta` — flex column: version label + summary + stats
- `.history-version-badge` — "current" pill badge (primary ring border)
- `.history-source-badge` — source label pill ("manual edit", "assistant", "restored from v[N]")
- `.history-actions` — button row (flex, gap)

**Diff View:**
- `.diff-block` — monospace container (`var(--font-mono)`, 12px, 1.7 line-height)
- `.diff-add` — green-tinted background + green "+" prefix text
- `.diff-remove` — red-tinted background + red "-" prefix text
- `.diff-same` — muted text, no background

**Model Selector:**
- `.model-selector` — wrapper for dropdown + provider badge
- `.model-badge` — small pill next to dropdown showing provider name
- `.model-badge--direct` — blue background
- `.model-badge--openrouter` — purple background
- `.model-badge--groq` — green background

**Shared:**
- `.version-badge` — "Version: v1" display with muted context text
- `.cost-hint` — muted cost text used in various places
- `.editing-indicator` — pulsing dot + "Editing — unsaved changes" text
- `.warning-banner` — contextual warning bar (warning-tinted background)
- `.info-banner` — informational bar (blue-tinted background)

**Key components:**
- `src/options/options.css` — add new styles

**⚠️ CSS Mandate (sub-agent must read):** This IS the styling task. Every new class must follow existing `options.css` conventions exactly. Rules: (1) All colors use `var(--color-*)` tokens — zero hex, zero raw `rgb()`. (2) All spacing uses `var(--spacing-*)` — zero hardcoded `px` except `0`, `1px` borders, and specific dimension values like avatar `28px`. (3) Zero `!important`. (4) Dark mode only — use existing `[data-theme="dark"]` overrides if needed. (5) Glass-morphism cards use existing `.options-card` pattern. (6) Buttons reuse `.btn-primary`, `.btn-secondary`, `.btn-small`. (7) Inputs reuse `.text-input`, `.select-input`. (8) Modals reuse `.modal-overlay`, `.modal`. See **Styling Mandate** at top of plan.

**Notes:** Reference mockup screenshots for layout/components. All colors must use CSS custom properties. Test with dark mode (the only mode in practice). Glass-morphism cards match existing `.options-card` style.

---

### Task 16T: Verify CSS Styling Compliance

**Intent:** Prove all new CSS follows the design system and no hardcoded values exist.

**Evidence checklist:**

| # | Check | Method | Evidence File | Pass If |
|---|-------|--------|---------------|---------|
| 1 | All colors use tokens | Code review (grep) | `evidence/16t-color-audit.txt` | Zero instances of `#xxx` or `rgb()` outside of `var()` wrappers in new CSS |
| 2 | All spacing uses tokens | Code review (grep) | Same file | Zero instances of hardcoded `px` for margin/padding (except `0`, `1px` borders, and specific dimensions like `28px` avatar) |
| 3 | No `!important` | Code review (grep) | Same file | Zero `!important` in new CSS classes |
| 4 | Chat modal visual | Screenshot | `evidence/16t-chat-visual.png` | Glassmorphism card style, design system colors (not mockup colors) |
| 5 | Test harness visual | Screenshot | `evidence/16t-test-visual.png` | Tabs, badges, result cards use design system tokens |
| 6 | Version history visual | Screenshot | `evidence/16t-history-visual.png` | Items match existing `.options-card` pattern |
| 7 | Diff view visual | Screenshot | `evidence/16t-diff-visual.png` | Monospace font, green/red **tinted** backgrounds (not pure green/red) |
| 8 | Dark mode rendering | Screenshot | `evidence/16t-dark-mode.png` | All components render correctly in dark mode |

**Procedure:**
1. **Code audit:** Search `options.css` for all new Phase 24 classes. For each class:
   - Verify all `color`, `background`, `border-color` values use `var(--color-*)` or `rgba()` with token references
   - Verify all `margin`, `padding`, `gap` values use `var(--spacing-*)` or are zero/auto
   - Verify no `!important`
   - Save audit results to `evidence/16t-color-audit.txt`
2. **Visual inspection:** Open the options page in Chrome → navigate through each Phase 24 component → screenshot each (checks #4–8)
3. **Comparison:** Place each screenshot next to the corresponding mockup. The LAYOUT should match, but COLORS should be the design system's dark mode palette (not the mockup's inline styles)

**Pass gate:** All 8 checks green. The code audit (checks #1–3) catches issues that visual inspection might miss.

---

### Task 17: Final Build, Typecheck, and Full Verification

**Intent:** Final compilation check + aggregated evidence review across ALL verification tasks.

**Expected behavior:**
- `npm run build` succeeds with no TypeScript errors
- `npm run typecheck` passes
- `npm run lint` passes (or only pre-existing warnings)
- All Vitest tests pass: `npm test`
- All evidence from Tasks 1T–16T is collected and reviewed

**Build verification:**

| # | Command | Pass If |
|---|---------|---------|
| 1 | `npm run typecheck` | Zero errors |
| 2 | `npm run build` | Build completes, `dist/` folder generated |
| 3 | `npm run lint` | Zero new warnings (pre-existing OK) |
| 4 | `npm test` | All tests pass (including new tests from 1T, 2T, 3T, 9T, 12T) |

**Evidence aggregation — verify all prior VERIFY tasks produced their evidence:**

| Task | Evidence Count | Status |
|------|---------------|--------|
| 1T | 5 checks (Vitest + typecheck) | [ ] All green |
| 2T | 8 checks (Vitest) | [ ] All green |
| 3T | 11 checks (Vitest + code review) | [ ] All green |
| 4T | 10 checks (screenshots + functional) | [ ] All green |
| 5T | 8 checks (live tests + screenshots) | [ ] All green |
| 6T | 7 checks (live tests + cache) | [ ] All green |
| 7T | 8 checks (live tests + screenshots) | [ ] All green |
| 8T | 13 checks (screenshots + functional) | [ ] All green |
| 9T | 10 checks (Vitest + live tests) | [ ] All green |
| 10T | 6 checks (live KB tests) | [ ] All green |
| 11T | 10 checks (screenshots + functional) | [ ] All green |
| 12T | 11 checks (Vitest + screenshots) | [ ] All green |
| 13T | 7 checks (functional + live) | [ ] All green |
| 14T | 17 checks (end-to-end flows) | [ ] All green |
| 15T | 5 checks (live session tests) | [ ] All green |
| 16T | 8 checks (code review + visual) | [ ] All green |
| **Total** | **144 checks** | |

**Final screenshot sweep — one screenshot per major component:**

| # | Component | Mockup | Final Evidence |
|---|-----------|--------|---------------|
| 1 | Chat modal with conversation | `a2.png` | `evidence/final-chat.png` |
| 2 | Template preview | `a2b.png` | `evidence/final-template.png` |
| 3 | Review with model selector | `a3.png` | `evidence/final-review.png` |
| 4 | Claude XML-adapted prompt | `a3c.png` | `evidence/final-claude.png` |
| 5 | Edit mode + inline diff | `a4.png`, `a4b.png` | `evidence/final-edit-diff.png` |
| 6 | Test harness (all 3 tabs) | `a5.png`, `a5b.png`, `a5c.png` | `evidence/final-test-tabs.png` |
| 7 | Test results (pass/fail) | `a5.png`, `d2.png` | `evidence/final-results.png` |
| 8 | Version history list | `e1.png` | `evidence/final-history.png` |
| 9 | Diff between versions | `e2.png` | `evidence/final-diff.png` |
| 10 | A/B comparison | `d2b.png` | `evidence/final-ab.png` |
| 11 | Post-save toast | `a7b.png` | `evidence/final-toast.png` |
| 12 | Empty state | `a1.png` | `evidence/final-empty.png` |
| 13 | All-pass success | `i2.png` | `evidence/final-all-pass.png` |
| 14 | Error states | `i4.png`, `i5.png`, `i6.png` | `evidence/final-errors.png` |
| 15 | Legacy auto-v1 | `h1.png` | `evidence/final-legacy.png` |
| 16 | Adaptation result modal | `g2.png` | `evidence/final-adaptation.png` |
| 17 | Unsaved changes indicators | `f1.png` | `evidence/final-unsaved.png` |

**Key components:**
- All modified and new files

---

## File Changes Summary

| File | Changes |
|------|---------|
| `src/shared/persona.ts` | Extend `Persona` interface with `modelPrompts`, `promptVersions` + new types |
| `src/shared/model-tuning.ts` | **READ-ONLY** — import `getModelFamily()`, `MODEL_FAMILY_MAP` for family detection in prompt-adapter |
| `src/services/prompt-assistant-engine.ts` | **NEW** — Discovery chat logic, template matching, prompt generation |
| `src/services/prompt-adapter.ts` | **NEW** — Structural prompt formatting (XML tags, numbered lists, etc.) — does NOT include runtime tuning |
| `src/services/prompt-version.ts` | **NEW** — Version CRUD, auto-summary, lazy auto-v1 |
| `src/services/prompt-test-runner.ts` | **NEW** — Lightweight API caller (~50 lines) for test execution against all 3 providers |
| `src/services/prompt-diff.ts` | **NEW** — Line-level diff algorithm |
| `src/options/sections/prompt-assistant-chat.ts` | **NEW** — Chat modal UI and state |
| `src/options/sections/prompt-test-harness.ts` | **NEW** — Test harness modal UI |
| `src/options/sections/prompt-version-history.ts` | **NEW** — Version history panel UI |
| `src/options/sections/personas.ts` | Add 3 new button handlers, enable/disable logic, save-with-version logic |
| `src/options/options.html` | **ADD** 3 action buttons + `#assistant-chat-overlay` + `#test-harness-overlay` + `#version-history-panel` containers |
| `src/options/options.css` | Add styles for all new components |
| `src/background/service-worker.ts` | Extend session snapshot with `modelPrompts` + add model-specific prompt lookup |

---

## Migration

**No bulk migration needed.** All new fields are optional:
- `modelPrompts` — undefined = use `systemPrompt` (existing behavior)
- `promptVersions` — undefined = no history (empty state)

**Lazy auto-v1 (H1 screen):** When a user opens version history for a persona that has `systemPrompt` but no `promptVersions`, the system auto-creates a v1 entry from the existing prompt. This happens on first access, not at install time. The user sees their existing prompt as "v1 — Initial prompt" in the history. Subsequent saves create v2, v3, etc. normally. This is implemented in `getPromptVersions()` (Task 2).

---

## Out of Scope

- **Automatic prompt regeneration on model switch** — User must manually re-run the assistant when switching models. Auto-regeneration could be a future enhancement.
- **Prompt sharing/export as standalone** — Use existing persona export which includes prompts.
- **Multi-language assistant chat** — Discovery chat is English-only. Generated prompts can target any language.
- **Prompt quality scoring** — No automated quality metric beyond test pass/fail.
- **Batch testing across all models** — Tests run against one model at a time. Cross-model comparison is out of scope.
- **Custom silence tokens** — Always uses `---`. Custom tokens would require changes throughout the pipeline.
- **Real-time prompt preview during chat** — The prompt is generated after discovery, not streamed during.
- **Prompt cost tracking integration** — Phase 18 cost tracking is separate. Test costs are shown but not aggregated.

---

## Success Criteria

1. Users can generate optimized prompts through guided chat (< 60 seconds)
2. Generated prompts use model-specific formatting (verified by visual inspection and test harness)
3. Test harness correctly identifies silence failures and KB citation issues
4. Version history tracks all saves with working diff and restore
5. Service worker uses model-specific prompts when available
6. Backward compatible — existing personas work unchanged
7. TypeScript compiles with no errors
8. Evidence screenshots for all 20 verification items match mockup references

---

## Dependencies

- Gemini API key (required — chat and generation always use Gemini)
- Target model's API key (required for testing against non-Gemini models)
- No new npm packages required
- References: `llm-prompting-research.md` for model-specific transformation rules

---

## References

- [Ideation Document](./ideation.md)
- [Per-Model Prompting Research](./llm-prompting-research.md)
- [UI Mockup (41 screens)](../../wingman-ai/extension/src/tutorials/screenshots-new/mock-prompt-setup-assistant.html)
- [Mockup Screenshots](./mockup-screenshots/) — 41 PNG captures of every screen
- [Default System Prompt](../../wingman-ai/extension/src/shared/default-prompt.ts)
- [LLM Config](../../wingman-ai/extension/src/shared/llm-config.ts)
- [Model Tuning (runtime adaptations)](../../wingman-ai/extension/src/shared/model-tuning.ts) — **READ BEFORE Task 3**
- [Persona Model](../../wingman-ai/extension/src/shared/persona.ts)
- [Options Page CSS (Design System)](../../wingman-ai/extension/src/options/options.css)
