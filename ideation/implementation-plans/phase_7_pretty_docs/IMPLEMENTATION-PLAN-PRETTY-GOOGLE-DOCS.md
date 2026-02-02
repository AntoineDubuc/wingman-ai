# Implementation Plan: Rich Formatted Google Docs Output

---

## Executive Summary

Google Drive transcripts are currently uploaded as raw Markdown (`.md`), plain text (`.txt`), or JSON (`.json`) files. When opened in Google Drive, Markdown renders as unformatted monospace text — no headings, no bold, no tables, no color. The result is ugly and hard to scan, especially for sales managers reviewing call records.

This implementation replaces the default export with a **native Google Doc** that uses rich formatting: styled headings, colored metadata tables, visually distinct AI suggestion blocks, speaker-colored transcript entries, and a branded footer. The approach uses the Drive API's built-in HTML-to-Google-Doc conversion — upload HTML content with the target `mimeType: 'application/vnd.google-apps.document'`, and Drive handles the conversion automatically. No new OAuth scopes, no new dependencies, no Google Docs API needed.

**Key Outcomes:**
- Default export produces a native Google Doc with professional formatting
- Metadata displayed in a styled table with alternating row highlights
- Call summary section with clear headings and checkbox-style action items
- AI suggestions visually distinct from speech (amber background, bold label)
- Speaker entries color-coded (blue for user, green for customer)
- Markdown, text, and JSON formats preserved as alternative options
- File opens directly in Google Docs editor (not a raw file preview)

---

## Product Manager Review

### Feature Overview

After every Wingman session, the transcript and call summary auto-save to Google Drive. Today the default format is a Markdown file that Google Drive renders as raw text — no formatting, no colors, no structure. Users see a wall of unformatted text that's hard to read and unprofessional to share.

This feature makes the Google Drive output look polished and professional by default. The transcript opens as a native Google Doc with real headings, a formatted metadata table, color-coded speakers, and highlighted AI suggestions. Users can share these docs with colleagues or paste into CRM tools and they look great out of the box.

### Features

#### Feature 1: Native Google Doc Format (Default)

**What it is:** A new `formatGoogleDoc()` method in `drive-service.ts` that generates structured HTML with inline styles. The Drive API converts this HTML into a native Google Doc on upload.

**Why it matters:** Native Google Docs render with full formatting — headings, tables, bold text, colors. They open in the Google Docs editor (not a file preview), support commenting, and are searchable. This is what users expect when they "save to Drive."

**User perspective:** After stopping a session, the user sees a link to their transcript. Clicking it opens a beautifully formatted Google Doc instead of a raw text file.

---

#### Feature 2: Styled Document Sections

**What it is:** The Google Doc has distinct visual sections: a header with meeting title, a metadata table, a call summary block, and a transcript section — each with appropriate formatting.

**Why it matters:** Sales professionals scan these docs quickly. Clear section breaks and visual hierarchy let them jump to action items, review key moments, or skim the transcript without reading everything.

**User perspective:** The doc has a blue header, a clean metadata table, summary bullets, action item checkboxes, and a clearly separated transcript section.

---

#### Feature 3: Color-Coded Speakers and Highlighted AI Suggestions

**What it is:** Speaker names use distinct colors (blue for the user, green for customers). AI suggestions appear in amber-highlighted blocks with a "Wingman AI" label.

**Why it matters:** In a long transcript, users need to instantly distinguish "what was said" from "what the AI recommended." Color coding makes speakers identifiable at a glance.

**User perspective:** Scanning the transcript, the user's own speech has blue speaker labels, customer speech has green labels, and AI suggestions stand out in amber blocks.

---

#### Feature 4: Updated Format Selector

**What it is:** The options page format selector adds "Google Doc (formatted)" as the default option, with Markdown/text/JSON as alternatives.

**Why it matters:** Users who prefer raw formats for programmatic processing can still select them. The default should produce the best-looking output.

**User perspective:** In settings, the format dropdown now defaults to "Google Doc (formatted)" with a note that it produces a richly formatted document.

---

## Technical Approach

### How Drive API HTML→Doc Conversion Works

The Drive API v3 supports converting uploaded content to native Google Workspace formats. To create a native Google Doc from HTML:

1. **File metadata** — set `mimeType: 'application/vnd.google-apps.document'` (the target format)
2. **Upload body** — use `Content-Type: text/html` (the source format)
3. **Drive converts automatically** — HTML tags map to Google Docs elements

