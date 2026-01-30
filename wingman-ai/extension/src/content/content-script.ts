/**
 * Content Script - Injected into Google Meet pages
 *
 * Handles:
 * - Overlay UI injection and management
 * - Message routing from background to overlay
 * - Microphone capture (runs in page context with mic permission)
 */

import { AIOverlay } from './overlay';

let overlay: AIOverlay | null = null;
let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let scriptProcessor: ScriptProcessorNode | null = null;
let isCapturingMic = false;
let extensionValid = true;

const TARGET_SAMPLE_RATE = 16000;  // What Deepgram expects
const BUFFER_SIZE = 4096;

/**
 * Simple linear interpolation resampling
 * Downsamples from sourceSampleRate to targetSampleRate
 */
function resample(inputData: Float32Array, sourceSampleRate: number, targetSampleRate: number): Float32Array {
  if (sourceSampleRate === targetSampleRate) {
    return inputData;
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const outputLength = Math.floor(inputData.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1);
    const fraction = srcIndex - srcIndexFloor;

    // Linear interpolation
    const sample1 = inputData[srcIndexFloor] ?? 0;
    const sample2 = inputData[srcIndexCeil] ?? 0;
    output[i] = sample1 + fraction * (sample2 - sample1);
  }

  return output;
}

/**
 * Check if extension context is still valid
 */
function isExtensionValid(): boolean {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}

/**
 * Mark extension as invalid and clean up
 */
function handleExtensionInvalidated(): void {
  if (!extensionValid) return;
  extensionValid = false;
  console.log('[ContentScript] Extension context invalidated, cleaning up');
  stopMicCapture();
}

/**
 * Start microphone capture
 */
async function startMicCapture(): Promise<void> {
  if (isCapturingMic) return;

  try {
    console.log('[ContentScript] Starting microphone capture');

    // Get microphone - DON'T specify sampleRate (Mac mics don't support 16kHz)
    // We'll resample later if needed
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,  // Don't process - we want raw audio
        noiseSuppression: false,
        autoGainControl: true,    // Help with quiet mics
        channelCount: 1,
      },
      video: false,
    });

    console.log('[ContentScript] Got microphone stream, tracks:', mediaStream.getAudioTracks().length);
    const track = mediaStream.getAudioTracks()[0];
    if (!track) {
      console.error('[ContentScript] No audio track available!');
      return;
    }

    const settings = track.getSettings();
    console.log('[ContentScript] Track settings:', JSON.stringify(settings));
    console.log('[ContentScript] Track enabled:', track.enabled, 'muted:', track.muted, 'readyState:', track.readyState);

    // Monitor track state changes
    track.addEventListener('mute', () => {
      console.warn('[ContentScript] ⚠️ Track MUTED by external source!');
    });
    track.addEventListener('unmute', () => {
      console.log('[ContentScript] Track unmuted');
    });
    track.addEventListener('ended', () => {
      console.warn('[ContentScript] ⚠️ Track ENDED! Another app may have taken the mic.');
    });

    // Use device's native sample rate, not forced 16kHz
    // The backend can handle resampling or we resample here
    const deviceSampleRate = settings.sampleRate || 48000;
    console.log('[ContentScript] Device sample rate:', deviceSampleRate);

    // Create AudioContext at device's native rate to avoid issues
    audioContext = new AudioContext({ sampleRate: deviceSampleRate });
    console.log('[ContentScript] AudioContext created, state:', audioContext.state, 'sampleRate:', audioContext.sampleRate);

    // Resume AudioContext if suspended (Chrome autoplay policy)
    if (audioContext.state === 'suspended') {
      console.log('[ContentScript] AudioContext suspended, resuming...');
      await audioContext.resume();
      console.log('[ContentScript] AudioContext resumed, state:', audioContext.state);
    }

    const source = audioContext.createMediaStreamSource(mediaStream);

    // Use ScriptProcessor for compatibility - request 2 input channels to handle stereo
    const inputChannels = 2;  // Request stereo to handle Mac stereo mics
    scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, inputChannels, 1);
    const actualSampleRate = audioContext.sampleRate;

    let chunkCount = 0;
    scriptProcessor.onaudioprocess = (event) => {
      // Check if extension context is still valid
      if (!extensionValid || !isExtensionValid()) {
        handleExtensionInvalidated();
        return;
      }

      // Get both channels and mix them (handles stereo mics)
      const channel0 = event.inputBuffer.getChannelData(0);
      const channel1 = event.inputBuffer.numberOfChannels > 1
        ? event.inputBuffer.getChannelData(1)
        : channel0;

      // Mix stereo to mono by averaging both channels
      const inputData = new Float32Array(channel0.length);
      for (let i = 0; i < channel0.length; i++) {
        inputData[i] = ((channel0[i] ?? 0) + (channel1[i] ?? 0)) / 2;
      }

      // Calculate max amplitude from both channels for debugging
      let maxCh0 = 0, maxCh1 = 0, maxMixed = 0;
      for (let i = 0; i < channel0.length; i++) {
        maxCh0 = Math.max(maxCh0, Math.abs(channel0[i] ?? 0));
        maxCh1 = Math.max(maxCh1, Math.abs(channel1[i] ?? 0));
        maxMixed = Math.max(maxMixed, Math.abs(inputData[i] ?? 0));
      }

      // Resample to 16kHz for Deepgram
      const resampledData = resample(inputData, actualSampleRate, TARGET_SAMPLE_RATE);

      // Convert Float32 to Int16 PCM
      const pcmData = new Int16Array(resampledData.length);
      for (let i = 0; i < resampledData.length; i++) {
        const sample = Math.max(-1, Math.min(1, resampledData[i] ?? 0));
        pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }

      chunkCount++;
      // Log audio level every 10 chunks
      if (chunkCount % 10 === 0) {
        // Calculate RMS for debugging
        let sumSq = 0;
        for (let i = 0; i < pcmData.length; i++) {
          const val = pcmData[i] ?? 0;
          sumSq += val * val;
        }
        const rms = Math.sqrt(sumSq / pcmData.length);
        // Check track status
        const trackState = track ? `enabled=${track.enabled},muted=${track.muted},state=${track.readyState}` : 'NO_TRACK';
        console.log(`[ContentScript] Audio #${chunkCount}: ch0=${maxCh0.toFixed(4)}, ch1=${maxCh1.toFixed(4)}, mixed=${maxMixed.toFixed(4)}, RMS=${rms.toFixed(0)}, ${trackState}`);
      }

      // Send to background script with error handling
      try {
        chrome.runtime.sendMessage({
          type: 'AUDIO_CHUNK',
          data: Array.from(pcmData),
          timestamp: Date.now(),
        });
      } catch {
        handleExtensionInvalidated();
      }
    };

    source.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    isCapturingMic = true;
    console.log('[ContentScript] Microphone capture started');
  } catch (error) {
    console.error('[ContentScript] Failed to start mic capture:', error);
  }
}

