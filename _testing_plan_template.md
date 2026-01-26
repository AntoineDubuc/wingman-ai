# [Feature Name] - Testing Plan

> **Feature:** [Feature name from implementation plan]
> **Test Date:** [YYYY-MM-DD]
> **Tester:** [Name]
> **Status:** [Not Started | In Progress | Passed | Failed | Blocked]

---

## Test Summary

| Metric | Count |
|--------|-------|
| Total Test Cases | 0 |
| Passed | 0 |
| Failed | 0 |
| Blocked | 0 |
| Pass Rate | 0% |

---

## Prerequisites

### Environment Setup

- [ ] Backend server running at `http://localhost:3001`
- [ ] Frontend/Demo server running at `http://localhost:8080`
- [ ] Database migrated and seeded
- [ ] API key available: `$API_KEY`
- [ ] Test data prepared (if applicable)

### Testing Tools

| Tool | Purpose | How to Use |
|------|---------|------------|
| **Bash (curl + jq)** | API testing | Built-in, run via Claude Code Bash tool |
| **Playwright MCP** | Browser automation | Built-in Claude Code plugin (no install needed) |

### Claude Code Playwright Plugin

Claude Code has a **built-in Playwright MCP plugin** that runs browser tests in **headless mode** (no visible browser window). This is ideal for automated testing and CI/CD pipelines.

**Key characteristics:**
- **Headless by default** - No browser window displayed
- **No installation required** - Built into Claude Code
- **Cross-browser** - Uses Chromium engine

Available commands:

| Command | Purpose |
|---------|---------|
| `browser_navigate` | Navigate to a URL |
| `browser_snapshot` | Get accessibility tree (better than screenshot for testing) |
| `browser_click` | Click elements by reference |
| `browser_type` | Type text into inputs |
| `browser_fill_form` | Fill multiple form fields |
| `browser_take_screenshot` | Capture visual screenshot |
| `browser_console_messages` | Check for JS errors |
| `browser_network_requests` | Monitor API calls |
| `browser_evaluate` | Run custom JavaScript |

**To run browser tests:** Ask Claude Code to test the UI directly. It will use the Playwright plugin automatically.

### Screenshot Requirements

**Purpose:** Visual documentation of testing progress and bug verification.

**When to capture screenshots:**
- ✅ **When possible:** UI-based tests, visual features, layout verification
- ✅ **When relevant:** User-facing changes, styling updates, responsive design
- ❌ **Not needed:** Pure API tests, backend-only changes, non-visual features

**Storage location:**
- Save screenshots in `screenshots/` subfolder within the feature directory
- Example: `/POC/features/[feature-name]/screenshots/`

**Naming convention:**
- Format: `[test-id]-[description].png`
- Examples:
  - `fn-01-avatar-settings-page.png` (passing test)
  - `fn-01-avatar-settings-page-fail.png` (failing test)
  - `ui-02-responsive-768px.png` (responsive test)

**What to capture:**
- ✅ Key UI states (initial load, success, error)
- ✅ Before/after comparisons for visual changes
- ✅ Failure states (with visible error messages)
- ✅ Responsive layouts at different breakpoints
- ✅ Accessibility features (focus states, high contrast mode)

**Claude Code Playwright command:**
```
browser_take_screenshot with filename: "screenshots/[test-id]-[description].png"
```

---

### Test Method Selection

| Test Type | Method | When to Use |
|-----------|--------|-------------|
| **API endpoints** | Bash (curl) | CRUD operations, auth, data validation |
| **UI verification** | Playwright MCP + Screenshots | Page loads, elements visible, forms work |
| **Complex workflows** | Playwright MCP + Screenshots | Multi-step user journeys, state changes |
| **Console errors** | Playwright MCP | JS error detection |
| **Network monitoring** | Playwright MCP | API call verification from browser |
| **Visual regression** | Playwright MCP Screenshots | Layout changes, styling updates |

---

## Instructions for Claude Code

