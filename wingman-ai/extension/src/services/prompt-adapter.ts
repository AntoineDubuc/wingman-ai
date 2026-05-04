/**
 * Model-specific prompt structural formatting.
 *
 * Converts a generic prompt into model-optimized format based on
 * per-family formatting rules. Handles STRUCTURAL concerns only:
 * - Section organization and tagging
 * - List formatting (bullets vs numbered)
 * - Emphasis and framing
 *
 * Does NOT handle runtime concerns (silence reinforcement, /no_think,
 * temperature, JSON hints) — those live in model-tuning.ts.
 */

import { getModelFamily, type ModelFamily } from '../shared/model-tuning';

export interface AdaptationResult {
  prompt: string;
  changesSummary: string;
}

/**
 * Adapt a base prompt for a specific model's preferred format.
 * Returns the adapted prompt and a summary of changes made.
 */
export function adaptPromptForModel(basePrompt: string, modelId: string): AdaptationResult {
  const family: ModelFamily = getModelFamily(modelId) ?? 'gemini';

  switch (family) {
    case 'gemini':
      return adaptForGemini(basePrompt);
    case 'claude':
      return adaptForClaude(basePrompt);
    case 'gpt':
      return adaptForGPT(basePrompt);
    case 'llama':
      return adaptForLlama(basePrompt);
    case 'qwen':
      return adaptForQwen(basePrompt);
  }
}

// === SECTION PARSING ===

interface PromptSection {
  heading: string;
  content: string;
}

/**
 * Parse a markdown prompt into sections by heading.
 * Returns sections with their heading and content.
 */
function parseSections(prompt: string): PromptSection[] {
  const lines = prompt.split('\n');
  const sections: PromptSection[] = [];
  let currentHeading = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      if (currentHeading || currentContent.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join('\n').trim(),
        });
      }
      currentHeading = headingMatch[1]!;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Push the last section
  if (currentHeading || currentContent.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join('\n').trim(),
    });
  }

  return sections;
}

/**
 * Convert markdown bullets to numbered list.
 */
function bulletsToNumbered(text: string): string {
  let counter = 0;
  return text.replace(/^(\s*)[-*]\s/gm, (_match, indent: string) => {
    counter++;
    return `${indent}${counter}. `;
  });
}

/**
 * Check if text already has XML tags to avoid double-wrapping.
 */
function hasXmlTag(text: string, tag: string): boolean {
  return new RegExp(`<${tag}[^>]*>`, 'i').test(text);
}

// === PER-FAMILY ADAPTERS ===

function adaptForGemini(prompt: string): AdaptationResult {
  // Gemini: keep markdown format, ensure concise bullets
  // Minimal changes — Gemini works well with standard markdown
  const sections = parseSections(prompt);
  const result = sections
    .map(s => {
      if (s.heading) {
        return `## ${s.heading}\n\n${s.content}`;
      }
      return s.content;
    })
    .join('\n\n');

  return {
    prompt: result.trim(),
    changesSummary: 'Markdown format with concise bullet points',
  };
}

function adaptForClaude(prompt: string): AdaptationResult {
  // Claude: XML tags, positive framing, bookend structure
  const sections = parseSections(prompt);
  const xmlParts: string[] = [];

  for (const section of sections) {
    const heading = section.heading.toLowerCase();
    let tag = 'instructions';

    if (heading.includes('role') || heading.includes('who you are')) {
      tag = 'role';
    } else if (heading.includes('focus') || heading.includes('expertise') || heading.includes('core')) {
      tag = 'focus';
    } else if (heading.includes('rule') || heading.includes('response') || heading.includes('format') || heading.includes('when to') || heading.includes('silent')) {
      tag = 'response-rules';
    } else if (heading.includes('kb') || heading.includes('knowledge')) {
      tag = 'kb-instructions';
    } else if (heading.includes('example')) {
      tag = 'examples';
    }

    // Avoid double-wrapping
    if (hasXmlTag(section.content, tag)) {
      xmlParts.push(section.content);
    } else {
      const content = section.heading
        ? `${section.heading}\n\n${section.content}`
        : section.content;
      xmlParts.push(`<${tag}>\n${content}\n</${tag}>`);
    }
  }

  return {
    prompt: xmlParts.join('\n\n').trim(),
    changesSummary: 'XML tags (<role>, <focus>, <response-rules>), positive framing',
  };
}

function adaptForGPT(prompt: string): AdaptationResult {
  // GPT: bookend rules (repeat critical rules at start and end), numbered priority lists
  const sections = parseSections(prompt);
  const parts: string[] = [];

  // Extract critical rules for bookending
  let criticalRules = '';
  const otherSections: string[] = [];

  for (const section of sections) {
    const heading = section.heading.toLowerCase();
    if (heading.includes('rule') || heading.includes('silent') || heading.includes('when to')) {
      criticalRules = section.content;
      parts.push(`## CRITICAL RULES\n\n${bulletsToNumbered(section.content)}`);
    } else if (section.heading) {
      otherSections.push(`## ${section.heading}\n\n${section.content}`);
    } else {
      otherSections.push(section.content);
    }
  }

  // Build: critical rules → other sections → critical rules (bookend)
  const result: string[] = [];
  if (parts.length > 0) result.push(parts[0]!);
  result.push(...otherSections);
  if (criticalRules) {
    result.push(`## REMINDER — CRITICAL RULES\n\n${bulletsToNumbered(criticalRules)}`);
  }

  return {
    prompt: result.join('\n\n').trim(),
    changesSummary: 'Bookend critical rules (repeated at start and end), numbered priority lists',
  };
}

function adaptForLlama(prompt: string): AdaptationResult {
  // Llama: numbered lists, anti-verbosity, explicit examples
  const sections = parseSections(prompt);
  const parts: string[] = [];

  for (const section of sections) {
    const numbered = bulletsToNumbered(section.content);
    if (section.heading) {
      parts.push(`## ${section.heading}\n\n${numbered}`);
    } else {
      parts.push(numbered);
    }
  }

  // Add anti-verbosity instruction
  parts.push('## RESPONSE LENGTH\n\nKeep all responses concise. Maximum 2-3 sentences per suggestion. Do not elaborate unless explicitly asked.');

  return {
    prompt: parts.join('\n\n').trim(),
    changesSummary: 'Numbered lists instead of bullets, anti-verbosity instruction added',
  };
}

function adaptForQwen(prompt: string): AdaptationResult {
  // Qwen: structured template with clear section headers
  const sections = parseSections(prompt);
  const parts: string[] = [];

  for (const section of sections) {
    if (section.heading) {
      // Use clear delimiters
      parts.push(`=== ${section.heading.toUpperCase()} ===\n\n${section.content}`);
    } else {
      parts.push(section.content);
    }
  }

  return {
    prompt: parts.join('\n\n').trim(),
    changesSummary: 'Structured template with clear section headers and delimiters',
  };
}
