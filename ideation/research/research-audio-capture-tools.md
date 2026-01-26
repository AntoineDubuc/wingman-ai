# Browser Audio Capture and Transcription Tools Research

**Research Date:** January 26, 2026
**Purpose:** Evaluate open-source browser audio capture and transcription building blocks for potential custom LLM integration

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Open Source Projects Analyzed](#open-source-projects-analyzed)
3. [Technical Foundation](#technical-foundation)
4. [Comparison Matrix](#comparison-matrix)
5. [Building Your Own](#building-your-own)
6. [Recommendations](#recommendations)

---

## Executive Summary

This research examines open-source tools for capturing browser/tab audio and transcribing it in real-time. The landscape divides into two main approaches:

1. **Local/Privacy-First**: Using transformers.js or whisper.cpp to run Whisper models entirely in the browser
2. **Cloud-Powered**: Using APIs like Deepgram, Speechmatics, or Soniox for higher accuracy and lower latency

**Key Finding:** For custom LLM integration (post-processing transcripts), the most extensible options are:
- **ainoya/chrome-extension-web-transcriptor-ai** for fully local processing
- **Deepgram-based extensions** for cloud transcription with easy LLM chaining
- **WhisperLive** for self-hosted server with browser client

---

## Open Source Projects Analyzed

### 1. ainoya/chrome-extension-web-transcriptor-ai

**Repository:** https://github.com/ainoya/chrome-extension-web-transcriptor-ai

| Metric | Value |
|--------|-------|
| GitHub Stars | 36 |
| Forks | 4 |
| Last Commit | January 28, 2025 (v0.0.19) |
| License | MIT |
| Primary Language | TypeScript (85.7%) |

**Tech Stack:**
- transformers.js (Hugging Face) for local Whisper inference
- Chrome TabCapture API for audio stream capture
- Vite build system
- Tailwind CSS
- React (implied)

**Features:**
- 100% local transcription - no audio leaves the browser
- Multi-language support (100+ languages via Whisper)
- Side panel UI (right-click to open)
- Privacy-focused design

**Installation:**
1. Download `dist.zip` from releases
2. Navigate to `chrome://extensions/`
3. Enable Developer mode
4. Load unpacked extension

**Privacy Model:**
- All processing occurs in-browser
- Only the Whisper model is downloaded (one-time)
- No audio transmitted to external servers

**Performance:**
- Model loading time on first use
- Depends on device CPU/GPU capabilities
- Uses Whisper Tiny or Small models for browser efficiency

**Extensibility for LLM Integration:**
- **High** - Can modify to send transcripts to local LLM (Ollama) or cloud LLM
- Direct access to transcript text in JavaScript
- Could add summarization, action item extraction, etc.

**Limitations:**
- Browser CPU constraints affect accuracy
- Smaller Whisper models trade accuracy for speed
- Chrome/Chromium only

---

### 2. collabora/WhisperLive

**Repository:** https://github.com/collabora/WhisperLive

| Metric | Value |
|--------|-------|
| GitHub Stars | 3,800+ |
| Forks | 515 |
| Last Release | v0.7.1 (May 15, 2025) |
| License | MIT |
| Primary Language | Python (71.5%) |

**Tech Stack:**
- Python backend with PyAudio
- Multiple backends: Faster-Whisper, TensorRT, OpenVINO
- Browser extensions (Chrome/Firefox)
- Native iOS client
- Docker deployment

**Features:**
- Real-time "nearly-live" transcription
- Voice Activity Detection (VAD)
- Audio-to-text translation
- Multiple input sources (mic, files, RTSP, HLS)
- Supports 4 concurrent clients

**Installation:**
```bash
pip install whisper-live
# Server runs on port 9090 by default
```

**Privacy Model:**
- Self-hosted server (you control the infrastructure)
- Audio streams to your server only
- No third-party cloud dependency

**Performance:**
- GPU acceleration available (CUDA, TensorRT, OpenVINO)
- Configurable connection time limits
- Low latency with proper hardware

**Extensibility for LLM Integration:**
- **Very High** - Server-side Python allows easy LLM pipeline integration
- Could add post-processing with any Python LLM library
- WebSocket architecture supports custom clients

**Limitations:**
- Requires server infrastructure
- Not browser-only (hybrid architecture)
- Setup complexity higher than pure extensions

---

### 3. recallai/chrome-recording-transcription-extension

**Repository:** https://github.com/recallai/chrome-recording-transcription-extension

| Metric | Value |
|--------|-------|
| GitHub Stars | 7 |
| Forks | 2 |
| Last Commit | 5 commits on main |
| License | Not specified |
| Primary Language | TypeScript (94.3%) |

**Tech Stack:**
- TypeScript with Webpack 5
- Chrome Manifest V3
- Offscreen document architecture
- MediaRecorder API
- Web Audio API for mixing

**Features:**
- Tab recording to .webm files
- Caption scraping from Google Meet DOM
- Optional microphone mixing
- Local processing only
- Timestamped transcript export

**Architecture:**
- `background.ts` - Service worker coordination
- `offscreen.ts` - Recording and audio mixing
- `popup.ts` - UI handlers
- `scrapingScript.ts` - DOM caption parsing

**Installation:**
1. Clone repository
2. `npm install && npm run build`
3. Load unpacked in Chrome

**Privacy Model:**
- All processing client-side
- Recordings saved locally
- Scope limited to `meet.google.com`

**Extensibility for LLM Integration:**
- **Medium** - Good architecture but focused on Google Meet
- Would need modification for general tab capture
- Could add post-recording LLM summarization

**Limitations:**
- Google Meet specific
- Uses DOM caption scraping (not audio transcription)
- Small community/support

---

### 4. LaurinBrechter/tab-transcribe

**Repository:** https://github.com/LaurinBrechter/tab-transcribe

| Metric | Value |
|--------|-------|
| GitHub Stars | 2 |
| Forks | 1 |
| License | MIT |
| Primary Language | TypeScript (75%) |

**Tech Stack:**
- TypeScript with Vite
- whisper-web (Whisper Tiny model)
- Chrome TabCapture API

**Features:**
- Local Whisper transcription
- 20-second processing intervals
- No external data transmission

**Installation:**
```bash
npm install
npm run build
# Load unpacked extension
```

**Privacy Model:**
- 100% local processing
- No servers contacted

**Performance:**
- Uses Whisper Tiny (smallest model)
- 20-second batch processing (not real-time)
- High CPU usage on lower-end devices

**Extensibility for LLM Integration:**
- **Medium** - Simple codebase, easy to modify
- Could buffer transcripts and send to LLM

**Limitations:**
- Accuracy limited by tiny model
- Not true real-time (20s batches)
- Minimal features

---

### 5. milad-zai/chrome-ai-audio-transcription

**Repository:** https://github.com/milad-zai/chrome-ai-audio-transcription

| Metric | Value |
|--------|-------|
| GitHub Stars | 0 |
| Forks | 1 |
| Last Commit | November 14, 2024 |
| License | MIT |
| Primary Language | JavaScript (45.4%), TypeScript (43.9%) |

**Tech Stack:**
- React Chrome extension (client)
- Node.js server (backend)
- Deepgram API (transcription)
- WebSocket communication

**Features:**
- Real-time transcription via Deepgram
- Cross-tab audio support
- React-based UI
- Bidirectional WebSocket

**Architecture:**
1. Extension captures audio
2. WebSocket streams to Node.js server
3. Server forwards to Deepgram API
4. Transcription returned to extension

**Installation:**
1. Get Deepgram API key
2. Configure `.env` file
3. `npm install` (both client and server)
4. Build and load extension

**Privacy Model:**
- Audio goes to your server, then to Deepgram
- Deepgram processes audio (cloud)
- API key protected on server

**Extensibility for LLM Integration:**
- **High** - Node.js server is ideal for LLM chaining
- Could add OpenAI/Anthropic calls post-transcription
- Easy to add summarization endpoint

**Limitations:**
- Requires Deepgram subscription
- Server infrastructure needed
- Audio leaves local machine

---

### 6. assaf-malki/chrome-extension-audio-transcription

**Repository:** https://github.com/assaf-malki/chrome-extension-audio-transcription

| Metric | Value |
|--------|-------|
| GitHub Stars | 1 |
| Forks | 2 |
| Last Commit | March 20, 2024 |
| License | Not specified |
| Primary Language | JavaScript (88.5%) |

**Tech Stack:**
- Vanilla JavaScript
- Multiple ASR service integrations

**Features:**
- Multi-service support: Speechmatics, Deepgram, Soniox
- Simple start/stop controls
- Browser-contained operation

**Privacy Model:**
- Audio sent to selected ASR provider

**Extensibility for LLM Integration:**
- **Medium** - Service selection is useful for comparing
- Would need custom backend for LLM integration

**Limitations:**
- Requires API keys for all services
- Limited documentation
- Not actively maintained

---

### 7. pluja/whishper

**Repository:** https://github.com/pluja/whishper

| Metric | Value |
|--------|-------|
| GitHub Stars | 2,900+ |
| Forks | 165 |
| Last Release | v3.1.4 (September 2024) |
| License | AGPL-3.0 |
| Primary Languages | Svelte (45%), Go (27.7%), Python (9.8%) |

**Tech Stack:**
- Svelte frontend
- Go backend (coordination)
- Python (FasterWhisper)
- LibreTranslate (translation)
- MongoDB database
- Docker deployment

**Features:**
- Full web UI for transcription
- Subtitle editing with CPS warnings
- Translation to 100+ languages
- Multiple export formats (TXT, JSON, VTT, SRT)
- URL transcription (via yt-dlp)
- GPU and CPU support

**v4 Development (in progress):**
- Speaker diarization
- WhisperX alignment
- User authentication
- MariaDB backend

**Installation:**
```bash
# Quick start scripts provided
./install.sh  # Linux/Mac
install.bat   # Windows
# Or use Docker Compose
```

**Privacy Model:**
- 100% self-hosted
- Works offline after setup
- No cloud transmission

**Extensibility for LLM Integration:**
- **Very High** - Go backend easy to extend
- Could add LLM summarization as a feature
- API-first architecture

**Limitations:**
- Requires Docker infrastructure
- Not a browser extension (web app)
- File-based (not real-time streaming)

---

### 8. ggml-org/whisper.cpp

**Repository:** https://github.com/ggml-org/whisper.cpp

| Metric | Value |
|--------|-------|
| GitHub Stars | 46,200+ |
| Forks | 5,200+ |
| License | MIT |
| Primary Language | C/C++ |

**Tech Stack:**
- Pure C/C++ implementation
- WebAssembly port available
- ONNX Runtime support

**Platform Support:**
- macOS (Intel & ARM)
- iOS, Android
- Linux, FreeBSD, Windows
- **WebAssembly (browser)**
- Raspberry Pi, Docker

**WebAssembly Features:**
- Runs in browser via WASM
- SIMD acceleration required
- Models: tiny to large (31MB to 1GB quantized)

**Browser Performance:**
- 2-3x real-time for tiny/base models
- 60s audio in ~20-30 seconds
- Firefox limited to <256MB files (use Chrome)

**Available WASM Models:**
| Model | Size | Quantized |
|-------|------|-----------|
| tiny.en | 75 MB | 31 MB (Q5_1) |
| base.en | 142 MB | 57 MB (Q5_1) |
| small.en | 466 MB | 182 MB (Q5_1) |
| medium.en | - | 515 MB (Q5_0) |
| large | - | 1030 MB (Q5_0) |

**Extensibility for LLM Integration:**
- **Medium** - C++ makes integration harder
- Would need JavaScript wrapper for LLM calls
- Better suited as transcription backend

---

## Technical Foundation

### Chrome TabCapture API

**Documentation:** https://developer.chrome.com/docs/extensions/reference/api/tabCapture

**How It Works:**
1. User clicks extension icon (user gesture required)
2. Extension calls `chrome.tabCapture.getMediaStreamId()`
3. Receives opaque stream identifier
4. Passes to `getUserMedia()` for actual MediaStream
5. Stream contains audio/video from active tab

**Key Requirements:**
- `tabCapture` permission in manifest.json
- `activeTab` permission recommended
- User gesture to initiate capture

**Audio Handling:**
```javascript
// Capture stops playback by default; to continue:
const output = new AudioContext();
const source = output.createMediaStreamSource(stream);
source.connect(output.destination);
```

**Browser Compatibility:**
- Chrome, Edge, Brave (Chromium-based only)
- Firefox: Screenshots only, no live capture
- Safari: No TabCapture API

---

### Web Speech API

**Overview:**
Built-in browser API for speech recognition without external dependencies.

**Capabilities:**
```javascript
const recognition = new webkitSpeechRecognition();
recognition.continuous = true;
recognition.interimResults = true;
recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
};
recognition.start();
```

**Limitations:**
- Chrome-only for full support
- ~60 second timeout on desktop
- No diarization (speaker identification)
- Variable accuracy by device/browser
- Requires internet (sends to Google servers)
- No custom model support

**Best For:**
- Quick prototypes
- Simple single-speaker use cases
- When accuracy isn't critical

---

### Deepgram Browser SDK

**Documentation:** https://developers.deepgram.com/docs/live-streaming-audio

**WebSocket Connection:**
```javascript
const socket = new WebSocket(
  'wss://api.deepgram.com/v1/listen?model=nova-3',
  ['token', DEEPGRAM_API_KEY]
);
```

**Key Features:**
- Nova-3 model: 54.3% lower WER than competitors
- Real-time streaming
- Speaker diarization
- Punctuation and formatting
- 100+ languages

**Audio Pipeline:**
```javascript
// Get microphone access
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

// Create MediaRecorder
const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

// Send chunks every 250ms
recorder.ondataavailable = (e) => socket.send(e.data);
recorder.start(250);
```

**Security Concern:**
- API key visible in browser (not recommended)
- Better: proxy through your server

**Response Format:**
```json
{
  "channel": {
    "alternatives": [{
      "transcript": "Hello world",
      "confidence": 0.98,
      "words": [...]
    }]
  },
  "speech_final": true
}
```

---

### transformers.js / Whisper in Browser

**Repository:** https://github.com/huggingface/transformers.js

| Metric | Value |
|--------|-------|
| GitHub Stars | 15,300+ |
| Forks | 1,100+ |
| License | Apache-2.0 |

**Installation:**
```bash
npm i @huggingface/transformers
```

**Basic Usage:**
```javascript
import { pipeline } from '@huggingface/transformers';

const transcriber = await pipeline(
  'automatic-speech-recognition',
  'Xenova/whisper-tiny.en'
);

const result = await transcriber(audioBlob);
console.log(result.text);
```

**Performance Options:**
- **WASM (default):** CPU inference via WebAssembly
- **WebGPU:** GPU acceleration (Chrome 113+, Edge)

**Quantization:**
- `q4` (4-bit) - Smallest, fastest
- `q8` (8-bit) - Balance
- Full precision - Most accurate

**Long Audio Handling:**
```javascript
const result = await transcriber(audioBlob, {
  chunk_length_s: 30,
  stride_length_s: 5
});
```

**Browser Compatibility:**
- Chrome, Edge, Firefox, Safari (varying WebGPU support)
- WebGPU: Chrome/Edge 113+, Firefox Nightly

---

### Manifest V3 & Offscreen Documents

**Why Needed:**
Manifest V3 uses service workers instead of background pages. Service workers:
- Can't access DOM
- May be suspended by Chrome
- Can't handle continuous media

**Solution - Offscreen Documents:**
```javascript
// manifest.json
{
  "permissions": ["offscreen"],
  "background": {
    "service_worker": "background.js"
  }
}

// background.js
await chrome.offscreen.createDocument({
  url: 'offscreen.html',
  reasons: ['AUDIO_PLAYBACK'],
  justification: 'Recording tab audio'
});
```

**Use Cases:**
- Audio/video recording
- MediaRecorder operations
- Clipboard access
- DOM manipulation for capture

**Limitations:**
- One offscreen document per extension
- Only `chrome.runtime` messaging APIs exposed
- Not designed as background page replacement

---

## Comparison Matrix

| Project | Stars | Local/Cloud | Real-Time | LLM Integration | Complexity | Privacy |
|---------|-------|-------------|-----------|-----------------|------------|---------|
| ainoya/web-transcriptor-ai | 36 | Local | Yes | High | Low | Excellent |
| collabora/WhisperLive | 3.8k | Self-hosted | Yes | Very High | Medium | Excellent |
| recall/transcription-ext | 7 | Local | Yes | Medium | Medium | Excellent |
| tab-transcribe | 2 | Local | Batch | Medium | Low | Excellent |
| milad-zai/chrome-ai | 0 | Cloud (Deepgram) | Yes | High | Medium | Good |
| assaf-malki/audio-trans | 1 | Cloud (Multi) | Yes | Medium | Low | Varies |
| pluja/whishper | 2.9k | Self-hosted | Batch | Very High | High | Excellent |
| whisper.cpp WASM | 46k | Local | Near-RT | Medium | Medium | Excellent |
| transformers.js | 15k | Local | Yes | High | Low | Excellent |
| Deepgram SDK | - | Cloud | Yes | High | Low | Good |

---

## Building Your Own

### Key Components Needed

#### 1. Audio Capture Layer

**Option A: TabCapture API (Recommended)**
```javascript
// manifest.json
{
  "manifest_version": 3,
  "permissions": ["tabCapture", "activeTab", "offscreen"],
  "action": {
    "default_popup": "popup.html"
  },
  "background": {
    "service_worker": "background.js"
  }
}

// background.js
async function startCapture(tabId) {
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tabId
  });
  // Pass to offscreen document
  chrome.runtime.sendMessage({ type: 'START_CAPTURE', streamId });
}
```

**Option B: getDisplayMedia (Simpler, requires user selection)**
```javascript
const stream = await navigator.mediaDevices.getDisplayMedia({
  audio: true,
  video: false
});
```

#### 2. Audio Processing Layer

**Web Audio API Setup:**
```javascript
const audioContext = new AudioContext({ sampleRate: 16000 });
const source = audioContext.createMediaStreamSource(stream);

// Continue playing audio to user
source.connect(audioContext.destination);

// Process for transcription
const processor = audioContext.createScriptProcessor(4096, 1, 1);
processor.onaudioprocess = (e) => {
  const audioData = e.inputBuffer.getChannelData(0);
  // Send to transcription service
};
source.connect(processor);
processor.connect(audioContext.destination);
```

**AudioWorklet (Modern, preferred):**
```javascript
// audio-processor.js
class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0][0];
    this.port.postMessage(input);
    return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);

// main.js
await audioContext.audioWorklet.addModule('audio-processor.js');
const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
workletNode.port.onmessage = (e) => {
  // e.data contains audio samples
};
```

#### 3. Transcription Layer

**Option A: Local with transformers.js**
```javascript
import { pipeline } from '@huggingface/transformers';

let transcriber;

async function initTranscriber() {
  transcriber = await pipeline(
    'automatic-speech-recognition',
    'Xenova/whisper-small',
    { device: 'webgpu' }  // Use GPU if available
  );
}

async function transcribe(audioBlob) {
  const result = await transcriber(audioBlob, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true
  });
  return result;
}
```

**Option B: Cloud with Deepgram (via server proxy)**
```javascript
// Server (Node.js)
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (clientWs) => {
  const deepgramWs = new WebSocket(
    'wss://api.deepgram.com/v1/listen?model=nova-3',
    { headers: { Authorization: `Token ${process.env.DEEPGRAM_KEY}` }}
  );

  clientWs.on('message', (audio) => deepgramWs.send(audio));
  deepgramWs.on('message', (transcript) => clientWs.send(transcript));
});
```

#### 4. LLM Integration Layer

**Option A: Local LLM via Ollama**
```javascript
async function summarizeTranscript(transcript) {
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    body: JSON.stringify({
      model: 'llama3.2',
      prompt: `Summarize this meeting transcript:\n\n${transcript}`,
      stream: false
    })
  });
  return (await response.json()).response;
}
```

**Option B: Cloud LLM via Anthropic**
```javascript
async function processWithClaude(transcript) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Extract action items from this transcript:\n\n${transcript}`
      }]
    })
  });
  return (await response.json()).content[0].text;
}
```

#### 5. Complete Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Chrome Extension                         │
│  ┌─────────┐   ┌────────────┐   ┌─────────────────────────┐│
│  │ Popup   │◄──│ Background │──►│ Offscreen Document      ││
│  │ (UI)    │   │ Service    │   │ - TabCapture stream     ││
│  └─────────┘   │ Worker     │   │ - AudioContext          ││
│                └────────────┘   │ - MediaRecorder         ││
│                                 └───────────┬─────────────┘│
└─────────────────────────────────────────────┼──────────────┘
                                              │
                    ┌─────────────────────────┴───────────────┐
                    ▼                                         ▼
        ┌───────────────────┐                   ┌─────────────────────┐
        │ Local Processing  │                   │ Server Processing   │
        │ (transformers.js) │                   │ (Node.js)           │
        │                   │                   │                     │
        │ ┌───────────────┐ │                   │ ┌─────────────────┐ │
        │ │ Whisper Model │ │                   │ │ Deepgram API    │ │
        │ └───────────────┘ │                   │ └─────────────────┘ │
        │        │          │                   │         │           │
        │        ▼          │                   │         ▼           │
        │ ┌───────────────┐ │                   │ ┌─────────────────┐ │
        │ │ Ollama LLM    │ │                   │ │ Claude/GPT API  │ │
        │ └───────────────┘ │                   │ └─────────────────┘ │
        └───────────────────┘                   └─────────────────────┘
```

