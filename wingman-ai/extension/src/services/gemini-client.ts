/**
 * GeminiClient - Direct REST client for Google Gemini AI
 *
 * Calls Gemini API directly from the browser extension for AI suggestions,
 * eliminating the need for a backend server. Users provide their own API key.
 *
 * Implements "continuous participant" pattern: AI listens to conversation
 * and decides when to provide suggestions vs stay silent.
 */

import { DEFAULT_SYSTEM_PROMPT } from '../shared/default-prompt';
import type { CollectedTranscript } from './transcript-collector';
import {
  type CallSummary,
  type SummaryMetadata,
  buildSummaryPrompt,
} from './call-summary';
import { getKBContext } from './kb/kb-search';

// Gemini API endpoint
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_BATCH_SIZE = 100;
const MAX_RETRIES = 3;

/**
 * Suggestion data structure
 */
export interface Suggestion {
  text: string;
  confidence: number;
  suggestion_type: 'answer' | 'question' | 'objection' | 'info';
  source: string;
  timestamp: string;
  kbSource?: string | null;
}

/**
 * Conversation turn for history tracking
 */
interface ConversationTurn {
  speaker: string;
  text: string;
  timestamp: string;
}

/**
 * GeminiClient class - manages AI suggestions via Gemini API
 */
export class GeminiClient {
  private model = DEFAULT_MODEL;
  private maxTokens = 500;
  private temperature = 0.3;
  private systemPrompt: string = DEFAULT_SYSTEM_PROMPT;

  // Conversation history
  private chatHistory: ConversationTurn[] = [];
  private maxHistoryTurns = 20;

  // Suggestion cooldown (15 seconds to avoid API quota limits)
  private lastSuggestionTime: number | null = null;
  private suggestionCooldownMs = 15000; // 15 seconds

  // Rate-limit backoff: suppress all calls until this timestamp
  private rateLimitedUntil = 0;

  // Concurrency guard: only one suggestion call in-flight at a time
  private isGenerating = false;

  // Persona-scoped KB filter: restrict search to these document IDs
  private kbDocumentFilter: string[] | null = null;

  /**
   * Start a new conversation session
   */
  startSession(): void {
    this.chatHistory = [];
    this.lastSuggestionTime = null;
    this.rateLimitedUntil = 0;
    this.isGenerating = false;
    this.kbDocumentFilter = null;
    console.debug('[GeminiClient] Session started');
  }

  /**
   * Clear the conversation session
   */
  clearSession(): void {
    this.chatHistory = [];
    this.lastSuggestionTime = null;
    this.rateLimitedUntil = 0;
    this.isGenerating = false;
    this.kbDocumentFilter = null;
    console.debug('[GeminiClient] Session cleared');
  }

  /**
   * Set a custom system prompt
   */
  setSystemPrompt(prompt: string): void {
    if (!prompt || typeof prompt !== 'string') {
      console.warn('[GeminiClient] Invalid prompt, using default');
      return;
    }

    const trimmed = prompt.trim();
    if (trimmed.length < 50) {
      console.warn('[GeminiClient] Prompt too short, using default');
      return;
    }

    // Truncate if too long (20KB max)
    if (trimmed.length > 20000) {
      this.systemPrompt = trimmed.slice(0, 20000);
      console.warn('[GeminiClient] Prompt truncated to 20KB');
    } else {
      this.systemPrompt = trimmed;
    }

    console.debug(`[GeminiClient] System prompt set (${this.systemPrompt.length} chars)`);
  }

  /**
   * Set the KB document filter for persona-scoped search.
   * Pass null or empty array to search all documents.
   */
  setKBDocumentFilter(documentIds: string[] | null): void {
    this.kbDocumentFilter = documentIds && documentIds.length > 0 ? documentIds : null;
    console.debug(`[GeminiClient] KB filter: ${this.kbDocumentFilter ? this.kbDocumentFilter.length + ' docs' : 'all'}`);
  }

  /**
   * Load system prompt from storage
   */
  async loadSystemPrompt(): Promise<void> {
    try {
      const storage = await chrome.storage.local.get(['systemPrompt']);
      if (storage.systemPrompt) {
        this.setSystemPrompt(storage.systemPrompt);
      }
    } catch (error) {
      console.error('[GeminiClient] Failed to load system prompt:', error);
    }
  }

