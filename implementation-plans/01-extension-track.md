# Implementation Plan: Chrome Extension Track

---

## Executive Summary

The Chrome Extension Track delivers the client-side foundation for the Presales AI Assistant, enabling real-time audio capture from Google Meet sessions and seamless communication with the AI backend. This track implements a Manifest V3 Chrome extension that captures tab audio using the TabCapture API, streams it to the backend via WebSocket, and presents AI-generated suggestions through an unobtrusive overlay UI. The extension serves as the critical bridge between the user's live meeting environment and the intelligent backend processing pipeline.

**Key Outcomes:**
- Real-time audio capture from Google Meet tabs with minimal latency and high fidelity
- Persistent WebSocket connection enabling bidirectional communication with the AI backend
- Intuitive overlay UI that surfaces AI suggestions without disrupting the meeting experience

---

## Product Manager Review

### Feature Overview

The Chrome Extension provides presales professionals with a seamless way to receive real-time AI assistance during Google Meet calls. By capturing the meeting audio directly from the browser tab and streaming it to our backend for transcription and analysis, the extension enables contextual suggestions to appear instantly without requiring any external hardware or complex setup.

### Features

#### 1. Chrome Extension Manifest & Structure

**What it is:** A Manifest V3 Chrome extension with properly configured permissions, service worker, content scripts, and file organization following Chrome's latest extension architecture requirements.

**Why it matters:** Manifest V3 is now required for Chrome Web Store submissions and provides improved security, privacy, and performance. A well-structured foundation ensures maintainability and simplifies future feature additions.

**User perspective:** Users install a single extension that "just works" - no complex configuration, automatic updates, and minimal permission prompts that clearly explain why each permission is needed.

#### 2. TabCapture Audio Capture

**What it is:** A robust implementation of Chrome's TabCapture API that captures high-quality audio from the active Google Meet tab, processes it into the optimal format for speech recognition, and manages the capture lifecycle.

**Why it matters:** Audio capture quality directly impacts transcription accuracy. The TabCapture API provides the cleanest audio source (capturing both sides of the conversation) without requiring screen sharing or microphone access.

**User perspective:** Users simply click "Start Session" and the extension captures all meeting audio automatically - no additional setup, no quality issues, and clear feedback when capture is active.

#### 3. WebSocket Client

**What it is:** A connection manager that establishes and maintains a WebSocket connection to the backend, streams audio chunks in real-time, receives AI suggestions, and gracefully handles network interruptions.

**Why it matters:** Real-time assistance requires low-latency bidirectional communication. WebSocket provides persistent connections that minimize overhead compared to repeated HTTP requests.

**User perspective:** Users see real-time suggestions appearing as the conversation progresses, with smooth reconnection if their network briefly drops - no manual intervention needed.

#### 4. Overlay UI Component

**What it is:** A floating panel injected into Google Meet pages that displays AI suggestions, objection handling tips, and contextual information in a draggable, resizable, and minimizable interface.

**Why it matters:** The overlay must be helpful without being intrusive. Shadow DOM isolation ensures it works reliably regardless of Google Meet's UI changes, while drag/resize capabilities let users position it optimally.

**User perspective:** Users see a sleek panel that they can move anywhere on screen, minimize when not needed, and expand when they want to see full suggestion details - all without affecting the Meet interface.

#### 5. Extension Popup Settings UI

**What it is:** The extension's popup interface providing connection status, session controls (start/stop), and configuration options for backend URL and authentication.

**Why it matters:** Users need a central place to understand extension status and control its behavior. Clear status indicators prevent confusion about whether the extension is working.

**User perspective:** Users click the extension icon to see at-a-glance status (connected/disconnected, session active/inactive) and can quickly start or stop assistance with a single click.

---

## Master Checklist

### Instructions for Claude Code

**Checkbox Management:**
- Mark a task complete by changing `[ ]` to `[x]` in the Done column
- Record actual start and end times in 24-hour format (e.g., 14:30)
- Calculate total time in minutes and update the Total column
- Calculate multiplier as: Human Est. / Total (actual time)
- A multiplier > 1 means faster than estimate; < 1 means slower

**Time Tracking Protocol:**
1. Before starting a task, record the current time in the Start column
2. Work on the task until completion
3. Record the end time in the End column
4. Calculate elapsed minutes: (End - Start) in minutes
5. Update the Multiplier: Human Est. / Total

**Task Completion Criteria:**
- All code compiles/runs without errors
- Key functionality works as described
- Basic error handling is in place
- Code follows project conventions

### Progress Dashboard