```
Upload:
  metadata.mimeType = 'application/vnd.google-apps.document'  (target)
  Content-Type: text/html                                      (source)

Result:
  <h1>  →  "Heading 1" paragraph style
  <h2>  →  "Heading 2" paragraph style
  <strong>  →  Bold text
  <table>  →  Native Google Docs table
  inline style="color: #1a73e8"  →  Blue text
  inline style="background-color: #fef7e0"  →  Amber cell background
```

**Important constraints:**
- All CSS must be **inline styles** — `<style>` blocks and CSS classes are stripped
- Supported: `color`, `background-color`, `font-weight`, `font-size`, `padding`, `border`, `text-align`, `margin`, `font-family`
- Not supported: `border-radius`, `flexbox`, `grid`, `page-break`, `box-shadow`
- Tables convert reliably and are the best way to create visual blocks
- The file URL changes: `https://docs.google.com/document/d/{id}/edit` (not `drive.google.com/file/d/`)

**No new OAuth scopes needed.** The existing `drive.file` scope is sufficient since we created the file.

### HTML Template Design

```
┌────────────────────────────────────────────────────────┐
│  [H1, blue] Meeting Transcript — Thursday, Jan 15, 2026│
├────────────────────────────────────────────────────────┤
│  ┌──────────────┬─────────────────────────────┐        │
│  │ Time         │ 02:30 – 03:15 (45 min)      │        │
│  │ Speakers     │ 2                            │        │
│  │ Entries      │ 127                          │        │
│  │ AI Suggest.  │ 8                            │        │
│  └──────────────┴─────────────────────────────┘        │
├────────────────────────────────────────────────────────┤
│  [H2] Call Summary — Jan 15, 2026                      │
│  Duration: 45 min | Speakers: 2                        │
│                                                        │
│  [H3] Summary                                          │
│  • Discussed Q1 pricing strategy...                    │
│  • Budget approval timeline...                         │
│                                                        │
│  [H3] Action Items                                     │
│  ☐ You: Send ROI comparison by Friday                  │
│  ☐ Them: Confirm CTO availability                      │
│                                                        │
│  [H3] Key Moments                                      │
│  "Budget is approved for Q2 if we pass legal review"   │
├──────────────── [horizontal rule] ─────────────────────┤
│  [H2] Transcript                                       │
│                                                        │
│  [blue, bold] You — 02:30                              │
│      Opening remarks and agenda setting                │
│                                                        │
│  [green, bold] Participant (Customer) — 02:35          │
│      Questions about the pricing model                 │
│                                                        │
│  ┌─────────────────────────────────────────────┐       │
│  │ [amber bg] Wingman AI (answer) — 02:36      │       │
│  │ Pricing is tiered by usage; enterprise plans │       │
│  │ start at $X/month with volume discounts      │       │
│  └─────────────────────────────────────────────┘       │
│                                                        │
│  [blue, bold] You — 02:38                              │
│      Follow-up on enterprise pricing...                │
│                                                        │
├──────────────── [horizontal rule] ─────────────────────┤
│  [center, gray] Generated by Wingman AI — Jan 15, 2026 │
└────────────────────────────────────────────────────────┘
```

### Color Palette

| Element | Color | Hex |
|---------|-------|-----|
| Header text | Google Blue | `#1a73e8` |
| User speaker label | Google Blue | `#1a73e8` |
| Customer speaker label | Google Green | `#34a853` |
| AI suggestion background | Amber Light | `#fef7e0` |
| AI suggestion border (left) | Google Yellow | `#fbbc04` |
| AI suggestion label | Amber Dark | `#e37400` |
| Metadata table header cells | Light Gray | `#f8f9fa` |
| Table borders | Google Gray | `#dadce0` |
| Timestamps | Medium Gray | `#80868b` |
| Body text | Dark Gray | `#3c4043` |
| Footer text | Light Gray | `#9aa0a6` |

---

## Master Checklist

### Instructions for Claude Code

