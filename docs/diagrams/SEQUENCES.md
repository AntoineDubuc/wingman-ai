# Sequence Diagrams

## Session Start Flow

```mermaid
sequenceDiagram
    participant User
    participant Popup
    participant SW as Service Worker
    participant Storage as chrome.storage
    participant Deepgram as deepgramClient
    participant DeepgramAPI as Deepgram API
    participant Gemini as geminiClient
    participant Content as Content Script
    participant Overlay
    participant Offscreen

    User->>Popup: Click "Start Session"
    Popup->>SW: START_SESSION

    Note over SW: Validate API keys
    SW->>Storage: get(['deepgramApiKey', 'geminiApiKey'])
    Storage-->>SW: { deepgramApiKey, geminiApiKey }

    alt Missing API keys
        SW-->>Popup: { success: false, error: '...' }
        Popup->>User: Show error
    end

    Note over SW: Initialize Gemini
    SW->>Gemini: startSession()
    SW->>Storage: migrateToPersonas()
    SW->>Storage: getActivePersona()
    Storage-->>SW: { id, name, systemPrompt, kbDocumentIds }
    SW->>Gemini: setSystemPrompt(persona.systemPrompt)
    SW->>Gemini: setKBDocumentFilter(persona.kbDocumentIds)

    Note over SW: Connect to Deepgram
    SW->>Deepgram: connect()
    Deepgram->>DeepgramAPI: WebSocket OPEN<br/>Sec-WebSocket-Protocol: ['token', apiKey]
    DeepgramAPI-->>Deepgram: Connection established
    Deepgram-->>SW: true

    Note over SW: Initialize UI
    SW->>Content: INIT_OVERLAY
    Content->>Overlay: new AIOverlay()
    Overlay-->>Content: Shadow DOM created
    Content-->>SW: { success: true }

    Note over SW: Setup audio capture
    SW->>Offscreen: chrome.offscreen.createDocument()
    SW->>Offscreen: chrome.tabCapture.getMediaStreamId()
    SW->>Offscreen: START_DUAL_CAPTURE

    Offscreen->>Offscreen: getUserMedia() mic + tab
    Offscreen->>Offscreen: Start AudioWorklet
    Offscreen-->>SW: { success: true }

    Note over SW: Session active
    SW->>SW: isSessionActive = true
    SW-->>Popup: { success: true }

    Popup->>Popup: updateStatus()
    Popup->>User: Show "Stop Session" button
```

## Transcript to Suggestion Flow

```mermaid
sequenceDiagram
    participant Deepgram as Deepgram API
    participant DC as deepgramClient
    participant SW as Service Worker
    participant Collector as transcriptCollector
    participant Gemini as geminiClient
    participant KB as KB Search
    participant GeminiAPI as Gemini API
    participant Content as Content Script
    participant Overlay

    Deepgram->>DC: WebSocket message<br/>{ type: "Results", is_final: true, speech_final: true }

    Note over DC: Process endpointing
    DC->>DC: Accumulate segments
    DC->>DC: Flush on speech_final=true

    DC->>SW: onTranscriptCallback({ text, speaker, is_final, ... })

    Note over SW: Store transcript
    SW->>Collector: addTranscript(transcript)

    Note over SW: Send to UI (lowercase)
    SW->>Content: { type: 'transcript', data: {...} }
    Content->>Overlay: addTranscript(data)
    Overlay->>Overlay: Render transcript bubble

    alt is_final === true
        Note over SW: Generate AI suggestion
        SW->>Gemini: processTranscript(text, speaker, is_final)

        Note over Gemini: Check cooldown (15s)
        alt Cooldown active
            Gemini-->>SW: null (skip suggestion)
        else Cooldown elapsed
            Note over Gemini: Search KB (persona-scoped)
            Gemini->>KB: getKBContext(query, kbDocumentIds)
            KB->>KB: Generate query embedding
            KB->>KB: Cosine similarity search<br/>(filter by persona docs)
            KB-->>Gemini: { context, source, matched }

            Note over Gemini: Build prompt with KB context
            Gemini->>Gemini: systemPromptWithKB =<br/>KB context + persona prompt

            Gemini->>GeminiAPI: generateContent({ contents, systemInstruction })
            GeminiAPI-->>Gemini: { candidates: [{ content: { parts: [{ text }] } }] }

            alt Response is silence marker (---)
                Gemini-->>SW: null
            else Valid suggestion
                Gemini-->>SW: { text, suggestion_type, kbSource, ... }

                Note over SW: Store suggestion
                SW->>Collector: addSuggestion(suggestion)

                Note over SW: Send to UI (lowercase)
                SW->>Content: { type: 'suggestion', data: {...} }
                Content->>Overlay: addSuggestion(data)
                Overlay->>Overlay: Render suggestion card<br/>with KB source badge
            end
        end
    end
```

