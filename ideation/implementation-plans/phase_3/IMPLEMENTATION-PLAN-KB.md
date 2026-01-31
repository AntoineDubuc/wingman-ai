# Implementation Plan: Wingman AI Knowledge Base

**Version:** 3.0 (Simplified after senior engineer review)
**Last Updated:** 2026-01-31

---

## Executive Summary

The Knowledge Base (KB) feature transforms Wingman AI from a generic AI assistant into a company-specific sales expert by enabling users to upload their own product documentation, battle cards, FAQs, and competitive intelligence. When a customer asks a question during a call, Wingman retrieves relevant context from the user's uploaded documents and injects it into the AI prompt, producing highly specific and accurate suggestions. This feature maintains Wingman's privacy-first BYOK architecture—all documents are processed and stored locally in the browser using IndexedDB, with only embedding API calls going to the user's own Gemini API key.

**Key Outcomes:**
- Users can upload PDF, Markdown, and text documents to build a personal knowledge base
- Real-time retrieval surfaces relevant context during live calls (~500ms latency target)
- AI suggestions become company-specific rather than generic
- Zero backend infrastructure required—fully browser-based
- Competitive differentiation against enterprise tools like Gong and Fireflies

---

## Success Metrics

### Adoption Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| % users who upload ≥1 document | 30% within 30 days | Analytics event on first upload |
| Time from install to first upload | <7 days median | Track install date vs first upload |
| Documents per user | 5 median | Count distinct documents |
| Document type distribution | Track PDF vs MD vs TXT | Pie chart in analytics |

### Quality Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| KB retrieval latency | <500ms p95 | Performance logging |
| Suggestion acceptance rate (with KB) | +20% vs without KB | A/B comparison if possible |
| % calls where KB context injected | 50% for users with KB | Log when KB context added |

### Engagement Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Test query feature usage | 40% of KB users try it | Analytics event |
| Document deletion rate | <10%/month | Track deletions |
| Return visits to KB settings | 2x/month | Page view tracking |

### Technical Health
| Metric | Target | Measurement |
|--------|--------|-------------|
| Embedding API error rate | <1% | Error logging |
| Processing failure rate | <5% per file type | Track success/fail by type |
| IndexedDB storage utilization | <80% of quota | Storage API checks |

---

## Definition of Done

The Knowledge Base feature is **complete** when:

1. ✅ User can upload PDF, MD, or TXT file via drag-drop or file browser
2. ✅ Document is chunked and embedded within 60 seconds per 10 pages
3. ✅ Document appears in list with filename, chunk count, and upload date
4. ✅ Suggestions during calls include relevant KB context (when available)
5. ✅ **Suggestions show source attribution** ("Based on: filename.pdf")
6. ✅ KB retrieval adds <500ms latency to suggestion generation
7. ✅ User can delete documents with confirmation
8. ✅ All error states show user-friendly messages
9. ✅ Empty state guides users on what to upload
10. ✅ No console errors in happy path
11. ✅ Works in Chrome stable (latest version)

---

## User Stories

### Critical (MVP Blockers)

```
US-1: KB Source Attribution
As a sales rep, I want to see which KB document was used for a suggestion
so that I can trust the information and verify it if needed.

Acceptance Criteria:
- Suggestions that use KB context show "[Based on: filename.pdf]" in the overlay
- If multiple sources used, show primary source
- Clicking source name (future) could highlight the chunk
```

```
US-2: First-Time Guidance
As a first-time user, I want guidance on what documents to upload
so that I can get value quickly without guessing.

Acceptance Criteria:
- Empty state shows recommended doc types: "Start with a battle card, FAQ, or product sheet"
- Drop zone includes accepted formats and max size
- Optional: Link to "Learn more" about what makes good KB content
```

```
US-3: User-Friendly Language
As a sales rep, I want non-technical language in the UI
so that I understand what's happening without knowing ML terminology.

Acceptance Criteria:
- "chunks" → "sections" or just hidden (show doc count only)
- "embedding" → never shown to user
- Relevance scores hidden (just sort results by relevance, no numbers)
- Progress: simple "Processing..." spinner, no granular stages
```

```
US-4: No-Match Indicator
As a sales rep, I want to know when KB retrieval found no relevant content
so that I understand why a suggestion is generic.

Acceptance Criteria:
- If KB has docs but no match found, suggestion shows "General response (no KB match)"
- Or use visual indicator (no source badge = generic)
- User understands difference between "no KB" and "KB didn't match"
```

### Important (MVP)

```
US-5: Bulk Upload
As a sales rep, I want to upload multiple files at once
so that initial setup is fast.

Acceptance Criteria:
- Drag multiple files or select multiple in file picker
- Process sequentially, show current file: "Processing battle-card.pdf..."
- (No cancel button - let it finish, delete after if needed)
```

