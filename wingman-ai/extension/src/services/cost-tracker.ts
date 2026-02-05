/**
 * Cost Tracker Service
 *
 * Session-scoped accumulator for Deepgram audio minutes and LLM token usage.
 * Computes running cost totals using pricing from shared/pricing.ts.
 *
 * Design:
 * - Token counts stored as integers (no floating-point drift)
 * - Dollar costs computed on demand at snapshot/display time
 * - Singleton, same lifecycle as transcriptCollector
 */

import {
  getModelPricing,
  DEEPGRAM_RATE_PER_MINUTE,
  PROVIDER_FREE_TIER,
  checkPricingStaleness,
  type ModelPricing,
  type CostSnapshot,
  type CostEstimate,
} from '@shared/pricing';
import type { LLMProvider } from '@shared/llm-config';

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  gemini: 'Gemini',
  openrouter: 'OpenRouter',
  groq: 'Groq',
};

interface SessionState {
  provider: LLMProvider;
  model: string;
  pricing: ModelPricing;
  providerLabel: string;
  isFreeTier: boolean;
  startTime: number;
  endTime: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  suggestionCount: number;
}

class CostTracker {
  private session: SessionState | null = null;

  /**
   * Start tracking a new session. Locks in pricing for the active model.
   */
  startSession(provider: LLMProvider, model: string): void {
    checkPricingStaleness();

    this.session = {
      provider,
      model,
      pricing: getModelPricing(model),
      providerLabel: PROVIDER_LABELS[provider] ?? provider,
      isFreeTier: PROVIDER_FREE_TIER[provider] ?? false,
      startTime: Date.now(),
      endTime: null,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      suggestionCount: 0,
    };

    console.debug(`[CostTracker] Session started — ${provider}/${model}`);
  }

  /**
   * Record token usage from an LLM API response.
   */
  addLLMUsage(inputTokens: number, outputTokens: number): void {
    if (!this.session) return;

    this.session.totalInputTokens += inputTokens;
    this.session.totalOutputTokens += outputTokens;
    this.session.suggestionCount += 1;

    console.debug(
      `[CostTracker] +${inputTokens}in/${outputTokens}out tokens (total: ${this.session.totalInputTokens}/${this.session.totalOutputTokens})`
    );
  }

  /**
   * Get a live cost snapshot (Deepgram cost uses current time).
   */
  getCostSnapshot(): CostSnapshot | null {
    if (!this.session) return null;

    const audioMinutes = (Date.now() - this.session.startTime) / 60_000;
    const deepgramCost = audioMinutes * DEEPGRAM_RATE_PER_MINUTE;
    const llmCost = this.computeLLMCost();

    return {
      deepgramCost,
      llmCost,
      totalCost: deepgramCost + llmCost,
      audioMinutes,
      totalInputTokens: this.session.totalInputTokens,
      totalOutputTokens: this.session.totalOutputTokens,
      suggestionCount: this.session.suggestionCount,
      provider: this.session.provider,
      providerLabel: this.session.providerLabel,
      isFreeTier: this.session.isFreeTier,
    };
  }

  /**
   * Freeze the session end time. Call after summary generation completes.
   */
  endSession(): void {
    if (!this.session) return;
    this.session.endTime = Date.now();
    console.debug('[CostTracker] Session ended');
  }

  /**
   * Get the final cost (Deepgram cost uses frozen end time).
   * Must be called after endSession().
   */
  getFinalCost(): CostEstimate | null {
    if (!this.session) return null;

    const endTime = this.session.endTime ?? Date.now();
    const audioMinutes = (endTime - this.session.startTime) / 60_000;
    const deepgramCost = audioMinutes * DEEPGRAM_RATE_PER_MINUTE;
    const llmCost = this.computeLLMCost();

    return {
      deepgramCost,
      llmCost,
      totalCost: deepgramCost + llmCost,
      audioMinutes,
      suggestionCount: this.session.suggestionCount,
      totalInputTokens: this.session.totalInputTokens,
      totalOutputTokens: this.session.totalOutputTokens,
      provider: this.session.provider,
      providerLabel: this.session.providerLabel,
      isFreeTier: this.session.isFreeTier,
    };
  }

  /**
   * Whether a session is currently active.
   */
  get isActive(): boolean {
    return this.session !== null && this.session.endTime === null;
  }

  /**
   * Reset all state (for cleanup after summary is sent).
   */
  reset(): void {
    this.session = null;
  }

  // ── Private ──────────────────────────────────────────────────

  private computeLLMCost(): number {
    if (!this.session) return 0;
    const { pricing, totalInputTokens, totalOutputTokens } = this.session;
    return (totalInputTokens * pricing.inputPerToken) + (totalOutputTokens * pricing.outputPerToken);
  }
}

/** Singleton instance */
export const costTracker = new CostTracker();