> **CRITICAL: You must follow these rules exactly.**
>
> 1. **Save after every cell write.** You cannot batch writes to this table. Each time you update a cell (start time, end time, estimate, etc.), you must save the file immediately before proceeding to other cells or other work.
> 2. **Check the checkbox** when you begin a test. This serves as a visual indicator of which test is currently in progress.
> 3. **Workflow for each test:**
>
>    - Check the checkbox `[x]` → Save
>    - Write start time → Save
>    - Execute the test (API or Browser)
>    - Write end time → Save
>    - Calculate and write total time → Save
>    - Write human time estimate → Save
>    - Calculate and write multiplier → Save
>    - Write result (Pass/Fail/Blocked/Skip) → Save
>    - Move to next test
> 4. **Time format:** Use `HH:MM` (24-hour format) for start/end times. Use minutes for total time and estimates.
> 5. **Multiplier calculation:** `Multiplier = Human Estimate ÷ Total Time`. Express as `Nx` (e.g., `10x` means 10 times faster than human estimate).
> 6. **Result values:** `Pass` | `Fail` | `Blocked` | `Skip`
> 7. **If blocked:** Note the blocker in the Notes column and move to the next unblocked test.
> 8. **Screenshots (when relevant):**
>    - Take screenshots for UI/browser tests when possible
>    - Save to `screenshots/[test-id]-[description].png`
>    - Always capture failure states with `-fail.png` suffix
>    - Capture key UI states (initial, success, error)
> 9. **If a test fails:** Document the failure reason in Notes, take a screenshot if browser test (`screenshots/[test-id]-fail.png`).

---

## Progress Dashboard

| Done | # | Test Case | Start | End | Total (min) | Human Est. (min) | Multiplier | Result |
| :--: | :-: | --------- | :---: | :-: | :---------: | :--------------: | :--------: | :----: |
| [ ] | 1 | [Test name] | | | | | | |
| [ ] | 2 | [Test name] | | | | | | |
| [ ] | 3 | [Test name] | | | | | | |
| [ ] | 4 | [Test name] | | | | | | |
| [ ] | 5 | [Test name] | | | | | | |
| [ ] | 6 | [Test name] | | | | | | |
| [ ] | 7 | [Test name] | | | | | | |
| [ ] | 8 | [Test name] | | | | | | |
| [ ] | 9 | [Test name] | | | | | | |
| [ ] | 10 | [Test name] | | | | | | |

**Summary:**

- Total tests: [X]
- Completed: [X]
- Passed: [X]
- Failed: [X]
- Total time spent: [X] minutes
- Total human estimate: [X] minutes
- Overall multiplier: [X]x

---

## Test Cases

### 1. Smoke Tests (Quick Verification)

> **Purpose:** Verify basic functionality works before deeper testing.
> **Estimated Time:** 5-10 minutes

| ID | Test Case | Method | Expected Result | Status | Notes |
|----|-----------|--------|-----------------|--------|-------|
| SM-01 | API server responds | API | 200 OK from `/api/ping` | | |
| SM-02 | Authentication works | API | Valid token accepted | | |
| SM-03 | Main UI loads | Browser | Page renders without errors | | |
| SM-04 | Database connected | API | Data queries return results | | |

#### SM-01: API Server Responds

```bash
# API Test
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/ping
# Expected: 200
```

#### SM-02: Authentication Works

```bash
# API Test
curl -s -H "Authorization: Bearer $API_KEY" \
  http://localhost:3001/api/v1/[endpoint] | jq '.success'
# Expected: true
```

#### SM-03: Main UI Loads

**Via Claude Code Playwright MCP:**
```
Ask Claude Code: "Navigate to http://localhost:8080/[feature]-admin.html and take a snapshot to verify the page loads correctly"
```

Claude Code will:
1. Use `browser_navigate` to open the page
2. Use `browser_snapshot` to get the accessibility tree
3. Report any errors or confirm success

---

### 2. Functional Tests (Core Features)

> **Purpose:** Verify each feature works as specified.
> **Estimated Time:** 30-60 minutes

| ID | Test Case | Method | Expected Result | Status | Notes |
|----|-----------|--------|-----------------|--------|-------|
| FN-01 | [Feature action 1] | API/Browser | [Expected outcome] | | |
| FN-02 | [Feature action 2] | API/Browser | [Expected outcome] | | |
| FN-03 | [Feature action 3] | API/Browser | [Expected outcome] | | |
| FN-04 | [Feature action 4] | API/Browser | [Expected outcome] | | |
| FN-05 | [Feature action 5] | API/Browser | [Expected outcome] | | |

#### FN-01: [Feature Action 1]

```bash
# API Test
curl -s -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"field": "value"}' \
  http://localhost:3001/api/v1/[endpoint] | jq
# Expected: { "success": true, "data": { ... } }
```

**Via Claude Code Playwright MCP (if browser-based):**
```
Ask Claude Code: "Navigate to http://localhost:8080/[feature]-admin.html, fill the input field with 'test value', click submit, and verify the success message appears"
```

Claude Code will:
1. Use `browser_navigate` to open the page
2. Use `browser_snapshot` to identify form elements
3. Use `browser_type` or `browser_fill_form` to enter data
4. Use `browser_click` to submit
5. Use `browser_snapshot` to verify success message

---

### 3. Integration Tests (Component Interaction)

> **Purpose:** Verify components work together correctly.
> **Estimated Time:** 20-30 minutes

