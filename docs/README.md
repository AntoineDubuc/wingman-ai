# Wingman AI Documentation

Comprehensive documentation for junior engineers working on Wingman AI.

## Quick Start

**New to the project?** Start here:

1. [GETTING-STARTED.md](GETTING-STARTED.md) — Get code running in < 5 minutes
2. [FILE-STRUCTURE-MAP.md](FILE-STRUCTURE-MAP.md) — Understand what each file does
3. [CODE-PATTERNS.md](CODE-PATTERNS.md) — Copy-paste patterns for common tasks

## Documentation Index

### Core Guides

| Document | Purpose | When to Read |
|----------|---------|--------------|
| **[GETTING-STARTED.md](GETTING-STARTED.md)** | Setup, common tasks, debugging | First day onboarding |
| **[FILE-STRUCTURE-MAP.md](FILE-STRUCTURE-MAP.md)** | File-to-purpose mapping | Finding where to make changes |
| **[CODE-PATTERNS.md](CODE-PATTERNS.md)** | Copy-paste code patterns (includes multi-provider, cost tracking, alarms, model tuning) | Implementing similar features |
| **[CODE-DISCOVERY-PATTERN.md](../CODE-DISCOVERY-PATTERN.md)** | Safe codebase exploration with Claude Code | Working with AI assistants |

### Visual Diagrams

Architecture and sequence diagrams (Mermaid format, render on GitHub).

| Diagram | File | Description |
|---------|------|-------------|
| **System Architecture** | [ARCHITECTURE.md](diagrams/ARCHITECTURE.md) | Component relationships, message flows, data storage, parallel audio processing |
| **Sequence Diagrams** | [SEQUENCES.md](diagrams/SEQUENCES.md) | Session start, transcript flow, audio pipeline, emotion detection, Drive OAuth |

### Flow Diagrams

End-to-end traces of critical features with code references.

| Flow | File | Description |
|------|------|-------------|
| **Session Start** | [SESSION-START-FLOW.md](flows/SESSION-START-FLOW.md) | User clicks Start → active session with live transcription + emotion detection |
| **Audio Capture** | [AUDIO-CAPTURE-PIPELINE.md](flows/AUDIO-CAPTURE-PIPELINE.md) | Microphone → AudioWorklet → Deepgram (STT) + Hume AI (emotions) in parallel |
| **Transcript → Suggestion** | [TRANSCRIPT-TO-SUGGESTION-FLOW.md](flows/TRANSCRIPT-TO-SUGGESTION-FLOW.md) | Deepgram transcript → KB search → Gemini → overlay |
| **Session Stop & Summary** | [SESSION-STOP-AND-SUMMARY-FLOW.md](flows/SESSION-STOP-AND-SUMMARY-FLOW.md) | Stop session → call summary → Drive save → overlay |

### Root-Level Docs

| Document | Purpose |
|----------|---------|
| **[../CLAUDE.md](../CLAUDE.md)** | Instructions for Claude Code AI assistant |
| **[../README.md](../README.md)** | Project overview, features, tech stack |

## Documentation Structure

```
docs/
├── README.md                              ← You are here
├── GETTING-STARTED.md                     ← Start here for onboarding
├── FILE-STRUCTURE-MAP.md                  ← Find files (includes unit test map)
├── CODE-PATTERNS.md                       ← Copy patterns
└── flows/                                 ← Feature traces
    ├── SESSION-START-FLOW.md
    ├── AUDIO-CAPTURE-PIPELINE.md
    ├── TRANSCRIPT-TO-SUGGESTION-FLOW.md
    └── SESSION-STOP-AND-SUMMARY-FLOW.md
```

## How to Use This Documentation

### Scenario 1: "I'm new, where do I start?"

1. Read [GETTING-STARTED.md](GETTING-STARTED.md) (15 min)
2. Get code running locally (5 min)
3. Read [FILE-STRUCTURE-MAP.md](FILE-STRUCTURE-MAP.md) (10 min)
4. Pick a flow diagram and trace through code (20 min)

**Total:** ~50 minutes to productive

---

### Scenario 2: "I need to add a new feature"

1. Check [CODE-PATTERNS.md](CODE-PATTERNS.md) for similar examples
2. Read relevant flow diagram (if modifying existing feature)
3. Use patterns as templates for your implementation
4. Refer to [GETTING-STARTED.md](GETTING-STARTED.md) for build/debug steps

---

### Scenario 3: "Something broke, how do I debug?"

1. Go to [GETTING-STARTED.md#debugging-guide](GETTING-STARTED.md#debugging-guide)
2. Follow diagnostic steps for your component
3. Check flow diagram for expected behavior
4. Compare actual vs. expected using code references

---

### Scenario 4: "I'm working with Claude Code"

1. Read [CODE-DISCOVERY-PATTERN.md](../CODE-DISCOVERY-PATTERN.md)
2. Use safe subagent strategies
3. Refer to [CLAUDE.md](../CLAUDE.md) for project-specific instructions

---

## Documentation Principles

This documentation follows these principles:

1. **Actionable** — Every doc has copy-paste examples
2. **Junior-friendly** — Assumes minimal Chrome extension experience
3. **Code references** — All descriptions link to actual file:line numbers
4. **Visual** — Flow diagrams show data movement, not just descriptions
5. **Searchable** — Tables and bullet points over paragraphs

## Common Questions

### "Where is X?"

See [FILE-STRUCTURE-MAP.md](FILE-STRUCTURE-MAP.md) or use the "Where to Find Things" table in [GETTING-STARTED.md](GETTING-STARTED.md#where-to-find-things).

### "How does Y work?"

See flow diagrams in `flows/` directory. Each flow traces a feature end-to-end with code references.

### "How do I implement Z?"

See [CODE-PATTERNS.md](CODE-PATTERNS.md) for copy-paste examples of common patterns.

### "Why did my change break the extension?"

Check [CODE-PATTERNS.md#anti-patterns-to-avoid](CODE-PATTERNS.md#anti-patterns-to-avoid) for critical conventions. Also see debugging guide in GETTING-STARTED.md.

### "How do I safely explore the codebase with AI?"

See [CODE-DISCOVERY-PATTERN.md](../CODE-DISCOVERY-PATTERN.md) for safe subagent strategies.

## Contributing to Docs

When you figure something out that wasn't documented:

1. Add it to the relevant doc (or create new if needed)
2. Keep it actionable (code examples > descriptions)
3. Add code references (file:line)
4. Test your examples before committing

## Feedback

Found an error? Documentation unclear? Open an issue or update the doc directly.

---

**Happy coding!** 🚀
