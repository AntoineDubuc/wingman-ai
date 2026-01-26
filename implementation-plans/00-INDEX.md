# Presales AI Assistant - Implementation Plans Index

## Overview

This folder contains parallelized implementation plans for the Presales AI Assistant project. The work has been divided into 4 tracks that can be executed concurrently to maximize development speed.

---

## Track Summary

| Track | File | Tasks | Time Est. | Can Start After |
|-------|------|:-----:|:---------:|-----------------|
| **D - Integration** (Setup) | `04-integration-testing-track.md` | 1 | 60 min | Immediately |
| **A - Extension** | `01-extension-track.md` | 5 | 630 min | Track D Task 1 |
| **B - Backend Core** | `02-backend-core-track.md` | 3 | 270 min | Track D Task 1 |
| **C - AI & Knowledge** | `03-ai-knowledge-track.md` | 5 | 540 min | Track D Task 1 |
| **D - Integration** (Testing) | `04-integration-testing-track.md` | 2 | 180 min | All tracks complete |

**Total: 16 tasks, 1,680 minutes (28 hours)**

---

## Execution Timeline

```
                    PARALLEL EXECUTION
    ─────────────────────────────────────────────────────────────►
                              TIME

    ┌─────────┐
    │ D.1     │  Project Setup (60 min) - MUST COMPLETE FIRST
    │ Setup   │
    └────┬────┘
         │
         ├──────────────────────────────────────────────────────┐
         │                                                      │
         ▼                                                      ▼
    ┌─────────────────────────┐                    ┌─────────────────────────┐
    │  TRACK A - EXTENSION    │                    │  TRACK B - BACKEND      │
    │                         │                    │                         │
    │  A.1 Manifest     120m  │                    │  B.1 FastAPI      60m   │
    │         ↓               │                    │         ↓               │
    │  ┌────┬────┬────┬────┐  │                    │  ┌────┬────┐            │
    │  │A.2 │A.3 │A.4 │A.5 │  │                    │  │B.2 │B.3 │            │
    │  │180 │90  │150 │90  │  │                    │  │90  │120 │            │
    │  └────┴────┴────┴────┘  │                    │  └────┴────┘            │
    │  (parallel after A.1)   │                    │  (parallel after B.1)   │
    └─────────────────────────┘                    └─────────────────────────┘
                                                              │
                                                              ▼
                                                   ┌─────────────────────────┐
                                                   │  TRACK C - AI/KB        │
                                                   │                         │
                                                   │  ┌────┬────┐            │
                                                   │  │C.1 │C.2 │            │
                                                   │  │90  │180 │            │
                                                   │  └──┬─┴──┬─┘            │
                                                   │     │    │              │
                                                   │     ▼    ▼              │
                                                   │  ┌────┬────┬────┐       │
                                                   │  │C.3 │C.4 │C.5 │       │
                                                   │  │150 │60  │60  │       │
                                                   │  └────┴────┴────┘       │
                                                   └─────────────────────────┘
         │                                                      │
         └──────────────────────────────────────────────────────┘
                                    │
                                    ▼
                            ┌─────────────┐
                            │ D.2 & D.3   │  Integration Testing (180 min)
                            │ Testing     │  RUNS AFTER ALL TRACKS COMPLETE
                            └─────────────┘
```

---

## Critical Path Analysis

**Longest path (single developer):** ~1,680 minutes (28 hours)

**With 2 developers:**
- Dev 1: Track D.1 → Track A (630 min) → Track D.2/D.3
- Dev 2: Track B (270 min) → Track C (540 min)
- **Critical path:** ~870 minutes (14.5 hours)

**With 3 developers:**
- Dev 1: Track D.1 → Track A
- Dev 2: Track B → Track D.2/D.3
- Dev 3: Track C
- **Critical path:** ~690 minutes (11.5 hours)

---

## Task Quick Reference

### Track A - Extension (01-extension-track.md)
| ID | Task | Estimate | Depends On |
|----|------|:--------:|------------|
| A.1 | Chrome extension manifest & structure | 120 min | D.1 |
| A.2 | TabCapture audio capture | 180 min | A.1 |
| A.3 | WebSocket client | 90 min | A.1 |
| A.4 | Overlay UI component | 150 min | A.1 |
| A.5 | Extension popup settings | 90 min | A.1 |

### Track B - Backend Core (02-backend-core-track.md)
| ID | Task | Estimate | Depends On |
|----|------|:--------:|------------|
| B.1 | Backend FastAPI scaffold | 60 min | D.1 |
| B.2 | WebSocket server endpoint | 90 min | B.1 |
| B.3 | Deepgram transcription integration | 120 min | B.1 |

### Track C - AI & Knowledge (03-ai-knowledge-track.md)
| ID | Task | Estimate | Depends On |
|----|------|:--------:|------------|
| C.1 | Gemini LLM integration | 90 min | B.1 |
| C.2 | Knowledge base setup (vector DB) | 180 min | B.1 |
| C.3 | RAG retrieval pipeline | 150 min | C.1, C.2 |
| C.4 | System prompt engineering | 60 min | C.1 |
| C.5 | Response formatting & filtering | 60 min | B.3, C.1 |

### Track D - Integration (04-integration-testing-track.md)
| ID | Task | Estimate | Depends On |
|----|------|:--------:|------------|
| D.1 | Project setup & configuration | 60 min | None (START) |
| D.2 | End-to-end integration testing | 120 min | All tracks |
| D.3 | Track integration coordination | 60 min | All tracks |

---

## How to Use These Plans

1. **Start with Track D, Task D.1** - Project setup must complete first
2. **Launch parallel tracks** - After D.1, start Tracks A, B, and C simultaneously
3. **Track internal parallelism** - Within each track, run parallel tasks where indicated
4. **Converge for testing** - After all tracks complete, run D.2 and D.3

### For Single Developer
Work through tracks interleaving tasks:
1. D.1 (setup)
2. A.1 and B.1 (both scaffolds)
3. Alternate between A.2-A.5, B.2-B.3, and C.1-C.5
4. D.2, D.3 (testing)

### For Multiple Developers
Assign entire tracks to developers:
- Developer 1: Track A + Track D
- Developer 2: Track B + Track C

---

## Files in This Folder

```
implementation-plans/
├── 00-INDEX.md                    ← You are here
├── 01-extension-track.md          ← Track A: Chrome Extension
├── 02-backend-core-track.md       ← Track B: Backend Core
├── 03-ai-knowledge-track.md       ← Track C: AI & Knowledge Base
└── 04-integration-testing-track.md ← Track D: Setup & Integration
```

---

*Generated January 26, 2026*