```
US-6: Popup KB Status
As a sales rep, I want to see KB status in the popup
so that I can quickly verify my KB is active before a call.

Acceptance Criteria:
- Popup shows "Knowledge Base: 5 docs" or "No KB docs"
- Link to Options page KB section
```

### Deferred (Phase 2)

```
US-7: Document Update/Replace
As a sales rep, I want to replace an existing document
so that I don't have to delete and re-upload when content is refreshed.
→ Deferred: Delete + re-upload is acceptable for MVP
```

```
US-8: Document Organization (Tags)
As a sales rep, I want to categorize my documents
so that I can organize a growing knowledge base.
→ Deferred: Flat list is fine for <20 docs
```

```
US-9: Storage Quota Display
As a sales rep, I want to see storage quota context
so that I know how much more I can upload.
→ Deferred: Show error when actually full, not warnings at 80%
```

### Phase 2 Consideration

```
US-11: DOCX Support
As a sales rep, I want DOCX support
so that I can use the documents I actually have.

Note: Elevate priority - very common format. Consider for late MVP or immediate Phase 2.
```

```
US-12: Google Drive Import
As a sales rep, I want to import from Google Drive
so that I don't have to download and re-upload company docs.

Note: Already planned for Phase 2. Consider priority elevation for enterprise adoption.
```

---

## User Flows

### Flow 1: First-Time KB Setup

```
┌─────────────────────────────────────────────────────────────────┐
│ User opens Options page                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Sees KB section with EMPTY STATE:                               │
│ "No documents yet. Upload your sales content to get             │
│  personalized suggestions during calls.                         │
│                                                                 │
│  Recommended first uploads:                                     │
│  • Battle card or competitive overview                          │
│  • Product FAQ or feature sheet                                 │
│  • Pricing information                                          │
│                                                                 │
│  [Drop zone: Drag files here or click to browse]                │
│  Supported: PDF, Markdown, Text (max 10MB)"                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ User drags battle-card.pdf                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PROCESSING STATE:                                               │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Processing: battle-card.pdf                                 │ │
│ │ [████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 35%             │ │
│ │ Making it searchable...                                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SUCCESS STATE:                                                  │
│ ✓ battle-card.pdf added (47 sections)                          │
│                                                                 │
│ TIP: Try a test query below to see how it works!               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ User types test query: "What security certs do we have?"        │
│ → Sees 3 matching sections with relevance scores               │
│ → Confirms KB is working                                        │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 2: During-Call KB Retrieval

```
┌─────────────────────────────────────────────────────────────────┐
│ Customer speaks: "What security certifications do you have?"    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Deepgram transcribes → final transcript received                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
         ┌────────────────────┴────────────────────┐
         │                                         │
         ▼                                         ▼
┌─────────────────────┐                 ┌─────────────────────┐
│ Check: KB has docs? │                 │ Build base prompt   │
└─────────────────────┘                 └─────────────────────┘
         │                                         │
    Yes  │                                         │
         ▼                                         │
┌─────────────────────┐                            │
│ Embed utterance     │                            │
│ (RETRIEVAL_QUERY)   │                            │
└─────────────────────┘                            │
         │                                         │
         ▼                                         │
┌─────────────────────┐                            │
│ Search KB vectors   │                            │
│ Top 3, score > 0.7  │                            │
└─────────────────────┘                            │
         │                                         │
         ├──── Found matches ────────────────────┐ │
         │                                       ▼ ▼
         │                         ┌─────────────────────────────┐
         │                         │ Inject KB context into      │
         │                         │ prompt:                     │
         │                         │ "KNOWLEDGE BASE CONTEXT:    │
         │                         │ [chunk1] [chunk2]           │
         │                         │ SOURCE: battle-card.pdf"    │
         │                         └─────────────────────────────┘
         │                                       │
         └──── No matches ──────┐               │
                                │               │
                                ▼               ▼
                    ┌─────────────────────────────────────────────┐
                    │ Call Gemini with final prompt               │
                    └─────────────────────────────────────────────┘
                                        │
                                        ▼
                    ┌─────────────────────────────────────────────┐
                    │ Display suggestion in overlay               │
                    │ WITH SOURCE ATTRIBUTION if KB was used:     │
                    │ ┌─────────────────────────────────────────┐ │
                    │ │ "We hold SOC2 Type II and ISO 27001..." │ │
                    │ │ [Based on: battle-card.pdf]             │ │
                    │ └─────────────────────────────────────────┘ │
                    └─────────────────────────────────────────────┘
