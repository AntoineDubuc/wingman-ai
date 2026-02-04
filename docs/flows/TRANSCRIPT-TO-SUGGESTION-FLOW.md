# Transcript to Suggestion Flow

Complete trace from Deepgram transcript through KB search and Gemini API to overlay suggestion display.

## Flow Diagram

```
Deepgram WebSocket (transcript message)
  ↓
deepgramClient.onTranscriptCallback
  ↓
service-worker: handleTranscript()
  ├─ Add to transcriptCollector
  ├─ Send 'transcript' (lowercase) → Content Script → Overlay
  ├─ Apply speaker filter
  └─ If final: geminiClient.processTranscript()
      ↓
      ├─ Check cooldown (15s)
      ├─ Check rate-limit backoff
      └─ generateResponse()
          ↓
          ├─ KB Search (persona-scoped)
          │   ├─ Generate query embedding
          │   ├─ Filter chunks by persona.kbDocumentIds
          │   ├─ Cosine similarity search
          │   └─ Return top matches + source
          │
          ├─ Inject KB context into system prompt
          ├─ Build conversation with chat history
          ├─ Gemini API call
          │   └─ Handle 429 rate-limit backoff
          │
          └─ Parse response
              ├─ Check for silence marker (---)
              ├─ Classify suggestion type
              └─ Return Suggestion object
                  ↓
service-worker: Send 'suggestion' (lowercase) → Content Script
  ↓
content-script: Map suggestion type & call overlay.addSuggestion()
  ↓
overlay: Render suggestion card with KB source attribution
```

## Detailed Steps

### 1. Deepgram WebSocket Receives Transcript

**File**: `deepgram-client.ts`

**Connection** (line 140):
```typescript
new WebSocket(url, ['token', apiKey]);  // Sec-WebSocket-Protocol auth
```

**Message handler** (line 150-151):
```typescript
socket.onmessage = (event) => this.handleMessage(event);
```

**Transcript processing** (line 201-221):
- Parses `Results` type messages
- Handles endpointing-aware grouping (line 289-326)

**Endpointing Logic**:
- `is_final=false` → emit interim immediately
- `is_final=true, speech_final=false` → accumulate
- `is_final=true, speech_final=true` → flush as final
- Fallback timer (700ms) force-flushes accumulated segments

**Callback invocation** (line 271, 301, 320, 366):
```typescript
this.onTranscriptCallback?.({
  text: fullText,
  speaker, speaker_id, speaker_role,
  is_final, is_self, confidence, timestamp,
});
```

### 2. Service Worker Processes Transcript

**File**: `service-worker.ts:370-431`

**Callback registration** (line 255-257):
```typescript
deepgramClient.setTranscriptCallback((transcript: Transcript) => {
  handleTranscript(transcript);
});
```

**Handler actions**:

1. **Add to transcript collector** (line 372-380):
   ```typescript
   transcriptCollector.addTranscript({
     timestamp: transcript.timestamp,
     speaker: transcript.speaker,
     text: transcript.text,
     is_final: transcript.is_final,
   });
   ```

2. **Send to content script** (line 383-390) ⚠️ **LOWERCASE**:
   ```typescript
   chrome.tabs.sendMessage(activeTabId, {
     type: 'transcript',  // LOWERCASE — critical convention
     data: transcript,
   });
   ```

3. **Apply speaker filter** (line 393-396):
   ```typescript
   const speakerFilter = await chrome.storage.local.get('speakerFilterEnabled');
   if (speakerFilter.speakerFilterEnabled && transcript.is_self) {
     return;  // Skip consultant's own speech
   }
   ```

4. **Process final transcripts only** (line 399-430):
   ```typescript
   if (!transcript.is_final) return;

   const suggestion = await geminiClient.processTranscript(
     transcript.text,
     transcript.speaker,
     transcript.is_final
   );
   ```

### 3. Gemini Client: Process Transcript

