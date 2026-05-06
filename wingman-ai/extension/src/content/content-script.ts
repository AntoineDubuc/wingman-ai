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
import { removeDockMargin } from './overlay/margin-injector';
import { transcriptBuffer } from './overlay/transcript-buffer';
import { handleTranscriptMessage } from './overlay/transcript-handler';
import { showTryAgainIfNeeded } from './try-again-locale';
import { languagePreferenceService } from '../services/language-preference';

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
  removeDockMargin();
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
    // Already initialized — ensure it's attached
    ensureOverlayAttached();
    return;
  }

  console.log('[ContentScript] Initializing overlay');
  overlay = new AIOverlay(handleOverlayClose);
  // Append to <html> instead of <body> — less likely to be removed by Google Meet's framework
  document.documentElement.appendChild(overlay.container);
  // Plan 6: load user locale into the overlay (sets shadow-host lang + i18n instance).
  // Fire-and-forget; the synchronous English default keeps the first paint from blocking.
  void overlay.initLocale();
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
        // Activate session-state UI (status bar + pill toggle + timer) on session start
        overlay?.forceShow();
        sendResponse({ success: true });
        break;

      case 'transcript':
        console.log('[ContentScript] Transcript data:', message.data);
        if (overlay) {
          ensureOverlayAttached();
          // Handler validates the 5-field shape at the boundary, then calls
          // overlay.updateTranscript FIRST and transcriptBuffer.append SECOND
          // so a buffer throw cannot block rendering.
          handleTranscriptMessage(message.data, overlay, transcriptBuffer);
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
            // Hydra: pass through persona attribution (array of {id, name, color, icon?})
            personas: message.data.personas as Array<{ id: string; name: string; color: string; icon?: string }> | undefined,
          };
          console.log('[ContentScript] Adding suggestion:', suggestion.text.substring(0, 50) + '...');
          overlay?.addSuggestion(suggestion);

          // F5-T1: Show Try Again button if suggestion is in wrong language
          if (overlay) {
            const lastBubble = overlay.getLastSuggestionBubble();
            if (lastBubble) {
              languagePreferenceService.getLanguage().then(locale => {
                try {
                  showTryAgainIfNeeded(suggestion.text, locale, lastBubble);
                } catch {
                  // Non-fatal — button simply won't show
                }
              }).catch(() => {
                // getLanguage failure must not block suggestion rendering
              });
            }
          }

          sendResponse({ received: true });
        }
        return true;

      case 'HIDE_OVERLAY':
        if (overlay?.hasTimelineEntries()) {
          // Session ended without summary — reset to timeline view
          overlay.showTimelineView();
        } else {
          overlay?.hide();
        }
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

      case 'cost_update':
        if (overlay && message.data) {
          overlay.updateCost(message.data);
        }
        break;

      case 'emotion_update':
        if (overlay && message.data) {
          overlay.updateEmotion(message.data);
        }
        break;

      case 'emotion_clear':
        if (overlay) {
          overlay.clearEmotion();
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
