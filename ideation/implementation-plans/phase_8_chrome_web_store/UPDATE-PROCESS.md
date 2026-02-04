# Wingman AI — Chrome Web Store Update Process

This document describes how to publish updates to the Wingman Chrome Extension after the initial Chrome Web Store listing is live.

---

## Standard Update (Bug Fixes, Features, UI Changes)

### 1. Make Your Code Changes

Work in `wingman-ai/extension/` as usual. Test locally by loading the unpacked extension from `dist/`.

### 2. Bump the Version

Open `extension/manifest.json` and increment the `version` field:

```json
"version": "1.0.1"
```

Chrome Web Store requires each upload to have a higher version than the previous one. Use [semantic versioning](https://semver.org/):

- **Patch** (1.0.0 → 1.0.1): Bug fixes, minor tweaks
- **Minor** (1.0.0 → 1.1.0): New features, non-breaking changes
- **Major** (1.0.0 → 2.0.0): Breaking changes, major redesigns

### 3. Build

```bash
cd wingman-ai/extension
npm run build
```

Make sure the build passes with zero errors.

### 4. Create the Zip

Zip the contents of the `dist/` folder:

```bash
cd dist
zip -r ../wingman-extension.zip .
```

The zip should contain the built files at the root level (i.e., `manifest.json` should be at the top of the zip, not inside a `dist/` subfolder).

### 5. Upload to Chrome Web Store

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click on **Wingman - Real-Time AI Assistant**
3. Go to **Package** (left sidebar)
4. Click **Upload new package**
5. Select your `wingman-extension.zip` file
6. Click **Upload**

### 6. Review and Submit

1. After uploading, review the summary of changes shown in the dashboard
2. If the store listing, privacy practices, or permission justifications need updates, make those changes now (see Special Cases below)
3. Click **Submit for review**

### 7. Wait for Review

- Most updates are approved within **1–3 business days**
- You'll receive an email when the review is complete
- If rejected, the email will explain what needs to change

### 8. Auto-Update Rollout

Once approved, Chrome automatically updates the extension for all users:

- Updates roll out within a few hours of approval
- Users do not need to take any action
- The new version appears silently in the background

---

## Special Cases

### Adding New Permissions

If you add new entries to `permissions` or `host_permissions` in `manifest.json`:

1. Upload the new package as usual
2. Go to **Privacy practices** in the dashboard
3. Add justifications for the new permissions
4. Submit for review — expect closer scrutiny and potentially longer review times
5. Users will see a prompt in Chrome asking them to accept the new permissions before the extension re-enables

### Changing OAuth Scopes

If you add new scopes to the `oauth2.scopes` array in `manifest.json`:

1. Update the GCP OAuth consent screen at [console.cloud.google.com](https://console.cloud.google.com/apis/credentials/consent?project=wingman-extension) to include the new scopes
2. If the new scopes are **sensitive** or **restricted**, Google will require a new OAuth verification review (can take days to weeks)
3. Upload and submit the new package to Chrome Web Store

### Updating the Privacy Policy or Terms of Service

If the privacy policy or terms change:

1. Update the content on the Wingman product page (`ai-entourage.ca/en/wingman`)
2. Update the markdown copies in `ideation/implementation-plans/phase_8_chrome_web_store/`
3. If the URLs changed (they shouldn't), update them in both the Chrome Web Store dashboard and the GCP OAuth consent screen

### Updating the Store Listing (Description, Screenshots)

1. Go to the Developer Dashboard → your extension → **Store listing**
2. Edit the description, screenshots, or promo tiles as needed
3. Click **Submit for review** — listing changes are reviewed alongside package updates, or independently if no package change

---

## What You Never Need to Do

- Re-register or pay the $5 fee again
- Re-submit the privacy policy unless it changed
- Notify Google's Trust & Safety team (unless they contact you)
- Ask users to reinstall — Chrome handles updates automatically

---

## Quick Reference

```
Code change → bump version → npm run build → zip dist/ → upload → submit
```

| Step | Where |
|---|---|
| Build | `wingman-ai/extension/` terminal |
| Upload | [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) |
| OAuth scopes | [GCP Console](https://console.cloud.google.com/apis/credentials/consent?project=wingman-extension) |
| Privacy/Terms page | [ai-entourage.ca/en/wingman](https://ai-entourage.ca/en/wingman) — source in `AI Entourage/website` repo |
