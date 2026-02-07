# Phase 24: Persona Prompt Setup Assistant

## Concept

A guided chatbot (powered by Gemini) that helps users create optimized system prompts for their personas. Each LLM provider (Gemini, OpenRouter, Groq) gets a **tailored prompt** — same intent, different wording tuned for each model's strengths. Optional testing harness validates prompts via real API calls. Prompt history tracks every version with diffs and cost data.

**Prerequisite**: User must have a Gemini API key or OpenRouter key configured (the chat itself runs on Gemini).

## Core Flow

1. **Discovery** — chatbot asks what the persona is for + refinement questions
2. **Generation** — produces tailored system prompts per LLM provider
3. **Review & Save** — user previews all prompts, sees diff vs previous version, saves
4. **Test (optional, relaunchable)** — runs real API calls, shows cost before/after

## Why Per-LLM Prompts

- Gemini, OpenRouter models (Llama, Mistral, Claude), and Groq respond differently to the same prompt
- Structured formatting, role framing, and instruction style vary by model family
- A sales objection prompt for Gemini might use different emphasis than one for Llama 3

---

## What's Missing If We Don't Think Like a User

### 1. Tone & Style Preferences
The assistant should ask: *"How should this persona communicate — direct and concise, or warm and consultative?"* A technical sales persona and a customer success persona handle the same objection very differently. This should be a discovery question, not an afterthought.

### 2. Response Length Calibration
Some users want bullet-point responses they can glance at mid-call. Others want full paragraphs they can read verbatim. The prompt needs to encode this. Discovery should ask: *"Do you prefer short bullet points or detailed responses?"*

### 3. Language / Locale
If the user runs sales calls in French, Spanish, or Japanese, the persona needs to respond in that language. Simple question: *"What language should this persona respond in?"*

### 4. "When to Stay Silent" Calibration
This is the hardest part of a Wingman prompt. A persona that talks too much is worse than one that's too quiet. The assistant should explicitly generate the WHEN TO RESPOND / WHEN TO STAY SILENT sections and the test harness should specifically verify silence behavior (see Step 4 — the "should stay silent" checkboxes).

### 5. Template Awareness
We have 12 built-in persona templates. If the user describes something close to an existing template, the assistant should say: *"This sounds like our Sales Closer template — want to start from there and customize, or build from scratch?"* Saves time, better starting point.

### 6. KB-Aware Prompt Generation
If the persona already has KB documents attached, the assistant should factor that in: *"I see you have pricing-guide-2024.pdf attached — I'll include instructions to reference pricing data from your knowledge base."* The generated prompt should have a KB usage section.

### 7. Prompt Version History & Diff
Every save creates a version. User can see what changed between v1 → v2 with inline diff. If the new prompt performs worse in testing, one-click rollback to previous version.

### 8. Cost Transparency
- **Before test**: "Running 4 questions × 3 providers = ~12 API calls. Estimated cost: ~$0.02"
- **After test**: "Test complete. Actual cost: $0.018 (Gemini $0.006, OpenRouter $0.008, Groq $0.004)"
- Same transparency for the discovery chat itself

### 9. A/B Comparison (Returning Users)
When re-running the assistant on an existing persona, offer: *"Want to compare the new prompts against your current ones?"* Run the same test questions against old and new prompts side by side.

### 10. Sample Questions Should Be Context-Aware
Don't show generic sample questions. The assistant should **generate relevant test questions** based on the discovery conversation. If the persona is for pricing objections, the sample Qs should be pricing objections — plus a few out-of-scope questions to test silence behavior.

---

## ASCII Walkthrough

### Step 1: Launch from Persona Editor

```
┌─────────────────────────────────────────────────┐
│  Edit Persona                                   │
│                                                 │
│  Name  ┌──────────────────────────────────┐     │
│        │ Cloud Sales Pro                  │     │
│        └──────────────────────────────────┘     │
│                                                 │
│  System Prompt                                  │
│  ┌──────────────────────────────────────────┐   │
│  │                                          │   │
│  │        (empty or existing prompt)        │   │
│  │                                          │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  ┌──────────────────────────────┐               │
│  │  ✨ Prompt Setup Assistant   │               │
│  └──────────────────────────────┘               │
│  ┌──────────────────────────────┐               │
│  │  🧪 Test Current Prompts    │               │
│  └──────────────────────────────┘               │
│                                                 │
│  Knowledge Base                                 │
│  📄 pricing-guide-2024.pdf  (156 KB)            │
│  📄 competitor-battlecards.pdf  (203 KB)        │
│                                                 │
└─────────────────────────────────────────────────┘
```