> **CRITICAL: You must follow these rules exactly.**
>
> 1. **Save after every cell write.** You cannot batch writes to this table. Each time you update a cell (start time, end time, estimate, etc.), you must save the file immediately before proceeding to other cells or other work.
>
> 2. **Check the checkbox** when you begin a task. This serves as a visual indicator of which task is currently in progress.
>
> 3. **Workflow for each task:**
>    - Check the checkbox `[x]` → Save
>    - Write start time → Save
>    - Complete the implementation work
>    - Write end time → Save
>    - Calculate and write total time → Save
>    - Write human time estimate → Save
>    - Calculate and write multiplier → Save
>    - Move to next task
>
> 4. **Time format:** Use `HH:MM` (24-hour format) for start/end times. Use minutes for total time and estimates.
>
> 5. **Multiplier calculation:** `Multiplier = Human Estimate ÷ Total Time`. Express as `Nx` (e.g., `10x` means 10 times faster than human estimate).
>
> 6. **If blocked:** Note the blocker in the task description section below and move to the next unblocked task.

### Progress Dashboard

| Done | # | Task Name | Start | End | Total (min) | Human Est. (min) | Multiplier |
|:----:|:-:|-----------|:-----:|:---:|:-----------:|:----------------:|:----------:|
| [ ] | 1 | Add `formatGoogleDoc()` HTML generator | | | | 45 | |
| [ ] | 2 | Update `uploadFile()` to support Google Doc conversion | | | | 15 | |
| [ ] | 3 | Handle Google Docs URL format | | | | 10 | |
| [ ] | 4 | Add "Google Doc" format option and make it default | | | | 20 | |
| [ ] | 5 | Update options page UI for new format | | | | 15 | |
| [ ] | 6 | Build and validate end-to-end | | | | 10 | |

**Summary:**
- Total tasks: 6
- Completed: 0
- Total time spent: 0 minutes
- Total human estimate: 115 minutes
- Overall multiplier: --

---

## Task Descriptions

This section provides context for each task. Read the relevant description before starting implementation.

---

### Task 1: Add `formatGoogleDoc()` HTML generator

**Intent:** Create a new formatter method that generates structured HTML with inline styles, producing a richly formatted document when converted to a native Google Doc.

**Context:** The existing `formatMarkdown()`, `formatText()`, and `formatJson()` methods generate plain text content. The new `formatGoogleDoc()` method follows the same pattern but outputs HTML. All styles must be inline since Google's HTML-to-Doc conversion strips `<style>` blocks and CSS classes.

**Expected behavior:**

Add a new private method `formatGoogleDoc()` to the `DriveService` class:

```typescript
private formatGoogleDoc(
  transcripts: TranscriptData[],
  metadata: SessionMetadata,
  summary: CallSummary | null
): string {
  // Build HTML string with inline styles
}
```

**HTML structure to generate:**

1. **Document wrapper:**
   ```html
   <html><body style="font-family: Arial, sans-serif; color: #3c4043; line-height: 1.6;">
   ```

2. **Title heading:**
   ```html
   <h1 style="color: #1a73e8; font-size: 24px; border-bottom: 2px solid #1a73e8; padding-bottom: 10px;">
     Meeting Transcript — Thursday, January 15, 2026
   </h1>
   ```

3. **Metadata table** (2-column, label + value):
   ```html
   <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
     <tr>
       <td style="padding: 8px 12px; border: 1px solid #dadce0; background-color: #f8f9fa; font-weight: bold; width: 180px;">Time</td>
       <td style="padding: 8px 12px; border: 1px solid #dadce0;">02:30 – 03:15 (45 min)</td>
     </tr>
     <!-- Speakers, Transcript entries, AI suggestions rows -->
   </table>
   ```

4. **Call summary section** (if present):
   ```html
   <h2 style="color: #3c4043; margin-top: 24px;">Call Summary — Jan 15, 2026</h2>
   <p><strong>Duration:</strong> 45 min | <strong>Speakers:</strong> 2</p>

   <h3 style="color: #5f6368;">Summary</h3>
   <ul>
     <li>Discussion of Q1 pricing strategy...</li>
   </ul>

   <h3 style="color: #5f6368;">Action Items</h3>
   <ul>
     <li>&#9744; <strong>You:</strong> Send ROI comparison by Friday</li>
     <li>&#9744; <strong>Them:</strong> Confirm CTO availability</li>
   </ul>

   <h3 style="color: #5f6368;">Key Moments</h3>
   <ul>
     <li><em>"Budget is approved for Q2..."</em></li>
   </ul>
   ```
   Note: `&#9744;` is the Unicode ballot box (☐) character for unchecked checkboxes.