```

### Flow 3: Error Recovery

```
┌─────────────────────────────────────────────────────────────────┐
│ User drops scanned-document.pdf                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Processing begins... Extracting text...                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ ERROR STATE:                                                    │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ✗ Could not read scanned-document.pdf                       │ │
│ │                                                             │ │
│ │ This PDF appears to be a scanned image. Wingman needs       │ │
│ │ text-based PDFs to work. Try:                               │ │
│ │ • Exporting from the original source as text PDF            │ │
│ │ • Using a different document format (Word, Markdown)        │ │
│ │                                                             │ │
│ │ [Dismiss]                                                   │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## UX Specifications

### Drop Zone States

| State | Visual Treatment | Copy |
|-------|------------------|------|
| **Default** | Dashed gray border, cloud icon | "Drag files here or click to browse" |
| **Drag Over (Valid)** | Solid primary border, glow, icon animates | "Drop to upload" |
| **Drag Over (Invalid)** | Solid red border, X icon | "File type not supported" |
| **Processing** | Grayed out, progress bar | "Processing: filename.pdf..." |
| **Disabled** | 50% opacity, cursor: not-allowed | "Processing in progress..." |

### Progress UI (Simplified)

**During processing:**
```
┌─────────────────────────────────────────┐
│ Processing: battle-card.pdf...          │
│ [████████████░░░░░░░░░░░░░] ← spinner   │
└─────────────────────────────────────────┘
```

**On success:**
```
┌─────────────────────────────────────────┐
│ ✓ battle-card.pdf added (23 sections)   │
└─────────────────────────────────────────┘
```

**On error:**
```
┌─────────────────────────────────────────┐
│ ✗ Could not process file                │
│ [User-friendly error message]           │
└─────────────────────────────────────────┘
```

No granular stage percentages. Just: processing → done/error.

### Document List Item (Simplified)

```
┌───────────────────────────────────────────────────────────────┐
│ 📄 battle-card-q4-2024.pdf                           [Delete] │
│    23 sections • 2.3 MB • Added 2 days ago                    │
└───────────────────────────────────────────────────────────────┘
```

No expandable preview (Phase 2). No Update button (delete + re-upload is fine for MVP).

### Overlay KB Attribution

