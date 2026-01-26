# Assumptions Research Summary

This document summarizes the research conducted to validate assumptions in the implementation plans.

---

## Research Date: January 26, 2026

---

## 1. Chrome Extension APIs (Manifest V3)

### TabCapture API with Offscreen Documents

**Assumption in plans:** TabCapture works with offscreen documents using `USER_MEDIA` reason

**Research Finding:** CORRECT with caveats

- Since Chrome 116, `chrome.tabCapture.getMediaStreamId()` can be called from a service worker
- The stream ID can then be passed to an offscreen document
- **Valid offscreen reason:** `USER_MEDIA` (NOT `TAB_CAPTURE` - that's not a valid reason)
- The offscreen document uses `navigator.mediaDevices.getUserMedia()` with `chromeMediaSource: "tab"`

**Sources:**
- [Chrome TabCapture API Docs](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)
- [Chrome Offscreen API Docs](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Audio Recording and Screen Capture Guide](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture)

### ScriptProcessorNode vs AudioWorklet

**Assumption in plans:** ScriptProcessorNode is deprecated, AudioWorklet recommended

**Research Finding:** CORRECT

- ScriptProcessorNode is officially deprecated
- AudioWorklet is the replacement, available since Chrome 64
- AudioWorklet runs on a separate audio thread, avoiding main thread jank
- Must return `true` from `process()` in Chrome for compatibility

**Sources:**
- [MDN ScriptProcessorNode](https://developer.mozilla.org/en-US/docs/Web/API/ScriptProcessorNode)
- [Chrome AudioWorklet Blog](https://developer.chrome.com/blog/audio-worklet)

---

## 2. Deepgram API

### Model Names

**Assumption in plans:** Nova-3 with 8% WER

**Research Finding:** PARTIALLY CORRECT - needs update

- **Nova-3** reached GA in February 2025, multilingual GA in April 2025
- WER improvement: 54.2% reduction for streaming, 47.4% for batch vs competitors
- Supports 31 languages with true code-switching across 10 languages
- **NEW: Flux model** - specifically designed for voice agents with turn-taking detection

**Correct model options:**
- `nova-3` - General best accuracy
- `nova-2-meeting` - Optimized for conference rooms
- `nova-2-phonecall` - Optimized for phone calls
- `flux-general-en` - For voice agent applications

### Python SDK

**Assumption in plans:** `deepgram-sdk>=3.0.0`

**Research Finding:** OUTDATED

- **Current stable version:** 5.3.1 (January 2026)
- **Pre-release:** 6.0.0b2
- **Breaking change in v5.3.x:** `send_media()` requires bytes, not str
- **New API:** Use `client.listen.v2.connect()` for streaming

**Correct dependency:** `deepgram-sdk>=5.3.0`

**Sources:**
- [Deepgram Python SDK GitHub](https://github.com/deepgram/deepgram-python-sdk)
- [Deepgram Model Docs](https://developers.deepgram.com/docs/model)
- [Deepgram Changelog](https://developers.deepgram.com/changelog)

### Pricing

**Assumption in plans:** ~$0.0077/min

**Research Finding:** CORRECT

- Pay-As-You-Go: $0.0077/min
- Growth Plan: $0.0065/min

---

## 3. Google Gemini API

### SDK Package Name

**Assumption in plans:** `google-generativeai`

**Research Finding:** OUTDATED - CRITICAL UPDATE NEEDED

- **OLD package `google-generativeai` reached END OF LIFE on November 30, 2025**
- **NEW package:** `google-genai`
- The new SDK provides unified interface to Gemini models through both Gemini Developer API and Vertex AI

**Correct dependency:** `google-genai` (NOT `google-generativeai`)

### Model Names

**Assumption in plans:** `gemini-1.5-flash`

**Research Finding:** OUTDATED

- **Current models (2026):**
  - `gemini-2.5-flash` - Current flash model
  - `gemini-2.5-pro` - Pro tier
  - `gemini-2.5-flash-image` - Image generation
- **Deprecated:** `gemini-2.0-flash-lite` (shutdown March 31, 2026)

**Correct model:** `gemini-2.5-flash` (or `gemini-2.5-pro` for higher quality)

### New API Usage

```python
from google import genai

client = genai.Client(api_key='GEMINI_API_KEY')
# For Vertex AI:
# client = genai.Client(vertexai=True, project='project-id', location='us-central1')
```

**Sources:**
- [Google GenAI Python SDK GitHub](https://github.com/googleapis/python-genai)
- [google-genai PyPI](https://pypi.org/project/google-genai/)
- [Gemini API Models Docs](https://ai.google.dev/gemini-api/docs/models)

---

## 4. Embedding Models

### Google Embedding Model

**Assumption in plans:** `text-embedding-004` or `embedding-001`

**Research Finding:** OUTDATED

- **Current model:** `gemini-embedding-001` (GA in Gemini API and Vertex AI)
- Uses 3072-dimensional vectors
- First embedding model trained on Gemini family
- **Alternative:** `embeddinggemma-300m` - Open model for on-device use (308M params, multilingual)

**Correct model:** `gemini-embedding-001`

**Sources:**
- [Gemini Embedding Announcement](https://developers.googleblog.com/gemini-embedding-available-gemini-api/)
- [Vertex AI Text Embeddings](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/text-embeddings-api)

---

## 5. Vector Databases

### Pinecone

**Assumption in plans:** `pinecone-client`

**Research Finding:** OUTDATED - PACKAGE RENAMED

- **OLD package `pinecone-client` is DEPRECATED**
- **NEW package:** `pinecone` (renamed in v5.1.0)
- **Current version:** 8.0.0 (November 2025)
- **Requires:** Python 3.10+ (dropped 3.9 support)

**Correct dependency:** `pinecone>=8.0.0`

**Important:** Must uninstall `pinecone-client` before installing `pinecone`

**Sources:**
- [Pinecone PyPI](https://pypi.org/project/pinecone/)
- [Pinecone Python SDK Docs](https://docs.pinecone.io/reference/python-sdk)

### ChromaDB

**Assumption in plans:** Basic chromadb usage

**Research Finding:** MOSTLY CORRECT - minor updates

- **Current version:** 1.4.1 (January 2026)
- **Requires:** Python 3.8+, SQLite 3.35+
- Two packages available:
  - `chromadb` - Full package with server
  - `chromadb-client` - HTTP client only

**API patterns remain similar:**
```python
# In-memory
client = chromadb.Client()

# Persistent
client = chromadb.PersistentClient(path="/path/to/data")

# Client/server
client = chromadb.HttpClient(host='localhost', port=8000)
```

**Sources:**
- [ChromaDB PyPI](https://pypi.org/project/chromadb/)
- [Chroma Cookbook](https://cookbook.chromadb.dev/core/install/)

---

## Summary of Required Changes

### Critical Updates (Breaking Changes)

| Component | Old Value | New Value |
|-----------|-----------|-----------|
| Google AI SDK | `google-generativeai` | `google-genai` |
| Gemini Model | `gemini-1.5-flash` | `gemini-2.5-flash` |
| Pinecone Package | `pinecone-client` | `pinecone` |
| Deepgram SDK | `>=3.0.0` | `>=5.3.0` |
| Embedding Model | `text-embedding-004` | `gemini-embedding-001` |

### Minor Updates

| Component | Old Value | New Value |
|-----------|-----------|-----------|
| ChromaDB | (any) | `>=1.4.0` |
| Python (Pinecone) | 3.9+ | 3.10+ |
| Deepgram streaming | `listen.v1` | `listen.v2` |

### Confirmed Correct

- TabCapture API with offscreen documents (USER_MEDIA reason)
- 16kHz audio sample rate for Deepgram
- ScriptProcessorNode deprecated / AudioWorklet recommended
- Deepgram pricing (~$0.0077/min)
- Nova-3 model name and capabilities

---

*Research conducted: January 26, 2026*
