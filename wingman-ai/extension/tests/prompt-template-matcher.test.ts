/**
 * Tests for prompt-template-matcher.
 *
 * Tests keyword matching, cosine similarity math, hash generation,
 * and cache behavior. Embedding-based matching is not tested here
 * (requires live Gemini API).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  matchByKeyword,
  cosineSimilarity,
  computeTemplateHash,
  clearTemplateEmbeddingCache,
} from '../src/services/prompt-template-matcher';
import { DEFAULT_PERSONA_TEMPLATES } from '../src/shared/default-personas';

// === KEYWORD MATCHING ===

describe('matchByKeyword', () => {
  it('matches "job interview" to Job Interview Candidate', () => {
    const result = matchByKeyword('I need help with a job interview');
    expect(result).not.toBeNull();
    expect(result!.templateName).toBe('Job Interview Candidate');
    expect(result!.similarity).toBe(1.0);
    expect(result!.template.name).toBe('Job Interview Candidate');
  });

  it('matches "fundraising" to Startup Founder', () => {
    const result = matchByKeyword('I want coaching for fundraising calls with investors');
    expect(result).not.toBeNull();
    expect(result!.templateName).toBe('Startup Founder (Fundraising)');
    expect(result!.similarity).toBe(1.0);
  });

  it('matches "freelancer" to Freelancer template', () => {
    const result = matchByKeyword('I am a freelancer negotiating rates');
    expect(result).not.toBeNull();
    expect(result!.templateName).toBe('Freelancer (Rate Negotiation)');
  });

  it('matches "nonprofit" to Nonprofit Grant Pitcher', () => {
    const result = matchByKeyword('I run a nonprofit and need help pitching grants');
    expect(result).not.toBeNull();
    expect(result!.templateName).toBe('Nonprofit Grant Pitcher');
  });

  it('matches "patient advocate" to Patient Advocate', () => {
    const result = matchByKeyword('I need a patient advocate for my medical appointment');
    expect(result).not.toBeNull();
    expect(result!.templateName).toBe('Patient Advocate');
  });

  it('matches "tenant" to Tenant template', () => {
    const result = matchByKeyword('I am a tenant negotiating my lease');
    expect(result).not.toBeNull();
    expect(result!.templateName).toBe('Tenant (Lease Negotiation)');
  });

  it('matches "IEP meeting" to Parent template', () => {
    const result = matchByKeyword('Help me prepare for my child\'s IEP meeting');
    expect(result).not.toBeNull();
    expect(result!.templateName).toBe('Parent (IEP Meeting)');
  });

  it('matches "small business loan" to Small Business Loan Seeker', () => {
    const result = matchByKeyword('I need help getting a small business loan');
    expect(result).not.toBeNull();
    expect(result!.templateName).toBe('Small Business Loan Seeker');
  });

  it('matches "journalist" to Journalist Interviewer', () => {
    const result = matchByKeyword('I\'m a journalist conducting interviews');
    expect(result).not.toBeNull();
    expect(result!.templateName).toBe('Journalist Interviewer');
  });

  it('matches "ESL" to ESL Professional', () => {
    const result = matchByKeyword('I need ESL support for business meetings');
    expect(result).not.toBeNull();
    expect(result!.templateName).toBe('ESL Professional');
  });

  it('matches "cloud sales" to Cloud Solutions Sales Consultant', () => {
    const result = matchByKeyword('I sell cloud solutions to enterprises');
    expect(result).not.toBeNull();
    expect(result!.templateName).toBe('Cloud Solutions Sales Consultant');
  });

  it('matches case-insensitively', () => {
    const result = matchByKeyword('FUNDRAISING pitch for my STARTUP');
    expect(result).not.toBeNull();
    expect(result!.templateName).toBe('Startup Founder (Fundraising)');
  });

  it('matches template name directly', () => {
    const result = matchByKeyword('I want something like the Cloud Solutions Sales Consultant');
    expect(result).not.toBeNull();
    expect(result!.templateName).toBe('Cloud Solutions Sales Consultant');
  });

  it('returns null for unrelated input', () => {
    const result = matchByKeyword('I want to plan my vacation to Hawaii');
    expect(result).toBeNull();
  });

  it('returns null for empty input', () => {
    const result = matchByKeyword('');
    expect(result).toBeNull();
  });

  it('returns null for generic business input', () => {
    const result = matchByKeyword('help me with my meetings');
    expect(result).toBeNull();
  });
});

// === COSINE SIMILARITY ===

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = [1, 0, 0, 0];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it('returns -1.0 for opposite vectors', () => {
    const a = [1, 0];
    const b = [-1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it('returns correct similarity for known vectors', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    // cosine = (4+10+18) / (sqrt(14) * sqrt(77)) = 32 / sqrt(1078) ≈ 0.9746
    const expected = 32 / Math.sqrt(14 * 77);
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 5);
  });

  it('handles zero vectors gracefully', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('handles both zero vectors', () => {
    const a = [0, 0];
    const b = [0, 0];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('is symmetric', () => {
    const a = [1, 3, -5];
    const b = [4, -2, -1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });

  it('works with high-dimensional vectors', () => {
    const dim = 768;
    const a = Array.from({ length: dim }, (_, i) => Math.sin(i));
    const b = Array.from({ length: dim }, (_, i) => Math.cos(i));
    const result = cosineSimilarity(a, b);
    // Just verify it returns a number in [-1, 1]
    expect(result).toBeGreaterThanOrEqual(-1);
    expect(result).toBeLessThanOrEqual(1);
  });
});

// === HASH GENERATION ===

describe('computeTemplateHash', () => {
  it('returns a consistent hash for the same input', () => {
    const hash1 = computeTemplateHash(DEFAULT_PERSONA_TEMPLATES);
    const hash2 = computeTemplateHash(DEFAULT_PERSONA_TEMPLATES);
    expect(hash1).toBe(hash2);
  });

  it('returns an 8-character hex string', () => {
    const hash = computeTemplateHash(DEFAULT_PERSONA_TEMPLATES);
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('produces different hashes for different templates', () => {
    const hash1 = computeTemplateHash(DEFAULT_PERSONA_TEMPLATES);
    const modified = [
      { ...DEFAULT_PERSONA_TEMPLATES[0]!, systemPrompt: 'modified prompt' },
    ];
    const hash2 = computeTemplateHash(modified);
    expect(hash1).not.toBe(hash2);
  });

  it('handles empty template array', () => {
    const hash = computeTemplateHash([]);
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });
});

// === CACHE MANAGEMENT ===

describe('clearTemplateEmbeddingCache', () => {
  beforeEach(async () => {
    await chrome.storage.local.set({
      templateEmbeddings: { version: 'abc', embeddings: {} },
    });
  });

  it('removes the cache key from storage', async () => {
    await clearTemplateEmbeddingCache();

    const result = await chrome.storage.local.get(['templateEmbeddings']);
    expect(result.templateEmbeddings).toBeUndefined();
  });
});