5. **Horizontal rule separator:**
   ```html
   <hr style="border: none; border-top: 2px solid #dadce0; margin: 24px 0;">
   ```

6. **Transcript heading:**
   ```html
   <h2 style="color: #3c4043;">Transcript</h2>
   ```

7. **Speech entries** — speaker header (color-coded) with indented text:
   ```html
   <!-- User (blue) -->
   <p style="margin-top: 16px; margin-bottom: 2px;">
     <strong style="color: #1a73e8;">You</strong>
     <span style="color: #80868b; font-size: 0.9em;"> — 02:30</span>
   </p>
   <p style="margin-left: 16px; margin-top: 2px; color: #3c4043;">
     Opening remarks and agenda setting
   </p>

   <!-- Customer (green) -->
   <p style="margin-top: 16px; margin-bottom: 2px;">
     <strong style="color: #34a853;">Participant (Customer)</strong>
     <span style="color: #80868b; font-size: 0.9em;"> — 02:35</span>
   </p>
   <p style="margin-left: 16px; margin-top: 2px; color: #3c4043;">
     Questions about pricing model
   </p>
   ```

8. **AI suggestion entries** — single-cell table with amber background:
   ```html
   <table style="width: 100%; border-collapse: collapse; margin: 12px 0;">
     <tr>
       <td style="padding: 10px 14px; background-color: #fef7e0; border-left: 4px solid #fbbc04;">
         <strong style="color: #e37400;">Wingman AI</strong>
         <span style="color: #80868b; font-size: 0.9em;"> (answer) — 02:36</span>
         <br>
         <span style="color: #5f6368;">Pricing is tiered by usage...</span>
       </td>
     </tr>
   </table>
   ```
   Note: Using a table for suggestions guarantees the background color survives conversion. A `<div>` with `background-color` might be stripped.

9. **Footer:**
   ```html
   <hr style="border: none; border-top: 2px solid #dadce0; margin: 24px 0;">
   <p style="text-align: center; color: #9aa0a6; font-size: 0.85em;">
     Generated by <a href="https://github.com/AntoineDubuc/wingman-ai" style="color: #1a73e8;">Wingman AI</a> — Thursday, January 15, 2026
   </p>
   ```

10. **Close tags:**
    ```html
    </body></html>
    ```

**Speaker color logic:**

```typescript
function getSpeakerColor(t: TranscriptData): string {
  if (t.is_self) return '#1a73e8';              // Google Blue — user
  if (t.speaker_role === 'customer') return '#34a853'; // Google Green — customer
  return '#5f6368';                              // Gray — unknown/other
}
```

**Speaker grouping:** Same logic as `formatMarkdown()` — track `currentSpeaker` and only emit a new speaker header when the speaker changes.