```
┌──────────────────────────────────────────┐
│ ANSWER                          10:32 AM │
├──────────────────────────────────────────┤
│ "We hold SOC2 Type II, HIPAA, and ISO   │
│ 27001 certifications. Our most recent   │
│ audit in Q3 2024 had zero findings."    │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ 📚 Based on: battle-card.pdf        │ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

When no KB match (but KB exists):
```
┌──────────────────────────────────────────┐
│ ANSWER                          10:33 AM │
├──────────────────────────────────────────┤
│ "That's a great question about..."       │
│                                          │
│ [General response]                       │
└──────────────────────────────────────────┘
```

### Test Query Results (Simplified)

```
┌───────────────────────────────────────────────────────────────┐
│ TEST YOUR KNOWLEDGE BASE                                      │
├───────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ What security certifications do we have?                  │ │
│ └───────────────────────────────────────────────────────────┘ │
│ [Test]                                                        │
│                                                               │
│ Found 3 matching sections:                                    │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ 📄 battle-card.pdf                                        │ │
│ │ "Our Enterprise plan includes SOC2 Type II, HIPAA         │ │
│ │ compliance, and ISO 27001 certifications..."              │ │
│ └───────────────────────────────────────────────────────────┘ │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ 📄 security-faq.md                                        │ │
│ │ "Q: Do you support HIPAA workloads?                       │ │
│ │ A: Yes, our Enterprise tier includes BAA agreements..."   │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                               │
│ This is what Wingman will use to answer similar questions.   │
└───────────────────────────────────────────────────────────────┘
```

No star ratings or percentages. Results are already sorted by relevance.

### Popup KB Status

```
┌──────────────────────────────────────────┐
│ [Logo] Wingman AI                        │
│ AI Sales Assistant for Google Meet       │
├──────────────────────────────────────────┤
│ API Keys       [●] Configured            │
│ Session        [ ] Inactive              │
│ Knowledge Base [●] 5 documents           │  ← NEW
├──────────────────────────────────────────┤
│ [Start Session]                          │
│                                          │
│ Manage Knowledge Base →                  │  ← NEW link
└──────────────────────────────────────────┘
```

---

## Edge Cases & Error Handling

### Edge Cases (Simplified)

| Scenario | Handling |
|----------|----------|
| Duplicate filename | Allow it (different uploads can have same name) |
| Very short document | Process normally (1 section is fine) |
| Long filename | Truncate with ellipsis, title tooltip |
| Non-English content | Process normally (Gemini handles multilingual) |
| Corrupt PDF | Error: "Could not read this file." |
| Network failure | Retry 3x with backoff, then error |
| Storage full | Error: "Storage full. Delete some documents." |
| Tab closed during processing | Cleanup incomplete docs on next page load |

### Error Message Mapping

| Technical Error | User-Facing Message |
|-----------------|---------------------|
| `ENOKEY` | "Your Gemini API key is missing. Please add it in the API Keys section above." |
| `429 Rate Limited` | "Too many requests. Waiting a moment before continuing..." |
| `ETIMEDOUT` | "Network timeout. Please check your connection and try again." |
| `PDF no text` | "This PDF appears to be a scanned image. Please upload a text-based document." |
| `File too large` | "This file is too large (max 10MB). Try compressing it or splitting into smaller files." |
| `Invalid file type` | "File type not supported. Please upload PDF, Markdown (.md), or Text (.txt) files." |
| `IndexedDB full` | "Your browser storage is full. Delete some documents to make room." |
| `Embedding API error` | "Could not process document. Please try again in a few minutes." |
| `Parse error` | "Could not read this file. It may be corrupted or in an unsupported format." |

---

## Product Manager Review

### Feature Overview

This implementation phase delivers the MVP Knowledge Base functionality, enabling users to upload documents, have them automatically chunked and embedded, and receive KB-enhanced AI suggestions during calls. The focus is on core functionality with PDF, Markdown, and plain text support.

### Features

#### Feature 1: Document Upload & Management

**What it is:** A dedicated section in the Options page where users can drag-and-drop or browse to upload documents that form their sales knowledge base.

**Why it matters:** Sales reps have product docs, battle cards, and FAQs scattered across their organization. By centralizing this knowledge in Wingman, they get instant access during calls without searching through folders or wikis.

**User perspective:** User opens Options, sees a "Knowledge Base" section with a drop zone. They drag their battle card PDF, see a progress bar as it processes, and receive confirmation showing "12 chunks indexed from battle-card.pdf". They can view, search, and delete uploaded documents.

---

#### Feature 2: Automatic Document Processing

**What it is:** Behind-the-scenes pipeline that extracts text from uploaded files, chunks them into semantically meaningful segments, generates embeddings via Gemini API, and stores vectors in IndexedDB.

**Why it matters:** Non-technical users shouldn't need to understand chunking or embeddings. The system handles complexity automatically, ensuring optimal retrieval quality without user configuration.

**User perspective:** User uploads a 20-page PDF and sees "Processing... Extracting text... Creating embeddings... Done!" within 30-60 seconds. No technical decisions required.

---

#### Feature 3: Real-Time Context Retrieval

**What it is:** During calls, when a customer speaks, Wingman embeds the utterance, searches the vector store for relevant chunks, and injects the top results into the Gemini prompt before generating a suggestion.

**Why it matters:** This is the core value proposition—suggestions go from generic ("Here are some benefits...") to specific ("Our Enterprise plan includes SOC2 compliance, which addresses the security concern they just raised").

**User perspective:** Customer asks "What security certifications do you have?" and Wingman's suggestion includes specific certifications from the user's uploaded security datasheet, not generic advice.

---

#### Feature 4: Knowledge Base Status & Insights

**What it is:** Visual indicators showing KB health: number of documents, total chunks, storage used, and last-updated timestamps. Includes a "Test Query" feature to verify retrieval quality.

**Why it matters:** Users need confidence that their KB is working. Without visibility, they can't troubleshoot poor suggestions or know if their uploads succeeded.

**User perspective:** User sees "Knowledge Base: 5 documents, 847 chunks, 12MB used" in Options. They can type a test query and see which chunks would be retrieved, helping them understand if they need to upload more content.

---

## Master Checklist

### Instructions for Claude Code

> **CRITICAL: You must follow these rules exactly.**
>
> 1. **Save after every cell write.** Each time you update a cell, save immediately.
> 2. **Check the checkbox** when you begin a task.
> 3. **Workflow:** Check → Save → Start time → Save → Work → End time → Save → Total → Save
> 4. **Time format:** `HH:MM` for start/end. Minutes for totals.
> 5. **If blocked:** Note blocker and move to next unblocked task.

### Progress Dashboard

| Done | # | Task Name | Start | End | Total (min) | Human Est. (min) | Multiplier |
|:----:|:-:|-----------|:-----:|:---:|:-----------:|:----------------:|:----------:|
| [x] | 1 | KB Database + Types + Chunking | 09:17 | 09:22 | 5 | 120 | 24x |
| [x] | 2 | Text/PDF Extraction | 09:22 | 09:24 | 2 | 90 | 45x |
| [x] | 3 | Add Embedding to GeminiClient | 09:24 | 09:25 | 1 | 60 | 60x |
| [x] | 4 | KB Search + Retrieval | 09:25 | 09:25 | 1 | 90 | 90x |
| [x] | 5 | Document Ingestion Orchestration | 09:26 | 09:26 | 1 | 60 | 60x |
| [x] | 6 | Options UI: KB Section + Drop Zone | 09:27 | 09:29 | 2 | 120 | 60x |
| [x] | 7 | Options UI: Document List + Delete | 09:27 | 09:29 | 0 | 90 | -- |
| [x] | 8 | Integrate KB into Suggestion Flow | 09:30 | 09:30 | 1 | 120 | 120x |
| [x] | 9 | Overlay: Source Attribution | 09:30 | 09:30 | 0 | 30 | -- |
| [x] | 10 | Error Handling + Polish | 09:31 | 09:31 | 1 | 60 | 60x |

**Summary:**
- Total tasks: 10
- Completed: 10
- Total time spent: 14 minutes
- Total human estimate: 840 minutes (14 hours)
- Overall multiplier: 60x

### File Structure (3 new files, not 9)

```
extension/src/services/kb/
├── kb-database.ts    # Types + IndexedDB + Chunking + Ingestion
├── extractors.ts     # PDF + Markdown + Text extraction
└── kb-search.ts      # Cosine similarity + Retrieval

