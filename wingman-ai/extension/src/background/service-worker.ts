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
import { driveService, type TranscriptData, type SessionMetadata } from '../services/drive-service';
import type { SummaryMetadata, PersonaStats } from '../services/call-summary';
import { runAllTests, runTest, getAvailableTests } from '../validation/index';
import { migrateToPersonas, getActivePersonas } from '../shared/persona';
import { MODEL_STAGGER_MS, PROVIDER_STAGGER_FALLBACK } from '../shared/llm-config';
import { langBuilderClient } from '../services/langbuilder-client';
import { costTracker } from '../services/cost-tracker';
import { humeClient, HumeClient } from '../services/hume-client';
import type { EmotionUpdate } from '../shared/constants';

// Session state
let isSessionActive = false;
let isCapturing = false;
let activeTabId: number | null = null;

// Hydra multi-persona session state
interface SessionPersona {
  id: string;
  name: string;
  color: string;
  systemPrompt: string;
  kbDocumentIds: string[];
  modelPrompts?: Record<string, string>;
}
let sessionPersonas: SessionPersona[] = [];
// Track suggestion counts per persona for summary attribution
const suggestionCountByPersona = new Map<string, number>();

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
  const quietMessages = ['AUDIO_CHUNK', 'GET_STATUS', 'CAPTURE_STATUS'];
  if (!quietMessages.includes(message.type)) {
    console.log('[ServiceWorker] Received:', message.type);
  }

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
      // Forward audio chunk to Deepgram and Hume (if connected)
      if (isSessionActive) {
        deepgramClient.sendAudio(message.data);
        humeClient.sendAudio(message.data); // No-op if not connected
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

    case 'RUN_LANGBUILDER_FLOW':
      (async () => {
        try {
          const storage = await chrome.storage.local.get(['langbuilderUrl', 'langbuilderApiKey', 'langbuilderFlows']);
          if (!storage.langbuilderUrl || !storage.langbuilderApiKey) {
            console.warn('[ServiceWorker] LangBuilder not configured');
            sendResponse({ success: false, error: 'LangBuilder not configured' });
            return;
          }
          // Look up cached inputType for this flow (chat vs text)
          const flows = storage.langbuilderFlows as Array<{ id: string; inputType?: string }> | undefined;
          const flowMeta = flows?.find((f) => f.id === message.flowId);
          const inputType = (flowMeta?.inputType === 'text' ? 'text' : 'chat') as 'chat' | 'text';
          console.log('[ServiceWorker] Running LangBuilder flow:', message.flowId, 'inputType:', inputType);
          const result = await langBuilderClient.runFlow(
            storage.langbuilderUrl as string,
            storage.langbuilderApiKey as string,
            message.flowId as string,
            message.inputValue as string,
            inputType,
          );
          console.log('[ServiceWorker] LangBuilder flow completed, result length:', result.length);
          sendResponse({ success: true, result });
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Flow execution failed';
          console.error('[ServiceWorker] LangBuilder flow error:', msg);
          sendResponse({ success: false, error: msg });

          // Auto-diagnose if the error looks credential-related
          if (/api.?key|401|credential|auth/i.test(msg)) {
            const s = await chrome.storage.local.get(['langbuilderUrl', 'langbuilderApiKey']);
            if (s.langbuilderUrl && s.langbuilderApiKey) {
              langBuilderClient.diagnoseFlow(
                s.langbuilderUrl as string,
                s.langbuilderApiKey as string,
                message.flowId as string,
              ).catch(() => { /* ignore diagnostic errors */ });
            }
          }
        }
      })();
      return true; // Keep channel open for async response

    case 'CANCEL_LANGBUILDER_FLOW':
      langBuilderClient.abort();
      return false;

    case 'MIC_PERMISSION_RESULT':
      // Handled by requestMicPermission() temporary listener
      return false;

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
      costTracker.reset();
      suggestionCountByPersona.clear();
      isSessionActive = false;
    }

    // Step 1: Validate API keys exist
    const storage = await chrome.storage.local.get([
      'deepgramApiKey',
      'geminiApiKey',
      'openrouterApiKey',
      'groqApiKey',
      'llmProvider',
      'speakerFilterEnabled',
    ]);

    if (!storage.deepgramApiKey) {
      return {
        success: false,
        error: 'Deepgram API key not configured. Go to Options to add your key.',
      };
    }

    const provider = (storage.llmProvider as string) || 'gemini';
    const providerKeyMap: Record<string, string | undefined> = {
      gemini: storage.geminiApiKey as string | undefined,
      openrouter: storage.openrouterApiKey as string | undefined,
      groq: storage.groqApiKey as string | undefined,
    };
    const providerLabels: Record<string, string> = {
      gemini: 'Gemini',
      openrouter: 'OpenRouter',
      groq: 'Groq',
    };

    if (!providerKeyMap[provider]) {
      return {
        success: false,
        error: `${providerLabels[provider] ?? provider} API key not configured. Go to Options to add your key.`,
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
        // Closed existing offscreen document
      }
    } catch (e) {
      // Ignore errors closing offscreen document
    }

    // Configure speaker filter
    speakerFilterEnabled = storage.speakerFilterEnabled ?? false;
    console.debug(`[ServiceWorker] Speaker filter: ${speakerFilterEnabled}`);

    // Step 2: Initialize Gemini client with provider config and active persona
    geminiClient.startSession();
    await geminiClient.loadProviderConfig();

    // Start cost tracking for this session
    costTracker.startSession(
      geminiClient.getActiveProvider(),
      geminiClient.getActiveModel()
    );

    // Ensure personas are migrated, then load all active personas (Hydra)
    await migrateToPersonas();
    const personas = await getActivePersonas();

    if (personas.length > 0) {
      // Snapshot personas for session duration
      sessionPersonas = personas.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        systemPrompt: p.systemPrompt,
        kbDocumentIds: p.kbDocumentIds,
        modelPrompts: p.modelPrompts,
      }));

      // Log persona names
      const personaNames = sessionPersonas.map(p => p.name).join(', ');
      console.log(`[ServiceWorker] Hydra: loaded ${sessionPersonas.length} persona(s): ${personaNames}`);

      // For backward compat + single-persona optimization, set the first persona's prompt/KB
      const primary = sessionPersonas[0]!;
      const activeModelId = geminiClient.getActiveModel();
      const modelPrompt = primary.modelPrompts?.[activeModelId];
      geminiClient.setSystemPrompt(modelPrompt ?? primary.systemPrompt);
      console.log(modelPrompt
        ? `[ServiceWorker] Using model-optimized prompt for ${activeModelId}`
        : `[ServiceWorker] Using generic prompt (no model-specific version)`
      );
      geminiClient.setKBDocumentFilter(primary.kbDocumentIds);
    } else {
      // Fallback to legacy system prompt
      sessionPersonas = [];
      await geminiClient.loadSystemPrompt();
    }
    // Gemini client initialized

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
    // Connected to Deepgram

    // Mark session as active
    isSessionActive = true;

    // Step 5: Connect to Hume AI for emotion detection (optional)
    connectHumeIfConfigured(tab.id!);

    // Start transcript collection for auto-save
    transcriptCollector.startSession(speakerFilterEnabled);

    // Start periodic cost updates
    startCostAlarm();

    // Ensure content script is injected and initialize overlay
    await ensureContentScriptAndInitOverlay(tab.id);

    // Create offscreen document for dual audio capture
    try {
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      });
      if (existingContexts.length === 0) {
        await chrome.offscreen.createDocument({
          url: chrome.runtime.getURL('src/offscreen/offscreen.html'),
          reasons: [chrome.offscreen.Reason.USER_MEDIA],
          justification: 'Microphone and tab audio capture for transcription',
        });
        // Created offscreen document
      }
    } catch (e) {
      console.error('[ServiceWorker] Failed to create offscreen document:', e);
      return { success: false, error: 'Failed to create audio capture context' };
    }

    // Get tab capture stream ID
    let streamId: string;
    try {
      streamId = await new Promise<string>((resolve, reject) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(id);
          }
        });
      });
      // Got tab capture stream ID
    } catch (e) {
      console.error('[ServiceWorker] Failed to get tab capture stream:', e);
      return { success: false, error: 'Failed to capture tab audio. Make sure the Meet tab is active.' };
    }

    // Start dual capture (mic + tab) in offscreen document
    try {
      let captureResponse = await chrome.runtime.sendMessage({
        type: 'START_DUAL_CAPTURE',
        streamId,
      }).catch(() => ({ success: false, error: 'Message failed' }));

      // If mic permission was denied (offscreen can't show prompts), open a real window
      if (
        !captureResponse?.success &&
        typeof captureResponse?.error === 'string' &&
        captureResponse.error.includes('NotAllowedError')
      ) {
        console.debug('[ServiceWorker] Mic permission needed, opening permission window');
        const granted = await requestMicPermission();
        if (!granted) {
          return { success: false, error: 'Microphone access is required. Please allow the permission and try again.' };
        }

        // Get fresh tab capture stream ID for retry
        const freshStreamId = await new Promise<string>((resolve, reject) => {
          chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(id);
          });
        });

        captureResponse = await chrome.runtime.sendMessage({
          type: 'START_DUAL_CAPTURE',
          streamId: freshStreamId,
        }).catch(() => ({ success: false, error: 'Message failed' }));
      }

      if (captureResponse?.success) {
        isCapturing = true;
        // Dual capture started
      } else {
        console.error('[ServiceWorker] Dual capture failed:', captureResponse?.error);
        return { success: false, error: captureResponse?.error || 'Failed to start audio capture' };
      }
    } catch (e) {
      console.error('[ServiceWorker] START_DUAL_CAPTURE failed:', e);
      return { success: false, error: 'Failed to start audio capture' };
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
    is_self: transcript.is_self,
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
      // Hydra: parallel pipeline for multiple personas, or single-call for one
      if (sessionPersonas.length > 1) {
        // Multi-persona parallel pipeline
        await processTranscriptHydra(transcript);
      } else {
        // Single-persona path (backward compat)
        const suggestion = await geminiClient.processTranscript(
          transcript.text,
          transcript.speaker,
          transcript.is_final
        );

        if (suggestion) {
          // Store full suggestion text for Drive transcript
          transcriptCollector.addSuggestion({
            text: suggestion.text,
            suggestion_type: suggestion.suggestion_type,
            timestamp: suggestion.timestamp,
          });

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

        // Send cost update after every LLM call (whether suggestion generated or not)
        sendCostUpdate();
      }
    } catch (error) {
      console.error('[ServiceWorker] Gemini processing error:', error);
    }
  }
}