> **"Test Current Prompts"** appears only when prompts already exist. Lets users relaunch the test harness anytime without re-running discovery.

### Step 2: Discovery Chat (Modal)

```
┌─────────────────────────────────────────────────────┐
│  ✨ Prompt Setup Assistant                    ✕     │
│  Powered by Gemini · Chat cost: ~$0.001             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  🤖  What will this persona help you with?          │
│      Example: "closing enterprise SaaS deals"       │
│      or "conducting job interviews"                 │
│                                                     │
│         ┌────────────────────────────────────┐      │
│  You    │ Handling objections on pricing     │      │
│         │ for our cloud platform             │      │
│         └────────────────────────────────────┘      │
│                                                     │
│  🤖  That sounds close to our "Sales Closer"        │
│      template. Want to start from there, or         │
│      build from scratch?                            │
│                                                     │
│       ┌──────────────────┐  ┌─────────────────┐    │
│       │ Use Sales Closer │  │ Start fresh     │    │
│       └──────────────────┘  └─────────────────┘    │
│                                                     │
│         ┌────────────────────────────────────┐      │
│  You    │ Start fresh                        │      │
│         └────────────────────────────────────┘      │
│                                                     │
│  🤖  Got it. A few quick questions:                 │
│                                                     │
│      1. Deal size? (SMB / mid-market / enterprise)  │
│      2. Key competitors to position against?        │
│      3. Tone — direct & concise, or warm &          │
│         consultative?                               │
│      4. Response style — short bullets or           │
│         full sentences?                             │
│      5. Language? (default: English)                │
│                                                     │
│         ┌────────────────────────────────────┐      │
│  You    │ Enterprise. AWS and Azure.         │      │
│         │ Direct. Bullets. English.          │      │
│         └────────────────────────────────────┘      │
│                                                     │
│  🤖  I see you have 2 KB docs attached             │
│      (pricing-guide, competitor-battlecards).       │
│      I'll include KB reference instructions         │
│      in the generated prompts.                      │
│                                                     │
│      Ready to generate:                             │
│      ▸ Enterprise cloud pricing objections          │
│      ▸ Position against AWS & Azure                 │
│      ▸ Direct tone, bullet-point responses          │
│      ▸ KB-aware (pricing + battlecards)             │
│      ▸ Tailored for: Gemini, OpenRouter, Groq      │
│                                                     │
│       ┌──────────────┐  ┌────────────────┐          │
│       │   Refine...  │  │  ✨ Generate   │          │
│       └──────────────┘  └────────────────┘          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Step 3: Review Generated Prompts (with Diff)

```
┌─────────────────────────────────────────────────────┐
│  ✨ Prompt Setup Assistant                    ✕     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────┐ ┌───────────┐ ┌──────┐                │
│  │ Gemini  │ │ OpenRouter │ │ Groq │                │
│  └─────────┘ └───────────┘ └──────┘                │
│   ▔▔▔▔▔▔▔▔▔                                        │
│                                                     │
│  Version: v2  ┌──────────────────┐                  │
│               │ Show diff vs v1  │                  │
│               └──────────────────┘                  │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ You are an expert enterprise cloud sales     │   │
│  │ specialist. Respond in direct, concise       │   │
│  │ bullet points.                               │   │
│  │                                              │   │
│  │ YOUR FOCUS:                                  │   │
│  │ • Reframe pricing objections around TCO/ROI  │   │
│  │ • Position against AWS (lock-in, complexity) │   │
│  │   and Azure (cost unpredictability)          │   │
│  │ • Create urgency without pressure            │   │
│  │                                              │   │
│  │ KB USAGE:                                    │   │
│  │ When the user's knowledge base contains      │   │
│  │ relevant data (pricing, competitor info),     │   │
│  │ reference it with specific numbers. Cite     │   │
│  │ the source filename.                         │   │
│  │                                              │   │
│  │ WHEN TO RESPOND:                             │   │
│  │ • Price/budget concerns                      │   │
│  │ • Competitive comparisons                    │   │
│  │ • Buying signals                             │   │
│  │                                              │   │
│  │ WHEN TO STAY SILENT (respond "---"):         │   │
│  │ • Technical architecture questions           │   │
│  │ • Compliance/legal topics                    │   │
│  │ • General small talk                         │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │  Edit  │  │ 🧪 Test...  │  │  Save All (v2)  │  │
│  └────────┘  └─────────────┘  └──────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Step 3b: Diff View

