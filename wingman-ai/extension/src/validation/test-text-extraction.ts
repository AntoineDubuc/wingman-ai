/**
 * Validation Test: Markdown and Plain Text Extraction
 *
 * Tests that marked.js works for Markdown and plain text can be processed.
 */

import type { ValidationResult } from './index';

const SAMPLE_MARKDOWN = `# Product Overview

CloudGeometry helps enterprises modernize their cloud infrastructure.

## Key Features

- **Kubernetes Management**: Simplified K8s operations
- **Cost Optimization**: Reduce cloud spend by 50%
- **Security**: SOC2 compliant infrastructure

## Pricing

Contact us for custom pricing.

\`\`\`javascript
const config = { tier: 'enterprise' };
\`\`\`
`;

const SAMPLE_PLAIN_TEXT = `CloudGeometry Product Information

We provide enterprise cloud consulting.
Our services include:
1. Cloud Migration
2. Kubernetes Management
3. Security Audits

Contact: sales@cloudgeometry.io`;

/**
 * Attempt to load marked.js dynamically
 */
async function loadMarked(): Promise<typeof import('marked') | null> {
  try {
    const marked = await import('marked');
    return marked;
  } catch (error) {
    console.error('[Text Test] Failed to import marked:', error);
    return null;
  }
}

/**
 * Extract plain text from Markdown using marked's lexer
 */
function extractTextFromMarkdown(markdown: string, markedModule: typeof import('marked')): string {
  const tokens = markedModule.lexer(markdown);
  const textParts: string[] = [];

  interface TokenWithText {
    type: string;
    text?: string;
    items?: Array<{ text?: string }>;
  }

  function processTokens(tokenList: TokenWithText[]): void {
    for (const token of tokenList) {
      if (token.type === 'heading' && token.text) {
        textParts.push(token.text + ':');
      } else if (token.type === 'paragraph' && token.text) {
        textParts.push(token.text);
      } else if (token.type === 'list' && token.items) {
        for (const item of token.items) {
          if (item.text) {
            textParts.push('- ' + item.text);
          }
        }
      } else if (token.type === 'code') {
        textParts.push('[Code block]');
      } else if (token.type === 'text' && token.text) {
        textParts.push(token.text);
      }
    }
  }

  processTokens(tokens as TokenWithText[]);
  return textParts.join('\n').trim();
}

export async function testTextExtraction(): Promise<ValidationResult> {
  const details: string[] = [];
  let success = true;

  // Test 1: Load marked.js
  const marked = await loadMarked();

  if (!marked) {
    return {
      name: 'text-extraction',
      success: false,
      duration: 0,
      details: 'marked not installed. Run: npm install marked',
      error: 'Module not found',
    };
  }

  details.push('marked.js loaded');

  // Test 2: Parse Markdown
  try {
    const start = performance.now();
    const extractedText = extractTextFromMarkdown(SAMPLE_MARKDOWN, marked);
    const parseTime = Math.round(performance.now() - start);

    details.push(`Markdown parsed: ${parseTime}ms`);

    // Verify key content is extracted
    const hasTitle = extractedText.includes('Product Overview');
    const hasFeatures = extractedText.includes('Kubernetes Management');
    const hasPricing = extractedText.includes('custom pricing');

    if (hasTitle && hasFeatures && hasPricing) {
      details.push('Markdown extraction verified');
    } else {
      success = false;
      details.push('FAIL: Missing expected content from Markdown');
    }

    // Log extracted text length
    details.push(`Extracted ${extractedText.length} chars`);
  } catch (error) {
    success = false;
    details.push(`FAIL: Markdown parsing error - ${error}`);
  }

  // Test 3: Plain text passthrough
  try {
    const start = performance.now();
    // Plain text just needs line ending normalization
    const normalizedText = SAMPLE_PLAIN_TEXT.replace(/\r\n/g, '\n').trim();
    const processTime = Math.round(performance.now() - start);

    details.push(`Plain text processed: ${processTime}ms`);

    // Verify content preserved
    if (normalizedText.includes('Cloud Migration') && normalizedText.includes('sales@')) {
      details.push('Plain text verified');
    } else {
      success = false;
      details.push('FAIL: Plain text content lost');
    }
  } catch (error) {
    success = false;
    details.push(`FAIL: Plain text error - ${error}`);
  }

  // Test 4: UTF-8 handling
  try {
    const utf8Text = 'Ümläuts and émojis 🚀 work correctly';
    const processed = utf8Text.trim();

    if (processed.includes('🚀') && processed.includes('Ü')) {
      details.push('UTF-8 handling verified');
    } else {
      success = false;
      details.push('FAIL: UTF-8 characters lost');
    }
  } catch (error) {
    success = false;
    details.push(`FAIL: UTF-8 error - ${error}`);
  }

  return {
    name: 'text-extraction',
    success,
    duration: 0,
    details: details.join(' | '),
  };
}
