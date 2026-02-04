# Code Discovery Pattern: Safe Subagent Strategy

## The Problem

When exploring codebases with subagents (Task tool), open-ended or unlimited exploration can cause context exhaustion:
1. Subagent runs out of context mid-task
2. Main conversation inherits the bloated context
3. Entire session becomes unusable
4. Only fix: destroy session and start over

## Solution: Controlled Subagent Usage

### Safe Patterns ✅

**1. Narrow, Bounded Scope**
```
❌ "Explore the codebase and document everything"
✅ "Trace the message flow for START_SESSION from popup → service worker → content script"
```

**2. Set Turn Limits**
```typescript
// Always cap exploration depth
Task({
  subagent_type: "Explore",
  prompt: "Find all message types in service-worker.ts",
  max_turns: 12  // Prevent runaway exploration
})
```

**3. Use Haiku for Simple Tasks**
```typescript
// Cheaper model for straightforward extraction
Task({
  subagent_type: "Explore",
  prompt: "List all chrome.storage keys used in options.ts",
  model: "haiku",  // Less context consumption
  max_turns: 10
})
```

**4. Specific Deliverables**
```
✅ "Extract all storage schema keys into a markdown table"
✅ "List all message types with their handlers"
✅ "Map each file in src/services/ to its primary responsibility"
```

**5. Direct Tools First**
```typescript
// If you know the path, don't spawn an agent
Read({ file_path: "src/background/service-worker.ts" })  // ✅
// vs
Task({ prompt: "Read service-worker.ts" })  // ❌ Unnecessary overhead
```

---

### Risky Patterns ❌

**1. Open-Ended Exploration**
```
❌ "Explore the codebase"
❌ "Find everything related to personas"
❌ "Document all components"
```

**2. No Turn Limits**
```typescript
Task({
  subagent_type: "Explore",
  prompt: "..."
  // Missing max_turns = potential runaway
})
```

**3. Recursive/Chained Agents**
```
❌ Agent A spawns Agent B which spawns Agent C...
```

**4. Multiple Parallel Unbounded Agents**
```typescript
// Don't do this without turn limits
Task({ prompt: "Explore services/" })
Task({ prompt: "Explore content scripts" })
Task({ prompt: "Explore options page" })
// All running simultaneously, all burning context
```

**5. Vague Research Tasks**
```
❌ "Research how authentication works"
❌ "Understand the architecture"
```

---

## Practical Workflow: Documentation Project

### Phase 1: Map Structure (Direct Tools)
```typescript
// Fast, no agent needed
Glob({ pattern: "**/*.ts" })
Glob({ pattern: "**/package.json" })
Read({ file_path: "manifest.json" })
```

### Phase 2: Trace Critical Flows (Controlled Agents)
```typescript
// One agent per flow, capped turns, haiku
Task({
  subagent_type: "Explore",
  model: "haiku",
  max_turns: 12,
  prompt: `Trace the "start session" flow:
1. User clicks Start in popup.ts
2. Message sent to service-worker.ts
3. Deepgram connection initiated
4. Response sent to content-script.ts
Extract: message types, handler functions, state changes`
})

// Repeat for 2-3 other critical flows
```

### Phase 3: Extract Patterns (Mix of Both)
```typescript
// Simple extraction = direct tools
Read({ file_path: "src/services/deepgram-client.ts" })
Grep({ pattern: "class.*Client", output_mode: "content" })

// Complex pattern analysis = capped agent
Task({
  subagent_type: "Explore",
  model: "haiku",
  max_turns: 10,
  prompt: "Find all singleton exports in src/services/. Return as table: filename | export name | pattern used"
})
```

### Phase 4: Synthesis (Main Conversation)
```markdown
// Keep writing and assembly in main conversation
// Agents return data, you synthesize
```

---

## Decision Tree: Agent vs Direct Tool?

```
Do you know the exact file path?
├─ YES → Use Read/Grep/Glob directly
└─ NO → Is the task bounded and specific?
    ├─ YES → Agent with max_turns + haiku
    └─ NO → Break into smaller, specific sub-tasks
```

### Examples

| Task | Approach | Reasoning |
|------|----------|-----------|
| "Read manifest.json" | `Read` | Know the path, single file |
| "Find all message types" | `Grep` pattern match | Specific pattern, direct search |
| "Trace START_SESSION flow" | Agent (haiku, max 12) | Multi-file trace, bounded scope |
| "Understand architecture" | **Break down first** | Too vague, needs decomposition |
| "List all storage keys" | Agent (haiku, max 10) | Specific deliverable, multiple files |
| "Document everything" | **Don't do this** | Unbounded, guaranteed context overflow |

---

## Red Flags 🚩

If you're about to spawn an agent, check:
- [ ] Task has a specific, measurable deliverable?
- [ ] Scope is limited (1-5 files or one clear flow)?
- [ ] `max_turns` is set (≤15)?
- [ ] Could I do this with direct tools instead?
- [ ] Is the output bounded (table, list, diagram)?

If you answered "no" to any of these, **don't spawn the agent**. Break the task down further.

---

## Context Budget Guidelines

**Conservative:**
- Max 3 agents per documentation session
- Each capped at 10 turns
- Use haiku for 2 out of 3

**Aggressive (risky):**
- 5+ agents
- 15+ turns each
- Sonnet/Opus models
- ⚠️ High chance of session death

**Recovery:**
If an agent starts looping or going deep:
- Kill it early (don't wait for max_turns)
- Extract what it found so far
- Finish the task with direct tools

---

## Summary

**Golden Rule:** Agents are for *specific, bounded discovery tasks*. Everything else uses direct tools or gets broken down first.

**Safe ratio:** 80% direct tool use (Read/Grep/Glob) + 20% controlled agents (haiku, max_turns, narrow scope)

**When in doubt:** Read the file yourself. It's always safer than spawning an agent.