```
┌─────────────────────────────────────────────────────┐
│  Diff: v1 → v2 (Gemini)                      ✕     │
├─────────────────────────────────────────────────────┤
│                                                     │
│    You are an expert enterprise cloud sales         │
│  - specialist. Your focus:                          │
│  + specialist. Respond in direct, concise           │
│  + bullet points.                                   │
│  +                                                  │
│  + YOUR FOCUS:                                      │
│    • Reframe pricing objections around TCO/ROI      │
│    ...                                              │
│  + KB USAGE:                                        │
│  + When the user's knowledge base contains          │
│  + relevant data (pricing, competitor info),        │
│  + reference it with specific numbers. Cite         │
│  + the source filename.                             │
│    ...                                              │
│                                                     │
│           ┌──────────────────┐                      │
│           │  Revert to v1    │                      │
│           └──────────────────┘                      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Step 4: Test Prompts (Optional — Relaunchable Anytime)

```
┌─────────────────────────────────────────────────────┐
│  🧪 Prompt Tester                             ✕     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Test against:                                      │
│  ┌──────────────┐ ┌──────────┐ ┌────────────┐      │
│  │ ● Sample Qs  │ │ Custom Q │ │ KB + Query │      │
│  └──────────────┘ └──────────┘ └────────────┘      │
│                                                     │
│  Generated sample questions:     (based on persona) │
│  SHOULD RESPOND:                                    │
│  ☑ "Your platform costs 3x more than AWS"          │
│  ☑ "We need to think about the budget"             │
│  ☑ "How do you compare to Azure's pricing?"        │
│  SHOULD STAY SILENT:                                │
│  ☑ "How does your API handle failover?"            │
│  ☑ "Tell me about SOC2 compliance"                 │
│  ☑ "So how's the weather over there?"              │
│                                                     │
│  ┌────────────────────────────────────┐             │
│  │ + Add your own question...        │             │
│  └────────────────────────────────────┘             │
│                                                     │
│  Compare against: ○ None  ● Previous version (v1)   │
│                                                     │
│  Cost estimate: 6 questions × 3 providers = ~$0.03  │
│                                                     │
│          ┌──────────────────────┐                   │
│          │      ▶ Run Tests    │                   │
│          └──────────────────────┘                   │
│                                                     │
│  ── Results ─────────────────────────────────────   │
│                                                     │
│  Q: "Your platform costs 3x more than AWS"         │
│  ┌─────────────────────┬─────────────────────┐     │
│  │ v2 (current)        │ v1 (previous)       │     │
│  ├─────────────────────┼─────────────────────┤     │
│  │ Gemini              │ Gemini              │     │
│  │ • TCO over 3 years  │ "I understand the   │     │
│  │   is actually 20%   │ concern. Let me     │     │
│  │   lower when you    │ break down the      │     │
│  │   factor in...      │ total cost..."      │     │
│  ├─────────────────────┼─────────────────────┤     │
│  │ OpenRouter           │ OpenRouter          │     │
│  │ • Fair point. Our   │ "That's a fair      │     │
│  │   enterprise deal   │ point. Here's       │     │
│  │   includes...       │ what..."            │     │
│  └─────────────────────┴─────────────────────┘     │
│                                                     │
│  Q: "How does your API handle failover?"            │
│  ┌─────────────────────┬─────────────────────┐     │
│  │ v2 (current)        │ v1 (previous)       │     │
│  ├─────────────────────┼─────────────────────┤     │
│  │ Gemini     ✅ Silent │ Gemini    ✅ Silent │     │
│  │ OpenRouter ✅ Silent │ OpenRouter ❌ Spoke │     │
│  │ Groq       ✅ Silent │ Groq      ✅ Silent │     │
│  └─────────────────────┴─────────────────────┘     │
│                                                     │
│  Actual cost: $0.028 (Gemini $0.009, OR $0.012,     │
│               Groq $0.007)                          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Step 4b: KB Test Mode (Impossible Knowledge)

