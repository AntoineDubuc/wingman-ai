/**
 * Tests for F2-T2: GeminiClient Language Injection
 *
 * Verifies that addLanguageInstruction() is called at both LLM call sites:
 *  1. generateResponse() (called by processTranscript())
 *  2. processTranscriptForPersona()
 *
 * Tests use the spy-on-addLanguageInstruction approach to avoid needing
 * a full Gemini API mock setup (cooldowns, rate limits, etc. are all
 * bypassed by mocking the module).
 *
 * AC1: processTranscript() appends "Respond in French only." for locale='fr'
 * AC2: processTranscript() returns prompt unchanged for locale='en'
 * AC3: processTranscriptForPersona() applies injection to persona.systemPrompt
 * AC4: Public method signatures unchanged
 * AC5: generateCallSummary() applies locale injection via buildSummaryPrompt (F2-T4)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';

// ---------------------------------------------------------------------------
// Mock: language-injection — spy on addLanguageInstruction
// ---------------------------------------------------------------------------
vi.mock('../src/shared/language-injection', () => ({
  addLanguageInstruction: vi.fn((prompt: string, locale: string) => {
    // Replicate real behavior so we can also test the output
    if (locale === 'en') return prompt;
    const names: Record<string, string> = {
      fr: 'French', es: 'Spanish', de: 'German', ru: 'Russian',
      ro: 'Romanian', pt: 'Portuguese', it: 'Italian', nl: 'Dutch',
      pl: 'Polish', tr: 'Turkish', ja: 'Japanese', ko: 'Korean',
      zh: 'Chinese', ar: 'Arabic', hi: 'Hindi', vi: 'Vietnamese',
    };
    const name = names[locale] ?? locale;
    return `${prompt}\n\nRespond in ${name} only.`;
  }),
}));

// ---------------------------------------------------------------------------
// Mock: sw-locale — control getActiveLocale return value
// ---------------------------------------------------------------------------
vi.mock('../src/background/sw-locale', () => ({
  getActiveLocale: vi.fn().mockReturnValue('en'),
  rehydrateActiveLocale: vi.fn().mockResolvedValue(undefined),
  registerLocaleOnChanged: vi.fn(),
  resetActiveLocale: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: KB search — no-op to avoid unrelated failures
// ---------------------------------------------------------------------------
vi.mock('../src/services/kb/kb-search', () => ({
  getKBContext: vi.fn().mockResolvedValue({ matched: false, context: null, source: null }),
}));

// ---------------------------------------------------------------------------
// Mock: cost-tracker — no-op
// ---------------------------------------------------------------------------
vi.mock('../src/services/cost-tracker', () => ({
  costTracker: {
    addLLMUsage: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------
import { addLanguageInstruction } from '../src/shared/language-injection';
import { getActiveLocale } from '../src/background/sw-locale';
import { GeminiClient } from '../src/services/gemini-client';

// Typed spies
const addLangSpy = vi.mocked(addLanguageInstruction);
const getLocaleSpy = vi.mocked(getActiveLocale);

// ---------------------------------------------------------------------------
// Mock fetch helper
// ---------------------------------------------------------------------------
function makeMockFetch(responseText = 'Test suggestion') {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: vi.fn().mockReturnValue(null) },
    json: async () => ({
      candidates: [{ content: { parts: [{ text: responseText }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
    }),
    text: async () => JSON.stringify({
      candidates: [{ content: { parts: [{ text: responseText }] } }],
    }),
  } as unknown as Response);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function createClientWithApiKey(): Promise<GeminiClient> {
  // Set Gemini API key in storage so loadProviderConfig() succeeds
  await fakeBrowser.storage.local.set({ geminiApiKey: 'test-api-key-123' });
  const client = new GeminiClient();
  await client.loadProviderConfig();
  return client;
}

const SAMPLE_PERSONA = {
  id: 'persona-1',
  name: 'Sales Pro',
  color: '#3b82f6',
  icon: undefined,
  systemPrompt: 'You are a sales expert. Help close deals.',
  kbDocumentIds: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GeminiClient Language Injection — F2-T2', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.clearAllMocks();
    // Reset locale to English by default
    getLocaleSpy.mockReturnValue('en');
  });

  // -------------------------------------------------------------------------
  // AC1 + AC2: processTranscript / generateResponse
  // -------------------------------------------------------------------------

  describe('processTranscript / generateResponse', () => {
    it('AC1: calls addLanguageInstruction with French locale', async () => {
      getLocaleSpy.mockReturnValue('fr');
      global.fetch = makeMockFetch();

      const client = await createClientWithApiKey();
      // Bypass cooldown: set suggestionCooldownMs to 0
      // We can do this by calling processTranscript without prior history
      await client.processTranscript('Hello world foo bar baz', 'Agent', true);

      expect(addLangSpy).toHaveBeenCalledWith(expect.any(String), 'fr');
    });

    it('AC1: system prompt sent to API contains "Respond in French only." for locale=fr', async () => {
      getLocaleSpy.mockReturnValue('fr');
      const mockFetch = makeMockFetch();
      global.fetch = mockFetch;

      const client = await createClientWithApiKey();
      await client.processTranscript('Hello world foo bar baz', 'Agent', true);

      // Verify fetch was called
      expect(mockFetch).toHaveBeenCalled();

      // Parse the request body sent to Gemini API
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      // Gemini format: systemInstruction.parts[0].text
      const systemText = body?.systemInstruction?.parts?.[0]?.text ?? '';
      expect(systemText).toContain('Respond in French only.');
    });

    it('AC2: addLanguageInstruction is called with "en" and prompt is unchanged', async () => {
      getLocaleSpy.mockReturnValue('en');
      const mockFetch = makeMockFetch();
      global.fetch = mockFetch;

      const client = await createClientWithApiKey();
      await client.processTranscript('Hello world foo bar baz', 'Agent', true);

      // addLanguageInstruction should be called with 'en'
      expect(addLangSpy).toHaveBeenCalledWith(expect.any(String), 'en');

      // For English, the function is a no-op — system prompt should NOT contain "Respond in"
      if (mockFetch.mock.calls.length > 0) {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        const systemText = body?.systemInstruction?.parts?.[0]?.text ?? '';
        expect(systemText).not.toContain('Respond in');
      }
    });

    it('AC2: processTranscript returns null for non-final transcripts (guard check)', async () => {
      const client = await createClientWithApiKey();
      const result = await client.processTranscript('Hello world', 'Agent', false);
      expect(result).toBeNull();
      expect(addLangSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // AC3: processTranscriptForPersona
  // -------------------------------------------------------------------------

  describe('processTranscriptForPersona', () => {
    it('AC3: calls addLanguageInstruction with Spanish locale for persona', async () => {
      getLocaleSpy.mockReturnValue('es');
      global.fetch = makeMockFetch();

      const client = await createClientWithApiKey();
      await client.processTranscriptForPersona(
        'Hello world foo bar baz',
        'Agent',
        true,
        SAMPLE_PERSONA
      );

      expect(addLangSpy).toHaveBeenCalledWith(expect.any(String), 'es');
    });

    it('AC3: system prompt for persona contains "Respond in Spanish only." for locale=es', async () => {
      getLocaleSpy.mockReturnValue('es');
      const mockFetch = makeMockFetch();
      global.fetch = mockFetch;

      const client = await createClientWithApiKey();
      await client.processTranscriptForPersona(
        'Hello world foo bar baz',
        'Agent',
        true,
        SAMPLE_PERSONA
      );

      expect(mockFetch).toHaveBeenCalled();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const systemText = body?.systemInstruction?.parts?.[0]?.text ?? '';
      expect(systemText).toContain('Respond in Spanish only.');
    });

    it('AC3: uses persona.systemPrompt, not this.systemPrompt', async () => {
      getLocaleSpy.mockReturnValue('en');
      const mockFetch = makeMockFetch();
      global.fetch = mockFetch;

      const client = await createClientWithApiKey();
      // Set a different system prompt on the instance
      client.setSystemPrompt(
        'This is the instance system prompt — should NOT appear in persona calls. ' +
        'A sufficiently long string to pass the 50-char minimum validation check here.'
      );

      const personaWithDistinctPrompt = {
        ...SAMPLE_PERSONA,
        systemPrompt: 'UNIQUE_PERSONA_PROMPT: You are the persona expert specializing in widgets and gadgets.',
      };

      await client.processTranscriptForPersona(
        'Hello world foo bar baz',
        'Agent',
        true,
        personaWithDistinctPrompt
      );

      expect(mockFetch).toHaveBeenCalled();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const systemText = body?.systemInstruction?.parts?.[0]?.text ?? '';
      expect(systemText).toContain('UNIQUE_PERSONA_PROMPT');
      expect(systemText).not.toContain('This is the instance system prompt');
    });

    it('AC3: addLanguageInstruction receives persona.systemPrompt as first argument', async () => {
      getLocaleSpy.mockReturnValue('fr');
      global.fetch = makeMockFetch();

      const client = await createClientWithApiKey();
      const personaWithDistinctPrompt = {
        ...SAMPLE_PERSONA,
        systemPrompt: 'MARKER_PERSONA_PROMPT: specialized sales assistant for enterprise clients.',
      };

      await client.processTranscriptForPersona(
        'Hello world foo bar baz',
        'Agent',
        true,
        personaWithDistinctPrompt
      );

      // addLanguageInstruction should have been called with a string containing the persona prompt
      expect(addLangSpy).toHaveBeenCalledWith(
        expect.stringContaining('MARKER_PERSONA_PROMPT'),
        'fr'
      );
    });
  });

  // -------------------------------------------------------------------------
  // AC4: Public method signatures unchanged
  // -------------------------------------------------------------------------

  describe('AC4: Public API signatures', () => {
    it('processTranscript signature is unchanged', () => {
      const client = new GeminiClient();
      expect(typeof client.processTranscript).toBe('function');
      expect(client.processTranscript.length).toBe(3); // text, speaker, isFinal
    });

    it('processTranscriptForPersona signature is unchanged', () => {
      const client = new GeminiClient();
      expect(typeof client.processTranscriptForPersona).toBe('function');
      expect(client.processTranscriptForPersona.length).toBe(4); // text, speaker, isFinal, persona
    });

    it('generateCallSummary signature is unchanged', () => {
      const client = new GeminiClient();
      expect(typeof client.generateCallSummary).toBe('function');
      expect(client.generateCallSummary.length).toBe(3); // transcripts, metadata, options
    });
  });

  // -------------------------------------------------------------------------
  // AC5: generateCallSummary DOES call addLanguageInstruction (F2-T4)
  // -------------------------------------------------------------------------

  describe('AC5: generateCallSummary applies locale injection via buildSummaryPrompt', () => {
    it('generateCallSummary calls addLanguageInstruction with active locale', async () => {
      getLocaleSpy.mockReturnValue('fr');
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue(null) },
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  summary: ['Meeting went well'],
                  actionItems: [],
                  keyMoments: [],
                }),
              }],
            },
          }],
          usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 50 },
        }),
        text: async () => '',
      } as unknown as Response);
      global.fetch = mockFetch;

      // Set up API key in storage
      await fakeBrowser.storage.local.set({ geminiApiKey: 'test-api-key-123' });
      const client = new GeminiClient();
      await client.loadProviderConfig();

      // generateCallSummary requires transcripts and metadata
      await client.generateCallSummary(
        [{
          speaker: 'Agent',
          text: 'Hello',
          timestamp: new Date().toISOString(),
          speaker_id: 0,
          speaker_role: 'agent',
          is_self: true,
        }],
        { generatedAt: new Date().toISOString(), durationMinutes: 1, speakerCount: 1, transcriptCount: 1 },
        { includeKeyMoments: false }
      );

      // addLanguageInstruction should have been called for summary with 'fr' locale (F2-T4)
      expect(addLangSpy).toHaveBeenCalledWith(expect.any(String), 'fr');
    });
  });
});
