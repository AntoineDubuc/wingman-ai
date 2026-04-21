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
import { addLanguageInstruction } from '../shared/language-injection';
import { getActiveLocale } from '../background/sw-locale';
import { recordLlmResponse } from '../shared/language-compliance';
import type { CollectedTranscript } from './transcript-collector';
import {
  type CallSummary,
  type SummaryMetadata,
  buildSummaryPrompt,
} from './call-summary';
import { getKBContext } from './kb/kb-search';
import {
  type LLMProvider,
  DEFAULT_PROVIDER_CONFIG,
  PROVIDER_COOLDOWNS,
  OPENROUTER_API_BASE,
  GROQ_API_BASE,
} from '../shared/llm-config';
import {
  type PromptTuningMode,
  type ModelTuningProfile,
  getTuningProfile,
  NEUTRAL_PROFILE,
  PROMPT_TUNING_STORAGE_KEY,
  DEFAULT_PROMPT_TUNING_MODE,
} from '../shared/model-tuning';
import { costTracker } from './cost-tracker';

import { TIMING, LIMITS, LLM } from '../shared/constants';

// Gemini API endpoint
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const MAX_RETRIES = LIMITS.MAX_API_RETRIES;

/**
 * Chat request for the streaming chat method (Plan 4).
 */
export interface ChatRequest {
  systemPrompt: string;
  userMessage: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  maxTokens?: number;
  temperature?: number;
}

/**
 * A single chunk from the streaming chat response.
 */
