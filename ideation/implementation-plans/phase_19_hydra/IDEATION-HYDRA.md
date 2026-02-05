# Phase 19: Hydra — Multi-Persona Conclave

## The Idea

Instead of choosing one persona per session, users activate a **conclave** of personas. Each persona brings its own expertise, system prompt, and knowledge base. During a call, the right persona responds at the right moment — a fundraising coach when the investor asks about traction, a negotiation expert when pricing comes up, a legal advisor when contract terms surface.

The name "Hydra" — many heads, one body.

---

## Why This Matters

**Current limitation**: Users must pick ONE persona before a call. But real conversations don't stay in one lane. A fundraising call might pivot to legal terms, then technical architecture, then hiring plans. One persona can't cover all of that well.

**User value**: A startup founder preparing for a board meeting could activate "Startup Founder (Fundraising)" + "Cloud Solutions Sales" + a custom "Board Governance" persona — each contributing when their expertise matches the conversation.

---

## What Needs to Change: The Full Blast Radius

### Every layer has single-persona assumptions baked in.

| Layer | Current (Single) | Hydra (Multi) |
|-------|-------------------|----------------|
| **Storage** | `activePersonaId: string` | `activePersonaIds: string[]` |
| **Popup** | Single dropdown selector | Multi-select (checkboxes or chips) |
| **Service Worker** | Loads ONE persona on session start | Loads N personas, manages routing |
| **GeminiClient** | ONE `systemPrompt` + ONE `kbDocumentFilter` | Multiple prompt/KB contexts |
| **KB Search** | Scoped to one persona's `kbDocumentIds` | Per-persona scoped searches or union |
| **Suggestion Pipeline** | One LLM call per transcript | Multiple calls or smart routing |
| **Cooldown** | One shared timer | Per-persona or shared with rotation |
| **Concurrency** | `isGenerating` boolean blocks overlap | Needs per-persona or parallel strategy |
| **Overlay Header** | One persona label | Multiple persona chips/dots |
| **Suggestion Bubbles** | No persona attribution | Color-coded persona badge per suggestion |
| **Cost Tracking** | One provider/model per session | Same (provider stays the same) but more calls |
| **Post-Call Summary** | No persona reference | Per-persona attribution or combined |
| **Transcript Collector** | No persona metadata on suggestions | `personaId` + `personaName` on each suggestion |
| **Drive Export** | No persona info | Persona attribution in exported docs |
| **Options Page** | Individual persona editor | New "Hydra Presets" or grouping UI |

---

## Architecture Options

### Option A: Parallel Multi-Call

**How it works**: On each transcript, fire LLM calls to ALL active personas simultaneously. Each gets its own system prompt + KB context. Display all non-silent responses.

```
Transcript arrives
  ├─ Persona 1: system prompt A + KB docs A → LLM → suggestion (or ---)
  ├─ Persona 2: system prompt B + KB docs B → LLM → suggestion (or ---)
  └─ Persona 3: system prompt C + KB docs C → LLM → suggestion (or ---)
```

**Pros**:
- Highest quality — each persona uses its full prompt
- Maximum coverage — all expertise areas active
- LLM already handles silence well (`---` response)
- Parallel fetch() calls are fast

**Cons**:
- N× API cost per transcript (3 personas = 3× cost)
- N× token usage
- Multiple suggestions per transcript could overwhelm the user
- Rate limits hit faster (especially Gemini free tier)

