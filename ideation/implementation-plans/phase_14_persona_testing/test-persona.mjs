#!/usr/bin/env node
/**
 * Phase 14 — Persona Testing Script
 *
 * Validates that the KB retrieval pipeline actually injects knowledge base
 * content into Gemini's suggestions. Each persona's KB contains deliberately
 * outlandish information (fake names, absurd stats) that no LLM would
 * generate from training data. If the suggestion references KB content,
 * the pipeline is working.
 *
 * Outputs a detailed Markdown report with dialogue, suggestions, KB markers,
 * and a summary findings table.
 *
 * Usage:
 *   node test-persona.mjs --all                             # test all personas
 *   node test-persona.mjs --persona job-interview-candidate  # test one
 *   node test-persona.mjs --list                             # list personas
 *
 * API key: reads GEMINI_API_KEY from ../wingman-ai/.env or --api-key flag
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-3-pro-preview';
const MAX_TOKENS = 1024;
const TEMPERATURE_FLASH = 0.3;
const TEMPERATURE_PRO3 = 1.0;  // Google: Gemini 3 Pro is optimized for temp=1.0
const REPORT_PATH = join(__dirname, 'PERSONA-TEST-REPORT.md');

// ─── Load .env file ──────────────────────────────────────────────────
function loadEnv() {
  const envPaths = [
    join(__dirname, '..', '..', '..', 'wingman-ai', '.env'),
    join(__dirname, '.env'),
  ];
  for (const p of envPaths) {
    if (existsSync(p)) {
      const lines = readFileSync(p, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
      console.log(`  Loaded .env from: ${p}`);
      return;
    }
  }
}

// ─── Default sample dialogues per persona ────────────────────────────
const DEFAULT_DIALOGUES = {
  'job-interview-candidate': [
    { speaker: 'Interviewer', text: "Thanks for coming in today. Can you tell me a bit about the company culture you're looking for?" },
    { speaker: 'Candidate', text: "I really value collaboration and innovation. I've done some research on your company." },
    { speaker: 'Interviewer', text: "Great. What specifically attracted you to us, and what do you know about our values?" },
    { speaker: 'Candidate', text: "Honestly, I'm still learning about the specifics. Could you tell me more about the team structure?" },
    { speaker: 'Interviewer', text: "Sure. But first, walk me through how you'd handle a situation where you disagree with your manager's approach." },
  ],
  'startup-founder-fundraising': [
    { speaker: 'VC Partner', text: "So walk me through your unit economics. What's your CAC and LTV looking like?" },
    { speaker: 'Founder', text: "We've been seeing strong traction in our target market. Let me pull up the numbers." },
    { speaker: 'VC Partner', text: "Also, who are your main competitors and what's your defensibility?" },
    { speaker: 'Founder', text: "We have a few competitors but our approach is quite different." },
    { speaker: 'VC Partner', text: "Different how? And what's your current burn rate?" },
  ],
  'freelancer-negotiating-rates': [
    { speaker: 'Client', text: "We love your portfolio. What are your rates for a project like this?" },
    { speaker: 'Freelancer', text: "Thanks! It depends on the scope. Can you tell me more about what you need?" },
    { speaker: 'Client', text: "We need a full redesign. Our budget is honestly pretty tight though." },
    { speaker: 'Freelancer', text: "I understand. I want to make sure we find something that works for both of us." },
    { speaker: 'Client', text: "Could you give me a ballpark? We've gotten lower quotes from others." },
  ],
  'nonprofit-grant-pitcher': [
    { speaker: 'Program Officer', text: "Tell me about your organization's theory of change and how this grant would advance it." },
    { speaker: 'ED', text: "Our approach focuses on community-driven solutions. We've seen strong results." },
    { speaker: 'Program Officer', text: "What specific metrics do you track, and what's your evaluation framework?" },
    { speaker: 'ED', text: "We track several indicators. Let me walk you through our methodology." },
    { speaker: 'Program Officer', text: "And how does this align with our foundation's current funding priorities?" },
  ],
  'patient-advocate': [
    { speaker: 'Insurance Rep', text: "I'm looking at your claim and unfortunately this procedure isn't covered under your current plan." },
    { speaker: 'Patient', text: "But my doctor said it was medically necessary. What are my options?" },
    { speaker: 'Insurance Rep', text: "You could file an appeal, but the standard review process takes 30 days." },
    { speaker: 'Patient', text: "Is there an expedited option? This is urgent." },
    { speaker: 'Insurance Rep', text: "There might be, but you'd need to provide additional documentation from your provider." },
  ],
  'tenant-negotiating-lease': [
    { speaker: 'Landlord', text: "So as I mentioned in the email, we're increasing rent by 15% starting next month." },
    { speaker: 'Tenant', text: "That's a significant increase. Can we discuss this?" },
    { speaker: 'Landlord', text: "Market rates have gone up across the board. This is actually below average for the area." },
    { speaker: 'Tenant', text: "I've been a reliable tenant for three years. I've always paid on time." },
    { speaker: 'Landlord', text: "I appreciate that, but we need to keep up with costs. The building needs maintenance too." },
  ],
  'parent-iep-meeting': [
    { speaker: 'School Admin', text: "We've reviewed your child's evaluation and we don't think additional accommodations are warranted at this time." },
    { speaker: 'Parent', text: "I disagree. Their grades have been dropping and the current plan isn't working." },
    { speaker: 'School Admin', text: "The current supports are in line with what we typically provide." },
    { speaker: 'Parent', text: "But the evaluation showed specific areas where more support is needed." },
    { speaker: 'School Admin', text: "We have budget constraints and need to allocate resources across all students." },
  ],
  'small-business-loan-seeker': [
    { speaker: 'Loan Officer', text: "I've reviewed your application. Your revenue looks decent but your debt-to-equity ratio concerns me." },
    { speaker: 'Owner', text: "We've been growing fast and reinvesting heavily. The numbers will improve." },
    { speaker: 'Loan Officer', text: "What collateral can you put up? And what's the loan going to be used for specifically?" },
    { speaker: 'Owner', text: "We need it for inventory and hiring. The business is solid." },
    { speaker: 'Loan Officer', text: "How do you plan to handle repayment if your projections don't materialize?" },
  ],
  'journalist-interviewer': [
    { speaker: 'Source', text: "I can talk about what happened but I need to make sure this stays within certain bounds." },
    { speaker: 'Journalist', text: "Of course. Can you tell me what you witnessed firsthand?" },
    { speaker: 'Source', text: "There were irregularities in the procurement process. Some contracts were awarded without proper bidding." },
    { speaker: 'Journalist', text: "Do you have documentation to support that?" },
    { speaker: 'Source', text: "I have some emails but I'm worried about being identified." },
  ],
  'esl-professional': [
    { speaker: 'Manager', text: "So we need to circle back on the Q3 deliverables and make sure we're all on the same page." },
    { speaker: 'Employee', text: "Yes, I want to make sure I understand correctly. The deadline is end of September?" },
    { speaker: 'Manager', text: "Right, and we need to leverage our synergies with the APAC team. Can you take point on that?" },
    { speaker: 'Employee', text: "Take point... you mean lead the coordination?" },
    { speaker: 'Manager', text: "Exactly. And loop in the stakeholders before EOD Friday. We need buy-in across the board." },
  ],
  'cloud-solutions-sales-consultant': [
    { speaker: 'Prospect CTO', text: "We're looking to migrate our on-prem infrastructure to the cloud. We've been evaluating several providers." },
    { speaker: 'Consultant', text: "Great, I'd love to understand your current setup and requirements better." },
    { speaker: 'Prospect CTO', text: "We have about 200 VMs running legacy Java apps, and we need to maintain strict compliance. We're in healthcare." },
    { speaker: 'Consultant', text: "Healthcare compliance is something we handle frequently. Let me walk you through our approach." },
    { speaker: 'Prospect CTO', text: "What about cost? Our CIO is concerned about cloud sprawl. And do you offer managed services or just consulting?" },
  ],
};

// ─── CLI argument parsing ────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { persona: null, apiKey: null, dialogue: null, list: false, all: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--persona':  opts.persona = args[++i]; break;
      case '--api-key':  opts.apiKey = args[++i]; break;
      case '--dialogue': opts.dialogue = args[++i]; break;
      case '--list':     opts.list = true; break;
      case '--all':      opts.all = true; break;
    }
  }

  if (!opts.apiKey) opts.apiKey = process.env.GEMINI_API_KEY ?? null;
  return opts;
}

// ─── Helpers ─────────────────────────────────────────────────────────
function getPersonaDirs() {
  return readdirSync(__dirname, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();
}

function loadPersona(name) {
  const dir = join(__dirname, name);
  if (!existsSync(dir)) {
    console.error(`Persona folder not found: ${dir}`);
    process.exit(1);
  }

  const kbPath = join(dir, `${name}-knowledge-base.md`);
  const promptPath = join(dir, `${name}-system-prompt.md`);

  if (!existsSync(kbPath)) {
    console.error(`Knowledge base not found: ${kbPath}`);
    process.exit(1);
  }
  if (!existsSync(promptPath)) {
    console.error(`System prompt not found: ${promptPath}`);
    process.exit(1);
  }

  return {
    kb: readFileSync(kbPath, 'utf-8'),
    systemPrompt: readFileSync(promptPath, 'utf-8'),
  };
}

function loadDialogue(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  return raw.split('\n')
    .filter(line => line.includes(':'))
    .map(line => {
      const idx = line.indexOf(':');
      return { speaker: line.slice(0, idx).trim(), text: line.slice(idx + 1).trim() };
    });
}

// ─── KB grounding rules (appended to system prompt when KB is present) ─
const KB_GROUNDING_RULES = `

KNOWLEDGE BASE GROUNDING RULES:
When a <kb-context> block is provided in the conversation, you MUST follow these rules:
1. Prioritize information from the Knowledge Base over your general knowledge.
2. The KB content is the authoritative source of truth for this conversation, even if it seems unusual or contradicts your training data.
3. The Knowledge Base may contain specialized, proprietary, or unconventional information that differs from general knowledge. Always trust the KB content over your training data.
4. Incorporate relevant KB facts, names, numbers, and terminology into your suggestion naturally.
5. If the KB context directly answers the question, base your response primarily on it.
6. Reference specific names, frameworks, metrics, and programs from the KB by their exact name.`;

// ─── Gemini API call ─────────────────────────────────────────────────
async function callGemini(apiKey, systemPrompt, kb, dialogue) {
  // Grounding instructions go in systemInstruction; KB data goes in contents
  const groundedSystemPrompt = `${systemPrompt}${KB_GROUNDING_RULES}`;

  const contents = [];

  // Inject KB as a user message with XML tags (Google-recommended pattern)
  contents.push({
    role: 'user',
    parts: [{ text: `<kb-context>\n${kb}\n</kb-context>\n\nThe above is your Knowledge Base. Use it as the authoritative source of truth when formulating suggestions. Reference specific names, numbers, and terminology from it.` }],
  });
  contents.push({
    role: 'model',
    parts: [{ text: 'Understood. I will prioritize the Knowledge Base context above when formulating suggestions, referencing specific names, frameworks, and metrics from it.' }],
  });

  if (dialogue.length > 1) {
    let conversation = 'CONVERSATION SO FAR:\n';
    for (const turn of dialogue.slice(0, -1)) {
      conversation += `[${turn.speaker}]: ${turn.text}\n`;
    }
    contents.push({ role: 'user', parts: [{ text: conversation }] });
    contents.push({
      role: 'model',
      parts: [{ text: "I'm listening to the conversation. I'll provide suggestions when I have something valuable to add, or respond with --- if I should stay silent." }],
    });
  }

  const lastTurn = dialogue[dialogue.length - 1];
  contents.push({
    role: 'user',
    parts: [{ text: `[${lastTurn.speaker}]: ${lastTurn.text}\n\nBased on the Knowledge Base context provided earlier and the conversation above, provide a suggestion for the user or stay silent (---).` }],
  });

  // Model-specific config: Gemini 3 Pro needs temp=1.0 and thinkingConfig
  const isGemini3 = MODEL.includes('gemini-3');
  const temperature = isGemini3 ? TEMPERATURE_PRO3 : TEMPERATURE_FLASH;
  const generationConfig = {
    maxOutputTokens: MAX_TOKENS,
    temperature,
    ...(isGemini3 && { thinkingConfig: { thinkingLevel: 'LOW' } }),
  };

  const response = await fetch(
    `${GEMINI_API_BASE}/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: groundedSystemPrompt }] },
        generationConfig,
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API ${response.status}: ${err}`);
  }

  const data = await response.json();

  // Debug: log raw response structure for first call
  const parts = data.candidates?.[0]?.content?.parts;
  if (process.env.DEBUG_GEMINI) {
    console.log('  [DEBUG] finishReason:', data.candidates?.[0]?.finishReason);
    console.log('  [DEBUG] parts count:', parts?.length);
    for (let i = 0; i < (parts?.length ?? 0); i++) {
      const p = parts[i];
      console.log(`  [DEBUG] part[${i}]: thought=${p.thought}, hasText=${!!p.text}, hasThoughtSig=${!!p.thoughtSignature}, text=${(p.text || '').slice(0, 80)}`);
    }
  }

  // Gemini 3 Pro returns thinking parts + answer parts. Skip thinking parts.
  if (!Array.isArray(parts)) return '(empty response)';

  let responseText = '';
  for (const part of parts) {
    if (part.thought) continue;  // skip thinking/reasoning parts
    if (part.text) responseText += part.text;
  }

  return responseText.trim() || '(empty response)';
}

// ─── KB reference detection ──────────────────────────────────────────
function extractKBMarkers(kb) {
  const markers = [];
  const lines = kb.split('\n');

  for (const line of lines) {
    const properNouns = line.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) ?? [];
    const acronyms = line.match(/\b[A-Z]{3,}\b/g) ?? [];
    const numbers = line.match(/\$[\d,.]+|\d+\.\d+%|\d{2,}(?:,\d{3})+/g) ?? [];
    const quotedTerms = line.match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) ?? [];

    markers.push(...properNouns, ...acronyms, ...numbers, ...quotedTerms);
  }

  const common = new Set([
    'The', 'How', 'What', 'When', 'Why', 'This', 'That', 'Your', 'Our',
    'API', 'ROI', 'CEO', 'CTO', 'CFO', 'SBA', 'USD', 'LLC', 'CPT',
    'For', 'All', 'And', 'Not', 'Can', 'May', 'Has', 'Are', 'Not',
    'Knowledge Base', 'System Prompt', 'Quick Reference',
  ]);
  return [...new Set(markers)].filter(m => m.length > 2 && !common.has(m));
}

function checkKBReferences(suggestion, kbMarkers) {
  const found = [];
  const suggestionLower = suggestion.toLowerCase();

  for (const marker of kbMarkers) {
    if (suggestionLower.includes(marker.toLowerCase())) {
      found.push(marker);
    }
  }

  return found;
}

// ─── Extract top distinctive KB terms (human-readable) ───────────────
// Pulls the most recognizable outlandish names/terms from the KB
function extractTopKBTerms(kb, limit = 8) {
  const terms = [];
  const lines = kb.split('\n');

  for (const line of lines) {
    // Grab bold terms: **Something Here**
    const boldTerms = line.match(/\*\*([^*]+)\*\*/g)?.map(s => s.replace(/\*\*/g, '')) ?? [];
    // Grab quoted terms: "Something Here"
    const quotedTerms = line.match(/"([^"]{4,60})"/g)?.map(s => s.replace(/"/g, '')) ?? [];
    terms.push(...boldTerms, ...quotedTerms);
  }

  // Filter out generic labels, keep the outlandish ones
  const boring = new Set([
    'Founded', 'Headquarters', 'Employees', 'Revenue', 'Challenge', 'Solution', 'Result',
    'Mission Statement', 'Stock Ticker', 'Key Programs', 'Core Products', 'WARNING',
    'Salary Bands', 'Equity', 'Unlimited PTO', 'Wellness Stipend', 'Parental Leave',
    'Professional Development', 'Retirement', 'Coverage Quirks', 'Known Issues',
    'Specialty', 'Certifications', 'Rate Benchmarks', 'Hourly Rates', 'Retainer Tiers',
    'Portfolio Highlights', 'Our Organization', 'Your Insurance Plan', 'Your Rental Situation',
    'Governing Legislation', 'Key Evaluation Types', 'Lending Institutions', 'Loan Programs',
    'P', 'R', 'I', 'S', 'M', 'T', 'O', 'N', 'A', 'D', 'B', 'L', 'E', 'W',
  ]);
  const unique = [...new Set(terms)].filter(t => t.length > 3 && !boring.has(t));
  return unique.slice(0, limit);
}