| Done | # | Task Name | Start | End | Total (min) | Human Est. (min) | Multiplier |
|:----:|:-:|-----------|:-----:|:---:|:-----------:|:----------------:|:----------:|
| [ ] | 1 | Chrome extension manifest & structure | - | - | - | 120 | - |
| [ ] | 2 | TabCapture audio capture implementation | - | - | - | 180 | - |
| [ ] | 3 | WebSocket client in extension | - | - | - | 90 | - |
| [ ] | 4 | Overlay UI component | - | - | - | 150 | - |
| [ ] | 5 | Extension popup settings UI | - | - | - | 90 | - |

**Summary:**
- Total tasks: 5
- Completed: 0
- Total time spent: 0 minutes
- Total human estimate: 630 minutes (10.5 hours)
- Overall multiplier: TBD

---

## Task Descriptions

### Task 1: Chrome Extension Manifest & Structure

**Intent:** Establish a solid foundation with Manifest V3 configuration and organized file structure that supports all required functionality.

**Context:** Manifest V3 introduced significant changes from V2, including the shift from background pages to service workers, new permission models, and changes to content security policies. This task sets up the core extension infrastructure that all other tasks depend on.

**Expected behavior:**
- Extension loads successfully in Chrome without errors
- Service worker initializes and stays active as needed
- Content script injection works on meet.google.com domains
- All required permissions are properly declared and functional

**Key components:**

1. **manifest.json** - Manifest V3 configuration file
   ```json
   {
     "manifest_version": 3,
     "name": "Presales AI Assistant",
     "version": "1.0.0",
     "description": "Real-time AI assistance for presales calls",
     "permissions": [
       "tabCapture",
       "activeTab",
       "storage",
       "offscreen"
     ],
     "host_permissions": [
       "https://meet.google.com/*",
       "https://*.backend-domain.com/*"
     ],
     "background": {
       "service_worker": "background/service-worker.js",
       "type": "module"
     },
     "content_scripts": [{
       "matches": ["https://meet.google.com/*"],
       "js": ["content/content-script.js"],
       "css": ["content/content-styles.css"]
     }],
     "action": {
       "default_popup": "popup/popup.html",
       "default_icon": {
         "16": "icons/icon16.png",
         "48": "icons/icon48.png",
         "128": "icons/icon128.png"
       }
     },
     "icons": {
       "16": "icons/icon16.png",
       "48": "icons/icon48.png",
       "128": "icons/icon128.png"
     }
   }
   ```

2. **Directory structure:**
   ```
   extension/
   ├── manifest.json
   ├── background/
   │   ├── service-worker.js      # Main service worker
   │   ├── audio-capture.js       # TabCapture logic
   │   └── websocket-client.js    # WebSocket manager
   ├── content/
   │   ├── content-script.js      # Overlay injection
   │   ├── content-styles.css     # Base styles
   │   └── overlay/
   │       ├── overlay.js         # Overlay component
   │       └── overlay.css        # Overlay styles
   ├── popup/
   │   ├── popup.html             # Popup markup
   │   ├── popup.js               # Popup logic
   │   └── popup.css              # Popup styles
   ├── offscreen/
   │   ├── offscreen.html         # Offscreen document
   │   └── offscreen.js           # Audio processing
   ├── shared/
   │   ├── constants.js           # Shared constants
   │   ├── messaging.js           # Message helpers
   │   └── storage.js             # Storage utilities
   └── icons/
       ├── icon16.png
       ├── icon48.png
       └── icon128.png
   ```

3. **Service worker skeleton** with module imports and lifecycle handling

4. **Shared utilities** for messaging between components

**Notes:**
- Use ES modules (`"type": "module"`) for cleaner code organization
- Consider using TypeScript with build step for larger projects
- Service workers can go inactive; design for stateless operation with storage persistence
- The `offscreen` permission is needed for TabCapture in MV3

---

### Task 2: TabCapture Audio Capture Implementation

**Intent:** Implement robust audio capture from Google Meet tabs using Chrome's TabCapture API with proper format conversion for speech recognition services.

**Context:** Manifest V3 moved TabCapture processing to offscreen documents since service workers lack access to Web Audio API. Audio must be captured, processed into appropriate chunks (typically 16kHz mono PCM or specific formats for Deepgram), and prepared for WebSocket streaming.

**Expected behavior:**
- Audio capture starts/stops cleanly via user action
- Captures both local and remote audio from Meet
- Processes audio into correct format (sample rate, channels, bit depth)
- Handles tab changes, tab closure, and permission denials gracefully
- Provides status updates to popup and content script

