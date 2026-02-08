/**
 * Prompt Setup Assistant -- Discovery Chat Engine
 *
 * Orchestrates the AI conversation that discovers user intent and
 * generates model-optimized system prompts. Uses Gemini direct API
 * (always, regardless of user's active provider).
 */

import { DEFAULT_PERSONA_TEMPLATES } from '../shared/default-personas';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DISCOVERY_MODEL = 'gemini-2.5-flash';
const DISCOVERY_TEMPERATURE = 0.5;

// === TYPES ===

export interface DiscoveryParams {
  useCase: string;
  tone: string;
  style: string;
  language: string;
  silenceRules: string;
  kbStatus: string;
  competitors: string[];
  templateMatch?: string;
}

export interface GenerationSnapshot {
  generationNumber: number;
  promptText: string;
  modelId: string;
  testQuestions: GeneratedTestQuestion[];
}

export interface GeneratedTestQuestion {
  text: string;
  expectedBehavior: 'respond' | 'silent';
  groupLabel?: string;
  behaviorHint?: string;
}

// === STATE ===

let conversationHistory: Array<{ role: 'user' | 'model'; text: string }> = [];
let discoveredParams: Partial<DiscoveryParams> = {};
let generationCount = 0;
let lastGeneratedPrompt: string | null = null;

// === META-PROMPT ===

const DISCOVERY_META_PROMPT = `You are a prompt engineering assistant for Wingman AI, a Chrome extension that provides real-time AI suggestions during Google Meet calls.

Your job is to help users create effective system prompts for their personas. You guide them through a discovery conversation to understand their needs, then generate an optimized prompt.

## How Wingman Works
- During a Google Meet call, Wingman listens to the conversation transcript
- It provides short, actionable suggestion cards (1-3 sentences) that appear as a floating overlay
- The AI must decide when to suggest (valuable moments) vs stay silent (conversation flowing naturally)
- When staying silent, the AI responds with exactly "---"
- Each persona has a system prompt that defines its behavior, focus areas, and response rules

## Your Discovery Process
1. Ask what the persona should help with (use case)
2. Ask about tone and style preferences
3. Ask about specific topics, competitors, or industry context
4. Note if KB documents are attached (you'll be told)
5. Summarize what you've learned before generating

## Response Format
- Keep responses concise (2-3 sentences max per message)
- Ask ONE question at a time (not multiple)
- Use natural, friendly language
- When you detect a match with a built-in template, mention it
- End your discovery with a clear summary of what you'll generate

## Built-in Templates Available
${getTemplateNames()}

If the user's description closely matches one of these, suggest they could use it as a starting point.

## After Discovery
When you have enough information, provide a JSON summary in this exact format (and ONLY this format):
\`\`\`json
{"ready": true, "useCase": "...", "tone": "...", "style": "...", "language": "English", "silenceRules": "...", "competitors": [...], "templateMatch": "template name or null"}
\`\`\``;

function getTemplateNames(): string {
  return DEFAULT_PERSONA_TEMPLATES.map(t => `- ${t.name}`).join('\n');
}

// === PUBLIC API ===

/**
 * Start a fresh discovery conversation.
 */
export function startDiscovery(): void {
  conversationHistory = [];
  discoveredParams = {};
  generationCount = 0;
  lastGeneratedPrompt = null;
}

/**
 * Set KB status so the discovery engine can mention KB docs in conversation.
 */
export function setKBStatus(docNames: string[]): void {
  if (docNames.length > 0) {
    discoveredParams.kbStatus = `${docNames.length} KB documents attached: ${docNames.join(', ')}`;
  } else {
    discoveredParams.kbStatus = 'No KB documents attached';
  }
}

/**
 * Send a user message and get the bot's response.
 * Returns the bot's reply text.
 */