/**
 * Hydra: Process a transcript through all active personas in parallel.
 * Fires staggered parallel calls, filters silent responses, deduplicates
 * exact matches, and sends attributed suggestions to the overlay.
 */
async function processTranscriptHydra(transcript: Transcript): Promise<void> {
  const text = transcript.text;
  const speaker = transcript.speaker;
  const isFinal = transcript.is_final;

  // Per-model stagger timing (based on latency testing with variance padding)
  // Lookup by model first, fall back to provider default
  const provider = geminiClient.getActiveProvider();
  const activeModel = geminiClient.getActiveModel();
  const staggerMs = MODEL_STAGGER_MS[activeModel] ?? PROVIDER_STAGGER_FALLBACK[provider] ?? 200;
  console.debug(`[ServiceWorker] Hydra stagger: ${staggerMs}ms for model=${activeModel}`);

  // Fire parallel calls with provider-tuned stagger to reduce burst rate limiting
  const results = await Promise.allSettled(
    sessionPersonas.map((persona, i) =>
      new Promise<{
        suggestion: string;
        type: 'answer' | 'question' | 'objection' | 'info';
        personaId: string;
        personaName: string;
        personaColor: string;
        kbSource?: string | null;
      } | null>((resolve) => {
        setTimeout(async () => {
          try {
            const result = await geminiClient.processTranscriptForPersona(
              text,
              speaker,
              isFinal,
              persona
            );
            resolve(result);
          } catch (error) {
            console.error(`[ServiceWorker] Hydra: ${persona.name} failed:`, error);
            resolve(null);
          }
        }, i * staggerMs); // e.g., Groq: 0ms, 75ms, 150ms, 225ms
      })
    )
  );

  // Define the suggestion result type for clarity
  type PersonaSuggestionResult = {
    suggestion: string;
    type: 'answer' | 'question' | 'objection' | 'info';
    personaId: string;
    personaName: string;
    personaColor: string;
    kbSource?: string | null;
  };

  // Filter out null/rejected results
  const validSuggestions: PersonaSuggestionResult[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value !== null) {
      validSuggestions.push(result.value);
    }
  }

  if (validSuggestions.length === 0) {
    console.debug('[ServiceWorker] Hydra: all personas chose silence');
    sendCostUpdate();
    return;
  }

  // Task 8: Exact string dedup + badge merge (O(n) grouping)
  const grouped = new Map<string, PersonaSuggestionResult[]>();
  for (const s of validSuggestions) {
    const key = s.suggestion.trim(); // Case-sensitive, trimmed whitespace
    const group = grouped.get(key);
    if (group) {
      group.push(s);
    } else {
      grouped.set(key, [s]);
    }
  }

  // Process each unique suggestion
  for (const [, group] of grouped) {
    const first = group[0]!;

    // Build personas array for merged suggestions
    const personas = group.map(s => ({
      id: s.personaId,
      name: s.personaName,
      color: s.personaColor,
    }));

    // Track suggestion counts per persona (each persona in group gets credit)
    for (const s of group) {
      const count = suggestionCountByPersona.get(s.personaId) ?? 0;
      suggestionCountByPersona.set(s.personaId, count + 1);
    }

    // Store suggestion for Drive transcript (once per unique text, with persona attribution)
    transcriptCollector.addSuggestion({
      text: first.suggestion,
      suggestion_type: first.type,
      timestamp: new Date().toISOString(),
      personas,
    });

    // Send attributed suggestion to overlay with merged persona badges
    if (activeTabId) {
      chrome.tabs
        .sendMessage(activeTabId, {
          type: 'suggestion',
          data: {
            text: first.suggestion,
            suggestion_type: first.type,
            confidence: 0.85,
            source: geminiClient.getActiveProvider(),
            timestamp: new Date().toISOString(),
            kbSource: first.kbSource,
            // Hydra: personas array (may have 1 or more elements)
            personas,
          },
        })
        .catch(() => {});
    }

    const personaNames = personas.map(p => p.name).join(', ');
    const dedupNote = personas.length > 1 ? ` (deduped ${personas.length} personas)` : '';
    console.log(`[ServiceWorker] Hydra [${personaNames}]: ${first.suggestion.slice(0, 50)}...${dedupNote}`);
  }

  // Send single cost update after all parallel calls complete
  sendCostUpdate();
}