**Key components:**

1. **Offscreen document creation and management:**
   ```javascript
   // background/service-worker.js
   async function ensureOffscreenDocument() {
     const existingContexts = await chrome.runtime.getContexts({
       contextTypes: ['OFFSCREEN_DOCUMENT']
     });

     if (existingContexts.length > 0) return;

     await chrome.offscreen.createDocument({
       url: 'offscreen/offscreen.html',
       reasons: ['USER_MEDIA'],
       justification: 'Audio capture and processing for transcription'
     });
   }
   ```

2. **TabCapture stream acquisition:**
   ```javascript
   // background/audio-capture.js
   async function startCapture(tabId) {
     const streamId = await chrome.tabCapture.getMediaStreamId({
       targetTabId: tabId
     });

     // Send streamId to offscreen document for processing
     await chrome.runtime.sendMessage({
       type: 'START_AUDIO_CAPTURE',
       streamId: streamId,
       tabId: tabId
     });
   }
   ```

3. **Audio processing in offscreen document:**
   ```javascript
   // offscreen/offscreen.js
   async function processAudio(streamId) {
     const stream = await navigator.mediaDevices.getUserMedia({
       audio: {
         mandatory: {
           chromeMediaSource: 'tab',
           chromeMediaSourceId: streamId
         }
       }
     });

     const audioContext = new AudioContext({ sampleRate: 16000 });
     const source = audioContext.createMediaStreamSource(stream);

     // Create processor for chunking
     const processor = audioContext.createScriptProcessor(4096, 1, 1);
     processor.onaudioprocess = (e) => {
       const audioData = e.inputBuffer.getChannelData(0);
       // Convert to appropriate format and send to service worker
       sendAudioChunk(audioData);
     };

     source.connect(processor);
     processor.connect(audioContext.destination);
   }
   ```

4. **Audio format conversion:**
   - Convert Float32Array to Int16Array for PCM format
   - Target: 16kHz sample rate, mono channel, 16-bit PCM
   - Chunk size: typically 100-250ms worth of audio

5. **Start/stop controls with state management:**
   ```javascript
   // State tracking
   let captureState = {
     isCapturing: false,
     tabId: null,
     startTime: null
   };

   async function stopCapture() {
     await chrome.runtime.sendMessage({ type: 'STOP_AUDIO_CAPTURE' });
     captureState.isCapturing = false;
     await chrome.storage.local.set({ captureState });
   }
   ```

6. **Error handling scenarios:**
   - User denies permission
   - Tab is closed during capture
   - Tab navigates away from Meet
   - Audio device becomes unavailable
   - Offscreen document crashes

**Notes:**
- **IMPORTANT:** ScriptProcessorNode is officially deprecated. Use AudioWorklet for production:
  - AudioWorklet runs on a separate audio thread (not main thread)
  - Must return `true` from `process()` for Chrome compatibility
  - See [MDN AudioWorklet Guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet)
- Buffer size affects latency vs. CPU trade-off
- Chrome requires user gesture before starting capture
- Test with various Meet scenarios (screen sharing, multiple participants)
- Consider adding audio level visualization for debugging

---

### Task 3: WebSocket Client in Extension

**Intent:** Create a robust WebSocket connection manager that handles real-time bidirectional communication between the extension and backend.

**Context:** The WebSocket client runs in the service worker and must handle the stateless nature of MV3 service workers. It needs to stream audio chunks efficiently while receiving AI suggestions and managing connection lifecycle.

**Expected behavior:**
- Establishes connection to configured backend URL
- Streams audio chunks with minimal latency
- Receives and routes AI suggestions to content script
- Automatically reconnects on connection loss
- Provides connection status to UI components
- Handles authentication/session management

**Key components:**

1. **Connection manager class:**
   ```javascript
   // background/websocket-client.js
   class WebSocketClient {
     constructor() {
       this.socket = null;
       this.isConnected = false;
       this.reconnectAttempts = 0;
       this.maxReconnectAttempts = 5;
       this.baseReconnectDelay = 1000; // 1 second
       this.messageQueue = [];
     }

     async connect(url, authToken) {
       return new Promise((resolve, reject) => {
         this.socket = new WebSocket(url);

         this.socket.onopen = () => {
           this.isConnected = true;
           this.reconnectAttempts = 0;
           this.authenticate(authToken);
           this.flushMessageQueue();
           this.broadcastStatus('connected');
           resolve();
         };

         this.socket.onclose = (event) => {
           this.isConnected = false;
           this.broadcastStatus('disconnected');
           if (!event.wasClean) {
             this.scheduleReconnect();
           }
         };

         this.socket.onerror = (error) => {
           console.error('WebSocket error:', error);
           reject(error);
         };

         this.socket.onmessage = (event) => {
           this.handleMessage(JSON.parse(event.data));
         };
       });
     }
   }
   ```