## Session Stop and Summary Flow

```mermaid
sequenceDiagram
    participant User
    participant Popup
    participant SW as Service Worker
    participant Offscreen
    participant Deepgram as deepgramClient
    participant Collector as transcriptCollector
    participant Gemini as geminiClient
    participant GeminiAPI as Gemini API
    participant Drive as driveService
    participant DriveAPI as Google Drive API
    participant Content as Content Script
    participant Overlay

    User->>Popup: Click "Stop Session"
    Popup->>SW: STOP_SESSION

    Note over SW: Stop audio capture
    SW->>Offscreen: STOP_AUDIO_CAPTURE
    Offscreen->>Offscreen: Stop mic + tab streams

    Note over SW: Show loading
    SW->>Content: { type: 'summary_loading' }
    Content->>Overlay: Show spinner

    Note over SW: End session
    SW->>Collector: endSession()
    Collector-->>SW: { startTime, endTime, transcripts[], suggestionsCount }

    Note over SW: Generate call summary
    SW->>SW: Filter speech-only transcripts
    SW->>SW: Apply truncation<br/>(first 50 + last 400)
    SW->>Gemini: generateCallSummary(transcripts, metadata, options)
    Gemini->>GeminiAPI: generateContent with summary prompt
    GeminiAPI-->>Gemini: { summary[], actionItems[], keyMoments[] }
    Gemini-->>SW: CallSummary object

    alt Drive autosave enabled
        Note over SW: Save to Google Drive
        SW->>Drive: saveTranscript(transcripts, metadata, folder, format, summary)

        Drive->>Drive: getAuthToken()<br/>(chrome.identity or launchWebAuthFlow)

        alt 401 Unauthorized
            Drive->>Drive: removeCachedAuthToken()
            Drive->>Drive: Retry with fresh token
        end

        Drive->>Drive: formatTranscript(format)<br/>googledoc/md/text/json
        Drive->>DriveAPI: Create/find folder
        Drive->>DriveAPI: Upload file<br/>(HTML for Google Doc conversion)
        DriveAPI-->>Drive: { id, webViewLink }
        Drive-->>SW: { success: true, fileId, url }

        Note over SW: Send Drive result
        SW->>Content: { type: 'drive_save_result', data: {...} }
        Content->>Overlay: Show "Saved to Drive" with link
    end

    Note over SW: Send summary to UI
    SW->>Content: { type: 'call_summary', data: summary }
    Content->>Overlay: Render summary card<br/>(bullets, action items, key moments)

    Note over SW: Cleanup
    SW->>Deepgram: disconnect()
    Deepgram->>Deepgram: Close WebSocket
    SW->>Gemini: clearSession()
    SW->>SW: chrome.offscreen.closeDocument()
    SW->>SW: isSessionActive = false

    SW-->>Popup: { success: true }
    Popup->>User: Update UI to "Start Session"
```

## Audio Chunk Flow

```mermaid
sequenceDiagram
    participant Mic as Microphone
    participant Worklet as AudioWorklet
    participant Content as Content Script
    participant SW as Service Worker
    participant DC as deepgramClient
    participant Deepgram as Deepgram API

    loop Every ~128 frames (~2.7ms)
        Mic->>Worklet: Float32 audio data<br/>48kHz stereo
        Worklet->>Worklet: Accumulate to buffer<br/>(4096 samples)

        alt Buffer full (>= 4096 samples)
            Worklet->>Worklet: Resample 48kHz → 16kHz<br/>(linear interpolation)
            Worklet->>Worklet: Float32 → Int16 PCM<br/>(clamp & scale)
            Worklet->>Worklet: Stereo interleaving
            Worklet->>Content: postMessage({ type: 'audio', audioData: [...] })
        end
    end

    Content->>SW: { type: 'AUDIO_CHUNK', data: Int16[] }

    alt isSessionActive
        SW->>DC: sendAudio(data)
        DC->>DC: Append to audioBuffer

        alt audioBuffer.length >= 4096
            DC->>DC: flushBuffer()
            DC->>DC: new Int16Array(audioBuffer)
            DC->>Deepgram: WebSocket.send(ArrayBuffer)
        end
    else !isSessionActive
        SW->>SW: Discard audio (silent)
    end
```