/**
 * Stop the capture session and orchestrate summary generation + Drive save.
 *
 * Critical: All async work completes before sendResponse() returns,
 * keeping the service worker alive via the STOP_SESSION message lifecycle.
 */
async function handleStopSession(): Promise<{ success: boolean }> {
  try {
    // 1. Capture tabId before any async work (prevents race condition on state reset)
    const tabId = activeTabId;

    // 2. Stop audio capture in offscreen document
    chrome.runtime.sendMessage({ type: 'STOP_AUDIO_CAPTURE' }).catch(() => {});

    // 3. Show loading state (replaces HIDE_OVERLAY)
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { type: 'summary_loading' }).catch(() => {});
    }

    // End transcript collection — returns frozen session data
    const sessionData = transcriptCollector.endSession();

    // Separate speech from suggestions for counts and summary generation
    const speechTranscripts = sessionData
      ? sessionData.transcripts.filter((t) => !t.is_suggestion)
      : [];

    // 4. Read settings
    const storage = await chrome.storage.local.get([
      'summaryEnabled',
      'summaryKeyMomentsEnabled',
      'geminiApiKey',
      'openrouterApiKey',
      'groqApiKey',
      'llmProvider',
      'driveAutosaveEnabled',
      'driveConnected',
      'driveFolderName',
      'transcriptFormat',
    ]);

    // 5. Generate summary — four distinct outcomes
    type SummaryOutcome = 'disabled' | 'skipped' | 'success' | 'error';
    let summary: import('../services/call-summary').CallSummary | null = null;
    let summaryOutcome: SummaryOutcome = 'disabled';

    // Check the active provider's key (not hardcoded Gemini)
    const summaryProvider = (storage.llmProvider as string) || 'gemini';
    const summaryKeyMap: Record<string, string | undefined> = {
      gemini: storage.geminiApiKey as string | undefined,
      openrouter: storage.openrouterApiKey as string | undefined,
      groq: storage.groqApiKey as string | undefined,
    };
    const hasProviderKey = !!summaryKeyMap[summaryProvider];

    if (storage.summaryEnabled === false || !hasProviderKey) {
      summaryOutcome = 'disabled';
    } else if (!sessionData || speechTranscripts.length < 2) {
      summaryOutcome = 'skipped';
    } else {
      // Build metadata for summary (speech only — exclude suggestions)
      const endTime = sessionData.endTime ?? new Date();
      const durationMinutes = Math.round(
        (endTime.getTime() - sessionData.startTime.getTime()) / 60000
      );
      const speakerIds = new Set(speechTranscripts.map((t) => t.speaker_id));

      // Build persona stats for summary (Hydra multi-persona attribution)
      const personaStats: PersonaStats[] = sessionPersonas.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        suggestionCount: suggestionCountByPersona.get(p.id) ?? 0,
      }));

      const summaryMeta: SummaryMetadata = {
        generatedAt: new Date().toISOString(),
        durationMinutes,
        speakerCount: speakerIds.size,
        transcriptCount: speechTranscripts.length,
        personas: personaStats.length > 0 ? personaStats : undefined,
      };

      const result = await geminiClient.generateCallSummary(
        speechTranscripts,
        summaryMeta,
        { includeKeyMoments: storage.summaryKeyMomentsEnabled !== false }
      );

      if (result) {
        summary = result;
        summaryOutcome = 'success';
      } else {
        summaryOutcome = 'error';
      }
    }

    console.log(`[ServiceWorker] Summary outcome: ${summaryOutcome}`);

    // 5b. Freeze cost tracker and attach cost to summary
    costTracker.endSession();
    const costEstimate = costTracker.getFinalCost();

    if (summary && costEstimate) {
      summary.costEstimate = costEstimate;
    }

    // 6. Save to Drive
    let driveResult: { saved: boolean; fileUrl?: string; error?: string } = { saved: false };

    if (
      sessionData &&
      sessionData.transcripts.length > 0 &&
      storage.driveAutosaveEnabled &&
      storage.driveConnected
    ) {
      // Full array (speech + suggestions) goes to Drive for complete record
      const transcripts: TranscriptData[] = sessionData.transcripts.map((t) => ({
        timestamp: t.timestamp,
        speaker: t.speaker,
        speaker_id: t.speaker_id,
        speaker_role: t.speaker_role,
        text: t.text,
        is_self: t.is_self,
        is_suggestion: t.is_suggestion,
        suggestion_type: t.suggestion_type,
        personas: t.personas,
      }));

      const endTime = sessionData.endTime ?? new Date();
      const durationSeconds = Math.round(
        (endTime.getTime() - sessionData.startTime.getTime()) / 1000
      );
      // Metadata counts use speech-only (exclude suggestions)
      const driveSpeakerIds = new Set(speechTranscripts.map((t) => t.speaker_id));

      const metadata: SessionMetadata = {
        startTime: sessionData.startTime,
        endTime,
        durationSeconds,
        speakersCount: driveSpeakerIds.size,
        transcriptsCount: speechTranscripts.length,
        suggestionsCount: sessionData.suggestionsCount,
        speakerFilterEnabled: sessionData.speakerFilterEnabled,
      };

      const result = await driveService.saveTranscript(
        transcripts,
        metadata,
        storage.driveFolderName || 'Wingman Transcripts',
        storage.transcriptFormat || 'googledoc',
        summary
      );

      driveResult = { saved: result.success, fileUrl: result.fileUrl, error: result.error };

      if (result.success) {
        console.log('[ServiceWorker] Transcript saved to Drive:', result.fileUrl);
      } else {
        console.warn('[ServiceWorker] Drive save failed:', result.error);
      }
    }

    // 7. Send results to content script
    if (tabId) {
      if (summaryOutcome === 'success') {
        chrome.tabs.sendMessage(tabId, { type: 'call_summary', data: summary }).catch(() => {});
        if (driveResult.saved) {
          chrome.tabs.sendMessage(tabId, { type: 'drive_save_result', data: driveResult }).catch(() => {});
        }
      } else if (summaryOutcome === 'error') {
        chrome.tabs
          .sendMessage(tabId, {
            type: 'summary_error',
            data: { message: 'Summary generation failed. Your transcript was still saved.' },
          })
          .catch(() => {});
      } else {
        // disabled or skipped — hide overlay (existing behavior)
        chrome.tabs.sendMessage(tabId, { type: 'HIDE_OVERLAY' }).catch(() => {});
      }
    }

    // 8. Cleanup
    stopCostAlarm();
    await deepgramClient.disconnect();
    await humeClient.disconnect();
    geminiClient.clearSession();
    costTracker.reset();

    // Close offscreen document to free resources
    try {
      await chrome.offscreen.closeDocument();
    } catch {
      // Ignore — may already be closed
    }

    // 9. Reset state
    isSessionActive = false;
    isCapturing = false;
    activeTabId = null;
    sessionPersonas = [];
    suggestionCountByPersona.clear();

    console.log('[ServiceWorker] Session stopped');
    return { success: true };
  } catch (error) {
    console.error('[ServiceWorker] Failed to stop session:', error);

    // Reset state even on error
    isSessionActive = false;
    isCapturing = false;
    activeTabId = null;

    return { success: false };
  }
}