2. **Audio chunk streaming:**
   ```javascript
   sendAudioChunk(audioBuffer) {
     if (!this.isConnected) {
       // Optionally queue or drop
       return;
     }

     // Send as binary for efficiency
     const message = {
       type: 'audio',
       timestamp: Date.now(),
       data: Array.from(audioBuffer) // or use ArrayBuffer
     };

     this.socket.send(JSON.stringify(message));
   }
   ```

3. **Response message handler:**
   ```javascript
   handleMessage(message) {
     switch (message.type) {
       case 'transcript':
         this.notifyContentScript('transcript', message.data);
         break;
       case 'suggestion':
         this.notifyContentScript('suggestion', message.data);
         break;
       case 'objection':
         this.notifyContentScript('objection', message.data);
         break;
       case 'error':
         console.error('Server error:', message.data);
         break;
       case 'ping':
         this.socket.send(JSON.stringify({ type: 'pong' }));
         break;
     }
   }

   async notifyContentScript(type, data) {
     const [tab] = await chrome.tabs.query({
       active: true,
       url: 'https://meet.google.com/*'
     });

     if (tab) {
       chrome.tabs.sendMessage(tab.id, { type, data });
     }
   }
   ```

4. **Exponential backoff reconnection:**
   ```javascript
   scheduleReconnect() {
     if (this.reconnectAttempts >= this.maxReconnectAttempts) {
       this.broadcastStatus('failed');
       return;
     }

     const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts);
     const jitter = Math.random() * 1000;

     setTimeout(() => {
       this.reconnectAttempts++;
       this.connect(this.currentUrl, this.currentToken);
     }, delay + jitter);
   }
   ```

5. **Message queuing for service worker wake-up:**
   ```javascript
   queueMessage(message) {
     this.messageQueue.push(message);
     // Persist queue to storage for service worker restart
     chrome.storage.local.set({ messageQueue: this.messageQueue });
   }

   flushMessageQueue() {
     while (this.messageQueue.length > 0) {
       const message = this.messageQueue.shift();
       this.socket.send(JSON.stringify(message));
     }
     chrome.storage.local.remove('messageQueue');
   }
   ```

6. **Status broadcasting:**
   ```javascript
   broadcastStatus(status) {
     chrome.runtime.sendMessage({ type: 'WS_STATUS', status });
     chrome.storage.local.set({ wsStatus: status });
   }
   ```

**Notes:**
- Service workers may be terminated; persist critical state to storage
- Consider using a keep-alive mechanism (periodic messages) to prevent termination
- Binary WebSocket messages are more efficient for audio but require careful handling
- Add request/response correlation IDs for complex interactions
- Implement heartbeat/ping-pong for connection health monitoring

---

### Task 4: Overlay UI Component

**Intent:** Create a polished, non-intrusive floating panel that displays AI suggestions within the Google Meet interface.

**Context:** The overlay must coexist with Google Meet's complex UI without interference. Shadow DOM provides style isolation, preventing Meet's styles from affecting the overlay and vice versa. The component needs to be highly usable during active meetings.

**Expected behavior:**
- Renders floating panel in corner of Meet page
- Displays real-time suggestions, objection handling tips
- Can be dragged to any position and resized
- Can be minimized to icon when not needed
- Persists position preference across sessions
- Updates smoothly without flickering
- Works regardless of Meet's UI state

**Key components:**

1. **Shadow DOM container:**
   ```javascript
   // content/overlay/overlay.js
   class AIOverlay {
     constructor() {
       this.container = document.createElement('div');
       this.container.id = 'presales-ai-overlay-container';
       this.shadow = this.container.attachShadow({ mode: 'closed' });
       this.loadStyles();
       this.createOverlayStructure();
       this.attachEventListeners();
       this.restorePosition();
     }

     loadStyles() {
       const styles = document.createElement('style');
       styles.textContent = `
         :host {
           all: initial;
           position: fixed;
           z-index: 999999;
           font-family: 'Google Sans', Roboto, sans-serif;
         }

         .overlay-panel {
           position: absolute;
           width: 320px;
           max-height: 400px;
           background: #ffffff;
           border-radius: 12px;
           box-shadow: 0 4px 20px rgba(0,0,0,0.15);
           display: flex;
           flex-direction: column;
           overflow: hidden;
         }

         .overlay-panel.minimized {
           width: 48px;
           height: 48px;
           border-radius: 50%;
         }

         /* ... additional styles ... */
       `;
       this.shadow.appendChild(styles);
     }
   }
   ```

