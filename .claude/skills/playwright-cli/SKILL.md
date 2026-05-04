---
name: "playwright-cli"
description: "Browser automation using Playwright CLI in headless mode. Use for screenshots, form testing, UI verification, interactive browser automation, and AI Studio interactions. 4x cheaper on tokens than Playwright MCP."
---

# Playwright CLI — Browser Automation Skill

Use Playwright CLI commands via Bash for browser automation. This is **4x cheaper on tokens** than the Playwright MCP server. Use this for screenshots, testing, form filling, AI Studio automation, and UI verification.

---

## When to Use Which Tool

| Task | Tool | Command pattern |
|------|------|-----------------|
| Interactive form filling, clicking | `@playwright/cli` | `playwright-cli open URL` → `snapshot` → `fill` → `click` |
| Quick screenshot | Standard CLI | `npx playwright screenshot --full-page URL file.png` |
| Quick PDF | Standard CLI | `npx playwright pdf URL file.pdf` |
| Complex multi-step automation | Inline Node.js | `node -e "const { chromium } = require('playwright'); ..."` |
| Running test suites | Standard CLI | `npx playwright test` |
| Recording interactions | Standard CLI | `npx playwright codegen URL` |

**Rule: Never use Playwright MCP for scripted tasks. Use CLI instead.**

---

## Installation

```bash
# AI-native CLI (primary tool)
npm install -g @playwright/cli@latest
playwright-cli install-browser

# For test suites
npm install -D @playwright/test
npx playwright install chromium
```

---

## Core Patterns

### Pattern 1: `@playwright/cli` — Snapshot then Interact

```bash
playwright-cli open https://example.com
playwright-cli snapshot                    # Returns compact element tree with refs (e15, e22...)
playwright-cli fill e15 "some text"        # Fill element by ref
playwright-cli click e22                   # Click element by ref
playwright-cli screenshot --filename=out.png
playwright-cli close
```

Element refs like `e15` come from the `snapshot` output. Always snapshot before interacting.

### Pattern 2: Quick Screenshot / PDF (Zero Code)

```bash
npx playwright screenshot --full-page https://example.com screenshot.png
npx playwright pdf https://example.com output.pdf
```

### Pattern 3: Inline Node.js Script

```bash
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://example.com');
  await page.fill('#email', 'test@example.com');
  await page.click('button[type=submit]');
  await page.waitForSelector('.success');
  await page.screenshot({ path: 'result.png' });
  await browser.close();
})();
"
```

### Pattern 4: With Saved Auth (Google, etc.)

```bash
# ONE TIME: Manual login to save cookies
npx playwright codegen --save-storage=auth.json https://aistudio.google.com

# ALL FUTURE RUNS: Reuse saved auth
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: 'auth.json' });
  const page = await ctx.newPage();
  await page.goto('https://aistudio.google.com');
  // Now logged in
  await page.screenshot({ path: 'ai-studio.png' });
  await browser.close();
})();
"

# Or with @playwright/cli:
playwright-cli state-load auth.json
playwright-cli open https://aistudio.google.com
```

---

## Testing Chatbots

### Write a test

```typescript
// tests/chatbot.spec.ts
import { test, expect } from '@playwright/test';

test('bot responds to greeting', async ({ page }) => {
  await page.goto(process.env.CHATBOT_URL || 'http://localhost:8080');
  await page.fill('[data-testid="chat-input"]', 'Hi, I need help with cloud costs');
  await page.click('[data-testid="send-button"]');

  const response = await page.locator('[data-testid="bot-message"]').last();
  await expect(response).toBeVisible({ timeout: 30000 });

  // Semantic assertions (AI responses vary — don't match exact text)
  const text = await response.textContent();
  expect(text?.toLowerCase()).toContain('cloud');
  expect(text?.length).toBeGreaterThan(50);
});
```

### Run tests

```bash
npx playwright test                              # Run all
npx playwright test tests/chatbot.spec.ts        # Run one file
npx playwright test --headed                     # With visible browser
npx playwright test --grep "greeting"            # Filter by name
npx playwright show-report                       # View HTML report
```

### Key testing rules for AI chatbots
- **Never assert exact text** — AI responses are non-deterministic
- **Assert keywords, structure, length** — `expect(text).toContain('cloud')`
- **Use generous timeouts** — AI responses take 5-30 seconds: `timeout: 30000`
- **Screenshot on failure** — set `screenshot: 'only-on-failure'` in config

---

## AI Studio Automation

```bash
# Save auth first (one time)
npx playwright codegen --save-storage=playwright/.auth/google-auth.json https://aistudio.google.com

# Then automate:
playwright-cli state-load playwright/.auth/google-auth.json
playwright-cli open https://aistudio.google.com/app/prompts/PROMPT_ID
playwright-cli snapshot
# Read snapshot output to find element refs
playwright-cli fill e15 "You are Aiden, a calm senior advisor..."
playwright-cli click e22
playwright-cli screenshot --filename=ai-studio-updated.png
playwright-cli close
```