| ID | Test Case | Method | Expected Result | Status | Notes |
|----|-----------|--------|-----------------|--------|-------|
| IN-01 | [Integration scenario 1] | API+Browser | [Expected outcome] | | |
| IN-02 | [Integration scenario 2] | API+Browser | [Expected outcome] | | |

#### IN-01: [Integration Scenario]

**Via Claude Code (API + Browser combined):**
```
Ask Claude Code:
"Test the complete workflow:
1. Create a new item via API using curl
2. Navigate to the admin page and verify the item appears
3. Edit the item via the UI
4. Verify the change via API"
```

Claude Code will:
1. Use `Bash` tool with curl to create item via API
2. Use `browser_navigate` to open admin page
3. Use `browser_snapshot` to verify item is visible
4. Use `browser_click` and `browser_type` to edit
5. Use `Bash` tool with curl to verify via API

---

### 4. Error Handling Tests

> **Purpose:** Verify system handles errors gracefully.
> **Estimated Time:** 15-20 minutes

| ID | Test Case | Method | Expected Result | Status | Notes |
|----|-----------|--------|-----------------|--------|-------|
| ER-01 | Invalid input rejected | API | 400 with error message | | |
| ER-02 | Unauthorized access blocked | API | 401 Unauthorized | | |
| ER-03 | Not found handled | API | 404 with message | | |
| ER-04 | UI shows error state | Browser | Error message displayed | | |

#### ER-01: Invalid Input Rejected

```bash
# API Test - Invalid input
curl -s -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"field": ""}' \
  http://localhost:3001/api/v1/[endpoint] | jq
# Expected: { "success": false, "error": "Field is required" }
```

#### ER-02: Unauthorized Access Blocked

```bash
# API Test - No auth header
curl -s -w "\n%{http_code}" \
  http://localhost:3001/api/v1/[endpoint]
# Expected: 401
```

---

### 5. Edge Case Tests

> **Purpose:** Verify system handles unusual but valid scenarios.
> **Estimated Time:** 15-20 minutes

| ID | Test Case | Method | Expected Result | Status | Notes |
|----|-----------|--------|-----------------|--------|-------|
| ED-01 | Empty dataset | API/Browser | Graceful empty state | | |
| ED-02 | Large dataset | API | Pagination works | | |
| ED-03 | Special characters | API | Properly escaped | | |
| ED-04 | Concurrent requests | API | No race conditions | | |

---

### 6. UI/UX Tests (Browser Only)

> **Purpose:** Verify user interface meets requirements.
> **Estimated Time:** 20-30 minutes

| ID | Test Case | Method | Expected Result | Status | Notes |
|----|-----------|--------|-----------------|--------|-------|
| UI-01 | Page loads without JS errors | Browser | No console errors | | |
| UI-02 | Responsive layout | Browser | Works at 1024px, 768px | | |
| UI-03 | Loading states shown | Browser | Spinner during async ops | | |
| UI-04 | Keyboard navigation | Browser | Tab order logical | | |
| UI-05 | Form validation | Browser | Inline error messages | | |

#### UI-01: No JavaScript Errors

**Via Claude Code Playwright MCP:**
```
Ask Claude Code: "Navigate to http://localhost:8080/[feature]-admin.html, check for any JavaScript console errors, and take a screenshot"
```

Claude Code will:
1. Use `browser_navigate` to open the page
2. Use `browser_console_messages` with level "error" to check for JS errors
3. Use `browser_take_screenshot` to save as `screenshots/ui-01-no-errors.png`
4. Report any errors found or confirm none

#### UI-02: Responsive Layout

**Via Claude Code Playwright MCP:**
```
Ask Claude Code: "Test responsive layout at desktop (1920x1080), tablet (768x1024), and mobile (375x667) sizes. Navigate to http://localhost:8080/[feature]-admin.html and take screenshots at each size"
```

Claude Code will:
1. Test at 1920x1080: `browser_resize`, `browser_navigate`, `browser_take_screenshot` → `screenshots/ui-02-desktop-1920px.png`
2. Test at 768x1024: `browser_resize`, `browser_navigate`, `browser_take_screenshot` → `screenshots/ui-02-tablet-768px.png`
3. Test at 375x667: `browser_resize`, `browser_navigate`, `browser_take_screenshot` → `screenshots/ui-02-mobile-375px.png`
4. Verify layout adapts correctly at each breakpoint

---

## Standalone Playwright Test Suite (Optional)

> **Note:** This section is for creating reusable test scripts that can run outside Claude Code (e.g., in CI/CD pipelines). For interactive testing, use Claude Code's built-in Playwright MCP plugin as shown above.

Save as `tests/[feature].spec.js`:

