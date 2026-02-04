# System Architecture Diagram

## Component Overview

```mermaid
graph TB
    subgraph "Chrome Extension"
        subgraph "UI Layer"
            Popup[Popup<br/>popup.ts]
            Options[Options Page<br/>options.ts]
            Overlay[Overlay<br/>overlay.ts<br/>Shadow DOM]
        end

        subgraph "Content Script"
            ContentScript[Content Script<br/>content-script.ts<br/>Google Meet tab]
            AudioWorklet[AudioWorklet<br/>audio-processor.worklet.js<br/>16kHz PCM16]
        end

        subgraph "Service Worker"
            SW[Service Worker<br/>service-worker.ts<br/>Orchestrator]
        end

        subgraph "Offscreen Document"
            Offscreen[Offscreen<br/>offscreen.ts<br/>Tab capture]
            TabAudio[AudioWorklet<br/>audio-processor.js]
        end

        subgraph "Services (Singletons)"
            Deepgram[deepgramClient<br/>WebSocket STT]
            Gemini[geminiClient<br/>REST API]
            Drive[driveService<br/>OAuth + Save]
            KB[kbDatabase<br/>IndexedDB]
            Collector[transcriptCollector<br/>Session data]
        end

        subgraph "Storage"
            ChromeStorage[(chrome.storage.local<br/>Personas, Keys, Settings)]
            IndexedDB[(IndexedDB<br/>KB Documents + Embeddings)]
        end
    end

    subgraph "External APIs"
        DeepgramAPI[Deepgram API<br/>wss://api.deepgram.com<br/>Nova-3 STT]
        GeminiAPI[Gemini API<br/>Gemini 2.0 Flash<br/>Suggestions + Embeddings]
        DriveAPI[Google Drive API<br/>Save transcripts<br/>OAuth]
    end

    %% UI Connections
    Popup <-->|messages| SW
    Options <-->|chrome.storage| ChromeStorage
    ContentScript -->|injects| Overlay
    Overlay -->|renders| ContentScript

    %% Audio Flow
    ContentScript -->|mic audio| AudioWorklet
    AudioWorklet -->|AUDIO_CHUNK| SW
    SW -->|START_DUAL_CAPTURE| Offscreen
    Offscreen -->|tab audio| TabAudio
    TabAudio -->|AUDIO_CHUNK| SW

    %% Service Worker to Services
    SW -->|sendAudio| Deepgram
    SW -->|processTranscript| Gemini
    SW -->|saveTranscript| Drive
    SW -->|addTranscript| Collector

    %% Services to External APIs
    Deepgram <-->|WebSocket<br/>Sec-WebSocket-Protocol| DeepgramAPI
    Gemini <-->|HTTPS<br/>REST API| GeminiAPI
    Drive <-->|HTTPS<br/>OAuth 2.0| DriveAPI

    %% Storage Access
    SW <-->|read/write| ChromeStorage
    Gemini <-->|embeddings| KB
    KB <-->|vectors| IndexedDB

    %% Messages back to UI
    SW -->|transcript<br/>suggestion<br/>call_summary| ContentScript
    ContentScript -->|display| Overlay

    style SW fill:#4A90D9,color:#fff
    style Deepgram fill:#34A853,color:#fff
    style Gemini fill:#F5A623,color:#fff
    style Drive fill:#E74C3C,color:#fff
    style KB fill:#9B59B6,color:#fff
    style DeepgramAPI fill:#34A853,color:#fff,stroke:#000,stroke-width:2px
    style GeminiAPI fill:#F5A623,color:#fff,stroke:#000,stroke-width:2px
    style DriveAPI fill:#E74C3C,color:#fff,stroke:#000,stroke-width:2px
```

## Message Type Convention

```mermaid
graph LR
    subgraph "UPPERCASE Messages"
        Popup1[Popup]
        Content1[Content Script]
        Offscreen1[Offscreen]
    end

    subgraph "Service Worker"
        SW1[chrome.runtime.onMessage<br/>Receives UPPERCASE]
        SW2[chrome.tabs.sendMessage<br/>Sends lowercase]
    end

    subgraph "lowercase Messages"
        Content2[Content Script<br/>overlay.ts]
    end

    Popup1 -->|START_SESSION<br/>STOP_SESSION<br/>GET_STATUS| SW1
    Content1 -->|INIT_OVERLAY| SW1
    Offscreen1 -->|AUDIO_CHUNK<br/>CAPTURE_STATUS| SW1

    SW2 -->|transcript<br/>suggestion<br/>call_summary<br/>summary_loading| Content2

    style SW1 fill:#E74C3C,color:#fff
    style SW2 fill:#34A853,color:#fff
```

## Data Flow: Audio to Transcript