### AI Studio UI Targeting (Angular SPA)

AI Studio uses Angular + Material Design 3. **CSS classes change between deployments** — always use semantic selectors:

| Component | Best Selector |
|-----------|--------------|
| System Instructions | `getByText('System instructions')` → `getByRole('textbox')` |
| Chat Input | `getByPlaceholder(/type something/i)` |
| Run Button | `getByRole('button', { name: /run/i })` |
| Model Selector | `getByRole('combobox')` near "Model" label |
| Response Output | Last `.response-container` or `.model-response` |

### AI Studio Development Loop (Primary Workflow)

**Claude Code works directly inside AI Studio as the developer.** No exporting, no local development. The user prototypes in AI Studio until Gemini's code assistant gets stuck, then Claude Code takes over via Playwright CLI — reading code, diagnosing problems, writing fixes, and testing, all within the AI Studio UI.

```
User builds in AI Studio → Gemini gets stuck →
  Claude Code connects via Playwright CLI →
    LOOP:
      1. Read code from files via Monaco API (page.evaluate)
      2. Analyze the problem
      3. Write fix back into the editor via Monaco API
      4. Click refresh/run to test
      5. Screenshot result to verify
      6. If not fixed → repeat from 1
    END LOOP
```

**Tool choice per task:**
- Reading/writing code in Build mode → Inline Node.js with `page.evaluate()` + Monaco API
- Quick UI interactions (click, fill, navigate) → `@playwright/cli`
- Verifying preview results → `playwright-cli screenshot`
- Batch testing deployed chatbot → Standalone `node scripts/test-ai-studio.js`
- CI/CD testing → **Gemini API directly** (not AI Studio UI)

### Streaming Response Detection

```javascript
// Wait for AI Studio streaming to complete (poll for text stability)
async function waitForResponse(page, timeout = 30000) {
  let lastText = '', stableCount = 0;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const current = await page.locator('.response-container').last().textContent().catch(() => '');
    if (current && current === lastText) { stableCount++; if (stableCount >= 3) return current; }
    else { stableCount = 0; lastText = current; }
    await page.waitForTimeout(1000);
  }
  return lastText;
}
```

### Limitations

- **Function calls:** AI Studio shows intent only, doesn't execute. Use Gemini API for full loop.
- **File Search uploads:** Fragile via UI. Use Gemini API instead.
- **Google ToS:** Automated browser access is a gray area. Use sparingly for dev, API for production.
- **Auth expiry:** Google cookies last 1-4 weeks. Re-run `codegen --save-storage` when expired.

---

## AI Studio Build Mode Automation

Build mode is a separate interface from prompt mode — it's a full in-browser IDE with file explorer, Monaco code editor, and live preview.

**Key difference from prompt mode:** Build mode uses Monaco Editor (VS Code engine). Standard `type()`/`fill()` won't work. Must use `page.evaluate()` with Monaco's JavaScript API.

### Known CSS Classes (verified from Google dev forums)

| Element | CSS Class |
|---------|-----------|
| Code editor area | `.editor-container` |
| Preview/app area | `.applet-container` |
| File explorer | `.tree-view-container` |
| Console/output | `.console-right-panel` |
| Monaco editor | `.monaco-editor` |

### Reading/Writing Code via Monaco API

This is the core mechanism — Claude Code reads code to diagnose problems, then writes fixes back.

```javascript
// READ current file content (the active file in the editor)
const content = await page.evaluate(() => {
  const models = window.monaco?.editor?.getModels();
  return models?.[0]?.getValue();
});

// READ a specific file by name
const appCode = await page.evaluate((fileName) => {
  const models = window.monaco?.editor?.getModels();
  const target = models?.find(m => m.uri.path.includes(fileName));
  return target?.getValue();
}, 'App.tsx');

// READ ALL files (to understand the full project)
const allFiles = await page.evaluate(() => {
  const models = window.monaco?.editor?.getModels();
  return models?.map(m => ({ path: m.uri.path, content: m.getValue() }));
});

// WRITE a fix to a specific file
await page.evaluate(({ fileName, code }) => {
  const models = window.monaco?.editor?.getModels();
  const target = models?.find(m => m.uri.path.includes(fileName));
  if (target) target.setValue(code);
}, { fileName: 'App.tsx', code: '// fixed content here' });

// LIST all files in the project
const fileList = await page.evaluate(() => {
  const models = window.monaco?.editor?.getModels();
  return models?.map(m => m.uri.path);
});
```

