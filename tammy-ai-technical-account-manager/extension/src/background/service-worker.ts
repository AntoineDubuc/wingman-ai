/**
 * Presales AI Assistant - Background Service Worker
 *
 * Handles:
 * - TabCapture stream ID acquisition
 * - WebSocket connection management
 * - Message routing between components
 */

import { WebSocketClient } from './websocket-client';

// Connection manager instance
let wsClient: WebSocketClient | null = null;
let isCapturing = false;
let activeTabId: number | null = null;

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
    const isStillMeeting = changeInfo.url.startsWith('https://meet.google.com/') &&
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
      handleStartSession(message).then(sendResponse);
      return true; // Keep channel open for async response

    case 'STOP_SESSION':
      handleStopSession().then(sendResponse);
      return true;

    case 'GET_STATUS':
      sendResponse({
        isConnected: wsClient?.isConnected ?? false,
        isCapturing,
        activeTabId,
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
      // Forward audio chunk to WebSocket
      wsClient?.sendAudioChunk(message.data);
      return false;

    default:
      console.warn('[ServiceWorker] Unknown message type:', message.type);
      return false;
  }
});

/**
 * Start a capture session
 */
async function handleStartSession(message: { backendUrl?: string }): Promise<{ success: boolean; error?: string }> {
  try {
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

    // Initialize WebSocket connection
    const backendUrl = message.backendUrl || 'ws://localhost:8000/ws/session';
    wsClient = new WebSocketClient(backendUrl);
    await wsClient.connect();

    // Ensure content script is injected and initialize overlay
    await ensureContentScriptAndInitOverlay(tab.id);

    // Start microphone capture via content script (has page mic permission)
    console.log('[ServiceWorker] Sending START_MIC_CAPTURE to content script');
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'START_MIC_CAPTURE' });
      console.log('[ServiceWorker] START_MIC_CAPTURE response:', response);
      if (response?.success) {
        isCapturing = true;
      }
    } catch (e) {
      console.error('[ServiceWorker] START_MIC_CAPTURE failed:', e);
      // Don't fail the session - WebSocket is connected, mic might work later
    }

    activeTabId = tab.id;
    return { success: true };
  } catch (error) {
    console.error('[ServiceWorker] Failed to start session:', error);
    return { success: false, error: String(error) };
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

    // Disconnect WebSocket
    wsClient?.disconnect();
    wsClient = null;

    // Reset state
    isCapturing = false;
    activeTabId = null;

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