2. **Overlay structure:**
   ```javascript
   createOverlayStructure() {
     this.panel = document.createElement('div');
     this.panel.className = 'overlay-panel';
     this.panel.innerHTML = `
       <div class="overlay-header">
         <div class="drag-handle">
           <span class="title">AI Assistant</span>
           <span class="status-indicator"></span>
         </div>
         <div class="controls">
           <button class="minimize-btn" title="Minimize">−</button>
           <button class="close-btn" title="Hide">×</button>
         </div>
       </div>
       <div class="overlay-content">
         <div class="suggestions-container">
           <div class="empty-state">
             Listening for conversation...
           </div>
         </div>
       </div>
       <div class="resize-handle"></div>
     `;
     this.shadow.appendChild(this.panel);
   }
   ```

3. **Drag functionality:**
   ```javascript
   initDrag() {
     const header = this.panel.querySelector('.drag-handle');
     let isDragging = false;
     let startX, startY, startLeft, startTop;

     header.addEventListener('mousedown', (e) => {
       isDragging = true;
       startX = e.clientX;
       startY = e.clientY;
       const rect = this.panel.getBoundingClientRect();
       startLeft = rect.left;
       startTop = rect.top;
       this.panel.style.cursor = 'grabbing';
     });

     document.addEventListener('mousemove', (e) => {
       if (!isDragging) return;

       const deltaX = e.clientX - startX;
       const deltaY = e.clientY - startY;

       const newLeft = Math.max(0, Math.min(
         window.innerWidth - this.panel.offsetWidth,
         startLeft + deltaX
       ));
       const newTop = Math.max(0, Math.min(
         window.innerHeight - this.panel.offsetHeight,
         startTop + deltaY
       ));

       this.panel.style.left = `${newLeft}px`;
       this.panel.style.top = `${newTop}px`;
     });

     document.addEventListener('mouseup', () => {
       if (isDragging) {
         isDragging = false;
         this.panel.style.cursor = '';
         this.savePosition();
       }
     });
   }
   ```

4. **Resize functionality:**
   ```javascript
   initResize() {
     const resizeHandle = this.panel.querySelector('.resize-handle');
     let isResizing = false;
     let startWidth, startHeight, startX, startY;

     resizeHandle.addEventListener('mousedown', (e) => {
       isResizing = true;
       startX = e.clientX;
       startY = e.clientY;
       startWidth = this.panel.offsetWidth;
       startHeight = this.panel.offsetHeight;
       e.stopPropagation();
     });

     document.addEventListener('mousemove', (e) => {
       if (!isResizing) return;

       const newWidth = Math.max(280, startWidth + (e.clientX - startX));
       const newHeight = Math.max(200, startHeight + (e.clientY - startY));

       this.panel.style.width = `${newWidth}px`;
       this.panel.style.maxHeight = `${newHeight}px`;
     });

     document.addEventListener('mouseup', () => {
       if (isResizing) {
         isResizing = false;
         this.savePosition();
       }
     });
   }
   ```

5. **Minimize/expand toggle:**
   ```javascript
   toggleMinimize() {
     this.isMinimized = !this.isMinimized;
     this.panel.classList.toggle('minimized', this.isMinimized);
     chrome.storage.local.set({ overlayMinimized: this.isMinimized });
   }
   ```

6. **Suggestion rendering:**
   ```javascript
   addSuggestion(suggestion) {
     const container = this.panel.querySelector('.suggestions-container');
     const emptyState = container.querySelector('.empty-state');
     if (emptyState) emptyState.remove();

     const suggestionEl = document.createElement('div');
     suggestionEl.className = `suggestion-card ${suggestion.type}`;
     suggestionEl.innerHTML = `
       <div class="suggestion-header">
         <span class="suggestion-type">${suggestion.type}</span>
         <span class="suggestion-time">${this.formatTime(suggestion.timestamp)}</span>
       </div>
       <div class="suggestion-content">${suggestion.text}</div>
       ${suggestion.actions ? this.renderActions(suggestion.actions) : ''}
     `;

     container.insertBefore(suggestionEl, container.firstChild);

     // Limit visible suggestions
     while (container.children.length > 10) {
       container.removeChild(container.lastChild);
     }
   }
   ```

