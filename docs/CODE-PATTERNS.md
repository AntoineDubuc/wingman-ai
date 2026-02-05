# Code Patterns Library

Common patterns used throughout the Wingman AI codebase. Copy these examples when implementing similar functionality.

## Table of Contents

- [Singleton Services Pattern](#singleton-services-pattern)
- [Message Handling Pattern](#message-handling-pattern)
- [Options Section Pattern](#options-section-pattern)
- [Chrome Storage Pattern](#chrome-storage-pattern)
- [Callback Registration Pattern](#callback-registration-pattern)
- [Async Message Response Pattern](#async-message-response-pattern)
- [Error Handling Patterns](#error-handling-patterns)
- [WebSocket Auth Pattern (Deepgram)](#websocket-auth-pattern-deepgram)
- [Multi-Provider Request Building](#multi-provider-request-building)
- [Cost Tracking Singleton](#cost-tracking-singleton)
- [Chrome Alarms Pattern (MV3)](#chrome-alarms-pattern-mv3)
- [Model Tuning Injection](#model-tuning-injection)

---

## Singleton Services Pattern

Services are exported as singleton instances, not classes. This ensures single connection/state across the extension.

### Example: deepgram-client.ts

```typescript
// Define the class
export class DeepgramClient {
  private socket: WebSocket | null = null;
  private isConnected = false;
  // ... state and methods
}

// Export singleton instance (NOT the class)
export const deepgramClient = new DeepgramClient();

// Also export the type for external use
export type { TranscriptCallback, Transcript };
```

### Usage in service-worker.ts

```typescript
import { deepgramClient } from '../services/deepgram-client';

// Use the singleton directly
await deepgramClient.connect();
deepgramClient.setTranscriptCallback(handleTranscript);
```

### All Singletons

| Export | File | Purpose |
|--------|------|---------|
| `deepgramClient` | `services/deepgram-client.ts` | WebSocket STT client |
| `geminiClient` | `services/gemini-client.ts` | Gemini REST API client |
| `transcriptCollector` | `services/transcript-collector.ts` | Session data collector |
| `driveService` | `services/drive-service.ts` | Google Drive API |
| `kbDatabase` | `services/kb/kb-database.ts` | IndexedDB wrapper |
| `langBuilderClient` | `services/langbuilder-client.ts` | LangBuilder flow executor |
| `costTracker` | `services/cost-tracker.ts` | Session cost accumulator |

---

## Message Handling Pattern

### Critical Convention: Message Type Case

**Service worker receives**: UPPERCASE types
**Service worker sends to content script**: lowercase types

This is non-negotiable — content script expects lowercase.

### Service Worker Message Listener

**File**: `service-worker.ts`

```typescript
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Optional: silence frequent message logging
  const quietMessages = ['AUDIO_CHUNK', 'GET_STATUS', 'CAPTURE_STATUS'];
  if (!quietMessages.includes(message.type)) {
    console.log('[ServiceWorker] Received:', message.type);
  }

  switch (message.type) {
    case 'START_SESSION':  // UPPERCASE — from popup/content script
      handleStartSession().then(sendResponse);
      return true;  // Keep channel open for async response

    case 'STOP_SESSION':
      handleStopSession().then(sendResponse);
      return true;

    case 'GET_STATUS':
      sendResponse({ isSessionActive, isCapturing });
      return false;  // Synchronous response, close channel

    case 'AUDIO_CHUNK':
      deepgramClient.sendAudio(message.data);
      return false;  // No response needed

    default:
      console.warn('[ServiceWorker] Unknown message:', message.type);
      return false;
  }
});
```

### Sending to Content Script (Lowercase)

**File**: `service-worker.ts`

```typescript
// ⚠️ CRITICAL: Use lowercase types
chrome.tabs.sendMessage(activeTabId, {
  type: 'transcript',  // lowercase
  data: transcript,
});

chrome.tabs.sendMessage(activeTabId, {
  type: 'suggestion',  // lowercase
  data: suggestion,
});

chrome.tabs.sendMessage(activeTabId, {
  type: 'call_summary',  // lowercase
  data: summary,
});
```

### Content Script Message Listener

**File**: `content-script.ts`

```typescript
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'transcript':  // lowercase from service worker
      overlay?.addTranscript(message.data);
      break;

    case 'suggestion':  // lowercase
      overlay?.addSuggestion(message.data);
      break;

    case 'INIT_OVERLAY':  // UPPERCASE from service worker (command)
      initOverlay();
      sendResponse({ success: true });
      break;
  }
});
```

---

## Options Section Pattern

Options page is modular — each section is an independent class with `init()` method.

### Section Class Template

**File**: `options/sections/api-keys.ts`

```typescript
import type { OptionsContext } from './shared';

export class ApiKeysSection {
  private ctx!: OptionsContext;
  private deepgramInput: HTMLInputElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;

  async init(ctx: OptionsContext): Promise<void> {
    this.ctx = ctx;

    // Get DOM elements
    this.deepgramInput = document.getElementById('deepgram-api-key') as HTMLInputElement;
    this.saveBtn = document.getElementById('save-keys-btn') as HTMLButtonElement;

    // Bind event listeners
    this.saveBtn?.addEventListener('click', () => this.save());

    // Load initial state
    await this.load();
  }

  private async load(): Promise<void> {
    const result = await chrome.storage.local.get(['deepgramApiKey']);
    if (this.deepgramInput && result.deepgramApiKey) {
      this.deepgramInput.value = result.deepgramApiKey;
    }
  }

  private async save(): Promise<void> {
    const key = this.deepgramInput?.value?.trim() || '';

    try {
      await chrome.storage.local.set({ deepgramApiKey: key });
      this.ctx.showToast('API key saved', 'success');
    } catch (error) {
      console.error('Failed to save:', error);
      this.ctx.showToast('Failed to save', 'error');
    }
  }
}
```

### Main Options Controller

**File**: `options/options.ts`

```typescript
import { ApiKeysSection } from './sections/api-keys';
import { DriveSection } from './sections/drive';
import { ToastManager, ModalManager } from './sections/shared';

const toastManager = new ToastManager();
const modalManager = new ModalManager();

const ctx = {
  showToast: toastManager.show.bind(toastManager),
  showModal: modalManager.show.bind(modalManager),
  // ... other shared utilities
};

async function init() {
  const apiKeysSection = new ApiKeysSection();
  const driveSection = new DriveSection();

  // Initialize all sections in parallel
  await Promise.all([
    apiKeysSection.init(ctx),
    driveSection.init(ctx),
  ]);
}

init();
```

### OptionsContext Interface

**File**: `options/sections/shared.ts`

```typescript
export interface OptionsContext {
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  showModal: (title: string, content: string, actions: ModalAction[]) => Promise<string>;
  // Add other shared utilities here
}
```

---

## Chrome Storage Pattern

### Read from Storage

```typescript
// Single key
const result = await chrome.storage.local.get('deepgramApiKey');
const apiKey = result.deepgramApiKey;

// Multiple keys
const result = await chrome.storage.local.get(['deepgramApiKey', 'geminiApiKey']);
const deepgramKey = result.deepgramApiKey;
const geminiKey = result.geminiApiKey;

// With default values
const result = await chrome.storage.local.get({
  deepgramApiKey: '',
  geminiApiKey: '',
  summaryEnabled: true,  // Default if not set
});
```

### Write to Storage

```typescript
// Single key
await chrome.storage.local.set({ deepgramApiKey: 'abc123' });

// Multiple keys
await chrome.storage.local.set({
  deepgramApiKey: 'abc123',
  geminiApiKey: 'xyz789',
});

// Remove keys
await chrome.storage.local.remove(['deepgramApiKey']);
await chrome.storage.local.remove('geminiApiKey');
```

### Storage Helper Pattern (Typed)

**File**: `shared/persona.ts`

```typescript
const STORAGE_KEY_PERSONAS = 'personas';
const STORAGE_KEY_ACTIVE_ID = 'activePersonaId';

export async function getPersonas(): Promise<Persona[]> {
  const result = await chrome.storage.local.get([STORAGE_KEY_PERSONAS]);
  return (result[STORAGE_KEY_PERSONAS] as Persona[] | undefined) ?? [];
}

export async function savePersonas(personas: Persona[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_PERSONAS]: personas });
}

export async function getActivePersonaId(): Promise<string | null> {
  const result = await chrome.storage.local.get([STORAGE_KEY_ACTIVE_ID]);
  return (result[STORAGE_KEY_ACTIVE_ID] as string | undefined) ?? null;
}
```

---

## Callback Registration Pattern

Used for event-driven architectures (Deepgram transcripts, Gemini suggestions).

### Pattern: Service with Callback

**File**: `deepgram-client.ts`

```typescript
export type TranscriptCallback = (transcript: Transcript) => void;

export class DeepgramClient {
  private onTranscriptCallback: TranscriptCallback | null = null;

  setTranscriptCallback(callback: TranscriptCallback): void {
    this.onTranscriptCallback = callback;
  }

  private handleMessage(event: MessageEvent): void {
    // Parse Deepgram message
    const transcript = parseTranscript(event.data);

    // Invoke callback if registered
    this.onTranscriptCallback?.(transcript);
  }
}
```

### Usage in Service Worker

**File**: `service-worker.ts`

```typescript
deepgramClient.setTranscriptCallback((transcript: Transcript) => {
  handleTranscript(transcript);
});

async function handleTranscript(transcript: Transcript) {
  // Add to collector
  transcriptCollector.addTranscript(transcript);

  // Send to content script (lowercase)
  chrome.tabs.sendMessage(activeTabId, {
    type: 'transcript',
    data: transcript,
  });

  // Process with Gemini
  if (transcript.is_final) {
    const suggestion = await geminiClient.processTranscript(transcript.text);
    if (suggestion) {
      chrome.tabs.sendMessage(activeTabId, {
        type: 'suggestion',
        data: suggestion,
      });
    }
  }
}
```

---

## Async Message Response Pattern

Use `return true` to keep message channel open for async responses.

### Pattern: Async Handler

```typescript
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'START_SESSION':
      handleStartSession().then(sendResponse);
      return true;  // ⚠️ CRITICAL: keeps channel open

    case 'GET_STATUS':
      sendResponse({ isActive: true });
      return false;  // Synchronous, close channel
  }
});

async function handleStartSession(): Promise<{ success: boolean; error?: string }> {
  try {
    await deepgramClient.connect();
    await chrome.offscreen.createDocument({ /* ... */ });
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
```

### Sending Async Message

```typescript
const response = await chrome.runtime.sendMessage({ type: 'START_SESSION' });

if (response.success) {
  console.log('Session started');
} else {
  console.error('Failed:', response.error);
}
```

---

## Error Handling Patterns

### 1. Try-Catch with User Feedback

**File**: `options/sections/api-keys.ts`

```typescript
private async save(): Promise<void> {
  try {
    await chrome.storage.local.set({ deepgramApiKey: key });
    this.ctx.showToast('API key saved', 'success');
  } catch (error) {
    console.error('Failed to save:', error);
    this.ctx.showToast('Failed to save', 'error');
  }
}
```

### 2. Silent Failure with Log

**File**: `service-worker.ts`

```typescript
// Non-critical cleanup
try {
  await chrome.offscreen.closeDocument();
} catch {
  // Ignore — may already be closed
}

// Audio forwarding
if (isSessionActive) {
  deepgramClient.sendAudio(message.data);
} else {
  console.warn('[ServiceWorker] Session not active, discarding audio');
}
```

### 3. Validation Before Action

**File**: `service-worker.ts`

```typescript
async function handleStartSession() {
  const storage = await chrome.storage.local.get(['deepgramApiKey', 'geminiApiKey']);

  if (!storage.deepgramApiKey) {
    return { success: false, error: 'Deepgram API key not configured' };
  }

  if (!storage.geminiApiKey) {
    return { success: false, error: 'Gemini API key not configured' };
  }

  // Proceed with session start
  // ...
}
```

### 4. Catch-Send-Ignore Pattern

For messages to potentially closed tabs:

```typescript
chrome.tabs.sendMessage(activeTabId, {
  type: 'transcript',
  data: transcript,
}).catch(() => {
  // Ignore — tab may be closed, overlay detached, etc.
});
```

### 5. Retry on 401 (OAuth)

**File**: `drive-service.ts`

```typescript
async saveTranscript(...) {
  try {
    // Attempt save
  } catch (error) {
    if (String(error).includes('401')) {
      // Token expired, refresh and retry
      const oldToken = await this.getAuthToken(false);
      if (oldToken) {
        await chrome.identity.removeCachedAuthToken({ token: oldToken });
      }
      return this.saveTranscript(...);  // Retry once
    }
    throw error;
  }
}
```

---

## WebSocket Auth Pattern (Deepgram)

Browser WebSocket API cannot set custom headers. Deepgram requires auth via `Sec-WebSocket-Protocol`.

### Pattern: Auth via Subprotocol

**File**: `deepgram-client.ts:140`

```typescript
// ✅ CORRECT: Use Sec-WebSocket-Protocol
this.socket = new WebSocket(url, ['token', this.apiKey!]);
```

### ❌ WRONG Patterns

```typescript
// ❌ Query parameter (returns 401)
const url = `wss://api.deepgram.com/v1/listen?token=${apiKey}`;
this.socket = new WebSocket(url);

// ❌ Custom header (not supported by browser WebSocket API)
this.socket = new WebSocket(url);
this.socket.setRequestHeader('Authorization', `Token ${apiKey}`);  // No such method
```

### Full Connection Example

```typescript
const DEEPGRAM_WS_BASE = 'wss://api.deepgram.com/v1/listen';
const params = new URLSearchParams({
  model: 'nova-3',
  language: 'en',
  encoding: 'linear16',
  sample_rate: '16000',
});

const url = `${DEEPGRAM_WS_BASE}?${params.toString()}`;

// Pass 'token' and API key as subprotocols
this.socket = new WebSocket(url, ['token', apiKey]);

this.socket.onopen = () => {
  console.log('Connected to Deepgram');
};

this.socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Process transcript
};

this.socket.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

---

## Quick Reference

| Pattern | When to Use |
|---------|-------------|
| **Singleton Services** | API clients, database wrappers, collectors |
| **Uppercase Messages** | Service worker receiving from popup/content |
| **Lowercase Messages** | Service worker sending to content script |
| **Options Section Class** | Adding new settings UI panel |
| **Storage Helpers** | Typed access to chrome.storage.local |
| **Callback Registration** | Event-driven service (WebSocket, streaming API) |
| **`return true`** | Async message handler needs to call sendResponse later |
| **Try-Catch with Toast** | User-facing operations in options page |
| **Silent Failure** | Non-critical cleanup, audio forwarding |
| **Catch-Send-Ignore** | Sending to tabs that may be closed |
| **Sec-WebSocket-Protocol** | WebSocket auth when custom headers blocked |
| **Multi-Provider Requests** | Adding/modifying LLM providers (Gemini/OpenRouter/Groq) |
| **Cost Tracking** | Session-scoped usage tracking with singleton lifecycle |
| **Chrome Alarms** | Periodic tasks in MV3 service workers (replaces `setInterval`) |
| **Model Tuning** | Per-model-family temperature and prompt adjustments |

---

## Anti-Patterns to Avoid

### ❌ Don't: Export Class and Instantiate Multiple Times

```typescript
// bad.ts
export class BadClient {
  private state = {};
}

// usage
import { BadClient } from './bad';
const client1 = new BadClient();  // Multiple instances = split state
const client2 = new BadClient();
```

### ❌ Don't: Use UPPERCASE Types to Content Script

```typescript
// ❌ Content script expects lowercase
chrome.tabs.sendMessage(tabId, {
  type: 'TRANSCRIPT',  // WRONG — content script won't handle this
  data: transcript,
});
```

### ❌ Don't: Forget `return true` for Async

```typescript
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'START_SESSION':
      handleStartSession().then(sendResponse);
      // ❌ Missing return true — channel closes before sendResponse
  }
});
```

### ❌ Don't: Use Query Params for Deepgram Auth

```typescript
// ❌ Returns 401
const url = `wss://api.deepgram.com/v1/listen?token=${apiKey}`;
this.socket = new WebSocket(url);
```

### ✅ Do: Use Sec-WebSocket-Protocol

```typescript
// ✅ Works
const url = 'wss://api.deepgram.com/v1/listen?model=nova-3&...';
this.socket = new WebSocket(url, ['token', apiKey]);
```

---

## Multi-Provider Request Building

The Gemini client now supports three LLM providers via a unified `buildRequest()` method that dispatches to Gemini or OpenAI-compatible format.

**File**: `gemini-client.ts`

```typescript
private buildRequest(systemPrompt: string, userContent: string) {
  if (this.provider === 'gemini') {
    // Gemini-native format
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      body: {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userContent }] }],
        generationConfig: { temperature: this.temperature },
      },
    };
  }
  // OpenAI-compatible format (OpenRouter + Groq)
  const baseUrl = this.provider === 'groq'
    ? 'https://api.groq.com/openai/v1'
    : 'https://openrouter.ai/api/v1';
  return {
    url: `${baseUrl}/chat/completions`,
    body: {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: this.temperature,
    },
    headers: { Authorization: `Bearer ${this.apiKey}` },
  };
}
```

**When to use:** Any time a new provider needs to be added. If the provider is OpenAI-compatible, it slots into the else branch. Only Gemini uses a bespoke format.

---

## Cost Tracking Singleton

**File**: `cost-tracker.ts`

`costTracker` follows the same singleton pattern as other services. It has a session lifecycle: `startSession()` → track usage → `endSession()`.

```typescript
import { costTracker } from '../services/cost-tracker';

// Session start
costTracker.startSession();

// During session — record LLM token usage
costTracker.addLLMUsage(inputTokens, outputTokens);

// Get current cost snapshot (for periodic UI updates)
const snapshot = costTracker.getCostSnapshot();

// Session end — get final cost and reset
const finalCost = costTracker.getFinalCost();
costTracker.reset();
```

The service worker sends `cost_update` messages to the content script on a periodic alarm so the overlay can display a live cost ticker.

---

## Chrome Alarms Pattern (MV3)

In Manifest V3, service workers can be suspended at any time, which kills `setInterval` timers. Use `chrome.alarms` for periodic tasks instead.

**File**: `service-worker.ts`

```typescript
// ✅ CORRECT: Survives service worker suspension
chrome.alarms.create('cost-update', { periodInMinutes: 0.25 });  // Every 15s

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cost-update' && isSessionActive) {
    sendCostUpdate();
  }
});

// Cleanup on session end
chrome.alarms.clear('cost-update');
```

```typescript
// ❌ WRONG: Dies when service worker suspends
setInterval(() => {
  sendCostUpdate();
}, 15000);
```

**Requires:** `"alarms"` permission in `manifest.json`.

---

## Model Tuning Injection

`getTuningProfile()` returns a `ModelTuningProfile` with temperature and prompt tweaks for a given model family. Applied automatically when generating suggestions and summaries.

**File**: `model-tuning.ts`

```typescript
import { getTuningProfile, NEUTRAL_PROFILE } from '../shared/model-tuning';

// Get tuning profile for the active model
const profile = getTuningProfile(modelId);
// profile.temperature — recommended temperature override
// profile.systemPromptSuffix — extra instructions appended to system prompt

// Falls back to NEUTRAL_PROFILE if model family is unknown
```

**When to use:** When adding a new model or model family. Define a tuning profile so the extension adjusts temperature and prompt style for optimal output.