export async function sendMessage(userText: string): Promise<string> {
  conversationHistory.push({ role: 'user', text: userText });

  const apiKey = await getGeminiKey();
  if (!apiKey) throw new Error('Gemini API key not configured');

  const contents = conversationHistory.map(turn => ({
    role: turn.role,
    parts: [{ text: turn.text }],
  }));

  const response = await fetch(
    `${GEMINI_API_BASE}/${DISCOVERY_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: DISCOVERY_META_PROMPT }] },
        contents,
        generationConfig: {
          temperature: DISCOVERY_TEMPERATURE,
          maxOutputTokens: 1024,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Gemini API error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data: unknown = await response.json();
  const botText = extractResponseText(data);

  conversationHistory.push({ role: 'model', text: botText });

  // Check if bot provided a ready JSON summary
  const jsonMatch = botText.match(/```json\s*(\{[\s\S]*?\})\s*```/);
  if (jsonMatch?.[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
      if (parsed.ready) {
        discoveredParams = {
          useCase: String(parsed.useCase ?? ''),
          tone: String(parsed.tone ?? ''),
          style: String(parsed.style ?? ''),
          language: String(parsed.language ?? 'English'),
          silenceRules: String(parsed.silenceRules ?? ''),
          competitors: Array.isArray(parsed.competitors)
            ? (parsed.competitors as unknown[]).map(c => String(c))
            : [],
          templateMatch: parsed.templateMatch ? String(parsed.templateMatch) : undefined,
        };
      }
    } catch {
      // JSON parse failed -- not ready yet, continue conversation
    }
  }

  return botText;
}

/**
 * Check if discovery is complete (bot provided parameters).
 */
export function isDiscoveryComplete(): boolean {
  return !!discoveredParams.useCase;
}

/**
 * Get discovered parameters.
 */
export function getDiscoveredParams(): Partial<DiscoveryParams> {
  return { ...discoveredParams };
}

/**
 * Generate a system prompt based on discovered parameters.
 * Uses Gemini to create the prompt, then returns it for model-specific adaptation.
 */
export async function generatePrompt(
  params: Partial<DiscoveryParams>,
  kbDocNames: string[],
): Promise<{ promptText: string; testQuestions: GeneratedTestQuestion[] }> {
  const apiKey = await getGeminiKey();
  if (!apiKey) throw new Error('Gemini API key not configured');

  const generationPrompt = buildGenerationPrompt(params, kbDocNames, conversationHistory);

  const response = await fetch(
    `${GEMINI_API_BASE}/${DISCOVERY_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: generationPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Generation failed: ${response.status}`);
  }

  const data: unknown = await response.json();
  const rawText = extractResponseText(data);

  // Parse the generation output
  const result = parseGenerationOutput(rawText);

  generationCount++;
  lastGeneratedPrompt = result.promptText;

  return result;
}

/**
 * Get the last generated prompt (for B-flow comparison).
 */
export function getLastGeneratedPrompt(): string | null {
  return lastGeneratedPrompt;
}

/**
 * Get current generation count.
 */
export function getGenerationCount(): number {
  return generationCount;
}

/**
 * Generate test questions from an existing prompt (no discovery needed).
 * Used when the test harness opens but no stored test questions exist.
 */
export async function generateTestQuestionsFromPrompt(
  promptText: string,
): Promise<GeneratedTestQuestion[]> {
  const apiKey = await getGeminiKey();
  if (!apiKey) throw new Error('Gemini API key not configured');

  const instruction = [
    'Given this system prompt, generate 6 test questions to validate it.',
    'Generate 3 questions where the AI SHOULD respond (relevant to the prompt\'s domain),',
    'and 3 questions where the AI SHOULD stay silent (off-topic or casual conversation).',
    '',
    'System prompt:',
    '---',
    promptText.slice(0, 6000),
    '---',
    '',
    'Return ONLY valid JSON in this format (no markdown fences, no extra text):',
    '{"testQuestions": [',
    '  {"text": "...", "expectedBehavior": "respond"},',
    '  {"text": "...", "expectedBehavior": "silent"}',
    ']}',
  ].join('\n');

  const response = await fetch(
    `${GEMINI_API_BASE}/${DISCOVERY_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: instruction }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
          // Disable thinking — we just need raw JSON, no reasoning
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to generate test questions: ${response.status}`);
  }

  const data: unknown = await response.json();
  const rawText = extractResponseText(data);

  console.log('[PromptAssistant] Raw test-question response length:', rawText.length);
  console.debug('[PromptAssistant] Raw test-question response:', rawText.slice(0, 500));

  if (!rawText) {
    throw new Error('Empty response from Gemini — check your API key');
  }

  // Parse -- try fenced JSON first, then raw JSON, then search for JSON object
  let jsonStr = rawText.trim();
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced?.[1]) {
    jsonStr = fenced[1].trim();
  } else {
    // Try to find a JSON object in the raw text (skip any preamble)
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      jsonStr = rawText.slice(jsonStart, jsonEnd + 1);
    }
  }

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    if (Array.isArray(parsed.testQuestions) && parsed.testQuestions.length > 0) {
      return (parsed.testQuestions as Record<string, unknown>[]).map(q => ({
        text: String(q.text ?? ''),
        expectedBehavior: q.expectedBehavior === 'silent' ? 'silent' as const : 'respond' as const,
      }));
    }
  } catch (parseErr) {
    console.error('[PromptAssistant] JSON parse failed:', parseErr, 'Input:', jsonStr.slice(0, 300));
  }

  throw new Error('Could not parse test questions from response');
}

/**
 * Build re-enter context message for returning users.
 */
export function buildReenterContext(
  personaName: string,
  currentVersion: number,
  testResults?: { passed: number; total: number },
  promptSummary?: string,
): string {
  let msg = `Welcome back to **${personaName}**. Your current prompt is on **v${currentVersion}**`;
  if (testResults) {
    msg += ` (last tested ${testResults.passed}/${testResults.total} pass)`;
  }
  msg += '.';
  if (promptSummary) {
    msg += `\n\nCurrent prompt focuses on: ${promptSummary}`;
  }
  return msg;
}

/**
 * Reset all state (on modal close).
 */
export function resetState(): void {
  conversationHistory = [];
  discoveredParams = {};
  generationCount = 0;
  lastGeneratedPrompt = null;
  console.debug('[PromptAssistant] State cleared');
}

// === PRIVATE HELPERS ===

/** Safely extract text from a Gemini API response (handles thinking models). */
function extractResponseText(data: unknown): string {
  try {
    const obj = data as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      }>;
    };
    const parts = obj?.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) return '';

    // For thinking models (2.5 Flash), skip parts marked as thought
    const nonThought = parts.filter(p => !p.thought && p.text);
    if (nonThought.length > 0) {
      return nonThought.map(p => p.text ?? '').join('');
    }

    // Fallback: return first text part
    return parts[0]?.text ?? '';
  } catch {
    return '';
  }
}

async function getGeminiKey(): Promise<string | null> {
  const storage = await chrome.storage.local.get(['geminiApiKey']);
  return (storage.geminiApiKey as string) ?? null;
}

function buildGenerationPrompt(
  params: Partial<DiscoveryParams>,
  kbDocNames: string[],
  conversation: Array<{ role: 'user' | 'model'; text: string }>,
): string {
  const parts = [
    'Generate a complete Wingman AI system prompt based on these requirements.',
    '',
  ];

  // Include the actual conversation so Gemini has full context
  if (conversation.length > 0) {
    parts.push('## Discovery Conversation');
    for (const turn of conversation) {
      const label = turn.role === 'user' ? 'User' : 'Assistant';
      parts.push(`${label}: ${turn.text}`);
    }
    parts.push('');
    parts.push('## Extracted Parameters (may be incomplete — use conversation above as primary source)');
  }

  parts.push(`Use case: ${params.useCase ?? 'General assistant'}`);
  parts.push(`Tone: ${params.tone ?? 'Professional and concise'}`);
  parts.push(`Style: ${params.style ?? 'Direct'}`);
  parts.push(`Language: ${params.language ?? 'English'}`);
  parts.push(`Silence rules: ${params.silenceRules ?? 'Stay silent when conversation flows naturally'}`);

  if (params.competitors && params.competitors.length > 0) {
    parts.push(`Competitors to position against: ${params.competitors.join(', ')}`);
  }

  if (kbDocNames.length > 0) {
    parts.push(`Knowledge Base documents available: ${kbDocNames.join(', ')}`);
    parts.push('Include instructions to cite KB data with source filename attribution.');
  }

  parts.push('');
  parts.push('The prompt MUST follow this structure:');
  parts.push('1. # [Title] -- System Prompt');
  parts.push('2. ## Your Role -- what the AI does');
  parts.push('3. ## Core Focus -- topic expertise areas');
  parts.push('4. ## Response Rules -- when to suggest vs stay silent');
  parts.push('5. ## Example Formats -- 2-3 example suggestion formats');
  if (kbDocNames.length > 0) {
    parts.push('6. ## Knowledge Base Instructions -- how to use KB data');
  }
  parts.push('');
  parts.push('Keep the prompt under 8000 characters. Use markdown formatting (headings, bullets).');
  parts.push('Do NOT include JSON or code blocks in the system prompt itself.');
  parts.push('');
  parts.push('After the prompt, provide 6 test questions in this JSON format:');
  parts.push('```json');
  parts.push('{"testQuestions": [');
  parts.push('  {"text": "...", "expectedBehavior": "respond", "groupLabel": "SHOULD RESPOND"},');
  parts.push('  {"text": "...", "expectedBehavior": "silent", "groupLabel": "SHOULD STAY SILENT"}');
  parts.push(']}');
  parts.push('```');
  parts.push('Generate 3 "respond" and 3 "silent" questions relevant to the use case.');

  return parts.join('\n');
}

function parseGenerationOutput(rawText: string): {
  promptText: string;
  testQuestions: GeneratedTestQuestion[];
} {
  let promptText = rawText;
  let testQuestions: GeneratedTestQuestion[] = [];

  // Try to extract JSON test questions
  const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch?.[1]) {
    // Remove the JSON block from the prompt text
    promptText = rawText.replace(/```json[\s\S]*?```/, '').trim();

    try {
      const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
      if (Array.isArray(parsed.testQuestions)) {
        testQuestions = (parsed.testQuestions as Record<string, unknown>[]).map(
          (q) => ({
            text: String(q.text ?? ''),
            expectedBehavior:
              q.expectedBehavior === 'silent'
                ? ('silent' as const)
                : ('respond' as const),
            groupLabel: q.groupLabel ? String(q.groupLabel) : undefined,
            behaviorHint: q.behaviorHint ? String(q.behaviorHint) : undefined,
          }),
        );
      }
    } catch {
      // Failed to parse test questions -- return prompt without them
    }
  }

  // Clean up any markdown code fences around the prompt itself
  promptText = promptText.replace(/^```(?:markdown)?\s*\n?/, '').replace(/\n?```\s*$/, '');

  return { promptText: promptText.trim(), testQuestions };
}

/**
 * Get the user's active model info for display.
 */
export async function getActiveModelInfo(): Promise<{
  modelId: string;
  provider: string;
  label: string;
}> {
  const storage = await chrome.storage.local.get([
    'llmProvider',
    'openrouterModel',
    'groqModel',
  ]);
  const provider = (storage.llmProvider as string) ?? 'gemini';

  switch (provider) {
    case 'openrouter':
      return {
        modelId:
          (storage.openrouterModel as string) ?? 'google/gemini-2.5-flash',
        provider: 'OpenRouter',
        label: (storage.openrouterModel as string) ?? 'Gemini 2.5 Flash',
      };
    case 'groq':
      return {
        modelId:
          (storage.groqModel as string) ??
          'meta-llama/llama-4-scout-17b-16e-instruct',
        provider: 'Groq',
        label: (storage.groqModel as string) ?? 'Llama 4 Scout',
      };
    default:
      return {
        modelId: 'gemini-2.5-flash',
        provider: 'Direct',
        label: 'Gemini 2.5 Flash',
      };
  }
}