7. **Content script injection:**
   ```javascript
   // content/content-script.js
   let overlay = null;

   function initOverlay() {
     if (overlay) return;

     overlay = new AIOverlay();
     document.body.appendChild(overlay.container);
   }

   // Listen for messages from background
   chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
     if (message.type === 'INIT_OVERLAY') {
       initOverlay();
     } else if (message.type === 'suggestion') {
       overlay?.addSuggestion(message.data);
     } else if (message.type === 'transcript') {
       overlay?.updateTranscript(message.data);
     }
   });

   // Auto-init on Meet pages
   if (window.location.hostname === 'meet.google.com') {
     initOverlay();
   }
   ```

**Notes:**
- Use `position: fixed` for viewport-relative positioning
- Test with Meet in different states (grid view, presentation, sidebar open)
- Consider keyboard shortcuts for power users
- Add subtle animations for suggestion appearance
- Implement auto-hide when user is screen sharing
- Consider dark mode support matching Meet's theme

---

### Task 5: Extension Popup Settings UI

**Intent:** Create an intuitive popup interface for extension status monitoring and configuration.

**Context:** The popup serves as the primary control interface when users aren't in a Meet tab. It needs to clearly communicate connection status, allow quick session control, and provide access to settings.

**Expected behavior:**
- Shows connection status (connected/disconnected/connecting)
- Shows session status (active/inactive)
- Start/stop session buttons work correctly
- Settings persist across browser sessions
- Settings validation provides helpful feedback
- Works in both light and dark mode

**Key components:**

1. **Popup HTML structure:**
   ```html
   <!-- popup/popup.html -->
   <!DOCTYPE html>
   <html>
   <head>
     <meta charset="UTF-8">
     <link rel="stylesheet" href="popup.css">
   </head>
   <body>
     <div class="popup-container">
       <header class="popup-header">
         <img src="../icons/icon48.png" alt="Logo" class="logo">
         <h1>Presales AI</h1>
       </header>

       <section class="status-section">
         <div class="status-row">
           <span class="status-label">Backend</span>
           <span class="status-indicator" id="backend-status">
             <span class="status-dot"></span>
             <span class="status-text">Disconnected</span>
           </span>
         </div>
         <div class="status-row">
           <span class="status-label">Session</span>
           <span class="status-indicator" id="session-status">
             <span class="status-dot"></span>
             <span class="status-text">Inactive</span>
           </span>
         </div>
       </section>

       <section class="controls-section">
         <button id="session-btn" class="primary-btn" disabled>
           Start Session
         </button>
       </section>

       <section class="settings-section">
         <h2>Settings</h2>
         <div class="form-group">
           <label for="backend-url">Backend URL</label>
           <input type="url" id="backend-url"
                  placeholder="wss://api.example.com/ws">
         </div>
         <div class="form-group">
           <label for="api-key">API Key</label>
           <input type="password" id="api-key"
                  placeholder="Enter your API key">
         </div>
         <button id="save-settings" class="secondary-btn">
           Save Settings
         </button>
       </section>

       <footer class="popup-footer">
         <span class="version">v1.0.0</span>
       </footer>
     </div>
     <script src="popup.js" type="module"></script>
   </body>
   </html>
   ```

2. **Popup styles:**
   ```css
   /* popup/popup.css */
   * {
     box-sizing: border-box;
     margin: 0;
     padding: 0;
   }

   body {
     width: 320px;
     font-family: 'Google Sans', Roboto, sans-serif;
     font-size: 14px;
     color: #202124;
   }

   .popup-container {
     padding: 16px;
   }

   .popup-header {
     display: flex;
     align-items: center;
     gap: 12px;
     margin-bottom: 16px;
   }

   .logo {
     width: 32px;
     height: 32px;
   }

   .status-section {
     background: #f8f9fa;
     border-radius: 8px;
     padding: 12px;
     margin-bottom: 16px;
   }

   .status-row {
     display: flex;
     justify-content: space-between;
     align-items: center;
     padding: 8px 0;
   }

   .status-indicator {
     display: flex;
     align-items: center;
     gap: 8px;
   }

   .status-dot {
     width: 8px;
     height: 8px;
     border-radius: 50%;
     background: #ea4335; /* red - disconnected */
   }

   .status-dot.connected {
     background: #34a853; /* green */
   }

   .status-dot.connecting {
     background: #fbbc05; /* yellow */
     animation: pulse 1s infinite;
   }

   @keyframes pulse {
     0%, 100% { opacity: 1; }
     50% { opacity: 0.5; }
   }

   .primary-btn {
     width: 100%;
     padding: 12px;
     background: #1a73e8;
     color: white;
     border: none;
     border-radius: 8px;
     font-size: 14px;
     font-weight: 500;
     cursor: pointer;
     transition: background 0.2s;
   }

   .primary-btn:hover:not(:disabled) {
     background: #1557b0;
   }

   .primary-btn:disabled {
     background: #dadce0;
     cursor: not-allowed;
   }

   .primary-btn.active {
     background: #ea4335;
   }

   .settings-section {
     margin-top: 16px;
     padding-top: 16px;
     border-top: 1px solid #e8eaed;
   }

   .form-group {
     margin-bottom: 12px;
   }

   .form-group label {
     display: block;
     margin-bottom: 4px;
     color: #5f6368;
     font-size: 12px;
   }

   .form-group input {
     width: 100%;
     padding: 10px;
     border: 1px solid #dadce0;
     border-radius: 4px;
     font-size: 14px;
   }

   .form-group input:focus {
     outline: none;
     border-color: #1a73e8;
   }

   .secondary-btn {
     width: 100%;
     padding: 10px;
     background: transparent;
     color: #1a73e8;
     border: 1px solid #dadce0;
     border-radius: 8px;
     cursor: pointer;
   }

   .popup-footer {
     margin-top: 16px;
     text-align: center;
     color: #9aa0a6;
     font-size: 12px;
   }
   ```

