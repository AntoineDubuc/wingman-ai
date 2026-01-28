# Google Meet Audio Capture

## Key Finding: Meet Suggests Using Add-ons

Google Meet console shows:
> "Developing an extension for Meet? An add-on would work better."
> "Extensions frequently cause user issues by altering the page."
> https://developers.google.com/meet/add-ons

## How Extensions Capture Meet Audio

### Architecture (MV3)
1. **Popup** - User gesture to start
2. **Background Service Worker** - Coordinates state
3. **Offscreen Document** - Actual audio capture

### Two Approaches

**A. Tab Capture (for remote participants):**
- Use `chrome.tabCapture.getMediaStreamId()`
- Captures all audio playing in the Meet tab
- Chrome auto-mutes audio - must route back to user

**B. Microphone Capture (for local user):**
- Use `getUserMedia()` in content script
- Captures only local user's voice
- Can run simultaneously with Meet's mic access

### Combining Both
```javascript
const audioContext = new AudioContext();
const destination = audioContext.createMediaStreamDestination();

// Mix tab + mic
audioContext.createMediaStreamSource(tabStream).connect(destination);
audioContext.createMediaStreamSource(micStream).connect(destination);

// Use destination.stream for recording/transcription
```

## Does Meet Use Exclusive Mic Access?

**NO** - Extensions can access mic simultaneously with Meet.

## Known Issues

| Issue | Description |
|-------|-------------|
| User gesture required | Can't auto-start capture |
| Tab closure ends capture | No recovery possible |
| Tab switching gaps | Audio may freeze when tab not focused |
| Service worker suspension | Use offscreen documents |

## Alternative: Google Meet Add-ons SDK

For official integration: https://developers.google.com/meet/add-ons

Benefits:
- Official Google support
- Better user experience
- No page alteration issues

Limitations:
- More complex setup
- Requires Google Workspace