```mermaid
flowchart TD
    Start([User speaks]) --> Mic[Microphone Input<br/>48kHz Float32]
    Participant([Participant speaks]) --> Tab[Tab Capture<br/>48kHz Float32]

    Mic --> Worklet1[AudioWorklet<br/>content-script.ts]
    Tab --> Worklet2[AudioWorklet<br/>offscreen.ts]

    Worklet1 --> Resample1[Resample to 16kHz<br/>Linear interpolation]
    Worklet2 --> Resample2[Resample to 16kHz<br/>Linear interpolation]

    Resample1 --> Convert1[Float32 → Int16 PCM<br/>Stereo interleaving]
    Resample2 --> Convert2[Float32 → Int16 PCM<br/>Stereo interleaving]

    Convert1 --> Chunk1[AUDIO_CHUNK message]
    Convert2 --> Chunk2[AUDIO_CHUNK message]

    Chunk1 --> Buffer[Service Worker<br/>deepgramClient.audioBuffer]
    Chunk2 --> Buffer

    Buffer --> |threshold >= 4096| Flush[flushBuffer]
    Flush --> WS[WebSocket.send<br/>ArrayBuffer]

    WS --> Deepgram[Deepgram API<br/>Nova-3 STT]

    Deepgram --> Results{Results message}
    Results -->|interim| Interim[is_final=false<br/>Emit immediately]
    Results -->|partial final| Accumulate[is_final=true<br/>speech_final=false<br/>Accumulate segments]
    Results -->|final| Final[is_final=true<br/>speech_final=true<br/>Flush & emit]

    Interim --> Callback[onTranscriptCallback]
    Accumulate --> Callback
    Final --> Callback

    Callback --> Display[Overlay displays<br/>transcript bubble]

    style Deepgram fill:#34A853,color:#fff,stroke:#000,stroke-width:2px
    style WS fill:#4A90D9,color:#fff
    style Callback fill:#F5A623,color:#fff
```

## Persona System Architecture

```mermaid
graph TB
    subgraph "Storage Layer"
        Storage[(chrome.storage.local)]
        IDB[(IndexedDB<br/>KB Documents)]
    end

    subgraph "Persona Data"
        Personas[Personas Array<br/>id, name, color<br/>systemPrompt<br/>kbDocumentIds]
        ActiveID[activePersonaId]
        Templates[12 Built-in Templates<br/>Sales, Interview, etc.]
    end

    subgraph "Session Start"
        Load[Load Active Persona]
        SetPrompt[Set Gemini<br/>System Prompt]
        SetFilter[Set KB<br/>Document Filter]
    end

    subgraph "Runtime Usage"
        GeminiClient[geminiClient<br/>processTranscript]
        KBSearch[KB Search<br/>searchKB]
        Overlay2[Overlay Header<br/>Active Persona Label]
    end

    Storage --> Personas
    Storage --> ActiveID
    Templates -.->|seed on first run| Personas

    Load --> Personas
    Load --> ActiveID
    Load --> SetPrompt
    Load --> SetFilter

    SetPrompt --> GeminiClient
    SetFilter --> KBSearch

    KBSearch -->|filter by documentIds| IDB
    GeminiClient -->|inject KB context| SetPrompt

    Personas --> Overlay2

    style Load fill:#4A90D9,color:#fff
    style GeminiClient fill:#F5A623,color:#fff
    style KBSearch fill:#9B59B6,color:#fff
```

## Key Conventions

### 1. Singleton Pattern
All services export singleton instances, not classes:
```typescript
export const deepgramClient = new DeepgramClient();
export const geminiClient = new GeminiClient();
```

### 2. Message Case Convention
- **Service Worker receives**: UPPERCASE (`START_SESSION`, `AUDIO_CHUNK`)
- **Service Worker sends to content script**: lowercase (`transcript`, `suggestion`)

### 3. WebSocket Auth
Deepgram requires `Sec-WebSocket-Protocol` header (browser limitation):
```typescript
new WebSocket(url, ['token', apiKey]);  // ✅ Correct
```

### 4. Async Message Responses
```typescript
chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
  handleAsync(message).then(sendResponse);
  return true;  // ⚠️ Critical: keeps channel open
});
```

## Component Responsibilities

| Component | Responsibility | Context |
|-----------|---------------|---------|
| **Service Worker** | Orchestration, message routing, session lifecycle | Background |
| **Content Script** | Mic capture, overlay injection, message bridge | Google Meet tab |
| **Offscreen Document** | Tab audio capture (requires offscreen context) | Offscreen |
| **Overlay** | UI rendering (Shadow DOM isolation) | Google Meet tab |
| **deepgramClient** | WebSocket STT connection | Service Worker |
| **geminiClient** | REST API for suggestions + embeddings | Service Worker |
| **driveService** | OAuth + file upload to Drive | Service Worker |
| **kbDatabase** | IndexedDB wrapper for vectors | Service Worker |
| **transcriptCollector** | Session data accumulation | Service Worker |
