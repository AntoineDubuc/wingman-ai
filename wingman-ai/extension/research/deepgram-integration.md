# Deepgram Real-Time Streaming Integration

## Audio Format Requirements

### Recommended Settings for Voice
- **Sample Rate:** 16000 Hz
- **Encoding:** `linear16` (16-bit PCM, little endian)
- **Channels:** 1 (mono)

### Audio Chunking
- Chunk audio into 100-200ms frames
- 100ms chunks = low latency
- Don't send empty bytes (causes disconnection)

## Python SDK v5.x Usage

```python
from deepgram import AsyncDeepgramClient
from deepgram.core.events import EventType

client = AsyncDeepgramClient(api_key="YOUR_KEY")

async with client.listen.v1.connect(
    model="nova-3",
    encoding="linear16",
    sample_rate="16000"
) as connection:
    connection.on(EventType.MESSAGE, on_message)
    await connection.start_listening()
```

## Common Errors

| Code | Error | Solution |
|------|-------|----------|
| 1008 | DATA-0000 | Invalid audio format - check encoding/sample_rate |
| 1011 | NET-0001 | No audio within 10 seconds - send audio immediately |
| 401 | Unauthorized | Check API key format |

## Key Parameters

```python
options = {
    "model": "nova-3",
    "encoding": "linear16",
    "sample_rate": 16000,
    "channels": 1,
    "interim_results": True,
    "punctuate": True,
    "endpointing": 300,  # ms to wait for speech end
}
```

## Critical: Must send audio within 10 seconds of connection or Deepgram times out!
