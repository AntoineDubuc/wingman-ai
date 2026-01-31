/**
 * Wingman AI - Background Service Worker (BYOK Architecture)
 *
 * Handles:
 * - Direct Deepgram WebSocket connection for speech-to-text
 * - Direct Gemini API calls for AI suggestions
 * - TabCapture and audio routing
 * - Message routing between components
 *
 * Users provide their own Deepgram and Gemini API keys.
 */

import { deepgramClient, Transcript } from '../services/deepgram-client';
import { geminiClient } from '../services/gemini-client';
import { transcriptCollector } from '../services/transcript-collector';
import { runAllTests, runTest, getAvailableTests } from '../validation/index';

// Session state
let isSessionActive = false;
let isCapturing = false;
let activeTabId: number | null = null;

// Speaker filter state
let speakerFilterEnabled = false;

// Extension lifecycle
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[ServiceWorker] Extension installed:', details.reason);
});

// Tab close detection - stop session if active tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    console.log('[ServiceWorker] Active Meet tab closed, stopping session');
    handleStopSession();
  }
});

// Tab URL change detection - stop session if navigating away from Meet
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.url) {
    // Check if URL is no longer a Google Meet meeting
    const isStillMeeting =
      changeInfo.url.startsWith('https://meet.google.com/') &&
      !changeInfo.url.includes('/landing') &&
      changeInfo.url.match(/\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i);

    if (!isStillMeeting) {
      console.log('[ServiceWorker] Left Google Meet meeting, stopping session');
      handleStopSession();
    }
  }
});

// Handle messages from popup, content script, and offscreen document
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[ServiceWorker] Received message:', message.type);

  switch (message.type) {
    case 'START_SESSION':
      handleStartSession().then(sendResponse);
      return true; // Keep channel open for async response

    case 'STOP_SESSION':
      handleStopSession().then(sendResponse);
      return true;

    case 'GET_STATUS':
      sendResponse({
        isConnected: deepgramClient.getIsConnected(),
        isCapturing,
        activeTabId,
        isSessionActive,
      });
      return false;

    case 'CAPTURE_STATUS':
      // Status update from offscreen document
      if (message.status === 'started') {
        isCapturing = true;
      } else if (message.status === 'stopped') {
        isCapturing = false;
      }
      return false;

    case 'AUDIO_CHUNK':
      // Forward audio chunk directly to Deepgram
      if (isSessionActive) {
        deepgramClient.sendAudio(message.data);
      }
      return false;

    case 'RUN_VALIDATION':
      // Run KB technical validation tests
      (async () => {
        if (message.test === 'all') {
          const results = await runAllTests();
          sendResponse({ success: true, results });
        } else if (message.test === 'list') {
          sendResponse({ success: true, tests: getAvailableTests() });
        } else {
          const result = await runTest(message.test);
          sendResponse({ success: true, result });
        }
      })();
      return true; // Keep channel open for async

    default:
      console.warn('[ServiceWorker] Unknown message type:', message.type);
      return false;
  }
});

/**
 * Start a capture session with BYOK (Bring Your Own Keys)
 */