/**
 * Stop microphone capture
 */
function stopMicCapture(): void {
  console.log('[ContentScript] Stopping microphone capture');

  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  isCapturingMic = false;
}

/**
 * Handle user closing the overlay (stops the session)
 */
function handleOverlayClose(): void {
  console.log('[ContentScript] User closed overlay, stopping session');
  stopMicCapture();

  // Notify background to stop the full session
  try {
    chrome.runtime.sendMessage({ type: 'STOP_SESSION' });
  } catch {
    // Extension context may be invalid
  }
}

/**
 * Initialize the overlay
 */
function initOverlay(): void {
  if (overlay) {
    // Already initialized, just show it
    overlay.show();
    return;
  }

  console.log('[ContentScript] Initializing overlay');
  overlay = new AIOverlay(handleOverlayClose);
  document.body.appendChild(overlay.container);
}

/**
 * Handle messages from background script
 */
try {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // Check extension validity on each message
    if (!extensionValid || !isExtensionValid()) {
      handleExtensionInvalidated();
      return false;
    }

    console.log('[ContentScript] Received message:', message.type);

    switch (message.type) {
      case 'INIT_OVERLAY':
        initOverlay();
        sendResponse({ success: true });
        break;

      case 'START_MIC_CAPTURE':
        console.log('[ContentScript] Starting mic capture...');
        startMicCapture()
          .then(() => {
            console.log('[ContentScript] Mic capture started successfully');
            sendResponse({ success: true });
          })
          .catch((err) => {
            console.error('[ContentScript] Mic capture failed:', err);
            sendResponse({ success: false, error: String(err) });
          });
        return true; // Keep channel open for async

      case 'STOP_MIC_CAPTURE':
        stopMicCapture();
        sendResponse({ success: true });
        break;

      case 'transcript':
        overlay?.updateTranscript(message.data);
        break;

      case 'suggestion':
        // Map backend response format to overlay's Suggestion interface
        if (message.data) {
          const suggestionType: 'answer' | 'objection' | 'info' =
            message.data.question_type === 'technical' ? 'answer' :
            message.data.question_type === 'comparison' ? 'objection' : 'info';
          const suggestion = {
            type: suggestionType,
            text: message.data.response || message.data.text || 'No suggestion available',
            question: message.data.question,
            confidence: message.data.confidence,
            timestamp: message.data.timestamp ? new Date(message.data.timestamp).getTime() : Date.now(),
          };
          console.log('[ContentScript] Adding suggestion:', suggestion.text.substring(0, 50) + '...');
          overlay?.addSuggestion(suggestion);
        }
        break;

      case 'HIDE_OVERLAY':
        overlay?.hide();
        stopMicCapture(); // Stop capture when hiding
        break;

      case 'SHOW_OVERLAY':
        overlay?.show();
        break;

      default:
        console.warn('[ContentScript] Unknown message type:', message.type);
    }

    return false;
  });
} catch {
  console.log('[ContentScript] Failed to register message listener - extension may be reloading');
}

// Auto-initialize on Google Meet pages
if (window.location.hostname === 'meet.google.com') {
  // Wait for page to fully load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (isExtensionValid()) initOverlay();
    });
  } else {
    if (isExtensionValid()) initOverlay();
  }
}

export {};