### Build Mode UI Interactions

```javascript
// Click file in explorer
await page.locator('.tree-view-container').locator('text=App.tsx').click();

// Switch to Preview tab
await page.locator('text=Preview').click();

// Switch to Code tab
await page.locator('text=Code').click();

// Interact with preview iframe
const preview = page.frameLocator('.applet-container iframe');
await preview.locator('button:has-text("Submit")').click();

// Refresh preview
await page.locator('button[aria-label*="refresh" i]').click();

// Use code assistant chat (left panel)
const chatInput = page.locator('textarea').last();
await chatInput.fill('Add dark mode toggle');
await chatInput.press('Enter');
```

### Build Mode Gotchas
- **Monaco freezing:** Known bug with large files; may hang entire browser
- **No programmatic API:** Browser automation is the only way to control Build mode
- **Rate limits:** Undocumented daily limits on the code assistant; HTTP 429 errors
- **Preview is in an iframe:** Must use `page.frameLocator()` to interact

---

## Config Template

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 1,
  use: {
    baseURL: process.env.CHATBOT_URL || 'http://localhost:8080',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
```

---

## Token Cost Reference

### Tool Invocation Cost

| Approach | Tokens/task | Use when |
|----------|-------------|----------|
| `@playwright/cli` | ~27,000 | Default for all browser tasks |
| `node -e` inline | ~5,000-10,000 | Complex logic, conditionals, loops |
| `npx playwright test` | ~2,000 (just output) | Running pre-written test suites |
| Playwright MCP | ~114,000 | Never for scripted tasks — only exploratory |

### Image Token Cost (Screenshots)

Claude tokenizes images by **pixel count, not file format**. JPEG vs PNG makes zero difference.

```
tokens = (width_px × height_px) / 750
```

| Screenshot Approach | Dimensions | Image Tokens | Cost (Opus) |
|---------------------|-----------|--------------|-------------|
| No screenshot (JS assertion) | N/A | **0** | **$0** |
| `snapshot` (text tree) | N/A | **0** | **$0** |
| Element screenshot (small) | 200×200 | ~53 | ~$0.00016 |
| Small viewport | 400×300 | ~160 | ~$0.00048 |
| Default viewport | 800×600 | ~640 | ~$0.0019 |
| Large viewport | 1280×720 | ~1,229 | ~$0.0037 |

---

## Screenshot Optimization Rules

**CRITICAL: Avoid screenshots whenever possible. They are the #1 token cost driver in browser testing.**

### Decision Flowchart

```
Need to verify something?
│
├─ STATE (selection count, JS variable, data)?
│  └─ page.evaluate(() => ...) → 0 image tokens
│
├─ DOM element exists / has text?
│  └─ snapshot → 0 image tokens
│
├─ Visual appearance of ONE element?
│  └─ Element screenshot (--element selector) → ~53-160 tokens
│
├─ Full page layout / spatial relationships?
│  └─ Viewport screenshot (keep viewport small) → ~160-640 tokens
│
└─ What's drawn on a <canvas>?
   ├─ Can check via JS? → page.evaluate() → 0 tokens
   ├─ Pixel sampling? → ctx.getImageData(x,y,1,1) → 0 tokens
   └─ Need visual proof? → Small viewport screenshot → ~160-640 tokens
```

### Rules

1. **Default to `page.evaluate()`** for verifying state — it returns text, zero image tokens
2. **Use `snapshot`** for DOM structure checks — returns text accessibility tree
3. **Use small viewports** when screenshots are needed — set `--viewport-size 400x300` or `page.setViewportSize({width: 400, height: 300})`
4. **Use element screenshots** to capture just the relevant component, not the whole page
5. **Take ONE screenshot per major visual milestone**, not after every click
6. **Never take screenshots in loops** — one verification screenshot at the end is enough
7. **JPEG and PNG cost the same tokens** — format doesn't matter for cost

### Canvas App Testing (No DOM)

Canvas apps (`<canvas>`) render pixels, not DOM elements — `snapshot` only shows the canvas element, not its content. Strategies:

```javascript
// 1. BEST: Expose debug state globally (0 tokens)
const state = await page.evaluate(() => ({
  selected: window.__selectionManager?.selectedCount,
  camera: window.__camera,
  nodeCount: window.__nodeMap?.size
}));

// 2. GOOD: Pixel sampling to check visual state (0 tokens)
const pixel = await page.evaluate(({x, y}) => {
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
  return { r, g, b, a };
}, { x: 100, y: 100 });
// Check if selection ring (blue) is drawn: pixel.b > 200

// 3. LAST RESORT: Screenshot with small viewport (~160 tokens)
await page.setViewportSize({ width: 400, height: 300 });
await page.screenshot({ path: 'canvas-state.png' });
```