### Project Structure Template

```
my-transcription-extension/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── background/
│   └── service-worker.js
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.js
├── lib/
│   ├── audio-processor.js
│   ├── transcriber.js
│   └── llm-client.js
├── server/                    # Optional, for cloud processing
│   ├── index.js
│   └── package.json
└── package.json
```

### Development Steps

1. **Week 1: Audio Capture**
   - Set up Manifest V3 extension scaffold
   - Implement TabCapture with offscreen document
   - Verify audio stream capture works

2. **Week 2: Transcription**
   - Choose transcription approach (local vs cloud)
   - Integrate transformers.js or Deepgram
   - Display real-time transcripts in UI

3. **Week 3: LLM Integration**
   - Add transcript buffering
   - Implement LLM summarization
   - Add action item extraction

4. **Week 4: Polish**
   - Side panel UI
   - Export options (TXT, JSON)
   - Settings page for API keys

---

## Recommendations

### For Maximum Privacy
**Use:** ainoya/chrome-extension-web-transcriptor-ai
- Fork and extend with local Ollama integration
- All processing stays on device
- Trade-off: Lower accuracy than cloud

### For Best Accuracy + LLM Integration
**Use:** Deepgram + Custom Server
- Fork milad-zai/chrome-ai-audio-transcription
- Add Claude/GPT post-processing on server
- Trade-off: Audio goes to cloud

