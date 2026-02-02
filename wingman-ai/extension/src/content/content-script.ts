/**
 * Content Script - Injected into Google Meet pages
 *
 * Handles:
 * - Overlay UI injection and management
 * - Message routing from background to overlay
 *
 * Audio capture is handled by the offscreen document.
 */

import { AIOverlay } from './overlay';

let overlay: AIOverlay | null = null;
let extensionValid = true;
let overlayDismissedByUser = false;

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
}

/**
 * Handle user closing the overlay (stops the session)
 */
function handleOverlayClose(): void {
  console.log('[ContentScript] User closed overlay, stopping session');
  overlayDismissedByUser = true;

  // Notify background to stop the full session
  try {
    chrome.runtime.sendMessage({ type: 'STOP_SESSION' });
  } catch {
    // Extension context may be invalid
  }
}

/**
 * Ensure overlay container is attached to the document.
 * Google Meet's framework may remove unknown DOM elements during reconciliation.
 */
function ensureOverlayAttached(): void {
  if (!overlay) return;
  if (!overlay.container.isConnected) {
    console.warn('[ContentScript] Overlay was detached from DOM — re-attaching');
    document.documentElement.appendChild(overlay.container);
  }
}

/**
 * Initialize the overlay
 */
function initOverlay(): void {
  if (overlay) {
    // Already initialized — ensure it's attached and visible
    ensureOverlayAttached();
    overlay.forceShow();
    return;
  }

  console.log('[ContentScript] Initializing overlay');
  overlay = new AIOverlay(handleOverlayClose);
  // Append to <html> instead of <body> — less likely to be removed by Google Meet's framework
  document.documentElement.appendChild(overlay.container);
  console.log('[ContentScript] Overlay appended, isConnected:', overlay.container.isConnected);

  // DEBUG: Add a plain DOM diagnostic banner (no shadow DOM) to verify content script can render
  const diag = document.createElement('div');
  diag.id = 'wingman-debug-banner';
  diag.textContent = 'WINGMAN OVERLAY LOADED';
  diag.style.cssText =
    'position:fixed!important;top:0!important;left:50%!important;transform:translateX(-50%)!important;' +
    'z-index:2147483647!important;background:red!important;color:white!important;' +
    'padding:8px 24px!important;font-size:18px!important;font-weight:bold!important;' +
    'border-radius:0 0 8px 8px!important;pointer-events:none!important;font-family:sans-serif!important;';
  document.documentElement.appendChild(diag);
  // Auto-remove after 5 seconds
  setTimeout(() => diag.remove(), 5000);
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
        overlayDismissedByUser = false;
        initOverlay();
        sendResponse({ success: true });
        break;

      case 'transcript':
        console.log('[ContentScript] Transcript data:', message.data);
        if (overlay) {
          ensureOverlayAttached();
          overlay.updateTranscript(message.data);
          sendResponse({ received: true, connected: overlay.container.isConnected });
        } else {
          console.warn('[ContentScript] Overlay not initialized!');
          sendResponse({ received: false, error: 'overlay null' });
        }
        return true;

      case 'suggestion':
        // Map backend response format to overlay's Suggestion interface
        if (message.data) {
          const rawType = message.data.suggestion_type || message.data.question_type || '';
          const suggestionType: 'answer' | 'objection' | 'info' =
            rawType === 'answer' || rawType === 'technical' ? 'answer' :
            rawType === 'objection' || rawType === 'comparison' ? 'objection' : 'info';
          const suggestion = {
            type: suggestionType,
            text: message.data.response || message.data.text || 'No suggestion available',
            question: message.data.question,
            confidence: message.data.confidence,
            timestamp: message.data.timestamp ? new Date(message.data.timestamp).getTime() : Date.now(),
            kbSource: message.data.kbSource as string | undefined,
          };
          console.log('[ContentScript] Adding suggestion:', suggestion.text.substring(0, 50) + '...');
          overlay?.addSuggestion(suggestion);
          sendResponse({ received: true });
        }
        return true;

      case 'HIDE_OVERLAY':
        overlay?.hide();
        break;

      case 'SHOW_OVERLAY':
        overlay?.show();
        break;

      case 'summary_loading':
        if (!overlayDismissedByUser && overlay) {
          overlay.showLoading();
        }
        break;

      case 'call_summary':
        if (!overlayDismissedByUser && overlay) {
          overlay.showSummary(message.data);
        }
        break;

      case 'summary_error':
        if (!overlayDismissedByUser && overlay) {
          overlay.showSummaryError(message.data.message);
        }
        break;

      case 'drive_save_result':
        if (overlay) {
          overlay.updateDriveStatus(message.data);
        }
        break;

      default:
        // Ignore messages not meant for content script (e.g., AUDIO_CHUNK, CAPTURE_STATUS)
        break;
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
