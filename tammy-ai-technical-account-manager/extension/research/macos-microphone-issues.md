# macOS Microphone Capture Issues

## 1. Permissions
- Chrome must be enabled in **System Settings > Privacy & Security > Microphone**
- If Chrome missing from list, visit a mic-requesting site to trigger prompt
- **Must restart Chrome** after permission changes

## 2. Sample Rate
- Mac mics typically use 44100Hz or 48000Hz
- Firefox does NOT support resampling MediaStream to different AudioContext rate
- Chrome/Safari handle conversion better

## 3. AudioContext Suspension (MOST COMMON ISSUE)

AudioContext must be created/resumed from user gesture:

```javascript
button.addEventListener('click', async () => {
    const audioContext = new AudioContext();
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }
    // Now get media stream
});
```

## 4. Multiple Apps Conflict
- Close other apps using mic (Zoom, Skype, Discord)
- Check System Preferences > Sound > Input shows correct device
- Chrome can auto-adjust input levels to zero

## 5. Debugging Silent Audio

```javascript
// Check AudioContext state
console.log('State:', audioContext.state);  // Should be "running"

// Check track status
const track = stream.getAudioTracks()[0];
console.log('Enabled:', track.enabled);     // Should be true
console.log('Muted:', track.muted);         // Should be false
console.log('ReadyState:', track.readyState); // Should be "live"

// Monitor amplitude
const analyser = audioContext.createAnalyser();
source.connect(analyser);
const data = new Float32Array(analyser.fftSize);
analyser.getFloatTimeDomainData(data);
console.log('Max amplitude:', Math.max(...data.map(Math.abs)));
```

## Common Silent Audio Causes
1. AudioContext suspended (need user gesture)
2. Track.enabled is false
3. Track.muted is true
4. Sample rate mismatch (Firefox)
5. System input level at zero
6. Another app has exclusive access
