# File Structure Map

## Entry Points

| File | Role | Runs In |
|------|------|---------|
| `src/background/service-worker.ts` | Session orchestrator, API client manager | Service Worker context |
| `src/content/content-script.ts` | Mic capture, message bridge, overlay injection | Google Meet tab |
| `src/popup/popup.ts` | Session controls + persona selector | Extension popup |
| `src/options/options.ts` | Settings UI controller | Options page |
| `src/offscreen/offscreen.ts` | Tab audio capture handler | Offscreen document |

## Services (Singletons)

| File | Export | Purpose |
|------|--------|---------|
| `src/services/deepgram-client.ts` | `deepgramClient` | WebSocket STT (Nova-3) |
| `src/services/gemini-client.ts` | `geminiClient` | Multi-provider LLM client (Gemini, OpenRouter, Groq) for suggestions + embeddings + summaries |
| `src/services/cost-tracker.ts` | `costTracker` | Session-scoped cost accumulator (Deepgram minutes + LLM tokens) |
| `src/services/langbuilder-client.ts` | `langbuilderClient` | LangBuilder flow execution |
| `src/services/drive-service.ts` | `driveService` | Google Drive API with cross-browser OAuth |
| `src/services/transcript-collector.ts` | `transcriptCollector` | Session transcript accumulator |
| `src/services/call-summary.ts` | `buildSummaryPrompt`, `formatSummaryAsMarkdown` | Post-call summary generation |
| `src/services/kb/kb-database.ts` | `kbDatabase` | IndexedDB wrapper for KB docs + embeddings |
| `src/services/kb/kb-search.ts` | `searchKnowledgeBase` | Cosine similarity semantic search |
| `src/services/kb/extractors.ts` | Text extraction helpers | PDF, Markdown, plain text |

## UI Components

| File | Purpose |
|------|---------|
| `src/content/overlay.ts` | Shadow DOM floating panel (transcripts, suggestions, summary, cost ticker) |
| `src/content/audio-processor.worklet.js` | AudioWorklet: resample to 16kHz PCM16 |
| `src/offscreen/audio-processor.js` | Tab audio capture AudioWorklet |

## Options Page Sections (Modular)

| File | Purpose |
|------|---------|
| `src/options/sections/api-keys.ts` | API key inputs + provider selector (Gemini/OpenRouter/Groq) + model picker |
| `src/options/sections/personas.ts` | Persona CRUD + KB document upload |
| `src/options/sections/drive.ts` | Google Drive OAuth + format selection |
| `src/options/sections/transcription.ts` | Deepgram endpointing + language settings + AI prompt tuning toggle |
| `src/options/sections/call-summary.ts` | Call summary toggle + settings |
| `src/options/sections/theme.ts` | Dark/light mode |
| `src/options/sections/speaker-filter.ts` | Filter self from transcripts |
| `src/options/sections/langbuilder.ts` | LangBuilder flow upload |
| `src/options/sections/tabs.ts` | Tab navigation controller |
| `src/options/sections/icons.ts` | Icon definitions |
| `src/options/sections/shared.ts` | `ToastManager`, `ModalManager` |

## Shared Data Models

| File | Exports |
|------|---------|
| `src/shared/persona.ts` | `Persona` type, active persona helpers, migration |
| `src/shared/default-personas.ts` | 12 built-in persona templates |
| `src/shared/default-prompt.ts` | Legacy default system prompt |
| `src/shared/llm-config.ts` | `LLMProvider` type, model lists (Groq/OpenRouter), API base URLs, cooldown constants |
| `src/shared/model-tuning.ts` | `ModelTuningProfile` interface, `getTuningProfile()` for per-model-family temperature/prompt tuning |
| `src/shared/pricing.ts` | Per-model pricing table, `CostSnapshot`/`CostEstimate` types, free-tier flags |

## Validation Tests

| File | Tests |
|------|-------|
| `src/validation/test-gemini-embeddings.ts` | Gemini Embedding API |
| `src/validation/test-pdf-extraction.ts` | PDF text extraction |
| `src/validation/test-text-extraction.ts` | Markdown + text extraction |
| `src/validation/test-indexeddb-vectors.ts` | IndexedDB vector storage |
| `src/validation/test-cosine-search.ts` | Cosine similarity search |
| `src/validation/test-e2e-pipeline.ts` | End-to-end KB pipeline |
| `src/validation/index.ts` | Test runner (triggered via message) |
| `src/validation/node-runner.ts` | Node.js test runner (for development) |

## Unit Tests (Vitest)

| File | Tests |
|------|-------|
| `tests/setup.ts` | Chrome API mocking via `@webext-core/fake-browser` |
| `tests/pricing.test.ts` | Per-model pricing lookups and cost calculations |
| `tests/cost-tracker.test.ts` | Cost tracker session lifecycle |
| `tests/model-tuning.test.ts` | Model-family tuning profile selection |
| `tests/llm-config.test.ts` | Provider types, model lists, API URLs |
| `tests/provider-config.test.ts` | Provider config storage and defaults |
| `tests/call-summary.test.ts` | Summary prompt builder and formatter |

## Build Artifacts

| Path | Description |
|------|-------------|
| `dist/` | Vite build output (gitignored) |
| `manifest.json` | Extension manifest (root) |
| `vite.config.ts` | Vite + @crxjs/vite-plugin |
| `vitest.config.ts` | Vitest test framework config |
| `tsconfig.json` | TypeScript config (strict mode) |

## Dependencies

**Runtime:**
- `idb` - IndexedDB wrapper
- `marked` - Markdown parser
- `pdfjs-dist` - PDF text extraction
- `reconnecting-websocket` - Auto-reconnect WebSocket wrapper

**Dev:**
- `vite` + `@crxjs/vite-plugin` - Build system
- `typescript` - Type checking
- `vitest` + `@webext-core/fake-browser` - Unit testing with Chrome API mocks
- `eslint` + `prettier` - Linting/formatting
- `playwright` - Browser automation (for testing)