**File**: `gemini-client.ts:151-215`

**Validation** (line 151-187):
- Not empty, ≥2 words
- Final transcripts only
- Add to chat history (max 20 turns)

**Cooldown enforcement** (line 196-202) ⚠️ **15-second rule**:
```typescript
if (this.lastSuggestionTime) {
  const elapsed = Date.now() - this.lastSuggestionTime;
  if (elapsed < this.suggestionCooldownMs) {  // 15000ms
    console.debug(`[GeminiClient] Cooldown active (${elapsed}ms)`);
    return null;  // Skip suggestion
  }
}
```

**Rate-limit backoff** (line 189-193):
```typescript
if (this.rateLimitedUntil && Date.now() < this.rateLimitedUntil) {
  return null;  // Skip during backoff period
}
```

**Concurrency guard** (line 204-208):
```typescript
if (this.isGenerating) {
  return null;  // Prevent overlapping requests
}
this.isGenerating = true;
this.lastSuggestionTime = Date.now();  // Update before generation
```

**Generate response** (line 220-334):
```typescript
return await this.generateResponse(currentText, currentSpeaker);
```

### 4. KB Search (Persona-Scoped)

**File**: `gemini-client.ts:241-260`

**KB retrieval**:
```typescript
const kbResult = await getKBContext(kbQuery, this.kbDocumentFilter ?? undefined);
```

**Persona filter**: Set during session start (service-worker.ts:247)
```typescript
geminiClient.setKBDocumentFilter(persona.kbDocumentIds);
```

---

**File**: `kb/kb-search.ts`

**High-level entry** (line 109-152):
```typescript
export async function getKBContext(
  utterance: string,
  documentIds?: number[]
): Promise<{ context: string; source: string; matched: boolean }> {
  // ...
}
```

**Persona scoping** (line 124-128):
```typescript
const relevantDocs = documentIds && documentIds.length > 0
  ? completeDocs.filter((d) => documentIds.includes(d.id))
  : completeDocs;
```

**No matches handling** (line 129-143):
- Logs diagnostic info
- Returns `{ context: '', source: '', matched: false }`

**Search call** (line 147):
```typescript
const results = await searchKB(utterance, DEFAULT_TOP_K, DEFAULT_THRESHOLD, documentIds);
```

---

**Search function** (line 27-92):

**Generate query embedding** (line 54-58):
```typescript
queryEmbedding = await geminiClient.generateEmbedding(query, 'RETRIEVAL_QUERY');
```

**Build filter set** (line 60-63):
```typescript
const filterSet = documentIds && documentIds.length > 0
  ? new Set(documentIds)
  : null;
```

**Chunk retrieval with filtering** (line 65-90):
```typescript
for (const chunk of chunks) {
  if (filterSet && !filterSet.has(chunk.documentId)) {
    filteredOut++;
    continue;  // Skip chunks not in persona's doc set
  }

  const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);

  if (similarity >= threshold) {
    candidates.push({ chunk, similarity });
  }
}
```

**Cosine similarity** (line 7-19):
```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dotProduct / (magA * magB);
}
```

**Default threshold**: 0.55 similarity
**Default top-K**: 3 chunks

**Returns** (line 88-90):
- Sorted by similarity (descending)
- Truncated to top-K

### 5. Gemini API Call with KB Context

**File**: `gemini-client.ts:220-334`

**System prompt injection** (line 243-260):
```typescript
if (kbResult.matched && kbResult.context) {
  systemPromptWithKB =
    `KNOWLEDGE BASE CONTEXT (from ${kbResult.source}):\n` +
    `${kbResult.context}\n\n` +
    `${this.systemPrompt}`;
  kbSource = kbResult.source;
}
```

**Persona system prompt**: Set during session start (service-worker.ts:246)
```typescript
geminiClient.setSystemPrompt(persona.systemPrompt);
```