// ─── Markdown report generation ──────────────────────────────────────
function generateReport(results) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const errors = results.filter(r => r.status === 'ERROR').length;

  let md = '';

  // Header
  md += `# Phase 14 — Persona Test Report\n\n`;
  md += `**Generated**: ${timestamp}  \n`;
  md += `**Model**: ${MODEL}  \n`;
  md += `**Personas tested**: ${results.length}  \n`;
  md += `**Pass rate**: ${passed}/${results.length} (${Math.round(passed / results.length * 100)}%)\n\n`;

  // ── Master results table ──
  md += `## Results Overview\n\n`;
  md += `| # | Persona | Result | What the chat said (last line) | What Gemini suggested | KB terms Gemini used | KB terms it SHOULD have used |\n`;
  md += `|---|---------|--------|-------------------------------|----------------------|---------------------|-----------------------------|\n`;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const result = r.status === 'PASS' ? '✅ PASS' : r.status === 'FAIL' ? '❌ FAIL' : '⚠️ ERROR';

    if (r.status === 'ERROR') {
      md += `| ${i + 1} | ${r.persona} | ${result} | — | Error: ${r.error} | — | — |\n`;
      continue;
    }

    const lastLine = r.dialogue.length > 0
      ? `**${r.dialogue[r.dialogue.length - 1].speaker}**: "${r.dialogue[r.dialogue.length - 1].text.slice(0, 80)}${r.dialogue[r.dialogue.length - 1].text.length > 80 ? '...' : ''}"`
      : '—';

    const suggestion = r.suggestion.replace(/\n/g, ' ').slice(0, 120) + (r.suggestion.length > 120 ? '...' : '');
    const usedTerms = r.kbRefsFound.length > 0 ? r.kbRefsFound.slice(0, 4).map(m => `**${m}**`).join(', ') : '_None_';
    const shouldHaveUsed = r.topKBTerms.slice(0, 4).map(m => `${m}`).join(', ');

    md += `| ${i + 1} | ${r.persona} | ${result} | ${lastLine} | ${suggestion} | ${usedTerms} | ${shouldHaveUsed} |\n`;
  }

  md += `\n`;

  // ── Detailed sections per persona ──
  md += `---\n\n`;
  md += `## Detailed Test Results\n\n`;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    md += `### ${i + 1}. ${r.persona} — ${r.status === 'PASS' ? '✅ PASS' : r.status === 'FAIL' ? '❌ FAIL' : '⚠️ ERROR'}\n\n`;

    if (r.status === 'ERROR') {
      md += `**Error**: ${r.error}\n\n---\n\n`;
      continue;
    }

    // Full dialogue
    md += `**Dialogue fed to Gemini:**\n\n`;
    for (const turn of r.dialogue) {
      md += `> **${turn.speaker}:** ${turn.text}\n>\n`;
    }
    md += `\n`;

    // What Gemini said
    md += `**What Gemini suggested:**\n\n`;
    md += `> ${r.suggestion.split('\n').join('\n> ')}\n\n`;

    // What it referenced from KB
    if (r.kbRefsFound.length > 0) {
      md += `**KB terms Gemini actually used** (${r.kbRefsFound.length} found):\n\n`;
      for (const marker of r.kbRefsFound) {
        const kbLine = r.kbLines.find(l => l.toLowerCase().includes(marker.toLowerCase()));
        const context = kbLine ? kbLine.trim().slice(0, 120) : '';
        md += `- **${marker}** — from KB: _${context}_\n`;
      }
      md += `\n`;
    }

    // What it SHOULD have referenced
    md += `**Key KB terms it should have referenced** (top outlandish markers):\n\n`;
    for (const term of r.topKBTerms) {
      const wasUsed = r.kbRefsFound.some(ref => ref.toLowerCase() === term.toLowerCase() || term.toLowerCase().includes(ref.toLowerCase()));
      md += `- ${wasUsed ? '✅' : '❌'} ${term}\n`;
    }
    md += `\n`;

    // Verdict
    if (r.status === 'PASS') {
      md += `**Verdict**: Gemini pulled KB-specific content into its suggestion. The terms above are fabricated and would never appear in LLM training data, confirming the KB pipeline injected them.\n\n`;
    } else {
      md += `**Verdict**: Gemini gave a generic response without referencing any KB-specific content. The dialogue may not have triggered a specific enough question, or the KB context was too long for the model to prioritize the outlandish terms.\n\n`;
    }

    md += `---\n\n`;
  }

  return md;
}

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
  loadEnv();
  const opts = parseArgs();

  if (opts.list) {
    console.log('\nAvailable personas:');
    for (const dir of getPersonaDirs()) {
      const hasKB = existsSync(join(__dirname, dir, `${dir}-knowledge-base.md`));
      const hasPrompt = existsSync(join(__dirname, dir, `${dir}-system-prompt.md`));
      const status = hasKB && hasPrompt ? '✅' : '⚠️  (incomplete)';
      console.log(`  ${status} ${dir}`);
    }
    return;
  }

  if (!opts.apiKey) {
    console.error('No API key. Use --api-key YOUR_KEY or set GEMINI_API_KEY in .env');
    process.exit(1);
  }

  const personas = opts.all ? getPersonaDirs() : [opts.persona];

  if (!opts.all && !opts.persona) {
    console.error('Specify --persona <name>, --all, or --list');
    process.exit(1);
  }

  console.log(`\n🔬 Phase 14 Persona Testing — ${personas.length} persona(s)\n`);
  console.log(`  Model: ${MODEL}`);
  console.log(`  Report: ${REPORT_PATH}\n`);

  const results = [];

  for (let i = 0; i < personas.length; i++) {
    const persona = personas[i];
    console.log(`[${i + 1}/${personas.length}] Testing: ${persona}...`);

    try {
      const { kb, systemPrompt } = loadPersona(persona);
      const kbLines = kb.split('\n');

      let dialogue;
      if (opts.dialogue) {
        dialogue = loadDialogue(opts.dialogue);
      } else if (DEFAULT_DIALOGUES[persona]) {
        dialogue = DEFAULT_DIALOGUES[persona];
      } else {
        console.log(`  ⚠️  No default dialogue, skipping`);
        results.push({ persona, status: 'ERROR', error: 'No dialogue available', kbRefsFound: [], totalMarkers: 0, allMarkers: [], kbLines: [], dialogue: [], suggestion: '', topKBTerms: [] });
        continue;
      }

      const suggestion = await callGemini(opts.apiKey, systemPrompt, kb, dialogue);
      const allMarkers = extractKBMarkers(kb);
      const kbRefsFound = checkKBReferences(suggestion, allMarkers);
      const topKBTerms = extractTopKBTerms(kb);

      const status = kbRefsFound.length > 0 ? 'PASS' : 'FAIL';

      console.log(`  ${status === 'PASS' ? '✅' : '❌'} ${kbRefsFound.length}/${allMarkers.length} KB markers found`);
      if (kbRefsFound.length > 0) {
        console.log(`     Top: ${kbRefsFound.slice(0, 3).join(', ')}`);
      }

      results.push({ persona, status, suggestion, dialogue, kbRefsFound, totalMarkers: allMarkers.length, allMarkers, kbLines, topKBTerms });

      // Rate limit pause between calls
      if (i < personas.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (err) {
      console.log(`  ⚠️ Error: ${err.message}`);
      results.push({ persona, status: 'ERROR', error: err.message, kbRefsFound: [], totalMarkers: 0, allMarkers: [], kbLines: [], dialogue: [], suggestion: '', topKBTerms: [] });

      // Longer pause on error (likely rate limit)
      if (i < personas.length - 1) {
        console.log(`  Waiting 10s before next request...`);
        await new Promise(r => setTimeout(r, 10000));
      }
    }
  }

  // Generate and write report
  const report = generateReport(results);
  writeFileSync(REPORT_PATH, report, 'utf-8');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const errors = results.filter(r => r.status === 'ERROR').length;

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed, ${errors} errors`);
  console.log(`Report saved: ${REPORT_PATH}`);
  console.log(`${'─'.repeat(50)}\n`);

  process.exit(failed + errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