3. **Popup JavaScript logic:**
   ```javascript
   // popup/popup.js
   class PopupController {
     constructor() {
       this.elements = {
         backendStatus: document.getElementById('backend-status'),
         sessionStatus: document.getElementById('session-status'),
         sessionBtn: document.getElementById('session-btn'),
         backendUrl: document.getElementById('backend-url'),
         apiKey: document.getElementById('api-key'),
         saveSettings: document.getElementById('save-settings')
       };

       this.init();
     }

     async init() {
       await this.loadSettings();
       await this.updateStatus();
       this.attachEventListeners();
       this.startStatusPolling();
     }

     async loadSettings() {
       const settings = await chrome.storage.local.get([
         'backendUrl',
         'apiKey'
       ]);

       if (settings.backendUrl) {
         this.elements.backendUrl.value = settings.backendUrl;
       }
       if (settings.apiKey) {
         this.elements.apiKey.value = settings.apiKey;
       }
     }

     async updateStatus() {
       const state = await chrome.storage.local.get([
         'wsStatus',
         'captureState'
       ]);

       // Update backend status
       const backendDot = this.elements.backendStatus.querySelector('.status-dot');
       const backendText = this.elements.backendStatus.querySelector('.status-text');

       backendDot.className = 'status-dot ' + (state.wsStatus || 'disconnected');
       backendText.textContent = this.formatStatus(state.wsStatus || 'disconnected');

       // Update session status
       const isCapturing = state.captureState?.isCapturing || false;
       const sessionDot = this.elements.sessionStatus.querySelector('.status-dot');
       const sessionText = this.elements.sessionStatus.querySelector('.status-text');

       sessionDot.className = 'status-dot ' + (isCapturing ? 'connected' : '');
       sessionText.textContent = isCapturing ? 'Active' : 'Inactive';

       // Update button state
       this.elements.sessionBtn.textContent = isCapturing ? 'Stop Session' : 'Start Session';
       this.elements.sessionBtn.classList.toggle('active', isCapturing);

       // Enable button only if connected
       const hasSettings = await this.hasValidSettings();
       this.elements.sessionBtn.disabled = !hasSettings;
     }

     formatStatus(status) {
       const labels = {
         'connected': 'Connected',
         'connecting': 'Connecting...',
         'disconnected': 'Disconnected',
         'failed': 'Connection Failed'
       };
       return labels[status] || status;
     }

     async hasValidSettings() {
       const settings = await chrome.storage.local.get(['backendUrl', 'apiKey']);
       return !!(settings.backendUrl && settings.apiKey);
     }

     attachEventListeners() {
       this.elements.sessionBtn.addEventListener('click', () => this.toggleSession());
       this.elements.saveSettings.addEventListener('click', () => this.saveSettings());
     }

     async toggleSession() {
       const state = await chrome.storage.local.get(['captureState']);
       const isCapturing = state.captureState?.isCapturing || false;

       await chrome.runtime.sendMessage({
         type: isCapturing ? 'STOP_SESSION' : 'START_SESSION'
       });

       // Update UI after short delay
       setTimeout(() => this.updateStatus(), 500);
     }

     async saveSettings() {
       const backendUrl = this.elements.backendUrl.value.trim();
       const apiKey = this.elements.apiKey.value.trim();

       // Validate URL
       try {
         new URL(backendUrl);
       } catch {
         this.showError('Please enter a valid URL');
         return;
       }

       if (!apiKey) {
         this.showError('Please enter an API key');
         return;
       }

       await chrome.storage.local.set({ backendUrl, apiKey });

       // Trigger reconnection with new settings
       await chrome.runtime.sendMessage({ type: 'RECONNECT' });

       this.showSuccess('Settings saved!');
     }

     showError(message) {
       // Simple alert for now; could be improved with toast
       alert(message);
     }

     showSuccess(message) {
       // Visual feedback
       this.elements.saveSettings.textContent = message;
       setTimeout(() => {
         this.elements.saveSettings.textContent = 'Save Settings';
       }, 2000);
     }

     startStatusPolling() {
       // Update status every 2 seconds while popup is open
       setInterval(() => this.updateStatus(), 2000);
     }
   }

   // Initialize
   document.addEventListener('DOMContentLoaded', () => {
     new PopupController();
   });
   ```

