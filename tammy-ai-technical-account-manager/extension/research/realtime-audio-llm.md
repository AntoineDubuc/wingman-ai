# Real-Time Audio Streaming to LLMs for Live Conversation Analysis

> Research Date: January 2026
> Purpose: Chrome extension for AI-powered conversation analysis during Google Meet calls

## Executive Summary

This document evaluates real-time audio streaming APIs for LLM-based conversation analysis. The key options are:

| Provider | Latency | Pricing (approx.) | Continuous Listening | Best For |
|----------|---------|-------------------|---------------------|----------|
| **OpenAI Realtime API** | ~200-500ms | $0.06/min input, $0.24/min output | Yes (WebSocket) | Full speech-to-speech, high quality |
| **Gemini Live API** | ~200-400ms | ~$0.30/1M audio tokens | Yes (WebSocket) | Multimodal, cost-effective |
| **Amazon Nova Sonic** | Low latency | ~$0.02/min input, $0.08/min output | Yes (Bidirectional HTTP/2) | AWS ecosystem integration |
| **Deepgram** | <300ms | $0.0077/min | Yes (WebSocket) | STT only, best for transcription |
| **Ultravox** | ~150ms | Self-hosted or API | Yes (WebSocket) | Open-source, lowest latency |

**Recommendation for Chrome Extension**: For real-time meeting analysis, consider a **hybrid approach**:
1. Use **Deepgram** or **AssemblyAI** for fast, accurate transcription
2. Send transcriptions to **Claude/GPT-4** for intelligent analysis and suggestions

Alternatively, use **Gemini Live API** for a fully integrated solution with good cost/performance balance.

---

## 1. Google Gemini Live API (Multimodal Live API)

### Overview
The Gemini Live API enables low-latency, real-time voice and video interactions with Gemini models. It processes continuous streams of audio, video, or text to deliver immediate, human-like spoken responses.

### API Endpoint

**Google AI Studio (Developer API)**:
```
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent
```

**Vertex AI (Enterprise)**:
```
wss://{REGION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent
```

### Authentication

**Option 1: API Key (Development)**
```
?key=YOUR_API_KEY
```

**Option 2: Ephemeral Token (Production - recommended for client apps)**
- Obtain via `AuthTokenService.CreateToken`
- Pass as query param: `?access_token=TOKEN`
- Or HTTP header: `Authorization: Token <token>`
- Default expiration: 30 minutes (max 20 hours)

### Audio Format Requirements

| Parameter | Input | Output |
|-----------|-------|--------|
| **Format** | 16-bit PCM | 16-bit PCM |
| **Sample Rate** | 16kHz | 24kHz |
| **Channels** | Mono (1) | Mono (1) |
| **Chunk Size** | 1024 bytes recommended | Variable |

### Available Models

- `gemini-2.5-flash-native-audio-preview-12-2025` (Latest)
- `gemini-2.5-flash-preview-native-audio-dialog`
- `gemini-2.5-flash-exp-native-audio-thinking-dialog` (with reasoning)

### Key Features

- **Voice Activity Detection (VAD)**: Automatically detects when user speaks
- **Barge-in Support**: Users can interrupt model responses
- **Affective Dialog**: Adapts response style/tone to match user expression
- **Tool Use**: Function calling, Google Search grounding
- **Session Management**: Handles long-running conversations
- **Session Limit**: Default 10 minutes per session

### Pricing (Gemini 2.5 Flash)

| Type | Standard | Cached |
|------|----------|--------|
| **Audio Input** | $0.30/1M tokens | $0.03/1M tokens |
| **Audio Output** | $0.40/1M tokens | - |
| **Text/Image Input** | $0.10/1M tokens | $0.01/1M tokens |

**Token Rate**: 25 tokens per second of audio (both input and output)

**Per-Minute Estimate**:
- Input: ~$0.00045/min
- Output: ~$0.0006/min

