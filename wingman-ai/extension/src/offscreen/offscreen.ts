/**
 * Offscreen Document - Audio Processing
 *
 * Handles audio capture and processing in a separate context.
 * Required for Manifest V3 since service workers don't have access to Web Audio API.
 *
 * Uses AudioWorklet for efficient, low-latency audio processing.
 * Falls back to ScriptProcessorNode if AudioWorklet is unavailable.
 */

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let micStream: MediaStream | null = null;
let tabStream: MediaStream | null = null;
let audioWorklet: AudioWorkletNode | null = null;
let scriptProcessor: ScriptProcessorNode | null = null;
let isCapturing = false;

const SAMPLE_RATE = 16000; // Deepgram optimal sample rate
const BUFFER_SIZE = 4096; // ~256ms of audio at 16kHz

/**
 * Start audio capture from microphone (captures user's voice)
 */
async function startMicrophoneCapture(): Promise<void> {
  if (isCapturing) {
    console.warn('[Offscreen] Already capturing audio');
    return;
  }

  try {
    console.log('[Offscreen] Starting microphone capture');

    // Get media stream from microphone
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    console.log('[Offscreen] Got microphone stream, tracks:', mediaStream.getAudioTracks().length);

    // Create audio context with target sample rate
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = audioContext.createMediaStreamSource(mediaStream);

    // Try AudioWorklet first (preferred), fallback to ScriptProcessor
    try {
      await setupAudioWorklet(source);
    } catch (workletError) {
      console.warn('[Offscreen] AudioWorklet failed, using ScriptProcessor fallback:', workletError);
      setupScriptProcessor(source);
    }

    isCapturing = true;

    // Notify service worker that capture has started
    chrome.runtime.sendMessage({
      type: 'CAPTURE_STATUS',
      status: 'started',
      sampleRate: SAMPLE_RATE,
    });

    console.log('[Offscreen] Microphone capture started successfully');
  } catch (error) {
    console.error('[Offscreen] Failed to start microphone capture:', error);
    cleanup();
    throw error;
  }
}

/**
 * Start audio capture from tab (captures other participants)
 */
async function startTabCapture(streamId: string): Promise<void> {
  if (isCapturing) {
    console.warn('[Offscreen] Already capturing audio');
    return;
  }

  try {
    console.log('[Offscreen] Starting tab capture with streamId:', streamId.substring(0, 20) + '...');

    // Get media stream from tab capture
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // @ts-expect-error - Chrome-specific constraints for tab capture
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });

    console.log('[Offscreen] Got tab media stream, tracks:', mediaStream.getAudioTracks().length);

    // Create audio context with target sample rate
    audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = audioContext.createMediaStreamSource(mediaStream);

    // Try AudioWorklet first (preferred), fallback to ScriptProcessor
    try {
      await setupAudioWorklet(source);
    } catch (workletError) {
      console.warn('[Offscreen] AudioWorklet failed, using ScriptProcessor fallback:', workletError);
      setupScriptProcessor(source);
    }

    isCapturing = true;

    // Notify service worker that capture has started
    chrome.runtime.sendMessage({
      type: 'CAPTURE_STATUS',
      status: 'started',
      sampleRate: SAMPLE_RATE,
    });

    console.log('[Offscreen] Tab capture started successfully');
  } catch (error) {
    console.error('[Offscreen] Failed to start tab capture:', error);
    cleanup();
    throw error;
  }
}

/**
 * Start dual capture: microphone (user) + tab audio (participants) merged into stereo.
 *
 * Produces interleaved stereo Int16 PCM via the stereo AudioWorklet.
 * Channel 0 = mic (user), Channel 1 = tab (participants).
 */
async function startDualCapture(streamId: string): Promise<void> {
  if (isCapturing) {
    console.warn('[Offscreen] Already capturing audio');
    return;
  }

  try {
    console.log('[Offscreen] Starting dual capture (mic + tab)');

    // 1. Get microphone stream
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });
    console.log('[Offscreen] Got microphone stream');

    // 2. Get tab audio stream
    tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // @ts-expect-error - Chrome-specific constraints for tab capture
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });
    console.log('[Offscreen] Got tab audio stream');

    // 3. Create AudioContext at mic's native sample rate
    const micTrack = micStream.getAudioTracks()[0];
    const nativeSampleRate = micTrack?.getSettings().sampleRate || 48000;
    audioContext = new AudioContext({ sampleRate: nativeSampleRate });
    console.log(`[Offscreen] AudioContext created at ${audioContext.sampleRate}Hz`);

    // Defensive resume — offscreen AudioContexts may start suspended
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
      console.log('[Offscreen] AudioContext resumed from suspended state');
    }

    // 4. Build audio graph: mic + tab → ChannelMerger → stereo AudioWorklet
    const micSource = audioContext.createMediaStreamSource(micStream);
    const tabSource = audioContext.createMediaStreamSource(tabStream);
    const merger = audioContext.createChannelMerger(2);

    micSource.connect(merger, 0, 0); // mic → merger channel 0
    tabSource.connect(merger, 0, 1); // tab → merger channel 1

    // 5. Load and connect stereo AudioWorklet
    await audioContext.audioWorklet.addModule(
      chrome.runtime.getURL('src/offscreen/audio-processor.js')
    );

    audioWorklet = new AudioWorkletNode(audioContext, 'audio-processor', {
      channelCount: 2,
      channelCountMode: 'explicit',
      processorOptions: { sampleRate: audioContext.sampleRate },
    });

    audioWorklet.port.onmessage = (event) => {
      if (event.data.type === 'audio') {
        sendAudioChunk(event.data.audioData);
      }
    };

    merger.connect(audioWorklet);

    isCapturing = true;

    // 6. Notify service worker
    chrome.runtime.sendMessage({
      type: 'CAPTURE_STATUS',
      status: 'started',
      sampleRate: SAMPLE_RATE,
    });

    console.log('[Offscreen] Dual capture started successfully (stereo)');
  } catch (error) {
    console.error('[Offscreen] Failed to start dual capture:', error);
    // Notify service worker of failure
    chrome.runtime.sendMessage({
      type: 'CAPTURE_STATUS',
      status: 'stopped',
    });
    cleanup();
    throw error;
  }
}