4. **Storage utilities:**
   ```javascript
   // shared/storage.js
   export const Storage = {
     async get(keys) {
       return chrome.storage.local.get(keys);
     },

     async set(data) {
       return chrome.storage.local.set(data);
     },

     async remove(keys) {
       return chrome.storage.local.remove(keys);
     },

     onChange(callback) {
       chrome.storage.onChanged.addListener((changes, area) => {
         if (area === 'local') {
           callback(changes);
         }
       });
     }
   };
   ```

**Notes:**
- Popup closes when user clicks away; don't rely on it staying open
- Use storage change listeners for real-time status updates
- Consider adding "Test Connection" button for settings validation
- Add input validation feedback inline rather than alerts
- Support browser dark mode with `prefers-color-scheme` media query
- Add visual indication when settings have unsaved changes

---

## Appendix

### Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Manifest Version | V3 | Required for Chrome Web Store; improved security model |
| Audio Processing Location | Offscreen Document | MV3 service workers lack Web Audio API access |
| Audio Format | 16kHz mono PCM | Optimal for speech recognition; balances quality and bandwidth |
| UI Isolation | Shadow DOM | Prevents style conflicts with Google Meet |
| State Persistence | chrome.storage.local | Survives service worker restarts |
| Reconnection Strategy | Exponential backoff with jitter | Prevents thundering herd; handles transient failures |

### Dependencies

**External Dependencies:**
- Chrome Extension APIs (tabCapture, offscreen, storage)
- Google Meet (host page for content script)
- Backend WebSocket server (not part of this track)

**Internal Dependencies:**
```
Task 1 (Manifest) ──┬──> Task 2 (Audio Capture)
                    ├──> Task 3 (WebSocket)
                    ├──> Task 4 (Overlay)
                    └──> Task 5 (Popup)

Task 2 (Audio) ────────> Task 3 (WebSocket) [audio streaming]
Task 3 (WebSocket) ────> Task 4 (Overlay) [suggestions display]
```

### Out of Scope

The following items are explicitly not part of this track:

1. **Backend Implementation** - Covered in separate backend track
2. **Speech-to-Text Processing** - Handled by Deepgram integration in backend
3. **AI/LLM Processing** - Backend responsibility
4. **User Authentication System** - Simple API key for now; full auth in future
5. **Chrome Web Store Publishing** - Separate deployment track
6. **Analytics/Telemetry** - Future enhancement
7. **Multi-browser Support** - Chrome-only initially
8. **Offline Functionality** - Requires real-time backend connection
9. **Recording/Playback** - Not in initial scope
10. **Multi-language Support** - English only for v1

### Risk Considerations

| Risk | Mitigation |
|------|------------|
| Google Meet UI changes | Shadow DOM isolation; minimal DOM dependencies |
| TabCapture API changes | Abstract capture logic; monitor Chrome release notes |
| Service worker termination | Persist critical state; design for stateless operation |
| WebSocket connection drops | Exponential backoff reconnection; message queuing |
| Audio quality issues | Configurable sample rate; audio level monitoring |

### Testing Recommendations

1. **Unit Testing:** Jest for utility functions
2. **Integration Testing:** Puppeteer for extension loading and basic flows
3. **Manual Testing Checklist:**
   - Extension loads without errors
   - Popup displays correct status
   - Audio capture starts/stops cleanly
   - WebSocket connects and reconnects
   - Overlay renders and is draggable
   - Settings persist across sessions
   - Works with various Meet configurations

---

*Implementation Plan Version: 1.0*
*Created: January 2025*
*Track: A - Chrome Extension*
