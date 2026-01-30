# Wingman - AI Sales Assistant for Google Meet

Real-time AI assistant for sales professionals during Google Meet calls. Wingman captures meeting audio, transcribes it using Deepgram, and provides contextually-aware response suggestions using Google Gemini.

**BYOK (Bring Your Own Keys)**: No backend server required! Users provide their own Deepgram and Gemini API keys directly in the extension settings.

## Features

- **Real-time Audio Capture**: Chrome extension captures Google Meet audio via TabCapture API
- **Live Transcription**: Deepgram Nova-3 provides accurate speech-to-text with speaker diarization
- **AI-Powered Suggestions**: Gemini generates contextual response suggestions based on customer questions
- **Speaker Identification**: Automatically identifies customer vs. consultant roles
- **Auto-save Transcripts**: Optionally save meeting transcripts to Google Drive
- **Unobtrusive UI**: Floating overlay displays suggestions without disrupting the meeting
- **Zero Infrastructure**: No server to run - everything happens in your browser

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           YOUR BROWSER                                       │
│                                                                              │
│   ┌──────────────┐         ┌──────────────────────────────────────────────┐ │
│   │ Google Meet  │         │         Chrome Extension                     │ │
│   │              │◄────────┤  Audio Capture → Overlay UI                  │ │
│   └──────────────┘         └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │ WebSocket              │ REST API               │
              ▼                        ▼                        ▼
      ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
      │   Deepgram   │        │   Gemini     │        │ Google Drive │
      │   Nova-3     │        │   2.5 Flash  │        │  (optional)  │
      │  (Your Key)  │        │  (Your Key)  │        │              │
      └──────────────┘        └──────────────┘        └──────────────┘
```

## Getting Started

### 1. Get Your API Keys (Free Tiers Available)

**Deepgram** (Speech-to-Text):
1. Go to [console.deepgram.com](https://console.deepgram.com/)
2. Create a free account ($200 free credit)
3. Create an API key with "Member" or higher permissions
4. Copy the API key

**Google Gemini** (AI Responses):
1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the API key

### 2. Install the Extension

**From Source:**
```bash
cd extension

# Install dependencies
npm install

# Build for production
npm run build
```

**Load in Chrome:**
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `extension/dist` folder
5. Pin the extension to your toolbar

### 3. Configure Your API Keys

1. Click the Wingman extension icon
2. Click "Options" link in the popup
3. Enter your Deepgram API key
4. Enter your Gemini API key
5. Click "Save Keys"
6. (Optional) Click "Test Keys" to verify they work

### 4. Start Using Wingman

1. Join a Google Meet call
2. Click the Wingman extension icon
3. Click "Start Session"
4. The floating overlay will appear showing transcripts and AI suggestions
5. Speak or let customers speak - Wingman will provide relevant suggestions

## Estimated Costs

Both APIs offer generous free tiers:

| Service | Free Tier | Paid Rate |
|---------|-----------|-----------|
| Deepgram | $200 credit (~100 hours) | ~$0.01/minute |
| Gemini | 1500 requests/day | Pay-as-you-go |

**Typical 1-hour call:**
- Deepgram: ~$0.60 (60 minutes of transcription)
- Gemini: ~$0.05 (30-50 API calls)
- **Total: ~$0.65/hour**

## Configuration Options

Access settings by clicking the extension icon and selecting "Options":

### API Keys
- **Deepgram API Key**: Required for speech-to-text
- **Gemini API Key**: Required for AI suggestions

### Speaker Filter
- **Only respond to other speakers**: When enabled, Wingman only suggests responses when customers speak, not when you're talking

### Google Drive Integration
- **Auto-save transcripts**: Automatically save meeting transcripts to Drive
- **Folder name**: Where transcripts are saved
- **Format**: Markdown, Plain Text, or JSON

### System Prompt
- Customize how Wingman behaves and responds
- Adjust personality, tone, and knowledge focus

## Project Structure

```
wingman-ai/
├── extension/                 # Chrome Extension
│   ├── src/
│   │   ├── background/       # Service worker
│   │   ├── content/          # Content script & overlay
│   │   ├── popup/            # Extension popup UI
│   │   ├── options/          # Settings page
│   │   ├── services/         # API clients (Deepgram, Gemini, Drive)
│   │   └── shared/           # Shared utilities
│   ├── manifest.json
│   ├── package.json
│   └── tsconfig.json
│
└── README.md
```

## Troubleshooting

### "API keys not configured"
- Go to Options and enter both Deepgram and Gemini API keys
- Click "Save Keys" and then "Test Keys" to verify

### "Failed to connect to Deepgram"
- Verify your Deepgram API key is valid
- Check your Deepgram account has available credits
- Ensure you have network connectivity

### "No transcripts appearing"
- Make sure the microphone is working in Google Meet
- Check that someone is speaking (Wingman needs audio input)
- Look at the browser console for error messages

### "No AI suggestions appearing"
- Suggestions only appear for substantial utterances
- There's a 5-second cooldown between suggestions
- The AI may choose to stay silent if no suggestion is needed

### Extension Issues

**"TabCapture permission denied"**
- Ensure you're on a Google Meet page
- The extension requires a user gesture (click) to start capture

## Development

```bash
cd extension

# Development build with watch
npm run dev

# Type checking
npm run typecheck

# Lint
npm run lint

# Format
npm run format
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Extension | TypeScript, Chrome Extension Manifest V3, Vite |
| Speech-to-Text | Deepgram Nova-3 (WebSocket) |
| AI | Google Gemini 2.5 Flash (REST API) |
| Storage | Chrome Storage API |
| Cloud Storage | Google Drive API (optional) |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [Deepgram](https://deepgram.com/) for real-time speech-to-text
- [Google AI](https://ai.google.dev/) for Gemini LLM
