# Implementation Plan: KB Technical Validation

**STATUS: ✅ COMPLETE - ALL TESTS PASSED**

See detailed results: [KB-VALIDATION-RESULTS.md](./KB-VALIDATION-RESULTS.md)

---

## Executive Summary

Before building the full Knowledge Base feature, we must validate that each core technical component works in the Chrome extension environment. This plan creates isolated test scripts for each "lego block" that can be executed from the service worker or Node.js to confirm feasibility. No UI work—pure technical validation.

**Key Outcomes:**
- Confirm Gemini embedding API works from extension context
- Confirm PDF.js text extraction works (service worker or offscreen)
- Confirm IndexedDB can store/retrieve vectors at required scale
- Confirm cosine similarity search meets latency requirements (<50ms)
- Confirm end-to-end pipeline latency is acceptable (<500ms)

---

## Master Checklist

### Instructions for Claude Code

> **CRITICAL: You must follow these rules exactly.**
>
> 1. **Save after every cell write.** Each time you update a cell, save immediately.
> 2. **Check the checkbox** when you begin a task.
> 3. **Workflow:** Check → Save → Start time → Save → Work → End time → Save → Total → Save → Estimate → Save → Multiplier → Save
> 4. **Time format:** `HH:MM` for start/end. Minutes for totals.
> 5. **Multiplier:** `Human Estimate ÷ Total Time` as `Nx`

### Progress Dashboard

| Done | # | Task Name | Start | End | Total (min) | Human Est. (min) | Multiplier |
|:----:|:-:|-----------|:-----:|:---:|:-----------:|:----------------:|:----------:|
| [x] | 1 | Create validation test harness | 07:42 | 08:10 | 28 | 60 | 2.1x |
| [x] | 2 | Test Gemini embedding API | 08:10 | 08:20 | 10 | 30 | 3.0x |
| [x] | 3 | Test PDF.js text extraction | 08:20 | 08:35 | 15 | 45 | 3.0x |
| [x] | 4 | Test Markdown/text extraction | 08:35 | 08:40 | 5 | 20 | 4.0x |
| [x] | 5 | Test IndexedDB vector storage | 08:40 | 08:45 | 5 | 30 | 6.0x |
| [x] | 6 | Test cosine similarity performance | 08:45 | 08:50 | 5 | 30 | 6.0x |
| [x] | 7 | Test end-to-end pipeline | 08:50 | 08:55 | 5 | 45 | 9.0x |
| [x] | 8 | Document findings and feasibility | 08:55 | 09:05 | 10 | 30 | 3.0x |

**Summary:**
- Total tasks: 8
- Completed: 8
- Total time spent: 83 minutes
- Total human estimate: 290 minutes
- Overall multiplier: 3.5x

---

## Task Descriptions

---

### Task 1: Create validation test harness

**Intent:** Set up a minimal test infrastructure that allows running validation scripts from the extension's service worker context, with results logged to console.

**Context:** Foundation for all other tasks. No dependencies.