extension/src/services/
└── gemini-client.ts  # MODIFY: Add generateEmbedding() method

extension/src/options/
├── options.html      # MODIFY: Add KB section
├── options.ts        # MODIFY: Add KB handlers
└── options.css       # MODIFY: Add KB styles

extension/src/content/
└── overlay.ts        # MODIFY: Add source attribution
```

---

## Task Descriptions

**Architecture:** 3 new files + modifications to existing files. No over-abstraction.

---

### Task 1: KB Database + Types + Chunking

**Intent:** Single file containing types, IndexedDB operations, and text chunking. The foundation.

**File:** `extension/src/services/kb/kb-database.ts`

**Contains:**
```typescript
// === TYPES (top of file) ===
interface KBDocument {
  id: string;
  filename: string;
  fileType: 'pdf' | 'md' | 'txt';
  fileSize: number;
  chunkCount: number;
  uploadedAt: number;
  status: 'processing' | 'complete' | 'error';
  lastProcessedChunk?: number;  // For crash recovery
  error?: string;
}

interface KBChunk {
  id: string;
  documentId: string;
  text: string;
  embedding: number[];  // 768 dimensions
  chunkIndex: number;
}

interface KBSearchResult {
  chunk: KBChunk;
  score: number;
  documentName: string;
}

// === INDEXEDDB SERVICE ===
class KBDatabase {
  private db: IDBDatabase | null = null;

  async init(): Promise<void>
  async addDocument(doc: KBDocument): Promise<void>
  async addChunks(chunks: KBChunk[]): Promise<void>  // Batch in 50s to avoid timeout
  async getDocuments(): Promise<KBDocument[]>
  async getChunksByDocumentId(docId: string): Promise<KBChunk[]>
  async getAllChunks(): Promise<KBChunk[]>
  async deleteDocument(docId: string): Promise<void>  // Cascades to chunks
  async updateDocumentStatus(docId: string, status: string, lastChunk?: number): Promise<void>
  async getStats(): Promise<{ docCount: number, chunkCount: number, storageUsed: number }>
  async getIncompleteDocuments(): Promise<KBDocument[]>  // For crash recovery
}

// === CHUNKING (inline function, not a class) ===
function chunkText(text: string, maxSize = 1500, overlap = 0.15): string[]
```

**Critical Protections:**
1. **Transaction batching:** Write chunks in batches of 50 to avoid IndexedDB timeout
2. **Crash recovery:** Track `lastProcessedChunk` to resume or cleanup on init
3. **Storage check:** Call `navigator.storage.estimate()` before large operations

**Notes:**
- Database name: `wingman-kb`, version: 1
- Object stores: `documents`, `chunks` (indexed on `documentId`)
- Chunking: Split on paragraphs first, then sentences, then hard split
- Export singleton: `export const kbDatabase = new KBDatabase()`

---

### Task 2: Text/PDF Extraction

**Intent:** Single file handling all document-to-text extraction. Simple switch statement, not multiple classes.

**File:** `extension/src/services/kb/extractors.ts`

**Contains:**
```typescript
// Main entry point
async function extractText(file: File): Promise<{ text: string; warning?: string }>

