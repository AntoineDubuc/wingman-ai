# Getting Started - Junior Engineer Guide

Welcome to Wingman AI! This guide will get you productive in < 30 minutes.

## Table of Contents

1. [Quick Setup](#quick-setup)
2. [Project Overview](#project-overview)
3. [Documentation Map](#documentation-map)
4. [Common Tasks](#common-tasks)
5. [Where to Find Things](#where-to-find-things)
6. [Debugging Guide](#debugging-guide)
7. [Before You Code](#before-you-code)

---

## Quick Setup

### Prerequisites

- Node.js ≥18.0.0
- Chrome/Chromium browser
- Git

### Get Running (< 5 minutes)

```bash
cd wingman-ai/extension
npm install
npm run dev          # Watch mode - rebuilds on file changes
```

**Load extension:**
1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select `wingman-ai/extension/dist/`

**Test it:**
1. Get free API keys:
   - Deepgram: https://console.deepgram.com/
   - Gemini: https://aistudio.google.com/apikey (or OpenRouter/Groq key)
2. Right-click extension icon → Options → API Keys tab
3. Select your LLM provider, paste keys, choose a model, click Save
4. Join a Google Meet: https://meet.google.com/new
5. Click extension icon → Start Session
6. Speak → see live transcripts + AI suggestions

---

## Project Overview

**What is Wingman AI?**
Real-time AI assistant for sales calls on Google Meet. Listens to conversation, provides contextual suggestions using AI + knowledge base documents.

**Key Features:**
- Real-time speech-to-text (Deepgram)
- AI suggestions (Google Gemini, OpenRouter, or Groq)
- Knowledge base semantic search
- Multi-persona system (different prompts + KB docs)
- Call summaries auto-saved to Google Drive
- Live cost tracking during sessions

**Architecture:**
- **BYOK** (Bring Your Own Keys) — no backend server
- Users provide Deepgram + LLM API keys (Gemini, OpenRouter, or Groq)
- Extension makes direct API calls from browser
- All data stays local (chrome.storage + IndexedDB)

**Tech Stack:**
- TypeScript (strict mode)
- Vite + @crxjs/vite-plugin (build)
- Chrome Extension Manifest V3
- IndexedDB (for embeddings)
- AudioWorklet (audio processing)

---

## Documentation Map

**Start here:**

1. **diagrams/ARCHITECTURE.md** → Visual overview of system components
2. **diagrams/SEQUENCES.md** → Sequence diagrams for key flows
3. **FILE-STRUCTURE-MAP.md** → Understand what each file does
4. **CODE-PATTERNS.md** → Copy-paste patterns for common tasks
5. **flows/** directory → Detailed traces with code references
   - `SESSION-START-FLOW.md`
   - `AUDIO-CAPTURE-PIPELINE.md`
   - `TRANSCRIPT-TO-SUGGESTION-FLOW.md`
   - `SESSION-STOP-AND-SUMMARY-FLOW.md`

**When you need it:**

- **CODE-DISCOVERY-PATTERN.md** → How to explore codebase safely (when working with Claude Code)
- **CLAUDE.md** (root) → Project-specific instructions for Claude Code
- **README.md** → High-level project info

---

## Common Tasks

### Task 1: Add a New Message Type

**Example:** Add a `CLEAR_OVERLAY` message to reset overlay UI.

**Steps:**
1. **Service worker sends** (lowercase):
   ```typescript
   // service-worker.ts
   chrome.tabs.sendMessage(activeTabId, {
     type: 'clear_overlay',  // lowercase
   }).catch(() => {});
   ```

2. **Content script receives**:
   ```typescript
   // content-script.ts
   chrome.runtime.onMessage.addListener((message) => {
     switch (message.type) {
       case 'clear_overlay':  // lowercase
         overlay?.clear();
         break;
     }
   });
   ```

3. **Overlay implements**:
   ```typescript
   // overlay.ts
   clear(): void {
     this.timelineEntries = [];
     this.render();
   }
   ```

**Pattern reference:** [Message Handling Pattern](CODE-PATTERNS.md#message-handling-pattern)

---

### Task 2: Add a New Storage Key

**Example:** Store user's preferred language.

**Steps:**
1. **Create typed helper** (if reused):
   ```typescript
   // shared/settings.ts
   export async function getLanguage(): Promise<string> {
     const result = await chrome.storage.local.get('preferredLanguage');
     return result.preferredLanguage ?? 'en';
   }

   export async function setLanguage(lang: string): Promise<void> {
     await chrome.storage.local.set({ preferredLanguage: lang });
   }
   ```

2. **Use in options page**:
   ```typescript
   // options/sections/transcription.ts
   private async load() {
     const lang = await getLanguage();
     this.languageSelect.value = lang;
   }

   private async save() {
     await setLanguage(this.languageSelect.value);
   }
   ```

**Pattern reference:** [Chrome Storage Pattern](CODE-PATTERNS.md#chrome-storage-pattern)

---

### Task 3: Add a New Options Section

**Example:** Add "Notifications" settings panel.

**Steps:**
1. **Create section class**:
   ```typescript
   // options/sections/notifications.ts
   import type { OptionsContext } from './shared';

   export class NotificationsSection {
     private ctx!: OptionsContext;

     async init(ctx: OptionsContext): Promise<void> {
       this.ctx = ctx;
       // Get DOM elements
       // Bind event listeners
       // Load initial state
     }
   }
   ```

2. **Add HTML** in `options/options.html`:
   ```html
   <div id="notifications-section" class="settings-section">
     <h2>Notifications</h2>
     <!-- Your UI here -->
   </div>
   ```

3. **Register in controller**:
   ```typescript
   // options/options.ts
   import { NotificationsSection } from './sections/notifications';

   const notificationsSection = new NotificationsSection();
   await notificationsSection.init(ctx);
   ```

**Pattern reference:** [Options Section Pattern](CODE-PATTERNS.md#options-section-pattern)

---

### Task 4: Debug Why Audio Isn't Streaming

**Checklist:**
1. Check service worker logs: `chrome://extensions/` → "Service worker"
2. Check Deepgram connection:
   ```
   [DeepgramClient] Connected  ← Good
   [DeepgramClient] Not connected, discarding audio  ← Bad
   ```
3. Check offscreen logs: Service worker console → filter "Offscreen"
4. Check mic permission: Chrome should show mic icon in URL bar
5. Check AUDIO_CHUNK messages: Should see frequent chunks in service worker
6. Test Deepgram key: Options → API Keys → Test Keys

**Common issues:**
- **No audio**: Mic permission denied → grant permission
- **401 from Deepgram**: Wrong API key or using query param auth
- **No transcripts**: Check `endpointingMs` setting (should be 700)
- **Choppy audio**: Check AudioWorklet errors in offscreen logs

**Flow reference:** [AUDIO-CAPTURE-PIPELINE.md](flows/AUDIO-CAPTURE-PIPELINE.md)

---

### Task 5: Add a New Persona Field

**Example:** Add "tone" field (formal/casual).

**Steps:**
1. **Update type**:
   ```typescript
   // shared/persona.ts
   export interface Persona {
     id: string;
     name: string;
     color: string;
     systemPrompt: string;
     kbDocumentIds: string[];
     tone: 'formal' | 'casual';  // NEW
     createdAt: number;
     updatedAt: number;
   }
   ```

2. **Update factory**:
   ```typescript
   export function createPersona(
     name: string,
     systemPrompt: string,
     color: string = DEFAULT_PERSONA_COLOR,
     kbDocumentIds: string[] = [],
     tone: 'formal' | 'casual' = 'formal'  // NEW
   ): Persona {
     return {
       // ... existing fields
       tone,
     };
   }
   ```

3. **Update UI** (options/sections/personas.ts):
   - Add dropdown in persona editor
   - Bind to persona object
   - Include in save/load

4. **Migrate existing data**:
   ```typescript
   // shared/persona.ts
   export async function migratePersonaTone() {
     const personas = await getPersonas();
     const updated = personas.map((p) => ({
       ...p,
       tone: p.tone ?? 'formal',  // Add default
     }));
     await savePersonas(updated);
   }
   ```

---

## Where to Find Things

### "I want to change..."

| What | File | Line/Section |
|------|------|--------------|
| **Deepgram model** | `services/deepgram-client.ts` | Line 12 (`DEEPGRAM_PARAMS`) |
| **LLM provider/model** | `options/sections/api-keys.ts` | Provider selector + model picker |
| **LLM model lists** | `shared/llm-config.ts` | `GROQ_MODELS`, `OPENROUTER_MODELS` |
| **Suggestion cooldown** | `shared/llm-config.ts` | `SUGGESTION_COOLDOWN_MS` constant |
| **Model tuning profiles** | `shared/model-tuning.ts` | `getTuningProfile()` |
| **Cost/pricing data** | `shared/pricing.ts` | Per-model pricing table |
| **KB similarity threshold** | `services/kb/kb-search.ts` | Line 31 (`DEFAULT_THRESHOLD`) |
| **Overlay styles** | `content/overlay.ts` | Line 205-933 (inline CSS) |
| **Popup UI** | `popup/popup.html` + `popup/popup.ts` | — |
| **Options UI** | `options/options.html` + `options/sections/` | — |
| **Default persona templates** | `shared/default-personas.ts` | Whole file |
| **Audio sample rate** | `content/audio-processor.worklet.js` | Search `16000` |
| **Drive OAuth scopes** | `manifest.json` | Line 27-30 |

### "I want to understand..."

| What | Read This |
|------|-----------|
| **System architecture** | [ARCHITECTURE.md](diagrams/ARCHITECTURE.md) (visual) |
| **How session starts** | [SEQUENCES.md - Session Start](diagrams/SEQUENCES.md#session-start-flow) (visual) → [SESSION-START-FLOW.md](flows/SESSION-START-FLOW.md) (detailed) |
| **How audio gets to Deepgram** | [SEQUENCES.md - Audio Chunk](diagrams/SEQUENCES.md#audio-chunk-flow) (visual) → [AUDIO-CAPTURE-PIPELINE.md](flows/AUDIO-CAPTURE-PIPELINE.md) (detailed) |
| **How suggestions work** | [SEQUENCES.md - Transcript Flow](diagrams/SEQUENCES.md#transcript-to-suggestion-flow) (visual) → [TRANSCRIPT-TO-SUGGESTION-FLOW.md](flows/TRANSCRIPT-TO-SUGGESTION-FLOW.md) (detailed) |
| **How call summaries work** | [SEQUENCES.md - Summary Flow](diagrams/SEQUENCES.md#session-stop-and-summary-flow) (visual) → [SESSION-STOP-AND-SUMMARY-FLOW.md](flows/SESSION-STOP-AND-SUMMARY-FLOW.md) (detailed) |
| **Singleton pattern** | [CODE-PATTERNS.md#singleton-services-pattern](CODE-PATTERNS.md#singleton-services-pattern) |
| **Message types** | [ARCHITECTURE.md - Message Convention](diagrams/ARCHITECTURE.md#message-type-convention) (visual) → [CODE-PATTERNS.md#message-handling-pattern](CODE-PATTERNS.md#message-handling-pattern) (code) |

---

## Debugging Guide

### Service Worker Logs

**Access:** `chrome://extensions/` → Click "Service worker" link

**Look for:**
- `[ServiceWorker] Received: START_SESSION`
- `[DeepgramClient] Connected`
- `[GeminiClient] Generating suggestion...`
- Errors in red

**Common errors:**
- `No API key configured` → Set keys in options
- `Failed to connect to Deepgram` → Check API key, network
- `Rate limited` → Hit Gemini quota, wait for backoff

### Content Script Logs

**Access:** F12 on Google Meet tab → Console

**Look for:**
- `[ContentScript] Overlay initialized`
- `[ContentScript] Received transcript`
- Shadow DOM warnings

**Common errors:**
- `Cannot read properties of null` → Overlay not initialized
- `Extension context invalidated` → Extension reloaded, refresh page

### Popup Logs

**Access:** Right-click extension icon → Inspect

**Look for:**
- `[Popup] Status: active`
- Button click handlers

### Offscreen Logs

**Access:** Service worker console → Messages prefixed with `[Offscreen]`

**Look for:**
- `[Offscreen] Dual capture started`
- `[Offscreen] Sending audio chunk`
- AudioWorklet errors

### Quick Diagnostics

**Check session status:**
```typescript
// In service worker console
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, console.log);
```

**Check storage:**
```typescript
chrome.storage.local.get(null, console.log);  // All keys
```

**Check personas:**
```typescript
chrome.storage.local.get('personas', (r) => console.table(r.personas));
```

**Check Deepgram connection:**
```typescript
// In service worker
deepgramClient.getIsConnected();  // Should return true
```

---

## Before You Code

### 1. Read Relevant Flow Diagram

Don't guess how things work. Read the flow diagram first:
- Adding feature to session start? → Read SESSION-START-FLOW.md
- Modifying transcripts? → Read TRANSCRIPT-TO-SUGGESTION-FLOW.md
- Changing audio processing? → Read AUDIO-CAPTURE-PIPELINE.md

### 2. Check for Existing Pattern

Look in CODE-PATTERNS.md before writing new code:
- "I need to add storage" → Chrome Storage Pattern
- "I need to send a message" → Message Handling Pattern
- "I need a new service" → Singleton Services Pattern

### 3. Follow Critical Conventions

**These WILL break the extension if violated:**

❌ **Never use uppercase message types to content script**
```typescript
// ❌ WRONG
chrome.tabs.sendMessage(tabId, { type: 'TRANSCRIPT' });

// ✅ CORRECT
chrome.tabs.sendMessage(tabId, { type: 'transcript' });
```

❌ **Never use query param for Deepgram auth**
```typescript
// ❌ WRONG
new WebSocket(`wss://api.deepgram.com/v1/listen?token=${key}`);

// ✅ CORRECT
new WebSocket(url, ['token', key]);
```

❌ **Never forget `return true` for async message handlers**
```typescript
// ❌ WRONG - channel closes before sendResponse
chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  handleAsync(msg).then(sendResponse);
  // Missing return true
});

// ✅ CORRECT
chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  handleAsync(msg).then(sendResponse);
  return true;  // Keeps channel open
});
```

### 4. After Code Changes

**Every time you change code:**

```bash
npm run build          # TypeScript check + Vite build
```

Then:
1. Go to `chrome://extensions/`
2. Click refresh icon on Wingman AI extension
3. **Refresh the Google Meet tab** (F5)
4. Test your changes

**Common mistake:** Forgetting to refresh the Meet tab after reloading extension.

---

## Build Commands Reference

```bash
npm install            # Install dependencies
npm run dev            # Development build with watch mode
npm run build          # Production build (tsc + vite build)
npm run typecheck      # TypeScript check only (no build)
npm test               # Run Vitest unit tests
npm run test:watch     # Vitest in watch mode
npm run test:coverage  # Vitest with V8 coverage
npm run lint           # ESLint
npm run lint:fix       # ESLint with auto-fix
npm run format         # Prettier formatting
npm run clean          # Remove dist/
```

**Recommended workflow:**
- Run `npm run dev` in terminal (watch mode)
- Edit files
- Extension auto-rebuilds on save
- Reload extension in Chrome
- Refresh Meet tab
- Test

---

## Next Steps

1. **Build something small**: Add a console.log to see a transcript
2. **Read a flow diagram**: Pick one feature, trace through the code
3. **Copy a pattern**: Add a new storage key or message type
4. **Ask questions**: Use the documentation as reference, not gospel

**Resources:**
- [FILE-STRUCTURE-MAP.md](FILE-STRUCTURE-MAP.md) — Find files
- [CODE-PATTERNS.md](CODE-PATTERNS.md) — Copy patterns
- [flows/](flows/) — Understand features
- [CODE-DISCOVERY-PATTERN.md](CODE-DISCOVERY-PATTERN.md) — Explore safely

Good luck! 🚀
