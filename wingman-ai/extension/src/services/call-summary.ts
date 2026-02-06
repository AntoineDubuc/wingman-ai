/**
 * Call Summary Types, Prompt Builder, and Markdown Formatter
 *
 * Pure module with no Chrome extension runtime dependencies.
 * Used by GeminiClient (service worker) and overlay (content script).
 */

import type { CollectedTranscript } from './transcript-collector';
import type { CostEstimate } from '@shared/pricing';

// --- Types ---

export interface ActionItem {
  owner: 'you' | 'them';
  text: string;
}

export interface KeyMoment {
  text: string;
  timestamp?: string;
  type: 'signal' | 'objection' | 'decision' | 'quote';
}

export interface PersonaStats {
  id: string;
  name: string;
  color: string;
  suggestionCount: number;
}

export interface SummaryMetadata {
  generatedAt: string;
  durationMinutes: number;
  speakerCount: number;
  transcriptCount: number;
  /** Hydra: personas used during the call with suggestion counts */
  personas?: PersonaStats[];
}

export interface CallSummary {
  summary: string[];
  actionItems: ActionItem[];
  keyMoments: KeyMoment[];
  metadata: SummaryMetadata;
  costEstimate?: CostEstimate;
}

// --- Prompt Builder ---

const TRUNCATION_THRESHOLD = 500;
const KEEP_FIRST = 50;
const KEEP_LAST = 400;

/**
 * Build the Gemini prompt for call summary generation.
 *
 * Speaker attribution: "You" is the Wingman user (sales rep),
 * "Participant" is the prospect/customer. Determined by audio channel index.
 */
export function buildSummaryPrompt(
  transcripts: CollectedTranscript[],
  metadata: SummaryMetadata,
  options: { includeKeyMoments: boolean }
): string {
  // Truncate long transcripts: keep first 50 + last 400
  let transcriptLines: string[];
  let truncationNote = '';

  if (transcripts.length > TRUNCATION_THRESHOLD) {
    const first = transcripts.slice(0, KEEP_FIRST);
    const last = transcripts.slice(-KEEP_LAST);
    transcriptLines = [
      ...first.map(formatTranscriptLine),
      '',
      '[Note: Middle portion of a longer conversation has been omitted.]',
      '',
      ...last.map(formatTranscriptLine),
    ];
    truncationNote = ` (truncated from ${transcripts.length} entries)`;
  } else {
    transcriptLines = transcripts.map(formatTranscriptLine);
  }

  const keyMomentsInstruction = options.includeKeyMoments
    ? `
"keyMoments": An array of 2-5 notable quotes or signals from the call. Each object has:
  - "text": The exact or near-exact quote
  - "type": One of "signal" (buying signal, budget mention), "objection" (concern, pushback), "decision" (agreement, commitment), or "quote" (notable statement)
If there are no notable moments, return an empty array [].`
    : `
"keyMoments": Return an empty array [] for this field.`;

  return `You are analyzing a sales call transcript to produce a structured summary.

## Speaker Attribution
- "You" is the Wingman user (the sales rep). Label their actions as "you".
- "Participant" is the prospect/customer. Label their actions as "them".

## Call Metadata
- Duration: ${metadata.durationMinutes} minutes
- Speakers: ${metadata.speakerCount}
- Transcript entries: ${metadata.transcriptCount}${truncationNote}

## Transcript
${transcriptLines.join('\n')}

## Instructions
Analyze the transcript above and return a JSON object with this exact schema:

{
  "summary": ["string"],
  "actionItems": [{"owner": "you|them", "text": "string"}],
  "keyMoments": [{"text": "string", "type": "signal|objection|decision|quote"}]
}

Field requirements:

"summary": An array of 1-5 topic-organized bullet points summarizing what was discussed. Focus on topics and outcomes, not chronological events. Each bullet should be a complete sentence.

"actionItems": An array of commitments or follow-ups identified in the call. Each object has:
  - "owner": "you" if the sales rep ("You") committed to it, "them" if the prospect/customer ("Participant") committed to it
  - "text": A concise description of the action item
If no action items were identified, return an empty array [].
${keyMomentsInstruction}

Return ONLY valid JSON. Do not wrap in markdown code blocks. Do not include any text outside the JSON object.`;
}

function formatTranscriptLine(t: CollectedTranscript): string {
  return `[${t.speaker}]: ${t.text}`;
}

// --- Markdown Formatter ---

/**
 * Format a CallSummary as markdown suitable for CRM paste or Drive file.
 *
 * Empty section rules:
 * - Empty actionItems: omit ### Action Items heading entirely
 * - Empty keyMoments: omit ### Key Moments heading entirely
 * - Empty summary: show fallback bullet "- No summary available"
 *
 * Date formatting: explicit en-US locale for consistent output.
 * No emojis — they render inconsistently across CRMs.
 */
export function formatSummaryAsMarkdown(summary: CallSummary): string {
  const date = new Date(summary.metadata.generatedAt).toLocaleDateString(
    'en-US',
    { month: 'short', day: 'numeric', year: 'numeric' }
  );

  const lines: string[] = [];

  // Header
  lines.push(`## Call Summary — ${date}`);
  lines.push(
    `**Duration:** ${summary.metadata.durationMinutes} min | **Speakers:** ${summary.metadata.speakerCount}`
  );
  lines.push('');

  // Summary bullets
  lines.push('### Summary');
  if (summary.summary.length === 0) {
    lines.push('- No summary available');
  } else {
    for (const bullet of summary.summary) {
      lines.push(`- ${bullet}`);
    }
  }

  // Action Items (omit if empty)
  if (summary.actionItems.length > 0) {
    lines.push('');
    lines.push('### Action Items');
    for (const item of summary.actionItems) {
      const owner = item.owner === 'you' ? 'You' : 'Them';
      lines.push(`- [ ] **${owner}:** ${item.text}`);
    }
  }

  // Key Moments (omit if empty)
  if (summary.keyMoments.length > 0) {
    lines.push('');
    lines.push('### Key Moments');
    for (const moment of summary.keyMoments) {
      const timestamp = moment.timestamp ? ` (${moment.timestamp})` : '';
      lines.push(`- "${moment.text}"${timestamp}`);
    }
  }

  // Personas Used (omit if absent or single persona with no suggestions)
  const personas = summary.metadata.personas;
  if (personas && personas.length > 0) {
    const totalSuggestions = personas.reduce((sum, p) => sum + p.suggestionCount, 0);
    if (personas.length > 1 || totalSuggestions > 0) {
      lines.push('');
      lines.push('### Personas Used');
      for (const persona of personas) {
        const countLabel = persona.suggestionCount === 1 ? 'suggestion' : 'suggestions';
        lines.push(`- ${persona.name} — ${persona.suggestionCount} ${countLabel}`);
      }
    }
  }

  // Cost estimate (omit if absent)
  if (summary.costEstimate) {
    const cost = summary.costEstimate;
    const minutes = Math.round(cost.audioMinutes);
    const llmLabel = cost.isFreeTier
      ? `${cost.providerLabel} (free tier)`
      : `${cost.providerLabel} (${cost.suggestionCount} calls)`;
    const llmValue = cost.isFreeTier ? 'Free' : `$${cost.llmCost.toFixed(3)}`;

    lines.push('');
    lines.push('### Session Cost Estimate');
    lines.push(`- Deepgram STT (${minutes} min): $${cost.deepgramCost.toFixed(3)}`);
    lines.push(`- ${llmLabel}: ${llmValue}`);
    lines.push(`- **Total: ~$${cost.totalCost.toFixed(2)}**`);
  }

  lines.push('');
  return lines.join('\n');
}