// Internal helpers
async function extractFromPDF(file: File): Promise<string>
async function extractFromMarkdown(file: File): Promise<string>
async function extractFromText(file: File): Promise<string>
```

**PDF Extraction:**
- Use `pdfjs-dist` with worker disabled (service worker compat)
- Concatenate pages with `\n\n`
- Return warning if no text extracted (scanned image)
- Timeout: 30 seconds

**Markdown Extraction:**
- Use `marked.lexer()` to get tokens
- Extract text from headings, paragraphs, list items
- Preserve structure: "## Heading" → "Heading:"

**Text Extraction:**
- Normalize line endings (CRLF → LF)
- Trim whitespace
- That's it.

**Notes:**
- ~100 lines total for this file
- All functions are standalone, no classes needed
- Dependencies already installed: `pdfjs-dist`, `marked`

---

### Task 3: Add Embedding to GeminiClient

**Intent:** Extend existing `gemini-client.ts` with embedding capability. No new file.

**Modify:** `extension/src/services/gemini-client.ts`

**Add methods:**
```typescript
async generateEmbedding(
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'
): Promise<number[]>

async generateEmbeddings(
  texts: string[],
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'
): Promise<number[][]>  // Batch endpoint
```

**Implementation:**
- Endpoint: `generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent`
- Batch: `batchEmbedContents` (up to 100 texts per call)
- Always use `outputDimensionality: 768`
- Exponential backoff on 429 (2s, 4s, 8s, max 3 retries)
- Reuse existing `getApiKey()` method

**Notes:**
- ~50 lines of additions
- No new dependencies
- Reuses existing fetch/error handling patterns

---

### Task 4: KB Search + Retrieval

**Intent:** Cosine similarity search and retrieval orchestration. Queries DB, computes similarity, returns ranked results.

**File:** `extension/src/services/kb/kb-search.ts`

**Contains:**
```typescript
// Main search function
async function searchKB(
  query: string,
  topK: number = 3,
  threshold: number = 0.7
): Promise<KBSearchResult[]>

// Cosine similarity (dot product for normalized vectors)
function cosineSimilarity(a: number[], b: number[]): number

// High-level retrieval for suggestion flow
async function getKBContext(utterance: string): Promise<{
  context: string | null;
  source: string | null;
  matched: boolean;
}>
```

**Search Implementation:**
1. Get query embedding via `geminiClient.generateEmbedding(query, 'RETRIEVAL_QUERY')`
2. Load all chunks from IndexedDB (stream with cursor if >5000)
3. Compute cosine similarity for each
4. Sort descending, filter by threshold, return topK

**Memory Protection:**
- If chunk count > 5000, use IndexedDB cursor instead of loading all
- Early termination: Stop if found `topK` results above 0.9

**Notes:**
- ~80 lines total
- No classes, just functions
- Export: `searchKB`, `getKBContext`

---

### Task 5: Document Ingestion Orchestration

**Intent:** Coordinate the full pipeline: validate → extract → chunk → embed → store. Handle errors and progress.

**Add to:** `extension/src/services/kb/kb-database.ts` (as a method or separate function)

**Function:**
```typescript
async function ingestDocument(
  file: File,
  onProgress?: (stage: string, percent: number) => void
): Promise<{ success: boolean; documentId?: string; chunkCount?: number; error?: string }>
```

**Pipeline:**
1. **Validate API key** — Check FIRST, before any processing
2. **Check storage** — Reject if <50MB headroom
3. **Check file** — Size ≤10MB, valid type
4. **Create document record** — Status: 'processing'
5. **Extract text** — Update progress 0-20%
6. **Chunk text** — Update progress 20-30%
7. **Generate embeddings** — Batch, update progress 30-90%
8. **Store chunks** — Batch writes, update progress 90-100%
9. **Update document status** — 'complete' with chunkCount

**Error Handling:**
- If fails during embedding, update `lastProcessedChunk` for potential resume
- If fails completely, delete partial document + chunks
- Return user-friendly error message

**Concurrency Guard:**
- Module-level `let isProcessing = false`
- Reject if already processing (queue handled at UI level)

---

### Task 6: Options UI: KB Section + Drop Zone

**Intent:** Add KB section to Options page with drop zone for file upload.

**Modify:** `options.html`, `options.ts`, `options.css`

**HTML Structure:**
```html
<section class="options-card" id="kb-section">
  <h2>Knowledge Base</h2>
  <p class="description">Upload your sales docs for personalized suggestions.</p>

  <!-- Drop Zone -->
  <div id="kb-drop-zone" class="kb-drop-zone">
    <span class="kb-drop-icon">📄</span>
    <span class="kb-drop-text">Drag files here or click to browse</span>
    <span class="kb-drop-hint">PDF, Markdown, or Text (max 10MB)</span>
    <input type="file" id="kb-file-input" multiple accept=".pdf,.md,.txt" hidden>
  </div>

  <!-- Progress (hidden by default) -->
  <div id="kb-progress" class="kb-progress" hidden>
    <div class="kb-progress-bar"><div class="kb-progress-fill"></div></div>
    <span class="kb-progress-text">Processing...</span>
  </div>

  <!-- Document List (populated by JS) -->
  <div id="kb-doc-list" class="kb-doc-list"></div>

  <!-- Empty State -->
  <div id="kb-empty" class="kb-empty">
    <p>No documents yet.</p>
    <p class="kb-empty-hint">Start with a battle card, FAQ, or product sheet.</p>
  </div>

  <!-- Stats -->
  <div id="kb-stats" class="kb-stats"></div>
