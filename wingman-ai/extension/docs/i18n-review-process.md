# i18n Native-Speaker Review Process (NFR-Q02)

Hard release gate before any user-facing rollout of non-English locales.

## 1. Why this exists

PRD NFR-Q02 mandates that no non-English bundle ships to end users without a native-speaker review. Auto-generated translations are ACCEPTABLE for development/testing but UNACCEPTABLE for production. This document defines the workflow, sign-off semantics, and release-blocker rules.

## 2. The release gate

A non-English bundle (fr, es, ro, ru) is release-eligible if and only if BOTH:

- `_meta.reviewer_status === 'native-reviewed'` in `src/locales/{locale}/translation.json`
- `docs/i18n-reviews/{locale}-{revision}.md` exists, signed by the named reviewer

If a release attempts to ship with a non-en bundle at `'pending-native-review'`, the release MUST be blocked.

## 3. Roles

| Role | Responsibilities |
|---|---|
| **Reviewer** | Native or fluent speaker of the target locale. Reads every user-facing string in the bundle. Approves, rejects, or requests changes. Signs off via `docs/i18n-reviews/{locale}-{revision}.md`. |
| **Translation editor** | Engineer or PM who incorporates reviewer feedback into the bundle. Bumps `_meta.revision` and resets `_meta.reviewer_status` to `pending-native-review` after any change. |
| **Release manager** | Confirms the release-gate predicate before shipping. Blocks the release if any locale is pending. |

## 4. Sign-off artifact format

`docs/i18n-reviews/{locale}-{revision}.md`:

```markdown
# i18n Native-Speaker Review — {locale} ({revision})

**Reviewer:** {Full Name}
**Native locale:** {locale-tag, e.g. fr-CA, es-MX, ro-RO, ru-RU}
**Date:** {ISO date}
**Bundle commit:** {git short hash of the commit containing the reviewed bundle}
**Bundle hash:** {SHA-256 of src/locales/{locale}/translation.json — first 8 chars}
**Verdict:** {APPROVED | REJECTED | APPROVED-WITH-CONDITIONS}

## Summary

{1-2 paragraph summary of the review.}

## Per-string verdicts

| Key | Original (en) | Translation | Verdict | Notes |
|---|---|---|---|---|
| ... | ... | ... | OK / FIX / REWORD | ... |

(The reviewer is NOT required to list every key. Only those needing change. A clean review may omit this table entirely.)

## Issues found

(Bulleted list of issues. May be empty.)

## Sign-off

I confirm I have reviewed every user-facing string in `src/locales/{locale}/translation.json` at the named bundle commit. The translation is correct, idiomatic for {region}, and ready for production release.

Signed: {Full Name}
```

## 5. Workflow

```
1. Translation editor authors / updates non-en bundle.
   → bundle._meta.reviewer_status = 'pending-native-review'
   → bundle._meta.revision bumped

2. Reviewer pulls the bundle.
   → Reads every string against the canonical English source.
   → Notes issues; submits feedback.

3a. If APPROVED:
   → Reviewer writes docs/i18n-reviews/{locale}-{revision}.md with verdict APPROVED.
   → Translation editor flips bundle._meta.reviewer_status = 'native-reviewed'.
   → Bundle is release-eligible.

3b. If REJECTED or APPROVED-WITH-CONDITIONS:
   → Translation editor incorporates feedback.
   → Bumps revision.
   → Loop back to step 2.
```

## 6. Region considerations

The PRD does not mandate a specific regional variant per locale. Recommended defaults:

- **fr** — Quebec French (largest North American base; matches user). LatAm Spanish (es-419) for non-IberoLatin neutrality.
- **es** — Neutral Latin American (es-419). Avoid Castilian-specific vocabulary.
- **ro** — Standard Romanian (ro-RO). Use comma-below diacritics (Ș/ț), NOT older cedilla (Ş/ţ).
- **ru** — Standard Russian (ru-RU).

Reviewers should be matched to the regional variant: a Madrid-Spanish reviewer is NOT appropriate for a neutral-LatAm bundle.

## 7. Re-review triggers

A previously-approved bundle returns to `'pending-native-review'` if ANY of:

- Any user-facing string is added.
- Any user-facing string is modified (even trivially).
- The English canonical source for a key changes (the locale's translation may need adjustment).
- The bundle's `_meta.revision` changes (this is the gate).

Sanitizer-only edits (NFC normalization, homoglyph repair) DO NOT require re-review. Document the edit in the PR; the reviewer's prior sign-off remains valid.

## 8. Release-time check

Before shipping any user-facing release, the release manager runs:

```bash
# Manual check until CI lands:
node -e "
const fs = require('fs');
const locales = ['fr', 'es', 'ro', 'ru'];
let blocked = false;
for (const locale of locales) {
  const meta = require('./extension/src/locales/' + locale + '/translation.json')._meta;
  const status = meta.reviewer_status;
  if (status !== 'native-reviewed') {
    console.error('BLOCKED: ' + locale + ' is at status ' + status);
    blocked = true;
    continue;
  }
  const reviewPath = 'extension/docs/i18n-reviews/' + locale + '-' + meta.revision + '.md';
  if (!fs.existsSync(reviewPath)) {
    console.error('BLOCKED: ' + locale + ' status is native-reviewed but review artifact missing at ' + reviewPath);
    blocked = true;
  }
}
if (blocked) process.exit(1);
console.log('All locales release-ready.');
"
```

When CI lands (follow-up plan), this check becomes a release-gate workflow step.

## 9. Reviewer recruitment

OUT of scope for this document and for Plan 13. The PM/release manager is responsible for sourcing reviewers per locale. Recommended channels: internal employees (preferred — confidentiality), professional translation services, community contributors (lowest priority — quality variance).

## 10. Status as of 2026-05-05

| Locale | Status | Last revision | Reviewer | Sign-off artifact |
|---|---|---|---|---|
| en | canonical-english-source | plan-3-r2 | N/A | N/A |
| fr | pending-native-review | plan-3-r2 | NOT YET ASSIGNED | NONE |
| es | pending-native-review | plan-3-r2 | NOT YET ASSIGNED | NONE |
| ro | pending-native-review | plan-3-r2 | NOT YET ASSIGNED | NONE |
| ru | pending-native-review | plan-3-r2 | NOT YET ASSIGNED | NONE |

All 4 non-en bundles are at `'pending-native-review'`. Release of any user-facing localization is BLOCKED until all 4 reach `'native-reviewed'` with paired sign-off artifacts.