### For Self-Hosted Enterprise
**Use:** WhisperLive or Whishper
- Full control over infrastructure
- Can integrate any LLM
- Trade-off: Setup complexity

### For Rapid Prototyping
**Use:** Web Speech API + OpenAI
- No server needed
- Simple implementation
- Trade-off: Chrome only, limited accuracy

---

## Additional Resources

### Tutorials
- [Deepgram: Transcribing Browser Tab Audio](https://deepgram.com/learn/transcribing-browser-tab-audio-chrome-extensions)
- [Recall.ai: How to Build a Chrome Recording Extension](https://www.recall.ai/blog/how-to-build-a-chrome-recording-extension)
- [Chrome Docs: TabCapture API](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)
- [Chrome Docs: Offscreen Documents](https://developer.chrome.com/blog/Offscreen-Documents-in-Manifest-v3)

### Model Resources
- [Whisper WASM Demo](https://ggml.ai/whisper.cpp/)
- [Whisper WebGPU Demo](https://huggingface.co/spaces/Xenova/whisper-webgpu)
- [transformers.js Documentation](https://huggingface.co/docs/transformers.js)

### LLM Integration Examples
- [DistiLlama - Local LLM Chrome Extension](https://github.com/shreyaskarnik/DistiLlama)
- [LLM Correct Extension](https://chromewebstore.google.com/detail/llm-correct-extension/gmhgbpmneclcmcibjbndhlgfhnipkioh)

---

## Appendix: Speech-to-Text Accuracy Comparison (2025)

Based on independent benchmarks:

| Provider | WER (Streaming) | WER (Batch) | Best For |
|----------|-----------------|-------------|----------|
| Deepgram Nova-3 | ~8% | ~6% | Real-time, accuracy |
| GPT-4o-transcribe | - | ~5% | Batch, highest accuracy |
| Whisper Large V3 | - | ~7% | Self-hosted accuracy |
| Whisper Tiny | - | ~15% | Browser local, speed |
| Google Speech-to-Text | ~12% | ~10% | Language coverage |
| Web Speech API | ~15-20% | - | Prototyping |

*WER = Word Error Rate (lower is better)*

**Note:** Accuracy varies significantly with audio quality, accents, domain-specific terminology, and background noise. Real-world performance may differ from benchmarks by 15-30%.
