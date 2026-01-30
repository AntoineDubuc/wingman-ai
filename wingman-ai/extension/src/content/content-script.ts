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
let audioWorkletNode: AudioWorkletNode | null = null;
let isCapturingMic = false;
let extensionValid = true;

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
 * Start microphone capture using AudioWorklet (modern API)
 */
async function startMicCapture(): Promise<void> {
  if (isCapturingMic) return;

  try {
    console.log('[ContentScript] Starting microphone capture (AudioWorklet)');

    // Get microphone - DON'T specify sampleRate (Mac mics don't support 16kHz)
    // We'll resample in the worklet
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

    // Use device's native sample rate
    const deviceSampleRate = settings.sampleRate || 48000;
    console.log('[ContentScript] Device sample rate:', deviceSampleRate);

    // Create AudioContext at device's native rate
    audioContext = new AudioContext({ sampleRate: deviceSampleRate });
    console.log('[ContentScript] AudioContext created, state:', audioContext.state, 'sampleRate:', audioContext.sampleRate);

    // Resume AudioContext if suspended (Chrome autoplay policy)
    if (audioContext.state === 'suspended') {
      console.log('[ContentScript] AudioContext suspended, resuming...');
      await audioContext.resume();
      console.log('[ContentScript] AudioContext resumed, state:', audioContext.state);
    }

    // Load AudioWorklet module
    const workletUrl = chrome.runtime.getURL('src/content/audio-processor.worklet.js');
    console.log('[ContentScript] Loading AudioWorklet from:', workletUrl);
    await audioContext.audioWorklet.addModule(workletUrl);
    console.log('[ContentScript] AudioWorklet module loaded');

    const source = audioContext.createMediaStreamSource(mediaStream);

    // Create AudioWorkletNode with sample rate info
    audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,  // Handle stereo mics
      processorOptions: {
        sampleRate: audioContext.sampleRate
      }
    });

    // Handle messages from the worklet
    audioWorkletNode.port.onmessage = (event) => {
      // Check if extension context is still valid
      if (!extensionValid || !isExtensionValid()) {
        handleExtensionInvalidated();
        return;
      }

      const { type, pcmData, chunkCount, maxAmplitude } = event.data;

      if (type === 'audio') {
        // Log audio level every 10 chunks
        if (chunkCount % 10 === 0) {
          // Calculate RMS for debugging
          let sumSq = 0;
          for (let i = 0; i < pcmData.length; i++) {
            const val = pcmData[i] ?? 0;
            sumSq += val * val;
          }
          const rms = Math.sqrt(sumSq / pcmData.length);
          const trackState = track ? `enabled=${track.enabled},muted=${track.muted},state=${track.readyState}` : 'NO_TRACK';
          console.log(`[ContentScript] Audio #${chunkCount}: amp=${maxAmplitude.toFixed(4)}, RMS=${rms.toFixed(0)}, ${trackState}`);
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
      }
    };

    // Connect the audio graph
    source.connect(audioWorkletNode);
    // Note: We don't connect to destination since we only need to process, not play back

    isCapturingMic = true;
    console.log('[ContentScript] Microphone capture started (AudioWorklet)');
  } catch (error) {
    console.error('[ContentScript] Failed to start mic capture:', error);
  }
}

/**
 * Stop microphone capture
 */
function stopMicCapture(): void {
  console.log('[ContentScript] Stopping microphone capture');

  if (audioWorkletNode) {
    audioWorkletNode.disconnect();
    audioWorkletNode = null;
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
        console.log('[ContentScript] Transcript data:', message.data);
        if (overlay) {
          overlay.updateTranscript(message.data);
        } else {
          console.warn('[ContentScript] Overlay not initialized!');
        }
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