**Note**: Live API charges per turn for all accumulated context tokens, not just new tokens.

### Code Example (Python)

```python
import asyncio
from google import genai
import pyaudio

# Audio configuration
FORMAT = pyaudio.paInt16
CHANNELS = 1
SEND_SAMPLE_RATE = 16000
RECEIVE_SAMPLE_RATE = 24000
CHUNK_SIZE = 1024

client = genai.Client()

MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"
CONFIG = {
    "response_modalities": ["AUDIO"],
    "system_instruction": """You are an AI assistant listening to a sales call.
    Analyze the conversation and provide helpful suggestions when appropriate.
    Only respond when you have valuable input - don't interrupt unnecessarily.""",
}

async def main():
    pya = pyaudio.PyAudio()

    async with client.aio.live.connect(model=MODEL, config=CONFIG) as session:
        # Send audio continuously
        async def send_audio():
            stream = pya.open(
                format=FORMAT,
                channels=CHANNELS,
                rate=SEND_SAMPLE_RATE,
                input=True,
                frames_per_buffer=CHUNK_SIZE
            )
            while True:
                data = stream.read(CHUNK_SIZE, exception_on_overflow=False)
                await session.send_realtime_input(audio=data)
                await asyncio.sleep(0.01)

        # Receive responses
        async def receive_responses():
            async for response in session.receive():
                if response.text:
                    print(f"AI Suggestion: {response.text}")
                # Handle audio response if needed

        await asyncio.gather(send_audio(), receive_responses())

asyncio.run(main())
```

### Code Example (JavaScript/Node.js)

```javascript
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash-native-audio-preview-12-2025",
});

const config = {
  responseModalities: ["TEXT"], // Use TEXT for analysis, AUDIO for voice
  systemInstruction: `You are analyzing a live sales conversation.
    Provide brief, actionable suggestions when you notice opportunities.`,
};

async function startLiveSession() {
  const session = await model.startLiveSession(config);

  // Send audio data (from Web Audio API or MediaRecorder)
  function sendAudio(audioBuffer) {
    session.sendRealtimeInput({
      audio: {
        data: audioBuffer, // Base64 encoded PCM16 audio
        mimeType: "audio/pcm;rate=16000"
      }
    });
  }

  // Listen for responses
  session.on("response", (response) => {
    if (response.text) {
      console.log("Suggestion:", response.text);
      // Display in extension UI
    }
  });

  return { session, sendAudio };
}
```

### Continuous Listening Support

**YES** - The Gemini Live API is designed for continuous, bidirectional streaming:
- Maintains persistent WebSocket connection
- Built-in VAD detects speech automatically
- Supports interruption/barge-in
- Session context maintained across turns

### Limitations

- Session limit: 10 minutes default
- Server-to-server auth only (requires backend proxy for browser apps)
- v1beta API (may change)

### Resources