</section>
```

**Drop Zone States (CSS):**
- Default: Dashed border, gray
- Drag over valid: Solid primary border, subtle glow
- Drag over invalid: Red border
- Processing: Grayed out, no pointer events

**JS Handlers:**
- `dragover`, `dragleave`, `drop` events
- File validation (type, size)
- Trigger `ingestDocument()` for each file sequentially

**Notes:**
- Reuse existing `.options-card` styling
- Reuse existing toast notification for success/error
- Progress: Simple "Processing..." with spinner, then "Done!"

---

### Task 7: Options UI: Document List + Delete

**Intent:** Display uploaded documents with delete functionality.

**Modify:** Same files as Task 6

**Document Item HTML:**
```html
<div class="kb-doc-item" data-id="xxx">
  <span class="kb-doc-icon">📄</span>
  <div class="kb-doc-info">
    <span class="kb-doc-name">battle-card.pdf</span>
    <span class="kb-doc-meta">23 sections • 2.3 MB • Added 2 days ago</span>
  </div>
  <button class="kb-doc-delete" title="Delete">🗑️</button>
</div>
```

**Functionality:**
- Load document list on page init
- Delete with confirmation dialog (reuse existing modal pattern)
- Refresh list after upload/delete
- Show empty state when no documents

**Simplifications (from engineer review):**
- No expandable preview (defer to Phase 2)
- No update/replace button (delete + re-upload is fine)
- No tags/categories (flat list is fine for <20 docs)

---

### Task 8: Integrate KB into Suggestion Flow

**Intent:** When generating suggestions, search KB first and inject relevant context.

**Modify:** `extension/src/services/gemini-client.ts`

**In `generateResponse()` or equivalent:**
```typescript
// Before calling Gemini for suggestion
const kbResult = await getKBContext(customerUtterance);

let prompt = basePrompt;
if (kbResult.matched && kbResult.context) {
  prompt = `KNOWLEDGE BASE CONTEXT (from ${kbResult.source}):\n${kbResult.context}\n\n${basePrompt}`;
}

// Call Gemini with enriched prompt
const response = await this.callGemini(prompt);

