import { describe, it, expect, vi } from 'vitest';
import {
  getModelPricing,
  DEEPGRAM_RATE_PER_MINUTE,
  PROVIDER_FREE_TIER,
  PRICING_LAST_UPDATED,
  checkPricingStaleness,
} from '../src/shared/pricing';
import { GROQ_MODELS, OPENROUTER_MODELS } from '../src/shared/llm-config';

describe('Pricing Table', () => {
  describe('getModelPricing', () => {
    it('returns pricing for Gemini direct model', () => {
      const pricing = getModelPricing('gemini-2.5-flash');
      expect(pricing.inputPerToken).toBeGreaterThan(0);
      expect(pricing.outputPerToken).toBeGreaterThan(0);
    });

    it('returns pricing for every Groq model', () => {
      for (const model of GROQ_MODELS) {
        const pricing = getModelPricing(model.id);
        expect(pricing.inputPerToken, `Missing pricing for Groq model: ${model.id}`).toBeGreaterThan(0);
        expect(pricing.outputPerToken, `Missing pricing for Groq model: ${model.id}`).toBeGreaterThan(0);
      }
    });

    it('returns pricing for every OpenRouter model', () => {
      for (const model of OPENROUTER_MODELS) {
        const pricing = getModelPricing(model.id);
        expect(pricing.inputPerToken, `Missing pricing for OR model: ${model.id}`).toBeGreaterThan(0);
        expect(pricing.outputPerToken, `Missing pricing for OR model: ${model.id}`).toBeGreaterThan(0);
      }
    });

    it('returns fallback pricing for unknown model', () => {
      const pricing = getModelPricing('unknown/model-xyz');
      expect(pricing.inputPerToken).toBeGreaterThan(0);
      expect(pricing.outputPerToken).toBeGreaterThan(0);
    });

    it('fallback matches Gemini Flash rates', () => {
      const fallback = getModelPricing('unknown/model-xyz');
      const flash = getModelPricing('gemini-2.5-flash');
      expect(fallback.inputPerToken).toBe(flash.inputPerToken);
      expect(fallback.outputPerToken).toBe(flash.outputPerToken);
    });

    it('output rate >= input rate for all models', () => {
      const allModels = [
        'gemini-2.5-flash',
        ...GROQ_MODELS.map(m => m.id),
        ...OPENROUTER_MODELS.map(m => m.id),
      ];
      for (const id of allModels) {
        const p = getModelPricing(id);
        expect(p.outputPerToken, `Output < input for ${id}`).toBeGreaterThanOrEqual(p.inputPerToken);
      }
    });
  });

  describe('Deepgram pricing', () => {
    it('DEEPGRAM_RATE_PER_MINUTE is a positive number', () => {
      expect(DEEPGRAM_RATE_PER_MINUTE).toBeGreaterThan(0);
      expect(DEEPGRAM_RATE_PER_MINUTE).toBeLessThan(0.1); // sanity: less than $0.10/min
    });
  });

  describe('Free tier flags', () => {
    it('Gemini has free tier', () => {
      expect(PROVIDER_FREE_TIER.gemini).toBe(true);
    });

    it('Groq has free tier', () => {
      expect(PROVIDER_FREE_TIER.groq).toBe(true);
    });

    it('OpenRouter does not have free tier', () => {
      expect(PROVIDER_FREE_TIER.openrouter).toBe(false);
    });
  });

  describe('Pricing staleness', () => {
    it('PRICING_LAST_UPDATED is a valid date string', () => {
      const date = new Date(PRICING_LAST_UPDATED);
      expect(date.getTime()).not.toBeNaN();
    });

    it('does not warn when pricing is fresh', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.useFakeTimers();
      vi.setSystemTime(new Date(PRICING_LAST_UPDATED).getTime() + 30 * 86_400_000); // 30 days
      checkPricingStaleness();
      expect(spy).not.toHaveBeenCalled();
      vi.useRealTimers();
      spy.mockRestore();
    });

    it('warns when pricing is stale (>90 days)', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.useFakeTimers();
      vi.setSystemTime(new Date(PRICING_LAST_UPDATED).getTime() + 100 * 86_400_000); // 100 days
      checkPricingStaleness();
      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0]?.[0]).toContain('Pricing data is');
      vi.useRealTimers();
      spy.mockRestore();
    });
  });
});
