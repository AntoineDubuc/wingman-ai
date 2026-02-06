/**
 * Live test: Hydra multi-persona response division
 *
 * Simulates a sales call transcript and sends it to multiple personas
 * to verify they respond with appropriate expertise or stay silent.
 *
 * Run: npx tsx tests/hydra-live-test.ts
 * Requires: .env file with GEMINI_API_KEY
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read API key from .env file
function loadEnv(): Record<string, string> {
  const envPath = resolve(import.meta.dirname, '../../.env');
  try {
    const content = readFileSync(envPath, 'utf-8');
    const env: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      if (key) env[key.trim()] = valueParts.join('=').trim();
    }
    return env;
  } catch {
    console.error('Error: .env file not found. Copy .env.example to .env and add your API key.');
    throw new Error('.env file not found');
  }
}

const env = loadEnv();
const GEMINI_API_KEY = env.GEMINI_API_KEY;
if (!GEMINI_API_KEY || GEMINI_API_KEY.includes('your-')) {
  console.error('Set GEMINI_API_KEY in .env file');
  throw new Error('GEMINI_API_KEY not configured');
}

// Test personas with distinct expertise
const testPersonas = [
  {
    id: 'sales',
    name: 'Sales Closer',
    color: '#e74c3c',
    systemPrompt: `You are an expert sales closer. Your specialty is:
- Handling objections about price and timing
- Creating urgency without pressure
- Asking for the close at the right moment

Only respond if the conversation involves sales objections, pricing discussions, or closing opportunities.
If the topic is outside your expertise (technical details, legal questions, etc.), respond with just "---" to stay silent.`,
  },
  {
    id: 'technical',
    name: 'Technical Expert',
    color: '#3498db',
    systemPrompt: `You are a technical solutions architect. Your specialty is:
- Explaining product features and integrations
- Answering technical feasibility questions
- Comparing technical approaches

Only respond if the conversation involves technical questions, feature explanations, or integration discussions.
If the topic is outside your expertise (pricing, contracts, etc.), respond with just "---" to stay silent.`,
  },
  {
    id: 'legal',
    name: 'Legal/Compliance',
    color: '#9b59b6',
    systemPrompt: `You are a legal and compliance advisor. Your specialty is:
- Contract terms and conditions
- Data privacy and security compliance
- Regulatory requirements

Only respond if the conversation involves legal terms, compliance questions, or contract discussions.
If the topic is outside your expertise (technical features, pricing strategy, etc.), respond with just "---" to stay silent.`,
  },
];

// Test transcripts designed to trigger specific personas
const testTranscripts = [
  {
    label: 'PRICE OBJECTION (expect: Sales)',
    speaker: 'Prospect',
    text: "Your solution looks great, but honestly the price is about 30% higher than what we budgeted. Is there any flexibility there?",
  },
  {
    label: 'TECHNICAL QUESTION (expect: Technical)',
    speaker: 'Prospect',
    text: "How does your API handle rate limiting? We're doing about 10,000 requests per minute during peak hours.",
  },
  {
    label: 'COMPLIANCE QUESTION (expect: Legal)',
    speaker: 'Prospect',
    text: "We're subject to HIPAA regulations. Can you walk me through how your platform handles PHI data and your BAA process?",
  },
  {
    label: 'GENERAL QUESTION (expect: multiple or none)',
    speaker: 'Prospect',
    text: "Can you tell me a bit more about your company? How long have you been in business?",
  },
];

async function callGemini(systemPrompt: string, userMessage: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 200,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '(no response)';
}

async function runTest() {
  console.log('='.repeat(70));
  console.log('HYDRA LIVE TEST: Multi-Persona Response Division');
  console.log('='.repeat(70));
  console.log();

  for (const transcript of testTranscripts) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`TEST: ${transcript.label}`);
    console.log(`[${transcript.speaker}]: "${transcript.text}"`);
    console.log('─'.repeat(70));

    const userMessage = `[${transcript.speaker}]: ${transcript.text}\n\nProvide a brief suggestion for how to respond, or "---" if this is outside your expertise.`;

    // Call all personas in parallel
    const results = await Promise.all(
      testPersonas.map(async (persona) => {
        try {
          const response = await callGemini(persona.systemPrompt, userMessage);
          return { persona, response };
        } catch (error) {
          return { persona, response: `ERROR: ${error}` };
        }
      })
    );

    // Display results
    for (const { persona, response } of results) {
      const isSilent = response.trim() === '---' || response.includes('---');
      const statusIcon = isSilent ? '🔇' : '💬';
      const shortResponse = isSilent ? '(staying silent)' : response.slice(0, 100) + (response.length > 100 ? '...' : '');

      console.log(`\n${statusIcon} ${persona.name}:`);
      console.log(`   ${shortResponse}`);
    }

    // Summary
    const responding = results.filter(r => !r.response.includes('---'));
    console.log(`\n📊 Summary: ${responding.length}/${testPersonas.length} personas responded`);
    if (responding.length > 0) {
      console.log(`   Responders: ${responding.map(r => r.persona.name).join(', ')}`);
    }

    // Small delay between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(70));
  console.log('TEST COMPLETE');
  console.log('='.repeat(70));
}

runTest().catch(console.error);