// ── Hume AI (Emotion Detection) helpers ─────────────────────────

/**
 * Connect to Hume AI if API keys are configured.
 * Runs asynchronously — doesn't block session start.
 * Failures are logged but don't affect transcription/suggestions.
 */
async function connectHumeIfConfigured(tabId: number): Promise<void> {
  try {
    // Check if Hume is configured
    const configured = await HumeClient.isConfigured();
    if (!configured) {
      console.debug('[ServiceWorker] Hume AI not configured — emotion detection disabled');
      return;
    }

    // Set up emotion callback to forward to content script
    humeClient.setEmotionCallback((update: EmotionUpdate) => {
      console.log(`[ServiceWorker] Emotion: ${update.state} (${(update.confidence * 100).toFixed(0)}%)`);
      if (tabId && isSessionActive) {
        chrome.tabs
          .sendMessage(tabId, { type: 'emotion_update', data: update })
          .catch((err) => console.warn('[ServiceWorker] Failed to send emotion to tab:', err));
      } else {
        console.warn(`[ServiceWorker] Can't send emotion: tabId=${tabId}, active=${isSessionActive}`);
      }
    });

    // Set up disconnect callback to clear emotion badge
    humeClient.setDisconnectCallback((reason) => {
      console.log(`[ServiceWorker] Hume disconnected: ${reason}`);
      if (tabId && isSessionActive) {
        chrome.tabs
          .sendMessage(tabId, { type: 'emotion_clear', data: { reason } })
          .catch(() => {});
      }
    });

    // Connect (async, don't await — let it complete in background)
    const connected = await humeClient.connect();
    if (connected) {
      console.log('[ServiceWorker] Hume AI connected — emotion detection enabled');
    } else {
      console.warn('[ServiceWorker] Hume AI connection failed — emotion detection disabled');
    }
  } catch (error) {
    console.warn('[ServiceWorker] Hume AI error:', error);
  }
}

