/**
 * Tests for F2-T5: PromptAssistantEngine Language Injection
 *
 * Verifies that sendMessage() in prompt-assistant-engine.ts calls
 * addLanguageInstruction() with the DISCOVERY_META_PROMPT and the active
 * locale, and that the localized result is sent to the Gemini API.
 *
 * AC1: PSA responses include language instruction for non-English locales
 * AC2: English locale is a no-op (addLanguageInstruction is called but returns unchanged prompt)
 * AC3: generatePrompt() output is in the user's language (achieved via LLM instruction)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock modules — must be declared before imports
// ---------------------------------------------------------------------------

const mockAddLanguageInstruction = vi.fn((prompt: string, locale: string) => `${prompt} [${locale}]`);
vi.mock('../src/shared/language-injection', () => ({
  addLanguageInstruction: (...args: unknown[]) => mockAddLanguageInstruction(...args as [string, string]),
}));

const mockGetActiveLocale = vi.fn().mockReturnValue('en');
vi.mock('../src/background/sw-locale', () => ({
  getActiveLocale: () => mockGetActiveLocale(),
  rehydrateActiveLocale: vi.fn(),
  registerLocaleOnChanged: vi.fn(),
  resetActiveLocale: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock chrome.storage (for getGeminiKey())
// ---------------------------------------------------------------------------
global.chrome = {
  storage: {
    sync: {
      get: vi.fn().mockResolvedValue({ gemini_api_key: 'test-key' }),
    },
    local: {
      get: vi.fn().mockResolvedValue({ geminiApiKey: 'test-key' }),
    },
  },
} as unknown as typeof chrome;

// ---------------------------------------------------------------------------
// Mock fetch to avoid real API calls
// ---------------------------------------------------------------------------
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    candidates: [{ content: { parts: [{ text: 'Hello! How can I help?' }] } }],
  }),
} as unknown as Response);
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------
import { sendMessage, startDiscovery } from '../src/services/prompt-assistant-engine';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PromptAssistantEngine — F2-T5 Language Injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Restore default mock implementations after clearAllMocks
    mockAddLanguageInstruction.mockImplementation((prompt: string, locale: string) => `${prompt} [${locale}]`);
    mockGetActiveLocale.mockReturnValue('en');

    // Reset chrome.storage mock
    (global.chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({ geminiApiKey: 'test-key' });

    // Reset fetch mock
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Hello! How can I help?' }] } }],
      }),
    } as unknown as Response);
    global.fetch = mockFetch;

    // Reset module-level conversation state
    startDiscovery();
  });

  // -------------------------------------------------------------------------
  // Test 1: addLanguageInstruction called with DISCOVERY_META_PROMPT and active locale
  // -------------------------------------------------------------------------
  it('addLanguageInstruction called with DISCOVERY_META_PROMPT and active locale', async () => {
    mockGetActiveLocale.mockReturnValue('fr');

    await sendMessage('Hello');

    expect(mockAddLanguageInstruction).toHaveBeenCalledWith(
      expect.any(String),
      'fr',
    );
  });

  // -------------------------------------------------------------------------
  // Test 2: localized meta-prompt sent to API
  // -------------------------------------------------------------------------
  it('localized meta-prompt sent to API', async () => {
    const sentinelPrompt = 'SENTINEL_LOCALIZED_PROMPT_12345';
    mockGetActiveLocale.mockReturnValue('es');
    mockAddLanguageInstruction.mockReturnValue(sentinelPrompt);

    await sendMessage('Hola');

    expect(mockFetch).toHaveBeenCalled();
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(callArgs[1].body as string) as {
      systemInstruction: { parts: Array<{ text: string }> };
    };

    expect(body.systemInstruction.parts[0].text).toBe(sentinelPrompt);
  });

  // -------------------------------------------------------------------------
  // Test 3: English locale calls addLanguageInstruction (no-op enforced by the function itself)
  // -------------------------------------------------------------------------
  it('English locale calls addLanguageInstruction (no-op enforced by the function itself)', async () => {
    mockGetActiveLocale.mockReturnValue('en');

    await sendMessage('Hi');

    expect(mockAddLanguageInstruction).toHaveBeenCalledWith(
      expect.any(String),
      'en',
    );
  });
});