  /**
   * Process a transcript and potentially generate a suggestion
   */
  async processTranscript(
    text: string,
    speaker: string,
    isFinal: boolean
  ): Promise<Suggestion | null> {
    // Only log final transcripts that will be processed

    // Only process final transcripts
    if (!isFinal) {
      console.debug('[GeminiClient] Skipping non-final transcript');
      return null;
    }

    // Skip empty or very short text
    if (!text || text.trim().length === 0) {
      console.debug('[GeminiClient] Skipping empty text');
      return null;
    }

    const words = text.trim().split(/\s+/);
    if (words.length < 2) {
      console.debug('[GeminiClient] Skipping too short text');
      return null;
    }

    // Add to conversation history
    this.chatHistory.push({
      speaker,
      text,
      timestamp: new Date().toISOString(),
    });

    // Trim history to max turns
    if (this.chatHistory.length > this.maxHistoryTurns) {
      this.chatHistory = this.chatHistory.slice(-this.maxHistoryTurns);
    }

    // Check rate-limit backoff
    if (Date.now() < this.rateLimitedUntil) {
      const waitSec = Math.ceil((this.rateLimitedUntil - Date.now()) / 1000);
      console.debug(`[GeminiClient] Rate-limited, backing off (${waitSec}s remaining)`);
      return null;
    }

    // Check cooldown
    if (this.lastSuggestionTime) {
      const elapsed = Date.now() - this.lastSuggestionTime;
      if (elapsed < this.suggestionCooldownMs) {
        console.debug(`[GeminiClient] Cooldown active (${elapsed}ms)`);
        return null;
      }
    }

    // Concurrency guard: skip if another call is already in-flight
    if (this.isGenerating) {
      console.debug('[GeminiClient] Skipping — another request in-flight');
      return null;
    }

    // Generate response — cooldown starts now regardless of outcome
    this.lastSuggestionTime = Date.now();
    const suggestion = await this.generateResponse(text, speaker);

    return suggestion;
  }