**Conversation building** (line 263):
```typescript
const contents = this.buildConversationMessages(currentText, currentSpeaker);
```

Includes:
- Chat history (last 20 turns)
- Current utterance
- Explicit instruction to respond or stay silent (`---`)

**REST API call** (line 267-285):
```typescript
const response = await fetch(
  `${GEMINI_API_BASE}/${this.model}:generateContent?key=${apiKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemPromptWithKB }] },
      generationConfig: { maxOutputTokens, temperature },
    }),
  }
);
```

**Model**: `gemini-2.0-flash-exp` (default)

**Rate-limit handling** (line 288-294) ⚠️ **429 backoff**:
```typescript
if (response.status === 429) {
  const backoffSeconds = this.parseRetryDelay(await response.text());
  this.rateLimitedUntil = Date.now() + backoffSeconds * 1000;
  console.warn(`[GeminiClient] Rate limited — backing off ${backoffSeconds}s`);
  return null;
}
```

**Response parsing** (line 301-314):
```typescript
const result = await response.json();
const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

if (!responseText || responseText === '---' || responseText === '-') {
  return null;  // LLM chose to stay silent
}
```

**Suggestion classification** (line 323):
```typescript
const suggestion_type = this.classifySuggestionType(responseText);
// Returns: 'answer' | 'question' | 'objection' | 'info'
```

**Returns** (line 320-327):
```typescript
return {
  text: responseText,
  confidence: 0.85,
  suggestion_type,
  source: 'gemini',
  timestamp: new Date().toISOString(),
  kbSource: kbResult.source || null,
};
```

**Cooldown update** (line 211):
```typescript
this.lastSuggestionTime = Date.now();  // Before generation
```

### 6. Service Worker Sends Suggestion

**File**: `service-worker.ts:407-426`

**Add to transcript collector** (line 407-414):
```typescript
transcriptCollector.addSuggestion({
  text: suggestion.text,
  suggestion_type: suggestion.suggestion_type,
  timestamp: suggestion.timestamp,
});
```

**Send to content script** (line 416-422) ⚠️ **LOWERCASE**:
```typescript
chrome.tabs.sendMessage(activeTabId, {
  type: 'suggestion',  // LOWERCASE — critical
  data: suggestion,
});
```

### 7. Content Script Maps Suggestion

**File**: `content-script.ts:118-137`

```typescript
case 'suggestion':
  const suggestionType: 'answer' | 'objection' | 'info' =
    rawType === 'answer' || rawType === 'technical' ? 'answer' :
    rawType === 'objection' || rawType === 'comparison' ? 'objection' : 'info';

  const suggestion = {
    type: suggestionType,
    text: message.data.response || message.data.text || 'No suggestion available',
    question: message.data.question,
    confidence: message.data.confidence,
    timestamp: message.data.timestamp ? new Date(message.data.timestamp).getTime() : Date.now(),
    kbSource: message.data.kbSource as string | undefined,
  };

  overlay?.addSuggestion(suggestion);
```

### 8. Overlay Displays Suggestion Card

**File**: `overlay.ts`

**Add suggestion** (line 1287-1315):
```typescript
addSuggestion(suggestion: Suggestion): void {
  const entry: TimelineEntry = {
    kind: 'suggestion',
    speaker: 'Wingman',
    suggestionText: suggestion.text,
    suggestionType: suggestion.type,
    timestamp: suggestion.timestamp,
    kbSource: suggestion.kbSource,
    confidence: suggestion.confidence,
  };

  this.renderBubble(entry, true);
}
```

**Render bubble** (line 1348-1374):

**Create bubble element** (line 1350-1354):
```typescript
const bubble = document.createElement('div');
bubble.className = `bubble wingman ${typeClass}`;  // 'answer'|'objection'|'info'
```

**KB source attribution** (line 1357-1359):
```typescript
const sourceHtml = entry.kbSource
  ? `<div class="bubble-source">📚 Based on: ${this.escapeHtml(entry.kbSource)}</div>`
  : '';