// ── Cost update helpers ─────────────────────────────────────────

const COST_ALARM_NAME = 'wingman-cost-update';

/** Send a cost_update message to the content script */
function sendCostUpdate(): void {
  if (!activeTabId || !costTracker.isActive) return;
  const snapshot = costTracker.getCostSnapshot();
  if (!snapshot) return;
  chrome.tabs
    .sendMessage(activeTabId, { type: 'cost_update', data: snapshot })
    .catch(() => {});
}

/** Start the periodic cost update alarm (fires every 1 min — Chrome MV3 minimum) */
function startCostAlarm(): void {
  chrome.alarms.create(COST_ALARM_NAME, { periodInMinutes: 1 });
}

/** Stop the periodic cost update alarm */
function stopCostAlarm(): void {
  chrome.alarms.clear(COST_ALARM_NAME);
}

// Listen for the cost alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === COST_ALARM_NAME) {
    sendCostUpdate();
  }
});

/**
 * Open a popup window to request microphone permission.
 *
 * Offscreen documents are hidden and can't show permission prompts.
 * This opens a real browser window at the same chrome-extension:// origin,
 * so the permission grant carries over to the offscreen document.
 * Only needed once — permission persists across sessions.
 */
async function requestMicPermission(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timeoutId = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      resolve(false);
    }, 30000);

    const listener = (message: { type: string; granted?: boolean }) => {
      if (message.type === 'MIC_PERMISSION_RESULT') {
        clearTimeout(timeoutId);
        chrome.runtime.onMessage.removeListener(listener);
        resolve(!!message.granted);
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    chrome.windows.create({
      url: chrome.runtime.getURL('src/mic-permission.html'),
      type: 'popup',
      width: 420,
      height: 220,
      focused: true,
    });
  });
}

