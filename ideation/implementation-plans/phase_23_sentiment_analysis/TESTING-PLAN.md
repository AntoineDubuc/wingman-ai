# Phase 23: Real-Time Sentiment Analysis — Testing Plan

> **Feature:** Hume AI Emotion Detection Integration
> **Test Date:** [YYYY-MM-DD]
> **Tester:** [Name]
> **Status:** Not Started

---

## Test Summary

| Metric | Count |
|--------|-------|
| Total Test Cases | 24 |
| Passed | 0 |
| Failed | 0 |
| Blocked | 0 |
| Pass Rate | 0% |

---

## Prerequisites

### Environment Setup

- [ ] Extension built: `npm run build` in `wingman-ai/extension/`
- [ ] Extension loaded: `chrome://extensions/` → Developer mode → Load unpacked → `dist/`
- [ ] Hume AI account created at [hume.ai](https://hume.ai)
- [ ] Hume API Key + Secret Key from [app.hume.ai/keys](https://app.hume.ai/keys)
- [ ] Deepgram API key (existing)
- [ ] Gemini API key (existing)
- [ ] Google Meet access for live call testing

### Testing Tools

| Tool | Purpose | How to Use |
|------|---------|------------|
| **Vitest** | Unit tests | `npm test` in `wingman-ai/extension/` |
| **Chrome DevTools** | Debug extension | F12 on extension pages |
| **Service Worker Console** | Background script logs | `chrome://extensions/` → Service worker link |
| **Playwright MCP** | Options page UI testing | Built-in Claude Code plugin |

### Chrome Extension Testing Approach

Unlike web apps with backend servers, Chrome extensions require different testing strategies:

| Layer | Testing Method | Tools |
|-------|----------------|-------|
| **Pure functions** | Unit tests | Vitest |
| **Options page UI** | Browser automation | Playwright (load `chrome-extension://[id]/src/options/options.html`) |
| **Service worker** | Integration + manual | Console logs, message inspection |
| **Live call behavior** | Manual only | Real Google Meet call |
| **Popup UI** | Manual | Right-click popup → Inspect |

### Extension ID Discovery

After loading the extension, get the ID from `chrome://extensions/`:
```
chrome-extension://[EXTENSION_ID]/src/options/options.html
```

---

## Instructions for Claude Code

> **CRITICAL: You must follow these rules exactly.**
>
> 1. **Save after every cell write.** Each time you update a cell, save immediately.
> 2. **Check the checkbox** when you begin a test.
> 3. **Workflow for each test:**
>    - Check the checkbox `[x]` → Save
>    - Write start time → Save
>    - Execute the test
>    - Write end time → Save
>    - Calculate and write total time → Save
>    - Write human time estimate → Save
>    - Calculate and write multiplier → Save
>    - Write result (Pass/Fail/Blocked/Skip) → Save
>    - Move to next test
> 4. **Time format:** `HH:MM` (24-hour). Minutes for totals/estimates.
> 5. **Multiplier:** `Human Estimate ÷ Total Time`. Express as `Nx`.
> 6. **Result values:** `Pass` | `Fail` | `Blocked` | `Skip`
> 7. **If blocked:** Note blocker in Notes, move to next test.

---

## Progress Dashboard

| Done | # | Test Case | Start | End | Total (min) | Human Est. (min) | Multiplier | Result |
|:----:|:-:|-----------|:-----:|:---:|:-----------:|:----------------:|:----------:|:------:|
| [ ] | 1 | Unit: Emotion categorization logic | | | | 5 | | |
| [ ] | 2 | Unit: Emotion smoothing algorithm | | | | 5 | | |
| [ ] | 3 | Unit: Base64 encoding function | | | | 3 | | |
| [ ] | 4 | Unit: Token expiry check | | | | 3 | | |
| [ ] | 5 | Options: Hume section renders | | | | 3 | | |
| [ ] | 6 | Options: API key inputs save | | | | 5 | | |
| [ ] | 7 | Options: Test button validates keys | | | | 5 | | |
| [ ] | 8 | Options: Invalid keys show error | | | | 5 | | |
| [ ] | 9 | Options: Section marked "Optional" | | | | 2 | | |
| [ ] | 10 | Storage: Keys persist across reload | | | | 3 | | |
| [ ] | 11 | Integration: Hume token fetch works | | | | 5 | | |
| [ ] | 12 | Integration: WebSocket connects | | | | 5 | | |
| [ ] | 13 | Integration: Audio sends to Hume | | | | 10 | | |
| [ ] | 14 | Integration: Emotions received | | | | 10 | | |
| [ ] | 15 | Overlay: Badge hidden without keys | | | | 5 | | |
| [ ] | 16 | Overlay: Badge visible with keys | | | | 5 | | |
| [ ] | 17 | Overlay: Badge updates on emotion | | | | 10 | | |
| [ ] | 18 | Overlay: Badge colors correct | | | | 5 | | |
| [ ] | 19 | Error: Missing keys graceful | | | | 5 | | |
| [ ] | 20 | Error: Bad keys show error | | | | 5 | | |
| [ ] | 21 | Error: Network failure handled | | | | 5 | | |
| [ ] | 22 | Error: Session continues on Hume fail | | | | 10 | | |
| [ ] | 23 | Live: Full call with emotion updates | | | | 15 | | |
| [ ] | 24 | TypeScript: Build passes | | | | 3 | | |

**Summary:**
- Total tests: 24
- Completed: 0
- Passed: 0
- Failed: 0
- Total time spent: 0 minutes
- Total human estimate: 142 minutes (~2.4 hours)
- Overall multiplier: —

---

## Test Cases

### 1. Unit Tests (Vitest)

> **Purpose:** Verify pure functions work correctly in isolation.
> **Method:** `npm test` in `wingman-ai/extension/`
> **Estimated Time:** 16 minutes

These tests run without the Chrome extension context.

#### UT-01: Emotion Categorization Logic

**File:** `tests/emotion-categorizer.test.ts` (to be created)

**Test Cases:**
```typescript
describe('categorizeEmotion', () => {
  it('returns "engaged" for high Joy + Interest', () => {
    const emotions = [
      { name: 'Joy', score: 0.7 },
      { name: 'Interest', score: 0.6 },
    ];
    expect(categorizeEmotion(emotions)).toBe('engaged');
  });

  it('returns "frustrated" for high Anger + Frustration', () => {
    const emotions = [
      { name: 'Anger', score: 0.5 },
      { name: 'Frustration', score: 0.6 },
    ];
    expect(categorizeEmotion(emotions)).toBe('frustrated');
  });

  it('returns "thinking" for high Concentration + Contemplation', () => {
    const emotions = [
      { name: 'Concentration', score: 0.7 },
      { name: 'Contemplation', score: 0.5 },
    ];
    expect(categorizeEmotion(emotions)).toBe('thinking');
  });

  it('returns "neutral" when no strong emotion', () => {
    const emotions = [
      { name: 'Calmness', score: 0.3 },
      { name: 'Interest', score: 0.2 },
    ];
    expect(categorizeEmotion(emotions)).toBe('neutral');
  });
});
```

**Expected:** All assertions pass.

---

#### UT-02: Emotion Smoothing Algorithm

**File:** `tests/emotion-smoother.test.ts` (to be created)

**Test Cases:**
```typescript
describe('EmotionSmoother', () => {
  it('returns null with no readings', () => {
    const smoother = new EmotionSmoother();
    expect(smoother.getDominant()).toBeNull();
  });

  it('averages multiple readings over 3-second window', () => {
    const smoother = new EmotionSmoother();
    smoother.addReading([{ name: 'Joy', score: 0.8 }], Date.now() - 1000);
    smoother.addReading([{ name: 'Joy', score: 0.6 }], Date.now());
    const result = smoother.getDominant();
    expect(result.name).toBe('Joy');
    expect(result.score).toBeCloseTo(0.7, 1);
  });

  it('discards readings older than 3 seconds', () => {
    const smoother = new EmotionSmoother();
    smoother.addReading([{ name: 'Anger', score: 0.9 }], Date.now() - 5000);
    smoother.addReading([{ name: 'Joy', score: 0.6 }], Date.now());
    expect(smoother.getDominant().name).toBe('Joy');
  });
});
```

**Expected:** All assertions pass.

---

#### UT-03: Base64 Encoding Function

**File:** `tests/audio-utils.test.ts` (to be created)

**Test Cases:**
```typescript
describe('arrayBufferToBase64', () => {
  it('encodes Int16Array to base64', () => {
    const data = new Int16Array([1, 2, 3, 4]);
    const base64 = arrayBufferToBase64(data.buffer);
    expect(typeof base64).toBe('string');
    expect(base64.length).toBeGreaterThan(0);
  });

  it('round-trips correctly', () => {
    const original = new Int16Array([100, -100, 32767, -32768]);
    const base64 = arrayBufferToBase64(original.buffer);
    const decoded = base64ToArrayBuffer(base64);
    const result = new Int16Array(decoded);
    expect(Array.from(result)).toEqual(Array.from(original));
  });
});
```

**Expected:** All assertions pass.

---

#### UT-04: Token Expiry Check

**File:** `tests/hume-client.test.ts` (to be created)

**Test Cases:**
```typescript
describe('isTokenExpiringSoon', () => {
  it('returns true when token expires in < 5 minutes', () => {
    const expiryTime = Date.now() + 4 * 60 * 1000; // 4 min from now
    expect(isTokenExpiringSoon(expiryTime)).toBe(true);
  });

  it('returns false when token has > 5 minutes left', () => {
    const expiryTime = Date.now() + 10 * 60 * 1000; // 10 min from now
    expect(isTokenExpiringSoon(expiryTime)).toBe(false);
  });

  it('returns true when token already expired', () => {
    const expiryTime = Date.now() - 1000; // 1 sec ago
    expect(isTokenExpiringSoon(expiryTime)).toBe(true);
  });
});
```

**Expected:** All assertions pass.

---

### 2. Options Page UI Tests (Playwright)

> **Purpose:** Verify the Hume API keys section renders and functions correctly.
> **Method:** Playwright MCP loading extension options page
> **Estimated Time:** 20 minutes

#### OP-01: Hume Section Renders

**Steps:**
1. Navigate to `chrome-extension://[ID]/src/options/options.html`
2. Verify "Hume AI (Emotion Detection)" section exists
3. Verify API Key input field exists
4. Verify Secret Key input field exists
5. Verify Test button exists

**Expected:** All elements present in DOM.

---

#### OP-02: API Key Inputs Save

**Steps:**
1. Navigate to options page
2. Enter test API key: `test-api-key-123`
3. Enter test Secret key: `test-secret-key-456`
4. Click Save (or trigger auto-save)
5. Reload page
6. Verify inputs still contain the values

**Expected:** Values persist after reload.

---

#### OP-03: Test Button Validates Keys (Valid Keys)

**Prerequisite:** Real Hume API key + Secret key

**Steps:**
1. Navigate to options page
2. Enter valid Hume API key
3. Enter valid Hume Secret key
4. Click "Test Connection" button
5. Wait for response

**Expected:** Green checkmark appears, success message shown.

---

#### OP-04: Invalid Keys Show Error

**Steps:**
1. Navigate to options page
2. Enter invalid API key: `invalid-key`
3. Enter invalid Secret key: `invalid-secret`
4. Click "Test Connection" button
5. Wait for response

**Expected:** Error message appears (e.g., "Authentication failed").

---

#### OP-05: Section Marked "Optional"

**Steps:**
1. Navigate to options page
2. Find Hume AI section
3. Verify "Optional" badge/label is present

**Expected:** Visual indicator that this section is optional.

---

### 3. Storage Tests

> **Purpose:** Verify keys are stored correctly in chrome.storage.local.
> **Method:** DevTools console + extension inspection
> **Estimated Time:** 3 minutes

#### ST-01: Keys Persist Across Reload

**Steps:**
1. Open options page
2. Enter Hume keys
3. Save
4. Open DevTools → Application → Storage → Extension Storage
5. Verify `humeApiKey` and `humeSecretKey` are present
6. Close and reopen options page
7. Verify keys still populated in inputs

**Expected:** Keys stored in `chrome.storage.local` and restored on page load.

---

### 4. Integration Tests (Real API)

> **Purpose:** Verify Hume API integration works end-to-end.
> **Method:** Manual with console logging
> **Prerequisite:** Valid Hume API keys
> **Estimated Time:** 30 minutes

#### IT-01: Hume Token Fetch Works

**Steps:**
1. Configure valid Hume keys in options
2. Open service worker console
3. Start a session (click Start in popup)
4. Look for log: "Hume: Access token obtained"

**Expected:** Token fetched successfully, logged to console.

---

#### IT-02: WebSocket Connects

**Steps:**
1. Configure valid Hume keys
2. Open service worker console
3. Start session
4. Look for log: "Hume: WebSocket connected"

**Expected:** WebSocket connection established to `wss://api.hume.ai/v0/stream/models`.

---

#### IT-03: Audio Sends to Hume

**Steps:**
1. Start session with Hume configured
2. Speak into microphone
3. Watch service worker console for "Hume: Sending audio chunk"

**Expected:** Audio chunks sent to Hume WebSocket (base64 encoded).

---

#### IT-04: Emotions Received

**Steps:**
1. Start session with Hume configured
2. Speak for 5+ seconds
3. Watch service worker console for emotion data
4. Look for log: "Hume: Received emotions" with emotion array

**Expected:** Emotion predictions received from Hume API.

---

### 5. Overlay Badge Tests (Manual)

> **Purpose:** Verify emotion badge displays correctly in overlay.
> **Method:** Manual testing on Google Meet
> **Estimated Time:** 25 minutes

#### OV-01: Badge Hidden Without Keys

**Steps:**
1. Remove Hume keys from options (leave empty)
2. Start Google Meet call
3. Start Wingman session
4. Inspect overlay header

**Expected:** No emotion badge visible. Transcription works normally.

---

#### OV-02: Badge Visible With Keys

**Steps:**
1. Configure valid Hume keys
2. Start Google Meet call
3. Start Wingman session
4. Wait for first speech
5. Inspect overlay header

**Expected:** Emotion badge appears in header (e.g., "😐 Neutral").

---

#### OV-03: Badge Updates on Emotion

**Steps:**
1. Start session with Hume configured
2. Speak normally (calm tone) → should show Neutral/Engaged
3. Speak excitedly → should shift toward Engaged
4. Act confused/frustrated → should shift toward Frustrated/Thinking

**Expected:** Badge updates within ~3 seconds of tone change.

---

#### OV-04: Badge Colors Correct

**Steps:**
1. Observe badge in each state:
   - Engaged → Green tint
   - Neutral → Gray tint
   - Frustrated → Red/Orange tint
   - Thinking → Blue tint

**Expected:** Colors match design spec in LIVE-INTEGRATION-SPEC.md.

---

### 6. Error Handling Tests

> **Purpose:** Verify graceful degradation when things go wrong.
> **Method:** Manual + configuration manipulation
> **Estimated Time:** 25 minutes

#### ER-01: Missing Keys Graceful

**Steps:**
1. Clear Hume keys from storage
2. Start session
3. Verify no errors in console
4. Verify transcription still works
5. Verify suggestions still appear

**Expected:** Session works normally; badge simply doesn't appear.

---

#### ER-02: Bad Keys Show Error

**Steps:**
1. Enter invalid Hume keys
2. Click Test Connection in options

**Expected:** Clear error message, not cryptic failure.

---

#### ER-03: Network Failure Handled

**Steps:**
1. Configure valid Hume keys
2. Disconnect internet
3. Start session
4. Reconnect internet

**Expected:**
- Hume connection fails silently (logged as warning)
- Transcription continues working
- Badge hidden or shows reconnecting state

---

#### ER-04: Session Continues on Hume Fail

**Steps:**
1. Start session with Hume connected
2. Simulate Hume failure (e.g., invalidate token)
3. Continue speaking

**Expected:**
- Transcription continues
- Suggestions continue
- Badge may disappear but session doesn't crash

---

### 7. Live Call Test (End-to-End)

> **Purpose:** Full integration test with real call.
> **Method:** Manual with real Google Meet call
> **Prerequisite:** All previous tests pass
> **Estimated Time:** 15 minutes

#### LC-01: Full Call with Emotion Updates

**Steps:**
1. Configure all API keys (Deepgram, Gemini, Hume)
2. Join Google Meet call (can be solo test call)
3. Start Wingman session
4. Speak for 2+ minutes, varying tone:
   - Start calm (should show Neutral)
   - Get excited about something (should shift to Engaged)
   - Express confusion (should shift to Thinking)
   - Express frustration (should shift to Frustrated)
5. Observe:
   - Transcripts appear normally
   - Suggestions appear normally
   - Emotion badge updates with ~3 second latency
   - No console errors

**Expected:** Complete feature works end-to-end.

---

### 8. Build Verification

> **Purpose:** Ensure code compiles without errors.
> **Method:** `npm run build` and `npm run typecheck`
> **Estimated Time:** 3 minutes

#### BV-01: TypeScript Build Passes

**Steps:**
```bash
cd wingman-ai/extension
npm run typecheck
npm run build
```

**Expected:**
- No TypeScript errors
- Build completes successfully
- `dist/` folder created with all assets

---

## Test Results

### Summary

| Category | Passed | Failed | Blocked | Total |
|----------|--------|--------|---------|-------|
| Unit Tests (UT) | | | | 4 |
| Options Page (OP) | | | | 5 |
| Storage (ST) | | | | 1 |
| Integration (IT) | | | | 4 |
| Overlay (OV) | | | | 4 |
| Error Handling (ER) | | | | 4 |
| Live Call (LC) | | | | 1 |
| Build (BV) | | | | 1 |
| **Total** | | | | 24 |

### Failed Tests

| Test ID | Description | Failure Reason | Bug ID | Priority |
|---------|-------------|----------------|--------|----------|
| | | | | |

### Blocked Tests

| Test ID | Description | Blocker | Resolution |
|---------|-------------|---------|------------|
| | | | |

---

## Test Data Requirements

### Hume API Keys

For integration and live tests, you need:
- **API Key**: From [app.hume.ai/keys](https://app.hume.ai/keys)
- **Secret Key**: From same page

Free tier includes limited usage for testing.

### Audio Scenarios

For emotion testing, prepare to:
- Speak calmly (baseline neutral)
- Express enthusiasm ("That's great!")
- Express confusion ("Wait, I'm not sure I understand...")
- Express mild frustration ("This is taking longer than expected")

---

## Screenshots

Save screenshots in: `ideation/implementation-plans/phase_23_sentiment_analysis/screenshots/`

| Test ID | Screenshot | Description |
|---------|------------|-------------|
| OP-01 | `op-01-hume-section.png` | Options page with Hume section |
| OP-03 | `op-03-test-success.png` | Test button success state |
| OP-04 | `op-04-test-error.png` | Test button error state |
| OV-02 | `ov-02-badge-visible.png` | Emotion badge in overlay |
| OV-04 | `ov-04-badge-colors.png` | Badge in each color state |
| LC-01 | `lc-01-full-call.png` | Complete overlay during call |

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Tester | | | |
| Developer | | | |
| PM (if required) | | | |

---

## Notes

### Chrome Extension Testing Limitations

1. **Playwright MCP** can test options page and popup by navigating to their URLs directly, but cannot interact with content scripts injected into Google Meet.

2. **Service Worker testing** requires manual observation via `chrome://extensions/` → Service worker console.

3. **Live call testing** is inherently manual — no automation can fully simulate a Google Meet call with audio.

4. **Hume API costs** — Integration tests consume Hume credits (~$0.064/min). Keep test sessions short.

### Test Order Recommendation

Run tests in this order:
1. **Build (BV-01)** — Ensure code compiles
2. **Unit Tests (UT-*)** — Verify logic works
3. **Options Page (OP-*)** — Verify UI works
4. **Storage (ST-*)** — Verify persistence works
5. **Error Handling (ER-*)** — Verify graceful failures
6. **Integration (IT-*)** — Verify API connection (requires real keys)
7. **Overlay (OV-*)** — Verify badge display (requires real keys)
8. **Live Call (LC-01)** — Full end-to-end (requires real keys + call)

---

*Template Version: 2.1 (Chrome Extension Adaptation)*
*Last Updated: 2026-02-06*