```
┌─────────────────────────────────────────────────────┐
│  🧪 Prompt Tester — KB Mode                  ✕     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  KB Source:                                         │
│  ○ Use persona's existing KB documents              │
│  ● Generate dummy KB (impossible knowledge)         │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ 📄 dummy-pricing.md                          │   │
│  │ "Enterprise plan: $847/seat/month"           │   │
│  │ "Startup plan: $12/seat/month"               │   │
│  │ (synthetic facts — only exist in KB)         │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  Query: "What's the enterprise pricing?"            │
│                                                     │
│  Cost estimate: 1 question × 3 providers = ~$0.01   │
│                                                     │
│          ┌──────────────────────┐                   │
│          │   ▶ Run KB Test     │                   │
│          └──────────────────────┘                   │
│                                                     │
│  ── Results ─────────────────────────────────────   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ Gemini                                       │   │
│  │ • Enterprise plan is $847/seat/month         │   │
│  │                                              │   │
│  │ ✅ KB data used   📄 dummy-pricing.md        │   │
│  │    Similarity: 0.89 · Correct number: YES    │   │
│  ├──────────────────────────────────────────────┤   │
│  │ OpenRouter                                   │   │
│  │ • The enterprise tier runs $847 per seat     │   │
│  │                                              │   │
│  │ ✅ KB data used   📄 dummy-pricing.md        │   │
│  │    Similarity: 0.91 · Correct number: YES    │   │
│  ├──────────────────────────────────────────────┤   │
│  │ Groq                                         │   │
│  │ • Enterprise pricing starts at $500/seat     │   │
│  │                                              │   │
│  │ ❌ Hallucinated   Expected: $847             │   │
│  │    KB chunk retrieved but not used           │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  Actual cost: $0.009                                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

> The impossible knowledge test catches exactly this — Groq retrieved the KB chunk but hallucinated its own number. The user now knows to adjust the Groq prompt's KB instructions.

---

## Prompt Version History (stored per persona)

```
┌─────────────────────────────────────────────────────┐
│  Prompt History — Cloud Sales Pro                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  v3 (current)  Feb 8, 2025                          │
│  "Added stricter KB citation instructions"          │
│  Test score: 5/6 correct · Cost: $0.028             │
│  ┌────────────┐  ┌──────────┐                       │
│  │ View diff  │  │ Restore  │                       │
│  └────────────┘  └──────────┘                       │
│                                                     │
│  v2  Feb 7, 2025                                    │
│  "Switched to bullet-point style, added KB section" │
│  Test score: 4/6 correct · Cost: $0.028             │
│  ┌────────────┐  ┌──────────┐                       │
│  │ View diff  │  │ Restore  │                       │
│  └────────────┘  └──────────┘                       │
│                                                     │
│  v1  Feb 7, 2025                                    │
│  "Initial generation from Setup Assistant"          │
│  Test score: 3/6 correct · Cost: $0.025             │
│  ┌────────────┐  ┌──────────┐                       │
│  │ View diff  │  │ Restore  │                       │
│  └────────────┘  └──────────┘                       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Data Model Additions

```
Persona (existing, extended):
  + promptVersions: PromptVersion[]
  + lastTestResults: TestResult[]

PromptVersion:
  version: number
  timestamp: Date
  prompts: { gemini: string, openrouter: string, groq: string }
  source: "assistant" | "manual"
  summary: string  (auto-generated one-liner)

TestResult:
  version: number
  timestamp: Date
  questions: TestQuestion[]
  totalCost: number

TestQuestion:
  text: string
  expectedBehavior: "respond" | "silent"
  results: { provider: string, response: string, correct: boolean, cost: number }[]
  kbUsed: boolean
  kbSimilarity?: number
```

## Open Questions

- **OpenRouter model selection for testing** — Which model to test? User's configured default, or test against top 2-3?
- **Prompt size limits** — Groq has smaller context windows. Should the assistant auto-shorten prompts for Groq?
- **Sharing** — Can users export/share their prompt versions with team members via the existing persona export?