```

**Build HTML** (line 1361-1371):
```typescript
bubble.innerHTML =
  `<div class="bubble-header">` +
  `${ICON_WINGMAN}` +
  `<span class="badge ${typeClass}">${badgeLabel}</span>` +
  `</div>` +
  `<span class="bubble-text">${this.escapeHtml(entry.suggestionText || '')}</span>` +
  sourceHtml +
  `<span class="bubble-time">${this.formatTime(entry.timestamp)}</span>`;
```

**Styling** (overlay.ts CSS line 623-636):
```css
.bubble.wingman { border-left: 3px solid; border-radius: 8px; }
.bubble.wingman.answer { border-left-color: #e67e22; }    /* Orange */
.bubble.wingman.objection { border-left-color: #ea4335; } /* Red */
.bubble.wingman.info { border-left-color: #fbbc05; }       /* Yellow */
```

**Animation** (line 1354):
```css
animation: wingmanIn 250ms ease-out forwards;
```

**Auto-scroll** (line 1314):
```typescript
if (userIsNearBottom) {
  timeline.scrollTop = timeline.scrollHeight;
}
```

**Timeline trim** (line 1313):
```typescript
if (this.timelineEntries.length > 500) {
  this.timelineEntries.shift();  // Remove oldest
}
```

## Error Handling & Edge Cases

| Scenario | Handler | Fallback |
|----------|---------|----------|
| KB embedding fails | Try/catch in generateResponse() (line 245-260) | Proceeds without KB, logs warning |
| KB no matches | Returns null context, matched=false | Suggestion generated without KB |
| Persona filter empty | Searches all docs (kb-search.ts:60-63) | No filtering applied |
| Cooldown active | Returns null (gemini-client.ts:196-202) | No suggestion shown |
| Rate-limit 429 | Backoff timer set (gemini-client.ts:289-294) | Next request waits |
| Concurrency guard | isGenerating flag prevents overlap | Current request skipped |
| LLM silent (---) | Detects silence marker (gemini-client.ts:312-314) | No suggestion shown |
| Overlay detached | Re-attaches to DOM (content-script.ts:51-56) | Overlay reappears |

## Critical Conventions

### 1. Lowercase Message Types ⚠️
- Service worker sends: `transcript`, `suggestion`
- Never: `TRANSCRIPT`, `SUGGESTION`
- Content script expects lowercase (content-script.ts:73, 118)

### 2. Deepgram WebSocket Auth
- Uses `Sec-WebSocket-Protocol` header (deepgram-client.ts:140)
- Never use `?token=` in URL (returns 401)

### 3. Persona Scoping
- Set on session start: `geminiClient.setKBDocumentFilter(persona.kbDocumentIds)`
- Passed to KB search: `getKBContext(query, this.kbDocumentFilter)`
- Filters chunks in searchKB (kb-search.ts:60-63)

### 4. 15-Second Suggestion Cooldown
- Enforced in processTranscript() (gemini-client.ts:196-202)
- LLM also decides to stay silent (`---`)

### 5. Segment Grouping
- Prevents mid-sentence bubble splits (deepgram-client.ts:289-326)
- Accumulates until `speech_final=true`

## Code References

| Function | File | Lines | Purpose |
|----------|------|-------|---------|
| `handleMessage()` | deepgram-client.ts | 201-221 | Parse Deepgram messages |
| `handleTranscript()` | service-worker.ts | 370-431 | Transcript routing |
| `processTranscript()` | gemini-client.ts | 151-215 | Cooldown + validation |
| `generateResponse()` | gemini-client.ts | 220-334 | KB + Gemini API |
| `getKBContext()` | kb-search.ts | 109-152 | High-level KB search |
| `searchKB()` | kb-search.ts | 27-92 | Cosine similarity search |
| `addSuggestion()` | overlay.ts | 1287-1315 | Render suggestion card |