/**
 * Setup AudioWorklet for audio processing (preferred method)
 */
async function setupAudioWorklet(source: MediaStreamAudioSourceNode): Promise<void> {
  if (!audioContext) throw new Error('AudioContext not initialized');

  // Load the AudioWorklet processor module
  await audioContext.audioWorklet.addModule(
    chrome.runtime.getURL('src/offscreen/audio-processor.js')
  );

  audioWorklet = new AudioWorkletNode(audioContext, 'audio-processor');

  audioWorklet.port.onmessage = (event) => {
    if (event.data.type === 'audio') {
      sendAudioChunk(event.data.audioData);
    }
  };

  // Connect source -> worklet (don't connect to destination to avoid feedback)
  source.connect(audioWorklet);

  console.log('[Offscreen] AudioWorklet setup complete');
}

/**
 * Setup ScriptProcessorNode fallback (deprecated but widely supported)
 */
function setupScriptProcessor(source: MediaStreamAudioSourceNode): void {
  if (!audioContext) throw new Error('AudioContext not initialized');

  // Create ScriptProcessorNode
  // Note: This is deprecated but needed for fallback
  scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

  scriptProcessor.onaudioprocess = (event) => {
    const inputData = event.inputBuffer.getChannelData(0);
    const pcmData = convertToPCM(inputData);
    sendAudioChunk(Array.from(pcmData));
  };

  // Connect source -> processor -> destination (required for ScriptProcessor to work)
  source.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);

  console.log('[Offscreen] ScriptProcessor setup complete');
}

/**
 * Convert Float32 audio data to Int16 PCM
 */
function convertToPCM(float32Array: Float32Array): Int16Array {
  const pcmData = new Int16Array(float32Array.length);

  for (let i = 0; i < float32Array.length; i++) {
    // Clamp to valid range [-1, 1]
    const rawSample = float32Array[i] ?? 0;
    const sample = Math.max(-1, Math.min(1, rawSample));
    // Convert to Int16 range [-32768, 32767]
    pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return pcmData;
}

/**
 * Send audio chunk to service worker
 */
let audioChunkCount = 0;
function sendAudioChunk(audioData: number[]): void {
  audioChunkCount++;

  // Calculate audio level (RMS) every 10 chunks for debugging
  if (audioChunkCount % 10 === 0) {
    let sumSquares = 0;
    let maxAbs = 0;
    for (const sample of audioData) {
      sumSquares += sample * sample;
      maxAbs = Math.max(maxAbs, Math.abs(sample));
    }
    const rms = Math.sqrt(sumSquares / audioData.length);
    console.log(`[Offscreen] Audio chunk #${audioChunkCount}: RMS=${rms.toFixed(0)}, Max=${maxAbs}, Samples=${audioData.length}`);
  }

  chrome.runtime.sendMessage({
    type: 'AUDIO_CHUNK',
    data: audioData,
    timestamp: Date.now(),
  });
}

/**
 * Stop audio capture and cleanup resources
 */
function stopAudioCapture(): void {
  console.log('[Offscreen] Stopping audio capture');
  cleanup();

  // Notify service worker
  chrome.runtime.sendMessage({
    type: 'CAPTURE_STATUS',
    status: 'stopped',
  });

  console.log('[Offscreen] Audio capture stopped');
}

/**
 * Cleanup all audio resources
 */
function cleanup(): void {
  if (audioWorklet) {
    audioWorklet.port.close();
    audioWorklet.disconnect();
    audioWorklet = null;
  }

  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }

  if (audioContext) {
    audioContext.close().catch(console.error);
    audioContext = null;
  }

  // Stop all media streams (mono or dual capture)
  for (const stream of [mediaStream, micStream, tabStream]) {
    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop();
        console.log('[Offscreen] Stopped track:', track.label);
      });
    }
  }
  mediaStream = null;
  micStream = null;
  tabStream = null;

  isCapturing = false;
}

/**
 * Handle messages from service worker
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Offscreen] Received message:', message.type);

  switch (message.type) {
    case 'START_MIC_CAPTURE':
      startMicrophoneCapture()
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: String(error) }));
      return true; // Keep channel open for async response

    case 'START_DUAL_CAPTURE':
      startDualCapture(message.streamId)
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: String(error) }));
      return true; // Keep channel open for async response

    case 'START_AUDIO_CAPTURE':
    case 'START_TAB_CAPTURE':
      startTabCapture(message.streamId)
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: String(error) }));
      return true; // Keep channel open for async response

    case 'STOP_AUDIO_CAPTURE':
      stopAudioCapture();
      sendResponse({ success: true });
      return false;

    case 'GET_CAPTURE_STATUS':
      sendResponse({ isCapturing, sampleRate: SAMPLE_RATE });
      return false;

    default:
      return false;
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', cleanup);

export {};