// Pass source info back for overlay
return {
  suggestion: response,
  kbSource: kbResult.matched ? kbResult.source : null
};
```

**Message Passing:**
- Content script receives suggestion with `kbSource` field
- Pass to overlay for attribution display

**Latency Budget:**
- KB retrieval should add <500ms
- Log: `console.log('[KB] Retrieval took ${ms}ms')`
- If retrieval fails, proceed without KB (graceful degradation)

---

### Task 9: Overlay: Source Attribution

**Intent:** Show which KB document was used for each suggestion.

**Modify:** `extension/src/content/overlay.ts`

**In suggestion display:**
```typescript
function displaySuggestion(suggestion: string, kbSource: string | null) {
  // ... existing suggestion rendering ...

  if (kbSource) {
    const sourceTag = document.createElement('div');
    sourceTag.className = 'suggestion-source';
    sourceTag.textContent = `📚 Based on: ${kbSource}`;
    suggestionEl.appendChild(sourceTag);
  }
}
```

**CSS:**
```css
.suggestion-source {
  font-size: 11px;
  color: #888;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #333;
}
```

**Notes:**
- Small, subtle attribution
- Only shown when KB was used
- ~20 lines of changes total

---

### Task 10: Error Handling + Polish

**Intent:** Ensure all error cases show user-friendly messages. Final polish pass.

**Error Message Mapping:**

| Error | Message |
|-------|---------|
| No API key | "Add your Gemini API key above first." |
| Rate limited | "Too many requests. Waiting..." |
| Network error | "Network error. Check connection." |
| Scanned PDF | "Can't read scanned images. Use text PDF." |
| File too big | "File too large (max 10MB)." |
| Wrong type | "Use PDF, Markdown, or Text files." |
| Storage full | "Storage full. Delete some documents." |

**Polish:**
- Consistent toast notifications (reuse existing)
- Loading states on all async operations
- Console logging for debugging (remove verbose logs)
- Test all error paths manually

**Crash Recovery (on page load):**
```typescript
// In options.ts init
const incomplete = await kbDatabase.getIncompleteDocuments();
for (const doc of incomplete) {
  // Either resume from lastProcessedChunk or delete
  await kbDatabase.deleteDocument(doc.id);
  showToast(`Cleaned up incomplete upload: ${doc.filename}`);
}
```

---

## Appendix

### Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Embedding model | Gemini `gemini-embedding-001` | User already has key; no additional setup |
| Embedding dimensions | 768 (reduced) | 4x smaller storage, negligible quality loss |
| Vector storage | IndexedDB + brute-force cosine | Simple, fast enough for <10K chunks |
| Vector library | None (custom) | Avoid dependency; brute-force is adequate for MVP scale |
| Document formats | PDF, MD, TXT | Most common for sales content; DOCX in Phase 2 |
| Chunk size | ~1500 chars, 15% overlap | Balances context vs retrieval precision |
| Top-K retrieval | 3 chunks | Enough context without overwhelming prompt |
| File count | 3 new files | Merged from 9 to avoid over-abstraction |
| Progress UI | Simple spinner | No granular stage percentages (over-engineering) |
| Relevance display | Hidden or percentage | No star ratings (UX theater) |

### Critical Protections (from engineer review)

| Protection | Implementation |
|------------|----------------|
| **API key validation** | Check FIRST before any file processing |
| **Concurrent upload guard** | Module-level `isProcessing` flag, queue at UI |
| **Transaction batching** | Write chunks in batches of 50 to avoid IndexedDB timeout |
| **Crash recovery** | Track `lastProcessedChunk`, cleanup incomplete on init |
| **Memory protection** | Stream from IndexedDB cursor if >5000 chunks |
| **Storage headroom** | Check 50MB free before upload |

### Dependencies

| Package | Version | Purpose | Already Installed? |
|---------|---------|---------|-------------------|
| `pdfjs-dist` | ^4.0.0 | PDF text extraction | ✅ Yes |
| `marked` | ^12.0.0 | Markdown parsing | ✅ Yes |
| `idb` | ^8.0.0 | IndexedDB wrapper | ✅ Yes |

### Simplified File Structure

```
extension/src/services/kb/
├── kb-database.ts    # 200 lines: Types + IndexedDB + Chunking + Ingestion
├── extractors.ts     # 100 lines: PDF + Markdown + Text
└── kb-search.ts      # 80 lines: Cosine similarity + Retrieval

Modifications to existing files:
├── gemini-client.ts  # +50 lines: Add embedding methods
├── options.html      # +60 lines: KB section markup
├── options.ts        # +150 lines: KB handlers
├── options.css       # +80 lines: KB styles
└── overlay.ts        # +20 lines: Source attribution
```

**Total new code: ~750 lines** (down from estimated 1500+ in original plan)

### Out of Scope (MVP)

**Deferred to Phase 2:**
- DOCX support (common format - high priority for Phase 2)
- Google Drive sync (critical for enterprise - high priority)
- Document update/replace button (delete + re-upload works)
- Document preview/expand in list
- Document tags/categories
- Manual KB query from overlay
- Keyterm extraction for Deepgram

**Deferred to Phase 3+:**
- Entity detection integration
- Post-call summaries
- Pre-bundled industry templates
- Collaborative KB (team sharing) — requires backend
- Web page ingestion via URL

**Not Planned:**
- Offline embedding (Transformers.js) — requires Gemini online
- OCR for scanned PDFs — users should upload text-based PDFs

### Scope Cuts (from engineer review)

These were in earlier drafts but removed as over-engineering:

| Cut | Reason |
|-----|--------|
| Star ratings for relevance (★★★★☆) | UX theater, just sort by relevance |
| 5-stage progress with percentages | Over-engineered, simple spinner is enough |
| Sample document feature | Zero value, test with real docs |
| "Cancel remaining" queue button | Let it finish, delete after if needed |
| Storage quota warning at 80% | Show error when actually full |
| 9 separate service files | Merged to 3, no over-abstraction |

---

## Review History

| Date | Reviewer | Type | Key Changes |
|------|----------|------|-------------|
| 2026-01-31 | PM Agent | Product Review | Added success metrics, user stories, definition of done |
| 2026-01-31 | User Agent | User Perspective | Added user flows, real-world scenarios, pain points |
| 2026-01-31 | Designer Agent | UX Review | Added wireframes, state specs, component designs |
| 2026-01-31 | Senior Engineer | Technical Review | Cut tasks 18→10, files 9→3, added critical protections |