  /**
   * Generate a response from Gemini
   */
  private async generateResponse(
    currentText: string,
    currentSpeaker: string
  ): Promise<Suggestion | null> {
    // Get API key from storage
    let apiKey: string | undefined;
    try {
      const storage = await chrome.storage.local.get(['geminiApiKey']);
      apiKey = storage.geminiApiKey;

      if (!apiKey) {
        console.error('[GeminiClient] No API key configured');
        return null;
      }
    } catch (error) {
      console.error('[GeminiClient] Failed to get API key:', error);
      return null;
    }

    this.isGenerating = true;
    try {
      // KB retrieval: search for relevant context (graceful degradation on failure)
      let kbSource: string | null = null;
      let systemPromptWithKB = this.systemPrompt;

      try {
        // Use recent conversation context + current text for better KB matching
        const recentContext = this.chatHistory.slice(-3).map(t => t.text).join(' ');
        const kbQuery = recentContext ? `${recentContext} ${currentText}` : currentText;
        console.debug(`[GeminiClient] KB query: "${kbQuery.slice(0, 60)}..."`);
        const kbResult = await getKBContext(kbQuery, this.kbDocumentFilter ?? undefined);
        if (kbResult.matched && kbResult.context) {
          systemPromptWithKB = `KNOWLEDGE BASE CONTEXT (from ${kbResult.source}):\nIMPORTANT: When this context is relevant to the conversation, you MUST reference specific numbers, names, and facts from it. Do not give generic advice when you have specific data available.\n\n${kbResult.context}\n\n${this.systemPrompt}`;
          kbSource = kbResult.source;
          console.log(`[GeminiClient] KB context injected (${kbResult.context.length} chars) from: ${kbSource}`);
        } else {
          console.warn(`[GeminiClient] KB returned no match — suggestion will be generated WITHOUT KB data`);
        }
      } catch (kbError) {
        console.warn('[GeminiClient] KB retrieval failed, proceeding without KB:', kbError);
      }

      // Build conversation messages
      const contents = this.buildConversationMessages(currentText, currentSpeaker);
      // API request in-flight

      // Make API request
      const response = await fetch(
        `${GEMINI_API_BASE}/${this.model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents,
            systemInstruction: {
              parts: [{ text: systemPromptWithKB }],
            },
            generationConfig: {
              maxOutputTokens: this.maxTokens,
              temperature: this.temperature,
            },
          }),
        }
      );

      if (!response.ok) {
        // Handle rate limiting with backoff
        if (response.status === 429) {
          const backoffSeconds = this.parseRetryDelay(await response.text());
          this.rateLimitedUntil = Date.now() + backoffSeconds * 1000;
          console.warn(`[GeminiClient] Rate limited — backing off ${backoffSeconds}s`);
          return null;
        }

        const errorText = await response.text();
        console.error(`[GeminiClient] API error: ${response.status} ${errorText}`);
        return null;
      }

      const data = await response.json();

      // Extract response text
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!responseText) {
        console.debug('[GeminiClient] Empty response from Gemini');
        return null;
      }

      // Check if LLM chose to stay silent
      if (responseText === '---' || responseText === '-') {
        console.debug('[GeminiClient] LLM chose to stay silent');
        return null;
      }

      console.log(`[GeminiClient] Suggestion: ${responseText.slice(0, 50)}...`);

      // Classify and return suggestion
      return {
        text: responseText,
        confidence: 0.85,
        suggestion_type: this.classifySuggestion(responseText),
        source: 'gemini',
        timestamp: new Date().toISOString(),
        kbSource,
      };
    } catch (error) {
      console.error('[GeminiClient] Failed to generate response:', error);
      return null;
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Parse retryDelay from a Gemini 429 error response body.
   * Returns seconds to wait; defaults to 60s if parsing fails.
   */
  private parseRetryDelay(errorBody: string): number {
    const DEFAULT_BACKOFF = 60;
    try {
      const data = JSON.parse(errorBody);
      const details = data?.error?.details as Array<Record<string, unknown>> | undefined;
      if (details) {
        for (const detail of details) {
          if (detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo') {
            const delayStr = detail.retryDelay as string | undefined;
            if (delayStr) {
              const seconds = parseFloat(delayStr);
              if (!isNaN(seconds) && seconds > 0) return Math.ceil(seconds);
            }
          }
        }
      }
    } catch {
      // JSON parse failed — use default
    }
    return DEFAULT_BACKOFF;
  }

  /**
   * Build conversation messages for the API
   */
  private buildConversationMessages(
    currentText: string,
    currentSpeaker: string
  ): Array<{ role: string; parts: Array<{ text: string }> }> {
    const messages: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    // Build conversation context from history (excluding current turn)
    const recentHistory = this.chatHistory.slice(0, -1);

    if (recentHistory.length > 0) {
      let conversation = 'CONVERSATION SO FAR:\n';
      for (const turn of recentHistory) {
        conversation += `[${turn.speaker}]: ${turn.text}\n`;
      }

      messages.push({
        role: 'user',
        parts: [{ text: conversation }],
      });

      // Model acknowledges context
      messages.push({
        role: 'model',
        parts: [
          {
            text: "I'm listening to the conversation. I'll provide suggestions when I have something valuable to add, or respond with --- if I should stay silent.",
          },
        ],
      });
    }

    // Add current utterance
    messages.push({
      role: 'user',
      parts: [
        {
          text: `[${currentSpeaker}]: ${currentText}\n\nShould I provide a suggestion, or stay silent (---)? IMPORTANT: Never output placeholder text in brackets like [X] or [specific thing from KB]. Either fill in real data or give concrete advice.`,
        },
      ],
    });

    return messages;
  }

  /**
   * Classify the type of suggestion based on content
   */
  private classifySuggestion(text: string): 'answer' | 'question' | 'objection' | 'info' {
    const textLower = text.toLowerCase();

    if (textLower.includes('💬 ask:') || textLower.includes('suggest asking')) {
      return 'question';
    }

    if (
      ['objection', 'concern', 'pushback', 'worry'].some((word) => textLower.includes(word))
    ) {
      return 'objection';
    }

    if (text.includes('📌')) {
      return 'answer';
    }

    return 'info';
  }

  /**
   * Get the Gemini API key from storage
   */
  private async getApiKey(): Promise<string> {
    const storage = await chrome.storage.local.get(['geminiApiKey']);
    if (!storage.geminiApiKey) {
      throw new Error('ENOKEY');
    }
    return storage.geminiApiKey;
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(
    text: string,
    taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'
  ): Promise<number[]> {
    const apiKey = await this.getApiKey();

    const response = await this.fetchWithRetry(
      `${GEMINI_API_BASE}/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: EMBEDDING_DIMENSIONS,
        }),
      }
    );

    const data = await response.json();
    return data.embedding.values;
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateEmbeddings(
    texts: string[],
    taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'
  ): Promise<number[][]> {
    const apiKey = await this.getApiKey();
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);

      const response = await this.fetchWithRetry(
        `${GEMINI_API_BASE}/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: batch.map((t) => ({
              model: `models/${EMBEDDING_MODEL}`,
              content: { parts: [{ text: t }] },
              taskType,
              outputDimensionality: EMBEDDING_DIMENSIONS,
            })),
          }),
        }
      );

      const data = await response.json();
      for (const emb of data.embeddings) {
        allEmbeddings.push(emb.values);
      }
    }

    return allEmbeddings;
  }

  /**
   * Fetch with exponential backoff on 429 rate limit errors
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit
  ): Promise<Response> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const response = await fetch(url, init);

      if (response.ok) return response;

      if (response.status === 429 && attempt < MAX_RETRIES - 1) {
        const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.warn(`[GeminiClient] Rate limited, retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      const errorText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errorText}`);
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Generate a structured call summary from the full transcript.
   * Runs once at session end. Returns null on any failure (logged, not thrown).
   */
  async generateCallSummary(
    transcripts: CollectedTranscript[],
    metadata: SummaryMetadata,
    options: { includeKeyMoments: boolean }
  ): Promise<CallSummary | null> {
    let apiKey: string;
    try {
      apiKey = await this.getApiKey();
    } catch {
      console.error('[GeminiClient] No API key for summary generation');
      return null;
    }

    try {
      const prompt = buildSummaryPrompt(transcripts, metadata, options);

      const response = await this.fetchWithRetry(
        `${GEMINI_API_BASE}/${this.model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              maxOutputTokens: 2000,
              temperature: 0.2,
            },
          }),
        }
      );

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        console.error('[GeminiClient] Empty summary response from Gemini');
        return null;
      }

      // Parse JSON response
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        console.error('[GeminiClient] Malformed JSON in summary response:', rawText.slice(0, 200));
        return null;
      }

      // Validate shape
      const obj = parsed as Record<string, unknown>;
      if (
        !Array.isArray(obj.summary) ||
        !Array.isArray(obj.actionItems) ||
        !Array.isArray(obj.keyMoments)
      ) {
        console.error('[GeminiClient] Invalid summary shape:', Object.keys(obj));
        return null;
      }

      const summary: CallSummary = {
        summary: obj.summary as string[],
        actionItems: obj.actionItems as CallSummary['actionItems'],
        keyMoments: obj.keyMoments as CallSummary['keyMoments'],
        metadata,
      };

      console.log(
        `[GeminiClient] Summary generated: ${summary.summary.length} bullets, ` +
        `${summary.actionItems.length} actions, ${summary.keyMoments.length} moments`
      );

      return summary;
    } catch (error) {
      console.error('[GeminiClient] Summary generation failed:', error);
      return null;
    }
  }

  /**
   * Get session summary for debugging
   */
  getSessionSummary(): {
    turns: number;
    lastSuggestion: string | null;
    recentSpeakers: string[];
  } {
    const recentSpeakers = [
      ...new Set(this.chatHistory.slice(-10).map((turn) => turn.speaker)),
    ];

    return {
      turns: this.chatHistory.length,
      lastSuggestion: this.lastSuggestionTime
        ? new Date(this.lastSuggestionTime).toISOString()
        : null,
      recentSpeakers,
    };
  }
}

// Export singleton instance
export const geminiClient = new GeminiClient();