**Mitigations**:
- Personas that respond `---` cost minimal output tokens (input cost is unavoidable)
- Cap active personas at 3-4
- Stagger display if multiple respond (don't flood)
- Show cost impact clearly in UI

---

### Option B: Smart Router (Two-Stage)

**How it works**: A lightweight "router" LLM call classifies the transcript, then routes to the most relevant persona. Only one persona responds per transcript.

```
Transcript arrives
  → Router call: "Which persona is most relevant? A, B, C, or NONE"
  → Router picks B
  → Persona B: full system prompt + KB → LLM → suggestion
```

**Pros**:
- Cost is 1 router call + 1 full call (not N calls)
- User sees one focused suggestion per transcript
- Clever and elegant

**Cons**:
- Extra latency from the router call (adds 500ms-2s)
- Router needs to understand all personas' domains (meta-prompt)
- Router accuracy is a new failure mode — wrong persona gets the transcript
- More complex to implement and debug
- Router call itself costs tokens

**Mitigations**:
- Router can use a small/cheap model (Flash, Haiku, 8B)
- Cache router decisions for similar topics

---

### Option C: Round-Robin Rotation

**How it works**: Personas take turns responding. Persona 1 gets transcript 1, Persona 2 gets transcript 2, etc.

**Pros**:
- Same cost as single persona
- Dead simple implementation
- Each persona sees the full conversation history

**Cons**:
- The wrong persona might respond at the wrong time
- No intelligence in routing — pure mechanical rotation
- Feels arbitrary to users

**Verdict**: Too dumb. Users would hate getting a negotiation tip when they need technical help.

---

### Option D: Merged Mega-Prompt

**How it works**: Combine all active personas' system prompts into one. Single LLM call with instructions to "respond from the most relevant perspective."

**Pros**:
- Same cost as single persona
- Simple implementation

**Cons**:
- Prompt gets huge (3 personas × 2-5KB prompts = 6-15KB of system prompt)
- Quality degrades — competing instructions confuse the model
- Loses distinct persona "voices"
- KB context from multiple personas further bloats the prompt
- Model tuning profiles conflict (different temperatures per persona)

**Verdict**: Defeats the purpose. The whole point is specialized expertise, not one confused generalist.

---

### Recommended: Option A (Parallel) with Smart Guardrails

Option A is the right choice because:
1. **Quality first** — each persona operates at full capability
2. **LLMs are already good at staying silent** — most calls will produce 0-1 responses, not N
3. **Parallel fetch is fast** — wall-clock time barely increases
4. **User sees the value** — different personas contributing different expertise
5. **Cost transparency** — we already have the cost tracker; users can see the tradeoff

**Guardrails to make it work**:
- Cap at 4 active personas (UI constraint only — no cost warnings)
- Per-persona cooldowns (independent timers)
- Exact string dedup — if two personas produce identical text, merge persona badges on one bubble
- Stagger parallel API calls by ~100ms to reduce burst rate limiting

---

## UI Design

### Popup: Multi-Select Personas

**Current**: Dropdown with single selection + colored dot.

**Hydra**: Persona cards with toggles or checkboxes. Each card shows name + color + active state. All personas are treated equally — no primary/priority distinction.

```
┌──────────────────────────────┐
│ Active Personas              │
│                              │
│ ● Startup Founder     [ON]  │
│ ● Cloud Solutions     [ON]  │
│ ○ Job Interview       [OFF] │
│ ○ Freelancer          [OFF] │
│                              │
│ 2 active · ~2× cost         │
└──────────────────────────────┘
```

Active count updates dynamically: "1 active" / "2 active" / "3 active" / "4 active". No cost warnings — users decide their own spending.

### Overlay Header

**Current**: `Wingman · Startup Founder (Fundraising)`

**Hydra**: Multiple colored dots/chips, one per active persona.

```
┌─────────────────────────────────────────────┐
│ 🟢 Wingman  ●● ●●           ~$0.04   — ✕  │
│              ↑               ↑              │
│       colored dots      cost ticker         │
│       (hover = name)                        │
└─────────────────────────────────────────────┘
```

Each dot is the persona's assigned color. Hover shows persona name tooltip.

### Suggestion Bubbles: Persona Attribution

**Current**: All suggestions say "Wingman" with a type badge (ANSWER/OBJECTION/INFO).

**Hydra**: Add persona name + color to each suggestion.

```
┌──────────────────────────────────────────┐
│ ★ Wingman · Startup Founder    ANSWER    │
│                                          │
│ Your CAC is $4,713 with a 14-month       │
│ payback period...                        │
│                                          │
│ 📚 Based on: fundraising-kb.md          │
│                                 10:42 AM │
└──────────────────────────────────────────┘
```

The left border color matches the persona's color (already have colored borders for type — repurpose or combine).

### Post-Call Summary

Add a "Personas Used" line to the summary metadata:
```
Date: Feb 5, 2026 · Duration: 23 min · 2 speakers
Personas: Startup Founder, Cloud Solutions
```

The **conclave leader** (selected by the user in the Conclave tab in Options) determines which persona's system prompt guides the summary generation. A note in the Conclave tab explains this setting.

---

## Data Model Changes

### Storage

```typescript
// Before
activePersonaId: string

// After
activePersonaIds: string[]   // unordered array, all equal
activePersonaId: string       // KEEP for backward compat (= first in array)
conclaveLeaderId: string      // which persona guides post-call summary
```

### Suggestion Metadata

```typescript
// Add to suggestion data flowing through the system
interface Suggestion {
  // ... existing fields
  personaId?: string;      // which persona generated this
  personaName?: string;    // display name
  personaColor?: string;   // for UI coloring
}
```

### Transcript Collector

Add persona attribution to collected suggestions:
```typescript
interface CollectedTranscript {
  // ... existing fields
  persona_id?: string;
  persona_name?: string;
}
```

---

## Service Worker Changes

### Session Start

```typescript
// Before
const persona = await getActivePersona();
geminiClient.setSystemPrompt(persona.systemPrompt);
geminiClient.setKBDocumentFilter(persona.kbDocumentIds);

// After
const personas = await getActivePersonas(); // returns array
// Store as session-scoped array of { id, name, color, systemPrompt, kbDocumentIds }
// No longer set a single prompt on geminiClient
```

### Suggestion Pipeline

```typescript
// Before: one call
const suggestion = await geminiClient.processTranscript(text, speaker, isFinal);

// After: parallel calls, one per active persona
const promises = activePersonas.map(persona =>
  geminiClient.processTranscriptForPersona(text, speaker, isFinal, persona)
);
const results = await Promise.allSettled(promises);
// Filter out silent (---) and failed responses
// Send each valid suggestion with persona attribution
```

### GeminiClient Changes

The core question: **one client instance or multiple?**

**Recommended: One client, persona passed per-call.**

```typescript
// New method
async processTranscriptForPersona(
  text: string,
  speaker: string,
  isFinal: boolean,
  persona: { id: string; name: string; systemPrompt: string; kbDocumentIds: string[] }
): Promise<Suggestion | null>
```

This avoids creating N client instances. The client already handles provider config, cooldowns, and rate limits at the session level. Persona-specific data (prompt, KB filter) is passed per-call.

**Cooldown strategy**: Per-persona independent cooldowns. Each persona tracks its own `lastSuggestionTime`. The shared `isGenerating` guard becomes per-persona (or removed for parallel). All personas are treated equally — no priority or shorter cooldowns for any persona.

---

## KB Search Changes

**Current**: `getKBContext(query, documentIds)` — single persona's docs.

**Hydra**: Each parallel persona call passes its own `kbDocumentIds`. No change to `getKBContext()` itself — it already accepts a filter parameter.

The only change is calling it N times (once per persona) instead of once. Since KB search is local (IndexedDB + cosine similarity), this is fast.

---

## Cost Implications

| Personas | LLM calls per transcript | Relative cost |
|----------|------------------------|---------------|
| 1 | 1 | 1× (baseline) |
| 2 | 2 | ~2× |
| 3 | 3 | ~3× |
| 4 | 4 | ~4× |

**But**: Most calls will return `---` (silence). In practice, cost increase is less than N× because:
- Input tokens dominate (conversation history is the same for all personas)
- Output tokens are minimal for silent responses
- Only the relevant persona generates a full response

**Free tier impact**: Gemini and Groq have rate limits (RPM/TPM). Multiple personas will hit these faster. May need to:
- Warn users about rate limits with >2 personas on free tiers
- Auto-stagger calls (100ms delay between personas) to avoid burst rate limiting

---

## Migration Strategy

**Backward compatible**:
1. If `activePersonaIds` doesn't exist, fall back to `[activePersonaId]`
2. If `activePersonaIds` exists, `activePersonaId` = first element (for any code that still reads the old key)
3. No migration function needed — just read with fallback

---

## Complexity Estimate

| Area | Effort | Risk |
|------|--------|------|
| Storage + migration | Low | Low |
| Popup multi-select UI | Medium | Low |
| Service worker parallel pipeline | High | Medium |
| GeminiClient per-persona calls | High | Medium |
| Per-persona cooldowns + concurrency | Medium | Medium |
| Overlay persona attribution | Medium | Low |
| Overlay header multi-persona dots | Low | Low |
| Transcript collector attribution | Low | Low |
| Summary persona metadata | Low | Low |
| Drive export attribution | Low | Low |
| Cost tracking (unchanged) | None | None |
| Rate limit handling for burst calls | Medium | High |
| Options page "Hydra presets" | Medium | Low |

**Total estimate**: This is a **large feature** touching ~10 files with meaningful logic changes. The suggestion pipeline rework (service worker + gemini client) is the hardest part.

---

## Decisions (Resolved)

1. **Max personas**: **4** — UI constraint only, no cost warnings. Users who want to spend more can. Some users will have narrow/specific personas (e.g., one per contact they talk to, holding info about that person) rather than broad domains. No reason to limit them.
2. **Deduplication**: **Exact string match only**. If two personas produce verbatim identical text, merge the persona badges onto one suggestion bubble. No fuzzy matching, no LLM-based similarity (that would cost additional calls). Different wording = show both.
3. **Priority persona**: **All equal**. No special treatment, no priority ordering, no shorter cooldowns. Every active persona gets the same opportunity to respond.
4. **Preset groups**: **Yes** — in a new **"Conclave" tab** in the Options page. Users can save persona combinations as presets (e.g., "Board Meeting" = Fundraising + Legal + Technical). This is Phase 19b scope.
5. **Per-persona model**: **Not now**. All personas share the same provider/model. Revisit later — rate limiting across multiple providers could be a future feature.
6. **Summary generation**: **User picks a "conclave leader"** in the Conclave tab settings. That persona's system prompt guides the post-call summary. A short note in the UI explains what this setting does.

---

## Phasing Suggestion

If the full Hydra is too big for one phase:

**Phase 19a — Foundation**: Storage model, popup multi-select, parallel suggestion pipeline, per-persona cooldowns, persona attribution on suggestion bubbles, overlay header multi-dots, exact-match dedup, post-call summary with conclave leader, transcript collector + Drive export attribution, rate limit staggering. Core functionality works end-to-end.

**Phase 19b — Conclave Tab + Presets**: New "Conclave" tab in Options page with conclave leader picker + explanatory note, preset management (create/edit/delete/activate combos), preset quick-switch buttons in popup.