/**
 * Ensure content script is injected and initialize overlay.
 * Non-fatal — audio capture proceeds even if overlay init fails.
 *
 * Strategy: inject the crxjs loader (classic IIFE) which dynamically imports
 * the ESM content.js. Falls back to func-based dynamic import if loader fails.
 */
async function ensureContentScriptAndInitOverlay(tabId: number): Promise<void> {
  try {
    // Try to send message to existing content script
    await chrome.tabs.sendMessage(tabId, { type: 'INIT_OVERLAY' });
    // Content script responded, overlay initialized
  } catch {
    console.debug('[ServiceWorker] Injecting content script...');

    // Inject CSS
    const manifest = chrome.runtime.getManifest();
    const cssFiles = manifest.content_scripts?.[0]?.css ?? [];
    if (cssFiles.length > 0) {
      await chrome.scripting.insertCSS({ target: { tabId }, files: cssFiles });
    }

    // Strategy 1: Inject the crxjs loader from the manifest
    const jsFiles = manifest.content_scripts?.[0]?.js ?? [];
    if (jsFiles.length > 0) {
      console.debug('[ServiceWorker] Injecting loader:', jsFiles[0]);
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: jsFiles });
      } catch (e) {
        console.error('[ServiceWorker] Loader injection failed:', e);
      }
    }

    // Wait and check if content script is now responsive
    for (const delay of [300, 700, 1500]) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'INIT_OVERLAY' });
        return;
      } catch {
        console.debug(`[ServiceWorker] Content script not ready after ${delay}ms`);
      }
    }

    // Strategy 2: Direct dynamic import via func (fallback)
    console.debug('[ServiceWorker] Trying fallback dynamic import');
    const contentUrl = chrome.runtime.getURL('content.js');
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (url: string) => {
          import(url).catch((err: unknown) => console.error('[ContentScript] Import failed:', err));
        },
        args: [contentUrl],
      });
    } catch (e) {
      console.error('[ServiceWorker] Func injection failed:', e);
    }

    // Final retry
    for (const delay of [500, 1500]) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'INIT_OVERLAY' });
        return;
      } catch {
        console.debug(`[ServiceWorker] Still not ready after ${delay}ms`);
      }
    }

    console.warn('[ServiceWorker] Overlay init failed — please refresh the Google Meet tab');
  }
}

export {};