## Message Type Convention Flow

```mermaid
flowchart TB
    subgraph "Senders (UPPERCASE)"
        Popup[Popup]
        Content[Content Script]
        Offscreen[Offscreen]
    end

    subgraph "Service Worker Listener"
        Listener[chrome.runtime.onMessage<br/>Receives UPPERCASE]
    end

    subgraph "Service Worker Sender"
        Sender[chrome.tabs.sendMessage<br/>Sends lowercase]
    end

    subgraph "Content Script Listener (lowercase)"
        ContentListener[chrome.runtime.onMessage<br/>Receives lowercase]
        OverlayRender[Overlay renders UI]
    end

    Popup -->|START_SESSION<br/>STOP_SESSION<br/>GET_STATUS| Listener
    Content -->|INIT_OVERLAY| Listener
    Offscreen -->|AUDIO_CHUNK<br/>CAPTURE_STATUS<br/>STOP_AUDIO_CAPTURE| Listener

    Listener --> |Process| Sender

    Sender -->|transcript<br/>suggestion<br/>call_summary<br/>summary_loading<br/>drive_save_result| ContentListener
    ContentListener --> OverlayRender

    style Listener fill:#E74C3C,color:#fff
    style Sender fill:#34A853,color:#fff
    style OverlayRender fill:#4A90D9,color:#fff
```

## KB Search with Persona Scoping

```mermaid
sequenceDiagram
    participant Gemini as geminiClient
    participant KB as KB Search
    participant GeminiAPI as Gemini Embedding API
    participant IDB as IndexedDB

    Note over Gemini: Active persona loaded<br/>kbDocumentIds = [1, 3, 5]

    Gemini->>KB: getKBContext(query, kbDocumentIds)

    Note over KB: Generate query embedding
    KB->>GeminiAPI: generateEmbedding(query, 'RETRIEVAL_QUERY')
    GeminiAPI-->>KB: embedding[768]

    Note over KB: Search chunks
    KB->>IDB: getAllChunks()
    IDB-->>KB: chunks[]

    loop For each chunk
        alt chunk.documentId NOT in kbDocumentIds
            KB->>KB: Skip (persona filter)
        else chunk.documentId in kbDocumentIds
            KB->>KB: cosineSimilarity(queryEmbedding, chunk.embedding)

            alt similarity >= 0.55 (threshold)
                KB->>KB: Add to candidates
            end
        end
    end

    KB->>KB: Sort by similarity DESC
    KB->>KB: Take top 3 chunks

    alt No matches
        KB-->>Gemini: { context: '', source: '', matched: false }
    else Matches found
        KB->>KB: Format context with source attribution
        KB-->>Gemini: { context: '...', source: 'filename.pdf', matched: true }
    end

    Note over Gemini: Inject KB context into system prompt
    Gemini->>Gemini: systemPromptWithKB = KB context + persona.systemPrompt
```

## Drive OAuth Flow (Cross-Browser)

```mermaid
sequenceDiagram
    participant Drive as driveService
    participant ChromeID as chrome.identity
    participant Storage as chrome.storage
    participant Google as Google OAuth

    Drive->>Drive: getAuthToken(interactive=true)

    Note over Drive: Try Tier 1: Chrome-native
    Drive->>ChromeID: getAuthToken({ interactive: true })

    alt getAuthToken available (Chrome)
        ChromeID->>Google: OAuth flow
        Google-->>ChromeID: access_token
        ChromeID-->>Drive: token
    else getAuthToken unavailable (Vivaldi, etc.)
        Note over Drive: Fallback Tier 2: launchWebAuthFlow

        Drive->>ChromeID: launchWebAuthFlow({ url: 'https://accounts.google.com/...' })
        ChromeID->>Google: Open OAuth popup
        Google->>Google: User authorizes
        Google-->>ChromeID: Redirect with #access_token=...
        ChromeID-->>Drive: responseUrl

        Drive->>Drive: Parse access_token from URL fragment
        Drive->>Storage: set({ driveOAuthToken: token })
        Drive->>Drive: Cache token for future calls
    end

    alt 401 Unauthorized (token expired)
        Drive->>ChromeID: removeCachedAuthToken({ token })
        Drive->>Drive: Retry getAuthToken(interactive=true)
    end

    Drive-->>Drive: return token
```