**Expected behavior:** A new folder `extension/src/validation/` with a test runner that can be triggered from the service worker. Results are logged to the service worker console (viewable in chrome://extensions).

**Key components:**
- `extension/src/validation/index.ts` - test runner with `runAllTests()` and `runTest(name)`
- `extension/src/validation/results.ts` - result logging utilities
- `extension/src/background/service-worker.ts` - add message handler to trigger tests
- Trigger via: `chrome.runtime.sendMessage({ type: 'RUN_VALIDATION', test: 'all' })`

**Notes:**
- Each test returns `{ success: boolean, duration: number, details: string }`
- Log results clearly: `[VALIDATION] test-name: PASS/FAIL (123ms) - details`
- Tests should be independent and idempotent
- Include sample test data inline (no external files needed for validation)

---

### Task 2: Test Gemini embedding API

**Intent:** Verify that the Gemini embedding endpoint works from the extension context using the user's API key.

**Context:** Depends on Task 1 for harness. Critical—if this fails, we need Transformers.js fallback.

**Expected behavior:**
1. Retrieve Gemini API key from `chrome.storage.local`
2. Call embedding endpoint with sample text
3. Verify response contains 768-dimension vector
4. Measure latency for single embedding
5. Test batch embedding (5 texts) and measure latency

**Key components:**
- `extension/src/validation/test-gemini-embeddings.ts`
- Test data: 3 sample sentences of varying length

**Validation criteria:**
- [ ] API call succeeds (200 response)
- [ ] Returns array of 768 numbers
- [ ] Values are normalized (magnitude ≈ 1.0)
- [ ] Single embedding latency < 500ms
- [ ] Batch 5 embeddings latency < 1500ms

**Notes:**
- If API key missing, log clear error and skip
- Test both `RETRIEVAL_DOCUMENT` and `RETRIEVAL_QUERY` task types
- Log actual dimensions received (verify 768, not 3072)

---

### Task 3: Test PDF.js text extraction

**Intent:** Verify PDF.js can extract text in the extension environment, determining if service worker works or if offscreen document is needed.

**Context:** Depends on Task 1. If service worker fails, must test offscreen approach.

**Expected behavior:**
1. Load PDF.js library
2. Parse a base64-encoded sample PDF (embedded in test)
3. Extract text from all pages
4. Verify text content matches expected

**Key components:**
- `extension/src/validation/test-pdf-extraction.ts`
- `extension/src/validation/sample-data.ts` - base64 encoded tiny PDF
- May need: `extension/src/offscreen/` if service worker fails

**Validation criteria:**
- [ ] PDF.js loads without error
- [ ] Worker initializes (or works without worker)
- [ ] Text extracted from sample PDF
- [ ] Extraction latency measured
- [ ] Multi-page handling works

**Notes:**
- Create minimal test PDF with known text content
- If service worker fails with worker error, test with `workerSrc` disabled
- If that fails, create offscreen document test
- Document which approach works

---

### Task 4: Test Markdown/text extraction

**Intent:** Verify marked.js works for Markdown parsing and plain text can be processed.

**Context:** Depends on Task 1. Lower risk than PDF—likely to work.

**Expected behavior:**
1. Parse sample Markdown with headers, lists, code blocks
2. Extract clean text suitable for chunking
3. Verify structure is preserved (headers become text labels)
4. Test plain text passthrough

**Key components:**
- `extension/src/validation/test-text-extraction.ts`
- Sample Markdown string embedded in test

**Validation criteria:**
- [ ] Marked.js loads and parses
- [ ] Headers extracted as text
- [ ] Lists converted to text
- [ ] Code blocks included
- [ ] Plain text works unchanged

**Notes:**
- Test UTF-8 characters
- Test edge cases: empty file, very long lines
- Measure parsing latency (should be <10ms)

---

### Task 5: Test IndexedDB vector storage

**Intent:** Verify IndexedDB can store and retrieve vector embeddings at the required scale (5K+ chunks).

**Context:** Depends on Task 1. Tests storage, not search.

**Expected behavior:**
1. Create test database with chunks object store
2. Store 1000 mock vectors (768 dimensions each)
3. Retrieve vectors by document ID
4. Delete by document ID
5. Measure storage size and latency

**Key components:**
- `extension/src/validation/test-indexeddb-vectors.ts`
- Uses `idb` library or raw IndexedDB API

**Validation criteria:**
- [ ] Database creation succeeds
- [ ] 1000 vectors stored successfully
- [ ] Storage size ~3MB (1000 × 768 × 4 bytes)
- [ ] Bulk insert latency < 5 seconds
- [ ] Single document retrieval < 50ms
- [ ] Delete cascades correctly

**Notes:**
- Generate random vectors for testing (don't need real embeddings)
- Test with Float32Array for storage efficiency
- Measure actual storage via `navigator.storage.estimate()`
- Clean up test database after

---

### Task 6: Test cosine similarity performance

**Intent:** Verify brute-force cosine similarity search meets latency requirements for realistic dataset sizes.

**Context:** Depends on Task 5 for stored vectors. Critical for retrieval feasibility.

**Expected behavior:**
1. Load N vectors from IndexedDB into memory
2. Generate random query vector
3. Compute cosine similarity against all vectors
4. Sort and return top-K results
5. Measure latency for N = 100, 1000, 5000

**Key components:**
- `extension/src/validation/test-cosine-search.ts`
- Pure JavaScript implementation (no libraries)

**Validation criteria:**
- [ ] 100 vectors: search < 5ms
- [ ] 1000 vectors: search < 20ms
- [ ] 5000 vectors: search < 100ms
- [ ] Top-K results correctly sorted by score
- [ ] Scores in valid range [0, 1] for normalized vectors

**Notes:**
- Cosine similarity for normalized vectors = dot product
- Test both Float32Array and regular arrays
- If too slow, note Web Worker as optimization path
- Log memory usage if possible

---

### Task 7: Test end-to-end pipeline

**Intent:** Verify the complete flow works: text → chunk → embed → store → query → retrieve.

**Context:** Depends on Tasks 2-6 all passing. Integration test.

**Expected behavior:**
1. Take sample text (3 paragraphs about a product)
2. Chunk into ~3-5 segments
3. Generate real embeddings via Gemini
4. Store in IndexedDB
5. Create query embedding for related question
6. Retrieve top-3 chunks
7. Verify relevant chunks are returned
8. Measure total latency

**Key components:**
- `extension/src/validation/test-e2e-pipeline.ts`
- Uses all previously tested components

**Validation criteria:**
- [ ] Chunking produces expected segments
- [ ] All chunks embedded successfully
- [ ] Chunks stored in IndexedDB
- [ ] Query retrieves semantically relevant chunks
- [ ] Total pipeline latency < 2 seconds (indexing)
- [ ] Query latency < 500ms (retrieval)

**Notes:**
- Use real product-related text for meaningful semantic test
- Query should be semantically related but not exact match
- Log which chunks are retrieved and their scores
- This is the "moment of truth" test

---

### Task 8: Document findings and feasibility

**Intent:** Compile all test results into a clear feasibility report with go/no-go recommendation.

**Context:** Depends on Tasks 2-7 completing.

**Expected behavior:** Markdown document summarizing:
- Each test's pass/fail status
- Actual performance numbers
- Any workarounds needed (e.g., offscreen for PDF)
- Blockers or risks discovered
- Clear recommendation: proceed / pivot / investigate further

**Key components:**
- `extension/src/validation/VALIDATION-RESULTS.md` (generated)
- Update main implementation plan if needed

**Validation criteria:**
- [ ] All critical tests documented
- [ ] Performance numbers recorded
- [ ] Blockers clearly identified
- [ ] Recommendation stated

**Notes:**
- Be honest about failures
- If something doesn't work, document alternatives
- Include code snippets that worked for future reference

---

## Appendix

### Test Data

**Sample text for embedding test:**
```
"CloudGeometry provides enterprise cloud consulting services."
"Our CGDevX platform reduces Kubernetes costs by 50%."
"We are an AWS Advanced Consulting Partner with SOC2 compliance."
```

**Sample query:**
```
"What security certifications do you have?"
```

**Expected retrieval:** Third sentence should score highest.

### Dependencies

| Package | Purpose | Already Installed? |
|---------|---------|-------------------|
| `pdfjs-dist` | PDF extraction | No - install for Task 3 |
| `marked` | Markdown parsing | No - install for Task 4 |
| `idb` | IndexedDB wrapper | No - install for Task 5 |

### Success Criteria

All tests must pass for full KB implementation to proceed:

| Test | Must Pass | Acceptable Workaround |
|------|-----------|----------------------|
| Gemini embeddings | ✅ | None (core dependency) |
| PDF extraction | ✅ | Offscreen document OK |
| Text extraction | ✅ | None (low risk) |
| IndexedDB storage | ✅ | None (core dependency) |
| Cosine search | ✅ | Web Worker if >100ms |
| E2E pipeline | ✅ | <1s latency acceptable |