export interface StreamChunk {
  delta: string;
  done: boolean;
  usage?: { inputTokens: number; outputTokens: number };
}

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
  private maxTokens = LLM.SUGGESTION_MAX_TOKENS;
  private temperature = 0.3;
  private systemPrompt: string = DEFAULT_SYSTEM_PROMPT;

  // Conversation history
  private chatHistory: ConversationTurn[] = [];
  private maxHistoryTurns = LIMITS.MAX_HISTORY_TURNS;

  // Suggestion cooldown (configurable, default 15 seconds)
  private lastSuggestionTime: number | null = null;
  private suggestionCooldownMs: number = TIMING.SUGGESTION_COOLDOWN_MS;

  // Per-persona cooldown tracking (Hydra multi-persona)
  private generatingPersonas = new Set<string>(); // persona IDs currently generating
  private lastSuggestionTimes = new Map<string, number>(); // persona ID → timestamp

  // Rate-limit backoff: suppress all calls until this timestamp
  private rateLimitedUntil = 0;

  // Concurrency guard: only one suggestion call in-flight at a time (single-persona mode)
  private isGenerating = false;

  // Persona-scoped KB filter: restrict search to these document IDs
  private kbDocumentFilter: string[] | null = null;

  // Provider config (session-scoped, loaded via loadProviderConfig)
  private provider: LLMProvider = 'gemini';
  private geminiApiKey: string | null = null;
  private openrouterApiKey: string | null = null;
  private openrouterModel = DEFAULT_PROVIDER_CONFIG.openrouterModel;
  private groqApiKey: string | null = null;
  private groqModel = DEFAULT_PROVIDER_CONFIG.groqModel;

  // Model tuning (session-scoped)
  private tuningMode: PromptTuningMode = DEFAULT_PROMPT_TUNING_MODE;
  private tuningProfile: ModelTuningProfile = NEUTRAL_PROFILE;

  /**
   * Start a new conversation session
   */
  startSession(): void {
    this.chatHistory = [];
    this.lastSuggestionTime = null;
    this.rateLimitedUntil = 0;
    this.isGenerating = false;
    this.generatingPersonas.clear();
    this.lastSuggestionTimes.clear();
    this.kbDocumentFilter = null;
    this.provider = 'gemini';
    this.geminiApiKey = null;
    this.openrouterApiKey = null;
    this.openrouterModel = DEFAULT_PROVIDER_CONFIG.openrouterModel;
    this.groqApiKey = null;
    this.groqModel = DEFAULT_PROVIDER_CONFIG.groqModel;
    this.suggestionCooldownMs = DEFAULT_PROVIDER_CONFIG.suggestionCooldownMs;
    this.tuningMode = DEFAULT_PROMPT_TUNING_MODE;
    this.tuningProfile = NEUTRAL_PROFILE;
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
    this.generatingPersonas.clear();
    this.lastSuggestionTimes.clear();
    this.kbDocumentFilter = null;
    this.provider = 'gemini';
    this.geminiApiKey = null;
    this.openrouterApiKey = null;
    this.openrouterModel = DEFAULT_PROVIDER_CONFIG.openrouterModel;
    this.groqApiKey = null;
    this.groqModel = DEFAULT_PROVIDER_CONFIG.groqModel;
    this.suggestionCooldownMs = DEFAULT_PROVIDER_CONFIG.suggestionCooldownMs;
    this.tuningMode = DEFAULT_PROMPT_TUNING_MODE;
    this.tuningProfile = NEUTRAL_PROFILE;
    console.debug('[GeminiClient] Session cleared');
  }

  /**
   * Load provider configuration from storage. Call after startSession()
   * but before any suggestion/summary calls. Caches values for the session.
   */
  async loadProviderConfig(): Promise<void> {
    try {
      const storage = await chrome.storage.local.get([
        'llmProvider',
        'geminiApiKey',
        'openrouterApiKey',
        'openrouterModel',
        'groqApiKey',
        'groqModel',
        'suggestionCooldownMs',
        PROMPT_TUNING_STORAGE_KEY,
      ]);

      this.provider = (storage.llmProvider as LLMProvider) || 'gemini';
      this.geminiApiKey = storage.geminiApiKey || null;
      this.openrouterApiKey = storage.openrouterApiKey || null;
      this.groqApiKey = storage.groqApiKey || null;

      if (storage.openrouterModel) {
        this.openrouterModel = storage.openrouterModel;
      }
      if (storage.groqModel) {
        this.groqModel = storage.groqModel;
      }

      // Provider-aware cooldown: use provider default, then override with custom value
      this.suggestionCooldownMs = PROVIDER_COOLDOWNS[this.provider];

      if (storage.suggestionCooldownMs) {
        const cooldown = Number(storage.suggestionCooldownMs);
        const minCooldown = PROVIDER_COOLDOWNS[this.provider];
        if (!isNaN(cooldown) && cooldown >= minCooldown && cooldown <= 30000) {
          this.suggestionCooldownMs = cooldown;
        }
      }

      const activeModel = this.provider === 'openrouter'
        ? this.openrouterModel
        : this.provider === 'groq'
          ? this.groqModel
          : this.model;

      // Resolve model tuning profile
      this.tuningMode = (storage[PROMPT_TUNING_STORAGE_KEY] as PromptTuningMode) || DEFAULT_PROMPT_TUNING_MODE;
      this.tuningProfile = this.tuningMode === 'auto'
        ? getTuningProfile(activeModel)
        : NEUTRAL_PROFILE;

      console.debug(
        `[GeminiClient] Provider config loaded: provider=${this.provider}, ` +
        `model=${activeModel}, cooldown=${this.suggestionCooldownMs}ms, ` +
        `tuning=${this.tuningMode}`
      );
    } catch (error) {
      console.error('[GeminiClient] Failed to load provider config:', error);
    }
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

  /** Active LLM provider for the current session */
  getActiveProvider(): LLMProvider {
    return this.provider;
  }

  /** Active model ID for the current session */
  getActiveModel(): string {
    if (this.provider === 'openrouter') return this.openrouterModel;
    if (this.provider === 'groq') return this.groqModel;
    return this.model;
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
   * Process a transcript for a specific persona (Hydra multi-persona pipeline).
   * This method does NOT modify instance state (`systemPrompt`, `kbDocumentFilter`)
   * and does NOT check `isGenerating` — concurrency is managed by the caller.
   *
   * @param text - The transcript text
   * @param speaker - The speaker label
   * @param isFinal - Whether this is a final transcript
   * @param persona - The persona to generate suggestions for
   * @returns Suggestion result with persona attribution, or null if silent/error
   */
  async processTranscriptForPersona(
    text: string,
    speaker: string,
    isFinal: boolean,
    persona: {
      id: string;
      name: string;
      color: string;
      icon?: string;
      systemPrompt: string;
      kbDocumentIds: string[];
    }
  ): Promise<{
    suggestion: string;
    type: 'answer' | 'question' | 'objection' | 'info';
    personaId: string;
    personaName: string;
    personaColor: string;
    personaIcon?: string;
    kbSource?: string | null;
  } | null> {
    // Only process final transcripts
    if (!isFinal) {
      console.debug(`[GeminiClient] [${persona.name}] Skipping non-final transcript`);
      return null;
    }

    // Skip empty or very short text
    if (!text || text.trim().length === 0) {
      console.debug(`[GeminiClient] [${persona.name}] Skipping empty text`);
      return null;
    }

    const words = text.trim().split(/\s+/);
    if (words.length < 2) {
      console.debug(`[GeminiClient] [${persona.name}] Skipping too short text`);
      return null;
    }

    // Check rate-limit backoff (shared across all personas)
    if (Date.now() < this.rateLimitedUntil) {
      const waitSec = Math.ceil((this.rateLimitedUntil - Date.now()) / 1000);
      console.debug(`[GeminiClient] [${persona.name}] Rate-limited, backing off (${waitSec}s remaining)`);
      return null;
    }

    // Per-persona cooldown check
    const lastTime = this.lastSuggestionTimes.get(persona.id) ?? 0;
    const elapsed = Date.now() - lastTime;
    if (elapsed < this.suggestionCooldownMs) {
      console.debug(`[GeminiClient] [${persona.name}] Cooldown active (${elapsed}ms of ${this.suggestionCooldownMs}ms)`);
      return null;
    }

    // Per-persona concurrency guard
    if (this.generatingPersonas.has(persona.id)) {
      console.debug(`[GeminiClient] [${persona.name}] Already generating, skipping`);
      return null;
    }

    // Get the API key for the active provider
    const apiKey = this.getProviderApiKey();
    if (!apiKey) {
      console.error(`[GeminiClient] [${persona.name}] No API key for provider: ${this.provider}`);
      return null;
    }

    // Mark persona as generating
    this.generatingPersonas.add(persona.id);

    try {
      // KB retrieval: search for relevant context using persona's KB filter
      let kbSource: string | null = null;
      let systemPromptWithKB = persona.systemPrompt;

      try {
        // Use recent conversation context + current text for better KB matching
        const recentContext = this.chatHistory.slice(-3).map(t => t.text).join(' ');
        const kbQuery = recentContext ? `${recentContext} ${text}` : text;
        const kbFilter = persona.kbDocumentIds.length > 0 ? persona.kbDocumentIds : undefined;
        console.debug(`[GeminiClient] [${persona.name}] KB query: "${kbQuery.slice(0, 60)}..."`);
        const kbResult = await getKBContext(kbQuery, kbFilter);
        if (kbResult.matched && kbResult.context) {
          systemPromptWithKB = `KNOWLEDGE BASE CONTEXT (from ${kbResult.source}):\nIMPORTANT: When this context is relevant to the conversation, you MUST reference specific numbers, names, and facts from it. Do not give generic advice when you have specific data available.\n\n${kbResult.context}\n\n${persona.systemPrompt}`;
          kbSource = kbResult.source;
          console.log(`[GeminiClient] [${persona.name}] KB context injected (${kbResult.context.length} chars) from: ${kbSource}`);
        } else {
          console.debug(`[GeminiClient] [${persona.name}] KB returned no match`);
        }
      } catch (kbError) {
        console.warn(`[GeminiClient] [${persona.name}] KB retrieval failed:`, kbError);
      }

      // Apply model tuning to system prompt (auto mode only)
      let tunedSystemPrompt = systemPromptWithKB;
      let suggestionTemp = this.temperature;
      const profile = this.tuningProfile;

      if (this.tuningMode === 'auto') {
        if (profile.promptPrefix) {
          tunedSystemPrompt = profile.promptPrefix + tunedSystemPrompt;
        }
        if (profile.silenceReinforcement) {
          tunedSystemPrompt += '\n\n' + profile.silenceReinforcement;
        }
        if (profile.promptSuffix) {
          tunedSystemPrompt += '\n\n' + profile.promptSuffix;
        }
        suggestionTemp = profile.suggestionTemperature;
      }

      // Inject language instruction into system prompt (no-op for English)
      tunedSystemPrompt = addLanguageInstruction(tunedSystemPrompt, getActiveLocale());

      // Build conversation messages and provider-formatted request
      const contents = this.buildConversationMessages(text, speaker);
      const req = this.buildRequest({
        messages: contents,
        systemPrompt: tunedSystemPrompt,
        maxTokens: this.maxTokens,
        temperature: suggestionTemp,
      });

      const response = await fetch(req.url, {
        method: 'POST',
        headers: req.headers,
        body: req.body,
      });

      if (!response.ok) {
        if (response.status === 429) {
          const backoffSeconds = await this.parseRetrySeconds(response);
          this.rateLimitedUntil = Date.now() + backoffSeconds * 1000;
          console.warn(`[GeminiClient] [${persona.name}] Rate limited — backing off ${backoffSeconds}s`);
          return null;
        }

        const errorText = await response.text();
        console.error(`[GeminiClient] [${persona.name}] API error: ${response.status} ${errorText}`);
        return null;
      }

      const data = await response.json();
      const responseText = this.extractResponseText(data);

      // Track token usage (even for silent/empty responses — input tokens were consumed)
      const usage = this.extractUsage(data);
      costTracker.addLLMUsage(usage.inputTokens, usage.outputTokens);

      if (!responseText) {
        console.debug(`[GeminiClient] [${persona.name}] Empty response from LLM`);
        return null;
      }

      // Plan 11 FR-031: record compliance for the per-persona suggestion path.
      void recordLlmResponse(responseText, getActiveLocale());

      // Check if LLM chose to stay silent
      if (responseText === '---' || responseText === '-') {
        console.debug(`[GeminiClient] [${persona.name}] LLM chose to stay silent`);
        return null;
      }

      console.log(`[GeminiClient] [${persona.name}] Suggestion: ${responseText.slice(0, 50)}...`);

      // Update per-persona cooldown on successful suggestion
      this.lastSuggestionTimes.set(persona.id, Date.now());

      // Return enriched result with persona attribution
      return {
        suggestion: responseText,
        type: this.classifySuggestion(responseText),
        personaId: persona.id,
        personaName: persona.name,
        personaColor: persona.color,
        personaIcon: persona.icon,
        kbSource,
      };
    } catch (error) {
      console.error(`[GeminiClient] [${persona.name}] Failed to generate response:`, error);
      return null;
    } finally {
      // Always clear the generating flag for this persona
      this.generatingPersonas.delete(persona.id);
    }
  }

  /**
   * Generate a response from Gemini
   */
  private async generateResponse(
    currentText: string,
    currentSpeaker: string
  ): Promise<Suggestion | null> {
    // Get the API key for the active provider (cached by loadProviderConfig)
    const apiKey = this.getProviderApiKey();
    if (!apiKey) {
      console.error(`[GeminiClient] No API key for provider: ${this.provider}`);
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

      // Apply model tuning to system prompt (auto mode only)
      let tunedSystemPrompt = systemPromptWithKB;
      let suggestionTemp = this.temperature;
      const profile = this.tuningProfile;

      if (this.tuningMode === 'auto') {
        if (profile.promptPrefix) {
          tunedSystemPrompt = profile.promptPrefix + tunedSystemPrompt;
        }
        if (profile.silenceReinforcement) {
          tunedSystemPrompt += '\n\n' + profile.silenceReinforcement;
        }
        if (profile.promptSuffix) {
          tunedSystemPrompt += '\n\n' + profile.promptSuffix;
        }
        suggestionTemp = profile.suggestionTemperature;
      }

      // Inject language instruction into system prompt (no-op for English)
      tunedSystemPrompt = addLanguageInstruction(tunedSystemPrompt, getActiveLocale());

      // Build conversation messages and provider-formatted request
      const contents = this.buildConversationMessages(currentText, currentSpeaker);
      const req = this.buildRequest({
        messages: contents,
        systemPrompt: tunedSystemPrompt,
        maxTokens: this.maxTokens,
        temperature: suggestionTemp,
      });

      const response = await fetch(req.url, {
        method: 'POST',
        headers: req.headers,
        body: req.body,
      });

      if (!response.ok) {
        if (response.status === 429) {
          const backoffSeconds = await this.parseRetrySeconds(response);
          this.rateLimitedUntil = Date.now() + backoffSeconds * 1000;
          console.warn(`[GeminiClient] Rate limited — backing off ${backoffSeconds}s`);
          return null;
        }

        const errorText = await response.text();
        console.error(`[GeminiClient] API error: ${response.status} ${errorText}`);
        return null;
      }

      const data = await response.json();
      const responseText = this.extractResponseText(data);

      // Track token usage (even for silent/empty responses — input tokens were consumed)
      const usage = this.extractUsage(data);
      costTracker.addLLMUsage(usage.inputTokens, usage.outputTokens);

      if (!responseText) {
        console.debug('[GeminiClient] Empty response from LLM');
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
        source: this.provider,
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
   * Parse retry delay from an OpenRouter 429 response using the Retry-After header.
   * Falls back to 60s if the header is missing or unparseable.
   */
  private parseRetryAfterHeader(response: Response): number {
    const DEFAULT_BACKOFF = 60;
    const header = response.headers.get('Retry-After');
    if (header) {
      const seconds = parseInt(header, 10);
      if (!isNaN(seconds) && seconds > 0) return seconds;
    }
    return DEFAULT_BACKOFF;
  }

  /**
   * Parse retry delay from a 429 response, dispatching to the right parser.
   * For Gemini: reads the response body for retryDelay (body must not have been consumed).
   * For OpenRouter: reads the Retry-After header.
   */
  private async parseRetrySeconds(response: Response): Promise<number> {
    if (this.provider !== 'gemini') {
      // OpenRouter and Groq both use Retry-After header
      return this.parseRetryAfterHeader(response);
    }
    // Gemini: parse retry info from response body
    try {
      const body = await response.text();
      return this.parseRetryDelay(body);
    } catch {
      return 60;
    }
  }

  /**
   * Build a provider-formatted request for either Gemini or OpenRouter.
   * Used by both generateResponse() and generateCallSummary().
   */
  private buildRequest(options: {
    messages?: Array<{ role: string; parts: Array<{ text: string }> }>;
    prompt?: string;
    systemPrompt?: string;
    maxTokens: number;
    temperature: number;
    jsonMode?: boolean;
  }, provider?: LLMProvider): { url: string; headers: Record<string, string>; body: string } {
    const effectiveProvider = provider ?? this.provider;
    const apiKey = provider ? this.getApiKeyForProvider(provider) : this.getProviderApiKey();

    if (effectiveProvider !== 'gemini') {
      // OpenAI-compatible format (OpenRouter and Groq)
      const openaiMessages: Array<{ role: string; content: string }> = [];

      if (options.systemPrompt) {
        openaiMessages.push({ role: 'system', content: options.systemPrompt });
      }

      if (options.messages) {
        for (const msg of options.messages) {
          openaiMessages.push({
            role: msg.role === 'model' ? 'assistant' : msg.role,
            content: msg.parts.map(p => p.text).join(''),
          });
        }
      } else if (options.prompt) {
        openaiMessages.push({ role: 'user', content: options.prompt });
      }

      const model = effectiveProvider === 'groq' ? this.groqModel : this.openrouterModel;
      const baseUrl = effectiveProvider === 'groq' ? GROQ_API_BASE : OPENROUTER_API_BASE;

      const body: Record<string, unknown> = {
        model,
        messages: openaiMessages,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
      };

      if (options.jsonMode) {
        body.response_format = { type: 'json_object' };
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      };

      // OpenRouter-specific headers (not needed for Groq)
      if (effectiveProvider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://wingman-ai.com';
        headers['X-Title'] = 'Wingman AI';
      }

      return {
        url: `${baseUrl}/chat/completions`,
        headers,
        body: JSON.stringify(body),
      };
    }

    // Gemini format
    const geminiBody: Record<string, unknown> = {
      generationConfig: {
        maxOutputTokens: options.maxTokens,
        temperature: options.temperature,
        ...(options.jsonMode && { responseMimeType: 'application/json' }),
      },
    };

    if (options.systemPrompt) {
      geminiBody.systemInstruction = { parts: [{ text: options.systemPrompt }] };
    }

    if (options.messages) {
      geminiBody.contents = options.messages;
    } else if (options.prompt) {
      geminiBody.contents = [{ parts: [{ text: options.prompt }] }];
    }

    return {
      url: `${GEMINI_API_BASE}/${this.model}:generateContent?key=${apiKey}`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    };
  }

  /**
   * Extract the response text from either Gemini or OpenRouter response format.
   */
  private extractResponseText(data: Record<string, unknown>, provider?: LLMProvider): string | null {
    const effectiveProvider = provider ?? this.provider;
    if (effectiveProvider !== 'gemini') {
      // OpenAI-compatible format (OpenRouter and Groq)
      const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
      return choices?.[0]?.message?.content?.trim() ?? null;
    }

    // Gemini format
    const candidates = data.candidates as Array<{
      content?: { parts?: Array<{ text?: string }> };
    }> | undefined;
    return candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
  }

  /**
   * Extract token usage from an API response. Returns zeros if missing.
   */
  private extractUsage(data: Record<string, unknown>, provider?: LLMProvider): { inputTokens: number; outputTokens: number } {
    const effectiveProvider = provider ?? this.provider;
    try {
      if (effectiveProvider !== 'gemini') {
        // OpenAI-compatible format (OpenRouter and Groq)
        const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
        return {
          inputTokens: usage?.prompt_tokens ?? 0,
          outputTokens: usage?.completion_tokens ?? 0,
        };
      }

      // Gemini format
      const meta = data.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;
      return {
        inputTokens: meta?.promptTokenCount ?? 0,
        outputTokens: meta?.candidatesTokenCount ?? 0,
      };
    } catch {
      console.debug('[GeminiClient] Could not parse usage metadata');
      return { inputTokens: 0, outputTokens: 0 };
    }
  }

  /**
   * Strip markdown code block fencing from a string (safety for JSON parsing).
   */
  private stripMarkdownCodeBlock(text: string): string {
    let result = text.trim();
    if (result.startsWith('```json')) {
      result = result.slice(7);
    } else if (result.startsWith('```')) {
      result = result.slice(3);
    }
    if (result.endsWith('```')) {
      result = result.slice(0, -3);
    }
    return result.trim();
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

    // Add current utterance — use tuned silence hint if profile provides one
    const silenceHint = (this.tuningMode === 'auto' && this.tuningProfile.conversationSilenceHint)
      ? this.tuningProfile.conversationSilenceHint
      : 'Should I provide a suggestion, or stay silent (---)?';

    messages.push({
      role: 'user',
      parts: [
        {
          text: `[${currentSpeaker}]: ${currentText}\n\n${silenceHint} IMPORTANT: Never output placeholder text in brackets like [X] or [specific thing from KB]. Either fill in real data or give concrete advice.`,
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
   * Get the appropriate API key for the current operation.
   * For suggestions/summaries: uses the active provider's key.
   * For embeddings: always uses the Gemini key (pass 'gemini' explicitly).
   */
  /**
   * Get the cached API key for the active provider. Synchronous — uses
   * values loaded by loadProviderConfig(). Returns null if no key is set.
   */
  private getProviderApiKey(): string | null {
    switch (this.provider) {
      case 'gemini':    return this.geminiApiKey;
      case 'openrouter': return this.openrouterApiKey;
      case 'groq':       return this.groqApiKey;
    }
  }

  /**
   * Get the cached API key for a specific provider. Used by buildRequest()
   * when called with an explicit provider override (e.g., for KB queries).
   */
  private getApiKeyForProvider(provider: LLMProvider): string | null {
    switch (provider) {
      case 'gemini':    return this.geminiApiKey;
      case 'openrouter': return this.openrouterApiKey;
      case 'groq':       return this.groqApiKey;
    }
  }

  /**
   * Get the appropriate API key for the current operation.
   * For suggestions/summaries: uses the active provider's key.
   * For embeddings: always uses the Gemini key (pass 'gemini' explicitly).
   */
  private async getApiKey(forProvider?: 'gemini'): Promise<string> {
    if (forProvider === 'gemini' || this.provider === 'gemini') {
      // Try cached key first, fall back to storage for embeddings called outside session
      if (this.geminiApiKey) return this.geminiApiKey;
      const storage = await chrome.storage.local.get(['geminiApiKey']);
      if (!storage.geminiApiKey) throw new Error('ENOKEY');
      return storage.geminiApiKey;
    }
    const key = this.getProviderApiKey();
    if (key) return key;
    throw new Error('ENOKEY');
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(
    text: string,
    taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'
  ): Promise<number[]> {
    const apiKey = await this.getApiKey('gemini');

    const response = await this.fetchWithRetry(
      `${GEMINI_API_BASE}/${LLM.EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${LLM.EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: LLM.EMBEDDING_DIMENSIONS,
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
    const apiKey = await this.getApiKey('gemini');
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += LIMITS.EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(i, i + LIMITS.EMBEDDING_BATCH_SIZE);

      const response = await this.fetchWithRetry(
        `${GEMINI_API_BASE}/${LLM.EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: batch.map((t) => ({
              model: `models/${LLM.EMBEDDING_MODEL}`,
              content: { parts: [{ text: t }] },
              taskType,
              outputDimensionality: LLM.EMBEDDING_DIMENSIONS,
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
      throw new Error(`LLM API error ${response.status}: ${errorText}`);
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
    try {
      await this.getApiKey();
    } catch {
      console.error('[GeminiClient] No API key for summary generation');
      return null;
    }

    try {
      let prompt = buildSummaryPrompt(transcripts, metadata, options, getActiveLocale());

      // Apply model tuning to summary prompt (auto mode only)
      if (this.tuningMode === 'auto') {
        const profile = this.tuningProfile;
        if (profile.summaryPromptPrefix) {
          prompt = profile.summaryPromptPrefix + prompt;
        }
        if (profile.summaryJsonHint) {
          // Inject before the closing "Return ONLY valid JSON" line
          const jsonLine = 'Return ONLY valid JSON.';
          const idx = prompt.lastIndexOf(jsonLine);
          if (idx >= 0) {
            prompt = prompt.slice(0, idx) + profile.summaryJsonHint + '\n\n' + prompt.slice(idx);
          }
        }
      }

      const req = this.buildRequest({
        prompt,
        maxTokens: 2000,
        temperature: 0.2, // Never overridden — low temp critical for consistent JSON
        jsonMode: true,
      });

      const response = await this.fetchWithRetry(req.url, {
        method: 'POST',
        headers: req.headers,
        body: req.body,
      });

      const data = await response.json();

      // Track summary token usage
      const summaryUsage = this.extractUsage(data);
      costTracker.addLLMUsage(summaryUsage.inputTokens, summaryUsage.outputTokens);

      const rawText = this.extractResponseText(data);

      if (!rawText) {
        console.error(`[GeminiClient] Empty summary response from ${this.provider}`);
        return null;
      }

      // Plan 11 FR-031: record compliance for the call-summary generation path.
      void recordLlmResponse(rawText, getActiveLocale());

      // Parse JSON response — strip markdown fencing for OpenRouter models
      let parsed: unknown;
      try {
        parsed = JSON.parse(this.stripMarkdownCodeBlock(rawText));
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

  /**
   * Generate a structured KB answer from search results.
   * Groq-first for speed, falls back to active provider on failure.
   * Independent of the suggestion pipeline — no cooldowns, no history, no isGenerating.
   */
  async generateKBAnswer(
    query: string,
    kbChunks: Array<{ text: string; score: number; documentName: string }>,
    personaRole?: string,
  ): Promise<{ answer: string; alt1: string; alt2: string } | null> {
    if (kbChunks.length === 0) return null;

    const role = personaRole || 'an assistant in a live call';
    const chunksContext = kbChunks
      .map((c, i) => `[Source ${i + 1}: ${c.documentName} (relevance: ${(c.score * 100).toFixed(0)}%)]\n${c.text}`)
      .join('\n\n');

    const basePrompt =
      `You are ${role}. A user asked a question during a live call and wants an answer from their Knowledge Base.\n\n` +
      `USER QUESTION: ${query}\n\n` +
      `KNOWLEDGE BASE CONTEXT:\n${chunksContext}\n\n` +
      `Provide a clear, concise answer based ONLY on the context above. ` +
      `If the context does not contain enough information, say so.\n\n` +
      `Format your response EXACTLY as:\nANSWER: <your primary answer>\nALT 1: <alternative phrasing>\nALT 2: <another alternative phrasing>\n\n` +
      `If the context has no relevant information, respond with: NO_DATA`;
    // Plan 11 FR-011: ensure KB answers honor the user's selected locale.
    const prompt = addLanguageInstruction(basePrompt, getActiveLocale());

    // Determine providers to try: Groq first if available, then active provider
    const providers: LLMProvider[] = [];
    if (this.groqApiKey) {
      providers.push('groq');
    }
    if (this.provider !== 'groq' || !this.groqApiKey) {
      providers.push(this.provider);
    }

    for (const tryProvider of providers) {
      try {
        const req = this.buildRequest(
          {
            prompt,
            maxTokens: 512,
            temperature: 0.3,
          },
          tryProvider,
        );

        const response = await this.fetchWithRetry(req.url, {
          method: 'POST',
          headers: req.headers,
          body: req.body,
        });

        const data = await response.json();
        const usage = this.extractUsage(data, tryProvider);
        costTracker.addLLMUsage(usage.inputTokens, usage.outputTokens);

        const text = this.extractResponseText(data, tryProvider);
        if (!text) {
          console.warn('[GeminiClient] KB answer: empty response text');
          continue;
        }

        // Plan 11 FR-031: record compliance for the KB answer path.
        void recordLlmResponse(text, getActiveLocale());

        // Check for NO_DATA sentinel
        if (text.trim() === 'NO_DATA' || text.trim().startsWith('NO_DATA')) {
          console.debug('[GeminiClient] KB answer: LLM returned NO_DATA');
          return null;
        }

        // Parse structured response
        return this.parseKBAnswerResponse(text);
      } catch (err) {
        const status = err instanceof Error && err.message.match(/\b(\d{3})\b/)?.[1];
        console.warn(`[GeminiClient] KB answer ${tryProvider} call failed: ${status || 'network error'}`);
        // Continue to next provider
      }
    }

    // All providers failed
    return null;
  }

  /**
   * Parse the LLM response into structured answer/alt1/alt2 fields.
   * If markers are missing, uses full text as answer with empty alts.
   */
  private parseKBAnswerResponse(text: string): { answer: string; alt1: string; alt2: string } {
    const answerMatch = text.match(/ANSWER:\s*([\s\S]*?)(?=\nALT 1:|$)/i);
    const alt1Match = text.match(/ALT 1:\s*([\s\S]*?)(?=\nALT 2:|$)/i);
    const alt2Match = text.match(/ALT 2:\s*([\s\S]*?)$/i);

    const answer = answerMatch?.[1]?.trim() || text.trim();
    const alt1 = alt1Match?.[1]?.trim() || '';
    const alt2 = alt2Match?.[1]?.trim() || '';

    return { answer, alt1, alt2 };
  }

  // ===========================================================================
  // Streaming chat — Plan 4 Task 1
  // ===========================================================================

  /**
   * Stream a chat completion as an async iterable of chunks.
   * Supports all three providers (Gemini, OpenRouter, Groq) via SSE.
   * Does NOT touch existing processTranscript / generateKBAnswer pipelines.
   */
  async *streamChat(
    req: ChatRequest,
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<StreamChunk, void, undefined> {
    if (!req.userMessage || req.userMessage.trim().length === 0) {
      throw new Error('userMessage required');
    }

    const signal = options?.signal;

    // Check for pre-abort
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    let apiKey = this.getProviderApiKey();
    if (!apiKey) {
      // Cache may be cold (e.g., content-script context where loadProviderConfig
      // was never called). Lazy-load from chrome.storage so streamChat works
      // regardless of which extension context invoked it.
      await this.loadProviderConfig();
      apiKey = this.getProviderApiKey();
    }
    if (!apiKey) {
      throw new Error('No API key configured for provider: ' + this.provider);
    }

    // Build the fetch request based on provider
    const { url, headers, body } = this.buildStreamRequest(req, apiKey);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal,
    });

    if (!response.ok) {
      throw new Error(`LLM API error ${response.status}`);
    }

    // Consume the SSE stream
    let yielded = false;
    for await (const chunk of this.consumeSSEStream(response, this.provider, signal)) {
      yielded = true;
      yield chunk;
      if (chunk.done) return;
    }

    // If nothing was yielded (empty body), produce a single done chunk
    if (!yielded) {
      yield { delta: '', done: true, usage: { inputTokens: 0, outputTokens: 0 } };
    }
  }

  /**
   * Build a streaming request for the given provider.
   */
  private buildStreamRequest(
    req: ChatRequest,
    apiKey: string,
  ): { url: string; headers: Record<string, string>; body: string } {
    const maxTokens = req.maxTokens ?? 4096;
    const temperature = req.temperature ?? 0.7;

    if (this.provider !== 'gemini') {
      // OpenAI-compatible format (OpenRouter, Groq)
      const messages: Array<{ role: string; content: string }> = [];

      if (req.systemPrompt) {
        messages.push({ role: 'system', content: req.systemPrompt });
      }

      // History
      if (req.history) {
        for (const h of req.history) {
          messages.push({ role: h.role, content: h.text });
        }
      }

      // Current user message
      messages.push({ role: 'user', content: req.userMessage });

      const model = this.provider === 'groq' ? this.groqModel : this.openrouterModel;
      const baseUrl = this.provider === 'groq' ? GROQ_API_BASE : OPENROUTER_API_BASE;

      const bodyObj: Record<string, unknown> = {
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
        stream_options: { include_usage: true },
      };

      const hdrs: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      };

      if (this.provider === 'openrouter') {
        hdrs['HTTP-Referer'] = 'https://wingman-ai.com';
        hdrs['X-Title'] = 'Wingman AI';
      }

      return {
        url: `${baseUrl}/chat/completions`,
        headers: hdrs,
        body: JSON.stringify(bodyObj),
      };
    }

    // Gemini format — streaming endpoint
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    // History
    if (req.history) {
      for (const h of req.history) {
        contents.push({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.text }],
        });
      }
    }

    // Current user message
    contents.push({ role: 'user', parts: [{ text: req.userMessage }] });

    const geminiBody: Record<string, unknown> = {
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
      },
      contents,
    };

    if (req.systemPrompt) {
      geminiBody.systemInstruction = { parts: [{ text: req.systemPrompt }] };
    }

    return {
      url: `${GEMINI_API_BASE}/${this.model}:streamGenerateContent?alt=sse&key=${apiKey}`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    };
  }

  /**
   * Consume an SSE response body line-by-line, yielding StreamChunks.
   * Handles multi-line events, [DONE] sentinel, and chunks split across reads.
   */
  private async *consumeSSEStream(
    response: Response,
    provider: LLMProvider,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk, void, undefined> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastUsage: { inputTokens: number; outputTokens: number } | undefined;
    let hasYielded = false;

    try {
      while (true) {
        // Check abort before each read
        if (signal?.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        // Keep the last element (may be an incomplete line)
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed === '' || trimmed.startsWith(':')) continue;

          if (!trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6); // strip "data: "

          // [DONE] sentinel (OpenAI-compat). Always emit a final done chunk
          // with the last-seen usage so cost is recorded. The usage-only tail
          // event (`{ choices: [], usage: {...} }`) arrives before [DONE] and
          // is captured into lastUsage via parseSSEChunk's usage extraction.
          if (data === '[DONE]') {
            yield { delta: '', done: true, usage: lastUsage ?? { inputTokens: 0, outputTokens: 0 } };
            return;
          }

          // Parse JSON
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(data) as Record<string, unknown>;
          } catch {
            console.warn('[GeminiClient] Malformed SSE data, skipping:', data.slice(0, 80));
            continue;
          }

          // Extract delta + done + usage based on provider
          const chunk = this.parseSSEChunk(parsed, provider);
          if (chunk) {
            // Track usage across all chunks — Gemini attaches usageMetadata
            // to every event (cumulative); OpenAI-compat sends a usage tail.
            if (chunk.usage) {
              lastUsage = chunk.usage;
            }
            hasYielded = true;
            yield chunk;
            // Gemini's finishReason — and only finishReason — terminates the
            // stream from the parser side. Return so the body-end fallback
            // below doesn't double-emit.
            if (chunk.done) return;
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim().length > 0) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data) as Record<string, unknown>;
              const chunk = this.parseSSEChunk(parsed, provider);
              if (chunk) {
                if (chunk.usage) lastUsage = chunk.usage;
                hasYielded = true;
                yield chunk;
                if (chunk.done) return;
              }
            } catch {
              console.warn('[GeminiClient] Malformed SSE data in final buffer, skipping');
            }
          }
        }
      }

      // Body ended without an explicit terminator (no [DONE], no finishReason).
      // Emit a synthetic final done chunk so consumers can finalize + record
      // cost. Covers: truncated bodies, providers that don't send [DONE],
      // Gemini responses without finishReason.
      if (hasYielded) {
        yield { delta: '', done: true, usage: lastUsage ?? { inputTokens: 0, outputTokens: 0 } };
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Parse a single SSE JSON object into a StreamChunk.
   */
  private parseSSEChunk(
    data: Record<string, unknown>,
    provider: LLMProvider,
  ): StreamChunk | null {
    if (provider === 'gemini') {
      // Gemini streaming format.
      // CRITICAL: Gemini attaches `usageMetadata` to EVERY SSE event (cumulative
      // token counts), not just the final one. The only reliable termination
      // signal is `candidates[0].finishReason` being set to a non-null value
      // (e.g., "STOP", "MAX_TOKENS", "SAFETY"). Treating usageMetadata as the
      // done signal truncates responses to the first chunk — the bug fixed here.
      const candidates = data.candidates as Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }> | undefined;
      const text = candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const finishReason = candidates?.[0]?.finishReason;
      const meta = data.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;

      const usage = meta
        ? { inputTokens: meta.promptTokenCount ?? 0, outputTokens: meta.candidatesTokenCount ?? 0 }
        : undefined;

      if (finishReason) {
        return { delta: text, done: true, ...(usage ? { usage } : {}) };
      }

      // Pass through usage on intermediate chunks so consumeSSEStream can
      // track the latest snapshot even when the final chunk omits it.
      return { delta: text, done: false, ...(usage ? { usage } : {}) };
    }

    // OpenAI-compat (OpenRouter, Groq).
    // Note: finish_reason is NOT treated as a termination signal here. When
    // `stream_options.include_usage=true`, a usage-only event (`{ choices: [],
    // usage: {...} }`) arrives AFTER the finish_reason event, followed by
    // `data: [DONE]`. consumeSSEStream emits the final done chunk on [DONE]
    // (or body-end) with the accumulated usage, so cost is recorded correctly.
    const choices = data.choices as Array<{
      delta?: { content?: string };
      finish_reason?: string | null;
    }> | undefined;
    const delta = choices?.[0]?.delta?.content ?? '';
    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
    const usageObj = usage
      ? { inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0 }
      : undefined;

    return { delta, done: false, ...(usageObj ? { usage: usageObj } : {}) };
  }
}

// Export singleton instance
export const geminiClient = new GeminiClient();