async function handleStartSession(): Promise<{ success: boolean; error?: string }> {
  try {
    // SINGLETON CHECK: If a session is already active, don't start another
    if (isSessionActive && activeTabId !== null) {
      console.log('[ServiceWorker] Session already active, ignoring duplicate start');
      return { success: true };
    }

    // If there's a stale session, clean it up first
    if (isSessionActive) {
      console.log('[ServiceWorker] Cleaning up stale session');
      await deepgramClient.disconnect();
      geminiClient.clearSession();
      isSessionActive = false;
    }

    // Step 1: Validate API keys exist
    const storage = await chrome.storage.local.get([
      'deepgramApiKey',
      'geminiApiKey',
      'systemPrompt',
      'speakerFilterEnabled',
    ]);

    if (!storage.deepgramApiKey) {
      return {
        success: false,
        error: 'Deepgram API key not configured. Go to Options to add your key.',
      };
    }

    if (!storage.geminiApiKey) {
      return {
        success: false,
        error: 'Gemini API key not configured. Go to Options to add your key.',
      };
    }

    // Get active Meet tab
    const [tab] = await chrome.tabs.query({
      active: true,
      url: 'https://meet.google.com/*',
    });

    if (!tab?.id) {
      return { success: false, error: 'No active Google Meet tab found' };
    }

    // Close any existing offscreen documents first
    try {
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      });
      if (existingContexts.length > 0) {
        await chrome.offscreen.closeDocument();
        console.log('[ServiceWorker] Closed existing offscreen document');
      }
    } catch (e) {
      // Ignore errors closing offscreen document
    }

    // Configure speaker filter
    speakerFilterEnabled = storage.speakerFilterEnabled ?? false;
    console.log(`[ServiceWorker] Speaker filter: ${speakerFilterEnabled}`);

    // Step 2: Initialize Gemini client with system prompt
    geminiClient.startSession();
    if (storage.systemPrompt) {
      geminiClient.setSystemPrompt(storage.systemPrompt);
    } else {
      await geminiClient.loadSystemPrompt();
    }
    console.log('[ServiceWorker] Gemini client initialized');

    // Step 3: Set up transcript callback before connecting
    deepgramClient.setTranscriptCallback((transcript: Transcript) => {
      handleTranscript(transcript);
    });

    // Step 4: Connect to Deepgram
    const connected = await deepgramClient.connect();
    if (!connected) {
      return {
        success: false,
        error: 'Failed to connect to Deepgram. Check your API key.',
      };
    }
    console.log('[ServiceWorker] Connected to Deepgram');

    // Mark session as active
    isSessionActive = true;

    // Start transcript collection for auto-save
    transcriptCollector.startSession(speakerFilterEnabled);

    // Ensure content script is injected and initialize overlay
    await ensureContentScriptAndInitOverlay(tab.id);

    // Start microphone capture via content script
    console.log('[ServiceWorker] Sending START_MIC_CAPTURE to content script');
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'START_MIC_CAPTURE' });
      console.log('[ServiceWorker] START_MIC_CAPTURE response:', response);
      if (response?.success) {
        isCapturing = true;
      }
    } catch (e) {
      console.error('[ServiceWorker] START_MIC_CAPTURE failed:', e);
      // Don't fail the session - Deepgram is connected, mic might work later
    }

    activeTabId = tab.id;
    return { success: true };
  } catch (error) {
    console.error('[ServiceWorker] Failed to start session:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Handle transcript from Deepgram and process through Gemini
 */
async function handleTranscript(transcript: Transcript): Promise<void> {
  // Add to transcript collector
  transcriptCollector.addTranscript({
    text: transcript.text,
    speaker: transcript.speaker,
    speaker_id: transcript.speaker_id,
    speaker_role: transcript.speaker_role,
    is_final: transcript.is_final,
    timestamp: transcript.timestamp,
    is_self: false, // BYOK doesn't have self-identification yet
  });

  // Send transcript to content script for display
  if (activeTabId) {
    chrome.tabs
      .sendMessage(activeTabId, {
        type: 'transcript',
        data: transcript,
      })
      .catch(() => {});
  }

  // Apply speaker filter if enabled (only process customer utterances)
  if (speakerFilterEnabled && transcript.speaker_role === 'consultant') {
    console.debug('[ServiceWorker] Skipping consultant transcript (speaker filter)');
    return;
  }

  // Process through Gemini for AI suggestions (only final transcripts)
  if (transcript.is_final) {
    try {
      const suggestion = await geminiClient.processTranscript(
        transcript.text,
        transcript.speaker,
        transcript.is_final
      );

      if (suggestion) {
        // Track suggestion count
        transcriptCollector.incrementSuggestions();

        // Send suggestion to content script for display
        if (activeTabId) {
          chrome.tabs
            .sendMessage(activeTabId, {
              type: 'suggestion',
              data: suggestion,
            })
            .catch(() => {});
        }

        console.log(`[ServiceWorker] Suggestion: ${suggestion.text.slice(0, 50)}...`);
      }
    } catch (error) {
      console.error('[ServiceWorker] Gemini processing error:', error);
    }
  }
}

/**
 * Stop the capture session
 */
async function handleStopSession(): Promise<{ success: boolean }> {
  try {
    // Stop mic capture and hide overlay via content script
    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, { type: 'STOP_MIC_CAPTURE' }).catch(() => {});
      chrome.tabs.sendMessage(activeTabId, { type: 'HIDE_OVERLAY' }).catch(() => {});
    }

    // End transcript collection and auto-save to Drive
    if (transcriptCollector.hasActiveSession()) {
      const saveResult = await transcriptCollector.endSession();
      if (saveResult.saved) {
        console.log('[ServiceWorker] Transcript saved to Drive:', saveResult.fileUrl);
        // Notify user via content script (optional toast)
        if (activeTabId) {
          chrome.tabs
            .sendMessage(activeTabId, {
              type: 'DRIVE_SAVE_RESULT',
              data: saveResult,
            })
            .catch(() => {});
        }
      } else if (saveResult.error) {
        console.log('[ServiceWorker] Transcript save skipped:', saveResult.error);
      }
    }

    // Disconnect Deepgram
    await deepgramClient.disconnect();

    // Clear Gemini session
    geminiClient.clearSession();

    // Reset state
    isSessionActive = false;
    isCapturing = false;
    activeTabId = null;

    console.log('[ServiceWorker] Session stopped');
    return { success: true };
  } catch (error) {
    console.error('[ServiceWorker] Failed to stop session:', error);
    return { success: false };
  }
}

/**
 * Ensure content script is injected and initialize overlay
 */
async function ensureContentScriptAndInitOverlay(tabId: number): Promise<void> {
  try {
    // Try to send message to content script
    await chrome.tabs.sendMessage(tabId, { type: 'INIT_OVERLAY' });
    console.log('[ServiceWorker] Content script responded, overlay initialized');
  } catch (error) {
    // Content script not loaded, inject it
    console.log('[ServiceWorker] Content script not found, injecting...');

    // Inject CSS first
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['src/content/content-styles.css'],
    });

    // Inject JS
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });

    // Wait a moment for script to initialize
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Now send the init message
    await chrome.tabs.sendMessage(tabId, { type: 'INIT_OVERLAY' });
    console.log('[ServiceWorker] Content script injected and overlay initialized');
  }
}

export {};
