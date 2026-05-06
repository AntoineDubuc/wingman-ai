# PRD AC Test-Method Tagging Methodology (NFR-Q03)

How to tag every PRD acceptance criterion with the required verification method.

## 1. Why

The PRD has ~172 acceptance criteria across functional and non-functional requirements. Each AC needs a verification method tagged so the test plan is complete and reviewable. Without tags, ambiguity hides untested ACs.

## 2. The 4 method tags

| Tag | When to use | Example |
|---|---|---|
| **`unit`** | Pure function or class behavior verifiable in isolation. Mocked dependencies. | "validateLocale returns null for unsupported tags" |
| **`integration`** | Multiple components wired together; real i18n bundle, real chrome.storage, but no real browser UI. jsdom + vitest. | "OptionsController.init renders picker with active locale" |
| **`e2e`** | Real browser, real DOM, full extension loaded. Playwright. | "User on Romanian browser sees picker greyed out during session" |
| **`manual`** | Requires human judgment OR a state that test infrastructure can't easily produce (e.g., specific OS-level behavior, accessibility screen-reader interaction). | "Native French speaker confirms tone is appropriate for Quebec audience" |

A single AC may need MORE THAN ONE tag (e.g., a unit test AND a manual review). Tag both.

## 3. Tagging format

Add the tag(s) to the AC line in the PRD using square brackets:

```markdown
- AC-FR001-01: Picker displays all 5 supported locales in native-script names. [unit, e2e]
- AC-FR001-02: UI updates ≤100ms p95 after selection change. [e2e]
- AC-NFR-Q02-01: No non-en bundle ships at reviewer_status !== 'native-reviewed'. [manual]
```

## 4. Tagging pass workflow

For each section of the PRD:
1. Read the AC.
2. Decide: can this be verified with mocks alone? → `unit`.
3. If not: can this be verified with real bundles + jsdom but no browser? → `integration`.
4. If not: needs a real browser? → `e2e`.
5. Cannot be automated at all? → `manual`.
6. May need multiple methods? Tag all that apply.

## 5. Coverage report

Once tagged, generate a coverage report:

```bash
# Pseudo-code; implement when needed:
grep -E '^\s*-\s*AC-' Research/conversations/drive-kb-source-prd/prd.md | \
  awk -F'\\[' '{print $2}' | tr -d ']' | sort | uniq -c
```

Expected output: histogram of method tags. Any AC with NO tag is a coverage gap.

## 6. Status

**Tagging pass status:** NOT YET STARTED.

The full tagging pass against ~172 ACs is a tedious mechanical task best done in a single focused session by one author for consistency. Plan 13 lands the methodology; the actual pass is a separate ~2-hour task. Recommended owner: PM.

**Sample tagged ACs (proof of concept):**

| AC | Method |
|---|---|
| AC-FR001-01 (picker shows 5 locales) | unit, e2e |
| AC-FR001-02 (UI updates ≤100ms p95) | e2e |
| AC-FR002-01 (Romanian browser → Romanian options on first paint) | integration, e2e |
| AC-FR009-01 (picker disabled on session start) | unit, e2e |
| AC-NFR-SEC03-01 (no Unicode violations in bundles) | unit (BUILD-03) |
| AC-NFR-M02-01 (key parity across bundles) | unit (BUILD-01) |
| AC-NFR-Q02-01 (native-speaker review gate) | manual |
| AC-NFR-Q03-01 (every AC has a method tag) | manual (this very doc enforces it) |
| AC-NFR-P03-01 (each bundle ≤50KB) | unit (BUILD-01) |
| AC-NFR-A11Y-01 (lang attribute matches active locale) | integration, e2e |

## 7. Hand-off

Plan 13 closes with the methodology and these 10 sample tags. The full 172-AC pass is deferred to a follow-up doc-only plan. When that plan runs, it should:

1. Read the canonical PRD at `Research/conversations/drive-kb-source-prd/prd.md`.
2. Apply the methodology above to every AC.
3. Produce a coverage table grouped by method tag.
4. Flag any AC that resists clear tagging — those are PRD ambiguities the PM should resolve.
