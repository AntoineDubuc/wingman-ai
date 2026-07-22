# Desktop Migration TODO

Converting Wingman AI from a Chrome Extension to a standalone desktop application (Electron or Tauri) involves significant architectural changes, primarily revolving around replacing Chrome-specific APIs with native system equivalents.

Here is a comprehensive checklist of what's left to do:

## 1. Audio Capture
- [ ] Replace `chrome.tabCapture` API, which currently captures browser audio.
- [ ] Implement system-level audio loopback to capture meeting audio.
  - *Tauri:* Requires native Rust libraries (e.g., `cpal` or `rodio`) for audio loopback.
  - *Electron:* Use `desktopCapturer` to capture system or specific application audio, or native Node.js addons for system audio loopback.
- [ ] Ensure the captured audio stream can still be fed into the existing Deepgram Nova-3 WebSocket pipeline.
- [ ] Handle microphone input selection natively, rather than relying on browser `getUserMedia` permissions.

## 2. UI Overlay
- [ ] Replace the content script DOM injection used for the floating overlay.
- [ ] Create a transparent, frameless, always-on-top system window.
  - *Tauri / Electron:* Configure window options (`transparent: true`, `frame: false`, `alwaysOnTop: true`).
  - [ ] Implement click-through handling for parts of the overlay that are completely transparent, while maintaining interactivity for buttons (e.g., the Assistant pill).
- [ ] Implement native dragging to replace the custom DOM draggable logic (`dockable.ts`).

## 3. Storage & State Management
- [ ] Replace `chrome.storage.local` and `chrome.storage.sync`.
  - *Tauri:* Use `tauri-plugin-store` or native filesystem integration (SQLite/JSON).
  - *Electron:* Use `electron-store` or a local SQLite database.
- [ ] Migrate existing user preferences (API keys, themes, personas) from browser storage to the new desktop datastore.
- [ ] Update the state synchronization mechanism (currently using `chrome.storage.onChanged.addListener`) to a native pub/sub or IPC message passing system.

## 4. Background Processing & IPC
- [ ] Replace the Chrome Service Worker (`background/service-worker.ts`) with a desktop main process (Rust in Tauri, or Node.js in Electron).
- [ ] Convert `chrome.runtime.sendMessage` and `chrome.runtime.onMessage` to IPC (Inter-Process Communication).
  - *Tauri:* Use `invoke` and Tauri events.
  - *Electron:* Use `ipcMain` and `ipcRenderer`.
- [ ] Move API calls (Deepgram, Gemini, Groq, OpenRouter) to the main process to avoid CORS issues and secure API keys.

## 5. OAuth & Integrations (Google Drive)
- [ ] Replace Chrome Identity API (`chrome.identity.getAuthToken`) used for Google Drive integration.
- [ ] Implement a local OAuth flow (e.g., spinning up a temporary localhost server or handling deep links) to capture the authentication callback.
- [ ] Securely store OAuth tokens in the system keychain/credential manager (e.g., `keytar` in Electron or `tauri-plugin-stronghold` in Tauri).

## 6. Permissions
- [ ] Request system-level Microphone permissions.
- [ ] Request system-level Accessibility/Screen Recording permissions (required on macOS for audio loopback and always-on-top overlays).

## 7. Packaging & Distribution
- [ ] Set up build pipelines for macOS (DMG/PKG) and Windows (EXE/MSI).
- [ ] Implement application code signing and notarization (Apple Developer ID, Windows Authenticode) to prevent SmartScreen/Gatekeeper warnings.
- [ ] Implement an auto-updater mechanism (replacing Chrome Web Store auto-updates).

## 8. Localization (i18n)
- [ ] Adapt the `chrome.i18n` logic to a generic i18n library (like `i18next`) for the UI and backend logic.
- [ ] Ensure the 5 currently supported locales continue working seamlessly.
