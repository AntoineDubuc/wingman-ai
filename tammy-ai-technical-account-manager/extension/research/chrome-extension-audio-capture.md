# Chrome Extension Audio Capture Best Practices

## Key Findings

### 1. getUserMedia vs tabCapture vs desktopCapture

| API | Use Case | Pros | Cons |
|-----|----------|------|------|
| **getUserMedia** | Microphone/camera capture | Direct access to user's mic | Cannot capture tab/system audio |
| **tabCapture** | Tab audio/video capture | No picker dialog; can capture remote audio | Requires user gesture; needs offscreen document in MV3 |
| **desktopCapture** | Screen/window/system audio | Can capture any screen source | Shows picker dialog |

### 2. ScriptProcessorNode vs AudioWorklet

**ScriptProcessorNode (DEPRECATED):**
- Runs on main thread, causing UI jank
- Still works but should not be used

**AudioWorklet (RECOMMENDED):**
- Runs on dedicated audio rendering thread
- Zero additional latency
- Required for real-time audio processing

### 3. Sample Rate Handling

**Problem:** Browser captures at system rate (44.1kHz or 48kHz), but transcription services need 16kHz.

**Solutions:**
1. Let browser use device's native rate, resample later
2. Use `libsamplerate-js` in AudioWorklet for real-time resampling
3. Use OfflineAudioContext for batch resampling

### 4. Common Causes of Silent Audio

| Issue | Cause | Solution |
|-------|-------|----------|
| AudioContext suspended | Created before user gesture | Call `audioContext.resume()` after click |
| Track disabled | Chrome interprets as silence | Don't mute/stop MediaStream tracks |
| Echo cancellation + stereo | Conflict | Set `echoCancellation: false` |
| Tab switching | Chrome throttles background | Use offscreen document |

### 5. MV3 Architecture for Audio Capture

**Content Scripts:** CAN call getUserMedia (inherits page permission)
**Background Service Workers:** CANNOT hold MediaStreams (no DOM)
**Offscreen Documents:** CAN hold MediaStreams persistently (RECOMMENDED)

## Recommended getUserMedia Constraints

```javascript
const constraints = {
  audio: {
    channelCount: 1,
    echoCancellation: false,  // Disable for transcription
    noiseSuppression: true,
    autoGainControl: true
  }
};
```

## Key Recommendation

For capturing meeting audio: Use **tabCapture** for remote participants + **getUserMedia** for local mic, then mix with AudioContext.