- [Get started with Live API](https://ai.google.dev/gemini-api/docs/live)
- [Live API Reference](https://ai.google.dev/api/live)
- [Vertex AI Live API](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api)

---

## 2. OpenAI Realtime API

### Overview

The OpenAI Realtime API enables low-latency communication with models that natively support speech-to-speech interactions. It supports multimodal inputs (audio, images, text) and outputs (audio, text).

### API Endpoint

**WebSocket**:
```
wss://api.openai.com/v1/realtime?model=gpt-realtime
```

**WebRTC** (recommended for browsers):
```
Requires ephemeral token exchange via REST API first
```

### Authentication

**WebSocket (Server-side)**:
```
Authorization: Bearer YOUR_API_KEY
OpenAI-Beta: realtime=v1
```

**WebRTC (Client-side)**:
1. Server creates ephemeral token via REST API
2. Client uses token for WebRTC connection
3. Token expires after single use

### Audio Format Requirements

| Parameter | Value |
|-----------|-------|
| **Format** | PCM16 (16-bit signed, little-endian) |
| **Sample Rate** | 24kHz |
| **Channels** | Mono (1) |
| **Encoding** | Base64 for WebSocket |
| **Chunk Size** | 15-50 KB recommended (~20KB per frame) |

**Alternative**: Opus codec (better compression, lower bitrate)

### Available Models

- `gpt-realtime` (GA model)
- `gpt-4o-realtime-preview` (Preview)
- `gpt-4o-realtime-preview-2024-12-17`

### Key Features

- **Turn Detection**: Semantic VAD for natural conversation flow
- **Interruption Handling**: Graceful barge-in support
- **Function Calling**: Tool use during conversation
- **Transcription**: Built-in input/output transcription
- **Multiple Voices**: Various voice options (alloy, echo, fable, onyx, nova, shimmer)

### Pricing

| Type | Rate | Per Minute |
|------|------|------------|
| **Audio Input** | $100/1M tokens | ~$0.06/min |
| **Audio Output** | $200/1M tokens | ~$0.24/min |
| **Text Input** | $5/1M tokens | - |
| **Text Output** | $20/1M tokens | - |
| **Cached Audio Input** | $20/1M tokens | ~$0.012/min |

**Token to Time Conversion**:
- Input: 1 token = 100ms of audio
- Output: 1 token = 50ms of audio

**Typical Cost**: ~$0.20-0.50 per minute of active conversation

### Code Example (Node.js WebSocket)

```javascript
import WebSocket from "ws";

const url = "wss://api.openai.com/v1/realtime?model=gpt-realtime";

const ws = new WebSocket(url, {
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "OpenAI-Beta": "realtime=v1",
  },
});

ws.on("open", () => {
  // Configure session
  ws.send(JSON.stringify({
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      instructions: `You are analyzing a live meeting conversation.
        Listen carefully and provide helpful suggestions when appropriate.
        Keep responses brief and actionable.`,
      voice: "alloy",
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      input_audio_transcription: { model: "whisper-1" },
      turn_detection: {
        type: "semantic_vad",
        eagerness: "medium",
        create_response: true,
      },
    },
  }));
});

// Send audio chunk
function sendAudio(pcmBuffer) {
  const base64Audio = pcmBuffer.toString("base64");
  ws.send(JSON.stringify({
    type: "input_audio_buffer.append",
    audio: base64Audio,
  }));
}

// Commit audio buffer (triggers response)
function commitAudio() {
  ws.send(JSON.stringify({
    type: "input_audio_buffer.commit",
  }));
}

// Handle responses
ws.on("message", (data) => {
  const event = JSON.parse(data);

  switch (event.type) {
    case "response.audio_transcript.delta":
      console.log("AI:", event.delta);
      break;
    case "response.text.delta":
      console.log("Suggestion:", event.delta);
      break;
    case "input_audio_buffer.speech_started":
      console.log("User speaking...");
      break;
    case "error":
      console.error("Error:", event.error);
      break;
  }
});
```

### Code Example (Browser with WebRTC)

```javascript
// First, get ephemeral token from your server
async function getEphemeralToken() {
  const response = await fetch("/api/realtime-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return response.json();
}

async function startRealtimeSession() {
  const { token } = await getEphemeralToken();

  const pc = new RTCPeerConnection();

  // Get microphone audio
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  // Data channel for events
  const dc = pc.createDataChannel("oai-events");

  dc.onopen = () => {
    dc.send(JSON.stringify({
      type: "session.update",
      session: {
        modalities: ["text"],
        instructions: "Analyze this meeting and provide suggestions.",
      },
    }));
  };

  dc.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "response.text.delta") {
      displaySuggestion(msg.delta);
    }
  };

  // Create offer and connect
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const response = await fetch("https://api.openai.com/v1/realtime", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/sdp",
    },
    body: offer.sdp,
  });

  const answer = await response.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answer });

  return { pc, dc };
}
```

### Continuous Listening Support

**YES** - Supports continuous streaming:
- Persistent WebSocket/WebRTC connection
- Semantic VAD for automatic turn detection
- Must explicitly commit audio buffer (or enable auto-commit)
- Supports interruption

### Limitations

- Higher cost than alternatives
- WebRTC recommended for browsers (WebSocket has higher latency)
- 413 errors if chunks too large (keep under 50KB)
- Context accumulates, increasing cost over time

### Resources

- [Realtime API Guide](https://platform.openai.com/docs/guides/realtime)
- [Realtime WebSocket Guide](https://platform.openai.com/docs/guides/realtime-websocket)
- [API Reference](https://platform.openai.com/docs/api-reference/realtime)

---

## 3. Amazon Nova Sonic (AWS Bedrock)

### Overview

Amazon Nova Sonic provides real-time, conversational interactions through bidirectional audio streaming via AWS Bedrock. It processes and responds to speech as it occurs, enabling natural conversational experiences.

### API Endpoint

Uses AWS Bedrock's `InvokeModelWithBidirectionalStream` API over HTTP/2:
```
bedrock-runtime.{region}.amazonaws.com
```

### Authentication

Standard AWS IAM authentication:
- AWS Access Key + Secret Key
- IAM Role with `bedrock:InvokeModelWithBidirectionalStream` permission
- Supports AWS SDK credentials providers

### Audio Format Requirements

| Parameter | Value |
|-----------|-------|
| **Format** | PCM16 or Opus |
| **Sample Rate** | 16kHz (input), 24kHz (output) |
| **Channels** | Mono (1) |

### Available Models

- `amazon.nova-sonic-v1:0` (Original)
- `amazon.nova-2-sonic-v1:0` (December 2025 - improved)

### Key Features

- **Bidirectional Streaming**: HTTP/2 based, not WebSocket
- **Function Calling**: Tool use and agentic workflows
- **RAG Integration**: Knowledge grounding with enterprise data
- **Interruption Handling**: Graceful without losing context
- **Background Noise Robustness**: Filters out ambient noise
- **Context Window**: 300K tokens
- **Session Limit**: 8 minutes default

### Pricing

| Type | Rate |
|------|------|
| **Audio Input** | ~$0.02/minute |
| **Audio Output** | ~$0.08/minute |

**Note**: Pricing is competitive with alternatives, especially for AWS customers.

### Language Support

- English (original)
- Spanish (June 2025)
- French, Italian, German (July 2025)
- Portuguese, Hindi (Nova 2 Sonic - December 2025)

### Code Example (Python with Boto3)

```python
import boto3
import asyncio

bedrock_runtime = boto3.client(
    service_name="bedrock-runtime",
    region_name="us-east-1"
)

async def nova_sonic_conversation():
    response = bedrock_runtime.invoke_model_with_bidirectional_stream(
        modelId="amazon.nova-2-sonic-v1:0",
        body={
            "config": {
                "systemPrompt": """You are analyzing a sales meeting.
                    Provide brief, actionable suggestions when you notice
                    opportunities or potential objections.""",
                "voiceConfig": {
                    "voiceId": "matthew",  # or "joanna", etc.
                },
            }
        }
    )

    stream = response['body']

    # Send audio
    async def send_audio(audio_chunk):
        await stream.send({
            "event": "audioInput",
            "audio": audio_chunk  # Base64 encoded
        })

    # Receive responses
    async for event in stream:
        if event.get("type") == "textResponse":
            print("Suggestion:", event["text"])
        elif event.get("type") == "audioResponse":
            # Play audio if needed
            pass

    return stream
```

### Continuous Listening Support

**YES** - Bidirectional streaming design:
- Persistent HTTP/2 connection
- Handles interruptions gracefully
- Maintains context through conversation
- 8-minute session limit

### Limitations

- AWS-only (requires Bedrock access)
- HTTP/2 based (not standard WebSocket)
- 8-minute session limit
- Fewer integrations than OpenAI/Google

### Resources

- [Nova Sonic Documentation](https://docs.aws.amazon.com/nova/latest/userguide/speech.html)
- [AWS Blog - Nova Sonic Introduction](https://aws.amazon.com/blogs/aws/introducing-amazon-nova-sonic-human-like-voice-conversations-for-generative-ai-applications/)

---

## 4. Deepgram (Speech-to-Text Only)

### Overview

Deepgram provides industry-leading real-time speech-to-text transcription. While not an LLM, it's excellent for the transcription layer of a conversation analysis pipeline.

### API Endpoint

```
wss://api.deepgram.com/v1/listen
```

### Audio Format Requirements

| Parameter | Supported Values |
|-----------|-----------------|
| **Formats** | Linear16, FLAC, Mulaw, AMR, Opus, WebM, MP3 |
| **Sample Rates** | 8kHz - 48kHz |
| **Channels** | Mono or Stereo |
| **Encoding** | Raw bytes over WebSocket |

### Key Features

- **Nova-3 Model**: State-of-the-art accuracy
- **Interim Results**: Results within 150ms
- **Speaker Diarization**: Identify different speakers
- **Punctuation**: Automatic punctuation
- **Custom Vocabulary**: Boost specific terms
- **Entity Detection**: Names, numbers, etc.

### Pricing

| Plan | Rate |
|------|------|
| **Pay-as-you-go** | $0.0043/min (~$4.30/1000 min) |
| **Growth** | $0.0036/min (~$3.60/1000 min) |
| **Enterprise** | Custom |

**Streaming Premium**: 79% more than batch (~$0.0077/min)

### Latency

- First word: < 300ms
- Interim results: ~150ms
- Final results: ~300ms P50

### Code Example (JavaScript)

```javascript
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

async function startTranscription() {
  const connection = deepgram.listen.live({
    model: "nova-3",
    language: "en-US",
    punctuate: true,
    interim_results: true,
    utterance_end_ms: 1000,
    vad_events: true,
    diarize: true,  // Speaker identification
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const transcript = data.channel.alternatives[0].transcript;

    if (data.is_final && transcript) {
      console.log("Final:", transcript);
      // Send to LLM for analysis
      analyzeWithLLM(transcript);
    } else if (transcript) {
      console.log("Interim:", transcript);
    }
  });

  connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
    console.log("Speaker finished");
  });

  // Send audio chunks
  function sendAudio(audioBuffer) {
    connection.send(audioBuffer);
  }

  return { connection, sendAudio };
}

// Pair with Claude/GPT for analysis
async function analyzeWithLLM(transcript) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 150,
    system: `You are a sales coach. Analyze conversation snippets and provide brief, actionable suggestions.`,
    messages: [{ role: "user", content: transcript }],
  });

  if (response.content[0].text) {
    displaySuggestion(response.content[0].text);
  }
}
```

### Continuous Listening Support

**YES** - Designed for continuous streaming:
- Persistent WebSocket connection
- Up to 500 concurrent streams by default
- Automatic scaling available

### Limitations

- Speech-to-text only (no LLM reasoning)
- Requires separate LLM for analysis
- Higher latency for full analysis pipeline

### Resources

- [Deepgram Streaming API](https://developers.deepgram.com/docs/live-streaming-audio)
- [Pricing](https://deepgram.com/pricing)

---

## 5. Ultravox (Open Source / API)

### Overview

Ultravox is a multimodal LLM that understands speech directly without separate ASR. It's available as open source or via hosted API.

### API Endpoint

**Hosted API**:
```
wss://api.ultravox.ai/v1/calls
```

**Self-hosted**: Deploy on your infrastructure

### Audio Format

| Parameter | Value |
|-----------|-------|
| **Format** | PCM16, Opus |
| **Sample Rate** | 16kHz recommended |

### Key Features

- **Direct Speech Understanding**: No separate ASR stage
- **Ultra-low Latency**: ~150ms response time
- **Open Source**: Based on Llama 3, Mistral, or Gemma
- **BYOK (Bring Your Own Key)**: Use your TTS provider
- **Framework Integration**: Pipecat, LiveKit

### Pricing

- **Hosted API**: Contact for pricing
- **Self-hosted**: Free (compute costs only)
- **GPU Requirements**: A100-40GB or equivalent

### Latency

- Response time: ~150ms
- Token rate: 50-100 tokens/second on A100

### Code Example (Python)

```python
import ultravox

client = ultravox.UltravoxClient(api_key="YOUR_API_KEY")

async def start_call():
    call = await client.calls.create(
        system_prompt="""You are analyzing a sales meeting.
            Provide helpful suggestions when you notice opportunities.""",
        voice="eleven_labs:rachel",
        model="ultravox-8b",
    )

    async def send_audio(audio_bytes):
        await call.send_audio(audio_bytes)

    async for event in call.events():
        if event.type == "transcript":
            print("AI:", event.text)

    return call
```

### Continuous Listening Support

**YES** - WebSocket-based streaming:
- Persistent connection
- Real-time speech-to-speech
- Interrupt support

### Limitations

- Smaller community than OpenAI/Google
- Self-hosted requires significant compute
- Less enterprise support

### Resources

- [Ultravox API Docs](https://docs.ultravox.ai/)
- [GitHub Repository](https://github.com/fixie-ai/ultravox)

---

## 6. ElevenLabs Conversational AI

### Overview

ElevenLabs offers an end-to-end conversational AI platform combining STT, LLM orchestration, and TTS with ultra-low latency.

### Key Features

- **Flash v2.5**: 75ms latency TTS
- **Scribe v2 Realtime**: 150ms STT
- **90+ Languages**: Multilingual support
- **Knowledge Base**: Custom data integration
- **Analytics**: Call monitoring and insights

### Pricing

- Credit-based system
- ~15 minutes of AI agent time per 10,000 credits
- Business plan: $1,320/month for 13,750 min conversational AI
- Note: LLM costs currently absorbed but will be passed on

### Latency

- TTS: 75ms (Flash v2.5)
- STT: 150ms (Scribe v2)

### Limitations

- Primarily TTS-focused
- Higher cost for voice-heavy usage
- LLM costs may increase

### Resources

- [ElevenLabs API](https://elevenlabs.io/developers)
- [Pricing](https://elevenlabs.io/pricing/api)

---

## 7. AssemblyAI Universal-Streaming

### Overview

AssemblyAI's Universal-Streaming offers best-in-class real-time transcription with low latency and simple pricing.

### API Endpoint

```
wss://api.assemblyai.com/v2/realtime/ws
```

### Pricing

- **$0.15/hour** session duration
- Pay for session time, not audio length
- Volume discounts available

### Latency

- P50: ~300ms
- Almost 2x faster than Deepgram Nova-3 on P99

### Key Features

- Immutable final transcripts (no mid-stream revisions)
- Intelligent endpointing
- Word-level timestamps
- Keyterms prompting
- Unlimited concurrent streams

### Resources

- [Universal-Streaming](https://www.assemblyai.com/universal-streaming)
- [Pricing](https://www.assemblyai.com/pricing)

---

## Architecture Recommendations for Chrome Extension

### Option A: Full Speech-to-Speech (Simplest)

Use Gemini Live API or OpenAI Realtime API directly:

```
[Chrome Extension]
    -> Capture audio from tab/mic
    -> WebSocket to backend proxy
    -> [Backend] -> Gemini Live API / OpenAI Realtime
    -> Return suggestions
```

**Pros**: Single integration, native voice understanding
**Cons**: Higher cost, backend proxy required

### Option B: Hybrid Pipeline (Most Flexible)

Use Deepgram/AssemblyAI for STT + Claude/GPT for analysis:

```
[Chrome Extension]
    -> Capture audio from tab/mic
    -> WebSocket to Deepgram
    -> [Deepgram] -> Transcript
    -> [Backend] -> Claude API (analyze)
    -> Return suggestions
```

**Pros**: Best accuracy, flexible LLM choice, cost-effective
**Cons**: Higher latency (~500-800ms total), more integration work

### Option C: Edge Processing (Lowest Latency)

Use Whisper.cpp locally + API for analysis:

```
[Chrome Extension]
    -> Capture audio
    -> Local Whisper transcription
    -> Batch send to Claude
    -> Return suggestions
```

**Pros**: Lowest latency, privacy-friendly
**Cons**: Device resource usage, limited model capability

### Recommended Approach for Meeting Analysis

For a Chrome extension analyzing Google Meet calls:

1. **Capture**: Use Chrome's `tabCapture` API for meeting audio
2. **Transcribe**: Stream to Deepgram (best latency/accuracy/cost)
3. **Analyze**: Send transcripts to Claude Sonnet for suggestions
4. **Display**: Show suggestions in extension sidebar

```javascript
// Simplified architecture
class MeetingAnalyzer {
  constructor() {
    this.deepgram = new DeepgramClient();
    this.claude = new AnthropicClient();
    this.transcriptBuffer = [];
  }

  async start() {
    // Capture tab audio
    const stream = await chrome.tabCapture.capture({ audio: true });

    // Connect to Deepgram
    await this.deepgram.connect({
      onTranscript: (text, isFinal) => {
        if (isFinal) {
          this.transcriptBuffer.push(text);
          this.analyzeIfNeeded();
        }
      }
    });

    // Stream audio
    const processor = new AudioWorkletProcessor(stream);
    processor.onAudioData = (pcm) => this.deepgram.send(pcm);
  }

  async analyzeIfNeeded() {
    // Analyze every few sentences or on pause
    if (this.transcriptBuffer.length >= 3) {
      const context = this.transcriptBuffer.join(" ");
      const suggestion = await this.claude.analyze(context);

      if (suggestion.hasValue) {
        this.displaySuggestion(suggestion.text);
      }

      this.transcriptBuffer = [this.transcriptBuffer.pop()]; // Keep context
    }
  }
}
```

---

## Cost Comparison (10-minute meeting)

| Approach | Estimated Cost |
|----------|---------------|
| OpenAI Realtime (full audio) | $2.00 - $3.00 |
| Gemini Live API | $0.50 - $1.00 |
| Amazon Nova Sonic | $1.00 - $1.50 |
| Deepgram + Claude | $0.10 - $0.25 |
| AssemblyAI + Claude | $0.05 - $0.20 |

---

## Sources

- [Gemini Live API - Google AI](https://ai.google.dev/gemini-api/docs/live)
- [Gemini Live API Reference](https://ai.google.dev/api/live)
- [Vertex AI Live API](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api)
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)
- [OpenAI Realtime WebSocket Guide](https://platform.openai.com/docs/guides/realtime-websocket)
- [OpenAI Pricing](https://platform.openai.com/docs/pricing)
- [Amazon Nova Sonic Documentation](https://docs.aws.amazon.com/nova/latest/userguide/speech.html)
- [Deepgram Streaming API](https://deepgram.com/learn/streaming-speech-recognition-api)
- [Deepgram Pricing](https://deepgram.com/pricing)
- [Ultravox GitHub](https://github.com/fixie-ai/ultravox)
- [Ultravox API Docs](https://docs.ultravox.ai/)
- [ElevenLabs Conversational AI](https://elevenlabs.io/blog/comparing-elevenlabs-conversational-ai-v-openai-realtime-api)
- [AssemblyAI Universal-Streaming](https://www.assemblyai.com/universal-streaming)
- [VideoSDK LLM for Real-Time Voice](https://www.videosdk.live/developer-hub/llm/llm-api-for-real-time-voice)