**HTML escaping:** Must escape `<`, `>`, `&`, `"` in transcript text to prevent broken HTML. Add a helper:
```typescript
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

**Key components:**
- `src/services/drive-service.ts` — new `formatGoogleDoc()` method

**Notes:** Keep the method self-contained. All HTML generation happens via string concatenation (pushing to a `lines[]` array, same pattern as the other formatters). No template library needed.

---

### Task 2: Update `uploadFile()` to support Google Doc conversion

**Intent:** Modify the upload method to handle the MIME type conversion that tells Drive to create a native Google Doc from HTML.

**Context:** The current `uploadFile()` sets the file metadata `name` and `parents`, then uses a multipart upload with the content MIME type. For Google Doc conversion, the metadata must include `mimeType: 'application/vnd.google-apps.document'` and the content part must use `Content-Type: text/html`.

**Expected behavior:**

Update `uploadFile()` to accept an optional `convertToGoogleDoc` parameter:

```typescript
private async uploadFile(
  token: string,
  folderId: string,
  filename: string,
  content: string,
  mimeType: string,
  convertToGoogleDoc: boolean = false
): Promise<string | null> {
  const metadata: Record<string, unknown> = {
    name: filename,
    parents: [folderId],
  };

  // If converting to Google Doc, set target mimeType in metadata
  if (convertToGoogleDoc) {
    metadata.mimeType = 'application/vnd.google-apps.document';
  }

  // ... rest of multipart upload unchanged ...
  // The Content-Type in the body part remains the source mimeType (text/html)
}
```

**Key change:** When `convertToGoogleDoc` is true, the metadata JSON includes `mimeType: 'application/vnd.google-apps.document'`. The body content part's `Content-Type` remains `text/html`. This two-part combination tells Drive: "the source is HTML, convert it to a Google Doc."

Update the `formatTranscript()` method to handle the new format:

```typescript
if (fileFormat === 'googledoc') {
  return {
    filename: `Transcript - ${dateStr} (${durationMins} min)`,  // No extension needed
    content: this.formatGoogleDoc(transcripts, metadata, summary),
    mimeType: 'text/html',
    convertToGoogleDoc: true,
  };
}
```

The return type of `formatTranscript()` needs a new field:
```typescript
): { filename: string; content: string; mimeType: string; convertToGoogleDoc?: boolean }
```

And `saveTranscript()` must pass it through:
```typescript
const { filename, content, mimeType, convertToGoogleDoc } = this.formatTranscript(...);
const fileUrl = await this.uploadFile(token, folderId, filename, content, mimeType, convertToGoogleDoc);
```

**Key components:**
- `src/services/drive-service.ts` — `uploadFile()`, `formatTranscript()`, `saveTranscript()`

**Notes:** Google Docs don't have file extensions — the filename should not end in `.html` or `.gdoc`. Just use the base name like `Transcript - Jan 15, 2026 (45 min)`.

---

### Task 3: Handle Google Docs URL format

**Intent:** Return the correct Google Docs editor URL instead of the Drive file preview URL.

**Context:** Currently `uploadFile()` returns `https://drive.google.com/file/d/${file.id}/view`. For native Google Docs, the correct URL is `https://docs.google.com/document/d/${file.id}/edit`. This URL opens the document directly in the Google Docs editor.

**Expected behavior:**

Update `uploadFile()` to return the appropriate URL:

```typescript
if (response.ok) {
  const file = await response.json();
  if (convertToGoogleDoc) {
    return `https://docs.google.com/document/d/${file.id}/edit`;
  }
  return `https://drive.google.com/file/d/${file.id}/view`;
}
```

**Key components:**
- `src/services/drive-service.ts` — `uploadFile()` return value

**Notes:** The overlay and content script that display the "View in Drive" link don't need changes — they just use whatever URL `saveTranscript()` returns. The link text could optionally be updated to "Open in Google Docs" but that's cosmetic and out of scope.

---

### Task 4: Add "Google Doc" format option and make it default

**Intent:** Register `'googledoc'` as a valid format option and make it the default for new installations.

**Context:** The format is stored in `chrome.storage.local` as `driveFileFormat` and read in `handleStopSession()` of the service worker. The options page `drive.ts` section manages the dropdown.

**Expected behavior:**

1. **Update `formatTranscript()`** in `drive-service.ts` — add the new format case at the top (since it's the new default):
   ```typescript
   if (fileFormat === 'googledoc') {
     return {
       filename: `Transcript - ${dateStr} (${durationMins} min)`,
       content: this.formatGoogleDoc(transcripts, metadata, summary),
       mimeType: 'text/html',
       convertToGoogleDoc: true,
     };
   } else if (fileFormat === 'json') {
     // ... existing
   ```

2. **Update default format** — wherever the format is read with a fallback default, change from `'markdown'` to `'googledoc'`:
   ```typescript
   const fileFormat = storage.driveFileFormat || 'googledoc';
   ```

**Key components:**
- `src/services/drive-service.ts` — `formatTranscript()`
- `src/background/service-worker.ts` — `handleStopSession()` (where `driveFileFormat` is read)

**Notes:** Existing users who explicitly selected "markdown" keep their setting. Only new installations (no stored value) get the new default.

---

### Task 5: Update options page UI for new format

**Intent:** Add "Google Doc (formatted)" to the format selector dropdown and reorder so it appears first.

**Context:** The Drive section of the options page (`src/options/sections/drive.ts`) manages the format dropdown. Currently it has Markdown, Text, and JSON options.

**Expected behavior:**

Find the format `<select>` element in the Drive section and add the new option:

```html
<select id="drive-format">
  <option value="googledoc">Google Doc (formatted)</option>
  <option value="markdown">Markdown (.md)</option>
  <option value="text">Plain Text (.txt)</option>
  <option value="json">JSON (.json)</option>
</select>
```

The existing storage read/write logic should work unchanged since it just stores the `<select>` value string.

Optionally add a brief description below the selector:
> "Google Doc" creates a richly formatted native Google Doc with colored headings, styled tables, and highlighted AI suggestions.

**Key components:**
- `src/options/sections/drive.ts` — format dropdown HTML and initialization

**Notes:** The options page is section-based. The Drive section manages its own DOM. No changes needed to `options.ts` controller.

---

### Task 6: Build and validate end-to-end

**Intent:** Run the full build pipeline and verify everything compiles cleanly. Then test with a real Google Drive save.

**Context:** Depends on all previous tasks. Catches type mismatches, missing imports, and build errors.

**Expected behavior:**
- `npm run typecheck` passes with zero errors
- `npm run build` produces clean dist
- `formatTranscript()` correctly routes `'googledoc'` format to `formatGoogleDoc()` and sets `convertToGoogleDoc: true`
- `uploadFile()` sets `mimeType: 'application/vnd.google-apps.document'` in metadata when converting
- The returned URL uses `docs.google.com/document/d/` pattern

**Live validation steps:**
1. Load updated extension in Chrome
2. Open Google Meet, start a Wingman session
3. Speak enough to trigger at least one AI suggestion
4. Stop the session
5. Verify the auto-saved file:
   - Opens as a native Google Doc (not a raw file)
   - Has formatted headings (H1 for title, H2 for sections)
   - Metadata table has borders and shaded header cells
   - Call summary section is present with bullets and action items
   - Transcript has color-coded speaker names
   - AI suggestions have amber background blocks
   - Footer links to Wingman AI repo
6. Test alternative formats (change setting to Markdown, Text, JSON) — confirm they still work unchanged

**Key components:**
- All files from Tasks 1-5

---

## Appendix

### Technical Decisions

**HTML→Doc conversion via Drive API over Google Docs API (`batchUpdate`):** The Docs API requires tracking character offsets for every insertion and explicit formatting requests for every text range. A 100-entry transcript would need hundreds of batch update requests. The HTML approach lets us generate a single HTML string and let Drive handle the conversion. It's dramatically simpler (one upload call vs. create + N batch updates) and produces good enough formatting for our use case.

**Inline styles over CSS `<style>` block:** Google's HTML-to-Doc converter strips `<style>` blocks and CSS class selectors. All styling must be applied as `style="..."` attributes on individual elements. This makes the HTML verbose but is the only reliable way to preserve formatting through conversion.

**Single-cell table for AI suggestion blocks:** A `<div>` with `background-color` might not survive the HTML-to-Doc conversion reliably. A `<table>` with a single cell and `background-color` on the `<td>` is the most reliable way to create a colored block in Google Docs. This is a well-known pattern for HTML email rendering that also applies here.

**Google Blue/Green/Yellow color scheme:** Uses Google's own Material Design colors (`#1a73e8`, `#34a853`, `#fbbc04`) for brand consistency. These colors are accessible (WCAG AA contrast ratios on white backgrounds) and look professional in the Google Docs context.

**`&#9744;` (☐) for action item checkboxes:** Google Docs' native checkbox insertion isn't supported via HTML conversion. The Unicode ballot box character is the next best option — it renders correctly and is visually recognizable. If the user copies the doc to a Notion or GitHub context, these still look like checkboxes.

**No file extension for Google Doc filename:** Native Google Docs don't have extensions. Using `Transcript - Jan 15, 2026 (45 min)` instead of `Transcript - Jan 15, 2026 (45 min).html` avoids confusing the user.

### Dependencies

No new dependencies. The HTML is generated via string concatenation, same as the existing formatters. No template engine needed.

### Scope Notes

**No new OAuth scopes required.** The `drive.file` scope allows creating files in Drive, including native Google Docs via conversion. The Google Docs API scope (`https://www.googleapis.com/auth/documents`) is NOT needed since we're not using the Docs API.

### Out of Scope

- **Google Docs API formatting** — Would allow pixel-perfect control but dramatically increases complexity; the HTML approach is sufficient
- **Custom fonts** — Google Docs conversion uses default fonts; custom fonts require the Docs API
- **Embedded images/logos** — Would require uploading images separately and referencing them; adds complexity for minimal value
- **Print-optimized layout** — Page breaks and print margins aren't supported by the HTML conversion
- **Retroactive reformatting** — Existing Drive files won't be updated; only new sessions get the formatted output
- **Template customization** — Users cannot customize the doc template; this could be a future feature
