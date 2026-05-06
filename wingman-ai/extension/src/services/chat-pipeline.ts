/**
 * Chat Pipeline Orchestrator — Plan 4, Task 3
 *
 * Wires AssistantView.onSend → assembleChatContext → geminiClient.streamChat
 * → renderAssistantMessage with progressive streaming updates.
 *
 * Serial sends only — if a stream is running, new sends are ignored.
 */

import { assembleChatContext } from './chat-context-assembler';
import { geminiClient } from './gemini-client';
import { costTracker } from './cost-tracker';
import { addLanguageInstruction } from '../shared/language-injection';
import { createI18nInstance } from '../shared/i18n-init';
import { getActiveLocale } from '../background/sw-locale';
import { recordLlmResponse } from '../shared/language-compliance';
import type { AssistantView } from '../content/overlay/assistant-view';

/** Idle timeout before aborting a hung stream (ms). */
const STREAM_IDLE_TIMEOUT_MS = 30_000;

/**
 * Register the chat pipeline on an AssistantView.
 * Called once during overlay init. Registers a single onSend subscriber.
 */
export function registerChatPipeline(assistantView: AssistantView): void {
  let isStreaming = false;

  assistantView.onSend(async (text: string, ctx: { transcript: boolean; personaIds: string[]; web: boolean }) => {
    if (isStreaming) {
      console.debug('[chat-pipeline] send ignored — stream already active');
      return;
    }

    isStreaming = true;
    const messageId = crypto.randomUUID();
    let accumulated = '';

    // Show typing indicator as initial streaming bubble
    assistantView.renderAssistantMessage({ text: '', streaming: true, messageId });

    try {
      // Build context
      const prompt = await assembleChatContext({
        userText: text,
        ctx,
        chatHistory: assistantView.getChatHistory().map(m => ({ role: m.role, text: m.text })),
      });

      // Open stream with idle timeout
      const abortController = new AbortController();
      let idleTimer = resetIdleTimer(abortController, null);

      const localizedSystemPrompt = addLanguageInstruction(prompt.systemPrompt, getActiveLocale());

      const stream = geminiClient.streamChat(
        {
          systemPrompt: localizedSystemPrompt,
          userMessage: prompt.userMessage,
          history: prompt.history,
        },
        { signal: abortController.signal },
      );

      for await (const chunk of stream) {
        // Reset idle timer on each chunk
        idleTimer = resetIdleTimer(abortController, idleTimer);

        if (chunk.delta) {
          accumulated += chunk.delta;
          assistantView.renderAssistantMessage({
            text: accumulated,
            streaming: true,
            messageId,
          });
        }

        if (chunk.done) {
          clearTimeout(idleTimer);

          // Empty response check
          if (accumulated === '' && chunk.usage) {
            assistantView.renderAssistantMessage({
              text: 'The LLM returned an empty response. Try rephrasing your question.',
              sources: [],
              streaming: false,
              messageId,
            });
            // Still track cost for empty but successful calls
            costTracker.addLLMUsage(chunk.usage.inputTokens, chunk.usage.outputTokens);
            isStreaming = false;
            return;
          }

          assistantView.renderAssistantMessage({
            text: accumulated,
            sources: prompt.sources,
            streaming: false,
            messageId,
          });

          if (chunk.usage) {
            costTracker.addLLMUsage(chunk.usage.inputTokens, chunk.usage.outputTokens);
          }

          // Plan 11 FR-031: record compliance — fire-and-forget; never blocks the UI.
          void recordLlmResponse(accumulated, getActiveLocale());

          isStreaming = false;
          return;
        }
      }

      // Stream ended without a done chunk — finalize anyway
      clearTimeout(idleTimer);
      assistantView.renderAssistantMessage({
        text: accumulated,
        sources: prompt.sources,
        streaming: false,
        messageId,
      });
    } catch (err: unknown) {
      const errorMessage = classifyError(err, accumulated);

      if (accumulated) {
        // Keep partial text, append warning below
        assistantView.renderAssistantMessage({
          text: accumulated + '\n\n' + errorMessage,
          sources: [],
          streaming: false,
          messageId,
        });
      } else {
        assistantView.renderAssistantMessage({
          text: errorMessage,
          sources: [],
          streaming: false,
          messageId,
        });
      }
    } finally {
      isStreaming = false;
    }
  });
}

// === HELPERS ===

function resetIdleTimer(
  controller: AbortController,
  existing: ReturnType<typeof setTimeout> | null,
): ReturnType<typeof setTimeout> {
  if (existing !== null) {
    clearTimeout(existing);
  }
  return setTimeout(() => {
    controller.abort(new DOMException('Stream idle timeout', 'AbortError'));
  }, STREAM_IDLE_TIMEOUT_MS);
}

/**
 * Classify an error into a user-visible message.
 *
 * Plan 10 FR-017: returns localized text using the active locale's bundle.
 * The raw error text is included separately by the caller (rendered in
 * monospace below the primary message) per FR-017 pattern.
 */
function classifyError(err: unknown, _accumulated: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';
  const i18n = createI18nInstance(getActiveLocale());

  // 401 — invalid API key
  if (/401/.test(msg)) {
    return i18n.t('errors.api_key_missing', { provider: 'LLM' });
  }

  // 429 — rate limited
  if (/429/.test(msg)) {
    return i18n.t('errors.gemini.rate_limit');
  }

  // 5xx — server error
  if (/5\d\d/.test(msg)) {
    return i18n.t('errors.gemini.api_failure');
  }

  // Network / abort errors
  if (name === 'AbortError' || name === 'NetworkError' || /abort/i.test(msg) || /network/i.test(msg) || /fetch/i.test(msg)) {
    return i18n.t('errors.session_interrupted');
  }

  // Assembler error (typically validation)
  if (/userText required/i.test(msg) || /invalid chatHistory/i.test(msg)) {
    return i18n.t('errors.generic');
  }

  // Fallback
  console.error('[chat-pipeline] unexpected error', err);
  return i18n.t('errors.generic');
}