```javascript
// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:8080';
const API_URL = 'http://localhost:3001/api';
const API_KEY = process.env.API_KEY || 'your-api-key';

test.describe('[Feature Name] Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Setup: Navigate to feature page
    await page.goto(`${BASE_URL}/[feature]-admin.html`);
  });

  test.describe('Smoke Tests', () => {
    test('page loads successfully', async ({ page }) => {
      await expect(page).toHaveTitle(/[Expected Title]/);
    });

    test('API responds', async ({ request }) => {
      const response = await request.get(`${API_URL}/ping`);
      expect(response.ok()).toBeTruthy();
    });
  });

  test.describe('Authentication', () => {
    test('login with valid credentials', async ({ page }) => {
      await page.fill('#api-key-input', API_KEY);
      await page.click('#login-btn');
      await expect(page.locator('.dashboard')).toBeVisible();
    });

    test('reject invalid credentials', async ({ page }) => {
      await page.fill('#api-key-input', 'invalid-key');
      await page.click('#login-btn');
      await expect(page.locator('.error-message')).toBeVisible();
    });
  });

  test.describe('CRUD Operations', () => {
    test('create new item', async ({ page }) => {
      // Login first
      await page.fill('#api-key-input', API_KEY);
      await page.click('#login-btn');
      await page.waitForSelector('.dashboard');

      // Create
      await page.click('#add-new-btn');
      await page.fill('#name-input', 'Test Item');
      await page.click('#save-btn');

      // Verify
      await expect(page.locator('text=Test Item')).toBeVisible();
    });

    test('edit existing item', async ({ page, request }) => {
      // Pre-create via API
      const createResponse = await request.post(`${API_URL}/v1/[endpoint]`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` },
        data: { name: 'Edit Me' }
      });
      const item = await createResponse.json();

      // Login and navigate
      await page.fill('#api-key-input', API_KEY);
      await page.click('#login-btn');
      await page.waitForSelector('.dashboard');

      // Edit via UI
      await page.click(`[data-id="${item.id}"] .edit-btn`);
      await page.fill('#name-input', 'Updated Name');
      await page.click('#save-btn');

      // Verify
      await expect(page.locator('text=Updated Name')).toBeVisible();
    });

    test('delete item with confirmation', async ({ page }) => {
      // ... similar pattern
    });
  });

  test.describe('Error Handling', () => {
    test('shows error on network failure', async ({ page, context }) => {
      // Login first
      await page.fill('#api-key-input', API_KEY);
      await page.click('#login-btn');
      await page.waitForSelector('.dashboard');

      // Block API requests
      await context.route('**/api/**', route => route.abort());

      // Trigger action that requires API
      await page.click('#refresh-btn');

      // Verify error state
      await expect(page.locator('.error-message')).toBeVisible();
    });
  });
});
```

---

## Running Tests

### Option 1: Via Claude Code (Recommended)

Ask Claude Code to run tests directly:

```
"Run the smoke tests for [feature] - check API responds and UI loads"
"Test the login flow on the admin dashboard"
"Verify there are no JavaScript errors on the content safety page"
"Test creating a new item via the API and verify it shows in the UI"
```

Claude Code will use:
- **Bash tool** for API tests (curl commands)
- **Playwright MCP** for browser tests (navigate, click, type, verify)
- Combined approach for integration tests

### Option 2: Standalone Scripts

#### API Tests

```bash
# Run curl tests manually or via script
chmod +x tests/api-tests.sh
./tests/api-tests.sh
```

#### Playwright Tests (for CI/CD)

```bash
# Install Playwright (one-time)
npm install -D @playwright/test
npx playwright install

# Run all tests
npx playwright test

# Run specific feature tests
npx playwright test tests/[feature].spec.js

# Run headed (visible browser)
npx playwright test --headed

# Generate HTML report
npx playwright test --reporter=html
```

### Playwright Configuration (for standalone tests)

Save as `playwright.config.js`:

```javascript
// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  reporter: [['html'], ['list']],
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
```

---

## Test Results

### Summary

| Category | Passed | Failed | Blocked | Total |
|----------|--------|--------|---------|-------|
| Smoke Tests | | | | |
| Functional Tests | | | | |
| Integration Tests | | | | |
| Error Handling | | | | |
| Edge Cases | | | | |
| UI/UX Tests | | | | |
| **Total** | | | | |

### Failed Tests

| Test ID | Description | Failure Reason | Bug ID | Priority |
|---------|-------------|----------------|--------|----------|
| | | | | |

### Blocked Tests

| Test ID | Description | Blocker | Resolution |
|---------|-------------|---------|------------|
| | | | |

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Tester | | | |
| Developer | | | |
| PM (if required) | | | |

---

## Notes

<!-- Any additional observations, concerns, or recommendations -->

---

*Template Version: 1.0*
*Last Updated: 2026-01-09*
